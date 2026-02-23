import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RefreshCw } from "lucide-react";
import DepartureCard from "@/components/DepartureCard";
import UserMenu from "@/components/UserMenu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Direction } from "@/constants/stops";

interface Departure {
  line: string;
  operator: string;
  lineName: string;
  transportCategory?: string;
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
  __offsetMinutes?: number;
  __direction?: Direction;
}

interface YellowAlertHistoryRow {
  direction: Direction;
  line: string;
  line_name: string;
  departure_station: string;
  arrival_station: string;
  departure_datetime: string;
  scheduled_arrival_datetime: string;
  actual_arrival_datetime: string;
  arrival_delay_minutes: number;
}

const CLAIM_START_URL = "https://www.skanetrafiken.se/kundservice/forseningsersattning/ansokan/";
const CLAIM_AUTOFILL_TEST_MODE = import.meta.env.VITE_CLAIM_AUTOFILL_TEST_MODE === "true";
const CLAIM_AUTOFILL_PROVIDER = import.meta.env.VITE_CLAIM_AUTOFILL_PROVIDER ?? "supabase";
const CLAIM_AUTOFILL_LOCAL_URL =
  (import.meta.env.VITE_CLAIM_AUTOFILL_LOCAL_URL as string | undefined) ?? "http://127.0.0.1:8787/claim";
const CLAIM_AUTOFILL_TEST_DATE = "2026-02-14";
const CLAIM_AUTOFILL_TEST_MOBILE = "0701234567";
const CLAIM_AUTOFILL_TEST_TICKET_ID = "2Y3CE88";

const isClaimOutsideTicketValidity = (
  departureDate: string,
  isPeriodTicket?: boolean,
  ticketValidUntil?: string | null
) => {
  if (!isPeriodTicket || !ticketValidUntil) return false;
  return departureDate > ticketValidUntil.slice(0, 10);
};

const DelayAlerts = () => {
  const [loading, setLoading] = useState(false);
  const [directionScope, setDirectionScope] = useState<"both" | Direction>("both");
  const [alerts, setAlerts] = useState<Departure[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<Departure | null>(null);
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [claimActionStatus, setClaimActionStatus] = useState("");
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const lookbackStart = new Date(Date.now() - 30 * 24 * 60 * 60_000);
      const { data: historyRows } = await supabase
        .from("yellow_alert_history")
        .select(
          "direction,line,line_name,departure_station,arrival_station,departure_datetime,scheduled_arrival_datetime,actual_arrival_datetime,arrival_delay_minutes"
        )
        .gte("actual_arrival_datetime", lookbackStart.toISOString())
        .order("actual_arrival_datetime", { ascending: false })
        .limit(1000);

      const history = (historyRows as YellowAlertHistoryRow[] | null) ?? [];
      const dedup = new Map<string, Departure>();
      for (const dep of history
        .filter((row) => row.arrival_delay_minutes >= 20)
        .filter((row) => directionScope === "both" || row.direction === directionScope)
        .map((row) => {
          const departureDate = row.departure_datetime.split("T")[0] ?? "";
          const departureTime = row.departure_datetime.split("T")[1]?.slice(0, 8) ?? "";
          const arrivalDate = row.actual_arrival_datetime.split("T")[0] ?? "";
          const arrivalTime = row.actual_arrival_datetime.split("T")[1]?.slice(0, 8) ?? "";
          const scheduledArrivalTime = row.scheduled_arrival_datetime.split("T")[1]?.slice(0, 8) ?? "";
          return {
            line: row.line,
            operator: "",
            lineName: row.line_name,
            departureStation: row.departure_station,
            arrivalStation: row.arrival_station,
            departureTime,
            departureDate,
            scheduledTime: undefined,
            arrivalTime,
            arrivalDate,
            scheduledArrivalTime,
            isArrivalDelayed: row.arrival_delay_minutes > 0,
            isArrivalEarly: row.arrival_delay_minutes < 0,
            arrivalDelayMinutes: row.arrival_delay_minutes,
            isDelayed: false,
            delayMinutes: 0,
            __direction: row.direction,
          } as Departure;
        })) {
        const key = [
          dep.__direction ?? "",
          dep.line,
          dep.departureDate,
          dep.departureTime,
          dep.scheduledArrivalTime ?? "",
          dep.arrivalTime ?? "",
        ].join("|");
        if (!dedup.has(key)) dedup.set(key, dep);
      }

      const sorted = Array.from(dedup.values()).sort((a, b) => {
        const aKey = `${a.departureDate}T${a.departureTime}`;
        const bKey = `${b.departureDate}T${b.departureTime}`;
        return bKey.localeCompare(aKey);
      });
      setAlerts(sorted);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directionScope]);

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

  const backendLabel = useMemo(() => "Source: persistent history", []);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground/80">Saved delay history</p>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground">Claimable Delays</h1>
            <p className="mt-1 text-sm text-muted-foreground">Yellow alerts: delays from 20 to 39 minutes. Orange alerts: delays of 40 minutes or more.</p>
          </div>
          <div className="flex items-center gap-2">
            <UserMenu />
            <Button
              onClick={loadAlerts}
              disabled={loading}
              variant="default"
              size="icon"
              className="h-11 w-11 rounded-full"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <Card className="p-4 mb-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Direction:</span>
            <Button variant={directionScope === "both" ? "default" : "outline"} size="sm" onClick={() => setDirectionScope("both")}>Both</Button>
            <Button variant={directionScope === "malmo-departures" ? "default" : "outline"} size="sm" onClick={() => setDirectionScope("malmo-departures")}>From Malmö C</Button>
            <Button variant={directionScope === "hyllie-departures" ? "default" : "outline"} size="sm" onClick={() => setDirectionScope("hyllie-departures")}>From København H</Button>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            This page reads only from persisted delay history in Supabase (last 30 days). {backendLabel}
          </div>
        </Card>

        <div className="mt-2 mb-4 flex justify-center">
          <Link to="/" className="w-full sm:w-auto">
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
            alerts.map((dep, idx) => (
              <div key={`${dep.line}-${dep.departureDate}-${dep.departureTime}-${idx}`} className="space-y-2">
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
            ))
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
              <Card className="p-3 text-sm space-y-1">
                <p><span className="font-semibold">Line:</span> {selectedAlert.line} {selectedAlert.lineName}</p>
                <p><span className="font-semibold">Route:</span> {selectedAlert.departureStation} {" -> "} {selectedAlert.arrivalStation}</p>
                <p><span className="font-semibold">Date:</span> {selectedAlert.departureDate}</p>
                <p><span className="font-semibold">Departs:</span> {selectedAlert.departureTime}</p>
                <p><span className="font-semibold">Scheduled arrival:</span> {selectedAlert.scheduledArrivalTime ?? "-"}</p>
                <p><span className="font-semibold">Actual arrival:</span> {selectedAlert.arrivalTime ?? "-"}</p>
                <p><span className="font-semibold">Delay:</span> +{selectedAlert.arrivalDelayMinutes ?? 0} min</p>
              </Card>

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
