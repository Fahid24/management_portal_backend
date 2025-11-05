const express = require("express");
const multer = require("multer");
const path = require("path");
const router = express.Router();
const fs = require("fs");
const { production } = require("../baseUrl");

const uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Set up multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const nameWithoutExt = path
      .parse(file.originalname)
      .name.replace(/\s+/g, "-");

    const timestamp = Date.now().toString().slice(-6);
    const ext = path.extname(file.originalname);
    const finalName = `${nameWithoutExt}-${timestamp}${ext}`;
    cb(null, finalName);
  },
});

const upload = multer({ storage });

// GET /api/upload - Get all uploaded files
router.get("/", (req, res) => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: "Failed to read uploads directory" });
    }

    const fileDetails = files.map(filename => {
      const filePath = path.join(uploadDir, filename);
      const stats = fs.statSync(filePath);
      const fileUrl = `${production ? "https" : "http"}://${req.get("host")}/uploads/${filename}`;

      return {
        filename,
        fileUrl,
        size: stats.size,
        createdAt: stats.birthtime,
        lastModified: stats.mtime,
        type: path.extname(filename).slice(1) // Get file extension without the dot
      };
    });

    res.json({
      message: "Files retrieved successfully",
      count: fileDetails.length,
      files: fileDetails
    });
  });
});

// POST /api/upload
router.post("/", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  const fileUrl = `${production ? "https" : "http"}://${req.get("host")}/uploads/${
    req.file.filename
  }`;

  res.json({ message: "File uploaded successfully", fileUrl });
});

router.delete("/", (req, res) => {
  const { filename } = req.query;

  if (!filename) {
    return res.status(400).json({ error: "Filename is required" });
  }

  const filePath = path.join(__dirname, "..", "uploads", filename);

  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).json({ error: "File not found" });
    }

    fs.unlink(filePath, (err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to delete file" });
      }
      res.json({ message: "File deleted successfully" });
    });
  });
});

module.exports = router;
