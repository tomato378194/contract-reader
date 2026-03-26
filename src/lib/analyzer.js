function execPattern(pattern, text) {
  const flags = pattern.flags.replace(/g/g, "");
  return new RegExp(pattern.source, flags).exec(text);
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

function cleanValue(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^[：:\-]/, "")
    .trim();
}

function snippet(text) {
  const normalized = cleanValue(text);
  if (normalized.length <= 90) {
    return normalized;
  }
  return `${normalized.slice(0, 90)}...`;
}

function findSentenceRange(text, start, end) {
  let left = start;
  let right = end;

  while (left > 0 && !/[。；;\n]/.test(text[left - 1])) {
    left -= 1;
  }

  while (right < text.length && !/[。；;\n]/.test(text[right])) {
    right += 1;
  }

  return { start: left, end: right };
}

function createEvidence(paragraph, quote, startInParagraph = null, endInParagraph = null) {
  if (!paragraph) {
    return null;
  }

  const normalizedQuote = cleanValue(quote || paragraph.text);
  const start = typeof paragraph.start === "number"
    ? (startInParagraph == null ? paragraph.start : paragraph.start + startInParagraph)
    : null;
  const end = typeof paragraph.start === "number"
    ? (endInParagraph == null ? paragraph.end : paragraph.start + endInParagraph)
    : null;

  return {
    quote: normalizedQuote,
    excerpt: snippet(normalizedQuote),
    paragraphIndex: paragraph.index,
    start,
    end
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

function isHeadingLike(text) {
  const normalized = cleanValue(text);
  return /^(第[一二三四五六七八九十百千万0-9]+[条章节款项]|[一二三四五六七八九十]+、|（[一二三四五六七八九十]+）)/.test(normalized)
    || normalized.length <= 18;
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
    if (match) {
      const value = cleanValue(match[captureIndex] || match[0]);
      if (value) {
        return {
          value,
          evidence: createEvidenceFromMatch(paragraph, match, captureIndex)
        };
      }
    }
  }

  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    if (!isHeadingLike(paragraph.text)) {
      continue;
    }

    const headingMatch = findFirstMatch(paragraph.text, headingPatterns);
    if (!headingMatch) {
      continue;
    }

    for (let offset = 1; offset <= lookahead; offset += 1) {
      const nextParagraph = paragraphs[index + offset];
      if (!nextParagraph) {
        break;
      }

      const match = findFirstMatch(nextParagraph.text, followPatterns);
      if (match) {
        const value = cleanValue(match[captureIndex] || match[0]);
        if (value) {
          return {
            value,
            evidence: createEvidenceFromMatch(nextParagraph, match, captureIndex)
          };
        }
      }
    }
  }

  return notFoundValue();
}

function detectHouseLeaseContract(fullText) {
  const positiveSignals = [
    /房屋租赁合同/,
    /出租人|出租方|甲方/,
    /承租人|承租方|乙方/,
    /租赁期限|租期/,
    /租金/,
    /房屋地址|房屋坐落|房屋位置/
  ];

  return positiveSignals.filter((pattern) => pattern.test(fullText)).length >= 3;
}

function locateSubjects(paragraphs) {
  const lessor = extractFieldValue(paragraphs, {
    directPatterns: [
      /(?:甲方|出租方|出租人)\s*[:：]\s*([^\n，。；;]+)/,
      /(?:甲方|出租方|出租人)\s*[（(][^)）]{0,8}[）)]\s*[:：]?\s*([^\n，。；;]+)/,
      /出租方\s*(?:信息)?\s*[:：]?\s*([^\n，。；;]+)/,
      /出租方\s*（?甲方）?\s*[:：]?\s*([^\n，。；;]+)/,
      /出租人信息\s*[:：]?\s*([^\n，。；;]+)/,
      /甲方\s*([^\n，。；;]{2,30})/
    ],
    headingPatterns: [/^甲方$/, /^出租方$/, /^出租人$/, /出租方信息/, /出租人信息/],
    followPatterns: [
      /^([^\n，。；;]{2,30})$/,
      /([^\n，。；;]{2,30})/
    ]
  });

  const lessee = extractFieldValue(paragraphs, {
    directPatterns: [
      /(?:乙方|承租方|承租人)\s*[:：]\s*([^\n，。；;]+)/,
      /(?:乙方|承租方|承租人)\s*[（(][^)）]{0,8}[）)]\s*[:：]?\s*([^\n，。；;]+)/,
      /承租方\s*(?:信息)?\s*[:：]?\s*([^\n，。；;]+)/,
      /承租方\s*（?乙方）?\s*[:：]?\s*([^\n，。；;]+)/,
      /承租人信息\s*[:：]?\s*([^\n，。；;]+)/,
      /乙方\s*([^\n，。；;]{2,30})/
    ],
    headingPatterns: [/^乙方$/, /^承租方$/, /^承租人$/, /承租方信息/, /承租人信息/],
    followPatterns: [
      /^([^\n，。；;]{2,30})$/,
      /([^\n，。；;]{2,30})/
    ]
  });

  return { lessor, lessee };
}

