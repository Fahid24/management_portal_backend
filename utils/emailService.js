const nodemailer = require("nodemailer");
const Email = require("../model/emailSchema");
const fs = require("fs"); // Import fs to handle file deletion
const path = require('path');
const { production, staging } = require("../baseUrl");
// const production = true;
// const staging = false;
const Time = require("../utils/time"); // Import the Time utility for date handling
const { emailHost } = require("../constant/companyInfo");

const sendEmailUtil = async (to, subject, body, fileName) => {

    if (!to || !subject || !body) {
        throw new Error("Missing required parameters: to, subject, or body");
    }

    const invoicesDirectory = path.join(__dirname, "documents");
    if (!fs.existsSync(invoicesDirectory)) {
        fs.mkdirSync(invoicesDirectory, { recursive: true });
    }


    let attachmentPath = ""; // Default to an empty string
    if (fileName) {
        attachmentPath = path.join(invoicesDirectory, fileName);
    }

    let transporter;
    if (production || staging) {
        // transporter = nodemailer.createTransport({
        //     host: "optimalmd-com.mail.protection.outlook.com",
        //     port: 25,
        //     secure: false,
        // });
        transporter = nodemailer.createTransport({
            host: emailHost, // SMTP server for Gmail
            port: 465, // Port for SSL
            secure: true,
            // service: "gmail",
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
            // service: "gmail",
            auth: {
                user: "fahidhasanfuad20018@gmail.com", // Replace with your Gmail address
                pass: "cislzivpyqaxnqrs", // Replace with your Gmail app password
            },
            tls: {
                rejectUnauthorized: false, // Temporarily allow connection issues for debugging
            },
        });
    }

    const email = new Email({
        to,
        subject,
        body,
        date: Time.toJSDate(Time.now()),
        attachmentPath,
        status: "pending",
        fileName
    });

    try {
        const mailOptions = {
          from:
            production || staging
              ? process.env.MAIL_USER
              : "fahidhasanfuad20018@gmail.com",
          to,
          subject,
          text: `Troublynx Team`,
          html: body,
        };

        // Include the attachment only if attachmentPath is provided
        if (attachmentPath) {
            mailOptions.attachments = [
                {
                    filename: `ODL-${fileName}.pdf`,
                    path: attachmentPath,
                },
            ];
        }

        await transporter.sendMail(mailOptions);

        email.status = "sent";

        // Delete the file if attachmentPath is provided
        // if (attachmentPath) {
        //     fs.unlinkSync(attachmentPath);
        //     console.log("Invoice file deleted:", attachmentPath);
        // }
    } catch (error) {
        email.status = "failed";
        email.error = error.message;
        console.error("Failed to send email:", error.message);
    } finally {
        await email.save();
    }
};

module.exports = sendEmailUtil;
