# ADDZ OS - Roadmap

## מטרת המסמך

המסמך מגדיר את סדר הפיתוח של ADDZ OS.

ADDZ OS נבנית כשכבה נוספת על הדאשבורד הקיים של הסוכנות. אין לבנות אפליקציה נפרדת ואין לבצע rewrite למערכת הקיימת ללא צורך ברור ואישור מפורש.

ה-Master Spec המלא נמצא ב:

`docs/addz-os-master-spec.md`

חשוב: כל Epic נבנה בנפרד. אין להתחיל Epic הבא לפני שה-Epic הנוכחי עומד ב-Definition of Done שלו.

---

# Epic 1 - Foundation

## מטרה

לבנות את הבסיס של שכבת הלקוחות בתוך הדאשבורד הקיים, בלי Website Scan ובלי AI.

## Scope

- זיהוי ומחזור של entities קיימות: users, organizations, contacts, deals, clients
- הרחבה של ה-navigation הקיים עם Clients במידת הצורך
- Clients page
- יצירת לקוח חדש
- המרה בסיסית מ-Deal Won ל-Client אם Deal entity כבר קיימת
- Client Workspace בסיסי
- Onboarding state foundation
- Activity Event foundation
- Roles/permissions הנדרשות לבסיס המערכת
- RTL/Hebrew-first UI

## לא כולל

- Website Scan
- Questionnaire
- Brand Brain
- Kickoff
- Project Management
- AI

## Definition of Done

- אפשר ליצור Client מתוך המערכת הקיימת
- Client מופיע ברשימת לקוחות
- אפשר לפתוח Client Workspace
- נשמר onboarding status ראשוני
- פעולות מרכזיות נרשמות ב-Activity Log
- אין regression בדאשבורד הקיים
- התשתית משתמשת ב-auth, DB, routing ו-design system הקיימים ככל שניתן

---

# Epic 2 - Website Intelligence

## מטרה

לאפשר סריקה אוטומטית של אתר לקוח והפקת Structured Brand Intelligence עם מקורות.

## Scope

- Website Scan job
- Background job mechanism או הרחבה של מנגנון קיים
- Structured output
- Source tracking
- Confidence / verification metadata
- Scan status UI
- Re-run scan
- AI run logging
- Error/retry states

## Definition of Done

- ניתן להריץ סריקה על לקוח אמיתי
- הפלט נשמר כ-structured data
- לכל מידע חשוב יש מקור כאשר אפשר
- failure אינו שובר את ה-Client Workspace
- ניתן להריץ scan מחדש

---

# Epic 3 - Smart Questionnaire

## מטרה

לייצר שאלון onboarding דינמי בעברית על בסיס האתר, החבילה והמידע הקיים.

## Scope

- Questionnaire generator
- Package/service-aware modules
- Public onboarding route
- Secure public token
- Hebrew RTL UI
- One-question-at-a-time UX
- Autosave
- Branching
- Suggested answers
- Confirm/edit/skip
- File uploads בסיסיים
- Access checklist
- Notifications בסיסיות

## Definition of Done

- נוצר שאלון שונה בהתאם ללקוח ולחבילה
- לקוח יכול למלא מהטלפון
- אפשר לצאת ולחזור בלי לאבד מידע
- השאלון אינו שואל שוב מידע שכבר ידוע בוודאות
- questionnaire.completed event נוצר פעם אחת בלבד

---

# Epic 4 - Brand Brain

## מטרה

להפוך Website Intelligence + Questionnaire ל-Brand Brain מובנה, reviewable ו-source-aware.

## Scope

- Brand Brain generation
- Structured categories/items
- Source metadata
- Confidence/status
- Conflict detection
- Internal Review UI
- Human approval
- AI cannot write directly to approved data
- Versioning בסיסי

## Definition of Done

- Brand Brain נוצר מלקוח אמיתי
- ניתן לראות מקורות
- סתירות מזוהות ומוצגות
- משתמש אנושי יכול לפתור סתירות
- ניתן לאשר Brand Brain
- Approved data אינה נדרסת על ידי AI run נוסף

---

# Epic 5 - Kickoff

## מטרה

להפוך Brand Brain מאושר למסך עבודה לפגישת אפיון.

## Scope

- Kickoff generation
- Summary
- Important context
- Missing information
- Questions for meeting
- Open decisions
- Kickoff Ready state
- Mark kickoff complete

## Definition of Done

- Brand Brain מאושר מייצר Kickoff View שימושי
- אין צורך ב-Google Doc כדי לנהל את פגישת האפיון
- ניתן לסמן את הפגישה כהושלמה
- onboarding lifecycle יכול להגיע ל-onboarding_complete

---

# Epic 6 - Hardening

## מטרה

להפוך את Phase 1 למערכת יציבה מספיק לשימוש אמיתי על כמה לקוחות ברצף.

## Scope

- Permissions review
- Rate limiting
- Error states
- Retries
- Idempotency
- Responsive QA
- Notifications review
- Audit trail review
- AI logging review
- Performance בסיסי
- Migration/data integrity review

## Definition of Done

Phase 1 עובר 3 לקוחות אמיתיים ברצף עם ה-flow הבא:

```text
Deal Won
↓
Client Created
↓
Website Scan
↓
Smart Questionnaire
↓
Brand Brain
↓
Internal Review
↓
Kickoff Ready
```

ללא שימוש ב-Google Doc בתהליך האפיון.

---

# Phase 2 - Strategy & Approval

לא לבנות לפני השלמת Phase 1.

כיוון עתידי:

- Brand Brain to Strategy Draft
- Automation strategy
- Newsletter calendar
- Human review
- Client comments
- Client approval
- Strategy versioning

---

# Phase 3 - Project & Task Management

מטרת השלב היא להתחיל להחליף את Monday.

כיוון עתידי:

- Strategy to Project
- Auto-generated deliverables
- Tasks
- Dependencies
- Owners
- Statuses
- Workload/Capacity
- Internal approvals
- Client approvals

Monday נשארת פעילה עד שהשלב הזה מספיק יציב.

---

# Phase 4 - Production Intelligence

כיוון עתידי:

- Copy Agent
- Creative brief generation
- Design workflow
- Internal QA Agent
- Client approval
- Build workflow
- Pre-Send QA

---

# Phase 5 - Performance & Learning

כיוון עתידי:

- Campaign metrics
- Structured insights
- Performance memory
- Learning loop
- Client Health
- Retention alerts

---

# Phase 6 - Finance & CEO Intelligence

כיוון עתידי:

- Client P&L
- Contribution Margin
- Revenue
- MRR
- Churn
- Pipeline
- Capacity
- Team economics
- Company P&L
- CEO dashboard

---

# כלל עבודה

לפני כל Epic:

1. לסרוק את הקוד הקיים
2. להבין מה כבר קיים
3. להציע Implementation Plan
4. לאשר את התוכנית
5. רק אז לכתוב קוד

אין לבנות תשתית עתידית רק כי היא מופיעה ב-Roadmap, אלא אם היא הכרחית ל-Epic הנוכחי.
