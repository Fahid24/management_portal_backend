const Progress = require("../model/progressSchema");
const Certificate = require("../model/certificateSchema");
const fs = require("fs");
const Course = require("../model/courseSchema");
const puppeteer = require("puppeteer");
const path = require("path");
const ejs = require("ejs");
const QRCode = require("qrcode");
const { production } = require("../baseUrl");
const Time = require("../utils/time");

// Track lesson or quiz completion
// exports.trackProgress = async (req, res) => {
//   const { userId, courseId, lessonId, quizId } = req.body;

//   try {
//     let progress = await Progress.findOne({ userId, courseId });

//     if (!progress) {
//       progress = new Progress({ userId, courseId, completedLessons: [], completedQuizzes: [] });
//     }

//     if (lessonId && !progress.completedLessons.includes(lessonId)) {
//       progress.completedLessons.push(lessonId);
//     }

//     if (quizId && !progress.completedQuizzes.includes(quizId)) {
//       progress.completedQuizzes.push(quizId);
//     }

//     await progress.save();
//     res.status(200).json(progress);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// exports.trackProgress = async (req, res) => {
//     const { userId, courseId, lessonId, quizId, currentModuleId, answers  } = req.body;

//   try {
//     let progress = await Progress.findOne({ userId, courseId });

//     if (!progress) {
//       progress = new Progress({
//         userId,
//         courseId,
//         completedLessons: [],
//         completedQuizzes: [],
//         quizAnswers:{},
//         currentModuleId
//       });
//     }

//     if (lessonId && !progress.completedLessons.includes(lessonId)) {
//       progress.completedLessons.push(lessonId);
//     }

//     if (quizId && !progress.completedQuizzes.includes(quizId)) {
//       progress.completedQuizzes.push(quizId);
//     }

//     if (quizId && answers) {
//       progress.quizAnswers.set(quizId, answers);
//     }

//     if (currentModuleId) {
//       progress.currentModuleId = currentModuleId;
//     }

//     await progress.save();
//     res.status(200).json(progress);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

