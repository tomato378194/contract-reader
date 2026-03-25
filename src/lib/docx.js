const mammoth = require("mammoth");

function normalizeParagraphs(rawText) {
  const lines = rawText
    .split(/\r?\n/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  let cursor = 0;
  const paragraphs = lines.map((text, index) => {
    const start = cursor;
    const end = start + text.length;

    cursor = end + 2;

    return {
      id: `p-${index + 1}`,
      index: index + 1,
      text,
      start,
      end
    };
  });

  return {
    paragraphs,
    fullText: lines.join("\n\n")
  };
}

async function extractDocxParagraphs(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  const { paragraphs, fullText } = normalizeParagraphs(result.value || "");

  if (!paragraphs.length) {
    throw new Error("未能解析出合同正文，请确认上传的是可读取的 DOCX 文件。");
  }

  return { paragraphs, fullText };
}

module.exports = {
  extractDocxParagraphs
};
