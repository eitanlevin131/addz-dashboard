# Flashy Growth Desk

דאשבורד MVP בעברית לניהול לקוחות Email/SMS Marketing על בסיס Flashy.

## מה כלול

- דוחות כללי, SMS, אוטומציות וקמפיינים.
- חישובי ROAS: עלות SMS לפי `total_recipients * sms_credit_price_usd`, עלות מנוי חודשית בדולר, ריטיינר בשקלים, והמרה לפי `usd_ils_rate`.
- גאנט חודשי פנימי לתכנון דיוורים.
- מסך AI עם המלצות מובנות וצ׳אט fallback מבוסס נתונים.
- מסך אדמין להוספת חשבון והרשאות מודולים.
- API routes מוכנים לחיבור הדרגתי ל־Flashy, Neon ו־Auth.js.
- סכימת Postgres התחלתית ל־Neon ב־`db/schema.sql`.

## הרצה מקומית

```bash
npm run dev
```

האפליקציה תעלה בדרך כלל ב־`http://localhost:3000`.

## Preview מקומי לפני העלאה

```bash
npm run preview
```

הפקודה בונה את המערכת ומריצה אותה כמו Production מקומי על:

```text
http://127.0.0.1:3015/
```

אם רוצים Preview ציבורי, משתמשים ב־Vercel:

```bash
npx vercel
```

Production:

```bash
npx vercel --prod
```

צ׳קליסט מלא נמצא ב־`docs/GO-LIVE.md`.

## חיבורי ייצור עם Neon Free + Auth.js

ה־MVP כרגע משתמש בנתוני דמו כדי לאפשר עבודה מיידית בלי חשבונות וסודות. נקודות ההחלפה לייצור:

 - ליצור פרויקט Neon Free ולהריץ את `db/schema.sql`.
 - להגדיר `DATABASE_URL` לפי `.env.example`.
- להתקין את חבילות הייצור כשיש רשת זמינה:

```bash
npm install @neondatabase/serverless drizzle-orm next-auth @auth/drizzle-adapter
npm install -D drizzle-kit
```

- ליצור migration מ־Drizzle:

```bash
npx drizzle-kit generate
```

- להריץ את ה־SQL שנוצר תחת `db/migrations/` על Neon, או להריץ ידנית את `db/schema.sql` בתחילת הדרך.
- להפעיל Auth.js עם Magic Link דרך SMTP זול/חינמי כגון Resend או ספק מייל קיים.
- לשמור Flashy API keys מוצפנים בצד שרת בלבד.
- לקרוא את `GET /account`, `GET /reports/emails`, `GET /reports/sms`, `GET /reports/automations`.
- להריץ סנכרון יומי דרך Vercel Cron ולהשאיר כפתור רענון ידני.

### הפעלה עם Neon

1. צרו `.env.local` לפי `.env.example`.
2. מלאו לפחות:

```bash
DATABASE_URL="..."
AUTH_SECRET="..."
FLASHY_API_KEY_ENCRYPTION_SECRET="..."
```

3. הריצו:

```bash
npm run db:push
npm run build
npm run start
```

4. במסך אדמין בדקו API key של Flashy ואז לחצו `פתח לקוח והצג דוחות`.
   כש־Neon מחובר, הפעולה שומרת את הלקוח, משתמש הלקוח, חשבון Flashy, מפתח מוצפן ודוחות 30 יום.

## API routes

- `POST /api/flashy/accounts` מאמת API key מול Flashy.
- `POST /api/flashy/sync` מחזיר תוכנית סנכרון ודמו import, או מאמת מפתח חי אם נשלח `apiKey`.
- `GET /api/newsletter-plans?clientId=...` מחזיר תכנון חודשי. בייצור הפעולות יישמרו ב־Neon.
- `POST /api/ai/recommendations` מחזיר המלצות וצ׳אט fallback.
