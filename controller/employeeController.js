const Employee = require("../model/employeeSchema");
const Department = require("../model/departmentSchema");
const Event = require("../model/eventSchema");
const { hash, withoutPassword } = require("../utils/secret");
const { sendNotificationToUsers } = require("../utils/sendNotificationToUsers");
const parseQueryArray = require("../utils/parseQueryArray");
const {
  employeeOnboardingTemplate,
  employeeTerminationTemplate,
  employeeResignationTemplate, // <-- added
  employeeDeptHeadRoleUpdateTemplate,
  employeeAdminRoleUpdateTemplate,
  employeeManagerRoleUpdateTemplate,
  employeeRoleUpdateTemplate,
  employeeDesignationChangeTemplate,
  fullTimeEmploymentHtmlTemplate,
} = require("../utils/emailTemplates");
const sendEmailUtil = require("../utils/emailService");
const { companyName } = require("../constant/companyInfo");
const Time = require("../utils/time");
const mongoose = require("mongoose");

/* ─────────────────────────── helpers ─────────────────────────── */
function buildPagination({ totalDocs, page, limit }) {
  return {
    totalDocs,
    totalPages: Math.ceil(totalDocs / limit),
    page,
    limit,
  };
}

/* merge helper for nested objects */
function deepMerge(target = {}, patch = {}) {
  Object.entries(patch).forEach(([k, v]) => {
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      !(v instanceof Date)
    ) {
      target[k] = deepMerge({ ...(target[k] || {}) }, v);
    } else {
      target[k] = v;
    }
  });
  return target;
}

/* ───────────────────── GET  /api/employee ───────────────────── */
async function getAllUser(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);

    const filter = {};
    // Filter by departmentHead: show only employees in departments where departmentHead matches
    if (req.query.departmentHead) {
      const deptHeadId = req.query.departmentHead;
      const departmentsWithHead = await Department.find({
        departmentHeads: deptHeadId,
        isDeleted: false,
      }).select("_id");
      const deptIds = departmentsWithHead.map((d) => d._id);
      filter.department = { $in: deptIds };
      filter.role = { $ne: "Admin" };
    } else if (req.query.managerId) {
      const managerId = req.query.managerId;
      const departmentsWithManager = await Department.find({
        projectManagers: managerId,
        isDeleted: false,
      }).select("_id");
      const deptIds = departmentsWithManager.map((d) => d._id);
      filter.department = { $in: deptIds };
      filter.role = { $nin: ["Admin", "DepartmentHead"] };
    }
    const roles = parseQueryArray(req.query.role);
    if (roles) filter.role = { $in: roles };
    const statuses = parseQueryArray(req.query.status);
    if (statuses) filter.status = { $in: statuses };
    const departments = parseQueryArray(req.query.department);
    if (departments) filter.department = { $in: departments };
    const employmentTypes = parseQueryArray(req.query.employmentType);
    if (employmentTypes) filter.employmentType = { $in: employmentTypes };
    const workLocations = parseQueryArray(req.query.workLocation);
    if (workLocations) filter.workLocation = { $in: workLocations };

    if (req.query.gender) filter.gender = req.query.gender;
    if (req.query.religion) filter.religion = req.query.religion;

    [
      "isVerified",
      "isEmailVerified",
      "isNidVerified",
      "isPhoneVerified",
      "isAddressVerified",
      "isEmergencyContactVerified",
      "isDocumentVerified",
    ].forEach((field) => {
      if (req.query[field] !== undefined) {
        filter[field] = req.query[field] === "true";
      }
    });

    // Search by firstName, lastName, fullName, email, phone, nid
    if (
      req.query.search &&
      typeof req.query.search === "string" &&
      req.query.search.trim()
    ) {
      const search = req.query.search.trim();
      const regex = new RegExp(search, "i");
      filter.$or = [
        { firstName: regex },
        { lastName: regex },
        { email: regex },
        { phone: regex },
        { nid: regex },
        {
          $expr: {
            $regexMatch: {
              input: { $concat: ["$firstName", " ", "$lastName"] },
              regex,
            },
          },
        },
      ];
    } else {
      if (req.query.firstName && typeof req.query.firstName === "string") {
        filter.firstName = { $regex: req.query.firstName, $options: "i" };
      }
    }

    const [totalDocs, users] = await Promise.all([
      Employee.countDocuments(filter),
      Employee.find(filter)
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .select("-password")
        .populate("department")
        .populate("assets"),
    ]);

    res.status(200).json({
      data: users,
      pagination: buildPagination({ totalDocs, page, limit }),
    });
  } catch (err) {
    console.error("Error fetching all users:", err);
    res
      .status(500)
      .json({ detail: "Internal Server Error", error: err.message });
  }
}

