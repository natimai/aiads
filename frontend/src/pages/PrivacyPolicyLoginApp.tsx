import { useEffect } from "react";
import { Link } from "react-router-dom";

const LAST_UPDATED = "March 9, 2026";

export default function PrivacyPolicyLoginApp() {
  useEffect(() => {
    document.title = "Privacy Policy for Login Dialog | AdOps Pulse";
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg-main)] px-4 py-8 text-[var(--text-primary)] sm:px-6">
      <main className="mx-auto max-w-4xl">
        <article className="panel p-6 sm:p-8">
          <p className="section-kicker">Meta App Details</p>
          <h1 className="mt-2 brand-display text-3xl text-[var(--text-primary)]">
            Privacy Policy for Login Dialog and App Details
          </h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">Last updated: {LAST_UPDATED}</p>

          <div className="mt-4 flex flex-wrap gap-2 text-xs sm:text-sm">
            <Link className="focus-ring rounded-lg border border-[var(--line)] px-3 py-1.5 hover:bg-[var(--bg-soft)]" to="/privacy">
              General Privacy Policy
            </Link>
            <Link className="focus-ring rounded-lg border border-[var(--line)] px-3 py-1.5 hover:bg-[var(--bg-soft)]" to="/terms">
              Terms of Service
            </Link>
            <Link className="focus-ring rounded-lg border border-[var(--line)] px-3 py-1.5 hover:bg-[var(--bg-soft)]" to="/">
              Back to App
            </Link>
          </div>

          <div className="mt-6 space-y-5 text-sm leading-7 text-[var(--text-secondary)]">
            <section>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">1. Data received from Meta Login</h2>
              <p>
                When you connect Meta, we may receive basic profile fields and permissions approved by you, including
                access to ad account data, page list access, and related advertising objects required for campaign
                operations.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">2. Purpose of processing</h2>
              <p>
                Data from Meta Login is used only to authenticate your session, connect authorized ad accounts, run
                requested actions, and display analytics and operational insights inside AdOps Pulse.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">3. Data sharing</h2>
              <p>
                We do not sell Meta user data. We share data only with processors needed to provide the service
                (infrastructure, logging, and API integrations), under confidentiality and security obligations.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">4. Retention and revocation</h2>
              <p>
                You can revoke permissions at any time from your Meta account settings. Once disconnected, API access is
                removed and future sync operations stop.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">5. Data deletion requests</h2>
              <p>
                To request deletion of data linked to your connected Meta account, contact support through your account
                channel and include your Meta account ID. We will process deletion in accordance with applicable laws.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">6. Security safeguards</h2>
              <p>
                We use encrypted token storage, role-based access controls, and infrastructure-level protections to
                reduce unauthorized access risk.
              </p>
            </section>
          </div>
        </article>
      </main>
    </div>
  );
}
