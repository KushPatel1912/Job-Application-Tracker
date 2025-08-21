/** @format */

// Port of contentScript to TypeScript with the same heuristics

const JT_DEBOUNCE_MS = 8000;
let jtLastSubmitAt = 0;

function normalizedText(
  node: Element | null | undefined
): string {
  return (
    (node as any)?.innerText ||
    (node as any)?.textContent ||
    ""
  ).trim();
}

function includesAny(
  text: string,
  keywords: string[]
) {
  const t = (text || "").toLowerCase();
  return keywords.some((k) => t.includes(k));
}

function getInputValue(
  el:
    | HTMLInputElement
    | HTMLSelectElement
    | HTMLTextAreaElement
    | null
): string {
  if (!el) return "";
  const tag = (el.tagName || "").toUpperCase();
  const type =
    (el as HTMLInputElement).type?.toLowerCase?.() ||
    "";
  if (type === "checkbox")
    return (el as HTMLInputElement).checked
      ? "Yes"
      : "No";
  if (tag === "SELECT") {
    const sel = el as HTMLSelectElement;
    return (
      sel.options?.[sel.selectedIndex]?.text ||
      sel.value ||
      ""
    );
  }
  return (el as HTMLInputElement).value || "";
}

function findByLabel(
  form: Element | Document,
  keywordList: string[]
) {
  const labels = form
    ? Array.from(form.querySelectorAll("label"))
    : [];
  for (const label of labels) {
    const labelText =
      normalizedText(label).toLowerCase();
    if (!labelText) continue;
    if (
      keywordList.some((k) => labelText.includes(k))
    ) {
      const forId = label.getAttribute("for");
      if (forId) {
        const target = form.querySelector(
          `#${CSS.escape(forId)}`
        ) as any;
        const v = getInputValue(target);
        if (v) return v.trim();
      }
      const input = label.querySelector(
        "input,select,textarea"
      ) as any;
      const v2 = getInputValue(input);
      if (v2) return v2.trim();
    }
  }
  return "";
}

function findByAttr(
  form: Element | Document,
  keywordList: string[]
) {
  const fields = Array.from(
    form?.querySelectorAll("input,select,textarea") ||
      []
  );
  for (const field of fields) {
    const name = (
      field.getAttribute("name") || ""
    ).toLowerCase();
    const id = ((field as any).id || "").toLowerCase();
    const aria = (
      field.getAttribute("aria-label") || ""
    ).toLowerCase();
    const placeholder = (
      field.getAttribute("placeholder") || ""
    ).toLowerCase();
    const hay = `${name} ${id} ${aria} ${placeholder}`;
    if (keywordList.some((k) => hay.includes(k))) {
      const v = getInputValue(field as any);
      if (v) return v.trim();
    }
  }
  return "";
}

