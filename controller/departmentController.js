const mongoose = require('mongoose');
const Department = require('../model/departmentSchema');
const Kpi = require("../model/kpiSchema");
const Employee = require('../model/employeeSchema');
const Time = require('../utils/time')
/* ──────────────────────────────── helpers ──────────────────────────────── */
function buildPaginationMeta({ totalDocs, page, limit }) {
  return {
    totalDocs,
    totalPages: Math.ceil(totalDocs / limit),
    page,
    limit,
  };
}

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/* ──────────────────────────────── CREATE ──────────────────────────────── */
// POST /api/departments
async function createDepartment(req, res) {
  try {
    const { name, description, departmentHeads, projectManagers, kpiCriteria } = req.body;

    // 1. Basic validations for name, departmentHeads, projectManagers (same as before)
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Department name is required and must be a non-empty string." });
    }
    if (departmentHeads && !Array.isArray(departmentHeads)) {
      return res.status(400).json({ error: "departmentHeads must be an array of employee IDs." });
    }
    if (projectManagers && !Array.isArray(projectManagers)) {
      return res.status(400).json({ error: "projectManagers must be an array of employee IDs." });
    }
    if (Array.isArray(projectManagers) && projectManagers.length > 0) {
      for (let i = 0; i < projectManagers.length; i++) {
        if (!isValidObjectId(projectManagers[i])) {
          return res.status(400).json({ error: `projectManagers[${i}] is not a valid employee ID.` });
        }
      }
    }

    // 2. KPI Criteria validation & transform
    if (!Array.isArray(kpiCriteria)) {
      return res.status(400).json({ error: "kpiCriteria must be an array." });
    }
    let totalValue = 0;
    const kpiCriteriaToSave = [];

    for (let i = 0; i < kpiCriteria.length; i++) {
      const { criteria, value } = kpiCriteria[i];
      if (!criteria || typeof criteria !== "string" || typeof value !== "number" || value < 0 || value > 100) {
        return res.status(400).json({
          error: `Each kpiCriteria must have a string 'criteria' and a number 'value' between 0 and 100.`,
          index: i,
          value: kpiCriteria[i]
        });
      }
      totalValue += value;

      // Find existing KPI by criteria text or create a new one
      let kpiDoc = await Kpi.findOne({ criteria: criteria.trim() });
      if (!kpiDoc) {
        kpiDoc = new Kpi({ criteria: criteria.trim() });
        await kpiDoc.save();
      }

      kpiCriteriaToSave.push({ kpi: kpiDoc._id, value });
    }

    if (totalValue !== 100) {
      return res.status(400).json({
        error: "Total value of all kpiCriteria must be exactly 100.",
        totalValue
      });
    }

    // 3. Update Employee Roles (same as before)
    if (departmentHeads && departmentHeads.length > 0) {
      for (const departmentHead of departmentHeads) {
        const deptHeadEmp = await Employee.findById(departmentHead);
        if (!deptHeadEmp) {
          return res.status(404).json({ error: "Department Head not found." });
        }
        if (deptHeadEmp.role === "Employee") {
          deptHeadEmp.role = "DepartmentHead";
          await deptHeadEmp.save();
        } else if (deptHeadEmp.role !== "DepartmentHead") {
          return res.status(400).json({ error: `Department Head (${deptHeadEmp.firstName}) must have role 'DepartmentHead'.` });
        }
      }
    }

    let validProjectManagers = [];
    if (projectManagers && projectManagers.length > 0) {
      for (let id of projectManagers) {
        // if (id == departmentHead) continue;
        let pmEmp = await Employee.findById(id);
        if (!pmEmp) {
          return res.status(404).json({ error: `Project Manager (${id}) not found.` });
        }
        if (pmEmp.role === "Employee") {
          pmEmp.role = "Manager";
          await pmEmp.save();
        } else if (pmEmp.role !== "Manager") {
          return res.status(400).json({ error: `Project Manager (${id}) must have role 'Manager'.` });
        }
        validProjectManagers.push(id);
      }
    }

    // 4. Create Department with references to KPI ObjectIds + values
    const deptData = {
      name: name.trim(),
      description,
      departmentHeads: departmentHeads || [],
      projectManagers: validProjectManagers || [],
      kpiCriteria: kpiCriteriaToSave,
    };
    const dept = await new Department(deptData).save();

    return res.status(201).json({ message: "Department created", department: dept });

  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "Department name must be unique" });
    }
    console.error("Error creating department:", err);
    return res.status(500).json({ detail: "Internal Server Error", error: err.message });
  }
}

