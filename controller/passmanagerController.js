const mongoose = require("mongoose");
const ProjectCredential = require("../model/passmanagerSchema");
const Employee = require("../model/employeeSchema");
const CryptoJS = require("crypto-js");

const SECRET_KEY = process.env.PASSWORD_SECRET || "Haque-digital";

// Utility to encrypt password
const encrypt = (text) => CryptoJS.AES.encrypt(text, SECRET_KEY).toString();

// Utility to decrypt password
const decrypt = (cipher) =>
  CryptoJS.AES.decrypt(cipher, SECRET_KEY).toString(CryptoJS.enc.Utf8);

// ─── CREATE NEW PROJECT WITH CREDENTIALS ──────────

async function createProjectWithCredentials(req, res) {
  try {
    const { employeeId, projectName, credentials } = req.body;

    if (!employeeId || !projectName) {
      return res
        .status(400)
        .json({ error: "Employee ID and project name are required" });
    }

    const encryptedCreds = Array.isArray(credentials)
      ? credentials.map((cred) => ({
          ...cred,
          password: encrypt(cred.password),
          description: cred.description,
        }))
      : [];

    const newProject = new ProjectCredential({
      employeeId,
      projectName,
      credentials: encryptedCreds,
    });

    const saved = await newProject.save();

    res.status(201).json({ message: "Project created", data: saved });
  } catch (err) {
    console.error("Error in createProjectWithCredentials:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ─── ADD CREDENTIAL TO EXISTING PROJECT ─────────────────────────────

async function addCredentialToProject(req, res) {
  try {
    const { projectId } = req.params;
    const { title, email, password, description } = req.body;

    if (!title || !email || !password) {
      return res.status(400).json({ error: "All fields are required." });
    }

    const updated = await ProjectCredential.findByIdAndUpdate(
      projectId,
      {
        $push: {
          credentials: {
            title,
            email,
            password: encrypt(password),
            description,
          },
        },
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.status(200).json({ message: "Credential added", data: updated });
  } catch (err) {
    console.error("Error in addCredentialToProject:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
// ─── FETCH ALL PROJECTS BY EMPLOYEE ────────────────────────────────
async function fetchMyProjects(req, res) {
  try {
    const { employeeId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({ error: "Invalid employee ID" });
    }

    const projects = await ProjectCredential.find({ employeeId }).sort({
      createdAt: -1,
    });

    const decryptedProjects = projects.map((project) => {
      const decryptedCreds = project.credentials.map((cred) => ({
        ...cred.toObject(),
        password: decrypt(cred.password),
      }));

      return {
        ...project.toObject(),
        credentials: decryptedCreds,
      };
    });

    res.status(200).json({ data: decryptedProjects });
  } catch (err) {
    console.error("Error in fetchMyProjects:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ─── UPDATE A SPECIFIC CREDENTIAL INSIDE A PROJECT ───────────────────

async function updateCredentialInProject(req, res) {
  try {
    const { projectId, credentialId } = req.params;
    const { title, email, password, description } = req.body;

    const updateFields = {};
    if (title) updateFields["credentials.$.title"] = title;
    if (email) updateFields["credentials.$.email"] = email;
    if (password) updateFields["credentials.$.password"] = encrypt(password);
    if (description) updateFields["credentials.$.description"] = description;

    const result = await ProjectCredential.findOneAndUpdate(
      { _id: projectId, "credentials._id": credentialId },
      { $set: updateFields },
      { new: true }
    );

    if (!result) {
      return res.status(404).json({ error: "Credential not found" });
    }

    res.status(200).json({ message: "Credential updated", data: result });
  } catch (err) {
    console.error("Error in updateCredentialInProject:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ─── DELETE A CREDENTIAL INSIDE A PROJECT ────────────────────────────

async function deleteCredentialInProject(req, res) {
  try {
    const { projectId, credentialId } = req.params;

    const result = await ProjectCredential.findByIdAndUpdate(
      projectId,
      {
        $pull: { credentials: { _id: credentialId } },
      },
      { new: true }
    );

    if (!result) {
      return res.status(404).json({ error: "Project or credential not found" });
    }

    res.status(200).json({ message: "Credential deleted", data: result });
  } catch (err) {
    console.error("Error in deleteCredentialInProject:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ─── GET SINGLE PROJECT BY ID WITH DECRYPTION ───────────────────────

async function getProjectById(req, res) {
  try {
    const { projectId } = req.params;

    const project = await ProjectCredential.findById(projectId);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const clean = {
      ...project.toObject(),
      credentials: project.credentials.map((cred) => ({
        ...cred.toObject(),
        password: decrypt(cred.password),
      })),
    };

    res.status(200).json({ message: "Project fetched", data: clean });
  } catch (err) {
    console.error("Error in getProjectById:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
//
// ─── GET CREDENTIAL BY ID WITH DECRYPTION ───────────────────────────
async function getCredentialById(req, res) {
  try {
    const { projectId, credentialId } = req.params;

    // Validate IDs
    if (
      !mongoose.Types.ObjectId.isValid(projectId) ||
      !mongoose.Types.ObjectId.isValid(credentialId)
    ) {
      return res
        .status(400)
        .json({ error: "Invalid projectId or credentialId" });
    }

    // Fetch the project
    const project = await ProjectCredential.findById(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    // Find the credential inside the array
    const cred = project.credentials.id(credentialId);
    if (!cred) return res.status(404).json({ error: "Credential not found" });

    // Decrypt password
    const result = {
      ...cred.toObject(),
      password: decrypt(cred.password),
    };

    res.status(200).json({ message: "Credential fetched", data: result });
  } catch (err) {
    console.error("Error in getCredentialById:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ─── UPDATE ONLY ONE CREDENTIAL FROM A PROJECT ─────────────────────────────

async function updateSingleCredential(req, res) {
  try {
    const { projectId, credentialId } = req.params;
    const { title, email, password, description } = req.body;

    if (
      !mongoose.Types.ObjectId.isValid(projectId) ||
      !mongoose.Types.ObjectId.isValid(credentialId)
    ) {
      return res.status(400).json({ error: "Invalid IDs" });
    }

    const project = await ProjectCredential.findById(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const cred = project.credentials.id(credentialId);
    if (!cred) return res.status(404).json({ error: "Credential not found" });

    // Only update provided fields
    if (title) cred.title = title;
    if (email) cred.email = email;
    if (password) cred.password = encrypt(password);
    if (description) cred.description = description;

    await project.save();

    const decrypted = {
      ...cred.toObject(),
      password: decrypt(cred.password),
    };

    res.status(200).json({ message: "Credential updated", data: decrypted });
  } catch (err) {
    console.error("Error in updateSingleCredential:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ─── DELETE A WHOLE PROJECT ───────────

async function deleteProjectById(req, res) {
  try {
    const { projectId } = req.params;

    const deleted = await ProjectCredential.findByIdAndDelete(projectId);

    if (!deleted) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.status(200).json({ message: "Project deleted", data: deleted });
  } catch (err) {
    console.error("Error in deleteProjectById:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ─── FUNCTION TO CHECK IF CREDENTIAL IS SHARED ─────────────
function isSharedWith(sharedWith = [], employeeId, departmentId) {
  return sharedWith.some((entry) => {
    return (
      entry.type === "all" ||
      (entry.type === "user" &&
        entry.targetId?.toString() === employeeId.toString()) ||
      (entry.type === "department" &&
        entry.targetId?.toString() === departmentId.toString())
    );
  });
}

// ─── FETCH SHARED PROJECTS FOR EMPLOYEE OR DEPARTMENT ────────────────
async function fetchSharedProjects(req, res) {
  try {
    const { employeeId } = req.params;
    const { departmentId: queryDepartmentId } = req.query;

    let departmentId = queryDepartmentId;

    // If departmentId is not provided, fetch from employee
    if (!departmentId) {
      const employee = await Employee.findById(employeeId);
      if (!employee) {
        return res.status(404).json({ error: "Employee not found" });
      }
      departmentId = employee.department;
    }

    // Exclude own projects
    const projects = await ProjectCredential.find({
      employeeId: { $ne: employeeId },
      $or: [
        { "sharedWith.type": "all" },
        { "sharedWith.type": "user", "sharedWith.targetId": employeeId },
        {
          "sharedWith.type": "department",
          "sharedWith.targetId": departmentId,
        },
        { "credentials.sharedWith.type": "all" },
        {
          "credentials.sharedWith.type": "user",
          "credentials.sharedWith.targetId": employeeId,
        },
        {
          "credentials.sharedWith.type": "department",
          "credentials.sharedWith.targetId": departmentId,
        },
      ],
    });

    const filtered = projects
      .map((project) => {
        // Project-level sharing
        const isProjectShared = project.sharedWith.some(
          (entry) =>
            entry.type === "all" ||
            (entry.type === "user" &&
              entry.targetId?.toString() === employeeId.toString()) ||
            (entry.type === "department" &&
              departmentId &&
              entry.targetId?.toString() === departmentId.toString())
        );

        // Credential-level sharing
        const visibleCreds = project.credentials.filter(
          (cred) =>
            isProjectShared ||
            cred.sharedWith.some(
              (entry) =>
                entry.type === "all" ||
                (entry.type === "user" &&
                  entry.targetId?.toString() === employeeId.toString()) ||
                (entry.type === "department" &&
                  departmentId &&
                  entry.targetId?.toString() === departmentId.toString())
            )
        );

        if (isProjectShared || visibleCreds.length > 0) {
          return {
            ...project.toObject(),
            credentials: visibleCreds.map((cred) => ({
              ...cred.toObject(),
              password: decrypt(cred.password),
            })),
          };
        }

        return null;
      })
      .filter(Boolean);

    res.status(200).json({ data: filtered });
  } catch (err) {
    console.error("Error in fetchSharedProjects:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ─── UPDATE SHARING FOR A PROJECT ─────────────────────────────
async function updateProjectSharing(req, res) {
  try {
    const { projectId } = req.params;
    const { sharedWith } = req.body; // Array of share objects

    if (!Array.isArray(sharedWith)) {
      return res.status(400).json({ error: "sharedWith must be an array" });
    }

    const project = await ProjectCredential.findById(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    project.sharedWith = sharedWith;
    await project.save();

    res.status(200).json({ message: "Project sharing updated", data: project });
  } catch (err) {
    console.error("Error in updateProjectSharing:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ─── UPDATE SHARING FOR A CREDENTIAL ─────────────────────────
async function updateCredentialSharing(req, res) {
  try {
    const { projectId, credentialId } = req.params;
    const { sharedWith } = req.body; // Array of share objects

    if (!Array.isArray(sharedWith)) {
      return res.status(400).json({ error: "sharedWith must be an array" });
    }

    const project = await ProjectCredential.findById(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const cred = project.credentials.id(credentialId);
    if (!cred) return res.status(404).json({ error: "Credential not found" });

    cred.sharedWith = sharedWith;
    await project.save();

    res.status(200).json({ message: "Credential sharing updated", data: cred });
  } catch (err) {
    console.error("Error in updateCredentialSharing:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = {
  createProjectWithCredentials,
  addCredentialToProject,
  fetchMyProjects,
  fetchSharedProjects,
  updateCredentialInProject,
  deleteCredentialInProject,
  getProjectById,
  getCredentialById,
  updateSingleCredential,
  deleteProjectById,
  updateProjectSharing,
  updateCredentialSharing,
};