/* ───────────────────── GET  /api/employee/:id ───────────────── */
async function getSingleUser(req, res) {
  try {
    const user = await Employee.findById(req.params.id)
      .select("-password")
      .populate("assets")
      .populate("department");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.status(200).json(user);
  } catch (err) {
    console.error("Error fetching user by ID:", err);
    res
      .status(500)
      .json({ detail: "Internal Server Error", error: err.message });
  }
}

/* ─────────────────── POST /api/employee/register ────────────── */
async function onboarding(req, res) {
  try {
    const {
      password,
      dateOfBirth,
      startDate,
      terminationDate,
      i9 = {},
      department,
      role,
      storageLimit, // <-- accept storageLimit from request
      ...rest
    } = req.body;

    const newEmployeeData = {
      ...rest,
      department: department ? new mongoose.Types.ObjectId(department) : null,
      role,
      password: hash(password),
    };

    if (dateOfBirth) {
      const dob = Time.fromISO(dateOfBirth);
      if (!Time.isValidDateTime(dob)) {
        return res.status(400).json({ error: "Invalid dateOfBirth format" });
      }
      newEmployeeData.dateOfBirth = Time.toJSDate(dob);
    }

    if (startDate) {
      const sd = Time.fromISO(startDate);
      if (!Time.isValidDateTime(sd)) {
        return res.status(400).json({ error: "Invalid startDate format" });
      }
      newEmployeeData.startDate = Time.toJSDate(sd);
    }

    if (terminationDate) {
      const td = Time.fromISO(terminationDate);
      if (!Time.isValidDateTime(td)) {
        return res
          .status(400)
          .json({ error: "Invalid terminationDate format" });
      }
      newEmployeeData.terminationDate = Time.toJSDate(td);
    }

    if (i9?.docExpires) {
      const exp = Time.fromISO(i9.docExpires);
      if (!Time.isValidDateTime(exp)) {
        return res.status(400).json({ error: "Invalid i9.docExpires format" });
      }
      newEmployeeData.i9 = {
        ...i9,
        docExpires: Time.toJSDate(exp),
      };
    } else {
      newEmployeeData.i9 = i9;
    }

    if (req.body.address) newEmployeeData.address = req.body.address;
    if (req.body.emergencyContact)
      newEmployeeData.emergencyContact = req.body.emergencyContact;
    if (req.body.familyMembers && Array.isArray(req.body.familyMembers))
      newEmployeeData.familyMembers = req.body.familyMembers;
    if (
      req.body.prevWorkExperience &&
      Array.isArray(req.body.prevWorkExperience)
    )
      newEmployeeData.prevWorkExperience = req.body.prevWorkExperience;
    if (req.body.documents && Array.isArray(req.body.documents))
      newEmployeeData.documents = req.body.documents;

    // --- Compute isUpdated using nested field logic ---
    const getNestedValue = (obj, path) =>
      path.split(".").reduce((acc, key) => acc?.[key], obj);

    const requiredFields = [
      "firstName",
      "lastName",
      "email",
      "password",
      "gender",
      // "address.address",
      // "address.city",
      // 'filingStatus',
      "maritalStatus",
      "phone",
      "dateOfBirth",
      "emergencyContact.name",
      "emergencyContact.phonePrimary",
      "emergencyContact.relationship",
      // 'emergencyContact.address',
      // 'emergencyContact.email',
    ];

    const isUpdated = requiredFields.every(
      (field) => !!getNestedValue(newEmployeeData, field)
    );
    newEmployeeData.isUpdated = isUpdated;

    if (storageLimit && typeof storageLimit === "object") {
      newEmployeeData.storageLimit = {};
      if (typeof storageLimit.value === "number") {
        newEmployeeData.storageLimit.value = storageLimit.value;
        newEmployeeData.mannualStorageSet = true;
      }
      if (["MB", "GB"].includes(storageLimit.unit)) {
        newEmployeeData.storageLimit.unit = storageLimit.unit;
        newEmployeeData.mannualStorageSet = true;
      }
    }

    const created = await new Employee(newEmployeeData).save();

    if (created.startDate) {
      // Convert startDate to Luxon DateTime and add 1 year, then convert to ISO string
      const anniversaryDateTime = Time.fromJSDate(created.startDate).plus({
        years: 1,
      });
      const eventDateISO = anniversaryDateTime.toISO();

      const workAnniversaryEvent = new Event({
        title: `${created.firstName}'s Work Anniversary 🎉`,
        description: `Celebrating ${created.firstName} ${created.lastName}'s work anniversary at ${companyName}.`,
        type: "work-aniversary",
        startDate: eventDateISO,
        endDate: eventDateISO,
        allDay: true,
        location: "Office",
        attendees: [],
        priority: "medium",
        status: "confirmed",
        targetType: "all",
        targetValues: [],
        isRecurring: true,
        isPrivate: false,
        createdBy: created._id,
        createdByRole: created.role,
        metadata: {
          attachments: [],
          notifications: [],
        },
      });

      const savedEvent = await workAnniversaryEvent.save();

      created.workAnniversaryEventId = savedEvent._id;
      await created.save();
    }

    // === Department Update Logic ===
    if (
      (role === "Manager" || role === "DepartmentHead") &&
      department &&
      mongoose.Types.ObjectId.isValid(department)
    ) {
      const dept = await Department.findById(department);

      if (dept) {
        const userIdStr = created._id.toString();

        if (role === "Manager") {
          const managers = dept.projectManagers.map((id) => id.toString());
          if (!managers.includes(userIdStr)) {
            dept.projectManagers.push(created._id);
          }
        }

        if (role === "DepartmentHead") {
          // Ensure in departmentHeads array
          const heads = dept.departmentHeads.map((id) => id.toString());
          if (!heads.includes(userIdStr)) {
            dept.departmentHeads.push(created._id);
          }
        }

        await dept.save();
      }
    }

    const emailBody = employeeOnboardingTemplate
      .replaceAll("$firstName", req.body?.firstName ? req.body?.firstName : " ")
      .replaceAll("$email", req.body.email)
      .replaceAll("$password", password);

    sendEmailUtil(
      req.body.email,
      "Successfully Onboarded - Access Your Portal Now",
      emailBody
    );

    // create joining event

    res.status(201).json({
      message: "User created successfully",
      user: withoutPassword(created),
    });
  } catch (err) {
    if (err.code === 11000 && err.keyPattern?.email) {
      return res.status(409).json({ error: "Email already in use" });
    }
    console.error("Error creating user:", err);
    res
      .status(500)
      .json({ detail: "Internal Server Error", error: err.message });
  }
}