function extractLeaseTerm(paragraphs) {
  const dateRange = /\d{4}年\d{1,2}月\d{1,2}日(?:起)?\s*(?:至|-|到)\s*\d{4}年\d{1,2}月\d{1,2}日(?:止)?/;
  return extractFieldValue(paragraphs, {
    directPatterns: [
      new RegExp(`(${dateRange.source})`),
      /租赁(?:期限|期间|期)\s*(?:为|是|[:：])\s*([^\n。；;]+)/,
      /自\s*(\d{4}年\d{1,2}月\d{1,2}日.*?至.*?\d{4}年\d{1,2}月\d{1,2}日)/,
      /租期\s*(?:为|是|[:：])\s*([^\n。；;]+)/
    ],
    captureIndex: 1,
    headingPatterns: [/租赁期限/, /租期/, /租赁期间/],
    followPatterns: [
      new RegExp(`(${dateRange.source})`),
      /(自\s*\d{4}年\d{1,2}月\d{1,2}日.*?至.*?\d{4}年\d{1,2}月\d{1,2}日)/,
      /([^\n。；;]*(?:个月|月|年))/,
      /([^\n。；;]+)/
    ]
  });
}

function extractLocation(paragraphs) {
  return extractFieldValue(paragraphs, {
    directPatterns: [
      /(?:房屋(?:坐落|地址|位置)|租赁房屋(?:坐落|地址|位置)?|房屋所在地)\s*(?:为|在|位于|[:：])\s*([^\n。；;]+)/,
      /坐落于\s*([^\n。；;]+)/,
      /位于\s*([^\n。；;]+(?:室|号|栋|单元|层|楼))/,
      /房屋地址\s*[:：]\s*([^\n。；;]+)/
    ],
    headingPatterns: [/房屋地址/, /房屋坐落/, /租赁房屋/, /租赁地点/],
    followPatterns: [
      /(位于[^\n。；;]+)/,
      /(坐落于[^\n。；;]+)/,
      /([^\n。；;]+(?:室|号|栋|单元|层|楼))/
    ]
  });
}

function extractRent(paragraphs) {
  return extractFieldValue(paragraphs, {
    directPatterns: [
      /(?:每月租金|月租金|租金标准|租金)\s*(?:为|是|按|[:：])\s*([^\n。；;]+)/,
      /租金\s*人民币\s*([^\n。；;]+)/,
      /每月\s*([^\n。；;]*元)/
    ],
    headingPatterns: [/租金/, /付款方式/, /支付方式/],
    followPatterns: [
      /(人民币[^\n。；;]+)/,
      /(每月[^\n。；;]*元)/,
      /([^\n。；;]+元)/
    ]
  });
}

function buildBasicInfo(paragraphs) {
  const subjects = locateSubjects(paragraphs);
  const leaseTerm = extractLeaseTerm(paragraphs);
  const location = extractLocation(paragraphs);
  const rent = extractRent(paragraphs);

  return [
    { label: "合同主体-出租方", ...subjects.lessor },
    { label: "合同主体-承租方", ...subjects.lessee },
    { label: "租赁期限", ...leaseTerm },
    { label: "租赁地点", ...location },
    { label: "租金", ...rent }
  ];
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
      title: "未明确优先承租安排",
      summary: "合同没有清晰约定续租通知、同等条件优先承租或放弃方式，后续续租争议风险较高。",
      recommendation: "建议补充续租通知期限、是否享有优先承租权以及行权方式。",
      evidence: []
    };
  }

  if (/放弃优先承租/.test(hit.paragraph.text)) {
    return {
      id: "priority-lease",
      severity: "high",
      title: "存在放弃优先承租权表述",
      summary: "合同中出现放弃优先承租权的文字，可能明显削弱承租方在续租阶段的议价和保障能力。",
      recommendation: "建议删除或重新协商该条款，至少明确在同等条件下的续租优先安排。",
      evidence: [createEvidenceFromMatch(hit.paragraph, hit.match)]
    };
  }

  return {
    id: "priority-lease",
    severity: "low",
    title: "已识别优先承租相关条款",
    summary: "合同包含优先承租或同等条件续租安排，但仍应核对通知期限和触发条件是否明确。",
    recommendation: "重点检查通知期限、回复方式和同等条件的认定标准。",
    evidence: [createEvidenceFromMatch(hit.paragraph, hit.match)]
  };
}

