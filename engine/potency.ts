import { ProductMetadata, GenerationSettings } from "../types.js";
import { getBadgeContent } from "../prompts.js";

// The badge may not overstate the box beyond the legal tolerance. These run before
// any image is generated, so a wrong badge costs nothing instead of a round of renders.

// Potency claims carry a 10% tolerance on the tested value (Malcolm, Sep 29 2026), so
// resin's standing "80%+ TAC" badge is legal on a 78% box. Resin is ALWAYS 80%+.
export const POTENCY_TOLERANCE = 0.1;

const CANNABINOIDS = ["THC", "THCA", "THCV", "CBD", "CBG", "CBN", "CBC"];

// Total active cannabinoids as the box states it: a printed TAC wins; otherwise the
// sum of the cannabinoids listed (terpenes excluded); otherwise the first percentage.
export function boxPercent(boxPotency?: string): number | null {
  const text = boxPotency || "";
  const tac = text.match(/(\d+(?:\.\d+)?)\s*%\s*TAC|TAC\s*:?\s*(\d+(?:\.\d+)?)\s*%/i);
  if (tac) return Number(tac[1] ?? tac[2]);
  // Labels sit before ("THC 75%") or after ("78% THC") the number. Prefer a
  // cannabinoid word on either side, so "78% THC 3% CBG" reads as 78 + 3.
  const pairs = [...text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map(m => {
    const before = text.slice(0, m.index).match(/([A-Za-z]+)\W*$/)?.[1]?.toUpperCase() ?? "";
    const after = text.slice(m.index! + m[0].length).match(/^\W*([A-Za-z]+)/)?.[1]?.toUpperCase() ?? "";
    const label = CANNABINOIDS.includes(after) && !CANNABINOIDS.includes(before) ? after : before;
    return { label, value: Number(m[1]) };
  });
  if (pairs.length === 0) return null;
  const listed = pairs.filter(p => CANNABINOIDS.includes(p.label));
  if (listed.length) return Math.round(listed.reduce((sum, p) => sum + p.value, 0) * 10) / 10;
  return pairs[0].value;
}

export function boxRatio(boxPotency?: string): string | null {
  const m = (boxPotency || "").match(/\b(\d+)\s*:\s*(\d+)\b/);
  return m ? `${m[1]}:${m[2]}` : null;
}

// Fills what the box settles (the CBD ratio) and reports what it contradicts.
// Returns the adjusted settings and a problem string, or null when the badge is honest.
export function preflight(
  meta: ProductMetadata,
  settings: GenerationSettings
): { settings: GenerationSettings; problem: string | null } {
  const next = { ...settings };
  if (next.batteryMode) return { settings: next, problem: null };

  if (next.cbdMode) {
    const ratio = boxRatio(meta.boxPotency);
    if (ratio) next.cbdRatio = ratio;
    return { settings: next, problem: null };
  }

  const claimed = Number(getBadgeContent(next).percent.replace(/[^\d.]/g, ""));
  const printed = boxPercent(meta.boxPotency);
  if (printed !== null && claimed > printed * (1 + POTENCY_TOLERANCE)) {
    return {
      settings: next,
      problem: `badge would read "${getBadgeContent(next).percent} TAC" but the box prints "${meta.boxPotency}"`,
    };
  }
  return { settings: next, problem: null };
}
