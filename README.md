# Code Review

## Run locally

Use Node.js 18 or newer. Open two terminals from the project directory.

1. Start the API:

   ```powershell
   cd BackEnd
   npm install
   Copy-Item .env.example .env
   # Add your Google Gemini API key to .env
   npm run dev
   ```

2. Start the web app:

   ```powershell
   cd Frontend
   npm install
   npm run dev
   ```

Open the local URL printed by Vite. The frontend proxies `/ai` requests to the API on port 5000 (the default configured in `BackEnd/.env`).

The API can start without a Gemini key, but code reviews require `GOOGLE_GEMINI_KEY` in `BackEnd/.env`.

Review requests support up to 10 text files, 256 KiB per file, and 1 MiB combined content. The API allows 10 reviews per client IP per minute.
