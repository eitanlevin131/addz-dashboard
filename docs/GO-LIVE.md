# Flashy Growth Desk - Go Live Checklist

מטרת המסמך: להעביר את המערכת ממקומית/פיתוח למערכת לייב מסודרת, בלי לשבור דאטה אמיתי.

## Preview מקומי

```bash
npm run preview
```

פותחים:

```text
http://127.0.0.1:3015/
```

אם הפורט תפוס:

```bash
npm run build
npx next start -p 3016
```

## Vercel Preview

בפעם הראשונה:

```bash
npx vercel login
npx vercel
```

אחרי שהפרויקט מחובר:

```bash
npx vercel
```

Production:

```bash
npx vercel --prod
```

## ENV שחייבים להגדיר ב-Vercel

```text
DATABASE_URL
AUTH_SECRET
AUTH_URL
NEXTAUTH_URL
FLASHY_API_KEY_ENCRYPTION_SECRET
OPENAI_API_KEY
OPENAI_MODEL
OWNER_EMAIL
CRON_SECRET
RESEND_API_KEY
EMAIL_FROM
```

אופציונלי: `SYNC_ALERT_EMAILS` עם כתובת אחת או כמה כתובות מופרדות בפסיקים. אם הוא לא מוגדר, התראות על כשל או חריגת סנכרון יישלחו ל־`OWNER_EMAIL`.

## אחסון קבצי גאנט

העלאת קבצים לבריפים נשמרת ב־Vercel Blob פרטי. בפרויקט Vercel יש לפתוח `Storage`, ליצור Blob Store במצב `Private` ולחבר אותו לפרויקט. לאחר החיבור Vercel מספק את הרשאות האחסון ל־Production ול־Preview באופן אוטומטי.

לפיתוח מקומי אפשר למשוך את משתני הסביבה דרך Vercel CLI או להגדיר ב־`.env.local`:

```text
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
```

הקבצים אינם ציבוריים: ההורדה עוברת דרך נתיב מאומת במערכת ורק משתמש בעל גישה ללקוח יכול לפתוח אותם. קישורים חיצוניים שמצורפים לבריף אינם מועתקים ל־Blob.

מסמכי האפיון של ה־AI עולים ישירות מהדפדפן ל־Blob פרטי כדי לעקוף את מגבלת גוף הבקשה של Vercel Functions. המערכת מאפשרת מסמכי PDF, DOCX, TXT, MD, CSV ו־JSON עד 20MB, מחלצת מהם טקסט ומוחקת את קובץ המקור מה־Blob מיד לאחר העיבוד.

ב־Preview/Production, הערכים של `AUTH_URL` ו־`NEXTAUTH_URL` צריכים להיות הכתובת של Vercel, לא localhost.

לא להגדיר `AUTH_DEV_BYPASS=true` ב־Vercel Production.

`RESEND_API_KEY` ו־`EMAIL_FROM` משמשים לשליחת קודי הכניסה. `EMAIL_FROM` חייב להשתמש בדומיין שאומת ב־Resend. בלי שניהם לא ניתן להיכנס למערכת בפרודקשן.

`CRON_SECRET` מאבטח את הסנכרון היומי מול Flashy. אפשר ליצור אותו פעם אחת עם:

```bash
openssl rand -hex 32
```

הסנכרון רץ מדי יום דרך Vercel Cron על כל חשבונות Flashy הפעילים, עם טווח ברירת מחדל של 120 יום. אפשר לשנות את הטווח באמצעות `FLASHY_SYNC_LOOKBACK_DAYS` לערך בין 1 ל־365; כפתור הרענון הידני נשאר זמין.

## מעבר מהגרסה הקודמת

