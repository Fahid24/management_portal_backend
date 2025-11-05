const fs = require("fs");
const path = require("path");
const { production, staging } = require("../baseUrl");

function extractAndReplaceBase64Images(htmlContent) {
    const base64Regex = /<img[^>]+src=["'](data:image\/[^;]+;base64,[^"']+)["'][^>]*>/gi;
    let match;
    let index = 0;

    while ((match = base64Regex.exec(htmlContent)) !== null) {
        const base64Data = match[1];
        const extMatch = base64Data.match(/^data:image\/(\w+);base64,/);
        if (!extMatch) continue;

        const ext = extMatch[1];
        const base64Str = base64Data.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Str, "base64");

        // Generate unique filename
        const filename = `img_${Date.now()}_${index++}.${ext}`;
        const filePath = path.join(__dirname, "..", "uploads", filename);
        const fileUrl = production ? `https://server.haquedigital.com/uploads/${filename}` : staging ? `https://server.haquedigital.com/uploads/${filename}` : `http://localhost:5000/uploads/${filename}` ;

        // Save image
        fs.writeFileSync(filePath, buffer);

        // Replace in HTML
        htmlContent = htmlContent.replace(base64Data, fileUrl);
    }

    return htmlContent;
}

module.exports = {
    extractAndReplaceBase64Images
}