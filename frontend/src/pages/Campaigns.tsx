import { useParams } from "react-router-dom";
import { useEffect } from "react";
import { useCampaigns } from "../hooks/useCampaigns";
import { useAccounts } from "../contexts/AccountContext";
import { inferAccountVertical } from "../utils/metricsConfig";
import { CampaignExplorer } from "../components/campaigns/CampaignExplorer";

export default function Campaigns() {
  const { accountId } = useParams();
  const { setSelectedAccountId, selectedAccount } = useAccounts();
  const { data: campaigns, isLoading } = useCampaigns(true);
  const vertical = inferAccountVertical(selectedAccount, campaigns ?? []);

  useEffect(() => {
    if (accountId) {
      setSelectedAccountId(accountId);
    }
  }, [accountId, setSelectedAccountId]);

  return (
    <div className="space-y-6 reveal-up">
      <div className="panel p-5 sm:p-6">
        <h2 className="brand-display text-2xl text-[var(--text-primary)]">סייר קמפיינים</h2>
        <p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">
          חקירת היררכיית החשבון המלאה במקום אחד: קמפיינים, קבוצות מודעות ומודעות.
          פתיחה מהירה לפרטי טרגוט, מיקום, תקציב, קריאייטיב ופעולות סטטוס.
        </p>
      </div>

      <CampaignExplorer
        campaigns={campaigns ?? []}
        currency={selectedAccount?.currency ?? "USD"}
        loading={isLoading}
        vertical={vertical}
      />
    </div>
  );
}
