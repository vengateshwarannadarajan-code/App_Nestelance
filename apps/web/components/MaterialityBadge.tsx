"use client";

export type MaterialityLevel = "Critical" | "Material" | "Relevant" | "NotRelevant";

interface MaterialityBadgeProps {
  level: MaterialityLevel;
  size?: "sm" | "md";
}

const CONFIG: Record<MaterialityLevel, { color: string; bg: string; dot: string; label: string; weight: string }> = {
  Critical:      { color: "#B71C1C", bg: "#FFF5F5", dot: "#B71C1C", label: "Critique",        weight: "1.0" },
  Material:      { color: "#E65100", bg: "#FFF8F3", dot: "#E65100", label: "Matériel",         weight: "0.75" },
  Relevant:      { color: "#1565C0", bg: "#F0F5FF", dot: "#1565C0", label: "Pertinent",        weight: "0.25" },
  NotRelevant:   { color: "#757575", bg: "#F5F5F5", dot: "#757575", label: "Non pertinent",    weight: "0.0" },
};

export function MaterialityBadge({ level, size = "md" }: MaterialityBadgeProps) {
  const cfg = CONFIG[level];
  const isSmall = size === "sm";

  return (
    <span
      title={`Matérialité : ${cfg.label} (poids ${cfg.weight})`}
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
      className={`inline-flex items-center gap-1 rounded-full font-medium cursor-default
        ${isSmall ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"}`}
    >
      <span
        style={{ backgroundColor: cfg.dot }}
        className={`rounded-full shrink-0 ${isSmall ? "w-1.5 h-1.5" : "w-2 h-2"}`}
      />
      {cfg.label}
    </span>
  );
}
