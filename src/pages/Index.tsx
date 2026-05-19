import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RefreshCw, Train, Clock3 } from "lucide-react";
import DepartureCard from "@/components/DepartureCard";
import UserMenu from "@/components/UserMenu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { SAMS_TO_GTFS } from "@/constants/stops";
import { useStations } from "@/hooks/useStations";
import { useJourneys, type Journey } from "@/hooks/useJourneys";

interface Departure {
  line: string;
  operator: string;
  lineName: string;
  departureStation: string;
  arrivalStation: string;
  departureTime: string;
  departureDate: string;
  arrivalTime: string | null;
  arrivalDate: string | null;
  scheduledArrivalTime?: string | null;
  isArrivalDelayed?: boolean;
  isArrivalEarly?: boolean;
  arrivalDelayMinutes?: number;
  isDelayed: boolean;
  delayMinutes?: number;
  __canceled?: boolean;
  __journeyKey?: string;
}

// GTFS IDs (dim_active_stations). 1587 = Malmö Triangeln, 25315 = København H.
const DEFAULT_FROM_STOP_ID = "1587";
const DEFAULT_TO_STOP_ID = "25315";

const normalizeStopParam = (raw: string | null): string | null => {
  if (!raw) return null;
  return SAMS_TO_GTFS[raw] ?? raw; // identity if already GTFS
};

const STOCKHOLM_TIME_ZONE = "Europe/Stockholm";

const stockholmDateFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: STOCKHOLM_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const stockholmTimeFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: STOCKHOLM_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const toStockholmDate = (iso: string | null | undefined) => {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso.split("T")[0] ?? "";
  return stockholmDateFormatter.format(parsed);
};

const toStockholmTime = (iso: string | null | undefined) => {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso.split("T")[1]?.slice(0, 8) ?? "";
  return stockholmTimeFormatter.format(parsed);
};

const journeyToDeparture = (j: Journey): Departure => {
  const departureIso = j.origin_scheduled ?? "";
  const scheduledArrivalIso = j.destination_scheduled;
  const actualArrivalIso = j.destination_actual ?? j.destination_scheduled;
  const delay = j.destination_delay_minutes ?? 0;
  return {
    line: j.route__name ?? "",
    operator: j.agency__operator ?? "",
    lineName: j.line_terminus ?? "",
    departureStation: j.origin_stop_name ?? "",
    arrivalStation: j.destination_stop_name ?? "",
    departureTime: toStockholmTime(departureIso),
    departureDate: toStockholmDate(departureIso),
    arrivalTime: toStockholmTime(actualArrivalIso),
    arrivalDate: toStockholmDate(actualArrivalIso),
    scheduledArrivalTime: scheduledArrivalIso ? toStockholmTime(scheduledArrivalIso) : null,
    isArrivalDelayed: delay > 0,
    isArrivalEarly: delay < 0,
    arrivalDelayMinutes: delay,
    isDelayed: delay > 0,
    delayMinutes: delay,
    __canceled: Boolean(j.canceled),
    __journeyKey: j.journey_key ?? undefined,
  };
};

