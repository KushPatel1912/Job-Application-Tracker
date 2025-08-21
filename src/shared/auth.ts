/** @format */

export type RuntimeConfig = {
  oauthClientId: string;
  oauthScopes?: string[];
  // Optional override to force a specific extension ID for redirect origin
  // e.g., "pnefkkhoflibkknpbpljgdghgicomaad" so redirect becomes
  // https://pnefkkhoflibkknpbpljgdghgicomaad.chromiumapp.org/
  redirectExtensionId?: string;
};

function normalize(raw: any): RuntimeConfig {
  if (!raw) throw new Error('Missing config');
  // Support both { oauthClientId } and { client_id }
  const oauthClientId = raw.oauthClientId || raw.client_id || raw.clientId || '';
  const oauthScopes = Array.isArray(raw.oauthScopes) ? raw.oauthScopes : raw.scopes;
  const redirectExtensionId = raw.redirectExtensionId || raw.redirect_extension_id || raw.extension_id || undefined;
  return { oauthClientId, oauthScopes, redirectExtensionId };
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  // Primary: fetch from public root (Vite copies public/ -> dist/)
  try {
    const res = await fetch('/config.json', { cache: 'no-store' });
    if (res.ok) return normalize(await res.json());
  } catch (_) {}

  // Extension-safe absolute fallback
  try {
    const url = chrome.runtime.getURL('config.json');
    const res = await fetch(url, { cache: 'no-store' });
    if (res.ok) return normalize(await res.json());
  } catch (_) {}

  // Optional example fallback for local dev
  try {
    const exUrl = chrome.runtime.getURL('config.example.json');
    const exRes = await fetch(exUrl, { cache: 'no-store' });
    if (exRes.ok) return normalize(await exRes.json());
  } catch (_) {}

  throw new Error('Failed to load config.json');
}


