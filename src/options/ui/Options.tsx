/** @format */

import React, { useEffect, useState } from "react";
import {
  DEFAULT_SHEET_NAME,
  STORAGE_KEYS,
} from "../../shared/types";

export const Options: React.FC = () => {
  const [sheetId, setSheetId] = useState("");
  const [sheetName, setSheetName] = useState(
    DEFAULT_SHEET_NAME
  );

  useEffect(() => {
    chrome.storage.local.get(
      [STORAGE_KEYS.sheetId, STORAGE_KEYS.sheetName],
      (r) => {
        setSheetId(
          (r as any)[STORAGE_KEYS.sheetId] || ""
        );
        setSheetName(
          (r as any)[STORAGE_KEYS.sheetName] ||
            DEFAULT_SHEET_NAME
        );
      }
    );
  }, []);

  async function save() {
    const payload = {
      [STORAGE_KEYS.sheetId]: sheetId.trim(),
      [STORAGE_KEYS.sheetName]:
        sheetName.trim() || DEFAULT_SHEET_NAME,
    } as any;
    await chrome.storage.local.set(payload);
    const resp = await chrome.runtime.sendMessage({
      type: "JT_SET_CONFIG",
      sheetId,
      sheetName,
    });
    if (!resp?.ok)
      alert(resp?.error || "Failed to save");
    else alert("Saved");
  }

  async function authorize() {
    const resp = await chrome.runtime.sendMessage({
      type: "JT_AUTHORIZE",
    });
    if (!resp?.ok)
      alert(resp?.error || "Authorization failed");
    else alert("Connected to Google");
  }

  return (
    <div className="max-w-2xl mx-auto p-6 text-slate-900">
      <div className="text-xl font-bold mb-4">
        Job Tracker Settings
      </div>
      <div className="border rounded-xl p-4 space-y-3">
        <div>
          <label className="text-xs text-slate-500">
            Google Sheet ID
          </label>
          <input
            className="w-full mt-1 p-2 border rounded-lg"
            placeholder="1AbCDEFghiJKLmnopQRSTuvWXyz..."
            value={sheetId}
            onChange={(e) =>
              setSheetId(e.target.value)
            }
          />
        </div>
        <div>
          <label className="text-xs text-slate-500">
            Sheet Name (tab)
          </label>
          <input
            className="w-full mt-1 p-2 border rounded-lg"
            placeholder="Sheet1"
            value={sheetName}
            onChange={(e) =>
              setSheetName(e.target.value)
            }
          />
        </div>
        <div className="text-xs text-slate-500">
          Find the ID in the spreadsheet URL:
          https://docs.google.com/spreadsheets/d/
          <strong>ID</strong>/edit
        </div>
        <div className="flex gap-2">
          <button
            className="px-3 py-2 rounded-lg bg-blue-600 text-white"
            onClick={save}
          >
            Save
          </button>
          <button
            className="px-3 py-2 rounded-lg border"
            onClick={authorize}
          >
            Connect Google
          </button>
        </div>
      </div>
    </div>
  );
};
