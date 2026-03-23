import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { DiagnosisReport } from "../types";
import { DiagnosisSummaryCard } from "../components/diagnosis/DiagnosisSummaryCard";
import { FindingsPanel } from "../components/diagnosis/FindingsPanel";
import { RecommendationCards } from "../components/diagnosis/RecommendationCards";
import { WhatNotToDoPanel } from "../components/diagnosis/WhatNotToDoPanel";
import { AlignmentBadge, AlignmentMiniBadge } from "../components/diagnosis/AlignmentBadge";

afterEach(cleanup);

function makeDiagnosis(overrides: Partial<DiagnosisReport> = {}): DiagnosisReport {
  return {
    id: "diag-1",
    accountId: "acc-1",
    evaluationLevel: "adset",
    summary: "ביצועי החשבון יציבים עם מגמת עלייה קלה ב-CPM",
    rootCause: "auction_cost_pressure",
    findings: [
      {
        title: "CPM עולה ב-3 ימים אחרונים",
        evidence: { cpm: 12.5, ctr: 1.8 },
        interpretation: "עלויות המכרז עולות, מה שמשפיע על העלות לתוצאה",
        rootCause: "auction_cost_pressure",
        suggestedAction: "בדקו אם הגדלת הקהל מורידה את ה-CPM",
        actionFraming: "hypothesis",
        validationMetric: "cpm_7d_trend",
        confidence: 0.65,
        riskLevel: "medium",
      },
    ],
    breakdownHypotheses: [
      {
        dimension: "age",
        segment: "25-34",
        observation: "סגמנט 25-34 מהווה 60% מההמרות",
        hypothesis: "ייתכן שמדובר באפקט הקצאה שולית",
        testPlan: "בדיקת A/B עם אדסט נפרד",
        confidence: 0.55,
      },
    ],
    officialAlignment: {
      checked: true,
      officialCount: 2,
      agrees: "unchecked",
      rationale: "2 המלצות רשמיות נטענו (budget_optimization, creative_optimization)",
      unavailableReason: null,
    },
    confidence: 0.72,
    dataFreshness: {
      insightsSyncedAt: new Date().toISOString(),
      structuresSyncedAt: new Date().toISOString(),
      breakdownsSyncedAt: new Date().toISOString(),
      isStale: false,
      isWarning: false,
    },
    guardrailsTriggered: [],
    engineVersion: "2.0.0",
    generatedAt: new Date().toISOString(),
    source: "deterministic",
    ...overrides,
  };
}

// ─── DiagnosisSummaryCard ────────────────────────────────────────────

