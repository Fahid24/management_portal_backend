const { companyName, companyEmail } = require("../constant/companyInfo");
module.exports.employeeOnboardingTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Welcome Email</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f3f1ef;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: #333;
    }
    .email-container {
      max-width: 620px;
      margin: 50px auto;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
      overflow: hidden;
      border-top: 6px solid #8A6642;
    }
    .header {
      background-color: #fff;
      text-align: center;
      padding: 30px 20px 15px;
    }
    .header img {
      max-height: 75px;
    }
    .content {
      padding: 0px 40px 30px 40px;
    }
    h1 {
      color: #8A6642;
      margin-bottom: 10px;
    }
    p {
      line-height: 1.6;
      margin: 12px 0;
      font-size: 15px;
    }
    .credentials {
      background-color: #f8f5f2;
      padding: 18px 20px;
      border-radius: 8px;
      margin: 25px 0;
      border: 1px solid #e3dcd6;
    }
    .credentials p {
      margin: 8px 0;
      font-weight: 500;
    }
    .button-container {
      text-align: center;
      margin: 30px 0;
    }
    .login-button {
      display: inline-block;
      padding: 14px 32px;
      background-color: #8A6642;
      color: #ffffff;
      text-decoration: none;
      border-radius: 6px;
      font-size: 16px;
      font-weight: bold;
      transition: background 0.3s ease;
    }
    .login-button:hover {
      background-color: #755532;
    }
    .signature {
      margin-top: 40px;
      font-size: 15px;
      line-height: 1.5;
    }
    .footer {
      background-color: #faf7f4;
      text-align: center;
      padding: 20px;
      font-size: 13px;
      color: #888;
      border-top: 1px solid #eee;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <img src="https://portal.haquedigital.com/wp-content/uploads/2024/05/ODL-NEW-LOGO-1small-1.png" alt="${companyName} Logo" />
    </div>
    <div class="content">
      <h1>Welcome Onboard, $firstName!</h1>
      <p>
        We're excited to welcome you to <strong>${companyName} LLC</strong>! Our mission is to empower businesses through cutting-edge digital solutions and a culture of innovation.
      </p>
      <p>
        To get started, we recommend updating your profile and exploring the tools and features available on our platform.
      </p>

      <div class="credentials">
        <p><strong>Email:</strong> $email</p>
        <p><strong>Password:</strong> $password</p>
      </div>

      <div style="color: white;" class="button-container">
        <a href="https://portal.haquedigital.com/login" class="login-button">Login to Your Account</a>
      </div>

      <p>
        You're now part of a collaborative team that thrives on creativity, problem-solving, and continuous growth. We’re thrilled to have you on board.
      </p>
      <p>
        If you have any questions or need assistance, feel free to reach out to your manager or the HR department at any time.
      </p>
      <p>
        Thank you again for joining <strong>${companyName} LLC</strong>. Let’s build something amazing together.
      </p>
      <div class="signature">
        Best regards,<br />
        <strong>Team ${companyName}</strong>
      </div>
    </div>
    <div class="footer">
      &copy; ${companyName} — All rights reserved.
    </div>
  </div>
</body>
</html>

`;

module.exports.requestNotificationEmail = ({
  applicationType,
  employee,
  commonFields,
  extraFields,
}) => {
  const { equipmentName, priority, expectedDate } = commonFields;
  const { fullName, email, role } = employee;

  // Generate extra field HTML
  const generateExtraFields = () => {
    switch (applicationType) {
      case "Equipment Request":
        return `
            <p><strong>Quantity:</strong> ${extraFields.quantity}</p>
            <p><strong>Purpose:</strong> ${extraFields.purpose}</p>
          `;
      case "Maintenance Request":
        return `
            <p><strong>Description:</strong> ${extraFields.description}</p>
            <p><strong>Damage Date:</strong> ${extraFields.damageDate}</p>
          `;
      case "Education Request":
        return `
            <p><strong>Education Type:</strong> ${extraFields.educationType}</p>
            <p><strong>Topic Description:</strong> ${extraFields.description}</p>
            <p><strong>Justification:</strong> ${extraFields.justification}</p>
            <p><strong>Learning Format:</strong> ${extraFields.learningFormat}</p>
          `;
      default:
        return "";
    }
  };

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>${applicationType} Notification</title>
      </head>
      <body style="margin:0; padding:0; font-family:Arial, sans-serif; background-color:#f4f4f4;">
        <table cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 0 12px rgba(0,0,0,0.05); overflow: hidden;">
          <tr style="background-color: #8A6642;">
            <td style="padding: 20px; text-align: center;">
              <img src="https://portal.haquedigital.com/wp-content/uploads/2024/05/ODL-NEW-LOGO-1small-1.png" alt="${companyName} LLC" style="max-height: 60px;" />
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <h2 style="color: #8A6642; margin-top: 0;">New ${applicationType} Submitted</h2>
              <p style="font-size: 15px; color: #333;">Hello,</p>
              <p style="font-size: 15px; color: #333;">A new <strong>${applicationType}</strong> has been submitted by one of our team members. Here are the details:</p>
  
              <div style="margin: 20px 0; padding: 15px; background: #f9f9f9; border-radius: 6px;">
                <p><strong>Employee Name:</strong> ${fullName}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Role:</strong> ${role}</p>
                <p><strong>Request Type:</strong> ${applicationType}</p>
              </div>
  
              <h4 style="color: #8A6642;">Request Details</h4>
              <div style="padding: 15px; background: #fcf8f5; border-left: 4px solid #8A6642; border-radius: 5px;">
             ${
               equipmentName
                 ? `<p><strong>Equipment Name:</strong> ${equipmentName}</p>`
                 : `<p><strong>Title:</strong> ${commonFields?.title}</p>`
             }
                <p><strong>Priority:</strong> ${priority}</p>
                <p><strong>Expected Date:</strong> ${expectedDate}</p>
                ${generateExtraFields()}
              </div>

              <p style="margin-top: 20px; font-size: 14px;"><strong>Note:</strong> Supporting documents may be attached with this request for your review.</p>
  
              <p style="margin-top: 20px; font-size: 14px;">Please review the request at your earliest convenience. If you need more details, feel free to connect directly with the employee.</p>
  
              <p style="margin-top: 40px; font-size: 14px;">
                Best regards,<br/>
                <strong>Team ${companyName}</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background: #fafafa; text-align: center; padding: 15px; font-size: 12px; color: #999;">
              &copy; ${new Date().getFullYear()} ${companyName} LLC — All rights reserved.
            </td>
          </tr>
        </table>
      </body>
    </html>
    `;
};

