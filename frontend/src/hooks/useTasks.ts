import { useQuery } from "@tanstack/react-query";
import { getTasks } from "../services/api";
import { useAccounts } from "../contexts/AccountContext";
import type { TasksResponse } from "../types";

export function useTasks(params?: { status?: string; limit?: number }) {
  const { accounts } = useAccounts();
  const hasManagedAccount = accounts.some((a) => a.isManagedByPlatform);

  return useQuery<TasksResponse>({
    queryKey: ["tasks", params?.status ?? "pending", params?.limit ?? 100],
    queryFn: () => getTasks(params),
    enabled: hasManagedAccount,
    staleTime: 30_000,      // treat as fresh for 30s — tasks don't change often
    refetchInterval: 60_000, // background refresh every minute
  });
}
