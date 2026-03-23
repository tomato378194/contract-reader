const form = document.getElementById("upload-form");
const fileInput = document.getElementById("contract");
const statusEl = document.getElementById("status");
const submitBtn = document.getElementById("submit-btn");
const resultSection = document.getElementById("result-section");
const basicInfoEl = document.getElementById("basic-info");
const suggestionEl = document.getElementById("suggestion");
const riskListEl = document.getElementById("risk-list");
const paragraphsEl = document.getElementById("paragraphs");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "var(--bad)" : "var(--muted)";
}

function severityLabel(level) {
  if (level === "high") return "高风险";
  if (level === "medium") return "中风险";
  return "低风险";
}

function suggestionClass(action) {
  if (action === "不可以签") return "bad";
  if (action === "咨询专业人士") return "warn";
  return "ok";
}

function renderBasicInfo(items) {
  basicInfoEl.innerHTML = items
    .map((item) => {
      const jump = item.paragraphId
        ? `<div class="basic-info__jump"><a class="jump-link" href="#${item.paragraphId}">定位原文</a></div>`
        : "";
      return `
        <div class="info-item">
          <strong>${item.label}</strong>
          <div>${item.value}</div>
          ${jump}
        </div>
      `;
    })
    .join("");
}

function renderSuggestion(suggestion, legalBasis) {
  suggestionEl.innerHTML = `
    <div class="suggestion-badge ${suggestionClass(suggestion.action)}">${suggestion.action}</div>
    <p>${suggestion.rationale}</p>
    <p class="meta">${legalBasis}</p>
  `;
}

function renderRisks(risks) {
  riskListEl.innerHTML = risks
    .map((risk) => {
      const links = risk.evidence.length
        ? `
          <div class="risk-links">
            ${risk.evidence
              .map(
                (item) =>
                  `<a class="jump-link" href="#${item.paragraphId}" title="${item.excerpt}">查看证据定位</a>`
              )
              .join("")}
          </div>
        `
        : `<p class="meta">当前风险未识别到可直接定位的原文段落，说明合同可能缺失相关条款。</p>`;

      return `
        <div class="risk-item">
          <span class="tag ${risk.severity}">${severityLabel(risk.severity)}</span>
          <strong>${risk.title}</strong>
          <p>${risk.summary}</p>
          <p class="meta">建议动作：${risk.recommendation}</p>
          ${links}
        </div>
      `;
    })
    .join("");
}

function renderParagraphs(paragraphs) {
  paragraphsEl.innerHTML = paragraphs
    .map(
      (paragraph) => `
        <article id="${paragraph.id}" class="paragraph">
          <div class="paragraph__index">第 ${paragraph.index} 段</div>
          <div>${paragraph.text}</div>
        </article>
      `
    )
    .join("");
}

function clearResults() {
  basicInfoEl.innerHTML = "";
  suggestionEl.innerHTML = "";
  riskListEl.innerHTML = "";
  paragraphsEl.innerHTML = "";
  resultSection.classList.add("hidden");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearResults();

  const file = fileInput.files[0];
  if (!file) {
    setStatus("请选择需要审核的 .docx 文件。", true);
    return;
  }

  if (!/\.docx$/i.test(file.name)) {
    setStatus("仅支持上传 .docx 格式文件。", true);
    return;
  }

  const formData = new FormData();
  formData.append("contract", file);

  submitBtn.disabled = true;
  setStatus("正在解析并审核合同，请稍候...");

  try {
    const response = await fetch("/api/review", {
      method: "POST",
      body: formData
    });
    const data = await response.json();

    if (!response.ok) {
      setStatus(data.message || "审核失败，请稍后再试。", true);
      return;
    }

    renderBasicInfo(data.basicInfo);
    renderSuggestion(data.suggestion, data.legalBasis);
    renderRisks(data.risks);
    renderParagraphs(data.paragraphs);
    resultSection.classList.remove("hidden");
    setStatus(`审核完成：${data.fileName}`);
  } catch (_error) {
    setStatus("网络或服务异常，未能完成审核。", true);
  } finally {
    submitBtn.disabled = false;
  }
});
