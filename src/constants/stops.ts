// Less ambiguous "direction" naming for UI/state:
// - malmo-departures: departures from Malmö C toward Copenhagen corridor
// - hyllie-departures: departures from Copenhagen corridor toward Malmö C
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

export const ROUTES: Record<
  Direction,
  { origin: typeof STOPS[keyof typeof STOPS]; destination: typeof STOPS[keyof typeof STOPS] }
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

  // Default to Malmö->Copenhagen direction if unknown or same stop.
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) {
    return "malmo-departures";
  }

  return fromIdx < toIdx ? "malmo-departures" : "hyllie-departures";
};


