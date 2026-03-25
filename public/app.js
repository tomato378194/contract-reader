const form = document.getElementById("upload-form");
const fileInput = document.getElementById("contract");
const statusEl = document.getElementById("status");
const submitBtn = document.getElementById("submit-btn");
const resultSection = document.getElementById("result-section");
const basicInfoEl = document.getElementById("basic-info");
const suggestionEl = document.getElementById("suggestion");
const riskListEl = document.getElementById("risk-list");
const contractTextEl = document.getElementById("contract-text");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMultilineText(text) {
  return escapeHtml(text).replace(/\n\n/g, "<br /><br />").replace(/\n/g, "<br />");
}

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

function evidenceKey(prefix, index, subIndex = null) {
  return subIndex == null ? `${prefix}-${index}` : `${prefix}-${index}-${subIndex}`;
}

function buildEvidenceList(basicInfo, risks) {
  const items = [];

  basicInfo.forEach((item, index) => {
    if (item.evidence && Number.isInteger(item.evidence.start) && Number.isInteger(item.evidence.end)) {
      items.push({
        key: evidenceKey("basic", index),
        ...item.evidence
      });
    }
  });

  risks.forEach((risk, riskIndex) => {
    risk.evidence.forEach((item, evidenceIndex) => {
      if (Number.isInteger(item.start) && Number.isInteger(item.end)) {
        items.push({
          key: evidenceKey(`risk-${risk.id}`, riskIndex, evidenceIndex),
          ...item
        });
      }
    });
  });

  return items
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .filter((item) => item.start < item.end);
}

function groupHighlights(items) {
  const groups = [];

  items.forEach((item) => {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && item.start <= lastGroup.end) {
      lastGroup.end = Math.max(lastGroup.end, item.end);
      lastGroup.keys.push(item.key);
      return;
    }

    groups.push({
      start: item.start,
      end: item.end,
      keys: [item.key]
    });
  });

  return groups;
}

function renderContractText(fullText, basicInfo, risks) {
  if (!fullText) {
    contractTextEl.innerHTML = `<p class="meta">未提取到合同原文。</p>`;
    return {};
  }

  const anchorMap = {};
  const groups = groupHighlights(buildEvidenceList(basicInfo, risks));
  let cursor = 0;
  let html = "";

  groups.forEach((group, index) => {
    const anchorId = `highlight-${index + 1}`;
    group.keys.forEach((key) => {
      anchorMap[key] = anchorId;
    });

    html += renderMultilineText(fullText.slice(cursor, group.start));
    html += `<mark id="${anchorId}" class="doc-highlight">${renderMultilineText(fullText.slice(group.start, group.end))}</mark>`;
    cursor = group.end;
  });

  html += renderMultilineText(fullText.slice(cursor));
  contractTextEl.innerHTML = `<article class="contract-doc">${html}</article>`;

  return anchorMap;
}

function buildJumpLink(anchorId, text) {
  if (!anchorId) {
    return "";
  }

  return `<a class="jump-link" href="#${anchorId}">${escapeHtml(text)}</a>`;
}

function renderBasicInfo(items, anchorMap) {
  basicInfoEl.innerHTML = items
    .map((item, index) => {
      const evidence = item.evidence;
      const anchorId = anchorMap[evidenceKey("basic", index)];
      const quote = evidence ? `<p class="meta">引用：${escapeHtml(evidence.excerpt || evidence.quote)}</p>` : "";
      const jump = anchorId ? `<div class="basic-info__jump">${buildJumpLink(anchorId, "查看原文高光")}</div>` : "";

      return `
        <div class="info-item">
          <strong>${escapeHtml(item.label)}</strong>
          <div class="info-value">${escapeHtml(item.value)}</div>
          ${quote}
          ${jump}
        </div>
      `;
    })
    .join("");
}

function renderSuggestion(suggestion, legalBasis) {
  suggestionEl.innerHTML = `
    <div class="review-summary__header">
      <div class="review-summary__title">建议动作</div>
      <div class="suggestion-badge ${suggestionClass(suggestion.action)}">${escapeHtml(suggestion.action)}</div>
    </div>
    <p class="review-summary__text">${escapeHtml(suggestion.rationale)}</p>
    <p class="meta">${escapeHtml(legalBasis)}</p>
  `;
  suggestionEl.classList.remove("hidden");
}

function renderRisks(risks, anchorMap) {
  riskListEl.innerHTML = risks
    .map((risk, riskIndex) => {
      const links = risk.evidence.length
        ? `
          <div class="risk-links">
            ${risk.evidence
              .map((item, evidenceIndex) => {
                const anchorId = anchorMap[evidenceKey(`risk-${risk.id}`, riskIndex, evidenceIndex)];
                const linkText = item.excerpt || item.quote || "查看原文引用";
                return anchorId ? buildJumpLink(anchorId, linkText) : "";
              })
              .join("")}
          </div>
        `
        : `<p class="meta">当前风险未识别到可直接定位的原文引用，说明合同可能缺失相关条款。</p>`;

      return `
        <div class="risk-item">
          <span class="tag ${risk.severity}">${severityLabel(risk.severity)}</span>
          <strong>${escapeHtml(risk.title)}</strong>
          <p>${escapeHtml(risk.summary)}</p>
          <p class="meta">建议动作：${escapeHtml(risk.recommendation)}</p>
          ${links}
        </div>
      `;
    })
    .join("");
}

function clearResults() {
  basicInfoEl.innerHTML = "";
  suggestionEl.innerHTML = "";
  suggestionEl.classList.add("hidden");
  riskListEl.innerHTML = "";
  contractTextEl.innerHTML = "";
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

    const anchorMap = renderContractText(data.fullText, data.basicInfo, data.risks);
    renderBasicInfo(data.basicInfo, anchorMap);
    renderSuggestion(data.suggestion, data.legalBasis);
    renderRisks(data.risks, anchorMap);
    resultSection.classList.remove("hidden");
    setStatus(`审核完成：${data.fileName}`);
  } catch (_error) {
    setStatus("网络或服务异常，未能完成审核。", true);
  } finally {
    submitBtn.disabled = false;
  }
});