function findResumeFilename(
  form?: Element | Document | null
) {
  const inputs = Array.from(
    form?.querySelectorAll('input[type="file"]') || []
  );
  for (const input of inputs) {
    const fileInput = input as HTMLInputElement;
    if (
      fileInput.files &&
      fileInput.files.length > 0
    ) {
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
  const titleCandidate =
    titleMeta?.getAttribute("content") ||
    document.title ||
    "";
  const companyEl = document.querySelector(
    '[data-company-name], [class*="company" i], [class*="employer" i]'
  );
  const companyCandidate = normalizedText(
    companyEl || undefined
  );
  const locationEl = document.querySelector(
    '[class*="location" i], [data-test*="location" i]'
  );
  const locationCandidate = normalizedText(
    locationEl || undefined
  );
  const bodyText =
    document.body?.innerText?.toLowerCase() || "";
  let workMode = "";
  if (bodyText.includes("remote")) workMode = "Remote";
  else if (bodyText.includes("hybrid"))
    workMode = "Hybrid";
  else if (
    bodyText.includes("on-site") ||
    bodyText.includes("onsite") ||
    bodyText.includes("on site")
  )
    workMode = "On-site";
  return {
    title: titleCandidate,
    company: companyCandidate,
    location: locationCandidate,
    workMode,
  };
}

function isLikelyJobApplication(
  form?: Element | Document | null
) {
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
    "greenhouse.io",
  ];
  const urlLikely =
    urlVendors.some((v) => urlStr.includes(v)) ||
    includesAny(urlStr, [
      "job",
      "jobs",
      "careers",
      "apply",
    ]);

  const scope = (form as Element) || document;
  const fields = Array.from(
    scope.querySelectorAll("input,select,textarea")
  ) as HTMLInputElement[];
  const hasPassword = fields.some(
    (f) =>
      (f.getAttribute("type") || "").toLowerCase() ===
      "password"
  );
  if (hasPassword) return false;

  const textOnPage = (
    document.body?.innerText || ""
  ).toLowerCase();
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
      "cover letter",
    ]
  );
  const hasResumeInput = fields.some(
    (f) =>
      (f.getAttribute("type") || "").toLowerCase() ===
      "file"
  );
  const hasCoverLetterField = fields.some((f) => {
    const name = (
      f.getAttribute("name") || ""
    ).toLowerCase();
    const id = (f.id || "").toLowerCase();
    const aria = (
      f.getAttribute("aria-label") || ""
    ).toLowerCase();
    const placeholder = (
      f.getAttribute("placeholder") || ""
    ).toLowerCase();
    const hay = `${name} ${id} ${aria} ${placeholder}`;
    return includesAny(hay, ["cover", "cover letter"]);
  });
  const submitButtons = Array.from(
    scope.querySelectorAll(
      'button,input[type="submit"], [role="button"]'
    )
  );
  const hasApplyButton = submitButtons.some((btn) =>
    includesAny(
      (
        (btn as HTMLElement).innerText ||
        (btn as HTMLInputElement).value ||
        btn.textContent ||
        ""
      )
        .trim()
        .toLowerCase(),
      [
        "apply",
        "submit application",
        "send application",
        "apply now",
        "submit",
      ]
    )
  );
  const meaningfulFields = fields.filter((f) => {
    const type = (
      f.getAttribute("type") || ""
    ).toLowerCase();
    return (
      ["hidden", "button", "submit", "reset"].indexOf(
        type
      ) === -1
    );
  });
  const fieldCountOk =
    meaningfulFields.length >= 3 ||
    hasResumeInput ||
    hasCoverLetterField;
  const signals = [
    urlLikely,
    hasJobKeywordsOnPage,
    hasResumeInput,
    hasCoverLetterField,
    hasApplyButton,
    fieldCountOk,
  ];
  const strongSignalCount =
    signals.filter(Boolean).length;
  return strongSignalCount >= 2 && !hasPassword;
}

function extractJobData(
  form?: Element | Document | null
) {
  const nowIso = new Date().toISOString().slice(0, 10);
  const url = location.href;
  const companyKeywords = [
    "company",
    "organisation",
    "organization",
    "employer",
    "org",
  ];
  const locationKeywords = [
    "location",
    "city",
    "state",
    "country",
  ];
  const titleKeywords = [
    "title",
    "position",
    "role",
    "job title",
  ];
  const modeKeywords = [
    "remote",
    "hybrid",
    "on-site",
    "onsite",
    "on site",
    "work type",
    "work mode",
  ];
  const scope = (form as Element) || document;
  const byLabel = {
    company: findByLabel(scope, companyKeywords),
    location: findByLabel(scope, locationKeywords),
    title: findByLabel(scope, titleKeywords),
    workMode: findByLabel(scope, modeKeywords),
  };
  const byAttr = {
    company:
      byLabel.company ||
      findByAttr(scope, companyKeywords),
    location:
      byLabel.location ||
      findByAttr(scope, locationKeywords),
    title:
      byLabel.title ||
      findByAttr(scope, titleKeywords),
    workMode:
      byLabel.workMode ||
      findByAttr(scope, modeKeywords),
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
    resume,
  };
}

async function sendSubmission(data: any) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "JOB_APPLICATION_SUBMITTED",
      payload: data,
    });
    return response;
  } catch (e: any) {
    return {
      ok: false,
      error: String(e?.message || e),
    };
  }
}

function handleSubmitEvent(e: Event) {
  const now = Date.now();
  if (now - jtLastSubmitAt < JT_DEBOUNCE_MS) return;
  jtLastSubmitAt = now;
  const form =
    e.target instanceof HTMLFormElement
      ? e.target
      : null;
  if (!isLikelyJobApplication(form)) return;
  const data = extractJobData(form || document);
  setTimeout(() => {
    void sendSubmission(data);
  }, 10);
}

function handleClickEvent(e: Event) {
  const el = e.target as HTMLElement | null;
  if (!el) return;
  const label = (
    el.innerText ||
    el.textContent ||
    ""
  ).trim();
  if (!label) return;
  if (
    includesAny(label, [
      "apply",
      "submit",
      "send application",
      "apply now",
      "submit application",
    ])
  ) {
    const form = el.closest("form");
    if (isLikelyJobApplication(form || document)) {
      handleSubmitEvent({
        target: form || document,
      } as any);
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
