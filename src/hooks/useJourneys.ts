import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Journey = Tables<"v_journeys">;

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
      let query = supabase
        .from("v_journeys")
        .select("*")
        .eq("origin_stop_id", fromStopId!)
        .eq("destination_stop_id", toStopId!)
        .eq("origin_local_date", date)
        .order("origin_scheduled", { ascending: false })
        .limit(500);
      if (onlyClaimable) query = query.eq("is_claimable", true);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}
