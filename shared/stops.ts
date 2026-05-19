export type Direction = "malmo-departures" | "hyllie-departures";

export const STOPS = {
  MALMO_C: {
    id: "740000003",
    name: "Malmö Centralstation",
    shortName: "Malmö C",
  },
  MALMO_TRIANGELN: {
    id: "740001554",
    name: "Malmö Triangeln station",
    shortName: "Malmö Triangeln",
  },
  MALMO_HYLLIE: {
    id: "740001586",
    name: "Malmö Hyllie station",
    shortName: "Malmö Hyllie",
  },
  COPENHAGEN_AIRPORT: {
    id: "860000284",
    name: "Københavns Lufthavn st",
    shortName: "Copenhagen Airport",
  },
  COPENHAGEN_TARNBY: {
    id: "860000322",
    name: "Tårnby st",
    shortName: "Tårnby",
  },
  COPENHAGEN_ORESTAD: {
    id: "860000501",
    name: "Ørestad st",
    shortName: "Ørestad",
  },
  COPENHAGEN_H: {
    id: "860000626",
    name: "København H",
    shortName: "København H",
  },
} as const;

export type StopKey = keyof typeof STOPS;

export const STOP_OPTIONS = [
  STOPS.MALMO_C,
  STOPS.MALMO_TRIANGELN,
  STOPS.MALMO_HYLLIE,
  STOPS.COPENHAGEN_AIRPORT,
  STOPS.COPENHAGEN_TARNBY,
  STOPS.COPENHAGEN_ORESTAD,
  STOPS.COPENHAGEN_H,
] as const;

export const STOP_SEQUENCE_IDS: string[] = STOP_OPTIONS.map((stop) => stop.id);

export const getDirectionForStops = (
  fromStopId: string,
  toStopId: string
): Direction => {
  const fromIdx = STOP_SEQUENCE_IDS.indexOf(fromStopId);
  const toIdx = STOP_SEQUENCE_IDS.indexOf(toStopId);

  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) {
    return "malmo-departures";
  }
  return fromIdx < toIdx ? "malmo-departures" : "hyllie-departures";
};

// Bidirectional map between Trafiklab sams-id (used by get-train-departures edge function
// and the legacy hardcoded dropdowns) and the GTFS IDs surfaced by dim_active_stations.
// Temporary: lives here until Index.tsx + edge function are migrated off sams-id.
export const SAMS_TO_GTFS: Record<string, string> = {
  "740000003": "3",        // Malmö C
  "740001554": "1587",     // Malmö Triangeln
  "740001586": "1586",     // Malmö Hyllie
  "860000284": "25314",    // CPH Airport
  "860000322": "23657",    // Tårnby
  "860000501": "25313",    // Ørestad
  "860000626": "25315",    // København H
};

export const GTFS_TO_SAMS: Record<string, string> = Object.fromEntries(
  Object.entries(SAMS_TO_GTFS).map(([sams, gtfs]) => [gtfs, sams])
);

export const ROUTES: Record<
  Direction,
  { origin: (typeof STOPS)[keyof typeof STOPS]; destination: (typeof STOPS)[keyof typeof STOPS] }
> = {
  "malmo-departures": {
    origin: STOPS.MALMO_C,
    destination: STOPS.COPENHAGEN_H,
  },
  "hyllie-departures": {
    origin: STOPS.COPENHAGEN_H,
    destination: STOPS.MALMO_C,
  },
} as const;