function evaluateDepositAndPayment(paragraphs) {
  const hits = collectParagraphs(paragraphs, [
    /押金/,
    /保证金/,
    /租金.*支付/,
    /付款方式/,
    /按[一二三四五六七八九十0-9]+(?:个月|月|季|季度|年)支付/
  ]);

  if (!hits.length) {
    return {
      id: "deposit-payment",
      severity: "high",
      title: "未明确押金与付款条款",
      summary: "合同中未识别到押金、支付周期或付款方式约定，后续履约和退款争议风险较高。",
      recommendation: "建议明确押金金额、返还条件、支付周期、支付时间和支付方式。",
      evidence: []
    };
  }

  const heavyPrepay = hits.find((item) => /按[一二三四五六七八九十0-9]+(?:个月|季|季度|年)支付/.test(item.paragraph.text));
  if (heavyPrepay) {
    return {
      id: "deposit-payment",
      severity: "medium",
      title: "预付周期较长",
      summary: "合同中存在较长周期预付安排，可能增加承租方的资金占压和退款协调成本。",
      recommendation: "建议缩短预付周期，并明确押金返还时间及扣减依据。",
      evidence: [createSentenceEvidence(heavyPrepay.paragraph, heavyPrepay.match)]
    };
  }

  return {
    id: "deposit-payment",
    severity: "low",
    title: "已识别押金和付款条款",
    summary: "合同已包含押金或付款安排，但仍应核对押金返还条件和付款凭证要求。",
    recommendation: "建议确认押金返还时点、扣减范围和租金支付留痕方式。",
    evidence: hits.slice(0, 2).map((item) => createSentenceEvidence(item.paragraph, item.match))
  };
}

function evaluateDefaultLiability(paragraphs) {
  const hits = collectParagraphs(paragraphs, [
    /违约责任/,
    /解除合同/,
    /赔偿责任/,
    /承担损失/,
    /违约方/
  ]);

  if (!hits.length) {
    return {
      id: "default-liability",
      severity: "high",
      title: "缺少明确违约责任条款",
      summary: "合同未清晰约定违约责任、解除条件或损失承担机制，发生纠纷时执行难度较高。",
      recommendation: "建议补充双方违约情形、整改期限、解除条件和损失承担方式。",
      evidence: []
    };
  }

  const unilateral = hits.find(
    (item) => /乙方|承租人/.test(item.paragraph.text) && !/甲方|出租人|出租方/.test(item.paragraph.text)
  );
  if (unilateral) {
    return {
      id: "default-liability",
      severity: "medium",
      title: "违约责任可能偏向单方",
      summary: "识别到主要针对承租方的违约表述，出租方对应责任可能不够完整，存在责任不对等风险。",
      recommendation: "建议补充出租方迟延交房、权属瑕疵、提前解约等违约责任。",
      evidence: [createSentenceEvidence(unilateral.paragraph, unilateral.match)]
    };
  }

  return {
    id: "default-liability",
    severity: "low",
    title: "已识别违约责任条款",
    summary: "合同包含违约和解除安排，但仍建议核对双方责任是否对等、触发条件是否清晰。",
    recommendation: "重点检查整改期限、损失计算方式和解除生效条件。",
    evidence: hits.slice(0, 2).map((item) => createSentenceEvidence(item.paragraph, item.match))
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
      summary: "合同未识别到违约金或损失计算方式，发生违约时举证和索赔成本可能较高。",
      recommendation: "建议补充违约金、损失赔偿和过高调减机制的约定。",
      evidence: []
    };
  }

  const excessive = hits.find((item) => /30%|50%|双倍|三倍|6个月|12个月/.test(item.paragraph.text));
  if (excessive) {
    return {
      id: "liquidated-damages",
      severity: "high",
      title: "违约金设置可能偏高",
      summary: "合同中存在较高比例或倍数化违约金表述，后续可能引发调减争议，也会增加签约风险。",
      recommendation: "建议使违约金与实际损失、租金水平和违约情形相匹配，避免明显失衡。",
      evidence: [createSentenceEvidence(excessive.paragraph, excessive.match)]
    };
  }

  return {
    id: "liquidated-damages",
    severity: "low",
    title: "已识别违约金条款",
    summary: "合同包含违约金约定，但仍建议复核比例、触发条件和调整空间是否合理。",
    recommendation: "建议核对违约金触发场景，并评估是否与实际损失大致相称。",
    evidence: hits.slice(0, 2).map((item) => createSentenceEvidence(item.paragraph, item.match))
  };
}

