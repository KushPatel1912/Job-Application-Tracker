/** @format */

// Content script: heuristically capture job application data on form submission or apply button click
// Enhanced with form protection features

const JT_DEBOUNCE_MS = 8000;
const AUTO_SAVE_INTERVAL = 3000; // 3 seconds
let jtLastSubmitAt = 0;
let hasUnsavedChanges = false;
let autoSaveInterval: NodeJS.Timeout | null = null;
let isSubmitting = false;

// Track forms we've already bound to prevent duplicate listeners
const boundForms = new WeakSet<HTMLFormElement>();

// Form protection: Track form state and prevent data loss
interface FormState {
  formId: string;
  timestamp: number;
  data: Record<string, any>;
}

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

function getInputValue(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null): string {
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

// Form protection: Generate unique form ID
function generateFormId(form: HTMLFormElement): string {
  if (form.id) return form.id;
  if (form.action) return form.action.split('/').pop() || 'unknown';
  return `form_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Form protection: Save form data to localStorage
function saveFormData(form: HTMLFormElement): void {
  try {
    const formId = generateFormId(form);
    const formData = new FormData(form);
    const data: Record<string, any> = {};
    
    for (const [key, value] of formData.entries()) {
      data[key] = value;
    }
    
    const formState: FormState = {
      formId,
      timestamp: Date.now(),
      data
    };
    
    localStorage.setItem(`jt_form_${formId}`, JSON.stringify(formState));
    hasUnsavedChanges = true;
  } catch (error) {
    console.warn('Job Tracker: Failed to save form data:', error);
  }
}

// Form protection: Restore form data from localStorage
function restoreFormData(form: HTMLFormElement): void {
  try {
    const formId = generateFormId(form);
    const saved = localStorage.getItem(`jt_form_${formId}`);
    
    if (saved) {
      const formState: FormState = JSON.parse(saved);
      const { data } = formState;
      
      // Restore form values
      Object.entries(data).forEach(([key, value]) => {
        const field = form.querySelector(`[name="${key}"]`) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        if (field) {
          if (field.type === 'checkbox') {
            (field as HTMLInputElement).checked = value === 'Yes' || value === true;
          } else if (field.tagName === 'SELECT') {
            (field as HTMLSelectElement).value = value;
          } else {
            (field as HTMLInputElement).value = value;
          }
        }
      });
      
      hasUnsavedChanges = true;
      console.log('Job Tracker: Form data restored from localStorage');
    }
  } catch (error) {
    console.warn('Job Tracker: Failed to restore form data:', error);
  }
}

// Form protection: Clear saved form data
function clearFormData(form: HTMLFormElement): void {
  try {
    const formId = generateFormId(form);
    localStorage.removeItem(`jt_form_${formId}`);
    hasUnsavedChanges = false;
  } catch (error) {
    console.warn('Job Tracker: Failed to clear form data:', error);
  }
}

// Form protection: Start auto-save for a form
function startAutoSave(form: HTMLFormElement): void {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
  }
  
  autoSaveInterval = setInterval(() => {
    if (hasUnsavedChanges && !isSubmitting) {
      saveFormData(form);
    }
  }, AUTO_SAVE_INTERVAL);
}

// Form protection: Stop auto-save
function stopAutoSave(): void {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
    autoSaveInterval = null;
  }
}

// Form protection: Add loading state to submit button
function addLoadingState(form: HTMLFormElement): void {
  const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]') as HTMLButtonElement | HTMLInputElement;
  if (submitBtn) {
    submitBtn.disabled = true;
    const originalText = submitBtn.value || submitBtn.textContent || 'Submit';
    submitBtn.setAttribute('data-original-text', originalText);
    submitBtn.value = submitBtn.textContent = 'Submitting...';
    
    // Add loading spinner if it's a button
    if (submitBtn.tagName === 'BUTTON') {
      submitBtn.innerHTML = '<span class="loading-spinner">⏳</span> Submitting...';
    }
  }
}

// Form protection: Remove loading state from submit button
function removeLoadingState(form: HTMLFormElement): void {
  const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]') as HTMLButtonElement | HTMLInputElement;
  if (submitBtn) {
    submitBtn.disabled = false;
    const originalText = submitBtn.getAttribute('data-original-text') || 'Submit';
    submitBtn.value = submitBtn.textContent = originalText;
    
    if (submitBtn.tagName === 'BUTTON') {
      submitBtn.innerHTML = originalText;
    }
  }
}

// Form protection: beforeunload event handler
function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (hasUnsavedChanges && !isSubmitting) {
    event.preventDefault();
    event.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
    return 'You have unsaved changes. Are you sure you want to leave?';
  }
}

// Form protection: Track input changes
function handleInputChange(event: Event): void {
  const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  if (target && target.form) {
    hasUnsavedChanges = true;
    saveFormData(target.form);
  }
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
  
  // Enhanced company detection from multiple sources
  let companyCandidate = '';
  
  // 1. Try meta tags first
  const companyMeta = document.querySelector('meta[property="og:site_name"], meta[name="author"], meta[property="article:author"]');
  if (companyMeta) {
    companyCandidate = normalizedText(companyMeta);
  }
  
  // 2. Try logo/header area company names
  if (!companyCandidate) {
    // Look for company names in header/nav areas
    const headerSelectors = [
      'header [class*="logo"]',
      'header [class*="brand"]', 
      'header [class*="company"]',
      'nav [class*="logo"]',
      'nav [class*="brand"]',
      '.logo',
      '.brand',
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
  
  // 3. Try common company name patterns in page content
  if (!companyCandidate) {
    const companyEl = document.querySelector(
      '[data-company-name], [class*="company" i], [class*="employer" i]'
    );
    companyCandidate = normalizedText(companyEl || undefined);
  }
  
  // 4. Try extracting from URL if it's a company domain
  if (!companyCandidate) {
    const hostname = window.location.hostname;
    if (hostname && !hostname.includes('localhost') && !hostname.includes('127.0.0.1')) {
      const domainParts = hostname.split('.');
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

// Determine if a form/page is a likely job application, to avoid random forms (login, newsletter, etc.)
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

// Helper: format date as MM/DD/YYYY
function formatUsDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function extractJobData(
  form?: Element | Document | null
) {
  const nowUs = formatUsDate(new Date());
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
      byLabel.title || findByAttr(scope, titleKeywords),
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
    applicationDate: nowUs,
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

// Enhanced form submission handler with protection - only capture on actual form submissions
function handleSubmitEvent(e: Event) {
  const now = Date.now();
  if (now - jtLastSubmitAt < JT_DEBOUNCE_MS) return;
  
  const form = e.target instanceof HTMLFormElement ? e.target : null;
  if (!form || !isLikelyJobApplication(form)) return;
  
  // Prevent double submission
  if (isSubmitting) {
    e.preventDefault();
    return;
  }
  
  // Only proceed if this is an actual form submission (not just a button click)
  if (e.type !== 'submit') {
    return;
  }
  
  // Mark debounce timestamp
  jtLastSubmitAt = now;
  
  // Add loading state
  isSubmitting = true;
  addLoadingState(form);
  
  // Clear auto-save
  stopAutoSave();
  
  // Extract and send data
  const data = extractJobData(form);
  
  // Clear saved form data after successful submission
  setTimeout(async () => {
    try {
      const result = await sendSubmission(data);
      if (result?.ok) {
        clearFormData(form);
        hasUnsavedChanges = false;
        console.log('Job Tracker: Form submitted successfully, data cleared');
      }
    } catch (error) {
      console.warn('Job Tracker: Submission failed:', error);
    } finally {
      // Remove loading state
      isSubmitting = false;
      removeLoadingState(form);
    }
  }, 10);
}

// Enhanced click handler with form protection - only trigger on actual form submissions
function handleClickEvent(e: Event) {
  const el = e.target as HTMLElement | null;
  if (!el) return;
  
  const label = (
    el.innerText ||
    el.textContent ||
    ""
  ).trim();
  if (!label) return;
  
  // Only handle clicks that actually submit forms, not just apply button clicks
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
    
    // Only proceed if this is actually a form submission button
    if (form && (el.type === 'submit' || el.getAttribute('type') === 'submit')) {
      // This will be handled by the form submit event, so we don't need to do anything here
      return;
    }
    
    // For standalone apply buttons that don't submit forms, don't trigger job tracking
    // The user needs to actually fill out and submit a form
    console.log('Job Tracker: Apply button clicked, but waiting for actual form submission');
    return;
  }
}

// Form protection: Initialize form monitoring
function initializeFormProtection() {
  // Add beforeunload listener
  window.addEventListener('beforeunload', handleBeforeUnload);
  
  // Monitor forms for changes
  document.addEventListener('input', handleInputChange, true);
  document.addEventListener('change', handleInputChange, true);
  
  // Restore form data on page load and bind submit once per form
  const forms = document.querySelectorAll('form');
  forms.forEach(formEl => {
    const form = formEl as HTMLFormElement;
    if (isLikelyJobApplication(form)) {
      restoreFormData(form);
      startAutoSave(form);
      if (!boundForms.has(form)) {
        form.addEventListener('submit', handleSubmitEvent, true);
        boundForms.add(form);
      }
    }
  });
  
  // Monitor for dynamically added forms and bind once
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;
          const newForms = element.matches('form') ? [element] : Array.from(element.querySelectorAll('form'));
          newForms.forEach(f => {
            const form = f as HTMLFormElement;
            if (isLikelyJobApplication(form)) {
              restoreFormData(form);
              startAutoSave(form);
              if (!boundForms.has(form)) {
                form.addEventListener('submit', handleSubmitEvent, true);
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
  // Initialize form protection
  initializeFormProtection();
  
  // Only click listener remains (we do not attach global submit to avoid duplicates)
  document.addEventListener(
    "click",
    handleClickEvent,
    true
  );
}

// Cleanup on page unload
window.addEventListener('unload', () => {
  stopAutoSave();
  window.removeEventListener('beforeunload', handleBeforeUnload);
});

initListeners();
