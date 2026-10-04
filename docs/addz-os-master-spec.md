# ADDZ OS - Master Spec

## 1. מטרת המסמך

מסמך זה מתאר את ארכיטקטורת היעד של ADDZ OS לצורך קונטקסט מלא לפיתוח.

חשוב: זהו מסמך Master Spec בלבד. אין ליישם את כל המערכת בכל משימת פיתוח. בכל משימה יש ליישם רק את ה-Epic או ה-Scope שמוגדרים במפורש בפרומפט הנוכחי.

ADDZ OS נבנית כשכבה נוספת מעל הדאשבורד הקיים של הסוכנות. אין לבנות אפליקציה נפרדת, אין לבצע Rewrite למערכת הקיימת, ואין לשכפל תשתיות שכבר קיימות. יש להעדיף תמיד שימוש ב-stack, ב-DB, ב-auth, ב-components, ב-design system, ב-routing וב-patterns הקיימים, כל עוד הם מתאימים למטרה.

## 2. חזון המוצר

ADDZ OS היא מערכת ההפעלה הפנימית של הסוכנות.

המטרה היא לנהל את מחזור החיים המלא של לקוח eCommerce, החל מליד ומכירה, דרך onboarding, אפיון, אסטרטגיה, production, אישורים, QA, שליחה, ביצועים, למידה, retention ו-P&L.

המערכת צריכה לצמצם עבודה ידנית, להפוך את הידע של ADDZ לתהליך עקבי, להוריד תלות באנשים ספציפיים, ולאפשר לסוכנות לצמוח עם צוות רזה יותר בעזרת AI ותהליכים מובנים.

העיקרון המרכזי: הלקוח הוא מרכז המערכת.

```text
Client
├── CRM / Deal
├── Onboarding
├── Website Intelligence
├── Questionnaire
├── Brand Brain
├── Strategy
├── Projects
├── Campaigns
├── Automations
├── Tasks
├── Approvals
├── Performance
├── Client Health
└── Financials
```

## 3. עקרונות מוצר

### 3.1 Hebrew-first

המוצר מיועד בעיקר ללקוחות ישראליים ולצוות ישראלי.

- כל ממשק המשתמש בעברית
- RTL-first
- תאריכים בפורמט ישראלי
- מטבע בש"ח
- אזור זמן Asia/Jerusalem
- תמיכה תקינה בטקסט מעורב עברית ואנגלית
- שדות URL, אימייל וקוד יכולים להישאר LTR
- ניסוחי AI ללקוח צריכים להישמע טבעיים בעברית ולא מתורגמים מאנגלית

שמות טכניים בקוד וב-DB יכולים להישאר באנגלית.

### 3.2 Client-centric architecture

כל מידע תפעולי, אסטרטגי ופיננסי צריך להתחבר ל-`client_id` או ל-`organization_id` קיים.

אין לבנות מערכות נפרדות שאינן חולקות את אותה ישות לקוח.

### 3.3 AI assists, humans approve

AI מייצר טיוטות, הצעות, ניתוחים והמלצות.

AI אינו רשאי לכתוב ישירות למידע מאושר או לבצע פעולה בלתי הפיכה בשם הצוות, אלא אם הוגדר אחרת במפורש בעתיד.

במיוחד:

- AI יכול ליצור Brand Brain Draft
- AI יכול להציע תיקון או עדכון
- AI יכול לזהות סתירה
- רק משתמש אנושי מוסמך יכול להפוך מידע ל-Approved/Verified

### 3.4 Source-aware AI

כל מידע משמעותי שה-AI מפיק צריך לשמור, כאשר אפשר:

- value
- source
- source_url או source_id
- confidence
- verification_status
- created_at
- AI run/version

המטרה היא לאפשר traceability, debugging, review ושיפור לאורך זמן.

### 3.5 Event-driven workflows

תהליכים מרכזיים במערכת צריכים להיות מבוססי Events כדי לאפשר בעתיד Agents, Notifications, Automations ואינטגרציות בלי לייצר coupling מיותר.

### 3.6 Build on the existing dashboard

ADDZ OS היא הרחבה של הדאשבורד הקיים.

אין להקים:

- auth חדש אם כבר קיים
- users table חדשה אם כבר קיימת ישות משתמשים
- sidebar חדש אם אפשר להרחיב את הקיים
- design system נפרד אם כבר קיים
- database מקביל
- אפליקציה עצמאית נפרדת

