import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type ActiveStation = Tables<"v_active_stations">;

export function useStations() {
  return useQuery<ActiveStation[]>({
    queryKey: ["active-stations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_active_stations")
        .select("*")
        .order("station_name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60 * 60 * 1000,
  });
}
