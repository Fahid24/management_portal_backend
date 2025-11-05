const Employee = require("../model/employeeSchema");
const Department = require("../model/departmentSchema");
const Event = require("../model/eventSchema");
const Time = require("../utils/time");
const sendEmailUtil = require("../utils/emailService");
const { workAnniversaryEmailTemplate, workAnniversaryAlertTemplate } = require("../utils/emailTemplates");
const { companyName } = require("../constant/companyInfo");

const runWorkAnniversaryScheduler = async () => {
  const today = Time.today();

  try {
    // Get all employees with start dates
    const employees = await Employee.find({ startDate: { $ne: null } })
      .select("_id firstName lastName email role department startDate workAnniversaryEventId")
      .populate("department")
      .lean();

    // ==========================================
    // PART 1: SEND ANNIVERSARY EMAILS (TODAY'S ANNIVERSARIES ONLY)
    // ==========================================
    for (const emp of employees) {
      const start = Time.fromJSDate(emp.startDate);
      if (!start.isValid) continue;

      const isTodayAnniversary =
        start.month === today.month && start.day === today.day;

      // Only send emails for today's anniversaries
      if (isTodayAnniversary) {
        const years = today.year - start.year;

        // Send anniversary emails for current year (only if 1+ years)
        if (years > 0) {
          // 1. Send Email to Employee
          await sendEmailUtil(
            emp.email,
            `🎊 Happy Work Anniversary, ${emp.firstName}!`,
            workAnniversaryEmailTemplate
              .replaceAll("$firstName", emp.firstName)
              .replaceAll("$years", years)
          );

          // 2. Notify Admins + Dept Heads + Managers (excluding the employee)
          const notifyEmails = new Set();

          // Admins
          const admins = await Employee.find({ role: "Admin" }).select("email").lean();
          admins.forEach((admin) => notifyEmails.add(admin.email));

          // Dept Heads + Managers
          if (emp.department?._id) {
            const dept = await Department.findById(emp.department._id).lean();
            if (dept) {
              const employeeIdStr = emp._id.toString();

              dept.departmentHeads?.forEach((headId) => {
                if (headId.toString() !== employeeIdStr)
                  notifyEmails.add(headId.toString());
              });

              dept.projectManagers?.forEach((mgrId) => {
                if (mgrId.toString() !== employeeIdStr)
                  notifyEmails.add(mgrId.toString());
              });

              const additionalUsers = await Employee.find({
                _id: { $in: Array.from(notifyEmails) },
              })
                .select("email")
                .lean();

              additionalUsers.forEach((u) => notifyEmails.add(u.email));
            }
          }

          // Send notification emails
          for (const email of notifyEmails) {
            await sendEmailUtil(
              email,
              `🎊 Work Anniversary: ${emp.firstName} ${emp.lastName}`,
              workAnniversaryAlertTemplate
                .replaceAll("$firstName", emp.firstName)
                .replaceAll("$lastName", emp.lastName)
                .replaceAll("$years", years)
            );
          }

          console.log(`🎉 Sent anniversary emails for ${emp.firstName} ${emp.lastName} (${years} years)`);
        }
      }
    }

    // ==========================================
    // PART 2: CREATE MISSING ANNIVERSARY EVENTS (CHECK ALL EMPLOYEES)
    // ==========================================
    const oneYearFromNow = today.plus({ years: 1 });

    for (const emp of employees) {
      const start = Time.fromJSDate(emp.startDate);
      if (!start.isValid) continue;

      // Check if this employee has any work anniversary events
      const existingEvent = await Event.findOne({
        createdBy: emp._id,
        type: "work-aniversary"
      });

      // If no anniversary event exists for this employee, create one for next anniversary
      if (!existingEvent) {
        try {
          // Calculate next anniversary date
          const currentYear = today.year;
          let nextAnniversaryYear = currentYear;

          // Check if this year's anniversary has already passed
          const thisYearAnniversary = start.set({ year: currentYear });
          if (thisYearAnniversary < today) {
            nextAnniversaryYear = currentYear + 1;
          }

          const nextAnniversaryDate = start.set({ year: nextAnniversaryYear });

          // Only create events for anniversaries within the next year
          if (nextAnniversaryDate <= oneYearFromNow) {
            const eventDateISO = nextAnniversaryDate.toISO();

            const workAnniversaryEvent = new Event({
              title: `${emp.firstName}'s Work Anniversary 🎉`,
              description: `Celebrating ${emp.firstName} ${emp.lastName}'s work anniversary at ${companyName}.`,
              type: "work-aniversary",
              startDate: eventDateISO,
              endDate: eventDateISO,
              allDay: true,
              location: "Office",
              attendees: [],
              priority: "medium",
              status: "scheduled",
              targetType: "all",
              targetValues: [],
              isRecurring: true,
              isPrivate: false,
              createdBy: emp._id,
              createdByRole: emp.role,
              metadata: {
                attachments: [],
                notifications: [],
              },
            });

            const savedEvent = await workAnniversaryEvent.save();

            // Update employee with anniversary event ID
            await Employee.findByIdAndUpdate(emp._id, {
              workAnniversaryEventId: savedEvent._id
            });

            const yearsAtEvent = nextAnniversaryYear - start.year;
            console.log(`✅ Created missing anniversary event for ${emp.firstName} ${emp.lastName} (${yearsAtEvent} years) - ${nextAnniversaryDate.toISODate()}`);
          }
        } catch (eventError) {
          console.error(`❌ Failed to create anniversary event for ${emp.firstName}:`, eventError);
        }
      }
    }

    console.log(`✅ Work Anniversary Scheduler completed for ${today.toISODate()}`);
  } catch (err) {
    console.error("❌ Work Anniversary Scheduler Error:", err.message);
  }
};

module.exports = runWorkAnniversaryScheduler;
