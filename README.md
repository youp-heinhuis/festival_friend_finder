
# Rabbit Finder

A phone-browser app for dropping timed friend pins on a festival map.

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

If `.env` is empty, the app works in local demo mode only.

## Supabase setup

1. Create a Supabase project.
2. Open SQL Editor.
3. Run `supabase/schema.sql`.
4. In Project Settings > API, copy the Project URL and anon public key.
5. Put them in `.env` locally and in Vercel environment variables.

## Deploy to Vercel

1. Push this folder to GitHub.
2. Import the repo in Vercel.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
6. Deploy.

Share links look like:

```text
https://your-project.vercel.app?group=DTRH26
```
