import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RegionAuthorityKey } from "@/lib/claimProfileValidation";

/**
 * Loads public.v_station_claim_authority into a Map<origin_stop_id, RegionAuthorityKey>.
 * Used to route an Öresundståg claim to the länstrafikbolag of the ORIGIN county
 * (Skåne/Köpenhamn -> skanetrafiken in-app; other counties -> external form). Only
 * consulted for Öresundståg-attested users; long-distance (SJ) routing is separate.
 */
export type StationAuthorityMap = Map<string, RegionAuthorityKey>;

export function useStationAuthorities() {
  return useQuery<StationAuthorityMap>({
    queryKey: ["station-authorities"],
    queryFn: async () => {
      interface Row { stop_id: string; region_authority_key: string }
      const { data, error } = await (supabase as any)
        .from("v_station_claim_authority")
        .select("stop_id, region_authority_key");
      if (error) throw error;
      const map: StationAuthorityMap = new Map();
      for (const row of (data ?? []) as Row[]) {
        if (row.stop_id && row.region_authority_key) {
          map.set(row.stop_id, row.region_authority_key as RegionAuthorityKey);
        }
      }
      return map;
    },
    staleTime: 60 * 60 * 1000,
  });
}
