const mammoth = require("mammoth");

function normalizeParagraphs(rawText) {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  let cursor = 0;

  return {
    paragraphs: lines.map((text, index) => {
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
    }),
    fullText: lines.join("\n\n")
  };
}

async function extractDocxParagraphs(filePath) {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    const normalized = normalizeParagraphs(result.value || "");

    if (!normalized.paragraphs.length) {
      throw new Error("empty_docx_content");
    }

    return normalized;
  } catch (error) {
    if (error.message === "empty_docx_content") {
      throw new Error("未能从文件中提取到有效合同正文，请确认 DOCX 文件内容不是空白。");
    }

    throw new Error("合同解析失败，请确认文件未损坏且内容可读取。");
  }
}

module.exports = {
  extractDocxParagraphs
};
