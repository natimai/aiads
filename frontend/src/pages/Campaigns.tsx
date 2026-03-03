import { useParams } from "react-router-dom";
import { CampaignTable } from "../components/dashboard/CampaignTable";
import { useCampaigns } from "../hooks/useCampaigns";
import { useAccounts } from "../contexts/AccountContext";
import { useEffect } from "react";
import { inferAccountVertical } from "../utils/metricsConfig";

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
      <div>
        <h2 className="text-xl font-bold text-slate-900">Campaigns</h2>
        <p className="text-sm text-slate-500">
          {selectedAccount ? selectedAccount.accountName : "All Accounts"} · Detailed campaign view with drill-down
        </p>
      </div>

      <CampaignTable
        campaigns={campaigns ?? []}
        currency={selectedAccount?.currency ?? "USD"}
        loading={isLoading}
        vertical={vertical}
      />
    </div>
  );
}
