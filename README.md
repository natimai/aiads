# Meta Campaign Manager

Full-stack campaign management and monitoring system for Meta (Facebook/Instagram) advertising, **fully hosted בענן** — Firebase, Cloud Run, GitHub Actions. אין תלות במחשב המקומי.

## Tech Stack

**Backend:** Firebase Cloud Functions (Python 3.11+), Firestore, Cloud Scheduler  
**Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4, Recharts, TanStack Query  
**AI:** Google Gemini 2.5 Pro  
**Notifications:** Telegram Bot, SendGrid Email, Twilio SMS/WhatsApp

## Features

- **Smart Alert System** — ROAS drop, creative fatigue, budget anomaly, CPI spike, campaign status
- **Real-Time Dashboard** — KPI cards, performance charts, campaign tables, heatmaps
- **AI-Powered Recommendations** — Daily summaries, budget optimization, creative insights
- **Automated Reports** — Daily/weekly reports via Telegram and email
- **Multi-Account Management** — Connect and monitor multiple Meta Ad Accounts

## Setup

### 1. Firebase Project

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login and initialize
firebase login
firebase use --add  # select your project
```

### 2. Environment Variables

**הכל בענן — ללא תלות במחשב המקומי**

Production משתמש ב-GitHub Secrets בלבד. ה-deploy מריץ אוטומטית מ-GitHub Actions — אין צורך ב-`.env` מקומי.

### 3. Frontend

```bash
cd frontend
npm install

# Create .env.local with your Firebase config
# VITE_FIREBASE_API_KEY=...
# VITE_FIREBASE_AUTH_DOMAIN=...
# etc.

npm run dev  # Development server
```

### 4. Backend (Local Development)

```bash
cd functions
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Start Firebase Emulators
firebase emulators:start
```

## Deployment

### פריסה מלמעלה לאמצע (Cloud-Only)

1. העתק את הפרויקט ל-GitHub
2. הוסף את כל ה-Secrets לטבלה למעלה ב-GitHub → Settings → Secrets and variables → Actions
3. דחוף ל-`main` — ה-deploy ירוץ אוטומטית
4. האתר יהיה זמין ב-`https://[project-id].web.app`

### ידני (Manual)
```bash
# Build frontend
cd frontend && npm run build

# Deploy everything
firebase deploy

# Or deploy individually
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore:rules
```

### GitHub Actions (CI/CD) — כל השירותים בענן

ה-workflow ב-`.github/workflows/deploy.yml` מריץ deploy אוטומטי בכל push ל-`main`. אין תלות במחשב המקומי — הכל רץ על שרתי GitHub ו-Google Cloud.

**חשוב:** השתמש ב-**Firebase Hosting** (לא App Hosting).

**Secrets נדרשים ב-GitHub** (Settings → Secrets and variables → Actions → New repository secret):

| Secret | חובה | תיאור |
|--------|------|-------|
| `FIREBASE_SERVICE_ACCOUNT` | ✅ | JSON מלא של Service Account (Firebase Console → Project Settings → Service accounts) |
| **Frontend (בניית Vite):** | | |
| `VITE_FIREBASE_API_KEY` | ✅ | Firebase API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | ✅ | `*.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | ✅ | `aiads-f0675` |
| `VITE_FIREBASE_STORAGE_BUCKET` | ✅ | `*.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | ✅ | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | ✅ | Firebase app ID |
| **Backend (Cloud Run):** | | |
| `FRONTEND_URL` | ✅ | כתובת האתר (למשל `https://aiads-f0675.web.app`) |
| `META_APP_ID` | ✅ | Meta App ID |
| `META_APP_SECRET` | ✅ | Meta App Secret |
| `TOKEN_ENCRYPTION_KEY` | ✅ | מפתח הצפנה (הרץ: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`) |
| `GEMINI_API_KEY` | ✅ | מפתח Google AI Studio (Gemini) |
| `TELEGRAM_BOT_TOKEN` | | לטלגרם |
| `TELEGRAM_CHAT_ID` | | לטלגרם |
| `SENDGRID_API_KEY` | | לאימייל |
| `ALERT_EMAIL_FROM` | | לאימייל |
| `ALERT_EMAIL_TO` | | לאימייל |

אחרי הוספת כל ה-Secrets — דחוף ל-`main` או הרץ **Actions → Deploy to Firebase → Run workflow**.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| R | Refresh all data |
| 0 | Switch to All Accounts |
| 1-9 | Switch to account by index |
| / | Focus search |
| ? | Show shortcuts help |
| Esc | Close dialogs |

## Project Structure

```
├── firebase.json          # Firebase config
├── firestore.rules        # Security rules
├── firestore.indexes.json # Composite indexes
├── functions/             # Python Cloud Functions
│   ├── main.py            # Entry point
│   ├── api/               # HTTP endpoints
│   ├── scheduled/         # Cron jobs
│   ├── services/          # Business logic
│   └── utils/             # Helpers
└── frontend/              # React SPA
    └── src/
        ├── components/    # UI components
        ├── pages/         # Route pages
        ├── hooks/         # React Query hooks
        ├── services/      # API client
        ├── contexts/      # React contexts
        └── types/         # TypeScript types
```
