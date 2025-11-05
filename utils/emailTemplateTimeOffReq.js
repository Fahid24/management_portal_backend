const { companyName, companyEmail } = require("../constant/companyInfo");
module.exports.timeOffReq = `

<!DOCTYPE html> 
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>New Leave Request</title>
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
      <img src="https://i.ibb.co.com/wF5gTCyL/H-logo-with-BG.png" alt="${companyName} Logo" />
    </div>
    <div class="content">
      <h1>New Leave Request from $employeeName</h1>
      <p>
        A new leave request has been submitted by <strong>$employeeName</strong> from the <strong>$departmentName</strong> department.
      </p>

      <div class="credentials">
        <p><strong>Leave Type:</strong> $leaveType</p>
        <p><strong>Start Date:</strong> $startDate</p>
        <p><strong>End Date:</strong> $endDate</p>
        <p><strong>Reason:</strong> $reason</p>
      </div>

      <div class="button-container">
        <a href="https://i.ibb.co.com/wF5gTCyL/H-logo-with-BG.png" class="login-button">View Request</a>
      </div>

      <p>
        Please log into the admin portal to review and take necessary action on the request.
      </p>

      <div class="signature">
        Regards,<br />
        <strong>${companyName} HR System</strong>
      </div>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} ${companyName} — All rights reserved.
    </div>
  </div>
</body>
</html>

`;

module.exports.timeofReqToUserTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Leave Request Update</title>
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
  .status-approved { color:green; font-weight:bold; }
  .status-rejected { color:#d9534f; font-weight:bold; }
  .panel { background:#eef6ff; border-left:4px solid #3b7bbf; padding:14px 16px; border-radius:6px; font-size:14px; }
  .signature { margin-top:35px; font-size:15px; line-height:1.5; }
  .footer { background:#faf7f4; text-align:center; padding:20px; font-size:13px; color:#888; border-top:1px solid #eee; }
</style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <img src="https://i.ibb.co.com/wF5gTCyL/H-logo-with-BG.png" alt="$companyName Logo"/>
    </div>
    <div class="content">
      <h1>Your Leave Request Update</h1>
      <p>Dear $firstName $lastName,</p>
      <p>Your time-off request from <strong>$startDate</strong> to <strong>$endDate</strong> has been 
        <span class="status-$statusClass">$statusText</span> .</p>

      <div class="info-box">
        <p><strong>Employee:</strong> $firstName $lastName</p>
        <p><strong>Leave Dates:</strong> $startDate → $endDate</p>
        <p><strong>Status:</strong> <span class="status-$statusClass">$status</span></p>
        <p><strong>Admin Comment:</strong> $adminComment</p>
      </div>

      <div class="panel">
        If you have any questions about this decision, please reach out to 
        <a href="mailto:$contactEmail" style="color:#8A6642; font-weight:600; text-decoration:none;">$contactEmail</a>.
      </div>

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
