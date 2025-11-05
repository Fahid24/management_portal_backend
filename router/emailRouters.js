const express = require("express");
const { getEmails, getEmailById, resendEmail, deleteEmail, sendEmail, resendAllEmails, sendBulkEmail, createEmailTemplate, getEmailTemplates, getEmailTemplateById, updateEmailTemplate, deleteEmailTemplate, createCategory, updateCategory, deleteCategory, getCategories, updateEmail, getFilteredEmails } = require("../controller/emailController");
const router = express.Router();


router.get('/getAll', getEmails);

// Get Email by ID
router.get('/details/:id', getEmailById);

router.post('/resend', resendEmail);

// Delete Email
router.delete('/:id', deleteEmail);

router.post('/sendEmail', sendEmail);
router.post('/resend-all', resendAllEmails);
router.post('/send-bulk-email', sendBulkEmail);
router.post('/template', createEmailTemplate);
router.get('/template', getEmailTemplates);

router.get('/template/:id', getEmailTemplateById);
router.put('/template/:id', updateEmailTemplate);

router.delete('/template/:id', deleteEmailTemplate);
router.post('/categories', createCategory);
router.put('/categories/:id', updateCategory);
router.delete('/categories/:id', deleteCategory);
router.get('/categories', getCategories);
router.delete('/delete/:id', deleteEmail);

router.put('/update/:id', updateEmail);

router.get('/bulk-sending-emails', getFilteredEmails);


module.exports = router;