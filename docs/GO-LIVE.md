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
ADMIN_PASSWORD
```

ב־Preview/Production, הערכים של `AUTH_URL` ו־`NEXTAUTH_URL` צריכים להיות הכתובת של Vercel, לא localhost.

לא להגדיר `AUTH_DEV_BYPASS=true` ב־Vercel Production.

## מעבר מהגרסה הקודמת

1. בפרויקט `addz-dashboard` ב-Vercel, פתח Settings > Environment Variables.
2. הגדר `OWNER_EMAIL` כאימייל בעל המערכת ו-`ADMIN_PASSWORD` כסיסמה ראשונית של לפחות 10 תווים, בסביבת Production.
3. אם קיימים `ADMIN_EMAILS` ו-`ADMIN_LOGIN_CODE`, האימייל הראשון והקוד נשארים נתיב מעבר עד להגדרת סיסמה אישית. לאחר הגדרת סיסמה ב-DB, הקוד הישן לא מתקבל.
4. מול אותו DB של Production, הרץ פעם אחת את העדכון הממוקד (ל-Node 20.6 ומעלה):

```bash
node --env-file=.env.local scripts/migrate-password-auth.mjs
```

5. דחוף ל-`main` והמתן ל-Ready ב-Deployments. אין צורך ליצור פרויקט Vercel נוסף.
6. היכנס עם אימייל הבעלים והסיסמה הראשונית. במסך אדמין אפשר ליצור משתמש, לקבוע סיסמה ולשייך לקוח.
7. שינוי סיסמה מתבצע מתוך שורת המשתמש, ומבטל את החיבורים הקודמים שלו. לאחר שהבעלים התחבר בהצלחה, אפשר להסיר את `ADMIN_PASSWORD` וקודי הכניסה הישנים מ-Vercel; הכניסה תשתמש בסיסמה השמורה כ-hash.

הגרסה החדשה מחייבת כניסה מחדש של משתמשים קיימים. ללקוחות שהשתמשו ב-Magic Link צריך להגדיר סיסמה במסך האדמין. Resend אינו נדרש לכניסה.

## בדיקת התחברות

```bash
node --experimental-strip-types --test tests/password.test.mjs
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

- יש NextAuth עם אימייל וסיסמה קבועה.
- יש טבלאות `users`, `client_users`, `sessions`.
- יש Role בסיסי על משתמשים.
- משתמשים וסיסמאות נוצרים רק ממסך האדמין; הסיסמאות נשמרות כ-hash.
- יש שיוך לקוח-משתמש.
- יש אכיפת הרשאות בצד שרת ל־Dashboard Data, גאנט, AI Memory/Chat, עדכון חשבון והקמת לקוח.

בדיקות חובה לפני Production אמיתי:

- ליצור משתמש לקוח עם סיסמה ממסך האדמין ולשייך אותו ללקוח אחד.
- לוודא שאדמין רואה את כל החשבונות ולקוח רואה רק את החשבון המשויך אליו.
- לוודא שאיפוס סיסמה ממסך האדמין מבטל שימוש בסיסמה הישנה.

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
