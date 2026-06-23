/**
 * Delay → status tier. These are VISUAL buckets, NOT the binding claim rule
 * (that's `public.claim_eligibility(...)`, resolved per operator + route at filing).
 * But the threshold a journey is measured against is DISTANCE-DEPENDENT, so the buckets
 * are too: a route >= 150 km falls under EU 2021/782 (compensation from 60 min), a
 * shorter route under the Swedish regional regime (Lag 2015:953, from 20 min). Without
 * this, a 615 km SJ train would be mislabelled "Berättigad" at 25 min. We deliberately
 * show NO kr amount (no valuation yet — CLAUDE.md §9 v3), so a number would be invented.
 *
 * Note: this is operator-agnostic (distance picks the regime). Skånetrafiken voluntarily
 * pays from 20 min even on its rare >150 km routes, so the long-haul tier slightly
 * UNDER-shows for them — the safe direction (never over-promises eligibility).
 */
export type DelayStatus = "ontime" | "minor" | "near" | "eligible" | "severe";

const REGIONAL_TIERS = { near: 15, eligible: 20, severe: 40 }; // < 150 km — Lag 2015:953
const LONG_HAUL_TIERS = { near: 50, eligible: 60, severe: 120 }; // >= 150 km — EU 2021/782

/** The eligibility thresholds (minutes) for a journey's legal regime, by route distance. */
export function tiersFor(routeKm?: number | null) {
  return routeKm != null && routeKm >= 150 ? LONG_HAUL_TIERS : REGIONAL_TIERS;
}

export function statusOf(delayMin: number, routeKm?: number | null): DelayStatus {
  const t = tiersFor(routeKm);
  if (delayMin >= t.severe) return "severe";
  if (delayMin >= t.eligible) return "eligible";
  if (delayMin >= t.near) return "near"; // strax under gränsen
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
  cancelled = false,
  routeKm?: number | null
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
  const status = statusOf(minutes, routeKm);
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
