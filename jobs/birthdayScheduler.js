const Event = require("../model/eventSchema");
const Employee = require("../model/employeeSchema");
const Department = require("../model/departmentSchema");
const Time = require("../utils/time");
const sendEmailUtil = require("../utils/emailService");
const {
  birthdayEmailTemplate,
  birthdayAlertTemplate,
} = require("../utils/emailTemplates");

const runBirthdayScheduler = async () => {
  const today = Time.today(); // PST start of today
  const endDate = Time.add(today, { days: 365 }).endOf('day'); // PST 365 days later

  try {
    const employees = await Employee.find({ dateOfBirth: { $ne: null } })
      .select("_id firstName lastName dateOfBirth email role department")
      .populate("department")
      .lean();

    const birthdayMap = [];

    for (const emp of employees) {
      const dob = Time.fromJSDate(emp.dateOfBirth); // Luxon DateTime from DOB
      let birthday = dob.set({ year: today.year });

      // If birthday already passed this year, shift to next year
      if (!birthday.isValid || birthday < today) {
        birthday = dob.set({ year: today.year + 1 });
      }

      // Skip birthdays outside the 365-day window
      if (birthday < today || birthday > endDate) continue;

      birthdayMap.push({
        employee: emp,
        birthdayDate: birthday.toFormat("yyyy-MM-dd"),
        startDate: birthday.startOf("day").toUTC().toISO(), // ISO UTC format
        endDate: birthday
          .set({ hour: 23, minute: 59, second: 59, millisecond: 999 })
          .toUTC()
          .toISO(),
      });
    }

    // Get existing events within the same date range
    const existingEvents = await Event.find({
      type: "birthday",
      startDate: {
        $gte: today.startOf("day").toUTC().toISO(),
        $lte: endDate.toUTC().toISO(),
      },
    }).lean();

    const existingKeys = new Set(
      existingEvents.map((ev) => {
        const localDate = Time.fromISO(ev.startDate).toFormat("yyyy-MM-dd");
        return `${ev.createdBy?.toString()}|${localDate}`;
      })
    );

    for (const { employee, birthdayDate, startDate, endDate } of birthdayMap) {
      const key = `${employee._id.toString()}|${birthdayDate}`;
      if (!existingKeys.has(key)) {
        // 1. Create Event
        await Event.create({
          title: `🎂 Birthday: ${employee.firstName} ${employee.lastName}`,
          description: `${employee.firstName} ${employee.lastName}'s birthday! 🎉`,
          type: "birthday",
          startDate,
          endDate,
          allDay: true,
          location: "Office",
          attendees: [],
          priority: 'medium',
          status: 'confirmed',
          isPrivate: false,
          targetType: "all",
          targetValues: [],
          createdBy: employee._id,
          createdByRole: "Employee",
          metadata: {
            attachments: [],
            notifications: [],
          },
        });

        // // 2. Send Birthday Email to Employee
        // await sendEmailUtil(
        //   employee.email,
        //   `🎉 Happy Birthday, ${employee.firstName}!`,
        //   birthdayEmailTemplate.replaceAll("$firstName", employee.firstName)
        // );

        // // 3. Notify Admins + Dept Head + Manager
        // const notifyEmails = new Set();

        // // Admins
        // const admins = await Employee.find({ role: "Admin" })
        //   .select("email")
        //   .lean();
        // admins.forEach((admin) => notifyEmails.add(admin.email));

        // // Department Heads and Managers
        // if (employee.department?._id) {
        //   const dept = await Department.findById(
        //     employee.department._id
        //   ).lean();
        //   if (dept) {
        //     const employeeIdStr = employee._id.toString();

        //     dept.departmentHeads?.forEach((headId) => {
        //       if (headId.toString() !== employeeIdStr)
        //         notifyEmails.add(headId.toString());
        //     });
        //     dept.projectManagers?.forEach((mgrId) => {
        //       if (mgrId.toString() !== employeeIdStr)
        //         notifyEmails.add(mgrId.toString());
        //     });

        //     const additionalUsers = await Employee.find({
        //       _id: { $in: Array.from(notifyEmails) },
        //     })
        //       .select("email")
        //       .lean();

        //     additionalUsers.forEach((u) => notifyEmails.add(u.email));
        //   }
        // }

        // // Send Emails
        // for (const email of notifyEmails) {
        //   await sendEmailUtil(
        //     email,
        //     `🎂 Birthday Alert: ${employee.firstName} ${employee.lastName}`,
        //     birthdayAlertTemplate
        //       .replaceAll("$firstName", employee.firstName)
        //       .replaceAll("$lastName", employee.lastName)
        //   );
        // }
      }
    }

    // Cleanup orphaned events (employee removed)
    const validIds = new Set(employees.map((e) => e._id.toString()));
    for (const ev of existingEvents) {
      if (!ev.createdBy || !validIds.has(ev.createdBy.toString())) {
        await Event.deleteOne({ _id: ev._id });
      }
    }
  } catch (err) {
    console.error("❌ Birthday Scheduler Error:", err);
  }
};

module.exports = runBirthdayScheduler;