function evaluateOwnership(paragraphs) {
  const hit = matchParagraph(paragraphs, [
    /房产证/,
    /不动产权证/,
    /房屋所有权/,
    /有权出租/,
    /转租授权/
  ]);

  if (!hit) {
    return {
      id: "ownership",
      severity: "medium",
      title: "未识别出租权属说明",
      summary: "合同中未明确体现出租方对房屋享有合法出租权，存在权属或转租授权风险。",
      recommendation: "建议补充房屋权属证明、转租授权或有权出租声明。",
      evidence: []
    };
  }

  return {
    id: "ownership",
    severity: "low",
    title: "已识别出租权属相关条款",
    summary: "合同中包含房屋权属或有权出租表述，但仍建议核验附件证照与合同主体是否一致。",
    recommendation: "建议核验房产证、不动产权证或授权文件与签约主体是否一致。",
    evidence: [createEvidenceFromMatch(hit.paragraph, hit.match)]
  };
}

const LAW_RULES = [
  {
    canonicalName: "《中华人民共和国民法典》",
    aliases: [/中华人民共和国民法典/, /民法典/],
    status: "valid",
    message: "现行有效，可作为合同条款和争议处理的核心法律依据。"
  },
  {
    canonicalName: "《中华人民共和国合同法》",
    aliases: [/中华人民共和国合同法/, /合同法/],
    status: "invalid",
    message: "该法已于 2021 年 1 月 1 日随《中华人民共和国民法典》施行而废止，建议改为引用《中华人民共和国民法典》。"
  },
  {
    canonicalName: "《中华人民共和国民法通则》",
    aliases: [/中华人民共和国民法通则/, /民法通则/],
    status: "invalid",
    message: "该法已不再作为现行合同审查的主要依据，建议改为引用《中华人民共和国民法典》。"
  },
  {
    canonicalName: "《中华人民共和国民法总则》",
    aliases: [/中华人民共和国民法总则/, /民法总则/],
    status: "invalid",
    message: "该法内容已被《中华人民共和国民法典》整合吸收，不建议继续单独作为合同依据引用。"
  }
];

function collectLawReferences(paragraphs) {
  const references = [];

  for (const rule of LAW_RULES) {
    for (const paragraph of paragraphs) {
      const match = findFirstMatch(paragraph.text, rule.aliases);
      if (match) {
        references.push({
          name: rule.canonicalName,
          status: rule.status,
          message: rule.message,
          evidence: createEvidenceFromMatch(paragraph, match)
        });
        break;
      }
    }
  }

  return references;
}

function buildLegalReview(paragraphs, fullText) {
  const referencedLaws = collectLawReferences(paragraphs);
  const risks = [];

  if (!referencedLaws.length) {
    risks.push({
      id: "missing-legal-basis",
      severity: "medium",
      title: "未识别到明确法律依据",
      summary: "合同中没有识别出明确的法律名称，建议补充法律适用条款，减少争议解决时的解释分歧。",
      recommendation: "建议增加适用法律条款，明确以《中华人民共和国民法典》等现行有效法律法规为依据。",
      evidence: []
    });
  }

  const invalidLaws = referencedLaws.filter((item) => item.status === "invalid");
  if (invalidLaws.length) {
    risks.push({
      id: "invalid-legal-reference",
      severity: "high",
      title: "存在已失效或不宜继续单独引用的法律",
      summary: `识别到 ${invalidLaws.map((item) => item.name).join("、")}，其中至少一项已失效或不建议继续单独引用，可能影响条款专业性和法律适用准确性。`,
      recommendation: "建议统一改为引用《中华人民共和国民法典》，并同步核对相关条文表述是否需要更新。",
      evidence: invalidLaws.map((item) => item.evidence).filter(Boolean)
    });
  }

  if (invalidLaws.length && referencedLaws.some((item) => item.status === "valid")) {
    risks.push({
      id: "mixed-legal-reference",
      severity: "medium",
      title: "存在新旧法律混用",
      summary: "合同同时引用现行法律和已失效法律，容易造成法律依据混乱，影响条款表述的专业性。",
      recommendation: "建议统一法律依据口径，保留现行有效法律，并删除失效法律引用。",
      evidence: referencedLaws.map((item) => item.evidence).filter(Boolean).slice(0, 2)
    });
  }

  const hasApplicableLawClause = /法律适用|适用法律|争议解决|准据法/.test(fullText);
  if (referencedLaws.length && !hasApplicableLawClause) {
    risks.push({
      id: "weak-applicable-law-clause",
      severity: "low",
      title: "建议补充明确的法律适用条款",
      summary: "虽然识别到了法律名称，但合同中未明显出现独立的法律适用或争议解决条款，建议进一步规范表达。",
      recommendation: "建议单独增加法律适用和争议解决条款，提升合同完整性。",
      evidence: []
    });
  }

  const overallStatus = invalidLaws.length
    ? "warning"
    : referencedLaws.length
      ? "valid"
      : "missing";

  const summary = overallStatus === "warning"
    ? "检测到法律依据存在失效引用或混用风险，建议优先修正。"
    : overallStatus === "valid"
      ? "已识别到现行法律依据，但仍建议核对条款表述是否完整。"
      : "暂未识别到明确法律依据，建议补充法律适用条款。";

  return {
    overallStatus,
    summary,
    referencedLaws,
    risks
  };
}