לפני כל Epic יש לבדוק מה כבר קיים ולמחזר אותו.

## 4. חוויית המוצר

הכיוון העיצובי הוא נקי, מהיר ומינימליסטי.

השראה: Linear, Attio, Stripe.

עקרונות:

- hierarchy חזקה
- whitespace
- מעט צבעים
- borders עדינים
- tables נקיים
- sidebar קבוע
- loading skeletons
- error states ברורים
- פעולות מהירות
- לא להשתמש בכמות גדולה של cards צבעוניים
- לא לייצר תחושה של מערכת ישראלית מיושנת

בצד הלקוח, חוויית onboarding צריכה להרגיש כמו Typeform פרימיום שנבנה במיוחד עבורו.

## 5. מפת מחזור החיים העתידי

```text
Lead
↓
Qualified
↓
Meeting
↓
Proposal
↓
Won
↓
Client Created
↓
Website Intelligence
↓
Smart Questionnaire
↓
Brand Brain
↓
Internal Review
↓
Kickoff
↓
Strategy
↓
Client Approval
↓
Project Generation
↓
Copy
↓
Design
↓
Internal QA
↓
Client Approval
↓
Build
↓
Pre-Send QA
↓
Send
↓
Performance
↓
Learning
↓
Client Health
↓
Finance / P&L
```

## 6. Phase 1 Scope

Phase 1 מסתיים בנקודה שבה לקוח חדש עבר מתהליך סגירה ועד Brand Brain מאושר ו-Kickoff מוכן.

ה-flow:

```text
Deal Won
↓
Client Created
↓
Client Workspace
↓
Website Scan
↓
Smart Questionnaire Generated
↓
Questionnaire Sent
↓
Client Completes Questionnaire
↓
Brand Brain Draft Generated
↓
Conflicts Detected
↓
Internal Review
↓
Brand Brain Approved
↓
Kickoff View Generated
↓
Kickoff Ready
```

Phase 1 אינו כולל עדיין Project Management מלא, Copy Agent, Strategy Agent מלא, Campaign Performance או P&L חדש.

## 7. Phase 1 Functional Requirements

### 7.1 Lead / Deal to Client

אם קיים CRM בסיסי, Deal שנע ל-`won` צריך לאפשר פתיחת לקוח.

אם עדיין אין CRM, צריכה להיות אפשרות `+ לקוח חדש`.

שדות בסיסיים:

- שם העסק
- אתר
- איש קשר
- טלפון
- אימייל
- חבילה
- מחיר חודשי
- שירותים כלולים
- תאריך התחלה
- Owner פנימי
- הערה אופציונלית

בסיום נוצרת ישות Client בתוך המערכת הקיימת.

### 7.2 Client Workspace

כל לקוח מקבל workspace מרכזי.

Tabs ב-Phase 1:

- סקירה כללית
- קליטה ואפיון
- Brand Brain
- קבצים

מידע Header:

- שם לקוח
- סטטוס
- אתר
- חבילה
- MRR
- תאריך התחלה
- Owner

### 7.3 Onboarding State Machine

יש להשתמש ב-state מרכזי ולא בקבוצת booleans נפרדים.

מצבים מוצעים:

```text
client_created
website_scan_pending
website_scan_running
website_scan_complete
questionnaire_generating
questionnaire_ready
questionnaire_sent
questionnaire_in_progress
questionnaire_complete
brand_brain_generating
brand_brain_review
kickoff_ready
kickoff_complete
onboarding_complete
```

### 7.4 Website Intelligence

לאחר יצירת לקוח, המערכת סורקת את האתר ומפיקה Structured Data.

מינימום מידע לחילוץ:

- brand
- products
- product categories
- prices
- bundles
- subscriptions
- offers
- audiences
- pain points
- desires
- differentiators
- reviews/social proof
- guarantees
- shipping
- returns
- customer service
- tone of voice
- claims
- creative cues
- social links

הסריקה צריכה לשמור גם מקורות.

### 7.5 Smart Questionnaire

השאלון נוצר על בסיס:

- Client details
- Package
- Services
- Website Scan
- Existing CRM Data
- ADDZ Client Intelligence logic

השאלון צריך להבחין בין:

1. Known: מידע שלא צריך לשאול
2. Confirmation Required: מידע שכדאי להציג ללקוח לאישור
3. Unknown: מידע שחייבים לשאול

השאלון צריך להיות דינמי ומותאם לחבילה.

UX:

- שאלה אחת בכל מסך
- עברית טבעית
- RTL
- Mobile-first
- Autosave
- Progress
- אפשרות Skip
- אפשרות Edit suggested answer
- אפשרות Confirm suggested answer
- Branching logic
- אפשרות Upload לקבצים רלוונטיים

### 7.6 Access Checklist

ב-Phase 1 יש לנהל רק סטטוס גישה, בלי לשמור סיסמאות.

דוגמאות:

- Shopify
- Klaviyo
- Flashy
- Meta
- GA4
- Drive
- WhatsApp
- Other

סטטוסים:

- missing
- requested
- received
- not_required

### 7.7 Brand Brain

Brand Brain הוא Structured Data ולא מסמך Markdown יחיד.

קטגוריות ראשונות:

```text
brand_story
positioning
values
products
best_sellers
audiences
pain_points
desires
objections
beliefs
differentiators
competitors
offers
discount_rules
brand_voice
forbidden_language
approved_claims
customer_service
shipping
returns
creative_guidelines
newsletter_preferences
automation_preferences
open_questions
```

כל item צריך לשמור מקור, סטטוס ו-confidence כאשר רלוונטי.

### 7.8 Verification statuses

```text
verified
observed
inferred
needs_review
conflict
```

### 7.9 Conflict Detection

אם קיים מידע סותר בין Website, Questionnaire, CRM או מקור אחר, המערכת צריכה ליצור Conflict מפורש.

לדוגמה:

```text
Website: 3-5 ימי עסקים
Questionnaire: 7-14 ימי עסקים
```

משתמש אנושי בוחר את הערך הנכון או מזין ערך חדש.

### 7.10 Internal Review

ה-review צריך למקד את המשתמש בחריגים ולא לגרום לו לקרוא מחדש את כל המידע.

סדר עדיפות:

1. Conflicts
2. Missing information
3. Inferred information
4. Observed information

Dashboard review יכול להציג:

- מידע מאומת
- דורש בדיקה
- סתירות
- חוסרים
- שאלות מומלצות לפגישה

### 7.11 Kickoff View

לאחר Brand Brain approval, נוצר מסך לפגישת אפיון.

Sections:

- מה כבר למדנו
- המוצרים החשובים
- קהלי היעד
- הזדמנויות שזיהינו
- מה צריך לוודא
- שאלות מומלצות
- החלטות שצריך לקבל

ב-Phase 1 לא נדרש Transcript processing, אבל המבנה לא צריך לחסום אותו בעתיד.

### 7.12 Activity Log

כל פעולה משמעותית נשמרת.

Actor types:

```text
user
client
ai
system
```

אירועים לדוגמה:

- client.created
- website_scan.started
- website_scan.completed
- questionnaire.generated
- questionnaire.sent
- questionnaire.started
- questionnaire.completed
- brand_brain.generated
- brand_brain.review_started
- brand_brain.approved
- kickoff.generated
- kickoff.ready
- kickoff.completed
- onboarding.completed

### 7.13 AI Run Logging

כל AI run צריך לשמור לפחות:

- client_id
- run_type
- model
- skill_name
- skill_version
- prompt_version
- input reference
- output
- status
- error
- duration
- created_at

Prompt/Skill versions אינם יכולים להיות hard-coded ללא versioning.

### 7.14 Background Jobs

פעולות ארוכות צריכות לרוץ async.

Jobs צפויים:

- scan_website
- generate_questionnaire
- generate_brand_brain
- detect_conflicts
- generate_kickoff
- send_notification

יש לתמוך ב-status, retries ו-error state.

### 7.15 Notifications

Phase 1 צריך Notifications abstraction ולא קריאות email מפוזרות בקוד.

Triggers ראשונים:

- questionnaire.completed
- brand_brain.generated
- brand_brain.approved
- kickoff.ready

ערוצים ב-V1:

- in-app
- email

### 7.16 Roles

Roles ראשונים:

- Admin
- Strategy
- Operations
- Client

יש להעדיף הרחבה של מערכת ההרשאות הקיימת אם קיימת.

## 8. Data Model יעד מוצע

המודל הבא הוא הצעה בלבד. לפני יצירת migrations יש להשוות אותו ל-schema הקיים ולמחזר ישויות קיימות.

ישויות אפשריות:

```text
organizations
contacts
clients
deals
services
client_services
website_scans
website_scan_sources
questionnaires
questionnaire_questions
questionnaire_answers
files
client_access_items
brand_brains
brand_brain_items
data_conflicts
kickoffs
activity_events
ai_runs
notifications
```