module.exports.incidentReportEmail = ({
  employee,
  involvedPersons = [],
  witnesses = [],
  injuries,
  reportedTo,
  incidentDate,
  description,
  followUpActions,
  signature,
}) => {
  const { fullName, email, role } = employee;

  const renderList = (arr) => {
    if (!arr || !arr.length) return "<p>None</p>";
    return `<ul style="margin: 0; padding-left: 18px;">${arr
      .map((item) => `<li>${item}</li>`)
      .join("")}</ul>`;
  };

  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>Incident Report</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          background-color: #f3f1ef;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          color: #333;
        }
        .email-container {
          max-width: 620px;
          margin: 50px auto;
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
          overflow: hidden;
          border-top: 6px solid #8A6642;
        }
        .header {
          background-color: #fff;
          text-align: center;
          padding: 30px 20px 15px;
        }
        .header img {
          max-height: 75px;
        }
        .content {
          padding: 30px 40px;
        }
        h2 {
          color: #8A6642;
          margin-bottom: 10px;
        }
        p {
          line-height: 1.6;
          margin: 12px 0;
          font-size: 15px;
        }
        .info-box {
          background-color: #f8f5f2;
          padding: 18px 20px;
          border-radius: 8px;
          margin: 25px 0;
          border: 1px solid #e3dcd6;
        }
        .info-box p {
          margin: 6px 0;
        }
        .signature {
          margin-top: 40px;
          font-size: 15px;
          line-height: 1.5;
        }
        .footer {
          background-color: #faf7f4;
          text-align: center;
          padding: 20px;
          font-size: 13px;
          color: #888;
          border-top: 1px solid #eee;
        }
      </style>
    </head>
    <body>
      <div class="email-container">
        <div class="header">
          <img src="https://portal.haquedigital.com/wp-content/uploads/2024/05/ODL-NEW-LOGO-1small-1.png" alt="${companyName} LLC Logo" />
        </div>
        <div class="content">
          <h2>Incident Report Submitted</h2>
          <p>Hello Team,</p>
          <p><strong>${fullName}</strong> (Email: ${email}, Role: ${role}) has submitted a new incident report. Please find the report details below:</p>

          <div class="info-box">
            <p><strong>Person(s) Involved:</strong></p>
            ${renderList(involvedPersons)}

            <p><strong>Witnesses:</strong></p>
            ${renderList(witnesses)}

            <p><strong>Injuries:</strong> ${injuries || "None reported"}</p>
            <p><strong>Reported To:</strong> ${reportedTo}</p>
            <p><strong>Incident Date & Time:</strong> ${incidentDate}</p>
            <p><strong>Description:</strong> ${description}</p>
            <p><strong>Follow-up Actions:</strong> ${followUpActions}</p>
            <p><strong>Signature:</strong> ${signature}</p>
          </div>

          <p style="margin-top: 30px; font-size: 14px;">
            Please ensure this report is properly logged and that appropriate follow-up steps are taken as per ${companyName}'s operational safety and compliance standards.
          </p>

          <div class="signature">
            Best regards,<br />
            <strong>Team ${companyName}</strong>
          </div>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} ${companyName} LLC — All rights reserved.
        </div>
      </div>
    </body>
  </html>
  `;
};

module.exports.generateSurveyEmailTemplate = (surveyData) => {
  // Progress calculation maps
  const progressMaps = {
    morale: {
      "Very High": 100,
      High: 80,
      Neutral: 60,
      Low: 40,
      "Very Low": 20,
    },
    support: {
      Always: 100,
      Usually: 80,
      Sometimes: 60,
      Rarely: 40,
      Never: 20,
    },
    clarity: {
      "Very Clear": 100,
      "Mostly Clear": 80,
      "Sometimes Confusing": 60,
      "Often Unclear": 40,
      "No Idea": 20,
    },
    skills: {
      "Fully Used": 100,
      "Mostly Used": 80,
      "Somewhat Used": 60,
      Underused: 40,
      "Not Used": 20,
    },
    recognition: {
      Frequently: 100,
      Sometimes: 75,
      Rarely: 50,
      Never: 25,
    },
    safety: {
      "Very Safe": 100,
      "Mostly Safe": 80,
      "Sometimes Unsafe": 60,
      "Often Unsafe": 40,
      "Not Safe": 20,
    },
  };

  // Utility: Get progress and color
  const getProgress = (category, value) => progressMaps[category][value] || 0;
  const getProgressColor = (percentage) => {
    if (percentage >= 80) return "#28a745";
    if (percentage >= 60) return "#ffc107";
    if (percentage >= 40) return "#fd7e14";
    return "#dc3545";
  };

  // Calculate individual progress values
  const moraleProgress = getProgress("morale", surveyData.morale);
  const supportProgress = getProgress("support", surveyData.support);
  const clarityProgress = getProgress("clarity", surveyData.expectations);
  const skillsProgress = getProgress("skills", surveyData.skillsUsage);
  const recognitionProgress = getProgress(
    "recognition",
    surveyData.recognition
  );
  const safetyProgress = getProgress("safety", surveyData.safety);

  // Timestamp
  const timestamp = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Avatar HTML
  const profileAvatar = surveyData.employeeId
    ? `<img src="${surveyData.employeeId.photoUrl}" alt="${surveyData.employeeId.firstName}" width="50" height="50" style="border-radius: 25px; display: block;">`
    : `<table cellpadding="0" cellspacing="0" border="0" width="50" height="50" style="background-color: #b57741; border-radius: 25px;">
         <tr>
           <td align="center" valign="middle" style="color: white; font-size: 20px; font-weight: bold; font-family: Arial, sans-serif; height: 50px;">
              
           </td>
         </tr>
       </table>`;

  // Mini progress bar builder
  const createProgressBar = (percentage, color) => {
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;

    return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="height: 10px;">
      <tr>
        ${
          filled > 0
            ? `<td width="${percentage}%" style="background-color: ${color}; height: 10px; font-size: 1px; line-height: 1px;">&nbsp;</td>`
            : ""
        }
        ${
          empty > 0
            ? `<td width="${
                100 - percentage
              }%" style="background-color: #e9ecef; height: 10px; font-size: 1px; line-height: 1px;">&nbsp;</td>`
            : ""
        }
      </tr>
    </table>`;
  };

  // Build full HTML
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Morale Survey</title>
</head>
<body style="margin:0; padding:0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4;">
    <tr><td align="center" style="padding: 20px 10px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; max-width: 600px;">

        <!-- Header -->
        <tr>
          <td style="background-color: #b57741; padding: 25px 30px; text-align: center;">
            <img src="https://portal.haquedigital.com/wp-content/uploads/2024/05/ODL-NEW-LOGO-1small-1.png" alt="Logo" height="40" style="background-color: white; padding: 8px; margin-bottom: 15px;">
            <h1 style="margin:0; font-size: 22px; font-weight:600; color:white;">Morale Survey Submission</h1>
            <p style="margin: 5px 0 0; font-size:14px; color:white;">Employee Feedback Report</p>
          </td>
        </tr>

        <!-- Employee Info -->
        <tr>
          <td style="padding: 25px 30px; background-color: #f8f9fa;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff;">
              ${
                surveyData.employeeId
                  ? `<tr><td colspan="2" style="padding-bottom: 20px;">
                <table width="100%">
                  <tr>
                    <td width="65">${profileAvatar}</td>
                    <td style="padding-left:15px;">
                      <h2 style="margin: 0 0 5px; font-size: 20px; font-weight: 700; color: #212529;">${surveyData.employeeId.firstName}</h2>
                      <p style="margin: 0; color: #6c757d; font-size: 14px;">Survey Submission</p>
                    </td>
                  </tr>
                </table>
              </td></tr>`
                  : ""
              }

              <!-- Cards -->
              ${
                surveyData.employeeId
                  ? `
                <tr>
                <td width="48%" style="padding-right:2%;">
                  <table width="100%" style="background-color: #f8f9fa; border-left: 4px solid #b57741;">
                    <tr><td style="padding:16px;">
                      <p style="margin:0 0 4px; font-size:11px; color:#6c757d; font-weight:600; text-transform:uppercase;">POSITION</p>
                      <p style="margin:0; font-size:15px; font-weight:600; color:#212529;">${surveyData.employeeId.role}</p>
                    </td></tr>
                  </table>
                </td>
                <td width="48%" style="padding-left:2%;">
                  <table width="100%" style="background-color: #f8f9fa; border-left: 4px solid #17a2b8;">
                    <tr><td style="padding:16px;">
                      <p style="margin:0 0 4px; font-size:11px; color:#6c757d; font-weight:600; text-transform:uppercase;">CONTACT</p>
                      <p style="margin:0; font-size:13px; font-weight:600; color:#212529;">${surveyData.employeeId.email}</p>
                    </td></tr>
                  </table>
                </td>
              </tr>`
                  : ""
              }
              

              <!-- Timestamp -->
              <tr><td colspan="2" style="height:16px;"></td></tr>
              <tr><td colspan="2">
                <table width="100%" style="background-color: #e3f2fd;">
                  <tr><td style="padding: 12px; text-align:center;">
                    <p style="margin:0; font-size:13px; color:#495057; font-weight:500;">
                      <span style="color:#8B4513; font-weight:600;">Submitted:</span> ${timestamp}
                    </p>
                  </td></tr>
                </table>
              </td></tr>
            </table>
          </td>
        </tr>

        <!-- Survey Sections -->
        ${[
          { label: "Overall Morale", key: "morale", progress: moraleProgress },
          { label: "Team Support", key: "support", progress: supportProgress },
          {
            label: "Job Clarity",
            key: "expectations",
            progress: clarityProgress,
          },
          {
            label: "Skills Utilization",
            key: "skillsUsage",
            progress: skillsProgress,
          },
          {
            label: "Work Recognition",
            key: "recognition",
            progress: recognitionProgress,
          },
          { label: "Job Site Safety", key: "safety", progress: safetyProgress },
        ]
          .map(
            ({ label, key, progress }) => `
          <tr><td style="padding: 25px 30px 0;">
            <h3 style="margin:0 0 8px; font-size:14px; font-weight:600; color:#495057;">${label}</h3>
            <p style="margin:0 0 5px; font-size:14px; color:#212529;">${
              surveyData[key]
            }</p>
            ${createProgressBar(progress, getProgressColor(progress))}
          </td></tr>
        `
          )
          .join("")}

        <!-- Suggestions -->
        <tr><td style="padding: 25px 30px;">
          <table width="100%" style="background-color: #f8f9fa; border-left: 4px solid #b57741;">
            <tr><td style="padding:16px;">
              <h3 style="margin:0 0 10px; font-size:15px; font-weight:600; color:#495057;">Improvement Suggestions</h3>
              <p style="margin:0; font-size:14px; color:#6c757d;">${
                surveyData.improvementSuggestions
              }</p>
            </td></tr>
          </table>
        </td></tr>

        <!-- Follow-up -->
        <tr><td style="padding: 0 30px 25px;">
          <table width="100%" style="background-color:#f8f9fa; border: 1px solid #dee2e6;">
            <tr>
              <td style="padding: 14px 16px; font-weight:600; color:#495057; font-size:14px;">Private Follow-up Requested</td>
              <td style="padding: 14px 16px; text-align: right;">
                <table style="background-color: ${
                  surveyData?.followUp === "Yes" ? "#28a745" : "#6c757d"
                };">
                  <tr><td style="padding: 6px 14px; color: white; font-size: 12px; font-weight: 600;">${
                    surveyData?.followUp || "No"
                  }</td></tr>
                </table>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr>
          <td style="background-color: #6c757d; padding: 15px 30px; text-align: center;">
            <p style="margin:0; color: #ffffff; font-size:12px;">Submitted via Troublynx Portal | © Troublynx Service</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

module.exports.verifiableTimeRecordEmail = ({
  fullName,
  roll,
  email,
  submittedTime,
  dateOfProject,
  workOrder,
  customerName,
  salesRep,
  crew,
  crewMembers = [],
  timeStamp = [],
  completeProject,
  estimatedTimeOnSite,
  actualTimeOnSite,
  feedback,
}) => {
  const renderList = (arr) => {
    if (!arr || !arr.length) return "<p>None</p>";
    return `<ul style="margin: 0; padding-left: 18px;">${arr
      .map((item) => `<li>${item}</li>`)
      .join("")}</ul>`;
  };

  const renderTimeTable = (entries) => {
    if (!entries?.length) return "<p>No time entries available.</p>";
    let rows = "";
    for (let i = 0; i < entries.length; i += 2) {
      const first = entries[i];
      const second = entries[i + 1];
      rows += `<tr>
        <td style="padding: 6px 10px; border: 1px solid #ccc;"><strong>${
          first.time
        }</strong>: ${first.value}</td>
        <td style="padding: 6px 10px; border: 1px solid #ccc;">
          ${second ? `<strong>${second.time}</strong>: ${second.value}` : ""}
        </td>
      </tr>`;
    }
    return `<table style="width:100%; border-collapse: collapse; margin-top: 12px;">${rows}</table>`;
  };

  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>Verifiable Time Record Submission</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          background-color: #f3f1ef;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          color: #000;
        }
        .email-container {
          max-width: 620px;
          margin: 50px auto;
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
          overflow: hidden;
          border: 0.5px solid #8A6642;
          border-top: 6px solid #8A6642;
        }
        .header {
          background-color: #fff;
          text-align: center;
          padding: 30px 20px 15px;
        }
        .header img {
          max-height: 75px;
        }
        .content {
          padding: 30px 40px;
        }
        h2 {
          color: #8A6642;
          margin-bottom: 10px;
        }
        p {
          line-height: 1.6;
          margin: 12px 0;
          font-size: 15px;
        }
        .info-box {
          background-color: #f8f5f2;
          padding: 18px 20px;
          border-radius: 8px;
          margin: 25px 0;
          border: 1px solid #e3dcd6;
        }
        .info-box p {
          margin: 6px 0;
        }
        .footer {
          background-color: #faf7f4;
          text-align: center;
          padding: 20px;
          font-size: 13px;
          color: #888;
          border-top: 1px solid #eee;
        }
      </style>
    </head>
    <body>
      <div class="email-container">
        <div class="header">
          <img src="https://portal.haquedigital.com/wp-content/uploads/2024/05/ODL-NEW-LOGO-1small-1.png" alt="${companyName} LLC Logo" />
        </div>
        <div class="content">
          <h2>Verifiable Time Record Submitted</h2>
          <p>Hello Team,</p>
          <p><strong>${fullName}</strong> (Roll: ${roll}, Email: ${email}) submitted a Verifiable Time Record on <strong>${submittedTime}</strong>.</p>

          <p>This form tracks detailed time logs for digital projects and operations — enabling improved performance tracking, team accountability, and efficient workflow reviews.</p>

          <div class="info-box">
            <p><strong>Date of Project:</strong> ${dateOfProject}</p>
            <p><strong>Work Order:</strong> ${workOrder}</p>
            <p><strong>Client Name:</strong> ${customerName}</p>
            <p><strong>Project Manager:</strong> ${salesRep}</p>
            <p><strong>Assigned Team:</strong> ${crew}</p>
            <p><strong>Team Members:</strong> ${renderList(crewMembers)}</p>

            <h4 style="margin: 15px 0 8px;">Time Log Entries:</h4>
            ${renderTimeTable(timeStamp)}

            <p>Project Completion Status: <strong>${completeProject}</strong></p>
            <p><strong>Estimated Time:</strong> ${estimatedTimeOnSite}</p>
            <p><strong>Actual Time Spent:</strong> ${actualTimeOnSite}</p>

            <p><strong>Team Feedback:</strong></p>
            <div style="white-space: pre-wrap; background: #fff; padding: 10px; border-radius: 5px; border: 1px solid #ddd;">${feedback}</div>
          </div>

          <p style="margin-top: 30px; font-size: 14px;">
            Please review the submitted timesheet and project data carefully. For questions or clarifications, contact the submitter or reach out to our project operations team.
          </p>

          <p style="margin-top: 30px; font-size: 14px;">
            Best regards,<br />
            <strong>${companyName} LLC Team</strong>
          </p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} ${companyName} LLC — All rights reserved.
        </div>
      </div>
    </body>
  </html>
  `;
};

