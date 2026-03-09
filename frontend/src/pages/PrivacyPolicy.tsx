import { useEffect } from "react";
import { Link } from "react-router-dom";

const LAST_UPDATED = "March 9, 2026";

export default function PrivacyPolicy() {
  useEffect(() => {
    document.title = "Privacy Policy | AdOps Pulse";
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg-main)] px-4 py-8 text-[var(--text-primary)] sm:px-6">
      <main className="mx-auto max-w-4xl">
        <article className="panel p-6 sm:p-8">
          <p className="section-kicker">Legal</p>
          <h1 className="mt-2 brand-display text-3xl text-[var(--text-primary)]">Privacy Policy</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">Last updated: {LAST_UPDATED}</p>

          <div className="mt-4 flex flex-wrap gap-2 text-xs sm:text-sm">
            <Link className="focus-ring rounded-lg border border-[var(--line)] px-3 py-1.5 hover:bg-[var(--bg-soft)]" to="/privacy-login-app">
              Login Dialog Privacy
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
              <h2 className="text-base font-semibold text-[var(--text-primary)]">1. Information we collect</h2>
              <p>
                We collect account and campaign data required to operate AdOps Pulse, including authentication details,
                Meta ad account structure, campaign insights, ad performance metrics, and configuration preferences.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">2. How we use information</h2>
              <p>
                We use data to provide analytics, recommendations, campaign automation workflows, safety controls, and
                reporting. We do not sell personal data.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">3. Sharing and disclosures</h2>
              <p>
                Data is shared only with service providers needed to run the product (for example, cloud hosting,
                authentication, and Meta APIs) or where required by law.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">4. Data retention</h2>
              <p>
                We retain data while your account is active and for a limited period afterward for security, legal, and
                audit obligations.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">5. Your rights</h2>
              <p>
                You may request access, correction, or deletion of your data by contacting us using the support channel
                associated with your account.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">6. Security</h2>
              <p>
                We apply technical and organizational controls designed to protect your data, including encrypted token
                storage and access controls.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">7. Changes</h2>
              <p>
                We may update this policy from time to time. Material updates will be reflected by changing the “Last
                updated” date.
              </p>
            </section>
          </div>
        </article>
      </main>
    </div>
  );
}
