/** @format */

export type LastSubmission = {
  company: string;
  title: string;
  date: string;
};

export type StatusState = {
  ok: boolean;
  message: string;
};

export const STORAGE_KEYS = {
  accessToken: "jt_access_token",
  accessTokenExpiry: "jt_access_token_expiry",
  sheetId: "jt_sheet_id",
  sheetName: "jt_sheet_name",
  lastSubmission: "jt_last_submission",
  lastStatus: "jt_last_status",
} as const;

export const DEFAULT_SHEET_NAME = "Sheet1";
