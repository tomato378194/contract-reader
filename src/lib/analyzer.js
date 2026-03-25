function execPattern(pattern, text) {
  const flags = pattern.flags.replace(/g/g, "");
  const regex = new RegExp(pattern.source, flags);
  return regex.exec(text);
}

function findFirstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = execPattern(pattern, text);
    if (match) {
      return match;
    }
  }
  return null;
}

function matchParagraph(paragraphs, patterns) {
  for (const paragraph of paragraphs) {
    const match = findFirstMatch(paragraph.text, patterns);
    if (match) {
      return { paragraph, match };
    }
  }
  return null;
}

function collectParagraphs(paragraphs, patterns) {
  return paragraphs
    .map((paragraph) => {
      const match = findFirstMatch(paragraph.text, patterns);
      return match ? { paragraph, match } : null;
    })
    .filter(Boolean);
}

function snippet(text) {
  if (text.length <= 80) {
    return text;
  }
  return `${text.slice(0, 80)}...`;
}

function cleanValue(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^[：:\-—\s]+/, "")
    .trim();
}

function isHeadingLike(text) {
  return /^第[一二三四五六七八九十百千零\d]+[条章节款项]\s*[\u4e00-\u9fa5A-Za-z0-9（）()]{0,20}$/.test(text)
    || /^(租赁期限|租期|租赁地点|房屋地址|房屋坐落|租金|租赁费用)$/.test(text.trim());
}

function createEvidence(paragraph, quote, startInParagraph = null, endInParagraph = null) {
  const normalizedQuote = cleanValue(quote || paragraph.text);
  const start = startInParagraph == null
    ? paragraph.start
    : paragraph.start + startInParagraph;
  const end = endInParagraph == null
    ? paragraph.end
    : paragraph.start + endInParagraph;

  return {
    quote: normalizedQuote,
    excerpt: snippet(normalizedQuote),
    start,
    end,
    paragraphIndex: paragraph.index
  };
}

function createEvidenceFromMatch(paragraph, match, captureIndex = 0) {
  const value = match[captureIndex] || match[0];
  const fullMatch = match[0];
  const fullMatchIndex = match.index ?? paragraph.text.indexOf(fullMatch);
  const offsetInMatch = fullMatch.indexOf(value);
  const startInParagraph = fullMatchIndex + Math.max(offsetInMatch, 0);
  const endInParagraph = startInParagraph + value.length;
  return createEvidence(paragraph, value, startInParagraph, endInParagraph);
}

function findSentenceRange(text, start, end) {
  let left = start;
  let right = end;

  while (left > 0 && !/[。；\n]/.test(text[left - 1])) {
    left -= 1;
  }
  while (right < text.length && !/[。；\n]/.test(text[right])) {
    right += 1;
  }

  return {
    start: left,
    end: right
  };
}

function createSentenceEvidence(paragraph, match) {
  const start = match.index ?? paragraph.text.indexOf(match[0]);
  const end = start + match[0].length;
  const range = findSentenceRange(paragraph.text, start, end);
  return createEvidence(paragraph, paragraph.text.slice(range.start, range.end), range.start, range.end);
}

function notFoundValue() {
  return {
    value: "未识别",
    evidence: null
  };
}

function extractFieldValue(paragraphs, options) {
  const {
    directPatterns,
    captureIndex = 1,
    headingPatterns = [],
    followPatterns = directPatterns,
    lookahead = 2
  } = options;

  for (const paragraph of paragraphs) {
    const match = findFirstMatch(paragraph.text, directPatterns);
    if (match && cleanValue(match[captureIndex] || match[0])) {
      return {
        value: cleanValue(match[captureIndex] || match[0]),
        evidence: createEvidenceFromMatch(paragraph, match, captureIndex)
      };
    }
  }

  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    if (!headingPatterns.some((pattern) => pattern.test(paragraph.text)) || !isHeadingLike(paragraph.text)) {
      continue;
    }

    for (let offset = 1; offset <= lookahead; offset += 1) {
      const nextParagraph = paragraphs[index + offset];
      if (!nextParagraph) {
        break;
      }

      const match = findFirstMatch(nextParagraph.text, followPatterns);
      if (match && cleanValue(match[captureIndex] || match[0])) {
        return {
          value: cleanValue(match[captureIndex] || match[0]),
          evidence: createEvidenceFromMatch(nextParagraph, match, captureIndex)
        };
      }
    }
  }

  return notFoundValue();
}