function buildRiskReview(paragraphs) {
  const items = [
    evaluatePriorityLease(paragraphs),
    evaluateDepositAndPayment(paragraphs),
    evaluateDefaultLiability(paragraphs),
    evaluateLiquidatedDamages(paragraphs),
    evaluateOwnership(paragraphs)
  ];

  const highRisks = items.filter((item) => item.severity === "high");
  const optimizationItems = items.filter((item) => item.severity !== "high");
  const summary = highRisks.length
    ? `识别到 ${highRisks.length} 项高风险，另有 ${optimizationItems.length} 项建议优化。`
    : `未识别到明显高风险，整理出 ${optimizationItems.length} 项建议优化点。`;

  return {
    summary,
    highRisks,
    optimizationItems
  };
}

function decideAction(riskReview, legalReview, basicInfo) {
  const missingCoreInfo = basicInfo.filter((item) => item.value === "未识别").length >= 3;
  const businessHighCount = riskReview.highRisks.length;
  const legalHighCount = legalReview.risks.filter((item) => item.severity === "high").length;
  const totalHighCount = businessHighCount + legalHighCount;

  if (missingCoreInfo || totalHighCount >= 2) {
    return {
      action: "暂不建议直接签署",
      rationale: "核心信息缺失较多或高风险问题集中出现，建议先补充条款并修正法律依据后再继续。"
    };
  }

  if (totalHighCount === 1 || riskReview.optimizationItems.some((item) => item.severity === "medium") || legalReview.risks.length) {
    return {
      action: "建议修改后再审",
      rationale: "合同存在需要重点修订或复核的条款，建议先调整后再决定是否签署。"
    };
  }

  return {
    action: "可继续推进",
    rationale: "当前文本已识别出核心信息，未发现明显高风险或失效法律引用，但签署前仍应结合原件和附件核验。"
  };
}

function analyzeLeaseContract(doc) {
  try {
    const paragraphs = Array.isArray(doc?.paragraphs) ? doc.paragraphs : [];
    const fullText = String(doc?.fullText || paragraphs.map((item) => item.text).join("\n\n"));

    if (!paragraphs.length || !fullText) {
      return {
        accepted: false,
        reasonCode: "empty_contract",
        reason: "合同正文为空，无法完成审查。"
      };
    }

    if (!detectHouseLeaseContract(fullText)) {
      return {
        accepted: false,
        reasonCode: "unsupported_contract_type",
        reason: "当前仅支持基于中国现行法律规则的房屋租赁合同审查，请上传对应类型的 DOCX 文件。"
      };
    }

    const basicInfo = buildBasicInfo(paragraphs);
    const riskReview = buildRiskReview(paragraphs);
    const legalReview = buildLegalReview(paragraphs, fullText);
    const suggestion = decideAction(riskReview, legalReview, basicInfo);

    return {
      accepted: true,
      scope: "仅限中国房屋租赁合同审查",
      legalDisclaimer: "以下结果基于规则识别生成，仅用于合同初步筛查，不构成正式法律意见。",
      fullText,
      basicInfo,
      riskReview,
      legalReview,
      suggestion
    };
  } catch (_error) {
    return {
      accepted: false,
      reasonCode: "analysis_failed",
      reason: "合同审查失败，请稍后重试。"
    };
  }
}

module.exports = {
  analyzeLeaseContract
};