1. בפרויקט `addz-dashboard` ב־Vercel, פתח Settings > Environment Variables.
2. הגדר `OWNER_EMAIL`, `RESEND_API_KEY` ו־`EMAIL_FROM` בסביבת Production.
3. ודא שהדומיין של `EMAIL_FROM` מאומת ב־Resend.
4. השאר `AUTH_PASSWORD_FALLBACK=false` או אל תגדיר אותו כלל.
5. דחוף ל־`main` והמתן ל־Ready ב־Deployments. אין צורך ליצור פרויקט Vercel נוסף.
6. במסך הכניסה הזן את אימייל הבעלים, קבל קוד בן 6 ספרות והשלם כניסה.
7. במסך אדמין הוסף עובדים ולקוחות לפי אימייל ותפקיד. אין צורך ליצור או להעביר סיסמה.

קוד תקף ל־10 דקות ולשימוש יחיד. החיבור נשמר ל־3 ימים, אלא אם המשתמש הושעה או שהרשאותיו שונו.

## בדיקת התחברות

```bash
npm run test:e2e
```

## Neon

1. ליצור פרויקט Neon.
2. לשים את `DATABASE_URL` ב־`.env.local` וב־Vercel.
3. להריץ:

```bash
npm run db:push
```

4. להריץ בדיקה:

```bash
npm run build
```

## Auth והרשאות

מצב נוכחי:

- יש Auth.js עם אימייל וקוד חד־פעמי שנשלח דרך Resend.
- רק משתמשים פעילים שנוצרו מראש יכולים לקבל קוד.
- בעל המערכת מוגדר באמצעות `OWNER_EMAIL`; עובדים מקבלים תפקיד `admin`; לקוחות מקבלים תפקיד `client` ושיוך לחשבונות הרלוונטיים.
- JWT פג אחרי 72 שעות. השעיה או שינוי תפקיד מעלים `sessionVersion` ומבטלים חיבורים קיימים.
- יש טבלאות `users`, `client_users`, `sessions`.
- יש Role בסיסי על משתמשים.
- משתמשים מורשים נוצרים רק ממסך האדמין; קודי הכניסה נשמרים כ־HMAC hash ולעולם לא כטקסט גלוי.
- יש שיוך לקוח-משתמש.
- יש אכיפת הרשאות בצד שרת ל־Dashboard Data, גאנט, AI Memory/Chat, עדכון חשבון והקמת לקוח.

בדיקות חובה לפני Production אמיתי:

- ליצור משתמש לקוח לפי אימייל ממסך האדמין ולשייך אותו ללקוח אחד.
- לבקש קוד, להיכנס ולוודא שהקוד אינו עובד פעם שנייה.
- לוודא שאדמין רואה את כל החשבונות ולקוח רואה רק את החשבון המשויך אליו.
- להשעות משתמש ולוודא שהחיבור הקיים שלו מבוטל.

## סדר עבודה מומלץ

1. להגדיר ENV ב־Vercel ולוודא שהדומיין מאומת ב־Resend.
2. לוודא `npm run lint`, `npm run test:unit` ו־`npm run test:e2e` עוברים.
3. להריץ `npm run db:push` מול Neon כשיש migration חדשה.
4. לבדוק כניסת owner, admin ו־client.
5. לוודא בידוד לקוחות והרשאות מסכי אדמין.
6. לפרוס ל־Production ולבצע כניסה אמיתית אחת עם קוד שנשלח מ־Resend.
# Epic 1 rollout gate

Before deploying Epic 1, run `node scripts/epic1-preflight.mjs` (read-only).
The application database currently has no Drizzle migration history table, and the repository is missing the SQL file for journal entry 0001. Do not replay the complete journal or run unrestricted `db:push`.

For isolated test setup only: `node scripts/epic1-preflight.mjs --apply-test`. This refuses the application database and repairs only the known missing 0016 baseline before applying 0017.

Production prerequisites: verify the actual Vercel DATABASE_URL target, obtain a verified Neon backup/restore point, compare schema/constraints and test upgrade on a clone. Then apply only `db/migrations/0017_public_jazinda.sql` atomically through the approved database procedure, verify the new columns/table/indexes, and deploy the application. No production application command is provided by the test script.

Old application code is compatible with the additive schema. New application code requires 0017; do not push to auto-deploy main before the production schema rollout is approved. Roll back the application if needed, not the new data/table. Long-standing migration history reconciliation remains a separate task.
