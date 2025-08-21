<!-- @format -->

## Job Tracker (Chrome Extension, MV3)

This extension captures job application submissions
across sites and appends them to a user-configured
Google Sheet.

### Features

- Captures company, location, job title, work mode,
  date, URL, resume filename, and sets status to
  "Pending".
- Uses Google OAuth 2.0 and Google Sheets API
  (append-only).
- Minimal popup UI showing last submission and a quick
  link to the sheet.
- Options page to configure Spreadsheet ID and Sheet
  name.

### Setup

1. Create an OAuth Client ID
   - Google Cloud Console → APIs & Services →
     Credentials
   - Create OAuth client ID (type: Web application)
   - Add Authorized redirect URI:
     `https://<EXTENSION_ID>.chromiumapp.org/`
     - You will get `<EXTENSION_ID>` after loading the
       unpacked extension once, then update the
       redirect in Cloud Console.
2. Enable APIs
   - Enable `Google Sheets API` for your project.
3. Configure the extension
   - Create `public/config.json` with your OAuth
     client:
     `{ "oauthClientId": "<YOUR_ID>", "oauthScopes": ["https://www.googleapis.com/auth/spreadsheets"] }`
     Vite copies `public/` to `dist/`, so this will be
     available at `/config.json` at runtime.
4. Load in Chrome
   - Chrome → Extensions → Enable Developer mode → Load
     unpacked → select this folder.
5. Configure Sheet
   - Open the extension Options → set your Spreadsheet
     ID and Sheet name (e.g., `Sheet1`).
   - Ensure the first row of your sheet has headers
     like:
     `Company | Location | Title | Mode | Date | URL | Resume | Status`

### Usage

- On job application pages, when you submit a form or
  click an Apply button, the extension extracts fields
  and appends a row to your sheet.
- Use the popup to see the last submission and open the
  sheet.

### Notes

- Data extraction is best-effort and may vary per site.
  You can edit results directly in the sheet.
- Tokens are obtained with
  `chrome.identity.launchWebAuthFlow` and used for
  Google Sheets API.
- No files are uploaded; only the resume filename is
  captured if accessible.

### Privacy

- Processing happens locally except Google API calls.
  No data is sent to any external server besides Google
  APIs.
