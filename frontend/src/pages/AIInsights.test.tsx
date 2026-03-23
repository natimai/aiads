import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import AIInsights from "./AIInsights";

const reviewMutate = vi.fn();
const generateMutate = vi.fn();
const executeMutate = vi.fn();
const rollbackMutate = vi.fn();
const savePolicyMutate = vi.fn();

vi.mock("../contexts/AccountContext", () => ({
  useAccounts: () => ({
    selectedAccountId: "acc-1",
    selectedAccount: { id: "acc-1", accountName: "Main Account" },
    accounts: [{ id: "acc-1", accountName: "Main Account" }],
  }),
}));

vi.mock("../hooks/useDiagnosis", () => ({
  useDiagnosis: () => ({ data: null, isLoading: false, error: null }),
  useTriggerDiagnosis: () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  }),
}));

vi.mock("../hooks/useAIAnalysis", () => ({
  useAIInsights: () => ({ data: [], isLoading: false }),
  useTriggerAIAnalysis: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("../hooks/useRecommendations", () => ({
  useRecommendations: () => ({
    data: [
      {
        id: "rec-1",
        type: "budget_optimization",
        status: "pending",
        priority: "high",
        entityLevel: "campaign",
        entityId: "cmp-1",
        title: "Increase budget on winner",
        why: "ROAS is consistently above target.",
        reasoning: "7-day trend stable",
        confidence: 0.86,
        expectedImpact: { summary: "Expected +12% ROAS" },
        actionsDraft: ["Increase budget by 15%"],
        createdAt: new Date().toISOString(),
      },
      {
        id: "rec-2",
        type: "budget_optimization",
        status: "executed",
        priority: "medium",
        entityLevel: "campaign",
        entityId: "cmp-2",
        title: "Reduce budget on weak campaign",
        why: "ROAS trend is negative.",
        reasoning: "Costs rising for 5 days",
        confidence: 0.8,
        expectedImpact: { summary: "Reduce wasted spend" },
        actionsDraft: ["Reduce budget by 10%"],
        createdAt: new Date().toISOString(),
      },
      {
        id: "rec-3",
        type: "budget_optimization",
        status: "approved",
        priority: "high",
        entityLevel: "campaign",
        entityId: "cmp-3",
        title: "Scale approved campaign",
        why: "Approved recommendation ready to execute.",
        reasoning: "Approval was granted",
        confidence: 0.9,
        expectedImpact: { summary: "Potential growth in conversions" },
        actionsDraft: ["Increase budget by 10%"],
        executionPlan: { action: "adjust_budget", targetLevel: "campaign", targetId: "cmp-3", deltaPct: 10 },
        createdAt: new Date().toISOString(),
      },
    ],
    isLoading: false,
  }),
  useGenerateRecommendations: () => ({
    mutate: generateMutate,
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
  }),
  useReviewRecommendation: () => ({
    mutate: reviewMutate,
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
  }),
  useExecuteRecommendation: () => ({
    mutate: executeMutate,
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
  }),
  useRollbackRecommendation: () => ({
    mutate: rollbackMutate,
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
  }),
  useRollbackPreview: () => ({
    data: { canRollback: true, action: "rollback_budget", currentBudget: 1100, restoredBudget: 1000 },
    isLoading: false,
  }),
  useExecutePreview: () => ({
    data: { canExecute: true, action: "adjust_budget", currentBudget: 1000, newBudget: 1100 },
    isLoading: false,
  }),
  useRecommendationPolicy: () => ({
    data: {
      allowExecute: true,
      allowRollback: true,
      minConfidenceToExecute: 0.65,
      maxBudgetDeltaPct: 30,
    },
    isLoading: false,
    saveMutation: {
      mutate: savePolicyMutate,
      isPending: false,
    },
  }),
  useRecommendationExecutions: () => ({
    data: [],
    isLoading: false,
  }),
}));

describe("AIInsights", () => {
  beforeEach(() => {
    reviewMutate.mockReset();
    generateMutate.mockReset();
    executeMutate.mockReset();
    rollbackMutate.mockReset();
    savePolicyMutate.mockReset();
  });

  it("renders AI Campaign Manager and recommendations", async () => {
    render(<AIInsights />);

    expect(screen.getByText("מרכז ניהול המלצות AI")).toBeInTheDocument();
    expect(screen.getByText("Increase budget on winner")).toBeInTheDocument();

    const approveButtons = screen.getAllByRole("button", { name: /^אישור$/ });
    expect(approveButtons.length).toBeGreaterThan(0);
    await userEvent.click(approveButtons[0]!);
    expect(reviewMutate).toHaveBeenCalledWith({
      recommendationId: "rec-1",
      decision: "approve",
    });
  });

  it("triggers generation action", async () => {
    render(<AIInsights />);

    const generateButtons = screen.getAllByRole("button", { name: /יצירת המלצות/ });
    await userEvent.click(generateButtons[0]!);
    expect(generateMutate).toHaveBeenCalledTimes(1);
  });

  it("shows execute flow for approved recommendation", async () => {
    render(<AIInsights />);
    const previewButtons = screen.getAllByRole("button", { name: /תצוגת ביצוע/ });
    expect(previewButtons.length).toBeGreaterThan(0);
    await userEvent.click(previewButtons[0]!);
    const executeButtons = screen.getAllByRole("button", { name: /^ביצוע$/ });
    await userEvent.click(executeButtons[0]!);
    expect(executeMutate).toHaveBeenCalledTimes(1);
  });

  it("shows execution history toggle for executed recommendations", () => {
    render(<AIInsights />);
    const historyButtons = screen.getAllByRole("button", { name: /היסטוריית ביצוע/ });
    expect(historyButtons.length).toBeGreaterThan(0);
  });

  it("allows rollback action on executed recommendation", async () => {
    render(<AIInsights />);
    const previewButtons = screen.getAllByRole("button", { name: /תצוגת Rollback/ });
    expect(previewButtons.length).toBeGreaterThan(0);
    await userEvent.click(previewButtons[0]!);
    const rollbackButtons = screen.getAllByRole("button", { name: "Rollback" });
    await userEvent.click(rollbackButtons[0]!);
    expect(rollbackMutate).toHaveBeenCalledTimes(1);
  });

  it("saves execution policy", async () => {
    render(<AIInsights />);
    const policyTabButtons = screen.getAllByRole("button", { name: /^מדיניות$/ });
    await userEvent.click(policyTabButtons[0]!);
    const saveButtons = screen.getAllByRole("button", { name: /שמירת מדיניות/ });
    await userEvent.click(saveButtons[0]!);
    expect(savePolicyMutate).toHaveBeenCalledTimes(1);
  });
});
