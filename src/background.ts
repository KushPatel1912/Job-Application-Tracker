/** @format */

import {
  DEFAULT_SHEET_NAME,
  STORAGE_KEYS,
} from "./shared/types";
import { loadRuntimeConfig } from './shared/auth';

// Cache key builder for date format status per sheet/tab
function buildDateFormatKey(spreadsheetId: string, sheetName: string): string {
  return `jt_date_format_set__${spreadsheetId}__${sheetName}`;
}

async function getFromStorage<T extends string>(keys: T[]) {
  return new Promise<Record<T, any>>((resolve) => chrome.storage.local.get(keys, (r) => resolve(r as Record<T, any>)));
}

function setInStorage(obj: Record<string, any>) {
  return new Promise<void>((resolve) => chrome.storage.local.set(obj, () => resolve()));
}

async function ensureAccessToken(interactive = true): Promise<string> {
  const { [STORAGE_KEYS.accessToken]: token, [STORAGE_KEYS.accessTokenExpiry]: expiry } = await getFromStorage([
    STORAGE_KEYS.accessToken,
    STORAGE_KEYS.accessTokenExpiry
  ]);
  const now = Date.now();
  if (token && typeof expiry === 'number' && now < expiry - 60_000) {
    return token as string;
  }
  return await authorizeWithGoogle(interactive);
}

function buildAuthUrl({ clientId, scopes, redirectUri }: { clientId: string; scopes: string[]; redirectUri: string }) {
  const authBase = 'https://accounts.google.com/o/oauth2/v2/auth';
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'token',
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    include_granted_scopes: 'true',
    prompt: 'consent'
  });
  return `${authBase}?${params.toString()}`;
}

async function authorizeWithGoogle(interactive = true): Promise<string> {
  const config = await loadRuntimeConfig();
  if (!config.oauthClientId) {
    throw new Error('Missing oauthClientId in config.json');
  }
  const redirectExtensionId = config.redirectExtensionId || chrome.runtime.id;
  const redirectUri = `https://${redirectExtensionId}.chromiumapp.org/`;
  const scopes = Array.isArray(config.oauthScopes) && config.oauthScopes.length > 0
    ? config.oauthScopes
    : ['https://www.googleapis.com/auth/spreadsheets'];

  const authUrl = buildAuthUrl({ clientId: config.oauthClientId, scopes, redirectUri });

  const redirectUrl = await new Promise<string>((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive }, (responseUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(responseUrl as string);
    });
  });

  const fragment = new URL(redirectUrl).hash.substring(1);
  const params = new URLSearchParams(fragment);
  const accessToken = params.get('access_token');
  const expiresIn = Number(params.get('expires_in') || '3600');
  if (!accessToken) {
    throw new Error('Authorization failed: no access_token');
  }
  const expiry = Date.now() + expiresIn * 1000;
  await setInStorage({ [STORAGE_KEYS.accessToken]: accessToken, [STORAGE_KEYS.accessTokenExpiry]: expiry });
  return accessToken;
}

