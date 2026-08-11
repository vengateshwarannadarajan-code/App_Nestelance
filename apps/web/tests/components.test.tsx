/**
 * T-TEST-005: Frontend component tests
 * Vitest + React Testing Library
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

// ── 1. ScoreRing — correct colour per band ────────────────────
describe("ScoreRing", () => {
  it("renders correct colour for score 2 (orange band)", () => {
    const { ScoreRing } = await import("@/components/ScoreRing");
    const { container } = render(<ScoreRing score={2} animated={false} size="medium" />);
    const arc = container.querySelector("circle:last-of-type");
    // Band 2 = #FB8C00
    expect(arc?.getAttribute("stroke")).toBe("#FB8C00");
  });

  it("renders correct colour for score 5 (green leader band)", async () => {
    const { ScoreRing } = await import("@/components/ScoreRing");
    const { container } = render(<ScoreRing score={5} animated={false} size="medium" />);
    const arc = container.querySelector("circle:last-of-type");
    expect(arc?.getAttribute("stroke")).toBe("#2E7D32");
  });

  it("renders correct colour for score 0 (critical band)", async () => {
    const { ScoreRing } = await import("@/components/ScoreRing");
    const { container } = render(<ScoreRing score={0} animated={false} size="medium" />);
    const arc = container.querySelector("circle:last-of-type");
    expect(arc?.getAttribute("stroke")).toBe("#B71C1C");
  });

  it("has aria-label with score and band label", async () => {
    const { ScoreRing } = await import("@/components/ScoreRing");
    const { container } = render(<ScoreRing score={3.2} animated={false} size="medium" locale="fr" />);
    const svg = container.querySelector("[role='img']");
    expect(svg?.getAttribute("aria-label")).toContain("3.2");
    expect(svg?.getAttribute("aria-label")).toContain("Progressant");
  });
});

// ── 2. FeatureGateOverlay ─────────────────────────────────────
vi.mock("@/lib/useFeatureGate", () => ({
  useFeatureGate: vi.fn(),
}));

describe("FeatureGateOverlay", () => {
  it("renders children when plan is sufficient", async () => {
    const { useFeatureGate } = await import("@/lib/useFeatureGate");
    (useFeatureGate as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const { FeatureGateOverlay } = await import("@/components/FeatureGateOverlay");

    render(
      <FeatureGateOverlay featureName="Test Feature" requiredPlan="growth">
        <div data-testid="child">Content</div>
      </FeatureGateOverlay>
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.queryByText("Passer au plan")).not.toBeInTheDocument();
  });

  it("renders blurred overlay when plan is insufficient", async () => {
    const { useFeatureGate } = await import("@/lib/useFeatureGate");
    (useFeatureGate as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const { FeatureGateOverlay } = await import("@/components/FeatureGateOverlay");

    render(
      <FeatureGateOverlay featureName="Test Feature" requiredPlan="growth">
        <div>Content</div>
      </FeatureGateOverlay>
    );
    expect(screen.getByText("Test Feature")).toBeInTheDocument();
    expect(screen.getByText(/Passer au plan/i)).toBeInTheDocument();
  });
});

// ── 3. QuestionCard — capping key icon ───────────────────────
describe("QuestionCard", () => {
  it("shows purple key icon when isCapping=true", async () => {
    const { QuestionCard } = await import("@/components/QuestionCard");
    render(
      <QuestionCard
        questionId="test_q1"
        theme="Transition climatique"
        pillar="E"
        text="Test question?"
        inputType="boolean"
        questionType="aspirational"
        isCapping={true}
        currentAnswer={null}
        onAnswerChange={() => {}}
      />
    );
    expect(screen.getByText("Question clé")).toBeInTheDocument();
  });

  it("does NOT show key icon when isCapping=false", async () => {
    const { QuestionCard } = await import("@/components/QuestionCard");
    render(
      <QuestionCard
        questionId="test_q2"
        theme="Transition climatique"
        pillar="E"
        text="Regular question?"
        inputType="boolean"
        questionType="performance"
        isCapping={false}
        currentAnswer={null}
        onAnswerChange={() => {}}
      />
    );
    expect(screen.queryByText("Question clé")).not.toBeInTheDocument();
  });

  it("shows capping warning when isCapping=true and answer is false", async () => {
    const { QuestionCard } = await import("@/components/QuestionCard");
    render(
      <QuestionCard
        questionId="test_q1"
        theme="Transition climatique"
        pillar="E"
        text="Test question?"
        inputType="boolean"
        questionType="aspirational"
        isCapping={true}
        currentAnswer={false}
        onAnswerChange={() => {}}
      />
    );
    expect(screen.getByText(/plafonné à 3\/5/i)).toBeInTheDocument();
  });
});

// ── 4. ThemeScoreCard — capping lock icon ────────────────────
describe("ThemeScoreCard", () => {
  it("shows capping lock when cappingMet=false", async () => {
    const { ThemeScoreCard } = await import("@/components/ThemeScoreCard");
    render(
      <ThemeScoreCard
        themeId="climate_transition"
        themeName="Transition climatique"
        pillar="E"
        score={2.5}
        cappingMet={false}
        aspirationalPct={55}
        performancePct={45}
        materialityWeight={1.0}
      />
    );
    expect(screen.getByText("Plafonné à 3")).toBeInTheDocument();
  });

  it("does NOT show lock when cappingMet=true", async () => {
    const { ThemeScoreCard } = await import("@/components/ThemeScoreCard");
    render(
      <ThemeScoreCard
        themeId="climate_transition"
        themeName="Transition climatique"
        pillar="E"
        score={4.2}
        cappingMet={true}
        aspirationalPct={55}
        performancePct={45}
        materialityWeight={1.0}
      />
    );
    expect(screen.queryByText("Plafonné à 3")).not.toBeInTheDocument();
  });
});

// ── 5. MaterialityBadge — correct colour per level ────────────
describe("MaterialityBadge", () => {
  it("renders Critical badge with correct label", async () => {
    const { MaterialityBadge } = await import("@/components/MaterialityBadge");
    const { container } = render(<MaterialityBadge level="Critical" />);
    expect(screen.getByText("Critique")).toBeInTheDocument();
  });

  it("renders Material badge", async () => {
    const { MaterialityBadge } = await import("@/components/MaterialityBadge");
    render(<MaterialityBadge level="Material" />);
    expect(screen.getByText("Matériel")).toBeInTheDocument();
  });

  it("renders Relevant badge", async () => {
    const { MaterialityBadge } = await import("@/components/MaterialityBadge");
    render(<MaterialityBadge level="Relevant" />);
    expect(screen.getByText("Pertinent")).toBeInTheDocument();
  });

  it("renders NotRelevant badge", async () => {
    const { MaterialityBadge } = await import("@/components/MaterialityBadge");
    render(<MaterialityBadge level="NotRelevant" />);
    expect(screen.getByText("Non pertinent")).toBeInTheDocument();
  });
});