/* ─────────────────── PATCH /api/employee/update ────────────── */
async function updateEmployee(req, res) {
  try {
    const { id, ...rawUpdates } = req.body;

    const user = await Employee.findById(id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const prevDepartment = user.department ? user.department.toString() : null;
    const previousStatus = user.status; // <-- track original status
    const previousDesignation = user.designation;
    const previousEmploymentType = user.employmentType;
    const updates = { ...rawUpdates };

    // === Update Work Anniversary Event if startDate changed ===
    if (updates.startDate && user.workAnniversaryEventId) {
      try {
        const event = await Event.findById(user.workAnniversaryEventId);
        if (event) {
          event.startDate = updates.startDate;
          event.endDate = updates.startDate;
          await event.save();
        }
      } catch (eventErr) {
        console.error("Failed to update anniversary event date:", eventErr);
      }
    }

    // Convert date strings to JS Dates
    const dateFields = [
      "dateOfBirth",
      "startDate",
      "terminationDate",
      "i9.docExpires",
    ];

    for (const field of dateFields) {
      const keys = field.split(".");
      const val = keys.reduce((obj, key) => obj?.[key], updates);
      if (val && typeof val === "string") {
        const luxonDate = Time.fromISO(val);
        if (Time.isValidDateTime(luxonDate)) {
          const jsDate = Time.toJSDate(luxonDate);
          if (keys.length === 1) {
            updates[keys[0]] = jsDate;
          } else {
            let ref = updates;
            for (let i = 0; i < keys.length - 1; i++) {
              if (!ref[keys[i]]) ref[keys[i]] = {};
              ref = ref[keys[i]];
            }
            ref[keys.at(-1)] = jsDate;
          }
        }
      }
    }

    // Password hash
    if (updates.password) {
      user.password = hash(updates.password);
      delete updates.password;
    }

    // Normalize boolean and array fields
    [
      "isVerified",
      "isEmailVerified",
      "isNidVerified",
      "isPhoneVerified",
      "isAddressVerified",
      "isEmergencyContactVerified",
      "isDocumentVerified",
      "isPreviouslyEmployed",
    ].forEach((key) => {
      if (typeof updates[key] === "boolean") {
        user[key] = updates[key];
      }
    });

    ["address", "bankInfo", "emergencyContact", "i9"].forEach((key) => {
      if (updates[key]) {
        if (typeof updates[key] === "object" && updates[key] !== null) {
          // Merge into existing object
          user[key] = { ...user[key], ...updates[key] };
        } else {
          // For non-object values, replace directly
          user[key] = updates[key];
        }
      }
    });

    ["familyMembers", "prevWorkExperience", "documents"].forEach((key) => {
      if (Array.isArray(updates[key])) user[key] = updates[key];
    });

    // File-related fields
    [
      "photoUrl",
      "releaseLetter",
      "nocLetter",
      "experienceCertificate",
      "updatedCV",
      "signature",
    ].forEach((key) => {
      if (updates[key]) user[key] = updates[key];
    });

    if (updates.filingStatus) user.filingStatus = updates.filingStatus;
    if (typeof updates.additionalWithholding === "number") {
      user.additionalWithholding = updates.additionalWithholding;
    }

    // Role management
    let roleChanged = false;
    let newRole = user.role;
    if (updates.role) {
      const validRoles = ["Admin", "DepartmentHead", "Manager", "Employee"];
      const roleRank = {
        Admin: 1,
        DepartmentHead: 2,
        Manager: 3,
        Employee: 4,
      };

      if (!validRoles.includes(updates.role)) {
        return res.status(400).json({ error: "Invalid role" });
      }

      const currentRank = roleRank[user.role] ?? Infinity;
      const newRank = roleRank[updates.role];

      // if (newRank > currentRank) {
      //   return res.status(403).json({
      //     error: `Role downgrade is not allowed from ${user.role} to ${updates.role}`,
      //   });
      // }

      roleChanged = true;
      newRole = updates.role;
      user.role = updates.role;
    }

    const newDepartment = updates.department
      ? updates.department.toString()
      : prevDepartment;
    if (updates.department) user.department = updates.department;

    [
      "dateOfBirth",
      "nid",
      "nidPhotoUrl",
      "terminationDate",
      "startDate",
      "birthCertificateNo",
      "religion",
      "gender",
      "phone",
      "employeeId",
      "bloodGroup",
      "designation",
      "employmentType",
      "firstName",
      "lastName",
      "status",
      "email",
      "shift",
      "maritalStatus",
      "workLocation",
    ].forEach((key) => {
      if (updates[key] !== undefined) {
        user[key] = updates[key];
      }
    });

    // Handle storageLimit update
    if (updates.storageLimit && typeof updates.storageLimit === "object") {
      if (!user.storageLimit) user.storageLimit = {};
      if (typeof updates.storageLimit.value === "number") {
        user.storageLimit.value = updates.storageLimit.value;
        user.mannualStorageSet = true;
      }
      if (["MB", "GB"].includes(updates.storageLimit.unit)) {
        user.storageLimit.unit = updates.storageLimit.unit;
        user.mannualStorageSet = true;
      }
      delete updates.storageLimit;
    }

    // Calculate isUpdated
    const getNestedValue = (obj, path) =>
      path.split(".").reduce((acc, key) => acc?.[key], obj);

    const requiredFields = [
      "firstName",
      "lastName",
      "email",
      "password",
      "gender",
      "maritalStatus",
      "phone",
      "dateOfBirth",
      "emergencyContact.name",
      "emergencyContact.phonePrimary",
      "emergencyContact.relationship",
    ];

    user.isUpdated = requiredFields.every((field) =>
      Boolean(getNestedValue(user, field))
    );

    if (updates.isUpdated) {
      user.isUpdated = updates.isUpdated;
    }

    await user.save();

    // === Send termination / resignation email if status changed ===
    if (
      updates.status &&
      updates.status !== previousStatus &&
      typeof updates.status === "string"
    ) {
      const lowered = updates.status.toLowerCase();
      if (lowered === "terminated" || lowered === "resigned") {
        try {
          const effectiveDate = user.terminationDate
            ? Time.fromJSDate(user.terminationDate).toISODate()
            : Time.now().toISODate();

          // simple helper for replacements
          const applyReplacements = (tmpl, map) =>
            Object.entries(map).reduce(
              (acc, [k, v]) => acc.replaceAll(`$${k}`, v ?? ""),
              tmpl
            );

          const baseMap = {
            firstName: user.firstName || "",
            lastName: user.lastName || "",
            companyName: companyName,
            position: user.designation || user.role || "",
            managerName: "Manager",
            contactEmail: "admin@haquedigital.com",
          };

          let subject, body;
          if (lowered === "terminated") {
            subject = "Employment Termination Notice";
            body = applyReplacements(employeeTerminationTemplate, {
              ...baseMap,
              effectiveDate,
              returnOfPropertyDeadline: effectiveDate,
            });
          } else {
            subject = "Resignation Acknowledgement";
            body = applyReplacements(employeeResignationTemplate, {
              ...baseMap,
              lastWorkingDay: effectiveDate,
              exitInterviewDate: "TBD",
            });
          }

          if (user.email) {
            sendEmailUtil(user.email, subject, body);
          }
        } catch (mailErr) {
          console.error("Failed to send status change email:", mailErr);
        }
      }
    }

    // === Department Role Sync ===
    if (
      (newRole === "Manager" || newRole === "DepartmentHead") &&
      newDepartment &&
      mongoose.Types.ObjectId.isValid(newDepartment)
    ) {
      const dept = await Department.findById(newDepartment);
      if (dept) {
        const userIdStr = user._id.toString();

        if (newRole === "Manager") {
          const managers = dept.projectManagers.map((id) => id.toString());
          if (!managers.includes(userIdStr)) {
            dept.projectManagers.push(user._id);
          }
        }

        if (newRole === "DepartmentHead") {
          const heads = dept.departmentHeads.map((id) => id.toString());
          if (!heads.includes(userIdStr)) {
            dept.departmentHeads.push(user._id);
          }
        }

        await dept.save();
      }
    }

    // Department change notification
    if (
      prevDepartment !== newDepartment &&
      Object.keys(updates).length === 1 &&
      updates.department
    ) {
      await sendNotificationToUsers({
        userIds: [user._id.toString()],
        departmentIds: [newDepartment],
        type: "DepartmentChange",
        title: "Department Changed",
        message: `Your department has been changed.`,
        data: { employeeId: user._id, newDepartment },
      });
    }

    // Role change notification
    // if (roleChanged && Object.keys(updates).length === 1) {
    //   await sendNotificationToUsers({
    //     userIds: [user._id.toString()],
    //     type: "RoleChange",
    //     title: "Role Changed",
    //     message: `Your role has been changed to ${newRole}.`,
    //     data: { employeeId: user._id, newRole },
    //   });
    // }

    // Role change notification
    if (roleChanged && Object.keys(updates).length === 1) {
      await sendNotificationToUsers({
        userIds: [user._id.toString()],
        type: "RoleChange",
        title: "Role Changed",
        message: `Your role has been changed to ${newRole}.`,
        data: { employeeId: user._id, newRole },
      });

      // === Send role change email ===
      try {
        if (user.email) {
          let subject, body;
          let departmentName = await Department.findById(user?.department);
          const baseMap = {
            firstName: user.firstName || "",
            lastName: user.lastName || "",
            departmentName: departmentName.name || "",
            companyName,
            position: user.designation || user.role || "",
            newRole: newRole,
            effectiveDate: Time.now().toISODate(),
            contactEmail: "admin@haquedigital.com",
          };

          // Apply replacements helper
          const applyReplacements = (tmpl, map) =>
            Object.entries(map).reduce(
              (acc, [k, v]) => acc.replaceAll(`$${k}`, v ?? ""),
              tmpl
            );

          // Select appropriate template based on new role
          switch (newRole) {
            case "Admin":
              subject = "Administrator Role Assignment";
              body = applyReplacements(
                employeeAdminRoleUpdateTemplate,
                baseMap
              );
              break;
            case "DepartmentHead":
              subject = "Department Head Role Assignment";
              body = applyReplacements(
                employeeDeptHeadRoleUpdateTemplate,
                baseMap
              );
              break;
            case "Manager":
              subject = "Manager Role Assignment";
              body = applyReplacements(
                employeeManagerRoleUpdateTemplate,
                baseMap
              );
              break;
            case "Employee":
              subject = "Role Update Notification";
              body = applyReplacements(employeeRoleUpdateTemplate, baseMap);
              break;
            default:
              subject = "Role Update Notification";
              body = applyReplacements(employeeRoleUpdateTemplate, baseMap);
          }

          sendEmailUtil(user.email, subject, body);
        }
      } catch (mailErr) {
        console.error("Failed to send role change email:", mailErr);
      }
    }

    // === Send designation change email if designation updated ===
    if (
      updates.designation &&
      updates.designation !== previousDesignation &&
      typeof updates.designation === "string"
    ) {
      try {
        if (user.email) {
          let subject, body;
          let departmentName = await Department.findById(user?.department);

          const baseMap = {
            firstName: user.firstName || "",
            lastName: user.lastName || "",
            companyName: companyName,
            oldDesignation: previousDesignation || "N/A",
            newDesignation: updates.designation,
            departmentName: departmentName?.name || "",
            effectiveDate: Time.now().toISODate(),
            contactEmail: "admin@haquedigital.com",
          };

          const applyReplacements = (tmpl, map) =>
            Object.entries(map).reduce(
              (acc, [k, v]) => acc.replaceAll(`$${k}`, v ?? ""),
              tmpl
            );

          subject = "Designation Change Notification";
          body = applyReplacements(employeeDesignationChangeTemplate, baseMap);

          sendEmailUtil(user.email, subject, body);
        }
      } catch (mailErr) {
        console.error("Failed to send designation change email:", mailErr);
      }
    }

    if (
      updates.employmentType &&
      updates.employmentType !== previousEmploymentType &&
      updates.employmentType === "FullTime"
    ) {
      try {
        const department = await Department.findById(user?.department);
        const baseMap = {
          firstName: user.firstName || "",
          lastName: user.lastName || "",
          companyName: companyName,
          departmentName: department.name || "N/A",
          previousType: previousEmploymentType || "N/A",
          newType: updates.employmentType,
          designation: user.designation || "N/A",
          effectiveDate: Time.now().toISODate(),
          contactEmail: "admin@haquedigital.com",
        };

        const applyReplacements = (tmpl, map) =>
          Object.entries(map).reduce(
            (acc, [k, v]) => acc.replaceAll(`$${k}`, v ?? ""),
            tmpl
          );

        const subject = "Employment Type Update";
        const body = applyReplacements(fullTimeEmploymentHtmlTemplate, baseMap);

        sendEmailUtil(user.email, subject, body);
      } catch (mailErr) {
        console.error("Failed to send employment type change email:", mailErr);
      }
    }

    res.status(200).json({
      message: "User updated successfully",
      user: withoutPassword(user),
    });
  } catch (err) {
    if (err.code === 11000 && err.keyPattern?.email) {
      return res.status(409).json({ error: "Email already in use" });
    }
    console.error("Error updating user:", err);
    res
      .status(500)
      .json({ detail: "Internal Server Error", error: err.message });
  }
}

async function deleteEmployee(req, res) {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ error: "Employee ID is required" });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid employee ID" });
    }
    const employee = await Employee.findByIdAndDelete(id);
    if (!employee) {
      return res.status(404).json({ error: "Employee not found" });
    }
    return res.status(200).json({ message: "Employee deleted successfully" });
  } catch (error) {
    console.error("Error deleting employee:", error);
    return res
      .status(500)
      .json({ detail: "Internal Server Error", error: error.message });
  }
}

module.exports = {
  onboarding,
  getAllUser,
  getSingleUser,
  updateEmployee,
  deleteEmployee,
};
