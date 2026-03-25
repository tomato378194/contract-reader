const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");

const { extractDocxParagraphs } = require("./lib/docx");
const { analyzeLeaseContract } = require("./lib/analyzer");

const PORT = Number(process.env.PORT || 3001);
const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB || 10);
const UPLOAD_DIR = path.resolve(process.cwd(), process.env.UPLOAD_DIR || "uploads");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

function decodeUploadName(name) {
  try {
    const decoded = Buffer.from(name, "latin1").toString("utf8");
    if (/[\u00C0-\u00FF]/.test(name) && /[\u4e00-\u9fa5]/.test(decoded)) {
      return decoded;
    }
    return name;
  } catch (_error) {
    return name;
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const originalName = decodeUploadName(file.originalname);
    const safeBase = path
      .basename(originalName, path.extname(originalName))
      .replace(/[^\w\u4e00-\u9fa5-]+/g, "_")
      .slice(0, 60);
    cb(null, `${Date.now()}-${safeBase || "contract"}.docx`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const isDocx = /\.docx$/i.test(file.originalname);
    if (!isDocx) {
      cb(new Error("仅支持上传 .docx 格式的房屋租赁合同。"));
      return;
    }
    cb(null, true);
  }
});

app.get("/healthz", (_req, res) => {
  res.json({
    status: "ok",
    service: "contract-intel-reader",
    timestamp: new Date().toISOString()
  });
});

app.post("/api/review", upload.single("contract"), async (req, res, next) => {
  if (!req.file) {
    res.status(400).json({
      error: "missing_file",
      message: "请上传 .docx 格式的合同文件。"
    });
    return;
  }

  try {
    const originalName = decodeUploadName(req.file.originalname);
    const doc = await extractDocxParagraphs(req.file.path);
    const analysis = analyzeLeaseContract(doc);

    if (!analysis.accepted) {
      res.status(400).json({
        error: analysis.reasonCode,
        message: analysis.reason,
        fullText: doc.fullText
      });
      return;
    }

    res.json({
      fileName: originalName,
      ...analysis,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  } finally {
    fs.promises.unlink(req.file.path).catch(() => {});
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    res.status(400).json({
      error: "file_too_large",
      message: `文件过大，最大支持 ${MAX_FILE_SIZE_MB}MB。`
    });
    return;
  }

  const message = error && error.message ? error.message : "服务内部错误，请稍后重试。";
  const status = /仅支持上传/.test(message) ? 400 : 500;

  res.status(status).json({
    error: status === 400 ? "invalid_upload" : "internal_error",
    message
  });
});

app.listen(PORT, () => {
  console.log(`Contract intel reader listening on http://localhost:${PORT}`);
});
