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
RESEND_API_KEY
EMAIL_FROM
```

ב־Preview/Production, הערכים של `AUTH_URL` ו־`NEXTAUTH_URL` צריכים להיות הכתובת של Vercel, לא localhost.

לא להגדיר `AUTH_DEV_BYPASS=true` ב־Vercel Production.

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

- יש NextAuth עם Magic Link.
- יש טבלאות `users`, `client_users`, `sessions`.
- יש Role בסיסי על משתמשים.
- יש שיוך לקוח-משתמש.
- יש אכיפת הרשאות בצד שרת ל־Dashboard Data, גאנט, AI Memory/Chat, עדכון חשבון והקמת לקוח.

מה חייבים להשלים לפני Production אמיתי:

- ליצור מסך ניהול משתמשים ליצירת Magic Link ושיוך לקוח.
- להוסיף חוויית התחברות מלאה במקום fallback לדמו.
- להוסיף בדיקות ידניות: אדמין רואה הכל, לקוח רואה רק חשבון אחד.

## סדר עבודה מומלץ

1. לחבר GitHub פרטי.
2. לחבר Vercel Preview.
3. להגדיר ENV ב־Vercel.
4. לוודא `npm run build` עובר.
5. להריץ `npm run db:push` מול Neon.
6. להעלות לקוח בדיקה אחד.
7. להוסיף Auth Guard ל־API.
8. לבדוק Admin מול Client.
9. להפעיל Production רק אחרי בדיקת בידוד לקוחות.
