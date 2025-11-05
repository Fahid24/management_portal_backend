const Course = require("../model/courseSchema");
const Progress = require("../model/progressSchema");
const Employee = require("../model/employeeSchema");
const Department = require("../model/departmentSchema");
const { sendNotificationToUsers } = require('../utils/sendNotificationToUsers');
const parseQueryArray = require('../utils/parseQueryArray');
const Time = require("../utils/time");

// CREATE a new course
exports.createCourse = async (req, res) => {
  try {
    const { modules = [], ...rest } = req.body;

    // Ensure quiz.createdAt is set using Luxon
    const updatedModules = modules.map((mod) => {
      if (mod.quiz) {
        return {
          ...mod,
          quiz: {
            ...mod.quiz,
            createdAt: Time.toJSDate(Time.now())
          }
        };
      }
      return mod;
    });

    const newCourse = new Course({
      ...rest,
      modules: updatedModules,
      createdBy: req.user?._id || null,
      createdAt: Time.toJSDate(Time.now()) // Luxon timestamp for course
    });
    const saved = await newCourse.save();

    // Send notification to all users in the departments (if departments exist)
    if (saved.departments && saved.departments.length > 0) {
      await sendNotificationToUsers({
        departmentIds: saved.departments.map(String),
        type: 'LMS_COURSE_ADD',
        title: `New Course Added: ${saved.title}`,
        message: `A new course "${saved.title}" has been added to LMS. Check it out!`,
        data: { courseId: saved._id }
      });
    }
    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getCourseSummary = async (req, res) => {
  try {
    // Pagination
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    const skip = (page - 1) * limit;

    // Filtering
    const filter = {};
    const departments = parseQueryArray(req.query.department);
    if (departments) filter.departments = { $in: departments };
    const statuses = parseQueryArray(req.query.status);
    if (statuses) filter.status = { $in: statuses };
    const levels = parseQueryArray(req.query.level);
    if (levels) filter.level = { $in: levels };

    if (
      req.query.search &&
      typeof req.query.search === "string" &&
      req.query.search.trim()
    ) {
      const search = req.query.search.trim();
      const regex = new RegExp(search, "i");
      filter.title = regex;
    }

    // Query with filter, pagination, and populate
    const [courses, totalDocs] = await Promise.all([
      Course.find(filter)
        .skip(skip)
        .limit(limit)
        .populate('departments'),
      Course.countDocuments(filter)
    ]);



    const allProgress = await Progress.find();

    // Per-course stats
    const response = courses.map((course) => {
      const courseProgress = allProgress.filter(
        (p) => p.courseId.toString() === course._id.toString()
      );
      const enrolledCount = courseProgress.length;

      let totalPercent = 0;
      let completedCount = 0;
      courseProgress.forEach((p) => {
        const totalLessons = course.modules.reduce(
          (sum, m) => sum + m.lessons.length,
          0
        );
        const totalQuizzes = course.modules.filter(
          (m) => m.quiz && m.quiz.questions.length > 0
        ).length;
        const totalItems = totalLessons + totalQuizzes;

        const completedItems =
          (p.completedLessons?.length || 0) + (p.completedQuizzes?.length || 0);

        const percent = totalItems ? (completedItems / totalItems) * 100 : 0;
        totalPercent += percent;
        if (percent === 100) completedCount++;
      });

      const avgCompletion = enrolledCount
        ? Math.round(totalPercent / enrolledCount)
        : 0;

      return {
        _id: course._id,
        title: course.title,
        departments: course.departments || [],
        level: course.level || "N/A",
        enrolledStudents: enrolledCount,
        completedStudents: completedCount,
        completionRate: avgCompletion,
        avgProgress: avgCompletion,
        modules: course.modules.length,
        status: course.status || "Draft",
        thumbnail: course.thumbnail,
      };
    });

    // Overall summary
    const totalCourses = totalDocs;
    const totalEnrolled = allProgress.length;
    const totalCompleted = allProgress.filter(p => {
      // Find course for this progress
      const course = courses.find(c => c._id.toString() === p.courseId.toString());
      if (!course) return false;
      const totalLessons = course.modules.reduce((sum, m) => sum + m.lessons.length, 0);
      const totalQuizzes = course.modules.filter(m => m.quiz && m.quiz.questions.length > 0).length;
      const totalItems = totalLessons + totalQuizzes;
      const completedItems = (p.completedLessons?.length || 0) + (p.completedQuizzes?.length || 0);
      return totalItems > 0 && completedItems === totalItems;
    }).length;
    const avgProgress =
      allProgress.length > 0
        ? Math.round(
          allProgress.reduce((sum, p) => {
            const course = courses.find(c => c._id.toString() === p.courseId.toString());
            if (!course) return sum;
            const totalLessons = course.modules.reduce((s, m) => s + m.lessons.length, 0);
            const totalQuizzes = course.modules.filter(m => m.quiz && m.quiz.questions.length > 0).length;
            const totalItems = totalLessons + totalQuizzes;
            const completedItems = (p.completedLessons?.length || 0) + (p.completedQuizzes?.length || 0);
            return sum + (totalItems ? (completedItems / totalItems) * 100 : 0);
          }, 0) / allProgress.length
        )
        : 0;

    // New summary fields
    const totalCompletion =
      allProgress.length > 0
        ? allProgress.reduce((sum, p) => {
          const course = courses.find(c => c._id.toString() === p.courseId.toString());
          if (!course) return sum;
          const totalLessons = course.modules.reduce((s, m) => s + m.lessons.length, 0);
          const totalQuizzes = course.modules.filter(m => m.quiz && m.quiz.questions.length > 0).length;
          const totalItems = totalLessons + totalQuizzes;
          const completedItems = (p.completedLessons?.length || 0) + (p.completedQuizzes?.length || 0);
          return sum + (totalItems ? (completedItems / totalItems) * 100 : 0);
        }, 0)
        : 0;
    const avgCompletion =
      allProgress.length > 0
        ? Math.round(totalCompletion / allProgress.length)
        : 0;

    res.json({
      summary: {
        availableCourses: totalCourses,
        completedCourses: totalCompleted,
        avgCompletion,
        totalCourses
      },
      data: response,
      pagination: {
        totalDocs,
        totalPages: Math.ceil(totalDocs / limit),
        page,
        limit
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET all courses
exports.getAllCourses = async (req, res) => {
  try {
    const courses = await Course.find().populate('departments').sort({ createdAt: -1 });
    res.json(courses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET course by ID
exports.getCourseById = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id).populate('departments');
    if (!course) return res.status(404).json({ error: "Course not found" });
    res.json(course);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// UPDATE a course
exports.updateCourse = async (req, res) => {
  try {
    const updated = await Course.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Course not found" });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// DELETE a course
exports.deleteCourse = async (req, res) => {
  try {
    const deleted = await Course.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Course not found" });
    res.json({ message: "Course deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET enrolled users and completion status
exports.getCourseProgress = async (req, res) => {
  try {
    const progressList = await Progress.find({ courseId: req.params.id }).populate("userId", "name email");
    const response = progressList.map((entry) => ({
      user: entry.userId,
      completedLessons: entry.completedLessons.length,
      completedQuizzes: entry.completedQuizzes.length,
    }));
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET courses by department ID
exports.getCoursesByDepartmentId = async (req, res) => {
  try {
    const departmentId = req.params.departmentId;
    const courses = await Course.find({ departments: departmentId }).populate('departments');
    res.json(courses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getUserCourseSummaries = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "userId is required." });
    }

    // Fetch user and role
    const user = await Employee.findById(userId).select("role department").lean();
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    let departmentIds = [];
    let courseFilter = {};

    if (user.role === "Admin") {
      courseFilter = {};
    } else if (user.role === "DepartmentHead") {
      const departments = await Department.find({ departmentHeads: userId, isDeleted: false }).select("_id");
      departmentIds = departments.map(d => d._id);
      if (!departmentIds.length) {
        return res.json({ summary: { availableCourses: 0, enrolledCourses: 0, completedCourses: 0, avgProgress: 0 }, data: [] });
      }
      courseFilter = { departments: { $in: departmentIds } };
    } else if (user.role === "Manager") {
      const departments = await Department.find({ projectManagers: userId, isDeleted: false }).select("_id");
      departmentIds = departments.map(d => d._id);
      if (!departmentIds.length) {
        return res.json({ summary: { availableCourses: 0, enrolledCourses: 0, completedCourses: 0, avgProgress: 0 }, data: [] });
      }
      courseFilter = { departments: { $in: departmentIds } };
    } else {
      if (!user.department) {
        return res.json({ summary: { availableCourses: 0, enrolledCourses: 0, completedCourses: 0, avgProgress: 0 }, data: [] });
      }
      departmentIds = Array.isArray(user.department)
        ? user.department
        : [user.department];
      courseFilter = { departments: { $in: departmentIds } };
    }

    const courses = await Course.find(courseFilter).populate("departments");
    const userProgress = await Progress.find({ userId });

    const response = courses.map((course) => {
      const progress = userProgress.find(
        (p) => p.courseId.toString() === course._id.toString()
      );

      const totalLessons = course.modules.reduce(
        (sum, m) => sum + (m.lessons?.length || 0),
        0
      );
      const totalQuizzes = course.modules.filter(
        (m) => m.quiz && m.quiz.questions?.length > 0
      ).length;
      const totalItems = totalLessons + totalQuizzes;

      const completedLessons = progress?.completedLessons?.length || 0;
      const completedQuizzes = progress?.completedQuizzes?.length || 0;
      const completedItems = completedLessons + completedQuizzes;

      const progressPercent = totalItems
        ? Math.round((completedItems / totalItems) * 100)
        : 0;

      return {
        id: course._id,
        progressId: progress?._id, // Include progress ID if exists
        title: course.title,
        description: course.summary || course.description,
        thumbnail: course.thumbnail,
        departments: course.departments.map((d) => d.name),
        level: course.level,
        language: course.language,
        modules: course.modules.length,
        totalLessons,
        completedLessons,
        progress: progressPercent,
        enrolled: !!progress,
        completed: progressPercent === 100,
        approvedCertificate: progress?.approvedCertificate || false, // Include approvedCertificate status
        progressId: progress?.certificate || null // Include certificate ID if exists
      };
    });

    // Summary for this user
    const totalCourses = courses.length;
    const availableCourses = (courses.length - userProgress.length) || 0;
    const enrolledCourses = userProgress.length;
    const completedCourses = response.filter(c => c.completed).length;
    const avgProgress = enrolledCourses
      ? Math.round(response.filter(c => c.enrolled).reduce((sum, c) => sum + c.progress, 0) / enrolledCourses)
      : 0;

    res.json({
      summary: {
        totalCourses,
        availableCourses,
        enrolledCourses,
        completedCourses,
        avgProgress
      },
      data: response
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAllCompletedUsersWithCourses = async (req, res) => {
  try {
    const { search, role, startDate, endDate, page = 1, limit = 10 } = req.query;

    // Build the base query for Progress
    const progressQuery = {};
    if (startDate || endDate) {
      progressQuery.updatedAt = {};
      if (startDate) progressQuery.updatedAt.$gte = new Date(startDate);
      if (endDate) progressQuery.updatedAt.$lte = new Date(endDate);
    }

    // First get all matching progresses
    const progresses = await Progress.find(progressQuery)
      .populate({
        path: "userId",
        select: "firstName lastName email role",
      })
      .populate({
        path: "courseId",
        select: "title summary description modules",
      })
      .populate({
        path: "certificate",
        select: "certificateNumber issuedAt", // Include certificate details if needed
      })
      .sort({ _id: -1 })
      .lean();

    // Filter in memory for better control
    const completedResults = progresses
      .filter(progress => {
        // Must have both user and course
        if (!progress.userId || !progress.courseId) return false;

        // Apply search filters
        if (search) {
          const userMatch =
            progress.userId.firstName.match(new RegExp(search, "i")) ||
            progress.userId.lastName.match(new RegExp(search, "i")) ||
            progress.userId.email.match(new RegExp(search, "i"));

          const courseMatch = progress.courseId.title.match(new RegExp(search, "i"));

          if (!userMatch && !courseMatch) return false;
        }

        // Apply role filter
        if (role && progress.userId.role !== role) return false;

        // Check completion status
        const totalLessons = progress.courseId.modules.reduce(
          (sum, mod) => sum + (mod.lessons?.length || 0), 0);
        const totalQuizzes = progress.courseId.modules.filter(
          m => m.quiz && m.quiz.questions?.length).length;
        const totalItems = totalLessons + totalQuizzes;
        const completedItems = progress.completedLessons.length + progress.completedQuizzes.length;

        return totalItems > 0 && completedItems === totalItems;
      })
      .map(progress => ({
        progressId: progress._id, // Include progress ID
        user: {
          id: progress.userId._id,
          name: `${progress.userId.firstName} ${progress.userId.lastName}`,
          email: progress.userId.email,
          role: progress.userId.role,
        },
        course: {
          id: progress.courseId._id,
          title: progress.courseId.title,
          summary: progress.courseId.summary || progress.courseId.description,
        },
        completedAt: progress.updatedAt,
        approvedCertificate: progress.approvedCertificate || false, // Include approved status
        certificate: progress.certificate || null, // Include certificate details if exists
        certificateDetails: progress.certificate ? {
          id: progress.certificate._id,
          certificateNumber: progress.certificate.certificateNumber,
          issuedAt: progress.certificate.issuedAt
        } : null
      }));

    // Pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const paginatedData = completedResults.slice(startIndex, startIndex + parseInt(limit));

    res.json({
      count: completedResults.length,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(completedResults.length / parseInt(limit)),
      data: paginatedData,
    });

  } catch (err) {
    console.error("Error in getAllCompletedUsersWithCourses:", err);
    res.status(500).json({ error: "Internal server error", message: err.message });
  }
};

exports.updateCertificateApproval = async (req, res) => {
  try {
    const { progressId } = req.params;
    const { approvedCertificate } = req.body;

    // Validate input
    if (!progressId) {
      return res.status(400).json({
        success: false,
        error: "Progress ID is required"
      });
    }

    if (typeof approvedCertificate !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: "approvedCertificate must be a boolean value (true/false)"
      });
    }

    // Find the progress record first to check completion status
    const progress = await Progress.findById(progressId)
      .populate('courseId', 'title modules')
      .populate('userId', 'firstName lastName');

    if (!progress) {
      return res.status(404).json({
        success: false,
        error: "Progress record not found"
      });
    }

    // Check if the course is actually completed
    const totalLessons = progress.courseId.modules.reduce(
      (sum, mod) => sum + (mod.lessons?.length || 0), 0);
    const totalQuizzes = progress.courseId.modules.filter(
      m => m.quiz && m.quiz.questions?.length).length;
    const totalItems = totalLessons + totalQuizzes;
    const completedItems = progress.completedLessons.length + progress.completedQuizzes.length;

    if (totalItems === 0 || completedItems !== totalItems) {
      return res.status(400).json({
        success: false,
        error: "Cannot update certificate approval - course not fully completed",
        completed: false
      });
    }

    // Update the progress record
    const updatedProgress = await Progress.findByIdAndUpdate(
      progressId,
      { approvedCertificate },
      { new: true, runValidators: true }
    )
      .populate('userId', 'firstName lastName email role')
      .populate('courseId', 'title summary')
      .populate('certificate');

    // Prepare success response
    const response = {
      success: true,
      message: approvedCertificate
        ? "Certificate approval status updated to APPROVED successfully"
        : "Certificate approval status updated to NOT APPROVED successfully",
      data: {
        progressId: updatedProgress._id,
        user: {
          id: updatedProgress.userId._id,
          name: `${updatedProgress.userId.firstName} ${updatedProgress.userId.lastName}`,
          email: updatedProgress.userId.email,
          role: updatedProgress.userId.role,
        },
        course: {
          id: updatedProgress.courseId._id,
          title: updatedProgress.courseId.title,
          summary: updatedProgress.courseId.summary,
        },
        approvedCertificate: updatedProgress.approvedCertificate,
        certificate: updatedProgress.certificate || null,
        updatedAt: updatedProgress.updatedAt
      }
    };

    res.json(response);

  } catch (err) {
    console.error("Error in updateCertificateApproval:", err);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: err.message
    });
  }
};