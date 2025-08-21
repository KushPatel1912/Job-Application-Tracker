const JT_DEBOUNCE_MS = 8e3;
let jtLastSubmitAt = 0;
function normalizedText(node) {
  return (node?.innerText || node?.textContent || "").trim();
}
function includesAny(text, keywords) {
  const t = (text || "").toLowerCase();
  return keywords.some((k) => t.includes(k));
}
function getInputValue(el) {
  if (!el) return "";
  const tag = (el.tagName || "").toUpperCase();
  const type = el.type?.toLowerCase?.() || "";
  if (type === "checkbox")
    return el.checked ? "Yes" : "No";
  if (tag === "SELECT") {
    const sel = el;
    return sel.options?.[sel.selectedIndex]?.text || sel.value || "";
  }
  return el.value || "";
}
function findByLabel(form, keywordList) {
  const labels = form ? Array.from(form.querySelectorAll("label")) : [];
  for (const label of labels) {
    const labelText = normalizedText(label).toLowerCase();
    if (!labelText) continue;
    if (keywordList.some((k) => labelText.includes(k))) {
      const forId = label.getAttribute("for");
      if (forId) {
        const target = form.querySelector(
          `#${CSS.escape(forId)}`
        );
        const v = getInputValue(target);
        if (v) return v.trim();
      }
      const input = label.querySelector(
        "input,select,textarea"
      );
      const v2 = getInputValue(input);
      if (v2) return v2.trim();
    }
  }
  return "";
}
function findByAttr(form, keywordList) {
  const fields = Array.from(
    form?.querySelectorAll("input,select,textarea") || []
  );
  for (const field of fields) {
    const name = (field.getAttribute("name") || "").toLowerCase();
    const id = (field.id || "").toLowerCase();
    const aria = (field.getAttribute("aria-label") || "").toLowerCase();
    const placeholder = (field.getAttribute("placeholder") || "").toLowerCase();
    const hay = `${name} ${id} ${aria} ${placeholder}`;
    if (keywordList.some((k) => hay.includes(k))) {
      const v = getInputValue(field);
      if (v) return v.trim();
    }
  }
  return "";
}
function findResumeFilename(form) {
  const inputs = Array.from(
    form?.querySelectorAll('input[type="file"]') || []
  );
  for (const input of inputs) {
    const fileInput = input;
    if (fileInput.files && fileInput.files.length > 0) {
      return fileInput.files[0]?.name || "";
    }
    if (fileInput.value) {
      const parts = fileInput.value.split(/[\\/]/);
      return parts[parts.length - 1] || "";
    }
  }
  return "";
}
function pageHeuristics() {
  const titleMeta = document.querySelector(
    'meta[property="og:title"], meta[name="title"]'
  );
  const titleCandidate = titleMeta?.getAttribute("content") || document.title || "";
  const companyEl = document.querySelector(
    '[data-company-name], [class*="company" i], [class*="employer" i]'
  );
  const companyCandidate = normalizedText(
    companyEl || void 0
  );
  const locationEl = document.querySelector(
    '[class*="location" i], [data-test*="location" i]'
  );
  const locationCandidate = normalizedText(
    locationEl || void 0
  );
  const bodyText = document.body?.innerText?.toLowerCase() || "";
  let workMode = "";
  if (bodyText.includes("remote")) workMode = "Remote";
  else if (bodyText.includes("hybrid"))
    workMode = "Hybrid";
  else if (bodyText.includes("on-site") || bodyText.includes("onsite") || bodyText.includes("on site"))
    workMode = "On-site";
  return {
    title: titleCandidate,
    company: companyCandidate,
    location: locationCandidate,
    workMode
  };
}
function isLikelyJobApplication(form) {
  const urlStr = (location.href || "").toLowerCase();
  const urlVendors = [
    "greenhouse",
    "lever.co",
    "boards.greenhouse.io",
    "workday",
    "myworkdayjobs",
    "ashbyhq",
    "ashby",
    "smartrecruiters",
    "workable",
    "icims",
    "bamboohr",
    "jobs.lever",
    "workforcenow",
    "jobvite",
    "recruitee",
    "lever",
    "greenhouse.io"
  ];
  const urlLikely = urlVendors.some((v) => urlStr.includes(v)) || includesAny(urlStr, [
    "job",
    "jobs",
    "careers",
    "apply"
  ]);
  const scope = form || document;
  const fields = Array.from(
    scope.querySelectorAll("input,select,textarea")
  );
  const hasPassword = fields.some(
    (f) => (f.getAttribute("type") || "").toLowerCase() === "password"
  );
  if (hasPassword) return false;
  const textOnPage = (document.body?.innerText || "").toLowerCase();
  const hasJobKeywordsOnPage = includesAny(
    textOnPage,
    [
      "apply",
      "job",
      "position",
      "role",
      "employment",
      "experience",
      "resume",
      "cv",
      "cover letter"
    ]
  );
  const hasResumeInput = fields.some(
    (f) => (f.getAttribute("type") || "").toLowerCase() === "file"
  );
  const hasCoverLetterField = fields.some((f) => {
    const name = (f.getAttribute("name") || "").toLowerCase();
    const id = (f.id || "").toLowerCase();
    const aria = (f.getAttribute("aria-label") || "").toLowerCase();
    const placeholder = (f.getAttribute("placeholder") || "").toLowerCase();
    const hay = `${name} ${id} ${aria} ${placeholder}`;
    return includesAny(hay, ["cover", "cover letter"]);
  });
  const submitButtons = Array.from(
    scope.querySelectorAll(
      'button,input[type="submit"], [role="button"]'
    )
  );
  const hasApplyButton = submitButtons.some(
    (btn) => includesAny(
      (btn.innerText || btn.value || btn.textContent || "").trim().toLowerCase(),
      [
        "apply",
        "submit application",
        "send application",
        "apply now",
        "submit"
      ]
    )
  );
  const meaningfulFields = fields.filter((f) => {
    const type = (f.getAttribute("type") || "").toLowerCase();
    return ["hidden", "button", "submit", "reset"].indexOf(
      type
    ) === -1;
  });
  const fieldCountOk = meaningfulFields.length >= 3 || hasResumeInput || hasCoverLetterField;
  const signals = [
    urlLikely,
    hasJobKeywordsOnPage,
    hasResumeInput,
    hasCoverLetterField,
    hasApplyButton,
    fieldCountOk
  ];
  const strongSignalCount = signals.filter(Boolean).length;
  return strongSignalCount >= 2 && !hasPassword;
}
function extractJobData(form) {
  const nowIso = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const url = location.href;
  const companyKeywords = [
    "company",
    "organisation",
    "organization",
    "employer",
    "org"
  ];
  const locationKeywords = [
    "location",
    "city",
    "state",
    "country"
  ];
  const titleKeywords = [
    "title",
    "position",
    "role",
    "job title"
  ];
  const modeKeywords = [
    "remote",
    "hybrid",
    "on-site",
    "onsite",
    "on site",
    "work type",
    "work mode"
  ];
  const scope = form || document;
  const byLabel = {
    company: findByLabel(scope, companyKeywords),
    location: findByLabel(scope, locationKeywords),
    title: findByLabel(scope, titleKeywords),
    workMode: findByLabel(scope, modeKeywords)
  };
  const byAttr = {
    company: byLabel.company || findByAttr(scope, companyKeywords),
    location: byLabel.location || findByAttr(scope, locationKeywords),
    title: byLabel.title || findByAttr(scope, titleKeywords),
    workMode: byLabel.workMode || findByAttr(scope, modeKeywords)
  };
  const heur = pageHeuristics();
  const resume = findResumeFilename(scope);
  return {
    company: byAttr.company || heur.company || "",
    location: byAttr.location || heur.location || "",
    title: byAttr.title || heur.title || "",
    workMode: byAttr.workMode || heur.workMode || "",
    applicationDate: nowIso,
    url,
    resume
  };
}
async function sendSubmission(data) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "JOB_APPLICATION_SUBMITTED",
      payload: data
    });
    return response;
  } catch (e) {
    return {
      ok: false,
      error: String(e?.message || e)
    };
  }
}
function handleSubmitEvent(e) {
  const now = Date.now();
  if (now - jtLastSubmitAt < JT_DEBOUNCE_MS) return;
  jtLastSubmitAt = now;
  const form = e.target instanceof HTMLFormElement ? e.target : null;
  if (!isLikelyJobApplication(form)) return;
  const data = extractJobData(form || document);
  setTimeout(() => {
    void sendSubmission(data);
  }, 10);
}
function handleClickEvent(e) {
  const el = e.target;
  if (!el) return;
  const label = (el.innerText || el.textContent || "").trim();
  if (!label) return;
  if (includesAny(label, [
    "apply",
    "submit",
    "send application",
    "apply now",
    "submit application"
  ])) {
    const form = el.closest("form");
    if (isLikelyJobApplication(form || document)) {
      handleSubmitEvent({
        target: form || document
      });
    }
  }
}
function initListeners() {
  document.addEventListener(
    "submit",
    handleSubmitEvent,
    true
  );
  document.addEventListener(
    "click",
    handleClickEvent,
    true
  );
}
initListeners();
