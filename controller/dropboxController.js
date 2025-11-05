const Dropbox = require("../model/dropboxSchema");
const Employee = require("../model/employeeSchema");
const fs = require("fs");
const path = require("path");

// Helper to delete file from disk
const deleteFileFromDisk = async (fileUrl) => {
  try {
    const filename = path.basename(fileUrl);
    const filePath = path.join(__dirname, "..", "uploads", filename);

    // Check if file exists before attempting to delete
    fs.access(filePath, fs.constants.F_OK, (err) => {
      if (err) {
        console.warn("File not found:", filename);
        return;
      }

      // Delete the file
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) {
          console.warn("Could not delete file:", filename, unlinkErr.message);
        } else {
          console.log("Deleted:", filename);
        }
      });
    });
  } catch (err) {
    console.warn("Error in deleteFileFromDisk:", err.message);
  }
};

// ✅ Create Dropbox Entry
const createDropboxEntry = async (req, res) => {
  try {
    const { employeeId, docName, files } = req.body;

    if (
      !employeeId ||
      !docName ||
      !Array.isArray(files) ||
      files.length === 0
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const employee = await Employee.findById(employeeId);
    if (!employee) return res.status(404).json({ error: "Employee not found" });

    // Assign custom _id (incremental)
    const numberedFiles = files.map((file, index) => ({
      _id: index + 1,
      fileUrl: file.fileUrl,
      docType: file.docType || "other",
      fileSize: file.fileSize,
    }));

    const newEntry = await Dropbox.create({
      employeeId,
      docName: docName.trim(),
      files: numberedFiles,
    });

    res.status(201).json({ message: "Document group created", data: newEntry });
  } catch (err) {
    // console.error("Create Dropbox Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─────────────────────────────────────────────────────────────
// Update Dropbox Entry
const updateDropboxEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { docName, files } = req.body;

    const dropbox = await Dropbox.findById(id);
    if (!dropbox) {
      return res.status(404).json({ error: "Dropbox entry not found" });
    }

    // Update doc name
    if (typeof docName === "string" && docName.trim() !== "") {
      dropbox.docName = docName.trim();
    }

    // Update files with incremental _id
    if (Array.isArray(files)) {
      const updatedFiles = files.map((file, index) => ({
        _id: index + 1,
        fileUrl: file.fileUrl,
        docType: file.docType || "other",
        fileSize: file.fileSize,
      }));
      dropbox.files = updatedFiles;
    }

    await dropbox.save();
    res.status(200).json({
      message: "Dropbox group updated successfully",
      data: dropbox,
    });
  } catch (err) {
    // console.error("Update error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─────────────────────────────────────────────────────────────
// Delete Dropbox Entry
const deleteDropboxEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const dropbox = await Dropbox.findById(id);

    if (!dropbox) return res.status(404).json({ error: "Entry not found" });

    await Promise.all(
      dropbox.files.map((file) => deleteFileFromDisk(file.fileUrl))
    );

    await Dropbox.findByIdAndDelete(id);
    res.status(200).json({ message: "Dropbox entry and files deleted" });
  } catch (err) {
    // console.error("Delete error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─────────────────────────────────────────────────────────────
// Get Documents by Employee (with pagination, search, date)
const getDocumentsByEmployee = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { page = 1, limit = 10, search = "", startDate, endDate } = req.query;

    const skip =
      (Math.max(parseInt(page), 1) - 1) * Math.max(parseInt(limit), 1);

    const query = { employeeId };
    if (search) query.docName = { $regex: search, $options: "i" };
    if (startDate && endDate) {
      query.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const [total, docs] = await Promise.all([
      Dropbox.countDocuments(query),
      Dropbox.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
    ]);

    res.status(200).json({
      data: docs,
      pagination: {
        totalDocs: total,
        totalPages: Math.ceil(total / limit),
        currentPage: Number(page),
        limit: Number(limit),
      },
    });
  } catch (err) {
    // console.error("Get documents error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─────────────────────────────────────────────────────────────
//  Get One Dropbox by ID
const getDropboxById = async (req, res) => {
  try {
    const { id } = req.params;
    const dropboxEntry = await Dropbox.findById(id);
    if (!dropboxEntry)
      return res.status(404).json({ error: "Entry not found" });
    res.status(200).json(dropboxEntry);
  } catch (err) {
    // console.error("Get by ID error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─────────────────────────────────────────────────────────────
//  Delete Single File from Dropbox
const deleteSingleFileFromDropbox = async (req, res) => {
  const { dropboxId, fileId } = req.params;

  try {
    const dropbox = await Dropbox.findById(dropboxId);
    if (!dropbox) {
      return res.status(404).json({ error: "Dropbox entry not found" });
    }

    const numericFileId = parseInt(fileId);

    const file = dropbox.files.find((f) => f._id === numericFileId);
    if (!file) {
      // console.log(" File not found in files array");
      return res.status(404).json({ error: "File not found in Dropbox group" });
    }

    await deleteFileFromDisk(file.fileUrl);

    dropbox.files = dropbox.files.filter((f) => f._id !== numericFileId);
    await dropbox.save();

    return res.status(200).json({
      message: "File deleted successfully",
      remainingFiles: dropbox.files,
    });
  } catch (err) {
    // console.error(" Server Error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─────────────────────────────────────────────────────────────
//  Share a Dropbox Entry (Add sharedWith entries)
const shareDropboxEntry = async (req, res) => {
  const { id } = req.params;
  const { shares } = req.body; // [{ type: "user", targetId }, ...]

  try {
    const dropbox = await Dropbox.findById(id);
    if (!dropbox) return res.status(404).json({ error: "Dropbox not found" });

    const newShares = shares.filter((share) => {
      if (share.type === "all") return true;
      if (["user", "department"].includes(share.type) && share.targetId)
        return true;
      return false;
    });

    const uniqueShares = newShares.filter(
      (newShare) =>
        !dropbox.sharedWith.some(
          (existing) =>
            existing.type === newShare.type &&
            (existing.type === "all" || // for 'all', no targetId
              existing.targetId?.toString() === newShare.targetId?.toString())
        )
    );

    dropbox.sharedWith.push(
      ...uniqueShares.map((s) => ({
        type: s.type,
        targetId: s.targetId || undefined,
        sharedAt: new Date(),
      }))
    );

    await dropbox.save();

    res.status(200).json({
      message: "Dropbox shared successfully",
      sharedWith: dropbox.sharedWith,
    });
  } catch (err) {
    // console.error("Share error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

//  Get Docs Shared With Current User
//  Get Docs Shared With Current User (EXCLUDES Own Docs)
const getDocumentsSharedWithMe = async (req, res) => {
  try {
    let { userId, departmentId } = req.query;

    if (!userId && !departmentId) {
      return res.status(400).json({ error: "Missing userId or departmentId" });
    }

    const filters = [
      { "sharedWith.type": "all" },
      {
        sharedWith: {
          $elemMatch: { type: "user", targetId: userId },
        },
      },
      {
        sharedWith: {
          $elemMatch: { type: "department", targetId: departmentId },
        },
      },
    ];

    const docs = await Dropbox.find({
      $or: filters,
      employeeId: { $ne: userId }, // exclude own uploads
    }).lean();

    return res.status(200).json({ data: docs });
  } catch (err) {
    // console.error("Error in getDocumentsSharedWithMe:", err.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// Update Sharng...

const updateSharedWithList = async (req, res) => {
  try {
    const { dropboxId } = req.params; // make sure this matches the route
    const { action, type, targetId } = req.body;

    if (
      !["user", "department", "all"].includes(type) ||
      !["add", "remove"].includes(action)
    ) {
      return res.status(400).json({ error: "Invalid action or type" });
    }

    const sharedItem = { type, targetId };
    const updateQuery = {};

    if (action === "add") {
      updateQuery.$addToSet = {
        sharedWith: { ...sharedItem, sharedAt: new Date() },
      };
    } else if (action === "remove") {
      updateQuery.$pull = { sharedWith: sharedItem };
    }

    const updated = await Dropbox.findByIdAndUpdate(dropboxId, updateQuery, {
      new: true,
    });

    if (!updated) {
      return res.status(404).json({ error: "Dropbox document not found" });
    }

    res
      .status(200)
      .json({ message: `Successfully ${action}ed`, data: updated });
  } catch (error) {
    // console.error("Error in updateSharedWithList:", error);
    res.status(500).json({ error: "Server Error" });
  }
};

// ─────────────────────────────────────────────────────────────
module.exports = {
  createDropboxEntry,
  updateDropboxEntry,
  deleteDropboxEntry,
  getDocumentsByEmployee,
  getDropboxById,
  deleteSingleFileFromDropbox,
  shareDropboxEntry,
  getDocumentsSharedWithMe,
  updateSharedWithList,
};
