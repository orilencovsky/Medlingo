# MedLingo

_[Read in English](README.md)_

מלמדת עברית רפואית לצוות רפואי עולה (רופאים/אחיות) שעובד במערכת הבריאות הישראלית. הלומדים
עוברים תרחישים קליניים ריאליסטיים ("יחידות לימוד"), ואז שומרים על אוצר המילים טרי עם חזרות
מרווחות (FSRS) ורצף יומי.

**חי:** [medlingo.pages.dev](https://medlingo.pages.dev) — נפרס אוטומטית מ-`main`.

חדש בפרויקט? תתחיל מ-[docs/ONBOARDING.md](docs/ONBOARDING.md) (הרעיון, הסטאק, סטטוס נוכחי,
איפה להיכנס), ואז ה-spec המלא ב-
[docs/superpowers/specs/2026-07-10-medlingo-pilot-design.md](docs/superpowers/specs/2026-07-10-medlingo-pilot-design.md).

## סטאק

Vite + React + TypeScript · Supabase (Postgres + RLS + auth) · Cloudflare Pages · `ts-fsrs`
לתזמון חזרות. תוכן נכתב כקבצי TSV בגיט (`content/`) ומיובא ל-Supabase — ראה
[docs/ONBOARDING.md](docs/ONBOARDING.md) לצינור התוכן המלא.

## התקנה

```bash
npm install
cp .env.example .env.local            # למלא VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
cp .env.content.example .env.content  # למלא DATABASE_URL / SUPABASE_SERVICE_ROLE_KEY (רק ליבוא תוכן)
npm run dev
```

## סקריפטים

| פקודה | מטרה |
|---|---|
| `npm run dev` | שרת פיתוח מקומי |
| `npm test` | טסטים (vitest) |
| `npm run test:e2e` | טסטים מקצה לקצה (Playwright) |
| `npm run import:content` | יבוא קבצי TSV מ-`content/` ל-Supabase |
| `npm run metrics` | תצוגות SQL למדדי retention |
| `npm run verify:rls` | בדיקת מדיניות Row Level Security |
