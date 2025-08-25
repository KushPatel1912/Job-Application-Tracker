/** @format */

import React, { useEffect, useState } from "react";
import {
  DEFAULT_SHEET_NAME,
  STORAGE_KEYS,
} from "../../shared/types";

// Form protection: Check and manage saved form data
function useFormProtectionManagement() {
  const [savedForms, setSavedForms] = useState<Array<{ key: string; data: any; timestamp: number }>>([]);

  const loadSavedForms = () => {
    try {
      const keys = Object.keys(localStorage);
      const formKeys = keys.filter(key => key.startsWith('jt_form_'));
      const forms = formKeys.map(key => {
        try {
          const data = JSON.parse(localStorage.getItem(key) || '{}');
          return { key, data, timestamp: data.timestamp || 0 };
        } catch {
          return { key, data: {}, timestamp: 0 };
        }
      }).sort((a, b) => b.timestamp - a.timestamp);
      
      setSavedForms(forms);
    } catch (error) {
      console.warn('Job Tracker: Failed to load saved forms:', error);
    }
  };

  const clearForm = (key: string) => {
    try {
      localStorage.removeItem(key);
      loadSavedForms();
      console.log('Job Tracker: Form cleared:', key);
    } catch (error) {
      console.warn('Job Tracker: Failed to clear form:', error);
    }
  };

  const clearAllForms = () => {
    try {
      const keys = Object.keys(localStorage);
      const formKeys = keys.filter(key => key.startsWith('jt_form_'));
      formKeys.forEach(key => localStorage.removeItem(key));
      setSavedForms([]);
      console.log('Job Tracker: All forms cleared');
    } catch (error) {
      console.warn('Job Tracker: Failed to clear all forms:', error);
    }
  };

  useEffect(() => {
    loadSavedForms();
    
    // Listen for storage changes
    const handleStorageChange = () => loadSavedForms();
    window.addEventListener('storage', handleStorageChange);
    
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return { savedForms, clearForm, clearAllForms, loadSavedForms };
}

export const Options: React.FC = () => {
  const [sheetId, setSheetId] = useState("");
  const [sheetName, setSheetName] = useState(
    DEFAULT_SHEET_NAME
  );
  const { savedForms, clearForm, clearAllForms } = useFormProtectionManagement();

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
      
      {/* Google Sheets Configuration */}
      <div className="border rounded-xl p-4 space-y-3 mb-6">
        <div className="text-lg font-semibold mb-3">Google Sheets Configuration</div>
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

      {/* Form Protection Management */}
      <div className="border rounded-xl p-4 space-y-3">
        <div className="text-lg font-semibold mb-3">Form Protection Management</div>
        
        {savedForms.length > 0 ? (
          <div className="space-y-3">
            <div className="text-sm text-slate-600">
              {savedForms.length} form{savedForms.length > 1 ? 's' : ''} with unsaved data:
            </div>
            
            {savedForms.map((form) => (
              <div key={form.key} className="p-3 bg-slate-50 rounded-lg border">
                <div className="flex justify-between items-start mb-2">
                  <div className="text-sm font-medium text-slate-700">
                    {form.key.replace('jt_form_', 'Form: ')}
                  </div>
                  <button
                    onClick={() => clearForm(form.key)}
                    className="text-xs text-red-600 hover:text-red-800 underline"
                  >
                    Clear
                  </button>
                </div>
                <div className="text-xs text-slate-500">
                  Last saved: {new Date(form.timestamp).toLocaleString()}
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  Fields: {Object.keys(form.data).length}
                </div>
              </div>
            ))}
            
            <button
              onClick={clearAllForms}
              className="w-full px-3 py-2 rounded-lg border border-red-300 text-red-600 hover:bg-red-50"
            >
              Clear All Saved Forms
            </button>
          </div>
        ) : (
          <div className="text-sm text-slate-500 text-center py-4">
            No forms with unsaved data found
          </div>
        )}
        
        <div className="text-xs text-slate-500 space-y-1">
          <div>• Auto-save runs every 3 seconds when typing</div>
          <div>• Data is restored when you return to the page</div>
          <div>• Forms are cleared after successful submission</div>
        </div>
      </div>
    </div>
  );
};
