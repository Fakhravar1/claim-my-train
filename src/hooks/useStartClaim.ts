import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Journey } from "@/hooks/useJourneys";

type Result = { ok: true } | { ok: false; error: string };

function pickDelayBucket(minutes: number | null | undefined, cancelled: boolean): string {
  if (cancelled) return "120_plus";
  const m = minutes ?? 0;
  if (m < 40) return "20_39";
  if (m < 60) return "40_59";
  if (m < 120) return "60_119";
  return "120_plus";
}

/**
 * Inserts a row into public.claims. The row carries a snapshot of the journey
 * (origin/destination/scheduled times) so the claim is independent of any future
 * dbt rebuild of fct_passenger_journeys. The Render cron picks up status='pending'
 * rows once daily and produces the filled PDF.
 */
export function useStartClaim() {
  const [pending, setPending] = useState(false);

  async function startClaim(
    journey: Journey,
    signaturePath?: string | null
  ): Promise<Result> {
    setPending(true);
    try {
      const { data: userResp } = await supabase.auth.getUser();
      if (!userResp.user) return { ok: false, error: "Not signed in" };

      const payload = {
        user_id: userResp.user.id,
        // Per-filing consent audit: clicking confirm authorised this specific
        // form, signed with the signature on file at this moment.
        consented_at: new Date().toISOString(),
        signature_path: signaturePath ?? null,
        journey_key: journey.journey_key ?? "",
        trip_start_date: journey.trip__start_date ?? "",
        origin_stop_id: journey.origin_stop_id ?? "",
        origin_stop_name: journey.origin_stop_name ?? "",
        origin_scheduled: journey.origin_scheduled ?? "",
        destination_stop_id: journey.destination_stop_id ?? "",
        destination_stop_name: journey.destination_stop_name ?? "",
        destination_scheduled: journey.destination_scheduled ?? "",
        destination_actual: journey.destination_actual ?? null,
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

      const { error } = await supabase.from("claims").insert(payload);
      if (error) {
        // 23505 = unique violation: claim already exists for this user+journey+date
        if (error.code === "23505") return { ok: false, error: "You've already started a claim for this journey." };
        return { ok: false, error: error.message };
      }
      return { ok: true };
    } finally {
      setPending(false);
    }
  }

  return { startClaim, pending };
}
