const express = require("express");
const router = express.Router();

const {
  createDropboxEntry,
  updateDropboxEntry,
  deleteDropboxEntry,
  getDocumentsByEmployee,
  getDropboxById,
  deleteSingleFileFromDropbox,
  shareDropboxEntry,
  getDocumentsSharedWithMe,
  updateSharedWithList,
} = require("../controller/dropboxController");

// ───────────────────────────────────────
// Create & Update Dropbox Entries
router.post("/", createDropboxEntry);
router.put("/:id", updateDropboxEntry);

// Delete Dropbox Entry or Individual File
router.delete("/:id", deleteDropboxEntry);
router.delete("/:dropboxId/file/:fileId", deleteSingleFileFromDropbox);

// Fetch Dropbox Entries
// router.get("/employee/:employeeId", getDocumentsByEmployee);
// router.get("/:id", getDropboxById);

// Sharing Routes
router.put("/:id/share", shareDropboxEntry); // Add sharedWith entries
router.get("/shared-with-me", getDocumentsSharedWithMe); // View what's shared with user

router.get("/shared-with-me", getDocumentsSharedWithMe);

// Fetch Dropbox Entries
// 👉 Dynamic routes after
router.get("/:id", getDropboxById);
router.get("/employee/:employeeId", getDocumentsByEmployee);

router.put("/:dropboxId/shared-with-update", updateSharedWithList);

// ───────────────────────────────────────
module.exports = router;