exports.trackProgress = async (req, res) => {
  const {
    userId,
    courseId,
    lessonId,
    quizId,
    currentModuleId,
    answers,
    leftLessonId,
  } = req.body;

  try {
    let progress = await Progress.findOne({ userId, courseId });

    if (!progress) {
      progress = new Progress({
        userId,
        courseId,
        completedLessons: [],
        completedQuizzes: [],
        quizAnswers: {},
        currentModuleId: currentModuleId || null,
        leftLessonId: leftLessonId || null,
      });
    }

    // Add lessonId if provided and not already completed
    if (lessonId && !progress.completedLessons.includes(lessonId)) {
      progress.completedLessons.push(lessonId);
    }

    // Add quizId if provided and not already completed
    if (quizId && !progress.completedQuizzes.includes(quizId)) {
      progress.completedQuizzes.push(quizId);
    }

    // console.log("Answers:", answers);
    // console.log("Quiz ID:", quizId);

    // Store quiz answers if provided
    if (quizId && answers) {
      // Ensure quizAnswers is initialized
      // console.log("Updating quiz answers for quizId:", quizId);
      // console.log("Answers to save:", answers);
      if (!progress.quizAnswers) progress.quizAnswers = {};
      // Handle both Map and plain object
      if (typeof progress.quizAnswers.set === 'function') {
        progress.quizAnswers.set(quizId, answers);
      } else {
        progress.quizAnswers[quizId] = answers;
      }
      // console.log("Updated quizAnswers:", progress.quizAnswers);

    }

    // Update currentModuleId if provided
    if (currentModuleId) {
      progress.currentModuleId = currentModuleId;
    }

    // Update leftLessonId if provided
    if (leftLessonId) {
      progress.leftLessonId = leftLessonId;
    }

    await progress.save();
    res.status(200).json(progress);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get a specific user's progress on a course
exports.getUserProgress = async (req, res) => {
  const { userId, courseId } = req.params;

  try {
    const progress = await Progress.findOne({ userId, courseId });
    res.json(progress || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Admin: get all user progress for a course
exports.getCourseProgress = async (req, res) => {
  try {
    const progressList = await Progress.find({
      courseId: req.params.courseId,
    }).populate("userId", "firstName lastName email");
    res.json(progressList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.generateCertificate = async (req, res) => {
  const { userId, courseId } = req.body;

  try {
    // Populate userId to get firstName and lastName
    const progress = await Progress.findOne({ userId, courseId }).populate(
      "userId",
      "firstName lastName"
    );

    if (!progress) {
      return res
        .status(404)
        .json({ error: "Progress not found for this user and course" });
    }

    // Check if all lessons and quizzes are completed
    const course = await Course.findById(courseId);

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    const totalLessons = course.modules.reduce(
      (sum, m) => sum + m.lessons.length,
      0
    );
    const totalQuizzes = course.modules.filter(
      (m) => m.quiz && m.quiz.questions.length > 0
    ).length;
    const totalItems = totalLessons + totalQuizzes;

    const completedLessons = progress.completedLessons.length;
    const completedQuizzes = progress.completedQuizzes.length;
    const completedItems = completedLessons + completedQuizzes;

    if (completedItems < totalItems) {
      return res
        .status(400)
        .json({ error: "Not all lessons and quizzes have been completed" });
    }

    // Ensure certificates directory exists
    const certDir = "certificates";
    if (!fs.existsSync(certDir)) {
      fs.mkdirSync(certDir);
    }

    // Generate QR code (e.g., verification URL or certificate ID)
    const host = req.get('host');
    const baseUrl = (production ? "https" : "http") + "://" + host;
    // Use the correct route for verification
    const certVerifyUrl = `${baseUrl}/api/progress/certificate/verify/${userId}/${courseId}`;
    const qrCodeDataUrl = await QRCode.toDataURL(certVerifyUrl);

    // Render HTML with EJS
    const templatePath = path.join(__dirname, "certificateTemplate.html");
    const recipientName = `${progress.userId.firstName} ${progress.userId.lastName}`;
    const courseName = course.title;
    const achievementText = `has successfully completed the ${courseName} and demonstrated dedication, skill, and a commitment to excellence. This accomplishment reflects outstanding effort and achievement in all required areas of study.`;
    const signatory1Name = "Dr. Sarah Johnson";
    const signatory1Title = "Program Director";
    const signatory2Name = "Michael Chen";
    const signatory2Title = "Chief Academic Officer";
    const completionDate = new Date().toLocaleDateString();
    const certificateId = `${userId}-${courseId}`;
    const logoPath = `${baseUrl}/uploads/logo.png`; // Assuming logo is stored in public/images')}`;
    const html = await ejs.renderFile(templatePath, {
      recipientName,
      courseName,
      achievementText,
      signatory1Name,
      signatory1Title,
      signatory2Name,
      signatory2Title,
      completionDate,
      qrCodeDataUrl, // Pass QR code to template
      certificateId, // Pass certificateId to template
      logoPath // Pass absolute logo path to template
    });

    // Generate PDF from HTML using Puppeteer
    const filePath = `${certDir}/${userId}-${courseId}.pdf`;
    const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--allow-file-access-from-files"] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 60000 });
    await page.pdf({
      path: filePath,
      width: "1000px",
      height: "750px",
      printBackground: true,
      landscape: false,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    await browser.close();

    // Save certificate in the database
    const cert = new Certificate({
      userId: progress.userId,
      courseId: course._id,
      certificatePath: filePath,
      issuedAt: Time.toJSDate(Time.now())
    });
    await cert.save();
    progress.certificate = cert._id;
    await progress.save();

    res.status(200).json({
      message: "Certificate generated successfully",
      certificateId: cert._id,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getCertificate = async (req, res) => {
  const { userId, courseId } = req.params;

  try {
    const cert = await Certificate.findOne({ userId, courseId });

    if (!cert) {
      return res
        .status(404)
        .json({ error: "Certificate not found for this user and course" });
    }

    
    // Assuming certificates are served statically at /certificates
    
    const host = req.get('host');
    const baseUrl = (production ? "https" : "http") + "://" + host;
    const certRelativePath = cert.certificatePath.replace(/\\/g, '/').replace(/^.*certificates[\\/]/, 'certificates/');
    const certUrl = `${baseUrl}/${certRelativePath}`;

    res.json({ url: certUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAllCertificateByUser = async (req, res) => {
  const { userId } = req.params;

  // console.log(userId);

  try {
    const certificates = await Certificate.find({ userId }).populate(
      "courseId",
      "title"
    );

    if (!certificates || certificates.length === 0) {
      return res
        .status(404)
        .json({ error: "No certificates found for this user" });
    }

    res.json(certificates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.verifyCertificate = async (req, res) => {
  const { userId, courseId } = req.params;

  try {
    const cert = await Certificate.findOne({ userId, courseId });

    if (!cert) {
      return res
        .status(404)
        .json({ error: "Certificate not found for this user and course" });
    }

    const filePath = path.resolve(cert.certificatePath);

    // 🔑 Set headers for browser preview
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="certificate-${userId}-${courseId}.pdf"`
    );

    // ✅ Preview in browser
    res.sendFile(filePath);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};