/* ──────────────────────────────── READ (all) ───────────────────────────── */
// GET /api/departments?page=&limit=&populate=
async function getDepartments(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    const populate = req.query.populate === 'true' || req.query.populate === '1';
    const { departmentHead, managerId } = req.query;

    const filter = { isDeleted: false };
    if (departmentHead) {
      filter.departmentHeads = departmentHead;
    } else if (managerId) {
      filter.projectManagers = managerId;
    }

    const [totalDocs, departments] = await Promise.all([
      Department.countDocuments(filter),
      Department.find(filter)
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .populate(populate ? 'employees projectManagers departmentHeads kpiCriteria.kpi' : null),
    ]);

    res.status(200).json({
      data: departments,
      pagination: buildPaginationMeta({ totalDocs, page, limit }),
    });
  } catch (err) {
    console.error('Error fetching departments:', err);
    res.status(500).json({ detail: 'Internal Server Error', error: err.message });
  }
}

/* ──────────────────────────────── READ (one) ───────────────────────────── */
// GET /api/departments/:id?populate=true
async function getDepartmentById(req, res) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid department ID." });
    }
    const populate = req.query.populate === 'true' || req.query.populate === '1';
    const dept = await Department.findById(req.params.id).populate(populate ? 'employees projectManagers departmentHeads kpiCriteria.kpi' : null);

    if (!dept) return res.status(404).json({ error: 'Department not found' });
    res.status(200).json(dept);
  } catch (err) {
    console.error('Error fetching department:', err);
    res.status(500).json({ detail: 'Internal Server Error', error: err.message });
  }
}

/* ──────────────────────────────── UPDATE ──────────────────────────────── */
// PATCH /api/departments/:id
async function updateDepartment(req, res) {
  try {
    const deptId = req.params.id;
    const { name, description, departmentHeads, projectManagers, kpiCriteria } = req.body;

    if (!isValidObjectId(deptId)) {
      return res.status(400).json({ error: "Invalid department ID." });
    }

    // 1. Fetch existing department (for validation and old data)
    const existingDept = await Department.findOne({ _id: deptId, isDeleted: false });
    if (!existingDept) {
      return res.status(404).json({ error: "Department not found" });
    }



    // 2. Validation phase - no updates here

    // Validate name
    if (name !== undefined) {
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "Department name is required and must be a non-empty string." });
      }
      // Unique name check excluding self
      const duplicate = await Department.findOne({
        _id: { $ne: deptId },
        name: { $regex: new RegExp("^" + name.trim() + "$", "i") },
        isDeleted: false,
      });
      if (duplicate) {
        return res.status(409).json({ error: "Department name must be unique." });
      }
    }

    // Validate departmentHeads if provided
    if (departmentHeads !== undefined) {
      if (!Array.isArray(departmentHeads)) {
        return res.status(400).json({ error: "departmentHeads must be an array of employee IDs." });
      }
      for (let i = 0; i < departmentHeads.length; i++) {
        if (!isValidObjectId(departmentHeads[i])) {
          return res.status(400).json({ error: `departmentHeads[${i}] is not a valid employee ID.` });
        }
      }
      const deptHeadCount = await Employee.countDocuments({ _id: { $in: departmentHeads } });
      if (deptHeadCount !== departmentHeads.length) {
        return res.status(404).json({ error: "One or more departmentHead employees not found." });
      }
    }

    // Validate projectManagers if provided
    if (projectManagers !== undefined) {
      if (!Array.isArray(projectManagers)) {
        return res.status(400).json({ error: "projectManagers must be an array of employee IDs." });
      }
      for (let i = 0; i < projectManagers.length; i++) {
        if (!isValidObjectId(projectManagers[i])) {
          return res.status(400).json({ error: `projectManagers[${i}] is not a valid employee ID.` });
        }
      }
      const pmCount = await Employee.countDocuments({ _id: { $in: projectManagers } });
      if (pmCount !== projectManagers.length) {
        return res.status(404).json({ error: "One or more projectManager employees not found." });
      }
    }
    const kpiCriteriaToSave = [];
    // Disallow updating kpiCriteria
    if (kpiCriteria !== undefined) {
      // 2. KPI Criteria validation & transform
      if (!Array.isArray(kpiCriteria)) {
        return res.status(400).json({ error: "kpiCriteria must be an array." });
      }
      let totalValue = 0;

      for (let i = 0; i < kpiCriteria.length; i++) {
        const { criteria, value } = kpiCriteria[i];
        if (!criteria || typeof criteria !== "string" || typeof value !== "number" || value < 0 || value > 100) {
          return res.status(400).json({
            error: `Each kpiCriteria must have a string 'criteria' and a number 'value' between 0 and 100.`,
            index: i,
            value: kpiCriteria[i]
          });
        }
        totalValue += value;

        // Find existing KPI by criteria text or create a new one
        let kpiDoc = await Kpi.findOne({ criteria: criteria.trim() });
        if (!kpiDoc) {
          kpiDoc = new Kpi({ criteria: criteria.trim() });
          await kpiDoc.save();
        }

        kpiCriteriaToSave.push({ kpi: kpiDoc._id, value });
      }

      if (totalValue !== 100) {
        return res.status(400).json({
          error: "Total value of all kpiCriteria must be exactly 100.",
          totalValue
        });
      }
    }

    // Validate departmentHeads and projectManagers do not overlap
    const currentDeptHeadIds = existingDept.departmentHeads ? existingDept.departmentHeads.map(String) : [];
    const newDeptHeadIds = departmentHeads !== undefined ? departmentHeads.map(String) : currentDeptHeadIds;
    const newProjectManagers = projectManagers !== undefined ? projectManagers.map(String) : existingDept.projectManagers.map(String);

    // if (newProjectManagers.includes(newDeptHeadId)) {
    //   return res.status(400).json({ error: "departmentHead and projectManagers cannot be the same employee." });
    // }

    // 5. Update employee roles and department references

    // Update old departmentHead role if changed
    if (departmentHeads !== undefined && currentDeptHeadIds !== newDeptHeadIds) {
      // Upgrade new departmentHead
      for (const deptHeadId of newDeptHeadIds) {
        const deptHeadEmp = await Employee.findById(deptHeadId);
        if (!deptHeadEmp) {
          return res.status(404).json({ error: "Department Head not found." });
        }
        if (deptHeadEmp.role === "Employee") {
          deptHeadEmp.role = "DepartmentHead";
        } else if (deptHeadEmp.role !== "DepartmentHead") {
          return res.status(400).json({ error: `Department Head (${deptHeadEmp.firstName}) must have role 'DepartmentHead'.` });
        }
        // deptHeadEmp.department = deptId;
        await deptHeadEmp.save();
      }
    }

    // Update projectManagers roles & departments if changed
    if (projectManagers !== undefined) {
      const oldPMs = existingDept.projectManagers.map(String);
      const newPMs = newProjectManagers;

      // PMs to add
      const pmToAdd = newPMs.filter(pm => !oldPMs.includes(pm));
      for (const pmId of pmToAdd) {
        const newPMEmp = await Employee.findById(pmId);
        if (newPMEmp.role === "Employee") {
          newPMEmp.role = "Manager";
        } else if (newPMEmp.role !== "Manager") {
          return res.status(400).json({ error: `Project Manager (${newPMEmp.firstName}) must have role 'Manager'.` });
        }
        // newPMEmp.department = deptId;
        await newPMEmp.save();
      }
    }

    // 3. All validations passed — prepare update data
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description;
    if (departmentHeads !== undefined) updateData.departmentHeads = departmentHeads;
    if (projectManagers !== undefined) updateData.projectManagers = projectManagers;
    if (kpiCriteria !== undefined) updateData.kpiCriteria = kpiCriteriaToSave;

    // 4. Update the Department document
    const updatedDept = await Department.findByIdAndUpdate(deptId, updateData, {
      new: true,
      runValidators: true,
    });

    // 6. Return success response
    return res.status(200).json({ message: "Department updated", department: updatedDept });

  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "Department name must be unique" });
    }
    console.error("Error updating department:", err);
    return res.status(500).json({ detail: "Internal Server Error", error: err.message });
  }
}

