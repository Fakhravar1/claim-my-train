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
  MALMO_HYLLIE: {
    id: "740001586",
    name: "Malmö Hyllie station",
    shortName: "Malmö Hyllie",
  },
  COPENHAGEN_H: {
    id: "860000626",
    name: "København H",
    shortName: "København H",
  },
} as const;

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
  STOPS.COPENHAGEN_H,
] as const;


