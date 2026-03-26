const form = document.getElementById("upload-form");
const fileInput = document.getElementById("contract");
const statusEl = document.getElementById("status");
const submitBtn = document.getElementById("submit-btn");
const resultSection = document.getElementById("result-section");
const basicInfoEl = document.getElementById("basic-info");
const suggestionEl = document.getElementById("suggestion");
const riskSummaryEl = document.getElementById("risk-summary");
const riskHighListEl = document.getElementById("risk-high-list");
const riskOptimizeListEl = document.getElementById("risk-optimize-list");
const legalSummaryEl = document.getElementById("legal-summary");
const lawReferenceListEl = document.getElementById("law-reference-list");
const lawRiskListEl = document.getElementById("law-risk-list");

let isSubmitting = false;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setStatus(message, tone = "info") {
  statusEl.textContent = message;
  if (tone === "error") {
    statusEl.style.color = "var(--bad)";
    return;
  }
  if (tone === "success") {
    statusEl.style.color = "var(--good)";
    return;
  }
  statusEl.style.color = "var(--muted)";
}

function updateSubmitState() {
  submitBtn.disabled = isSubmitting || !fileInput.files.length;
}

function setSubmitting(submitting) {
  isSubmitting = submitting;
  submitBtn.textContent = submitting
    ? submitBtn.dataset.loadingText
    : submitBtn.dataset.idleText;
  submitBtn.dataset.loading = String(submitting);
  updateSubmitState();
}

function severityLabel(level) {
  if (level === "high") return "高风险";
  if (level === "medium") return "建议优化";
  return "可继续关注";
}

function suggestionClass(action) {
  if (action === "暂不建议直接签署") return "bad";
  if (action === "建议修改后再审") return "warn";
  return "ok";
}

function lawStatusLabel(status) {
  if (status === "valid") return "现行有效";
  if (status === "invalid") return "存在问题";
  return "待补充";
}

function renderEvidenceList(evidence = []) {
  if (!evidence.length) {
    return "";
  }

  return evidence
    .map((item) => `<p class="meta">合同原文：${escapeHtml(item.excerpt || item.quote)}</p>`)
    .join("");
}

function renderBasicInfo(items) {
  basicInfoEl.innerHTML = items
    .map((item) => {
      const evidence = item.evidence
        ? `<p class="meta">识别依据：${escapeHtml(item.evidence.excerpt || item.evidence.quote)}</p>`
        : '<p class="meta">未识别到明确文本依据。</p>';

      return `
        <div class="info-item">
          <strong>${escapeHtml(item.label)}</strong>
          <div class="info-value">${escapeHtml(item.value)}</div>
          ${evidence}
        </div>
      `;
    })
    .join("");
}

function renderSuggestion(suggestion, legalDisclaimer) {
  suggestionEl.innerHTML = `
    <div class="review-summary__header">
      <div class="review-summary__title">审查结论</div>
      <div class="suggestion-badge ${suggestionClass(suggestion.action)}">${escapeHtml(suggestion.action)}</div>
    </div>
    <p class="review-summary__text">${escapeHtml(suggestion.rationale)}</p>
    <p class="meta">${escapeHtml(legalDisclaimer)}</p>
  `;
  suggestionEl.classList.remove("hidden");
}

function renderRiskItems(container, items, emptyText) {
  if (!items.length) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(emptyText)}</div>`;
    return;
  }

  container.innerHTML = items
    .map((risk) => `
      <div class="risk-item">
        <span class="tag ${risk.severity}">${severityLabel(risk.severity)}</span>
        <strong>${escapeHtml(risk.title)}</strong>
        <p>${escapeHtml(risk.summary)}</p>
        <p class="meta">处理建议：${escapeHtml(risk.recommendation)}</p>
        ${renderEvidenceList(risk.evidence)}
      </div>
    `)
    .join("");
}

function renderRiskReview(riskReview) {
  riskSummaryEl.textContent = riskReview.summary;
  renderRiskItems(riskHighListEl, riskReview.highRisks, "当前未识别到明显高风险条款。");
  renderRiskItems(riskOptimizeListEl, riskReview.optimizationItems, "当前没有需要补充的优化建议。");
}

function renderLawReferences(items) {
  if (!items.length) {
    lawReferenceListEl.innerHTML = '<div class="empty-state">未识别到明确法律名称。</div>';
    return;
  }

  lawReferenceListEl.innerHTML = items
    .map((item) => `
      <div class="info-item">
        <strong>${escapeHtml(item.name)}</strong>
        <div class="info-value law-status ${item.status}">${escapeHtml(lawStatusLabel(item.status))}</div>
        <p class="meta">${escapeHtml(item.message)}</p>
        ${item.evidence ? `<p class="meta">合同原文：${escapeHtml(item.evidence.excerpt || item.evidence.quote)}</p>` : ""}
      </div>
    `)
    .join("");
}

function renderLegalReview(legalReview) {
  legalSummaryEl.textContent = legalReview.summary;
  renderLawReferences(legalReview.referencedLaws);
  renderRiskItems(lawRiskListEl, legalReview.risks, "当前未识别到明显法律依据风险。");
}

function clearResults() {
  basicInfoEl.innerHTML = "";
  suggestionEl.innerHTML = "";
  suggestionEl.classList.add("hidden");
  riskSummaryEl.textContent = "";
  riskHighListEl.innerHTML = "";
  riskOptimizeListEl.innerHTML = "";
  legalSummaryEl.textContent = "";
  lawReferenceListEl.innerHTML = "";
  lawRiskListEl.innerHTML = "";
  resultSection.classList.add("hidden");
}

fileInput.addEventListener("change", () => {
  updateSubmitState();
  if (fileInput.files.length) {
    setStatus(`已选择文件：${fileInput.files[0].name}`);
    return;
  }
  setStatus("");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isSubmitting) {
    return;
  }

  clearResults();

  const file = fileInput.files[0];
  if (!file) {
    setStatus("请先选择需要审查的 DOCX 合同文件。", "error");
    updateSubmitState();
    return;
  }

  if (!/\.docx$/i.test(file.name)) {
    setStatus("仅支持上传 DOCX 格式合同。", "error");
    return;
  }

  const formData = new FormData();
  formData.append("contract", file);

  setSubmitting(true);
  setStatus("正在上传并审查合同，请稍候。");

  try {
    const response = await fetch("/api/review", {
      method: "POST",
      body: formData
    });
    const payload = await response.json().catch(() => ({
      success: false,
      message: "服务返回的数据格式异常，请稍后重试。"
    }));

    if (!response.ok || !payload.success) {
      setStatus(payload.message || "审查失败，请稍后再试。", "error");
      return;
    }

    const data = payload.data;
    renderBasicInfo(data.basicInfo || []);
    renderSuggestion(data.suggestion, data.legalDisclaimer || "");
    renderRiskReview(data.riskReview || { summary: "", highRisks: [], optimizationItems: [] });
    renderLegalReview(data.legalReview || { summary: "", referencedLaws: [], risks: [] });
    resultSection.classList.remove("hidden");
    setStatus(`审查完成：${data.fileName}`, "success");
  } catch (_error) {
    setStatus("网络或服务异常，未能完成审查。", "error");
  } finally {
    setSubmitting(false);
  }
});

updateSubmitState();
