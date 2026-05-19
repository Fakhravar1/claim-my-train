import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RefreshCw, Train } from "lucide-react";
import DepartureCard from "@/components/DepartureCard";
import UserMenu from "@/components/UserMenu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { SAMS_TO_GTFS, GTFS_TO_SAMS } from "@/constants/stops";
import { useStations } from "@/hooks/useStations";
import { useJourneys, type Journey } from "@/hooks/useJourneys";

interface Departure {
  line: string;
  operator: string;
  lineName: string;
  departureStationId?: string;
  departureStation: string;
  arrivalStation: string;
  departureTime: string;
  departureDate: string;
  scheduledTime?: string;
  arrivalTime: string | null;
  arrivalDate: string | null;
  scheduledArrivalTime?: string | null;
  isArrivalDelayed?: boolean;
  isArrivalEarly?: boolean;
  arrivalDelayMinutes?: number;
  track?: string;
  isDelayed: boolean;
  delayMinutes?: number;
  __canceled?: boolean;
  __journeyKey?: string;
}

const CLAIM_START_URL = "https://www.skanetrafiken.se/kundservice/forseningsersattning/ansokan/";
const CLAIM_AUTOFILL_TEST_MODE = import.meta.env.VITE_CLAIM_AUTOFILL_TEST_MODE === "true";
const CLAIM_AUTOFILL_PROVIDER = import.meta.env.VITE_CLAIM_AUTOFILL_PROVIDER ?? "supabase";
const CLAIM_AUTOFILL_LOCAL_URL =
  (import.meta.env.VITE_CLAIM_AUTOFILL_LOCAL_URL as string | undefined) ?? "http://127.0.0.1:8787/claim";
const CLAIM_AUTOFILL_TEST_DATE = "2026-02-14";
const CLAIM_AUTOFILL_TEST_MOBILE = "0701234567";
const CLAIM_AUTOFILL_TEST_TICKET_ID = "2Y3CE88";

// GTFS IDs (dim_active_stations). See SAMS_TO_GTFS / GTFS_TO_SAMS for the bridge to the
// Trafiklab sams-id namespace still used by Index.tsx and the get-train-departures edge function.
const DEFAULT_FROM_STOP_ID = "1587"; // Malmö Triangeln
const DEFAULT_TO_STOP_ID = "25315";  // København H

const normalizeStopParam = (raw: string | null): string | null => {
  if (!raw) return null;
  return SAMS_TO_GTFS[raw] ?? raw; // identity if already GTFS
};

const isClaimOutsideTicketValidity = (
  departureDate: string,
  isPeriodTicket?: boolean,
  ticketValidUntil?: string | null
) => {
  if (!isPeriodTicket || !ticketValidUntil) return false;
  return departureDate > ticketValidUntil.slice(0, 10);
};

const dayDifference = (fromDate: string, toDate: string) => {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
};

const formatDayShift = (diffDays: number) => {
  if (diffDays === 0) return "";
  if (diffDays === 1) return "next day";
  if (diffDays === -1) return "previous day";
  return diffDays > 0 ? `+${diffDays} days` : `${diffDays} days`;
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
    isArrivalDelayed: (j.destination_delay_minutes ?? 0) > 0,
    isArrivalEarly: (j.destination_delay_minutes ?? 0) < 0,
    arrivalDelayMinutes: j.destination_delay_minutes ?? 0,
    isDelayed: false,
    delayMinutes: 0,
    __canceled: Boolean(j.canceled),
    __journeyKey: j.journey_key ?? undefined,
  };
};

