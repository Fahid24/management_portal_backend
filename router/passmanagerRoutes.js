const express = require("express");
const router = express.Router();
const {
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
} = require("../controller/passmanagerController");

// ───── PROJECT-BASED PASSWORD MANAGER ROUTES ─────

// Create a new project with initial credentials
router.post("/project", createProjectWithCredentials);

// Add a new credential to an existing project
router.put("/project/:projectId/add-credential", addCredentialToProject);

// Get a single project (with decrypted credentials)
router.get("/project/:projectId", getProjectById);

// Update a specific credential inside a project
router.put(
  "/project/:projectId/credential/:credentialId",
  updateCredentialInProject
);

// Delete a specific credential from a project
router.delete(
  "/project/:projectId/credential/:credentialId",
  deleteCredentialInProject
);
// Get a specific credential by its ID within a project
router.get("/project/:projectId/credential/:credentialId", getCredentialById);

// Update a single credential by its ID within a project
router.put(
  "/project/:projectId/credential/:credentialId/update",
  updateSingleCredential
);

// Delete a whole project by its ID
router.delete("/project/:projectId", deleteProjectById);

// Update sharing for a project
router.put("/project/:projectId/share", updateProjectSharing);

// Update sharing for a credential
router.put(
  "/project/:projectId/credential/:credentialId/share",
  updateCredentialSharing
);

// Fetch all projects created by the employee
router.get("/my/:employeeId", fetchMyProjects);
// Fetch all projects shared with the employee
router.get("/shared/:employeeId", fetchSharedProjects);

module.exports = router;