module.exports.otpEmail = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${companyName} - Email Verification</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f3f1ef;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: #333;
    }
    .email-container {
      max-width: 620px;
      margin: 40px auto;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
      overflow: hidden;
      border-top: 6px solid #8A6642;
    }
    .header {
      background-color: #fff;
      text-align: center;
      padding: 30px 20px 15px;
    }
    .header img {
      max-height: 75px;
    }
    .content {
      padding: 0px 40px 30px 40px;
    }
    h1 {
      color: #8A6642;
      margin-bottom: 10px;
    }
    p {
      line-height: 1.6;
      margin: 12px 0;
      font-size: 15px;
    }
    .otp-code {
      font-size: 28px;
      font-weight: bold;
      color: #8A6642;
      text-align: center;
      padding: 20px 0;
      letter-spacing: 4px;
    }
    .footer {
      background-color: #faf7f4;
      text-align: center;
      padding: 20px;
      font-size: 13px;
      color: #888;
      border-top: 1px solid #eee;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <img src="https://portal.haquedigital.com/wp-content/uploads/2024/05/ODL-NEW-LOGO-1small-1.png" alt="${companyName} Logo" />
    </div>
    <div class="content">
      <h1>Verify Your Email</h1>
      <p>
        Hi $firstName,<br><br>
        Use the verification code below to complete your email verification process.
      </p>

      <div class="otp-code">$otp</div>

      <p>This code will expire in 2 minutes.</p>
      <p>If you did not request this, you can safely ignore this message.</p>

      <p>
        For assistance, reach out to 
        <a href="mailto:support@haquedigital.com" style="color:#8A6642; font-weight:bold; text-decoration:none;">
          support@haquedigital.com
        </a>.
      </p>
    </div>
    <div class="footer">
      &copy; $currentYear ${companyName} — All rights reserved.
    </div>
  </div>
</body>
</html>
`;

module.exports.birthdayEmailTemplate = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f3f1ef; color: #333; }
    .container { max-width: 620px; margin: 40px auto; background: white; border-radius: 12px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08); border-top: 6px solid #8A6642; padding: 30px; }
    h1 { color: #8A6642; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎉 Happy Birthday, $firstName!</h1>
    <p>Wishing you a joyful day and a successful year ahead!</p>
    <p>- From all of us at <strong>${companyName}</strong></p>
  </div>
</body>
</html>
`;

module.exports.birthdayAlertTemplate = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f3f1ef; color: #333; }
    .container { max-width: 620px; margin: 40px auto; background: white; border-radius: 12px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08); border-top: 6px solid #8A6642; padding: 30px; }
    h1 { color: #8A6642; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎂 $firstName $lastName's Birthday is Today!</h1>
    <p>Don't forget to send your wishes!</p>
    <p>- ${companyName}</p>
  </div>
</body>
</html>
`;

module.exports.workAnniversaryEmailTemplate = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f3f1ef; color: #333; }
    .container { max-width: 620px; margin: 40px auto; background: white; border-radius: 12px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08); border-top: 6px solid #8A6642; padding: 30px; }
    h1 { color: #8A6642; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎊 Happy Work Anniversary, $firstName!</h1>
    <p>Congratulations on completing $years year(s) with ${companyName}.</p>
    <p>We truly appreciate your dedication and contributions.</p>
  </div>
</body>
</html>
`;

module.exports.workAnniversaryAlertTemplate = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f3f1ef; color: #333; }
    .container { max-width: 620px; margin: 40px auto; background: white; border-radius: 12px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08); border-top: 6px solid #8A6642; padding: 30px; }
    h1 { color: #8A6642; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎊 $firstName $lastName is celebrating $years year(s) today!</h1>
    <p>Be sure to congratulate them on their work anniversary!</p>
  </div>
</body>
</html>
`;

module.exports.shortLeaveReqTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>New Short Leave Request</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f3f1ef;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: #333;
    }
    .email-container {
      max-width: 620px;
      margin: 50px auto;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
      overflow: hidden;
      border-top: 6px solid #8A6642;
    }
    .header {
      background-color: #fff;
      text-align: center;
      padding: 30px 20px 15px;
    }
    .header img {
      max-height: 75px;
    }
    .content {
      padding: 0px 40px 30px 40px;
    }
    h1 {
      color: #8A6642;
      margin-bottom: 10px;
    }
    p {
      line-height: 1.6;
      margin: 12px 0;
      font-size: 15px;
    }
    .credentials {
      background-color: #f8f5f2;
      padding: 18px 20px;
      border-radius: 8px;
      margin: 25px 0;
      border: 1px solid #e3dcd6;
    }
    .credentials p {
      margin: 8px 0;
      font-weight: 500;
    }
    .button-container {
      text-align: center;
      margin: 30px 0;
    }
    .login-button {
      display: inline-block;
      padding: 14px 32px;
      background-color: #8A6642;
      color: #ffffff;
      text-decoration: none;
      border-radius: 6px;
      font-size: 16px;
      font-weight: bold;
      transition: background 0.3s ease;
    }
    .login-button:hover {
      background-color: #755532;
    }
    .signature {
      margin-top: 40px;
      font-size: 15px;
      line-height: 1.5;
    }
    .footer {
      background-color: #faf7f4;
      text-align: center;
      padding: 20px;
      font-size: 13px;
      color: #888;
      border-top: 1px solid #eee;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <img src="https://portal.haquedigital.com/wp-content/uploads/2024/05/ODL-NEW-LOGO-1small-1.png" alt="${companyName} LLC Logo" />
    </div>
    <div class="content">
      <h1>New Short Leave Request from $employeeName</h1>
      <p>
        A short leave request has been submitted by <strong>$employeeName</strong> from the <strong>$departmentName</strong> department.
      </p>

      <div class="credentials">
        <p><strong>Leave Type:</strong> $leaveType</p>
        <p><strong>Date:</strong> $date</p>
        <p><strong>Start Time:</strong> $startTime</p>
        <p><strong>End Time:</strong> $endTime</p>
        <p><strong>Reason:</strong> $reason</p>
      </div>

      <div class="button-container">
        <a href="https://portal.haquedigital.com/short-leave-requests" class="login-button">View Request</a>
      </div>

      <p>
        Please log into the admin portal to review and take necessary action on this request.
      </p>

      <div class="signature">
        Regards,<br />
        <strong>${companyName} HR System</strong>
      </div>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} ${companyName} LLC — All rights reserved.
    </div>
  </div>
</body>
</html>
`;

module.exports.employeeTerminationTemplate = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1.0" />
    <title>Employment Termination Notice</title>
    <style>
      body {
        margin: 0;
        padding: 0;
        background: #f3f1ef;
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        color: #333;
      }
      .email-container {
        max-width: 620px;
        margin: 50px auto;
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
        overflow: hidden;
        border-top: 6px solid #8a6642;
      }
      .header {
        text-align: center;
        padding: 30px 20px 15px;
        background: #fff;
      }
      .header img {
        max-height: 75px;
      }
      .content {
        padding: 0 40px 35px 40px;
      }
      h1 {
        color: #8a6642;
        margin: 25px 0 10px;
        font-size: 22px;
      }
      p {
        line-height: 1.55;
        margin: 12px 0;
        font-size: 15px;
      }
      .info-box {
        background: #f8f5f2;
        border: 1px solid #e3dcd6;
        border-radius: 8px;
        padding: 18px 20px;
        margin: 25px 0 10px;
      }
      .info-box p {
        margin: 6px 0;
        font-weight: 500;
      }
      .important {
        background: #fcf0ee;
        border-left: 4px solid #c7523b;
        padding: 14px 16px;
        border-radius: 6px;
        font-size: 14px;
      }
      .signature {
        margin-top: 35px;
        font-size: 15px;
        line-height: 1.5;
      }
      .footer {
        background: #faf7f4;
        text-align: center;
        padding: 20px;
        font-size: 13px;
        color: #888;
        border-top: 1px solid #eee;
      }
      a.cta {
        display: inline-block;
        margin-top: 18px;
        background: #8a6642;
        color: #fff !important;
        text-decoration: none;
        padding: 12px 28px;
        border-radius: 6px;
        font-weight: 600;
        font-size: 14px;
      }
    </style>
  </head>
  <body>
    <div class="email-container">
      <div class="header">
        <img
          src="https://portal.haquedigital.com/wp-content/uploads/2024/05/ODL-NEW-LOGO-1small-1.png"
          alt="$companyName Logo"
        />
      </div>
      <div class="content">
        <h1>Employment Termination Notice</h1>
        <p>Dear $firstName $lastName,</p>
        <p>
          This email is to formally notify you that your employment with
          <strong>$companyName</strong> as <strong>$position</strong> will end
          effective <strong>$effectiveDate</strong>.
        </p>
        <div class="info-box">
          <p><strong>Employee:</strong> $firstName $lastName</p>
          <p><strong>Position:</strong> $position</p>
          <p><strong>Effective Termination Date:</strong> $effectiveDate</p>
          <p><strong>Manager / Point of Contact:</strong> $managerName</p>
          <!-- <p><strong>Reason (Internal):</strong> $reason</p> -->
        </div>
        <p>
          Please ensure that all company assets (devices, documents,
          credentials, keys, or other property) are returned by
          <strong>$returnOfPropertyDeadline</strong>. Your system access will be
          revoked on the effective date.
        </p>
        <p>
          Details regarding final compensation, accrued benefits, and any
          remaining obligations will be provided separately. If you have
          questions, contact
          <a
            href="mailto:$contactEmail"
            style="color: #8a6642; font-weight: 600; text-decoration: none"
            >$contactEmail</a
          >.
        </p>
        <div class="important">
          <strong>Confidentiality Reminder:</strong> All confidentiality, IP,
          and non-disclosure obligations remain in effect after termination.
        </div>
        <p>
          We appreciate the contributions you have made during your time with
          us.
        </p>
        <div class="signature">
          Regards,<br />
          <strong>${companyName} HR System</strong>
        </div>
      </div>
      <div class="footer">
        &copy; ${new Date().getFullYear()} $companyName — All rights reserved.
      </div>
    </div>
  </body>
</html>
`;

module.exports.employeeResignationTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Resignation Acknowledgement</title>
<style>
  body { margin:0; padding:0; background:#f3f1ef; font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif; color:#333; }
  .email-container { max-width:620px; margin:50px auto; background:#ffffff; border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,0.08); overflow:hidden; border-top:6px solid #8A6642; }
  .header { text-align:center; padding:30px 20px 15px; background:#fff; }
  .header img { max-height:75px; }
  .content { padding:0 40px 35px 40px; }
  h1 { color:#8A6642; margin:25px 0 10px; font-size:22px; }
  p { line-height:1.55; margin:12px 0; font-size:15px; }
  .info-box { background:#f8f5f2; border:1px solid #e3dcd6; border-radius:8px; padding:18px 20px; margin:25px 0 10px; }
  .info-box p { margin:6px 0; font-weight:500; }
  .panel { background:#eef6ff; border-left:4px solid #3b7bbf; padding:14px 16px; border-radius:6px; font-size:14px; }
  .signature { margin-top:35px; font-size:15px; line-height:1.5; }
  .footer { background:#faf7f4; text-align:center; padding:20px; font-size:13px; color:#888; border-top:1px solid #eee; }
  a.cta { display:inline-block; margin-top:18px; background:#8A6642; color:#fff !important; text-decoration:none; padding:12px 28px; border-radius:6px; font-weight:600; font-size:14px; }
</style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <img src="https://portal.haquedigital.com/wp-content/uploads/2024/05/ODL-NEW-LOGO-1small-1.png" alt="$companyName Logo"/>
    </div>
    <div class="content">
      <h1>Resignation Acknowledged</h1>
      <p>Dear $firstName,</p>
      <p>We acknowledge receipt of your resignation from your position as <strong>$position</strong> at <strong>$companyName</strong>. Your final working day is recorded as <strong>$lastWorkingDay</strong>.</p>
      <div class="info-box">
        <p><strong>Employee:</strong> $firstName $lastName</p>
        <p><strong>Position:</strong> $position</p>
        <p><strong>Last Working Day:</strong> $lastWorkingDay</p>
        <p><strong>Reporting Manager:</strong> $managerName</p>
        <p><strong>Exit Interview:</strong> $exitInterviewDate</p>
      </div>
      <p>Kindly complete all pending handover tasks and submit any outstanding deliverables before your final day. Please return all company assets (devices, credentials, documents) to your manager or HR.</p>
      <div class="panel">
        <strong>Exit Interview:</strong> Your exit interview is scheduled for <strong>$exitInterviewDate</strong>. If you need to reschedule, email <a href="mailto:$contactEmail" style="color:#8A6642; font-weight:600; text-decoration:none;">$contactEmail</a>.
      </div>
      <p>Your final paycheck and any eligible benefits information will be processed in accordance with company policy.</p>
      <p>We appreciate your contributions and wish you success in your future endeavors.</p>
      <div class="signature">
        Regards,<br/>
        <strong>$companyName HR Team</strong>
      </div>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} $companyName — All rights reserved.
    </div>
  </div>
</body>
</html>
`;

module.exports.employeeDeptHeadRoleUpdateTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Department Head Role Update</title>
<style>
  body { margin:0; padding:0; background:#f3f1ef; font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif; color:#333; }
  .email-container { max-width:620px; margin:50px auto; background:#ffffff; border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,0.08); overflow:hidden; border-top:6px solid #8A6642; }
  .header { text-align:center; padding:30px 20px 15px; background:#fff; }
  .header img { max-height:75px; }
  .content { padding:0 40px 35px 40px; }
  h1 { color:#8A6642; margin:25px 0 10px; font-size:22px; }
  p { line-height:1.55; margin:12px 0; font-size:15px; }
  .info-box { background:#f8f5f2; border:1px solid #e3dcd6; border-radius:8px; padding:18px 20px; margin:25px 0 10px; }
  .info-box p { margin:6px 0; font-weight:500; }
  .panel { background:#eef6ff; border-left:4px solid #3b7bbf; padding:14px 16px; border-radius:6px; font-size:14px; }
  .signature { margin-top:35px; font-size:15px; line-height:1.5; }
  .footer { background:#faf7f4; text-align:center; padding:20px; font-size:13px; color:#888; border-top:1px solid #eee; }
  a.cta { display:inline-block; margin-top:18px; background:#8A6642; color:#fff !important; text-decoration:none; padding:12px 28px; border-radius:6px; font-weight:600; font-size:14px; }
</style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <img src="https://portal.haquedigital.com/wp-content/uploads/2024/05/ODL-NEW-LOGO-1small-1.png" alt="$companyName Logo"/>
    </div>
    <div class="content">
      <h1>Congratulations on Your New Role!</h1>
      <p>Dear $firstName $lastName,</p>
      <p>We are pleased to inform you that you have been officially promoted to the position of <strong>Department Head</strong> at <strong>$companyName</strong>, effective <strong>$effectiveDate</strong>.</p>
      <div class="info-box">
        <p><strong>Employee:</strong> $firstName $lastName</p>
        <p><strong>New Role:</strong> Department Head</p>
        <p><strong>Department:</strong> $departmentName</p>
        <p><strong>Effective Date:</strong> $effectiveDate</p>
        
      </div>
      <p>This promotion is in recognition of your dedication, leadership, and consistent contributions to the success of the team and the company. As a Department Head, we look forward to your guidance in driving growth and fostering collaboration within your department.</p>
      <div class="panel">
        <strong>Next Steps:</strong> HR will provide you with the updated responsibilities and leadership onboarding details. If you have any questions, please reach out to <a href="mailto:$contactEmail" style="color:#8A6642; font-weight:600; text-decoration:none;">$contactEmail</a>.
      </div>
      <p>Once again, congratulations on this well-deserved achievement. We are confident that you will excel in your new role.</p>
      <div class="signature">
        Warm regards,<br/>
        <strong>$companyName HR Team</strong>
      </div>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} $companyName — All rights reserved.
    </div>
  </div>
</body>
</html>
`;

module.exports.employeeAdminRoleUpdateTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Admin Role Update</title>
<style>
  body { margin:0; padding:0; background:#f3f1ef; font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif; color:#333; }
  .email-container { max-width:620px; margin:50px auto; background:#ffffff; border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,0.08); overflow:hidden; border-top:6px solid #8A6642; }
  .header { text-align:center; padding:30px 20px 15px; background:#fff; }
  .header img { max-height:75px; }
  .content { padding:0 40px 35px 40px; }
  h1 { color:#8A6642; margin:25px 0 10px; font-size:22px; }
  p { line-height:1.55; margin:12px 0; font-size:15px; }
  .info-box { background:#f8f5f2; border:1px solid #e3dcd6; border-radius:8px; padding:18px 20px; margin:25px 0 10px; }
  .info-box p { margin:6px 0; font-weight:500; }
  .panel { background:#eef6ff; border-left:4px solid #3b7bbf; padding:14px 16px; border-radius:6px; font-size:14px; }
  .signature { margin-top:35px; font-size:15px; line-height:1.5; }
  .footer { background:#faf7f4; text-align:center; padding:20px; font-size:13px; color:#888; border-top:1px solid #eee; }
  a.cta { display:inline-block; margin-top:18px; background:#8A6642; color:#fff !important; text-decoration:none; padding:12px 28px; border-radius:6px; font-weight:600; font-size:14px; }
</style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <img src="https://portal.haquedigital.com/wp-content/uploads/2024/05/ODL-NEW-LOGO-1small-1.png" alt="$companyName Logo"/>
    </div>
    <div class="content">
      <h1>Welcome to Your New Admin Role!</h1>
      <p>Dear $firstName $lastName,</p>
      <p>We are delighted to inform you that you have been assigned the role of <strong>Admin</strong> at <strong>$companyName</strong>, effective <strong>$effectiveDate</strong>.</p>
      <div class="info-box">
        <p><strong>Employee:</strong> $firstName $lastName</p>
        <p><strong>New Role:</strong> Admin</p>
        <p><strong>Effective Date:</strong> $effectiveDate</p>
       
      </div>
      <p>This role gives you extended access and responsibilities to support both employees and management. We trust that your organizational skills, attention to detail, and reliability will greatly contribute to the smooth operations of the company.</p>
      <div class="panel">
        <strong>Next Steps:</strong> HR will share your updated access credentials and responsibilities. For any queries, kindly reach out to <a href="mailto:$contactEmail" style="color:#8A6642; font-weight:600; text-decoration:none;">$contactEmail</a>.
      </div>
      <p>Congratulations on this new responsibility — we're confident you'll thrive as an Admin and continue making a positive impact.</p>
      <div class="signature">
        Best regards,<br/>
        <strong>$companyName HR Team</strong>
      </div>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} $companyName — All rights reserved.
    </div>
  </div>
</body>
</html>
`;

module.exports.employeeManagerRoleUpdateTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Manager Role Update</title>
<style>
  body { margin:0; padding:0; background:#f3f1ef; font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif; color:#333; }
  .email-container { max-width:620px; margin:50px auto; background:#ffffff; border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,0.08); overflow:hidden; border-top:6px solid #8A6642; }
  .header { text-align:center; padding:30px 20px 15px; background:#fff; }
  .header img { max-height:75px; }
  .content { padding:0 40px 35px 40px; }
  h1 { color:#8A6642; margin:25px 0 10px; font-size:22px; }
  p { line-height:1.55; margin:12px 0; font-size:15px; }
  .info-box { background:#f8f5f2; border:1px solid #e3dcd6; border-radius:8px; padding:18px 20px; margin:25px 0 10px; }
  .info-box p { margin:6px 0; font-weight:500; }
  .panel { background:#eef6ff; border-left:4px solid #3b7bbf; padding:14px 16px; border-radius:6px; font-size:14px; }
  .signature { margin-top:35px; font-size:15px; line-height:1.5; }
  .footer { background:#faf7f4; text-align:center; padding:20px; font-size:13px; color:#888; border-top:1px solid #eee; }
  a.cta { display:inline-block; margin-top:18px; background:#8A6642; color:#fff !important; text-decoration:none; padding:12px 28px; border-radius:6px; font-weight:600; font-size:14px; }
</style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <img src="https://portal.haquedigital.com/wp-content/uploads/2024/05/ODL-NEW-LOGO-1small-1.png" alt="$companyName Logo"/>
    </div>
    <div class="content">
      <h1>Congratulations on Your Promotion!</h1>
      <p>Dear $firstName $lastName,</p>
      <p>We are excited to announce that you have been promoted to the role of <strong>Manager</strong> at <strong>$companyName</strong>, effective <strong>$effectiveDate</strong>.</p>
      <div class="info-box">
        <p><strong>Employee:</strong> $firstName $lastName</p>
        <p><strong>New Role:</strong> Manager</p>
        <p><strong>Effective Date:</strong> $effectiveDate</p>
        <p><strong>Department:</strong> $departmentName</p>
      </div>
      <p>This promotion reflects your hard work, leadership qualities, and dedication to excellence. As a Manager, you will play a key role in guiding your team and driving success across your department.</p>
      <div class="panel">
        <strong>Next Steps:</strong> HR will share your updated responsibilities and onboarding details. For any questions, please contact <a href="mailto:$contactEmail" style="color:#8A6642; font-weight:600; text-decoration:none;">$contactEmail</a>.
      </div>
      <p>Congratulations once again on this achievement — we are confident that you will excel in your new role.</p>
      <div class="signature">
        Best regards,<br/>
        <strong>$companyName HR Team</strong>
      </div>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} $companyName — All rights reserved.
    </div>
  </div>
</body>
</html>
`;

module.exports.employeeRoleUpdateTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Employee Role Update</title>
<style>
  body { margin:0; padding:0; background:#f3f1ef; font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif; color:#333; }
  .email-container { max-width:620px; margin:50px auto; background:#ffffff; border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,0.08); overflow:hidden; border-top:6px solid #8A6642; }
  .header { text-align:center; padding:30px 20px 15px; background:#fff; }
  .header img { max-height:75px; }
  .content { padding:0 40px 35px 40px; }
  h1 { color:#8A6642; margin:25px 0 10px; font-size:22px; }
  p { line-height:1.55; margin:12px 0; font-size:15px; }
  .info-box { background:#f8f5f2; border:1px solid #e3dcd6; border-radius:8px; padding:18px 20px; margin:25px 0 10px; }
  .info-box p { margin:6px 0; font-weight:500; }
  .panel { background:#eef6ff; border-left:4px solid #3b7bbf; padding:14px 16px; border-radius:6px; font-size:14px; }
  .signature { margin-top:35px; font-size:15px; line-height:1.5; }
  .footer { background:#faf7f4; text-align:center; padding:20px; font-size:13px; color:#888; border-top:1px solid #eee; }
  a.cta { display:inline-block; margin-top:18px; background:#8A6642; color:#fff !important; text-decoration:none; padding:12px 28px; border-radius:6px; font-weight:600; font-size:14px; }
</style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <img src="https://portal.haquedigital.com/wp-content/uploads/2024/05/ODL-NEW-LOGO-1small-1.png" alt="$companyName Logo"/>
    </div>
    <div class="content">
      <h1>Welcome to Your Employee Role</h1>
      <p>Dear $firstName $lastName,</p>
      <p>We are pleased to confirm your role as an <strong>Employee</strong> at <strong>$companyName</strong>, effective <strong>$effectiveDate</strong>.</p>
      <div class="info-box">
        <p><strong>Employee:</strong> $firstName $lastName</p>
        <p><strong>Role:</strong> Employee</p>
        <p><strong>Department:</strong> $departmentName</p>
        <p><strong>Effective Date:</strong> $effectiveDate</p>
      </div>
      <p>We are excited to have you as part of our team and look forward to the skills and energy you will bring to <strong>$companyName</strong>.</p>
      <div class="panel">
        <strong>Next Steps:</strong> HR will guide you through your onboarding and responsibilities. For assistance, please reach out to <a href="mailto:$contactEmail" style="color:#8A6642; font-weight:600; text-decoration:none;">$contactEmail</a>.
      </div>
      <p>Once again, welcome aboard. We are confident that you will grow and succeed with us.</p>
      <div class="signature">
        Warm regards,<br/>
        <strong>$companyName HR Team</strong>
      </div>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} $companyName — All rights reserved.
    </div>
  </div>
</body>
</html>
`;

module.exports.employeeDesignationChangeTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Designation Update Notification</title>
<style>
  body { margin:0; padding:0; background:#f3f1ef; font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif; color:#333; }
  .email-container { max-width:620px; margin:50px auto; background:#ffffff; border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,0.08); overflow:hidden; border-top:6px solid #8A6642; }
  .header { text-align:center; padding:30px 20px 15px; background:#fff; }
  .header img { max-height:75px; }
  .content { padding:0 40px 35px 40px; }
  h1 { color:#8A6642; margin:25px 0 10px; font-size:22px; }
  p { line-height:1.55; margin:12px 0; font-size:15px; }
  .info-box { background:#f8f5f2; border:1px solid #e3dcd6; border-radius:8px; padding:18px 20px; margin:25px 0 10px; }
  .info-box p { margin:6px 0; font-weight:500; }
  .panel { background:#eef6ff; border-left:4px solid #3b7bbf; padding:14px 16px; border-radius:6px; font-size:14px; }
  .signature { margin-top:35px; font-size:15px; line-height:1.5; }
  .footer { background:#faf7f4; text-align:center; padding:20px; font-size:13px; color:#888; border-top:1px solid #eee; }
  a.cta { display:inline-block; margin-top:18px; background:#8A6642; color:#fff !important; text-decoration:none; padding:12px 28px; border-radius:6px; font-weight:600; font-size:14px; }
</style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <img src="https://portal.haquedigital.com/wp-content/uploads/2024/05/ODL-NEW-LOGO-1small-1.png" alt="$companyName Logo"/>
    </div>
    <div class="content">
      <h1>Congratulations on Your New Designation!</h1>
      <p>Dear $firstName $lastName,</p>
      <p>We are pleased to inform you that you have been appointed as <strong>$newDesignation</strong> at <strong>$companyName</strong>, effective <strong>$effectiveDate</strong>.</p>
      <div class="info-box">
        <p><strong>Employee:</strong> $firstName $lastName</p>
        <p><strong>Previous Designation:</strong> $oldDesignation </p>
        <p><strong>Designation:</strong> $newDesignation</p>
        <p><strong>Department:</strong> $departmentName</p>
        <p><strong>Effective Date:</strong> $effectiveDate</p>
      </div>
      <p>This appointment is in recognition of your contributions and capabilities. We believe you will continue to excel and make a significant impact in this new role.</p>
      <div class="panel">
        <strong>Next Steps:</strong> HR will provide you with updated responsibilities, access, and onboarding details. For any clarification, please contact <a href="mailto:$contactEmail" style="color:#8A6642; font-weight:600; text-decoration:none;">$contactEmail</a>.
      </div>
      <p>Congratulations once again on this achievement. We are confident you will thrive in your new role.</p>
      <div class="signature">
        Warm regards,<br/>
        <strong>$companyName HR Team</strong>
      </div>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} $companyName — All rights reserved.
    </div>
  </div>
</body>
</html>
`;

module.exports.fullTimeEmploymentHtmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Full-Time Employment Confirmation</title>
<style>
  body { margin:0; padding:0; background:#f3f1ef; font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif; color:#333; }
  .email-container { max-width:620px; margin:50px auto; background:#ffffff; border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,0.08); overflow:hidden; border-top:6px solid #8A6642; }
  .header { text-align:center; padding:30px 20px 15px; background:#fff; }
  .header img { max-height:75px; }
  .content { padding:0 40px 35px 40px; }
  h1 { color:#8A6642; margin:25px 0 10px; font-size:22px; }
  p { line-height:1.55; margin:12px 0; font-size:15px; }
  .info-box { background:#f8f5f2; border:1px solid #e3dcd6; border-radius:8px; padding:18px 20px; margin:25px 0 10px; }
  .info-box p { margin:6px 0; font-weight:500; }
  .panel { background:#eef6ff; border-left:4px solid #3b7bbf; padding:14px 16px; border-radius:6px; font-size:14px; }
  .signature { margin-top:35px; font-size:15px; line-height:1.5; }
  .footer { background:#faf7f4; text-align:center; padding:20px; font-size:13px; color:#888; border-top:1px solid #eee; }
  a.cta { display:inline-block; margin-top:18px; background:#8A6642; color:#fff !important; text-decoration:none; padding:12px 28px; border-radius:6px; font-weight:600; font-size:14px; }
</style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <img src="https://portal.haquedigital.com/wp-content/uploads/2024/05/ODL-NEW-LOGO-1small-1.png" alt="$companyName Logo"/>
    </div>
    <div class="content">
      <h1>Full-Time Employment Confirmed 🎉</h1>
      <p>Dear $firstName $lastName,</p>
      <p>We’re happy to confirm your appointment as a <strong>Full-Time</strong> employee at <strong>$companyName</strong>, effective <strong>$effectiveDate</strong>.</p>

      <div class="info-box">
        <p><strong>Employee:</strong> $firstName $lastName</p>
        <p><strong>Designation:</strong> $designation</p>
        <p><strong>Department:</strong> $departmentName</p>
        <p><strong>Employment Type:</strong> Full-Time</p>
      </div>

      <p>We’re excited for the impact you’ll make. As a full-time team member, you’ll receive the benefits and responsibilities outlined in company policy.</p>

      <div class="panel">
        <strong>Next Steps:</strong> HR will share onboarding details, access, and policy documents. If you need anything, reach us at
        <a href="mailto:$contactEmail" style="color:#8A6642; font-weight:600; text-decoration:none;">$contactEmail</a>.
      </div>

      <p>Welcome aboard! Let’s build great things together.</p>

      <div class="signature">
        Warm regards,<br/>
        <strong>$companyName HR Team</strong>
      </div>
    </div>

    <div class="footer">
      &copy; ${new Date().getFullYear()} $companyName — All rights reserved.
    </div>
  </div>
</body>
</html>
`;

module.exports.applicationStatusChangeEmail = ({
  applicationType,
  status, // "Approved" or "Rejected"
  employee,
  commonFields,
  extraFields,
  reviewerName,
  remarks,
}) => {
  const { fullName, email, role } = employee;
  const { equipmentName, priority, expectedDate, title } = commonFields;

  // Generate extra field HTML
  const generateExtraFields = () => {
    switch (applicationType) {
      case "Equipment Request":
        return `
          <p><strong>Quantity:</strong> ${extraFields.quantity}</p>
          <p><strong>Purpose:</strong> ${extraFields.purpose}</p>
        `;
      case "Maintenance Request":
        return `
          <p><strong>Description:</strong> ${extraFields.description}</p>
          <p><strong>Damage Date:</strong> ${extraFields.damageDate}</p>
        `;
      case "Education Request":
        return `
          <p><strong>Education Type:</strong> ${extraFields.educationType}</p>
          <p><strong>Topic Description:</strong> ${extraFields.description}</p>
          <p><strong>Justification:</strong> ${extraFields.justification}</p>
          <p><strong>Learning Format:</strong> ${extraFields.learningFormat}</p>
        `;
      default:
        return "";
    }
  };

  const statusColor = status === "Approved" ? "#28a745" : "#c7523b";
  const statusText = status === "Approved" ? "approved" : "rejected";

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>${applicationType} ${
    statusText.charAt(0).toUpperCase() + statusText.slice(1)
  }</title>
        <style>
          body {
            margin: 0;
            padding: 0;
            background-color: #f3f1ef;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: #333;
          }
          .email-container {
            max-width: 620px;
            margin: 50px auto;
            background: #ffffff;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
            overflow: hidden;
            border-top: 6px solid #8A6642;
          }
          .header {
            background-color: #fff;
            text-align: center;
            padding: 30px 20px 15px;
          }
          .header img {
            max-height: 75px;
          }
          .content {
            padding: 30px 40px;
          }
          h2 {
            color: #8A6642;
            margin-bottom: 10px;
          }
          .status-box {
            background: ${statusColor};
            color: #fff;
            padding: 14px 18px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: bold;
            text-align: center;
            margin-top: 15px;
            margin-bottom: 18px;
          }
          .info-box {
            background-color: #f8f5f2;
            padding: 18px 20px;
            border-radius: 8px;
            margin: 25px 0;
            border: 1px solid #e3dcd6;
          }
          .info-box p {
            margin: 6px 0;
          }
          .remarks {
            background: #fcf8f5;
            border-left: 4px solid #8A6642;
            padding: 12px 16px;
            border-radius: 6px;
            font-size: 14px;
            margin-top: 18px;
          }
          .footer {
            background-color: #faf7f4;
            text-align: center;
            padding: 20px;
            font-size: 13px;
            color: #888;
            border-top: 1px solid #eee;
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="header">
            <img src="https://portal.haquedigital.com/wp-content/uploads/2024/05/ODL-NEW-LOGO-1small-1.png" alt="${companyName} LLC Logo" />
          </div>
          <div class="content">
            <p>Dear ${fullName},</p>
            <p>
              Your <strong>${applicationType}</strong> request has been <span style="color:${statusColor}; font-weight:bold;">${statusText}</span> by ${
    reviewerName ? reviewerName : "the reviewer"
  }.
            </p>

            <div class="status-box">
              ${applicationType} ${
    statusText.charAt(0).toUpperCase() + statusText.slice(1)
  }
            </div>

            <div class="info-box">
              <p><strong>Employee Name:</strong> ${fullName}</p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Role:</strong> ${role}</p>
              <p><strong>Request Type:</strong> ${applicationType}</p>
              ${
                equipmentName
                  ? `<p><strong>Equipment Name:</strong> ${equipmentName}</p>`
                  : title
                  ? `<p><strong>Title:</strong> ${title}</p>`
                  : ""
              }
              <p><strong>Priority:</strong> ${priority}</p>
              <p><strong>Expected Date:</strong> ${expectedDate}</p>
              ${generateExtraFields()}
            </div>
            ${
              remarks
                ? `<div class="remarks"><strong>Remarks:</strong> ${remarks}</div>`
                : ""
            }
            <p style="margin-top: 30px; font-size: 14px;">
              If you have any questions, please contact your Supervisor or HR.
            </p>
            <p style="margin-top: 30px; font-size: 14px;">
              Best regards,<br />
              <strong>${companyName} LLC Team</strong>
            </p>
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} ${companyName} LLC — All rights reserved.
          </div>
        </div>
      </body>
    </html>
  `;
};
