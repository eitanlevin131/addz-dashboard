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
