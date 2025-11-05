const production = false;
const staging = false;
const development = true;

const incidentSendingEmails = production
  ? "admin.portal@yopmail.com.com"
  : "fahidhasanfuad@gmail.com,emon.mhk69@gmail.com";
const equipmentAndMaintenanceSendingEmails = production
  ? "admin.portal@yopmail.com.com"
  : "fahidhasanfuad@gmail.com,emon.mhk69@gmail.com";
const educationalReqSendingEmails = production
  ? "admin.portal@yopmail.com.com"
  : "fahidhasanfuad@gmail.com,emon.mhk69@gmail.com";

module.exports = {
  production,
  staging,
  development,
  incidentSendingEmails,
  equipmentAndMaintenanceSendingEmails,
  educationalReqSendingEmails,
};
