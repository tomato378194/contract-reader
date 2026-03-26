const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");

const { extractDocxParagraphs } = require("./lib/docx");
const { analyzeLeaseContract } = require("./lib/analyzer");

const PORT = Number(process.env.PORT || 3001);
const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB || 10);
const MAX_REQUEST_SIZE_MB = Number(process.env.MAX_REQUEST_SIZE_MB || MAX_FILE_SIZE_MB + 1);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 15000);
const JSON_LIMIT = process.env.JSON_LIMIT || "256kb";
const UPLOAD_DIR = path.resolve(process.cwd(), process.env.UPLOAD_DIR || "uploads");
const DOCX_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream"
]);

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

class AppError extends Error {
  constructor(status, code, message, options = {}) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.expose = options.expose !== false;
  }
}

function createError(status, code, message, options) {
  return new AppError(status, code, message, options);
}

function log(level, event, meta = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...meta
  };
  const serialized = JSON.stringify(payload);
  if (level === "error") {
    console.error(serialized);
    return;
  }
  console.log(serialized);
}

function sendSuccess(res, data, message = "处理成功。") {
  res.json({
    success: true,
    message,
    data
  });
}

function decodeUploadName(name) {
  try {
    const decoded = Buffer.from(name, "latin1").toString("utf8");
    if (/[\u00C0-\u00FF]/.test(name) && /[\u4E00-\u9FFF]/.test(decoded)) {
      return decoded;
    }
    return name;
  } catch (_error) {
    return name;
  }
}

function withTimeout(task, timeoutMs, timeoutError) {
  return Promise.race([
    Promise.resolve().then(task),
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(timeoutError), timeoutMs);
      timer.unref?.();
    })
  ]);
}

async function readFileSignature(filePath) {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(4);
    await handle.read(buffer, 0, 4, 0);
    return buffer;
  } finally {
    await handle.close();
  }
}

async function validateUploadedDocx(file) {
  if (!file) {
    throw createError(400, "missing_file", "请先选择一个 DOCX 合同文件。");
  }

  const originalName = decodeUploadName(file.originalname || "");
  if (!/\.docx$/i.test(originalName)) {
    throw createError(400, "invalid_file_type", "仅支持上传 DOCX 格式合同。");
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw createError(400, "empty_file", "上传文件为空，请重新选择有效的 DOCX 合同。");
  }

  if (file.mimetype && !DOCX_MIME_TYPES.has(file.mimetype)) {
    throw createError(400, "invalid_file_type", "文件类型校验未通过，请上传标准 DOCX 文件。");
  }

  const signature = await readFileSignature(file.path);
  if (signature[0] !== 0x50 || signature[1] !== 0x4b) {
    throw createError(400, "invalid_file_content", "文件内容不是有效的 DOCX 压缩包结构。");
  }
}

function normalizeUploadError(error) {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return createError(413, "file_too_large", `文件过大，最大支持 ${MAX_FILE_SIZE_MB}MB。`);
    }

    return createError(400, "upload_failed", error.message || "文件上传失败，请稍后重试。");
  }

  return error;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const originalName = decodeUploadName(file.originalname);
    const safeBase = path
      .basename(originalName, path.extname(originalName))
      .replace(/[^\w\u4E00-\u9FFF-]+/g, "_")
      .slice(0, 60);
    cb(null, `${Date.now()}-${safeBase || "contract"}.docx`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
    files: 1,
    parts: 20
  },
  fileFilter: (_req, file, cb) => {
    const originalName = decodeUploadName(file.originalname || "");
    if (!/\.docx$/i.test(originalName)) {
      cb(createError(400, "invalid_file_type", "仅支持上传 DOCX 格式合同。"));
      return;
    }

    cb(null, true);
  }
});

const app = express();

app.disable("x-powered-by");
app.use((req, _res, next) => {
  req.requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  req.startedAt = Date.now();

  const contentLength = Number(req.headers["content-length"] || 0);
  const requestLimitBytes = MAX_REQUEST_SIZE_MB * 1024 * 1024;
  if (contentLength && contentLength > requestLimitBytes) {
    next(createError(413, "request_too_large", `请求体过大，最大支持 ${MAX_REQUEST_SIZE_MB}MB。`));
    return;
  }

  log("info", "request_received", {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl
  });
  next();
});

app.use(express.json({ limit: JSON_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_LIMIT }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/healthz", (_req, res) => {
  sendSuccess(
    res,
    {
      status: "ok",
      service: "contract-intel-reader",
      timestamp: new Date().toISOString()
    },
    "服务正常。"
  );
});

app.post("/api/review", (req, res, next) => {
  upload.single("contract")(req, res, async (uploadError) => {
    if (uploadError) {
      next(normalizeUploadError(uploadError));
      return;
    }

    const uploadedFile = req.file;
    const originalName = uploadedFile ? decodeUploadName(uploadedFile.originalname) : null;

    try {
      await validateUploadedDocx(uploadedFile);

      const timeoutError = createError(408, "processing_timeout", "合同解析超时，请稍后重试或缩小文件内容。");
      const doc = await withTimeout(
        () => extractDocxParagraphs(uploadedFile.path),
        REQUEST_TIMEOUT_MS,
        timeoutError
      );
      const analysis = await withTimeout(
        () => analyzeLeaseContract(doc),
        REQUEST_TIMEOUT_MS,
        timeoutError
      );

      if (!analysis.accepted) {
        throw createError(400, analysis.reasonCode || "unsupported_contract_type", analysis.reason);
      }

      const durationMs = Date.now() - req.startedAt;
      log("info", "review_succeeded", {
        requestId: req.requestId,
        fileName: originalName,
        fileSize: uploadedFile.size,
        durationMs
      });

      sendSuccess(
        res,
        {
          fileName: originalName,
          generatedAt: new Date().toISOString(),
          ...analysis
        },
        "合同审查完成。"
      );
    } catch (error) {
      next(error);
    } finally {
      if (uploadedFile?.path) {
        fs.promises.unlink(uploadedFile.path).catch(() => {});
      }
    }
  });
});

app.use((error, req, res, _next) => {
  const normalized = normalizeUploadError(error);
  const status = normalized.status || 500;
  const message = normalized.expose === false
    ? "服务内部错误，请稍后重试。"
    : normalized.message || "服务内部错误，请稍后重试。";

  log("error", "review_failed", {
    requestId: req.requestId,
    status,
    errorCode: normalized.code || "internal_error",
    message,
    durationMs: req.startedAt ? Date.now() - req.startedAt : undefined
  });

  if (res.headersSent) {
    return;
  }

  res.status(status).json({
    success: false,
    errorCode: normalized.code || "internal_error",
    message
  });
});

const server = app.listen(PORT, () => {
  console.log(`Contract intel reader listening on http://localhost:${PORT}`);
});

server.requestTimeout = REQUEST_TIMEOUT_MS + 5000;
server.headersTimeout = REQUEST_TIMEOUT_MS + 10000;