function detectHouseLeaseContract(fullText) {
  const positiveSignals = [
    /房屋租赁合同/,
    /出租人|承租人/,
    /租赁期限|租期/,
    /租金/,
    /房屋坐落|房屋地址|坐落于/
  ];

  const hits = positiveSignals.filter((pattern) => pattern.test(fullText)).length;
  return hits >= 3;
}

function locateSubjects(paragraphs) {
  const lessor = extractFieldValue(paragraphs, {
    directPatterns: [
      /出租人[（(]甲方[）)]?[:：]?\s*([^，。；]+)/,
      /甲方[:：]\s*([^，。；]+)/,
      /出租方[:：]\s*([^，。；]+)/
    ]
  });
  const lessee = extractFieldValue(paragraphs, {
    directPatterns: [
      /承租人[（(]乙方[）)]?[:：]?\s*([^，。；]+)/,
      /乙方[:：]\s*([^，。；]+)/,
      /承租方[:：]\s*([^，。；]+)/
    ]
  });

  return {
    lessor,
    lessee
  };
}

function extractLeaseTerm(paragraphs) {
  const dateRange = /\d{4}年\d{1,2}月\d{1,2}日/;
  return extractFieldValue(paragraphs, {
    directPatterns: [
      new RegExp(`(自${dateRange.source}(?:起)?至${dateRange.source}止)`),
      /租赁期限[为是:：]?\s*(自[^，。；]*至[^，。；]*止)/,
      /租赁期限[为是:：]?\s*([^，。；]*(?:年|个月|月|天))/,
      /租期[为是:：]?\s*(自[^，。；]*至[^，。；]*止)/,
      /租期[为是:：]?\s*([^，。；]*(?:年|个月|月|天))/,
      /(期限共计[^，。；]*(?:年|个月|月|天))/,
      /(租赁期共计[^，。；]*(?:年|个月|月|天))/
    ],
    captureIndex: 1,
    headingPatterns: [/租赁期限/, /租期/],
    followPatterns: [
      new RegExp(`(自${dateRange.source}(?:起)?至${dateRange.source}止)`),
      /(共计[^，。；]*(?:年|个月|月|天))/,
      /(期限[^，。；]*(?:年|个月|月|天))/,
      /(租期[^，。；]*(?:年|个月|月|天))/
    ]
  });
}

function extractLocation(paragraphs) {
  return extractFieldValue(paragraphs, {
    directPatterns: [
      /房屋(?:坐落|地址)[于为:：]?\s*([^，。；]+)/,
      /坐落于\s*([^，。；]+)/,
      /租赁(?:房屋|场地|标的)(?:位于|地址为?)\s*([^，。；]+)/,
      /地址为\s*([^，。；]+)/
    ],
    headingPatterns: [/房屋坐落/, /房屋地址/, /租赁地点/, /租赁场地/],
    followPatterns: [
      /(坐落于[^，。；]+)/,
      /(位于[^，。；]+)/,
      /(地址为[^，。；]+)/
    ]
  });
}

function extractRent(paragraphs) {
  return extractFieldValue(paragraphs, {
    directPatterns: [
      /(?:每月|月|每季度|每年)租金[为是:：]?\s*([^，。；]+)/,
      /租金(?:标准)?[为是:：]?\s*([^，。；]+)/,
      /租金[^，。；]*人民币\s*([^，。；]+)/
    ],
    headingPatterns: [/租金/, /租赁费用/, /付款方式/],
    followPatterns: [
      /(人民币[^，。；]+)/,
      /(每月[^，。；]*元)/,
      /(每季度[^，。；]*元)/,
      /(每年[^，。；]*元)/
    ]
  });
}

function buildBasicInfo(paragraphs) {
  const subjects = locateSubjects(paragraphs);
  const leaseTerm = extractLeaseTerm(paragraphs);
  const location = extractLocation(paragraphs);
  const rent = extractRent(paragraphs);

  return [
    { label: "合同主体-出租人", ...subjects.lessor },
    { label: "合同主体-承租人", ...subjects.lessee },
    { label: "租赁期限", ...leaseTerm },
    { label: "租赁地点", ...location },
    { label: "租金", ...rent }
  ];
}

function paragraphEvidence(paragraph, match) {
  return createSentenceEvidence(paragraph, match);
}

