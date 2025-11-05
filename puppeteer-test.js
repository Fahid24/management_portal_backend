const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  try {
    // console.log("🚀 Launching Puppeteer...");

    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    // console.log("🌐 Navigating to example.com...");
    await page.goto('https://example.com', { waitUntil: 'networkidle0' });

    const title = await page.title();
    // console.log(`✅ Page loaded. Title is: "${title}"`);

    const pdfPath = 'example.pdf';

    // console.log(`📝 Generating PDF at: ${pdfPath}`);
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true
    });

    await browser.close();
    // console.log('🎉 Success! PDF generated and Puppeteer is working correctly.');

    // Confirm PDF file creation
    if (fs.existsSync(pdfPath)) {
      const stats = fs.statSync(pdfPath);
      // console.log(`📄 PDF file size: ${stats.size} bytes`);
    } else {
      console.warn('⚠️ PDF was not created.');
    }

  } catch (err) {
    console.error("❌ Error launching Puppeteer or generating PDF:");
    console.error(err);
  }
})();
