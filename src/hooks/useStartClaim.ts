import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Journey } from "@/hooks/useJourneys";

type Result = { ok: true; error?: never } | { ok: false; error: string };

function pickDelayBucket(minutes: number | null | undefined, cancelled: boolean): string {
  if (cancelled) return "120_plus";
  const m = minutes ?? 0;
  if (m < 40) return "20_39";
  if (m < 60) return "40_59";
  if (m < 120) return "60_119";
  return "120_plus";
}

/**
 * Builds the claims-table insert row for one journey — the snapshot that makes a
 * claim independent of later dbt rebuilds. Shared by the single-claim dialog and
 * the bulk digest review page so the snapshot shape can't drift between them.
 * consented_at is stamped at call time — per-filing consent (CLAUDE.md §3).
 */
export function buildClaimPayload(
  journey: Journey,
  userId: string,
  signaturePath?: string | null,
  // Snapshotted at filing time — the worker routes on THIS, not the live profile
  // (a later profile change can't re-route an already-filed claim). NULL is treated
  // as skanetrafiken (the PDF path) for backward compatibility.
  purchasingOperator?: string | null,
  // SJ's no-login web form keys on the trip's booking/ticket number — per-claim,
  // entered at filing. NULL for the Skånetrafiken PDF path.
  bookingReference?: string | null,
  // Per-claim contact (email/phone used at purchase) for SJ's form. Defaults to the
  // account email in the pop-up; NULL falls back to the profile in the worker.
  bookingEmail?: string | null
) {
  // Öresundståg is origin-routed: a non-Skåne origin is sent to its län's own form BEFORE
  // any claims row is created, so an Öresundståg claim that actually reaches in-app filing
  // is always Skåne/Köpenhamn-origin -> the Skånetrafiken PDF. Snapshot it as skanetrafiken
  // so the worker's existing handler files it correctly.
  const filingOperator = purchasingOperator === "oresundstag" ? "skanetrafiken" : purchasingOperator;

  return {
    user_id: userId,
    consented_at: new Date().toISOString(),
    signature_path: signaturePath ?? null,
    purchasing_operator: filingOperator ?? null,
    booking_reference: bookingReference?.trim() || null,
    booking_email: bookingEmail?.trim() || null,
    journey_key: journey.journey_key ?? "",
    // v_journeys has no GTFS trip__start_date; the origin's local date fills the
    // claims.trip_start_date column (part of the per-user uniqueness constraint).
    trip_start_date: journey.origin_local_date ?? "",
    origin_stop_id: journey.origin_stop_id ?? "",
    origin_stop_name: journey.origin_stop_name ?? "",
    origin_scheduled: journey.origin_scheduled ?? "",
    destination_stop_id: journey.destination_stop_id ?? "",
    destination_stop_name: journey.destination_stop_name ?? "",
    destination_scheduled: journey.destination_scheduled ?? "",
    destination_actual: journey.destination_actual ?? null,
    // Train number for operators whose form requires it (Vy's "Tågnummer"). Snapshotted
    // so the worker has it independent of any later fct_journeys rebuild.
    service_number: journey.service_number ?? null,
    destination_delay_seconds:
      journey.destination_delay_minutes != null
        ? Math.round(Number(journey.destination_delay_minutes) * 60)
        : null,
    was_cancelled: Boolean(journey.canceled),
    delay_bucket: pickDelayBucket(
      journey.destination_delay_minutes != null ? Number(journey.destination_delay_minutes) : null,
      Boolean(journey.canceled)
    ),
  };
}

/**
 * Inserts a row into public.claims. The row carries a snapshot of the journey
 * (origin/destination/scheduled times) so the claim is independent of any future
 * dbt rebuild of fct_journeys. The claim-worker (GitHub Actions, daily) picks up
 * status='pending' rows and produces the filled PDF.
 */
export function useStartClaim() {
  const [pending, setPending] = useState(false);

  async function startClaim(
    journey: Journey,
    signaturePath?: string | null,
    purchasingOperator?: string | null,
    bookingReference?: string | null,
    bookingEmail?: string | null
  ): Promise<Result> {
    setPending(true);
    try {
      const { data: userResp } = await supabase.auth.getUser();
      if (!userResp.user) return { ok: false, error: "Not signed in" };

      const payload = buildClaimPayload(
        journey,
        userResp.user.id,
        signaturePath,
        purchasingOperator,
        bookingReference,
        bookingEmail
      );

      const { error } = await supabase.from("claims").insert(payload);
      if (error) {
        // 23505 = unique violation: a claim already exists for this user+journey+date.
        if (error.code === "23505") {
          // A FAILED prior attempt must never lock the departure — e.g. the user filed an SJ
          // claim with the wrong booking/email and it came back 'error'. In that case replace
          // the old row with the new payload (fresh consent + corrected booking) and re-queue
          // it as 'pending'. Only 'error' rows are reopened; a 'pending'/'generated'/'submitted'/
          // 'sj_already_claimed'/'awaiting_*' claim is genuinely in-flight or done, so it still
          // blocks (re-filing those would double-submit). RLS scopes the lookup to own rows.
          const { data: existing } = await supabase
            .from("claims")
            .select("id,status")
            .eq("journey_key", payload.journey_key)
            .eq("trip_start_date", payload.trip_start_date)
            .maybeSingle();
          if (existing && existing.status === "error") {
            const { error: updErr } = await supabase
              .from("claims")
              .update({
                ...payload,
                status: "pending",
                error_message: null,
                provider_message: null,
                pdf_path: null,
                generated_at: null,
                submitted_at: null,
                external_reference: null,
              })
              .eq("id", existing.id);
            if (updErr) return { ok: false, error: updErr.message };
            return { ok: true };
          }
          return { ok: false, error: "You've already started a claim for this journey." };
        }
        return { ok: false, error: error.message };
      }
      return { ok: true };
    } finally {
      setPending(false);
    }
  }

  return { startClaim, pending };
}
