/**
 * Delay → status tier, ported from the design prototype's data.js `statusOf`
 * (the thresholds are the design's visual buckets, NOT the claim rule — the
 * authoritative eligibility flag is `is_claimable`, computed in fct_journeys
 * from the claim_authorities seed). We deliberately show NO kr amount: the
 * backend has no compensation valuation yet (deferred to dim_compensation_rules,
 * CLAUDE.md §9 v3), so a number here would be invented.
 */
export type DelayStatus = "ontime" | "minor" | "near" | "eligible" | "severe";

export function statusOf(delayMin: number): DelayStatus {
  if (delayMin >= 40) return "severe";
  if (delayMin >= 20) return "eligible";
  if (delayMin >= 15) return "near"; // strax under gränsen
  if (delayMin >= 4) return "minor";
  return "ontime";
}

export type StatusMeta = {
  status: DelayStatus;
  /** short label: "I tid" / "+24 min" / "Inställt" */
  label: string;
  /** worded, status-aware chip text, e.g. "Berättigad · +24 min" */
  chipLabel: string;
  /** one-word status, e.g. "I tid", "Försenad", "Inställt" */
  word: string;
  /** CSS modifier suffix for the chip (status, or "cancelled") */
  tone: DelayStatus | "cancelled";
  /** delay in whole minutes, clamped to >= 0 */
  minutes: number;
  eligible: boolean;
  near: boolean;
  cancelled: boolean;
};

const WORDS: Record<DelayStatus, string> = {
  ontime: "I tid",
  minor: "Något sen",
  near: "Nära gränsen",
  eligible: "Försenad",
  severe: "Kraftigt sen",
};

/**
 * Resolve a journey row's display status from its destination delay (minutes,
 * may be null/negative) and cancellation flag. A cancelled service is always
 * claimable, so it maps to the most severe visual tier.
 */
export function statusMeta(
  delayMinutes: number | null | undefined,
  cancelled = false
): StatusMeta {
  if (cancelled) {
    return {
      status: "severe",
      label: "Inställt",
      chipLabel: "Inställt",
      word: "Inställt",
      tone: "cancelled",
      minutes: 0,
      eligible: true,
      near: false,
      cancelled: true,
    };
  }
  const minutes = Math.max(0, Math.round(delayMinutes ?? 0));
  const status = statusOf(minutes);
  const label = minutes === 0 ? "I tid" : "+" + minutes + " min";
  const eligible = status === "eligible" || status === "severe";
  // The chip leads with the eligibility word only where it's actionable.
  const chipLabel = eligible ? "Berättigad · " + label : label;
  return {
    status,
    label,
    chipLabel,
    word: WORDS[status],
    tone: status,
    minutes,
    eligible,
    near: status === "near",
    cancelled: false,
  };
}
