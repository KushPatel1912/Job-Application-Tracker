/** @format */

import React, { useEffect, useState } from "react";
import {
  DEFAULT_SHEET_NAME,
  STORAGE_KEYS,
  type LastSubmission,
  type StatusState,
} from "../../shared/types";

function useChromeStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    chrome.storage.local.get([key], (r) => {
      setValue((r as any)[key] ?? initial);
    });
  }, [key]);
  return value;
}

// Form protection: Check for saved form data
function useFormProtectionStatus() {
  const [hasSavedForms, setHasSavedForms] = useState(false);
  const [savedFormsCount, setSavedFormsCount] = useState(0);

  useEffect(() => {
    const checkSavedForms = () => {
      try {
        const keys = Object.keys(localStorage);
        const formKeys = keys.filter(key => key.startsWith('jt_form_'));
        setHasSavedForms(formKeys.length > 0);
        setSavedFormsCount(formKeys.length);
      } catch (error) {
        console.warn('Job Tracker: Failed to check saved forms:', error);
      }
    };

    checkSavedForms();
    
    // Listen for storage changes
    const handleStorageChange = () => checkSavedForms();
    window.addEventListener('storage', handleStorageChange);
    
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const clearAllSavedForms = () => {
    try {
      const keys = Object.keys(localStorage);
      const formKeys = keys.filter(key => key.startsWith('jt_form_'));
      formKeys.forEach(key => localStorage.removeItem(key));
      setHasSavedForms(false);
      setSavedFormsCount(0);
      console.log('Job Tracker: All saved forms cleared');
    } catch (error) {
      console.warn('Job Tracker: Failed to clear saved forms:', error);
    }
  };

  return { hasSavedForms, savedFormsCount, clearAllSavedForms };
}

export const Popup: React.FC = () => {
  const lastSubmission = useChromeStorage<
    LastSubmission | undefined
  >(STORAGE_KEYS.lastSubmission, undefined);
  const lastStatus = useChromeStorage<
    StatusState | undefined
  >(STORAGE_KEYS.lastStatus, undefined);
  const { hasSavedForms, savedFormsCount, clearAllSavedForms } = useFormProtectionStatus();

  const [sheetId, setSheetId] = useState<string>("");

  useEffect(() => {
    chrome.storage.local.get(
      [STORAGE_KEYS.sheetId],
      (r) =>
        setSheetId(
          (r as any)[STORAGE_KEYS.sheetId] || ""
        )
    );
  }, []);

  async function connect() {
    const resp = await chrome.runtime.sendMessage({
      type: "JT_AUTHORIZE",
    });
    if (!resp?.ok)
      alert(resp?.error || "Authorization failed");
    else alert("Connected to Google");
  }

  function openSheet() {
    if (!sheetId) {
      alert("Set your Google Sheet in Options");
      return;
    }
    const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
      sheetId
    )}`;
    window.open(url, "_blank");
  }

  return (
    <div className="min-w-[280px] p-3 text-slate-900">
      <div className="text-base font-bold mb-2">
        Job Tracker
      </div>
      
      {/* Form Protection Status */}
      {hasSavedForms && (
        <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="text-xs text-yellow-800 mb-1">
            ⚠️ {savedFormsCount} form{savedFormsCount > 1 ? 's' : ''} with unsaved data
          </div>
          <button
            onClick={clearAllSavedForms}
            className="text-xs text-yellow-700 underline hover:text-yellow-900"
          >
            Clear all saved forms
          </button>
        </div>
      )}
      
      {lastStatus && (
        <div
          className={`text-xs mb-2 ${
            lastStatus.ok
              ? "text-green-600"
              : "text-red-600"
          }`}
        >
          {lastStatus.message}
        </div>
      )}
      
      <div className="border rounded-xl p-3 shadow-sm">
        <div className="text-xs text-slate-500 mb-2">
          Last submission
        </div>
        <div>
          <div>
            <span className="text-slate-500">
              Company:
            </span>{" "}
            {lastSubmission?.company || "—"}
          </div>
          <div>
            <span className="text-slate-500">
              Title:
            </span>{" "}
            {lastSubmission?.title || "—"}
          </div>
          <div>
            <span className="text-slate-500">
              Date:
            </span>{" "}
            {lastSubmission?.date || "—"}
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-2 mt-3">
        <button
          className="px-3 py-2 rounded-lg bg-blue-600 text-white"
          onClick={openSheet}
        >
          Open Sheet
        </button>
        <button
          className="px-3 py-2 rounded-lg border"
          onClick={connect}
        >
          Connect
        </button>
        <button
          className="text-xs text-slate-500 underline"
          onClick={() => {
            if (chrome.runtime.openOptionsPage) {
              chrome.runtime.openOptionsPage();
            } else {
              window.open("/src/options/index.html", "_blank");
            }
          }}
        >
          Options
        </button>
      </div>
      
      {/* Form Protection Info */}
      <div className="mt-3 text-xs text-slate-500">
        <div>✓ Auto-save every 3 seconds</div>
        <div>✓ Warn before leaving with changes</div>
        <div>✓ Restore data on page reload</div>
      </div>
    </div>
  );
};
