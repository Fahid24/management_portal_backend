const mongoose = require("mongoose");


const lessonSchema = new mongoose.Schema({
  title: String,
  type: { type: String, enum: ["video", "pdf", "article", "video_url"] },
  content: String, // URL for video/PDF or raw text for article
});

const questionSchema = new mongoose.Schema({
  question: String,
  options: [String],
  answer: String, // must match one of the options
});

const quizSchema = new mongoose.Schema({
  questions: [questionSchema],
  createdAt: { type: Date, default: Date.now },
});

const moduleSchema = new mongoose.Schema({
  title: String,
  lessons: [lessonSchema],
  quiz: quizSchema, // optional
});

const courseSchema = new mongoose.Schema({
  title: String,
  summary: String,
  description: String,
  thumbnail: String,
  departments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Department" }],
  level: String,
  language: String,
  tags: [String],
  modules: [moduleSchema],

  status: {
    type: String,
    enum: ["Draft", "Published"],
    default: "Draft"
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Course", courseSchema);