// Ensure the Date column (E) is formatted as MM/dd/yyyy so values display correctly regardless of locale
async function ensureDateColumnFormat(spreadsheetId: string, sheetName: string): Promise<void> {
  const flagKey = buildDateFormatKey(spreadsheetId, sheetName);
  const already = await getFromStorage([flagKey]);
  if (already[flagKey]) return; // already formatted in this session

  const token = await ensureAccessToken(true);

  // 1) Lookup the sheetId (grid id) for the given tab name
  const metaResp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets(properties(sheetId,title))`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaResp.ok) return; // don't block on format
  const metaJson = await metaResp.json();
  const sheet = (metaJson.sheets || []).map((s: any) => s.properties).find((p: any) => p.title === sheetName);
  if (!sheet || typeof sheet.sheetId !== 'number') return;

  // 2) Apply number format to column E (index 4), from row 2 downward (skip header)
  const batchBody = {
    requests: [
      {
        repeatCell: {
          range: {
            sheetId: sheet.sheetId,
            startRowIndex: 1,
            startColumnIndex: 4,
            endColumnIndex: 5,
          },
          cell: {
            userEnteredFormat: {
              numberFormat: {
                type: 'DATE',
                pattern: 'MM/dd/yyyy',
              },
            },
          },
          fields: 'userEnteredFormat.numberFormat',
        },
      },
    ],
  } as const;

  const batchResp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/:batchUpdate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(batchBody),
  });

  if (batchResp.ok) {
    await setInStorage({ [flagKey]: true });
  }
}

async function appendRowToSheet(values: string[]) {
  const { [STORAGE_KEYS.sheetId]: sheetId, [STORAGE_KEYS.sheetName]: sheetNameStored } = await getFromStorage([
    STORAGE_KEYS.sheetId,
    STORAGE_KEYS.sheetName
  ]);
  const sheetName = (sheetNameStored as string) || DEFAULT_SHEET_NAME;
  if (!sheetId) {
    throw new Error('Sheet not configured. Set it in the extension options.');
  }

  // Ensure the date column is properly formatted (best-effort, non-blocking)
  try { await ensureDateColumnFormat(sheetId as string, sheetName); } catch {}

  const token = await ensureAccessToken(true);
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId as string)}/values/${encodeURIComponent(sheetName)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const body = { values: [values], majorDimension: 'ROWS' } as const;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Sheets API error: ${resp.status} ${text}`);
  }
  return await resp.json();
}

function todayUsDate(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

async function handleJobSubmission(payload: any) {
  const company = payload.company || '';
  const location = payload.location || '';
  const title = payload.title || '';
  const workMode = payload.workMode || '';
  const applicationDate = payload.applicationDate || todayUsDate();
  const url = payload.url || '';
  const resume = payload.resume || '';
  const status = 'Pending';

  const row = [company, location, title, workMode, applicationDate, url, resume, status];

  try {
    await appendRowToSheet(row);
    const summary = {
      company,
      title,
      date: applicationDate,
    };
    await setInStorage({
      [STORAGE_KEYS.lastSubmission]: summary,
      [STORAGE_KEYS.lastStatus]: {
        ok: true,
        message: 'Saved',
      },
    });
    return { ok: true };
  } catch (error: any) {
    await setInStorage({
      [STORAGE_KEYS.lastStatus]: {
        ok: false,
        message: String(error?.message || error),
      },
    });
    return {
      ok: false,
      error: String(error?.message || error),
    };
  }
}

chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {
    (async () => {
      try {
        if (
          message &&
          message.type === "JOB_APPLICATION_SUBMITTED"
        ) {
          const result = await handleJobSubmission(
            message.payload || {}
          );
          sendResponse(result);
          return;
        }
        if (
          message &&
          message.type === "JT_AUTHORIZE"
        ) {
          await ensureAccessToken(true);
          sendResponse({ ok: true });
          return;
        }
        if (
          message &&
          message.type === "JT_GET_CONFIG"
        ) {
          const {
            [STORAGE_KEYS.sheetId]: sheetId,
            [STORAGE_KEYS.sheetName]: sheetName,
          } = await getFromStorage([
            STORAGE_KEYS.sheetId,
            STORAGE_KEYS.sheetName,
          ]);
          sendResponse({
            ok: true,
            sheetId: (sheetId as string) || "",
            sheetName:
              (sheetName as string) ||
              DEFAULT_SHEET_NAME,
          });
          return;
        }
        if (
          message &&
          message.type === "JT_SET_CONFIG"
        ) {
          const updates: Record<string, string> = {};
          if (typeof message.sheetId === "string")
            updates[STORAGE_KEYS.sheetId] =
              message.sheetId.trim();
          if (typeof message.sheetName === "string")
            updates[STORAGE_KEYS.sheetName] =
              (message.sheetName as string).trim() ||
              DEFAULT_SHEET_NAME;
          await setInStorage(updates);
          sendResponse({ ok: true });
          return;
        }
        sendResponse({
          ok: false,
          error: "Unknown message",
        });
      } catch (error: any) {
        sendResponse({
          ok: false,
          error: String(error?.message || error),
        });
      }
    })();
    return true; // keep message channel open for async
  }
);
