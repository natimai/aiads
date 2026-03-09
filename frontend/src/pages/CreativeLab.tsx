import { Palette, ImageOff, Sparkles, Gauge, Eye } from "lucide-react";
import { useCampaigns } from "../hooks/useCampaigns";
import { useInsights } from "../hooks/useInsights";

export default function CreativeLab() {
  const { data: campaigns, isLoading: campaignsLoading } = useCampaigns(true);
  const { data: insights, isLoading: insightsLoading } = useInsights();

  const fatigueSignals = (insights ?? [])
    .filter((item) => (item.frequency ?? 0) >= 2.8 || (item.ctr ?? 0) < 0.8)
    .slice(0, 6);

  const topAds = (campaigns ?? [])
    .flatMap((campaign) =>
      (campaign.adsets ?? []).flatMap((adset) =>
        (adset.ads ?? []).map((ad) => ({
          id: ad.id,
          name: ad.name,
          thumbnail: ad.creativeThumbnailUrl,
          status: ad.status,
          campaignName: campaign.name,
        }))
      )
    )
    .slice(0, 8);

  return (
    <div className="space-y-6 reveal-up">
      <section className="panel p-5 sm:p-6">
        <div>
          <p className="section-kicker">Creative Intelligence</p>
          <h2 className="brand-display text-2xl text-[var(--text-primary)]">מעבדת קריאייטיב</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            זיהוי עייפות קריאייטיב, ניתוח ביצועים ומיפוי נכסים חזותיים פעילים.
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="panel p-4 xl:col-span-1">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <Gauge className="h-4 w-4 text-[var(--warning)]" />
            אותות עייפות
          </h3>

          {insightsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-12 rounded-xl bg-[var(--bg-soft)] skeleton" />
              ))}
            </div>
          ) : fatigueSignals.length > 0 ? (
            <div className="space-y-2">
              {fatigueSignals.map((signal, index) => (
                <div key={`${signal.campaignId}-${index}`} className="panel-soft px-3 py-2">
                  <p className="text-xs font-semibold text-[var(--text-primary)]">{signal.campaignName ?? "קמפיין"}</p>
                  <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                    Frequency: <span className="ltr">{signal.frequency?.toFixed(2) ?? "0.00"}</span> · CTR: <span className="ltr">{signal.ctr?.toFixed(2) ?? "0.00"}%</span>
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-[var(--line)] p-3 text-xs text-[var(--text-secondary)]">
              לא זוהו כרגע אותות עייפות חריגים.
            </p>
          )}
        </section>

        <section className="panel p-4 xl:col-span-2">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <Eye className="h-4 w-4 text-[var(--accent-2)]" />
            נכסי קריאייטיב פעילים
          </h3>

          {campaignsLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="aspect-square rounded-xl bg-[var(--bg-soft)] skeleton" />
              ))}
            </div>
          ) : topAds.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {topAds.map((ad) => (
                <article key={ad.id} className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-soft)]">
                  <div className="aspect-square w-full overflow-hidden bg-[var(--bg-soft-2)]">
                    {ad.thumbnail ? (
                      <img src={ad.thumbnail} alt={ad.name} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[var(--text-muted)]">
                        <ImageOff className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-1 p-2">
                    <p className="clamp-2 text-xs font-semibold text-[var(--text-primary)]">{ad.name}</p>
                    <p className="clamp-2 text-[11px] text-[var(--text-muted)]">{ad.campaignName}</p>
                    <span className="inline-flex rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
                      {ad.status}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--line)] py-12 text-center">
              <Palette className="mb-3 h-10 w-10 text-[var(--text-muted)]" />
              <p className="text-sm text-[var(--text-secondary)]">אין עדיין נתוני קריאייטיב להצגה</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">לאחר סנכרון נתונים יופיעו כאן נכסים וניתוח ראשוני</p>
            </div>
          )}
        </section>
      </div>

      <section className="panel-soft flex items-center gap-2 px-4 py-3 text-xs text-[var(--text-secondary)]">
        <Sparkles className="h-4 w-4 text-[var(--accent)]" />
        שלב הבא: חיבור אוטומטי להמלצות קריאייטיב מתיבת הפעולות.
      </section>
    </div>
  );
}
