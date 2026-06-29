import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

// v_journeys is column-compatible with v_claimable_journeys but isn't in the
// generated Supabase types (the wrapper view exists in `public` but the type
// regeneration hasn't picked it up). Reuse the claimable type for the shape.
export type Journey = Tables<"v_claimable_journeys">;

type Params = {
  fromStopId: string | null;
  toStopId: string | null;
  date: string; // ISO date, e.g. "2026-03-19"
  onlyClaimable?: boolean;
};

export function useJourneys({ fromStopId, toStopId, date, onlyClaimable = false }: Params) {
  return useQuery<Journey[]>({
    queryKey: ["journeys", fromStopId, toStopId, date, onlyClaimable],
    enabled: Boolean(fromStopId && toStopId),
    queryFn: async () => {
      // Claimables come from the durable 90-day retention layer
      // (v_claimable_journeys, column-compatible with v_journeys) — fct_journeys
      // only reaches back as far as raw retention (~10 d), but a claim stays
      // filable for 60–90 days. Live departures read v_journeys.
      const table = onlyClaimable ? "v_claimable_journeys" : "v_journeys";
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("origin_stop_id", fromStopId!)
        .eq("destination_stop_id", toStopId!)
        .eq("origin_local_date", date)
        .order("origin_scheduled", { ascending: true }) // earliest first — matches the operators' own boards
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Journey[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
