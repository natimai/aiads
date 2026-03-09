import { useState } from "react";
import {
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { Link } from "react-router-dom";
import { auth } from "../services/firebase";
import { LogIn, Mail, Sparkles } from "lucide-react";
import { t } from "../utils/copy";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setError(err.message?.replace("Firebase: ", "") || "ההתחברות נכשלה");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    setLoading(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err: any) {
      if (err.code !== "auth/popup-closed-by-user") {
        setError(err.message?.replace("Firebase: ", "") || "ההתחברות עם Google נכשלה");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-8 sm:px-6">
      <div className="grid w-full gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <section className="panel hidden p-8 lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="section-kicker">Meta Operations</p>
            <h2 className="mt-3 brand-display text-4xl leading-tight text-[var(--text-primary)]">
              שליטה מלאה בביצועי הפרסום שלך
            </h2>
            <p className="mt-3 max-w-md text-base text-[var(--text-secondary)]">
              ניטור התראות, החלטות AI, בניית קמפיינים ודוחות במקום אחד שמתאים לעבודה יומית אמיתית.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="panel-soft p-3">
              <p className="text-xs text-[var(--text-muted)]">זמן החלטה</p>
              <p className="mt-1 text-xl font-bold text-[var(--text-primary)]">&lt; 2 דקות</p>
            </div>
            <div className="panel-soft p-3">
              <p className="text-xs text-[var(--text-muted)]">התראות פעילות</p>
              <p className="mt-1 text-xl font-bold text-[var(--text-primary)]">24/7</p>
            </div>
          </div>
        </section>

        <div className="panel w-full max-w-xl justify-self-center p-8">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--line-strong)] bg-[linear-gradient(135deg,var(--accent)_0%,var(--accent-2)_100%)] shadow-[var(--shadow-main)]">
              <Sparkles className="h-7 w-7 text-[#041325]" />
            </div>
            <h1 className="brand-display text-3xl text-[var(--text-primary)]">{t("app.brand")}</h1>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{t("login.subtitle")}</p>
          </div>

          <button
            onClick={handleGoogle}
            disabled={loading}
            className="focus-ring btn-secondary mt-6 flex min-h-11 w-full items-center justify-center gap-3 px-4 text-sm font-medium disabled:opacity-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            המשך עם Google
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--line)]" />
            <span className="text-xs text-[var(--text-muted)]">או</span>
            <div className="h-px flex-1 bg-[var(--line)]" />
          </div>

          <form onSubmit={handleEmail} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">אימייל</label>
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="focus-ring ltr w-full rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] py-2.5 pr-10 pl-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                  placeholder="you@example.com"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">סיסמה</label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
                className="focus-ring w-full rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="focus-ring btn-primary flex min-h-11 w-full items-center justify-center gap-2 px-4 text-sm disabled:opacity-50"
            >
              <LogIn className="h-4 w-4" />
              {loading ? "טוען..." : isSignUp ? "יצירת חשבון" : "כניסה למערכת"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-[var(--text-muted)]">
            {isSignUp ? "כבר יש לך חשבון?" : "עדיין אין לך חשבון?"}{" "}
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError("");
              }}
              className="font-semibold text-[var(--accent-2)] hover:underline"
            >
              {isSignUp ? "כניסה" : "פתיחת חשבון"}
            </button>
          </p>

          <p className="mt-4 text-center text-[11px] leading-5 text-[var(--text-muted)]">
            By continuing you agree to our{" "}
            <Link className="font-semibold text-[var(--accent-2)] hover:underline" to="/terms">
              Terms of Service
            </Link>
            ,{" "}
            <Link className="font-semibold text-[var(--accent-2)] hover:underline" to="/privacy">
              Privacy Policy
            </Link>
            , and{" "}
            <Link className="font-semibold text-[var(--accent-2)] hover:underline" to="/privacy-login-app">
              Login Dialog Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
