const production = true;
const staging = false;
const development = false;

const incidentSendingEmails = production
  ? "admin@haquedigital.com"
  : "fahidhasanfuad@gmail.com,emon.mhk69@gmail.com";
const equipmentAndMaintenanceSendingEmails = production
  ? "admin@haquedigital.com"
  : "fahidhasanfuad@gmail.com,emon.mhk69@gmail.com";
const educationalReqSendingEmails = production
  ? "admin@haquedigital.com"
  : "fahidhasanfuad@gmail.com,emon.mhk69@gmail.com";

module.exports = {
  production,
  staging,
  development,
  incidentSendingEmails,
  equipmentAndMaintenanceSendingEmails,
  educationalReqSendingEmails,
};