const DelayAlerts = () => {
  const [searchParams] = useSearchParams();
  const routeFromParam = normalizeStopParam(searchParams.get("from"));
  const routeToParam = normalizeStopParam(searchParams.get("to"));
  const initialFromStopId =
    routeFromParam && routeFromParam !== routeToParam ? routeFromParam : DEFAULT_FROM_STOP_ID;
  const initialToStopId =
    routeToParam && routeToParam !== initialFromStopId ? routeToParam : DEFAULT_TO_STOP_ID;
  const [fromStopId, setFromStopId] = useState<string>(initialFromStopId);
  const [toStopId, setToStopId] = useState<string>(initialToStopId);
  const [selectedAlert, setSelectedAlert] = useState<Departure | null>(null);
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [claimActionStatus, setClaimActionStatus] = useState("");
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const { data: stations = [] } = useStations();
  const stationOptions = useMemo(
    () =>
      stations
        .filter((s) => s.stop__id && s.station_name)
        .map((s) => ({ id: s.stop__id as string, name: s.station_name as string })),
    [stations]
  );

  const lookbackStart = useMemo(() => {
    // 60-day window matches Skånetrafiken's reklamation deadline.
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
    onlyClaimable: true,
  });

  const alerts = useMemo<Departure[]>(() => {
    const mapped = journeys.map(journeyToDeparture);
    const dedup = new Map<string, Departure>();
    for (const dep of mapped) {
      const key =
        dep.__journeyKey ??
        [dep.line, dep.departureDate, dep.departureTime, dep.scheduledArrivalTime ?? ""].join("|");
      if (!dedup.has(key)) dedup.set(key, dep);
    }
    return Array.from(dedup.values()).sort((a, b) => {
      const aKey = `${a.departureDate}T${a.departureTime}`;
      const bKey = `${b.departureDate}T${b.departureTime}`;
      return bKey.localeCompare(aKey);
    });
  }, [journeys]);

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

  const handleSearchRoute = () => {
    void refetch();
  };

  const openClaimFormWithFallback = async (dep: Departure) => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent("/delay-alerts")}`);
      return;
    }
    try {
      setClaimActionStatus("Trying autofill bot...");
      const requestBody = {
        departureDate: CLAIM_AUTOFILL_TEST_MODE ? CLAIM_AUTOFILL_TEST_DATE : dep.departureDate,
        departureTime: dep.departureTime,
        line: dep.line,
        lineName: dep.lineName,
        from: dep.departureStation,
        to: dep.arrivalStation,
        scheduledArrivalTime: dep.scheduledArrivalTime ?? null,
        actualArrivalTime: dep.arrivalTime ?? null,
        delayMinutes: dep.arrivalDelayMinutes ?? 0,
        mobileNumber: CLAIM_AUTOFILL_TEST_MODE ? CLAIM_AUTOFILL_TEST_MOBILE : (profile?.claim_mobile ?? null),
        ticketId: CLAIM_AUTOFILL_TEST_MODE ? CLAIM_AUTOFILL_TEST_TICKET_ID : (profile?.claim_ticket_id ?? null),
        personnummer: profile?.claim_personnummer ?? null,
        email: profile?.claim_email ?? user.email ?? null,
      };

      let result: { success?: boolean; message?: string };
      if (CLAIM_AUTOFILL_PROVIDER === "local") {
        const response = await fetch(CLAIM_AUTOFILL_LOCAL_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
        const data = (await response.json()) as { success?: boolean; message?: string };
        if (!response.ok) {
          throw new Error(data.message || `Local bot failed (${response.status})`);
        }
        result = data;
      } else {
        const { data, error } = await supabase.functions.invoke("claim-assistant", {
          body: requestBody,
        });
        if (error) throw error;
        result = (data ?? {}) as { success?: boolean; message?: string };
      }

      if (!result.success) {
        throw new Error(result.message || "autofill bot failed");
      }
      setClaimActionStatus(
        CLAIM_AUTOFILL_TEST_MODE
          ? "Autofill bot launched in test mode (14 Feb + dummy ticket/app fields)."
          : "Autofill bot launched. Continue on the opened claim page."
      );
      return;
    } catch {
      window.open(CLAIM_START_URL, "_blank", "noopener,noreferrer");
      setClaimActionStatus("Autofill unavailable. Opened manual claim page.");
    }
  };

  const promptLoginForClaim = () => {
    toast({
      title: "Sign in required",
      description: "Please sign in with Google to start a claim.",
    });
    navigate(`/login?next=${encodeURIComponent("/delay-alerts")}`);
  };

  // Back-to-departures link points at Index.tsx, which still speaks sams-id.
  const backFromSams = GTFS_TO_SAMS[fromStopId] ?? fromStopId;
  const backToSams = GTFS_TO_SAMS[toStopId] ?? toStopId;

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground/80">Saved delay history</p>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground">Claimable Delays</h1>
            <p className="mt-1 text-sm text-muted-foreground">Yellow alerts: delays from 20 to 39 minutes. Orange alerts: delays of 40 minutes or more. Cancellations always claimable.</p>
          </div>
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
                    <SelectValue placeholder="Loading stations…">
                      {fromStation?.name ?? "Loading stations…"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {stationOptions.length === 0 ? (
                      <SelectItem value="__loading__" disabled>Loading stations…</SelectItem>
                    ) : (
                      stationOptions.filter((s) => s.id !== toStopId).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">To</span>
                <Select value={toStopId} onValueChange={handleToChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Loading stations…">
                      {toStation?.name ?? "Loading stations…"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {stationOptions.length === 0 ? (
                      <SelectItem value="__loading__" disabled>Loading stations…</SelectItem>
                    ) : (
                      stationOptions.filter((s) => s.id !== fromStopId).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button onClick={handleReverseRoute} disabled={loading} variant="outline" className="min-w-36">
                Reverse direction
              </Button>
              <Button onClick={handleSearchRoute} disabled={loading} className="min-w-32">
                Search route
              </Button>
            </div>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            This page reads claimable journeys from <code>public.v_passenger_journeys</code> (60-day window).
          </div>
        </Card>

        <div className="mt-2 mb-4 flex justify-center">
          <Link to={`/?from=${encodeURIComponent(backFromSams)}&to=${encodeURIComponent(backToSams)}`} className="w-full sm:w-auto">
            <Button
              size="lg"
              className="w-full rounded-full px-8 py-6 text-base font-semibold shadow-lg shadow-primary/20 sm:w-auto"
            >
              Back to departures
            </Button>
          </Link>
        </div>

        <div className="mb-4 rounded-2xl border border-border/70 bg-card/70 p-4 text-sm text-muted-foreground">
          {lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString("sv-SE")} | Alerts: ${alerts.length}` : "Loading..."}
        </div>

        <div className="space-y-3">
          {alerts.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">{loading ? "Loading delay alerts..." : "No delay alerts in selected window."}</p>
            </Card>
          ) : (
            alerts.map((dep, idx) => {
              const prev = idx > 0 ? alerts[idx - 1] : null;
              const isNewDay = !!prev && prev.departureDate !== dep.departureDate;

              return (
                <div key={dep.__journeyKey ?? `${dep.line}-${dep.departureDate}-${dep.departureTime}-${idx}`} className="space-y-2">
                  {isNewDay && (
                    <div className="my-4 flex items-center gap-3">
                      <div className="h-px flex-1 bg-border" />
                      <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-foreground">
                        Day change: {prev?.departureDate} {"->"} {dep.departureDate}
                      </span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  {dep.__canceled && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-destructive">
                      Cancelled
                    </div>
                  )}
                  <DepartureCard departure={dep} />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!user) {
                          promptLoginForClaim();
                          return;
                        }
                        setSelectedAlert(dep);
                        setClaimActionStatus("");
                        setClaimDialogOpen(true);
                      }}
                    >
                      Start claim
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <Dialog open={claimDialogOpen} onOpenChange={setClaimDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Claim Assistant</DialogTitle>
            <DialogDescription>
              Review this delay summary, then continue to the official claim page.
            </DialogDescription>
          </DialogHeader>

          {selectedAlert && (
            <div className="space-y-4">
              {(() => {
                const claimDate = selectedAlert.departureDate || "-";
                const arrivalDate = selectedAlert.arrivalDate || selectedAlert.departureDate || "-";
                const dayShift = formatDayShift(dayDifference(claimDate, arrivalDate));
                const hasDayShift = claimDate !== arrivalDate;

                return (
                  <>
                    {hasDayShift && (
                      <Card className="border-rose-200 bg-rose-50 p-3 text-sm">
                        <p className="font-semibold text-rose-700">Day change detected</p>
                        <p className="mt-1 text-rose-700/90">
                          Claim date: {claimDate} | Arrival date: {arrivalDate} ({dayShift})
                        </p>
                      </Card>
                    )}

                    <Card className="p-3 text-sm space-y-1">
                      <p><span className="font-semibold">Line:</span> {selectedAlert.line} {selectedAlert.lineName}</p>
                      <p><span className="font-semibold">Route:</span> {selectedAlert.departureStation} {" -> "} {selectedAlert.arrivalStation}</p>
                      <p><span className="font-semibold">Claim date:</span> {claimDate}</p>
                      <p><span className="font-semibold">Arrival date:</span> {arrivalDate}{hasDayShift ? ` (${dayShift})` : ""}</p>
                      <p><span className="font-semibold">Departs:</span> {selectedAlert.departureTime}</p>
                      <p><span className="font-semibold">Scheduled arrival:</span> {selectedAlert.scheduledArrivalTime ?? "-"}</p>
                      <p><span className="font-semibold">Actual arrival:</span> {selectedAlert.arrivalTime ?? "-"}</p>
                      <p><span className="font-semibold">Delay:</span> +{selectedAlert.arrivalDelayMinutes ?? 0} min</p>
                      {selectedAlert.__canceled && (
                        <p className="font-semibold text-destructive">Trip was cancelled.</p>
                      )}
                    </Card>
                  </>
                );
              })()}

              {isClaimOutsideTicketValidity(
                selectedAlert.departureDate,
                profile?.is_period_ticket,
                profile?.ticket_valid_until
              ) && (
                <Card className="border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  Warning: this claim date is outside your saved period ticket validity
                  ({profile?.ticket_valid_until}). Update your ticket validity in settings if needed.
                </Card>
              )}

              <Button
                type="button"
                className="w-full"
                onClick={() => void openClaimFormWithFallback(selectedAlert)}
              >
                Open claim form
              </Button>
              {claimActionStatus && (
                <p className="text-xs text-muted-foreground">{claimActionStatus}</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DelayAlerts;
