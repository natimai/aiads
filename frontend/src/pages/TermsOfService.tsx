import { useEffect } from "react";
import { Link } from "react-router-dom";

const LAST_UPDATED = "March 9, 2026";

export default function TermsOfService() {
  useEffect(() => {
    document.title = "Terms of Service | AdOps Pulse";
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg-main)] px-4 py-8 text-[var(--text-primary)] sm:px-6">
      <main className="mx-auto max-w-4xl">
        <article className="panel p-6 sm:p-8">
          <p className="section-kicker">Legal</p>
          <h1 className="mt-2 brand-display text-3xl text-[var(--text-primary)]">Terms of Service</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">Last updated: {LAST_UPDATED}</p>

          <div className="mt-4 flex flex-wrap gap-2 text-xs sm:text-sm">
            <Link className="focus-ring rounded-lg border border-[var(--line)] px-3 py-1.5 hover:bg-[var(--bg-soft)]" to="/privacy">
              Privacy Policy
            </Link>
            <Link className="focus-ring rounded-lg border border-[var(--line)] px-3 py-1.5 hover:bg-[var(--bg-soft)]" to="/privacy-login-app">
              Login Dialog Privacy
            </Link>
            <Link className="focus-ring rounded-lg border border-[var(--line)] px-3 py-1.5 hover:bg-[var(--bg-soft)]" to="/">
              Back to App
            </Link>
          </div>

          <div className="mt-6 space-y-5 text-sm leading-7 text-[var(--text-secondary)]">
            <section>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">1. Acceptance of terms</h2>
              <p>
                By using AdOps Pulse, you agree to these terms and to any policies referenced in them.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">2. Account responsibilities</h2>
              <p>
                You are responsible for the accuracy of account details, safeguarding credentials, and all actions taken
                under your account.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">3. Acceptable use</h2>
              <p>
                You may not use the service for unlawful activities, unauthorized access, abuse of third-party APIs, or
                violations of Meta platform policies.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">4. Third-party services</h2>
              <p>
                The product integrates with external providers (including Meta). Their availability and policies may
                affect service behavior.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">5. Service availability</h2>
              <p>
                We aim for reliable operation but do not guarantee uninterrupted or error-free service at all times.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">6. Limitation of liability</h2>
              <p>
                To the maximum extent permitted by law, AdOps Pulse is not liable for indirect or consequential damages
                resulting from use of the service.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">7. Termination</h2>
              <p>
                We may suspend or terminate access in cases of abuse, security risks, legal requirements, or terms
                violations.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">8. Updates to terms</h2>
              <p>
                We may update these terms from time to time. Continued use after updates means acceptance of the revised
                terms.
              </p>
            </section>
          </div>
        </article>
      </main>
    </div>
  );
}
