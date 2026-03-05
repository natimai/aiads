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
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-100">Campaign Explorer</h2>
        <p className="max-w-3xl text-sm text-slate-400">
          Explore your full Meta account hierarchy in one view: Campaigns to Ad Sets to Ads.
          Expand for targeting, location, budget, creative details, and fast status actions.
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
