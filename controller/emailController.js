const emailSchema = require("../model/emailSchema");
const nodemailer = require("nodemailer");
const fs = require("fs"); // Import fs to handle file deletion
const path = require("path");
const { production, staging } = require("../baseUrl");
const Time = require("../utils/time");
const mongoose = require("mongoose");
const sendEmailUtil = require("../utils/emailService");
const { extractAndReplaceBase64Images } = require("../utils/base64ToImageConverter");
const EmailTemplate = require("../model/emailTemplateSchema");
const TemplateCategory = require("../model/TemplateCategorySchema");
const Employee = require("../model/employeeSchema");
const ClientInfo = require("../model/clientFormModel");
const {emailHost} = require("../constant/companyInfo");

const getEmails = async (req, res) => {
    try {
        const {
            search,
            startDate,
            endDate,
            status,
            page = 1,
            limit = 10,
        } = req.query;

        // Validate and format dates using Luxon
        const formattedStartDate = Time.fromISO(startDate);
        const formattedEndDate = Time.fromISO(endDate);
        // Search by 'to', 'subject', or 'error' if the 'search' query is provided
        let searchQuery = {};
        if (search) {
            searchQuery = {
                $or: [
                    { to: { $regex: search, $options: "i" } },
                    { subject: { $regex: search, $options: "i" } },
                    { error: { $regex: search, $options: "i" } },
                ],
            };
        }

        // Add status filtering if provided
        if (status) {
            if (status.toLowerCase() === 'trash') {
                // Only show trash emails
                searchQuery.status = 'trash';
            } else {
                // For any other status (including 'all'), exclude trash emails
                searchQuery.status = { $ne: 'trash' };

                // If a specific status is selected (not 'all'), add that filter
                if (status.toLowerCase() !== 'all') {
                    searchQuery.status = status.toLowerCase();
                }
            }
        } else {
            // Default case when no status is provided - exclude trash
            searchQuery.status = { $ne: 'trash' };
        }

        // Handle date range filtering with validation
        if (startDate && endDate) {
            // Validate if both dates are in a valid format
            if (formattedStartDate.isValid() && formattedEndDate.isValid()) {
                searchQuery.date = {
                    $gte: formattedStartDate.startOf("day").toJSDate(), // Set to midnight
                    $lte: formattedEndDate.endOf("day").toJSDate(), // Set to 23:59:59.999
                };
            } else {
                return res.status(400).json({ error: "Invalid date format provided" });
            }
        } else if (startDate) {
            // Handle case where only startDate is provided
            //   const formattedStartDate = moment(startDate, "YYYY-MM-DD", true);
            if (formattedStartDate.isValid()) {
                searchQuery.date = { $gte: formattedStartDate.startOf("day").toJSDate() };
            } else {
                return res.status(400).json({ error: "Invalid start date format" });
            }
        } else if (endDate) {
            // Handle case where only endDate is provided
            //   const formattedEndDate = moment(endDate, "YYYY-MM-DD", true);
            if (formattedEndDate.isValid()) {
                searchQuery.date = { $lte: formattedEndDate.endOf("day").toJSDate() };
            } else {
                return res.status(400).json({ error: "Invalid end date format" });
            }
        }

        // Paginate results
        const emails = await emailSchema
            .find(searchQuery)
            .skip((page - 1) * limit)
            .limit(limit)
            .sort({ _id: -1 })
            .exec();
        // Get total count for pagination
        const totalCount = await emailSchema.countDocuments(searchQuery);

        // Respond with the emails and pagination data
        res.status(200).json({
            emails,
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: page,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


const getEmailById = async (req, res) => {
    try {
        const email = await emailSchema.findById(req.params.id);
        if (!email) return res.status(404).json({ error: "Email not found" });
        res.status(200).json(email);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


const resendEmail = async (req, res) => {
    const { id, userId, userModel } = req.body;
    const email = await emailSchema.findById(id);
    try {
        if (!email) return res.status(404).json({ error: "Email not found" });

        const invoicesDirectory = path.join(__dirname, "../utils/documents");
        if (!fs.existsSync(invoicesDirectory)) {
            fs.mkdirSync(invoicesDirectory, { recursive: true });
        }

        let attachmentPath = ""; // Default to an empty string
        if (email?.fileName) {
            attachmentPath = path.join(invoicesDirectory, email?.fileName);
        }

        let transporter;
        if (production || staging) {
            transporter = nodemailer.createTransport({
              host: emailHost, // SMTP server for Gmail
              port: 465, // Port for SSL
              secure: true,
            //service: "gmail",
              auth: {
                user: process.env.MAIL_USER, // Replace with your Gmail address
                pass: process.env.MAIL_PASS, // Replace with your Gmail app password
              },
              tls: {
                rejectUnauthorized: false, // Temporarily allow connection issues for debugging
              },
            });
        } else {
            transporter = nodemailer.createTransport({
              host: emailHost, // SMTP server for Gmail
              port: 465, // Port for SSL
              secure: true,
            //service: "gmail",
              auth: {
                user: "fahidhasanfuad20018@gmail.com", // Replace with your Gmail address
                pass: "cislzivpyqaxnqrs", // Replace with your Gmail app password
              },
              tls: {
                rejectUnauthorized: false, // Temporarily allow connection issues for debugging
              },
            });
        }
        const mailOptions = {
          from:
            production || staging
              ? process.env.MAIL_USER
              : "fahidhasanfuad20018@gmail.com",
          to: email.to,
          subject: email.subject,
          text: `Troublynx's Team`,
          html: email.body,
        };
        // Include the attachment only if attachmentPath is provided
        if (attachmentPath) {
            mailOptions.attachments = [
                {
                    filename: `ODL-${email?.fileName}.pdf`,
                    path: attachmentPath,
                },
            ];
        }

        await transporter.sendMail(mailOptions);

        email.status = "sent";
        email.error = "";
        await email.save();

        res.status(200).json({ message: "Email resent successfully", email });
    } catch (error) {
        email.status = "failed";
        email.error = error.message;
        await email.save();

        res.status(500)
            .json({ error: "Failed to resend email", details: error.message });
    }
};


const deleteEmail = async (req, res) => {
    try {
        const id = req.params.id;
        if (!id) {
            return res.status(400).json({ error: "Email ID is required" });
        }
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid email ID" });
        }
        const email = await emailSchema.findByIdAndDelete(id);
        if (!email) return res.status(404).json({ error: "Email not found" });

        return res.status(200).json({ message: "Email deleted successfully" });
    } catch (error) {
        console.error("Error deleting email:", error);
        return res.status(500).json({ details: "Internal Server Error", error: error.message });
    }
};

const resendAllEmails = async (req, res) => {

    const { emailIds, id, userId, userModel } = req.body;
    if (!emailIds || !Array.isArray(emailIds)) {
        return res
            .status(400)
            .json({ error: "Invalid or missing emailIds array." });
    }

    let transporter;
    if (production || staging) {
        transporter = nodemailer.createTransport({
          host: emailHost, // SMTP server for Gmail
          port: 465, // Port for SSL
          secure: true,
        //   service: "gmail",
          auth: {
            user: process.env.MAIL_USER, // Replace with your Gmail address
            pass: process.env.MAIL_PASS, // Replace with your Gmail app password
          },
          tls: {
            rejectUnauthorized: false, // Temporarily allow connection issues for debugging
          },
        });
    } else {
        transporter = nodemailer.createTransport({
          host: emailHost, // SMTP server for Gmail
          port: 465, // Port for SSL
          secure: true,
        //   service: "gmail",
          auth: {
            user: "fahidhasanfuad20018@gmail.com", // Replace with your Gmail address
            pass: "cislzivpyqaxnqrs", // Replace with your Gmail app password
          },
          tls: {
            rejectUnauthorized: false, // Temporarily allow connection issues for debugging
          },
        });
    }

    try {
        const emails = await emailSchema.find({ _id: { $in: emailIds } });

        if (!emails || emails.length === 0) {
            return res
                .status(404)
                .json({ error: "No emails found for the provided IDs." });
        }

        const results = [];
        for (const email of emails) {
            try {
                const invoicesDirectory = path.join(__dirname, "../utils/invoices");
                if (!fs.existsSync(invoicesDirectory)) {
                    fs.mkdirSync(invoicesDirectory, { recursive: true });
                }

                let attachmentPath = ""; // Default to an empty string
                if (email?.fileName) {
                    attachmentPath = path.join(invoicesDirectory, email?.fileName);
                }

                const mailOptions = {
                  from:
                    production || staging
                      ? "admin.portal@yopmail.com.com"
                      : "fahidhasanfuad20018@gmail.com",
                  to: email.to,
                  subject: email.subject,
                  text: `Troublynx Team`,
                  html: email.body,
                };
                // Include the attachment only if attachmentPath is provided
                if (attachmentPath) {
                    mailOptions.attachments = [
                        {
                            filename: `OMD-${email?.fileName}.pdf`,
                            path: attachmentPath,
                        },
                    ];
                }

                await transporter.sendMail(mailOptions);

                email.status = "sent";
                email.error = "";
                await email.save();

                results.push({
                    _id: email._id,
                    status: "sent",
                    to: email.to,
                    subject: email.subject,
                });
            } catch (error) {
                email.status = "failed";
                email.error = error.message;
                await email.save();
                results.push({
                    _id: email._id,
                    status: "failed",
                    error: error.message,
                });
            }
        }
        const emailDetails = results
            .map(
                (email) =>
                    `To: ${email.to}, Subject: ${email.subject}, Status: ${email.status}`
            )
            .join(" <br> ");

        // addLog("Resend Emails", userId, `Resend Emails Summary: <br> ${emailDetails}.`, userModel);

        res.status(200).json({
            message: "Emails processed.",
            results,
        });
    } catch (error) {
        console.error("Error processing emails:", error.message);
        res.status(500).json({ error: "Server error while processing emails." });
    }
};
const sendEmail = async (req, res) => {
    const { to, subject, body, userId, userModel } = req.body;

    try {
        if (!to || !subject || !body) {
            return res.status(400).json({ error: "Missing 'to', 'subject', or 'body' in request" });
        }

        sendEmailUtil(to, subject, body);

        // Optionally, log if you want
        // addLog(
        //     "Send Email",
        //     userId,
        //     `Email: To: ${to}, Subject: ${subject}, Status: sent.`,
        //     "User"
        // );

        res.status(200).json({ message: "Email sent successfully" });
    } catch (error) {
        // addLog(
        //     "Failed to Send Email",
        //     userId,
        //     `Email Summary: <br> To: ${to}, Subject: ${subject}, Status: failed, Error: ${error.message}.`,
        //     "User"
        // );

        res.status(500).json({ error: "Failed to send email", details: error.message });
    }
};

function extractPlaceholders(htmlContent) {
    const regex = /\$(\w+)/g; // Match words with a $ prefix
    const matches = [...htmlContent.matchAll(regex)];
    return matches.map(match => match[0]); // Return an array with "$variable" format
}

async function createEmailTemplate(req, res) {
    const { subject, body, title, type, des, category, userId, userModel } = req.body;

    if (!body) return res.status(400).json({ error: 'Email body is required.' });
    if (!title) return res.status(400).json({ error: 'Email title is required.' });
    if (!subject) return res.status(400).json({ error: 'Email subject is required.' });
    if (type && !['built-in', 'custom'].includes(type)) {
        return res.status(400).json({ error: 'Invalid type. Must be either "built-in" or "custom".' });
    }

    const updatedBody = extractAndReplaceBase64Images(body);

    const placeholders = extractPlaceholders(updatedBody);

    try {
        let newTemplate = new EmailTemplate({ subject, body: updatedBody, placeholders, title, type: type ? type : 'custom', des });
        if (category && mongoose.Types.ObjectId.isValid(category)) {
            newTemplate.category = category;
        }
        await newTemplate.save();
        // addLog(
        //   "Create Email Template",
        //   userId,
        //   `Create Email Template:  <br> Title: ${title} <br> Subject: ${subject} <br> Body: ${updatedBody}.`,
        //   userModel
        // );
        res.status(201).json(newTemplate);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

async function getEmailTemplates(req, res) {
    try {
        const { search, type, category } = req.query;

        const query = {};

        // Search by title or subject (optional)
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { subject: { $regex: search, $options: 'i' } },
            ];
        }

        // Filter by type
        if (type && ['built-in', 'custom'].includes(type)) {
            query.type = type;
        } else if (type && type !== 'all') {
            return res
                .status(400)
                .json({ error: 'Invalid type. Must be either "built-in" or "custom".' });
        }

        // Filter by category ObjectId (optional)
        if (category) {
            if (!mongoose.Types.ObjectId.isValid(category)) {
                return res.status(400).json({ error: 'Invalid category ID' });
            }
            query.category = category;
        }

        // Fetch templates with populated category
        const templates = await EmailTemplate.find(query)
            .populate('category', 'name description') // Optional: limit category fields
            .sort({ title: 1 });

        res.status(200).json(templates);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
async function getEmailTemplateById(req, res) {
    const { id } = req.params;
    try {
        const template = await EmailTemplate.findById(id);
        if (!template) return res.status(404).json({ error: 'Template not found.' });
        res.status(200).json(template);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

function findMissingPlaceholders(existingPlaceholders, newPlaceholders) {
    return existingPlaceholders.filter(placeholder => !newPlaceholders.includes(placeholder));
}

async function updateEmailTemplate(req, res) {
    const { id } = req.params;
    const { title, subject, body, type, userId, des, userModel, category } = req.body;

    if (!body) return res.status(400).json({ error: 'Email body is required.' });
    if (!title) return res.status(400).json({ error: 'Email title is required.' });
    if (!subject) return res.status(400).json({ error: 'Email subject is required.' });
    if (type && !['built-in', 'custom'].includes(type)) {
        return res.status(400).json({ error: 'Invalid type. Must be either "built-in" or "custom".' });
    }

    // Step 1: Extract base64 images and replace them in the new body
    const newBody = extractAndReplaceBase64Images(body);

    try {
        // Step 2: Find the existing template by ID
        const existingTemplate = await EmailTemplate.findById(id);
        if (!existingTemplate) return res.status(404).json({ error: 'Template not found.' });

        // Step 3: Retrieve the existing placeholders (tags) from the database
        const existingPlaceholders = existingTemplate.placeholders;

        // Step 4: Extract the placeholders from the new body
        const newPlaceholders = extractPlaceholders(newBody);

        // Step 5: Compare the existing placeholders with the new placeholders
        const missingPlaceholders = findMissingPlaceholders(existingPlaceholders, newPlaceholders);

        // If there are any missing placeholders, return them in the error message
        if (missingPlaceholders.length > 0) {
            return res.status(400).json({
                error: `The following placeholders are missing in the email template: ${missingPlaceholders.join(', ')}`,
            });
        }

        // Step 6: Proceed to update the email template
        const updated = await EmailTemplate.findByIdAndUpdate(
            id,
            { subject, title, body: newBody, type, des },
            { new: true, runValidators: true }
        );

        if (category && mongoose.Types.ObjectId.isValid(category)) {
            updated.category = category;
            await updated.save();
        }


        if (!updated) return res.status(404).json({ error: 'Template not found.' });

        // Step 7: Log the update
        // addLog(
        //   "Update Email Template",
        //   userId,
        //   `Update Email Template:  <br> Title: ${title} <br> Subject: ${subject} <br> Body: ${newBody}.`,
        //   userModel
        // );
        res.status(200).json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

async function deleteEmailTemplate(req, res) {
    const { id } = req.params;
    const { userId, userModel } = req.query;
    try {
        const deleted = await EmailTemplate.findByIdAndDelete(id);
        if (!deleted) return res.status(404).json({ error: 'Template not found.' });
        // addLog(
        //   "Delete Email Template",
        //   userId,
        //   `Delete Email Template: <br> Subject: ${deleted.subject}, Header: ${deleted.header}, Footer: ${deleted.footer}, Body: ${deleted.body}.`,
        //   userModel
        // );
        res.status(200).json({ message: 'Template deleted successfully.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}


async function sendBulkEmail(req, res) {
    try {
        const { body, userId, to, userModel, subject, role, plan, status, orgId } = req.body;

        if (!body || !subject || !role) {
            return res.status(400).json({ error: "Body, subject, and option are required" });
        }

        // Get matching schema
        const schemaEntry = allSchemas.find(r => r.role === role);
        if (!schemaEntry) {
            return res.status(400).json({ error: `Role '${role}' not found.` });
        }

        const { model } = schemaEntry;
        const filter = {};

        // Case 1: Special handling for 'Organization'
        if (role === "Organization") {
            if (!orgId) {
                return res.status(400).json({ error: "orgId is required when option is 'Organization'" });
            }
            filter.org = { $in: [orgId] }; // org is an array of ObjectId
            filter.role = "Org User";
            if (plan && Array.isArray(plan) && plan.length > 0) {
                filter.planDetails = { $in: plan };
            } else if (plan && typeof plan === "string") {
                filter.planDetails = plan;
            }
            if (status) filter.status = status;
        }

        // Case 2: For roles like 'User' or 'Org User' use plan/status filters
        if (["User", "Org User"].includes(role)) {
            if (plan && Array.isArray(plan) && plan.length > 0) {
                filter.planDetails = { $in: plan };
            } else if (plan && typeof plan === "string") {
                filter.planDetails = plan;
            }
            if (status) filter.status = status;
            filter.role = role; // Ensure we filter by role
        }

        if (role === "Plan") {
            if (plan && Array.isArray(plan) && plan.length > 0) {
                filter.planDetails = { $in: plan };
            } else if (plan && typeof plan === "string") {
                filter.planDetails = plan;
            } else {
                return res.status(400).json({ error: "Plan is required when option is 'Plan'" });
            }
            if (status) filter.status = status;
            filter.role = { $in: ["User", "Org User"] };
        }

        if (role === "Canceled") {
            filter.status = "Canceled";
            filter.role = { $in: ["User", "Org User"] };
        }

        // Fetch users
        const users = await model.find(filter, "email");
        const emails = users.map(u => u.email).filter(Boolean);

        if (emails.length === 0) {
            return res.status(404).json({ error: "No users found with the specified criteria" });
        }

        // Send single email to all
        await sendEmailUtil(emails.join(", "), subject, body, "", to);

        // Log
        // await addLog(
        //   "Send Bulk Email",
        //   userId,
        //   `Bulk email sent:<br> Subject: ${subject} <br> Body: ${body}`,
        //   userModel
        // );

        return res.status(200).json({ success: true, message: `Email sent to ${emails.length} user(s)` });

    } catch (error) {
        console.error("Error sending bulk email:", error);
        res.status(500).json({ success: false, message: "Failed to send bulk email", error: error.message });
    }
}

async function createCategory(req, res) {
    try {
        const { name, description } = req.body;

        const existing = await TemplateCategory.findOne({ name });
        if (existing) return res.status(400).json({ message: 'Category already exists' });

        const category = new TemplateCategory({ name, description });
        await category.save();
        res.status(201).json(category);
    } catch (err) {
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};

async function updateCategory(req, res) {
    try {
        const { id } = req.params;
        const { name, description } = req.body;

        const updated = await TemplateCategory.findByIdAndUpdate(
            id,
            { name, description },
            { new: true, runValidators: true }
        );

        if (!updated) return res.status(404).json({ message: 'Category not found' });

        res.status(200).json(updated);
    } catch (err) {
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};

async function deleteCategory(req, res) {
    try {
        const { id } = req.params;
        const deleted = await TemplateCategory.findByIdAndDelete(id);

        if (!deleted) return res.status(404).json({ message: 'Category not found' });

        res.status(200).json({ message: 'Category deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};
const updateEmail = async (req, res) => {
    try {
        const { userId, userModel } = req.query;
        const updatedEmail = await emailSchema.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true }
        );
        if (!updatedEmail)
            return res.status(404).json({ error: "Email not found" });
        // addLog(
        //     "Update Email",
        //     userId,
        //     `Update Email: To: ${updatedEmail.to}, Subject: ${updatedEmail.subject}.`,
        //     userModel)
        res.status(200).json(updatedEmail);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


async function getCategories(req, res) {
    try {
        const categories = await TemplateCategory.find().sort({ name: 1 });
        res.status(200).json(categories);
    } catch (err) {
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
}




const getFilteredEmails = async (req, res) => {
  try {
    const { role, status, department, clientIds, member, senderType } = req.query;

    let emails = [];
    let clientsArr = [];
    let membersArr = [];

    if (role === "client") {
      // Normalize clientIds
      let ids = [];
      if (clientIds) {
        ids = Array.isArray(clientIds) ? clientIds : clientIds.split(",");
      }

      // Fetch clients by IDs or all clients if no IDs given
      const query = ids.length > 0
        ? { _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } }
        : {};

      const clients = await ClientInfo.find(
        query,
        "name email companyEmail teamMembers"
      ).lean();

      clients.forEach((client) => {
        const clientEmails = [];

        // Collect client info for dropdown
        clientsArr.push({
          _id: client._id,
          name: client.name,
          email: client.email || "",
          companyEmail: client.companyEmail || "",
        });

        if (senderType === "clients" || !senderType || senderType === "both") {
          if (client.companyEmail) clientEmails.push(client.companyEmail);
          if (client.email) clientEmails.push(client.email);
        }

        // Use empty array if teamMembers is undefined
        const teamMembers = client.teamMembers || [];

        if (senderType === "members" || senderType === "both") {
          let filteredMembers = teamMembers;

          if (member) {
            const membersFilter = Array.isArray(member) ? member : member.split(",");
            filteredMembers = teamMembers.filter((m) =>
              membersFilter.includes(m.name)
            );
          }

          filteredMembers.forEach((m) => {
            if (m.email) {
              clientEmails.push(m.email);
              membersArr.push({
                clientId: client._id,
                name: m.name,
                email: m.email,
              });
            }
          });
        }

        emails.push(...clientEmails);
      });
    } else {
      // Default: filter Employees
      const query = {};

      if (role) {
        const roles = Array.isArray(role) ? role : role.split(",");
        if (roles.length > 0) query.role = { $in: roles };
      }

      if (status) {
        const statuses = Array.isArray(status) ? status : status.split(",");
        if (statuses.length > 0) query.status = { $in: statuses };
      }

      if (department) {
        const depts = Array.isArray(department) ? department : department.split(",");
        if (depts.length > 0) {
          query.department = {
            $in: depts.map((id) => new mongoose.Types.ObjectId(id)),
          };
        }
      }

      const employees = await Employee.find(query, "email name").lean();
      emails = employees.map((emp) => emp.email);
    }

    // Remove duplicates
    const uniqueEmails = [...new Set(emails)];

    res.json({
      emails: uniqueEmails,
      clients: clientsArr,
      members: membersArr,
    });
  } catch (error) {
    console.error("Error fetching emails:", error);
    res.status(500).json({ error: "Server error" });
  }
};







module.exports = {
    getEmails,
    getEmailById,
    resendEmail,
    updateEmail,
    deleteEmail,
    resendAllEmails,
    sendEmail,
    getFilteredEmails,
    updateEmail,
    createEmailTemplate,
    getEmailTemplates,
    updateEmailTemplate,
    deleteEmailTemplate,
    sendBulkEmail,
    createCategory,
    updateCategory,
    deleteCategory,
    getCategories,
    getEmailTemplateById

};