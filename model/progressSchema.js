// const mongoose = require("mongoose");

// const progressSchema = new mongoose.Schema({
//     userId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
//     courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course" },
//     completedLessons: [{ type: String }],
//     completedQuizzes: [{ type: String }],
//   },
//   {
//     timestamps: true,
//   });

//   module.exports = mongoose.model("Progress", progressSchema);


const mongoose = require("mongoose");

const progressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course" },
  completedLessons: [String], // lesson IDs
  completedQuizzes: [String], // module IDs
  // quizAnswers: {
  //   type: Map,
  //   of: new mongoose.Schema({
  //     questionId: String,
  //     answer: String,
  //   }, { _id: false }),
  //   default: {}
  // },
  approvedCertificate: {
    type: Boolean,
    default: false
  },
  quizAnswers: {
    type: Map,
    of: Object, // <-- Accepts { [questionId]: answer }
    default: {}
  },
  // left of which lesson
  leftLessonId: { type: String }, // <-- NEW: to track where the user left off
  currentModuleId: { type: String }, // <-- NEW: to track where the user left off
  enrolledAt: { type: Date, default: Date.now },
  certificate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Certificate",
    default: null // <-- NEW: to track if the user has a certificate
  },
},
  {
    timestamps: true,
  });

module.exports = mongoose.model("Progress", progressSchema);