describe("DiagnosisSummaryCard", () => {
  it("renders root cause badge and summary text", () => {
    const diag = makeDiagnosis();
    render(<DiagnosisSummaryCard diagnosis={diag} />);

    expect(screen.getByText("לחץ עלויות מכרז")).toBeInTheDocument();
    expect(screen.getByText(/ביצועי החשבון יציבים/)).toBeInTheDocument();
  });

  it("shows evaluation level badge", () => {
    const diag = makeDiagnosis({ evaluationLevel: "campaign" });
    render(<DiagnosisSummaryCard diagnosis={diag} />);

    expect(screen.getByText("רמת קמפיין")).toBeInTheDocument();
  });

  it("shows confidence percentage", () => {
    const diag = makeDiagnosis({ confidence: 0.72 });
    render(<DiagnosisSummaryCard diagnosis={diag} />);

    const matches = screen.getAllByText(/72%/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0]).toBeInTheDocument();
  });

  it("shows stale data warning when data is stale", () => {
    const diag = makeDiagnosis({
      dataFreshness: {
        insightsSyncedAt: null,
        structuresSyncedAt: null,
        breakdownsSyncedAt: null,
        isStale: true,
        isWarning: true,
      },
    });
    render(<DiagnosisSummaryCard diagnosis={diag} />);

    expect(screen.getByText("נתונים לא עדכניים")).toBeInTheDocument();
  });

  it("does not show stale warning when data is fresh", () => {
    const diag = makeDiagnosis({
      dataFreshness: {
        insightsSyncedAt: new Date().toISOString(),
        structuresSyncedAt: new Date().toISOString(),
        breakdownsSyncedAt: new Date().toISOString(),
        isStale: false,
        isWarning: false,
      },
    });
    render(<DiagnosisSummaryCard diagnosis={diag} />);

    expect(screen.queryByText("נתונים לא עדכניים")).not.toBeInTheDocument();
  });

  it("renders healthy root cause with correct style", () => {
    const diag = makeDiagnosis({ rootCause: "healthy" });
    render(<DiagnosisSummaryCard diagnosis={diag} />);

    expect(screen.getByText("בריא")).toBeInTheDocument();
  });

  it("renders alignment row when officialAlignment has count", () => {
    const diag = makeDiagnosis();
    render(<DiagnosisSummaryCard diagnosis={diag} />);

    const alignmentLabels = screen.getAllByText(/המלצות רשמיות נטענו/);
    expect(alignmentLabels.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── FindingsPanel ───────────────────────────────────────────────────

describe("FindingsPanel", () => {
  it("renders finding title and interpretation", () => {
    const diag = makeDiagnosis();
    render(<FindingsPanel findings={diag.findings} />);

    expect(screen.getByText("CPM עולה ב-3 ימים אחרונים")).toBeInTheDocument();
    expect(screen.getByText(/עלויות המכרז עולות/)).toBeInTheDocument();
  });

  it("shows risk level badge", () => {
    const diag = makeDiagnosis();
    render(<FindingsPanel findings={diag.findings} />);

    expect(screen.getByText("סיכון בינוני")).toBeInTheDocument();
  });

  it("shows action framing badge", () => {
    const diag = makeDiagnosis();
    render(<FindingsPanel findings={diag.findings} />);

    const badges = screen.getAllByText("השערה");
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it("shows evidence metric labels", () => {
    const diag = makeDiagnosis();
    render(<FindingsPanel findings={diag.findings} />);

    expect(screen.getByText("CPM")).toBeInTheDocument();
    expect(screen.getByText("CTR")).toBeInTheDocument();
  });

  it("shows suggested action text", () => {
    const diag = makeDiagnosis();
    render(<FindingsPanel findings={diag.findings} />);

    expect(screen.getByText(/בדקו אם הגדלת הקהל/)).toBeInTheDocument();
  });

  it("shows validation metric", () => {
    const diag = makeDiagnosis();
    render(<FindingsPanel findings={diag.findings} />);

    expect(screen.getByText(/cpm_7d_trend/)).toBeInTheDocument();
  });

  it("returns null for empty findings", () => {
    const { container } = render(<FindingsPanel findings={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders high risk badge", () => {
    const findings = [
      {
        ...makeDiagnosis().findings[0]!,
        riskLevel: "high" as const,
        confidence: 0.3,
      },
    ];
    render(<FindingsPanel findings={findings} />);

    expect(screen.getByText("סיכון גבוה")).toBeInTheDocument();
  });
});

// ─── RecommendationCards ─────────────────────────────────────────────

describe("RecommendationCards", () => {
  it("renders section title", () => {
    const diag = makeDiagnosis();
    render(
      <RecommendationCards
        findings={diag.findings}
        breakdownHypotheses={[]}
      />
    );

    expect(screen.getByText("המלצות פעולה")).toBeInTheDocument();
  });

  it("renders finding title in action card", () => {
    const diag = makeDiagnosis();
    render(
      <RecommendationCards
        findings={diag.findings}
        breakdownHypotheses={[]}
      />
    );

    expect(screen.getByText("CPM עולה ב-3 ימים אחרונים")).toBeInTheDocument();
  });

  it("renders breakdown hypothesis segment and dimension", () => {
    const diag = makeDiagnosis();
    render(
      <RecommendationCards
        findings={[]}
        breakdownHypotheses={diag.breakdownHypotheses}
      />
    );

    expect(screen.getByText("25-34")).toBeInTheDocument();
    expect(screen.getByText("גיל")).toBeInTheDocument();
  });

  it("shows breakdown hypothesis text", () => {
    const diag = makeDiagnosis();
    render(
      <RecommendationCards
        findings={[]}
        breakdownHypotheses={diag.breakdownHypotheses}
      />
    );

    expect(screen.getByText(/אפקט הקצאה שולית/)).toBeInTheDocument();
  });

  it("shows test plan for breakdown hypotheses", () => {
    const diag = makeDiagnosis();
    render(
      <RecommendationCards
        findings={[]}
        breakdownHypotheses={diag.breakdownHypotheses}
      />
    );

    expect(screen.getByText(/בדיקת A\/B/)).toBeInTheDocument();
  });

  it("returns null when no actionable content", () => {
    const findings = [
      {
        ...makeDiagnosis().findings[0]!,
        suggestedAction: "",
      },
    ];
    const { container } = render(
      <RecommendationCards findings={findings} breakdownHypotheses={[]} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows confidence percentage for action card", () => {
    const diag = makeDiagnosis();
    render(
      <RecommendationCards
        findings={diag.findings}
        breakdownHypotheses={[]}
      />
    );

    const matches = screen.getAllByText(/65%/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── WhatNotToDoPanel ────────────────────────────────────────────────

describe("WhatNotToDoPanel", () => {
  it("shows root-cause-specific warnings for creative fatigue", () => {
    const diag = makeDiagnosis({
      rootCause: "creative_fatigue",
      breakdownHypotheses: [],
    });
    render(<WhatNotToDoPanel diagnosis={diag} />);

    expect(screen.getByText("מה לא לעשות")).toBeInTheDocument();
    expect(screen.getByText(/אל תכבו מודעה עם תדירות גבוהה/)).toBeInTheDocument();
  });

  it("always shows universal warnings", () => {
    const diag = makeDiagnosis({
      rootCause: "healthy",
      breakdownHypotheses: [],
    });
    render(<WhatNotToDoPanel diagnosis={diag} />);

    expect(screen.getByText(/אל תקבלו החלטות על בסיס יום אחד/)).toBeInTheDocument();
    expect(screen.getByText(/אל תשנו יותר ממשתנה אחד/)).toBeInTheDocument();
  });

  it("shows breakdown warnings when hypotheses exist", () => {
    const diag = makeDiagnosis({ rootCause: "auction_cost_pressure" });
    render(<WhatNotToDoPanel diagnosis={diag} />);

    // Should include breakdown warning because breakdownHypotheses is non-empty
    expect(screen.getByText(/אל תבודדו סגמנט/)).toBeInTheDocument();
  });

  it("shows breakdown_effect_risk-specific warnings", () => {
    const diag = makeDiagnosis({
      rootCause: "breakdown_effect_risk",
      breakdownHypotheses: [],
    });
    render(<WhatNotToDoPanel diagnosis={diag} />);

    expect(screen.getByText(/אפקט פירוק/)).toBeInTheDocument();
    expect(screen.getByText(/יעילות שולית/)).toBeInTheDocument();
  });

  it("shows learning_instability warnings", () => {
    const diag = makeDiagnosis({
      rootCause: "learning_instability",
      breakdownHypotheses: [],
    });
    render(<WhatNotToDoPanel diagnosis={diag} />);

    expect(screen.getByText(/אל תשנו תקציב, קהל, או קריאייטיב/)).toBeInTheDocument();
  });
});

// ─── AlignmentBadge ──────────────────────────────────────────────────

describe("AlignmentBadge", () => {
  it("shows loaded recommendations count when checked", () => {
    render(
      <AlignmentBadge
        alignment={{
          checked: true,
          officialCount: 3,
          agrees: "unchecked",
          rationale: "3 סוגי המלצות",
          unavailableReason: null,
        }}
      />
    );

    expect(screen.getByText("3 המלצות רשמיות נטענו")).toBeInTheDocument();
  });

  it("shows unavailable message when API error", () => {
    render(
      <AlignmentBadge
        alignment={{
          checked: false,
          officialCount: 0,
          agrees: "unchecked",
          rationale: "",
          unavailableReason: "api_error",
        }}
      />
    );

    expect(screen.getByText("המלצות רשמיות לא זמינות")).toBeInTheDocument();
  });

  it("shows no recommendations message when count is 0", () => {
    render(
      <AlignmentBadge
        alignment={{
          checked: true,
          officialCount: 0,
          agrees: "unchecked",
          rationale: "",
          unavailableReason: "no_recommendations",
        }}
      />
    );

    expect(screen.getByText("אין המלצות רשמיות פעילות")).toBeInTheDocument();
  });

  it("shows rationale text when provided", () => {
    render(
      <AlignmentBadge
        alignment={{
          checked: true,
          officialCount: 2,
          agrees: "unchecked",
          rationale: "budget and creative optimization types",
          unavailableReason: null,
        }}
      />
    );

    expect(screen.getByText(/budget and creative/)).toBeInTheDocument();
  });

  it("returns null when alignment is undefined", () => {
    const { container } = render(<AlignmentBadge alignment={undefined} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("AlignmentMiniBadge", () => {
  it("shows unchecked mini badge", () => {
    render(
      <AlignmentMiniBadge
        alignment={{
          checked: false,
          officialCount: 0,
          agrees: "unchecked",
          rationale: "",
          unavailableReason: null,
        }}
      />
    );

    expect(screen.getByText("לא נבדק")).toBeInTheDocument();
  });

  it("shows count in mini badge", () => {
    render(
      <AlignmentMiniBadge
        alignment={{
          checked: true,
          officialCount: 5,
          agrees: "unchecked",
          rationale: "",
          unavailableReason: null,
        }}
      />
    );

    expect(screen.getByText("5 המלצות רשמיות")).toBeInTheDocument();
  });
});
