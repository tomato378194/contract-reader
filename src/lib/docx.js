const mammoth = require("mammoth");

function normalizeParagraphs(rawText) {
  return rawText
    .split(/\r?\n/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((text, index) => ({
      id: `p-${index + 1}`,
      index: index + 1,
      text
    }));
}

async function extractDocxParagraphs(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  const paragraphs = normalizeParagraphs(result.value || "");

  if (!paragraphs.length) {
    throw new Error("未能解析出合同正文，请确认上传的是可读取的 DOCX 文件。");
  }

  return { paragraphs };
}

module.exports = {
  extractDocxParagraphs
};
