require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const cron = require("node-cron");
const connectDB = require("./config/db");
const authRoutes = require("./router/authRoutes");
const employeeRoutes = require("./router/employeeRoutes");
const departmentRoutes = require("./router/departmentRoutes");
const uploadRoutes = require("./router/uploadRoutes");
const attendenceRoutes = require("./router/attendenceRoutes");
const leaveRoutes = require("./router/leaveRoutes");
const projectRoutes = require("./router/projectRoutes");
const taskRoutes = require("./router/taskRoutes");
const incidentRoutes = require("./router/incidentRoutes");
const applications = require("./router/applicationsRoutes");
const courseRoutes = require("./router/courseRoutes");
const progressRoutes = require("./router/progress");
const moralRoutes = require("./router/moraleRoutes");
const jobSafetyRoutes = require("./router/jobSafetyRoutes");
const assignmentRoutes = require("./router/assignmentRoutes");
const notificationRoutes = require("./router/notificationRoutes");
const dailyTaskRoutes = require("./router/dailyTaskRoutes");
const statsRoutes = require("./router/statsRoutes");
const seederRoutes = require("./router/seederRoutes");
const emailRoutes = require("./router/emailRouters");
const eventRoutes = require("./router/eventRoutes");
const dropboxRoutes = require("./router/dropboxRoutes");
const workingDayRoutes = require("./router/workingDayControlRoutes");
const adminConfigRoutes = require("./router/adminConfigRoutes");
const { production, staging, development } = require("./baseUrl");
const { setupSocket } = require("./socket");
const birthdayScheduler = require("./jobs/birthdayScheduler");
const updateEmployeeStatusByLeave = require("./jobs/statusScheduler");
const vtrRoutes = require("./router/vtrRoutes");
const updateEventStatusAndRecur = require("./jobs/eventStatusScheduler");
const runWorkAnniversaryScheduler = require("./jobs/workAnniversaryScheduler");
const runAutoCheckoutScheduler = require("./jobs/autoCheckoutScheduler");
const runWeekendScheduler = require("./jobs/weekendScheduler");
const passmanagerRoutes = require("./router/passmanagerRoutes");
const shortLeaveRoutes = require("./router/shortLeaveRoutes");
const clientRevenueRoutes = require("./router/clientRevenueRoutes");
const serviceOptionRoutes = require("./router/serviceOptionRoutes");
const foodRoutes = require("./router/foodRoutes");
const vendorRoutes = require("./router/vendorRoutes");
const categoryRoutes = require("./router/categoryRoutes");
const typeRoutes = require("./router/typeRoutes");
const requisitionRoutes = require("./router/requisitionRoutes");
const productRoutes = require("./router/productRoutes");
const inventoryRoutes = require("./router/inventoryRoutes");
const expenseRoutes = require("./router/expenseRoutes");
const Time = require("./utils/time");
const { createFoodRecordForMealType } = require("./jobs/autoCreatedFoodRecord");
const {companyName} = require("./constant/companyInfo");
const app = express();
const PORT = process.env.PORT || 5001;

const server = http.createServer(app);

/* ---------- database ---------- */
connectDB();

/* ---------- middleware ---------- */
app.use(cors());
app.use(express.json());

// Serving static files from the uploads folder directly
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// Serve certificates statically
app.use("/certificates", express.static(path.join(__dirname, "certificates")));

/* ---------- routes ---------- */
app.use("/api/auth", authRoutes);
app.use("/api/employee", employeeRoutes);
app.use("/api/department", departmentRoutes);
app.use("/api/attendence", attendenceRoutes);
app.use("/api/leave", leaveRoutes);
app.use("/api/project", projectRoutes);
app.use("/api/task", taskRoutes);
app.use("/api/incident", incidentRoutes);
app.use("/api/applications", applications);
app.use("/api/lms", courseRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/morale", moralRoutes);
app.use("/api/job-safety", jobSafetyRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/vtr", vtrRoutes);
app.use("/api/password-manager", passmanagerRoutes);
// Route for uploads
app.use("/api/upload", uploadRoutes);
app.use("/api/notification", notificationRoutes);
app.use("/api/daily-task", dailyTaskRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/seeder", seederRoutes);
app.use("/api/emails", emailRoutes);
app.use("/api/working-day", workingDayRoutes);
app.use("/api/admin/config", adminConfigRoutes);
app.use("/api/dropbox", dropboxRoutes);
app.use("/api/short-leave", shortLeaveRoutes);
app.use("/api/client-revenue", clientRevenueRoutes);
app.use("/api/service-options", serviceOptionRoutes);
app.use("/api/food", foodRoutes);
app.use("/api/vendor", vendorRoutes);
app.use("/api/category", categoryRoutes);
app.use("/api/type", typeRoutes);
app.use("/api/requisition", requisitionRoutes);
app.use("/api/product", productRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/expense", expenseRoutes);

cron.schedule("*/5 * * * *", async () => {
  const now = Time.now();
  if (now.hour === 0 && now.minute === 0) {
    await runWorkAnniversaryScheduler();
    await birthdayScheduler();
    await updateEmployeeStatusByLeave();
    await updateEventStatusAndRecur();
    await runAutoCheckoutScheduler((processAllRecords = true));
    await runWeekendScheduler();
    // food crone job
    await createFoodRecordForMealType("lunch");
    await createFoodRecordForMealType("evening_snacks");
  }
});

app.get("/", (req, res) => res.send("${companyName} network is running…"));

/* ---------- socket setup ---------- */
setupSocket(server);

/* ---------- server ---------- */
server.listen(PORT, () => console.log(`🚀  Server listening on port ${PORT}`));