function evaluatePriorityLease(paragraphs) {
  const hit = matchParagraph(paragraphs, [
    /优先承租/,
    /同等条件下.*承租/,
    /放弃优先承租/
  ]);

  if (!hit) {
    return {
      id: "priority-lease",
      severity: "medium",
      title: "未明确优先承租权安排",
      summary: "合同未清晰约定同等条件下承租人的优先承租权或其处理方式，续租争议风险较高。",
      evidence: [],
      recommendation: "建议补充续租通知期、是否享有优先承租权以及行权条件。"
    };
  }

  if (/放弃优先承租/.test(hit.paragraph.text)) {
    return {
      id: "priority-lease",
      severity: "high",
      title: "存在放弃优先承租权表述",
      summary: "合同出现放弃优先承租权字样，续租时可能明显不利于承租人。",
      evidence: [paragraphEvidence(hit.paragraph, hit.match)],
      recommendation: "建议删除或重新协商该表述，明确承租人在同等条件下的续租优先安排。"
    };
  }

  return {
    id: "priority-lease",
    severity: "low",
    title: "已出现优先承租权相关条款",
    summary: "合同包含优先承租权或同等条件续租安排，但仍应核实通知期限和行权方式是否完整。",
    evidence: [paragraphEvidence(hit.paragraph, hit.match)],
    recommendation: "检查通知期限、回复期限和同等条件认定标准。"
  };
}

function evaluateDepositAndPayment(paragraphs) {
  const hits = collectParagraphs(paragraphs, [
    /押金/,
    /保证金/,
    /租金.*支付/,
    /押[一二三四五六七八九十\d].*付[一二三四五六七八九十\d]/
  ]);

  if (!hits.length) {
    return {
      id: "deposit-payment",
      severity: "high",
      title: "未明确租金与押付条款",
      summary: "合同中未识别到押金、保证金或租金支付周期条款，履约争议风险高。",
      evidence: [],
      recommendation: "建议明确押金金额、返还条件、支付周期、支付时间和支付方式。"
    };
  }

  const strongRisk = hits.find((item) => /押[三四五六七八九十\d].*付/.test(item.paragraph.text));
  if (strongRisk) {
    return {
      id: "deposit-payment",
      severity: "medium",
      title: "押付周期对承租人负担较重",
      summary: "合同出现较长押付周期或较重预付安排，可能增加资金占压风险。",
      evidence: [paragraphEvidence(strongRisk.paragraph, strongRisk.match)],
      recommendation: "建议协商缩短预付周期，并明确押金返还触发条件和期限。"
    };
  }

  return {
    id: "deposit-payment",
    severity: "low",
    title: "已识别租金押付条款",
    summary: "合同包含押金或租金支付条款，但应继续核实返还条件、违约扣减依据是否明确。",
    evidence: hits.slice(0, 2).map((item) => paragraphEvidence(item.paragraph, item.match)),
    recommendation: "重点确认押金返还时间、扣减范围和付款凭证要求。"
  };
}

function evaluateDefaultLiability(paragraphs) {
  const hits = collectParagraphs(paragraphs, [
    /违约责任/,
    /违约方/,
    /解除合同/,
    /承担.*损失/
  ]);

  if (!hits.length) {
    return {
      id: "default-liability",
      severity: "high",
      title: "缺少明确违约责任条款",
      summary: "未识别到违约责任、解除条件或损失承担机制，发生争议时执行难度较高。",
      evidence: [],
      recommendation: "建议补充双方违约情形、整改期限、解除条件和损失承担方式。"
    };
  }

  const unilateral = hits.find(
    (item) => /乙方.*违约|承租人.*违约/.test(item.paragraph.text) && !/甲方|出租人/.test(item.paragraph.text)
  );
  if (unilateral) {
    return {
      id: "default-liability",
      severity: "medium",
      title: "违约责任可能偏向单方",
      summary: "识别到主要针对承租人的违约责任表述，出租人违约责任可能不足。",
      evidence: [paragraphEvidence(unilateral.paragraph, unilateral.match)],
      recommendation: "建议补充出租人逾期交房、权属瑕疵、提前解约等违约责任。"
    };
  }

  return {
    id: "default-liability",
    severity: "low",
    title: "已识别违约责任条款",
    summary: "合同包含违约责任安排，建议继续核实双方责任是否对等、解除条件是否清晰。",
    evidence: hits.slice(0, 2).map((item) => paragraphEvidence(item.paragraph, item.match)),
    recommendation: "检查通知整改期限、损失计算口径和解除生效条件。"
  };
}

