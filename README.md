# moneyman-ui

ממשק לניהול מספר חשבונות בנק עם moneyman + GitHub Actions.

## איך זה עובד
- **`accounts.json`** — רשימת חשבונות (פומבי, ללא סיסמאות).
- **GitHub Secrets** — מאחסנים את שמות המשתמש/סיסמאות לבנק (`BANK_USER_<ID>`, `BANK_PASS_<ID>`) ואת פרטי ה-SMTP (`MAIL_USERNAME`, `MAIL_PASSWORD`).
- **Workflow** (`.github/workflows/scrape.yml`) רץ כל שעה ב-:05, מסנן אילו חשבונות זמינים לפי שעה ותדירות, ומריץ matrix job לכל אחד.
- כל job מריץ את moneyman, בונה HTML, ושולח מייל לכתובת היעד של החשבון.

## ממשק
GitHub Pages (תיקיית `docs/`) — UI סטטי שמדבר ישירות מול GitHub API באמצעות PAT שנשמר ב-localStorage של הדפדפן בלבד.

## כתובת
- UI: https://tmarchum.github.io/moneyman-ui/
- Repo: https://github.com/tmarchum/moneyman-ui
