# Meta Campaign Manager

Full-stack campaign management and monitoring system for Meta (Facebook/Instagram) advertising, fully hosted on Firebase.

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

Copy `.env.example` to `.env` and fill in your credentials.

For production, use Firebase Secret Manager:

```bash
firebase functions:secrets:set META_APP_ID
firebase functions:secrets:set META_APP_SECRET
firebase functions:secrets:set GEMINI_API_KEY
firebase functions:secrets:set TELEGRAM_BOT_TOKEN
firebase functions:secrets:set TOKEN_ENCRYPTION_KEY
```

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

**מדריך מלא:** [DEPLOY.md](./DEPLOY.md)

### Deploy מהיר
```bash
npm run deploy
```

### GitHub Actions (CI/CD)
**Secret יחיד:** הוסף `FIREBASE_TOKEN` (מריצת `firebase login:ci`).  
כל push ל-`main` מפעיל deploy אוטומטי.

**חשוב:** מחק את App Hosting backend אם קיים – ראה [DEPLOY.md](./DEPLOY.md#שלב-1-מחיקת-app-hosting-חד-פעמי)

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