function evaluateLiquidatedDamages(paragraphs) {
  const hits = collectParagraphs(paragraphs, [
    /违约金/,
    /按.*%.*支付/,
    /双倍返还/,
    /支付.*月租金/
  ]);

  if (!hits.length) {
    return {
      id: "liquidated-damages",
      severity: "medium",
      title: "未明确违约金设置",
      summary: "未识别违约金或损失赔偿计算规则，发生违约时举证和执行成本较高。",
      evidence: [],
      recommendation: "建议补充违约金、损失赔偿和过高调整机制的约定。"
    };
  }

  const excessive = hits.find((item) => /30%|50%|双倍|三倍|六个月|12个月/.test(item.paragraph.text));
  if (excessive) {
    return {
      id: "liquidated-damages",
      severity: "high",
      title: "违约金设置可能明显偏高",
      summary: "合同存在较高比例或倍数化违约金表述，后续可能面临调整争议，也会加重签约风险。",
      evidence: [paragraphEvidence(excessive.paragraph, excessive.match)],
      recommendation: "建议将违约金与实际损失、租金水平和违约情形相匹配，避免明显失衡。"
    };
  }

  return {
    id: "liquidated-damages",
    severity: "low",
    title: "已识别违约金相关条款",
    summary: "合同包含违约金安排，但仍应核实比例、触发条件和调整空间是否合理。",
    evidence: hits.slice(0, 2).map((item) => paragraphEvidence(item.paragraph, item.match)),
    recommendation: "检查违约金触发场景是否明确，并评估是否与实际损失大体相称。"
  };
}

function evaluateOwnership(paragraphs) {
  const hit = matchParagraph(paragraphs, [
    /房产证/,
    /不动产权证/,
    /房屋所有权/,
    /出租人保证.*有权出租/
  ]);

  if (!hit) {
    return {
      id: "ownership",
      severity: "medium",
      title: "未识别出租权属保证",
      summary: "合同未清晰体现出租人对房屋拥有合法出租权，可能存在权属或转租授权风险。",
      evidence: [],
      recommendation: "建议补充房屋权属证明、转租授权或有权出租声明。"
    };
  }

  return {
    id: "ownership",
    severity: "low",
    title: "已识别出租权属相关条款",
    summary: "合同包含房屋权属或有权出租表述，可进一步核验附件证明材料是否齐备。",
    evidence: [paragraphEvidence(hit.paragraph, hit.match)],
    recommendation: "核验房产证、不动产权证或授权文件与合同主体是否一致。"
  };
}

function decideAction(risks, basicInfo) {
  const highCount = risks.filter((item) => item.severity === "high").length;
  const missingCoreInfo = basicInfo.filter((item) => item.value === "未识别").length >= 3;

  if (missingCoreInfo || highCount >= 2) {
    return {
      action: "不可以签",
      rationale: "核心信息缺失较多或高风险项较集中，当前文本不适合直接签署。"
    };
  }

  if (highCount === 1 || risks.some((item) => item.severity === "medium")) {
    return {
      action: "咨询专业人士",
      rationale: "合同存在需要重点核验或协商的条款，建议在补充证据或修改后再决定。"
    };
  }

  return {
    action: "可以签",
    rationale: "已识别核心信息且未发现明显高风险条款，但仍应结合实际材料核验。"
  };
}

function analyzeLeaseContract(doc) {
  const paragraphs = doc.paragraphs || [];
  const fullText = doc.fullText || paragraphs.map((item) => item.text).join("\n\n");

  if (!detectHouseLeaseContract(fullText)) {
    return {
      accepted: false,
      reasonCode: "unsupported_contract_type",
      reason: "仅支持基于中国现行法律法规的房屋租赁合同审核。当前文件未识别为房屋租赁合同，请重新上传。"
    };
  }

  const basicInfo = buildBasicInfo(paragraphs);
  const risks = [
    evaluatePriorityLease(paragraphs),
    evaluateDepositAndPayment(paragraphs),
    evaluateDefaultLiability(paragraphs),
    evaluateLiquidatedDamages(paragraphs),
    evaluateOwnership(paragraphs)
  ];
  const suggestion = decideAction(risks, basicInfo);

  return {
    accepted: true,
    scope: "仅限中国房屋租赁合同审核",
    legalBasis: "基于中国现行法律法规的一般性合同审阅规则生成，结果不构成正式法律意见。",
    fullText,
    basicInfo,
    risks,
    suggestion
  };
}

module.exports = {
  analyzeLeaseContract
};
