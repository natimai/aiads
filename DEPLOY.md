# 🚀 הגדרת Deploy לפיירבייס – צעד אחר צעד

מדריך להפעלת deploy אוטומטי דרך GitHub Actions, עם **secret אחד בלבד**.

---

## שלב 1: מחיקת App Hosting (חד-פעמי)

הפרויקט הוא SPA סטטי – מתאים ל-**Firebase Hosting**, לא ל-App Hosting. אם חיברת את ה-repo ל-App Hosting, מחק את ה-backend:

1. [Firebase Console](https://console.firebase.google.com/project/aiads-f0675/overview) → **Build** → **App Hosting**
2. בחר את ה-backend → **Settings** → **Delete backend**

או ב-CLI:
```bash
firebase apphosting:backends:delete aiads --project aiads-f0675
```

---

## שלב 2: יצירת FIREBASE_TOKEN (פעם אחת)

```bash
# התחבר לפיירבייס (יפתח דפדפן)
firebase login

# צור token ל-CI (העתק את הפלט)
firebase login:ci
```

הפלט נראה בערך כך:
```
1/xxx...  Success! Use this token for CI/CD: 1//xxx...
```

---

## שלב 3: הוספת Secret ב-GitHub

1. ב-GitHub: **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret**
3. שם: `FIREBASE_TOKEN`
4. ערך: ה-token מ־`firebase login:ci`

---

## סיום – Deploy אוטומטי

מעכשיו, בכל push ל-`main`:

1. בניית Frontend
2. העלאה ל-Firebase Hosting
3. עדכון Firestore Rules
4. עדכון Storage Rules

**האתר:** https://aiads-f0675.web.app

---

## Deploy ידני (מהמחשב)

```bash
npm run deploy
```

או:
```bash
cd frontend && npm run build && cd .. && firebase deploy --only hosting,firestore:rules,storage
```

---

## Cloud Functions (אופציונלי)

Functions דורשות **תוכנית Blaze** (pay-as-you-go):

1. [שדרג את הפרויקט](https://console.firebase.google.com/project/aiads-f0675/usage/details)
2. הוסף ל-workflow את שלב ה-Functions (הוסר כרגע כי דורש Blaze)

---

## פתרון בעיות

| בעיה | פתרון |
|------|-------|
| "container failed to start on PORT=8080" | App Hosting עדיין פעיל – מחק את ה-backend (שלב 1) |
| "Permission denied" ב-deploy | בדוק ש-`FIREBASE_TOKEN` תקין והרץ שוב `firebase login:ci` |
| Build נכשל | בדוק שה-workflow משתמש ב-Node 20 ותיקיית `frontend` קיימת |