/* ──────────────────────────────── DELETE ──────────────────────────────── */
// DELETE /api/departments/:id
async function softDeleteDepartment(req, res) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid department ID." });
    }
    const dept = await Department.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { isDeleted: true, deletedAt: Time.toJSDate(Time.now()) },
      { new: true }
    );
    if (!dept) return res.status(404).json({ error: "Department not found or already deleted" });
    res.status(200).json({ message: "Department soft deleted", department: dept });
  } catch (err) {
    console.error("Error soft deleting department:", err);
    res.status(500).json({ detail: "Internal Server Error", error: err.message });
  }
}



async function hardDeleteDepartment(req, res) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid department ID." });
    }
    const removed = await Department.findByIdAndDelete(req.params.id);
    if (!removed) return res.status(404).json({ error: "Department not found" });
    res.status(200).json({ message: "Department permanently deleted" });
  } catch (err) {
    console.error("Error hard deleting department:", err);
    res.status(500).json({ detail: "Internal Server Error", error: err.message });
  }
}


const getDepartmentList = async (req, res) => {
  try {
    const departments = await Department.find(
      { isDeleted: false }, // skip deleted ones
      "_id name"            // only return id + name
    );

    res.status(200).json({
      success: true,
      count: departments.length,
      data: departments
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
};

module.exports = {
  createDepartment,
  getDepartments,
  getDepartmentById,
  updateDepartment,
  softDeleteDepartment,
  hardDeleteDepartment,
  getDepartmentList
};