const Index = () => {
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const routeFromParam = normalizeStopParam(searchParams.get("from"));
  const routeToParam = normalizeStopParam(searchParams.get("to"));
  const initialFromStopId =
    routeFromParam && routeFromParam !== routeToParam ? routeFromParam : DEFAULT_FROM_STOP_ID;
  const initialToStopId =
    routeToParam && routeToParam !== initialFromStopId ? routeToParam : DEFAULT_TO_STOP_ID;
  const [fromStopId, setFromStopId] = useState<string>(initialFromStopId);
  const [toStopId, setToStopId] = useState<string>(initialToStopId);

  const { data: stations = [] } = useStations();
  const stationOptions = useMemo(
    () =>
      stations
        .filter((s) => s.stop__id && s.station_name)
        .map((s) => ({ id: s.stop__id as string, name: s.station_name as string })),
    [stations]
  );

  const lookbackStart = useMemo(() => {
    // 60-day window — matches the YellowAlerts page and Skånetrafiken's reklamation deadline.
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 60);
    return d.toISOString().slice(0, 10);
  }, []);

  const {
    data: journeys = [],
    isLoading: loading,
    dataUpdatedAt,
    refetch,
  } = useJourneys({
    fromStopId,
    toStopId,
    sinceDate: lookbackStart,
    onlyClaimable: false,
  });

  const departures = useMemo<Departure[]>(() => journeys.map(journeyToDeparture), [journeys]);

  const fromStation = stationOptions.find((s) => s.id === fromStopId);
  const toStation = stationOptions.find((s) => s.id === toStopId);

  const handleFromChange = (value: string) => {
    setFromStopId(value);
    if (value === toStopId) {
      const fallback = stationOptions.find((s) => s.id !== value);
      if (fallback) setToStopId(fallback.id);
    }
  };

  const handleToChange = (value: string) => {
    setToStopId(value);
    if (value === fromStopId) {
      const fallback = stationOptions.find((s) => s.id !== value);
      if (fallback) setFromStopId(fallback.id);
    }
  };

  const handleReverseRoute = () => {
    setFromStopId(toStopId);
    setToStopId(fromStopId);
  };

  useEffect(() => {
    if (!profile) return;
    const hasRouteParams = Boolean(routeFromParam || routeToParam);
    if (hasRouteParams) return;
    if (profile.preferred_from_stop_id && profile.preferred_from_stop_id !== fromStopId) {
      setFromStopId(profile.preferred_from_stop_id);
    }
    if (profile.preferred_to_stop_id && profile.preferred_to_stop_id !== toStopId) {
      setToStopId(profile.preferred_to_stop_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.preferred_from_stop_id, profile?.preferred_to_stop_id, routeFromParam, routeToParam]);

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-10">
          <div className="mb-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground/80">Departures</p>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground">Claim My Train</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Recent journeys on this route. Claimable rows are highlighted.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-5">
            <div />
            <div className="flex items-center gap-2">
              <UserMenu />
              <Button
                onClick={() => void refetch()}
                disabled={loading}
                variant="default"
                size="icon"
                className="h-11 w-11 rounded-full"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          <Card className="mb-4 p-5">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Train className="h-6 w-6 text-primary" />
                <div className="flex flex-col">
                  <span className="text-sm text-muted-foreground">Route</span>
                  <span className="font-semibold text-foreground">
                    {fromStation?.name ?? "—"} to {toStation?.name ?? "—"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">From</span>
                  <Select value={fromStopId} onValueChange={handleFromChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {stationOptions.filter((s) => s.id !== toStopId).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">To</span>
                  <Select value={toStopId} onValueChange={handleToChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {stationOptions.filter((s) => s.id !== fromStopId).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button onClick={handleReverseRoute} disabled={loading} variant="outline" className="min-w-36">
                  Reverse direction
                </Button>
                <Button onClick={() => void refetch()} disabled={loading} className="min-w-32">
                  Search route
                </Button>
              </div>
            </div>
          </Card>

          <div className="mt-2 mb-4 flex justify-center">
            <Link to={`/delay-alerts?from=${encodeURIComponent(fromStopId)}&to=${encodeURIComponent(toStopId)}`} className="w-full sm:w-auto">
              <Button
                size="lg"
                className="w-full rounded-full px-8 py-6 text-base font-semibold shadow-lg shadow-primary/20 sm:w-auto"
              >
                Check Claimable Delays
              </Button>
            </Link>
          </div>

        </div>

        <div className="mb-5 text-sm text-muted-foreground">
          <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 text-foreground">
                <Clock3 className="h-4 w-4 text-primary" />
                <span className="text-base font-semibold">
                  {lastUpdated ? `Last updated ${lastUpdated.toLocaleTimeString("sv-SE")}` : "Loading…"}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">Times are shown in local Swedish time.</span>
              <span className="text-xs text-muted-foreground">
                Source: <code>public.v_passenger_journeys</code> (last 60 days).
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {loading && departures.length === 0 ? (
            <div className="text-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Loading departures...</p>
            </div>
          ) : departures.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">No journeys found on this route in the last 60 days.</p>
            </Card>
          ) : (
            departures.map((departure, index) => {
              const previousDeparture = index > 0 ? departures[index - 1] : null;
              const hasDateBoundary = !previousDeparture || previousDeparture.departureDate !== departure.departureDate;

              return (
                <div key={departure.__journeyKey ?? `${departure.line}-${departure.departureDate}-${departure.departureTime}-${index}`} className="space-y-3">
                  {hasDateBoundary && (
                    <div className="flex items-center gap-3 py-1">
                      <div className="h-px flex-1 bg-border/80" />
                      <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold uppercase tracking-wide text-foreground">
                        {departure.departureDate}
                      </span>
                      <div className="h-px flex-1 bg-border/80" />
                    </div>
                  )}
                  {departure.__canceled && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-destructive">
                      Cancelled
                    </div>
                  )}
                  <DepartureCard departure={departure} />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;
