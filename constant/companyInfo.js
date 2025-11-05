const { production, staging } = require("../baseUrl");

const companyName = "Haque Digital";
const companyEmail = "admin@haquedigital.com";

let emailHost = ( production || staging )? "smtp.hostinger.com" : "smtp.gmail.com";

module.exports = { companyName, companyEmail, emailHost };