אין ליצור טבלה חדשה אם ישות מקבילה כבר קיימת בדאשבורד הקיים.

## 9. API / Server Surface יעד

ה-API המדויק צריך להתאים ל-patterns הקיימים במערכת.

Conceptually:

```text
POST /clients
GET /clients
GET /clients/:id
PATCH /clients/:id

POST /clients/:id/website-scan
GET /clients/:id/website-scan

POST /clients/:id/questionnaire/generate
POST /clients/:id/questionnaire/send

GET /onboarding/:token
POST /onboarding/:token/answers

GET /clients/:id/brand-brain
PATCH /clients/:id/brand-brain/items/:itemId
POST /clients/:id/brand-brain/approve

GET /clients/:id/kickoff
GET /clients/:id/activity
```

## 10. Security

- Public onboarding token צריך להיות אקראי ולא ניתן לניחוש
- אין לשמור passwords של מערכות חיצוניות
- Uploads צריכים validation
- Public endpoints צריכים rate limiting
- הרשאות חייבות להיבדק server-side
- אין להסתמך על הסתרת רכיבי UI בלבד

## 11. Error Handling

הודעות שגיאה צריכות להיות ברורות בעברית.

דוגמה:

```text
לא הצלחנו לייצר את שאלון האפיון.
[נסה שוב]
```

Admin יכול לקבל פרטי תקלה נוספים.

## 12. Idempotency

Events ו-background jobs חייבים להיות idempotent כאשר פעולה כפולה עלולה ליצור duplicate data.

לדוגמה, `questionnaire.completed` שנשלח פעמיים לא יכול לייצר שני Brand Brains.

## 13. Definition of Done ל-Phase 1

Phase 1 נחשב גמור רק כאשר אפשר לקחת לפחות 3 לקוחות אמיתיים ברצף ולהעביר אותם בתהליך הבא ללא Google Doc:

```text
Deal Won
↓
Client Created
↓
Workspace Created
↓
Website Scan
↓
Smart Questionnaire Generated
↓
Questionnaire Sent
↓
Client fills on mobile
↓
Brand Brain Draft Generated
↓
Conflicts Detected
↓
Human Review
↓
Brand Brain Approved
↓
Kickoff View Generated
↓
Kickoff Ready
```

Acceptance criteria עסקיים:

- זמן ההכנה לפגישת אפיון ירד משמעותית
- אין צורך במסמך Drive כחלק מה-flow
- לקוח מסוגל למלא את השאלון מהטלפון בלי הדרכה
- השאלון לא שואל מידע שכבר ידוע בוודאות
- העובד מתמקד בחריגים, חוסרים וסתירות
- Brand Brain מספיק איכותי כדי לשמש בסיס לאסטרטגיה

## 14. מה Phase 1 לא כולל

לא לבנות במסגרת Phase 1:

- CRM מלא
- Project Management מלא
- Tasks engine מלא
- Gantt
- Capacity management
- Strategy Agent מלא
- Copy Agent
- Design workflow
- Campaign approval workflow מלא
- Flashy/Klaviyo sending
- Campaign performance
- Client Health
- P&L חדש
- HR system

הארכיטקטורה צריכה לאפשר אותם בהמשך, אבל אין ליישם אותם ללא Epic מפורש.

## 15. עתיד המערכת

בשלבים הבאים ADDZ OS אמורה להחליף בהדרגה גם את Monday כמערכת ניהול הפרויקטים של הסוכנות.

המטרה העתידית היא ש-Strategy מאושרת תייצר אוטומטית Project, Deliverables, Tasks, Dependencies, Owners ו-Approvals.

עד שהמערכת מגיעה לבשלות הזו, Monday נשארת כלי production מאחורי הקלעים.

## 16. כלל עבודה עם Coding Agents

לפני יישום כל Epic:

1. קרא את המסמך הזה לצורך קונטקסט
2. קרא את `docs/addz-os-roadmap.md`
3. סרוק את הקוד הקיים
4. מחזר תשתיות קיימות
5. אל תבנה שום Epic שלא התבקש
6. שמור backward compatibility
7. אל תבצע rewrite ללא צורך ברור ואישור מפורש
8. אם קיימת סתירה בין ה-Master Spec למערכת הקיימת, דווח עליה לפני שינוי ארכיטקטוני משמעותי
