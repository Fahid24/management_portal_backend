const { production, staging } = require("../baseUrl");

const companyName = "Troublynx";
const companyEmail = "admin.portal@yopmail.com.com";

let emailHost = ( production || staging )? "smtp.hostinger.com" : "smtp.gmail.com";

module.exports = { companyName, companyEmail, emailHost };
