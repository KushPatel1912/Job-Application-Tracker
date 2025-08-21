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

export const Popup: React.FC = () => {
  const lastSubmission = useChromeStorage<
    LastSubmission | undefined
  >(STORAGE_KEYS.lastSubmission, undefined);
  const lastStatus = useChromeStorage<
    StatusState | undefined
  >(STORAGE_KEYS.lastStatus, undefined);

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

  function openOptions() {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open("/src/options/index.html", "_blank");
    }
  }

  return (
    <div className="min-w-[280px] p-3 text-slate-900">
      <div className="text-base font-bold mb-2">
        Job Tracker
      </div>
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
          onClick={openOptions}
        >
          Options
        </button>
      </div>
    </div>
  );
};
