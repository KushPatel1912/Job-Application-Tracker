const JT_DEBOUNCE_MS = 8e3;
const AUTO_SAVE_INTERVAL = 3e3;
let jtLastSubmitAt = 0;
let hasUnsavedChanges = false;
let autoSaveInterval = null;
let isSubmitting = false;
const boundForms = /* @__PURE__ */ new WeakSet();
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
function generateFormId(form) {
  if (form.id) return form.id;
  if (form.action) return form.action.split("/").pop() || "unknown";
  return `form_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
function saveFormData(form) {
  try {
    const formId = generateFormId(form);
    const formData = new FormData(form);
    const data = {};
    for (const [key, value] of formData.entries()) {
      data[key] = value;
    }
    const formState = {
      formId,
      timestamp: Date.now(),
      data
    };
    localStorage.setItem(`jt_form_${formId}`, JSON.stringify(formState));
    hasUnsavedChanges = true;
  } catch (error) {
    console.warn("Job Tracker: Failed to save form data:", error);
  }
}
function restoreFormData(form) {
  try {
    const formId = generateFormId(form);
    const saved = localStorage.getItem(`jt_form_${formId}`);
    if (saved) {
      const formState = JSON.parse(saved);
      const { data } = formState;
      Object.entries(data).forEach(([key, value]) => {
        const field = form.querySelector(`[name="${key}"]`);
        if (field) {
          if (field.type === "checkbox") {
            field.checked = value === "Yes" || value === true;
          } else if (field.tagName === "SELECT") {
            field.value = value;
          } else {
            field.value = value;
          }
        }
      });
      hasUnsavedChanges = true;
      console.log("Job Tracker: Form data restored from localStorage");
    }
  } catch (error) {
    console.warn("Job Tracker: Failed to restore form data:", error);
  }
}
function clearFormData(form) {
  try {
    const formId = generateFormId(form);
    localStorage.removeItem(`jt_form_${formId}`);
    hasUnsavedChanges = false;
  } catch (error) {
    console.warn("Job Tracker: Failed to clear form data:", error);
  }
}
function startAutoSave(form) {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
  }
  autoSaveInterval = setInterval(() => {
    if (hasUnsavedChanges && !isSubmitting) {
      saveFormData(form);
    }
  }, AUTO_SAVE_INTERVAL);
}
function stopAutoSave() {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
    autoSaveInterval = null;
  }
}
function addLoadingState(form) {
  const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    const originalText = submitBtn.value || submitBtn.textContent || "Submit";
    submitBtn.setAttribute("data-original-text", originalText);
    submitBtn.value = submitBtn.textContent = "Submitting...";
    if (submitBtn.tagName === "BUTTON") {
      submitBtn.innerHTML = '<span class="loading-spinner">⏳</span> Submitting...';
    }
  }
}
function removeLoadingState(form) {
  const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = false;
    const originalText = submitBtn.getAttribute("data-original-text") || "Submit";
    submitBtn.value = submitBtn.textContent = originalText;
    if (submitBtn.tagName === "BUTTON") {
      submitBtn.innerHTML = originalText;
    }
  }
}
function handleBeforeUnload(event) {
  if (hasUnsavedChanges && !isSubmitting) {
    event.preventDefault();
    event.returnValue = "You have unsaved changes. Are you sure you want to leave?";
    return "You have unsaved changes. Are you sure you want to leave?";
  }
}
function handleInputChange(event) {
  const target = event.target;
  if (target && target.form) {
    hasUnsavedChanges = true;
    saveFormData(target.form);
  }
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
  let companyCandidate = "";
  const companyMeta = document.querySelector('meta[property="og:site_name"], meta[name="author"], meta[property="article:author"]');
  if (companyMeta) {
    companyCandidate = normalizedText(companyMeta);
  }
  if (!companyCandidate) {
    const headerSelectors = [
      'header [class*="logo"]',
      'header [class*="brand"]',
      'header [class*="company"]',
      'nav [class*="logo"]',
      'nav [class*="brand"]',
      ".logo",
      ".brand",
      '[data-test*="logo"]',
      '[data-test*="brand"]',
      '[class*="header"] [class*="company"]',
      '[class*="navbar"] [class*="company"]'
    ];
    for (const selector of headerSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = normalizedText(element);
        if (text && text.length > 0 && text.length < 50) {
          companyCandidate = text;
          break;
        }
      }
    }
  }
  if (!companyCandidate) {
    const companyEl = document.querySelector(
      '[data-company-name], [class*="company" i], [class*="employer" i]'
    );
    companyCandidate = normalizedText(companyEl || void 0);
  }
  if (!companyCandidate) {
    const hostname = window.location.hostname;
    if (hostname && !hostname.includes("localhost") && !hostname.includes("127.0.0.1")) {
      const domainParts = hostname.split(".");
      if (domainParts.length >= 2) {
        const companyFromDomain = domainParts[domainParts.length - 2];
        if (companyFromDomain && companyFromDomain.length > 2) {
          companyCandidate = companyFromDomain.charAt(0).toUpperCase() + companyFromDomain.slice(1);
        }
      }
    }
  }
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
function formatUsDate(d) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}
function extractJobData(form) {
  const nowUs = formatUsDate(/* @__PURE__ */ new Date());
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
    applicationDate: nowUs,
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
  const form = e.target instanceof HTMLFormElement ? e.target : null;
  if (!form || !isLikelyJobApplication(form)) return;
  if (isSubmitting) {
    e.preventDefault();
    return;
  }
  if (e.type !== "submit") {
    return;
  }
  jtLastSubmitAt = now;
  isSubmitting = true;
  addLoadingState(form);
  stopAutoSave();
  const data = extractJobData(form);
  setTimeout(async () => {
    try {
      const result = await sendSubmission(data);
      if (result?.ok) {
        clearFormData(form);
        hasUnsavedChanges = false;
        console.log("Job Tracker: Form submitted successfully, data cleared");
      }
    } catch (error) {
      console.warn("Job Tracker: Submission failed:", error);
    } finally {
      isSubmitting = false;
      removeLoadingState(form);
    }
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
    if (form && (el.type === "submit" || el.getAttribute("type") === "submit")) {
      return;
    }
    console.log("Job Tracker: Apply button clicked, but waiting for actual form submission");
    return;
  }
}
function initializeFormProtection() {
  window.addEventListener("beforeunload", handleBeforeUnload);
  document.addEventListener("input", handleInputChange, true);
  document.addEventListener("change", handleInputChange, true);
  const forms = document.querySelectorAll("form");
  forms.forEach((formEl) => {
    const form = formEl;
    if (isLikelyJobApplication(form)) {
      restoreFormData(form);
      startAutoSave(form);
      if (!boundForms.has(form)) {
        form.addEventListener("submit", handleSubmitEvent, true);
        boundForms.add(form);
      }
    }
  });
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node;
          const newForms = element.matches("form") ? [element] : Array.from(element.querySelectorAll("form"));
          newForms.forEach((f) => {
            const form = f;
            if (isLikelyJobApplication(form)) {
              restoreFormData(form);
              startAutoSave(form);
              if (!boundForms.has(form)) {
                form.addEventListener("submit", handleSubmitEvent, true);
                boundForms.add(form);
              }
            }
          });
        }
      });
    });
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}
function initListeners() {
  initializeFormProtection();
  document.addEventListener(
    "click",
    handleClickEvent,
    true
  );
}
window.addEventListener("unload", () => {
  stopAutoSave();
  window.removeEventListener("beforeunload", handleBeforeUnload);
});
initListeners();
