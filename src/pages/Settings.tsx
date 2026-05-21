import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import UserMenu from "@/components/UserMenu";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useStations } from "@/hooks/useStations";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const toIsoDate = (value: string | null | undefined) => {
  if (!value) return "";
  return value.slice(0, 10);
};

const Settings = () => {
  const { user, profile, loading } = useAuth();
  const { toast } = useToast();
  const { data: stations = [] } = useStations();
  const stopOptions = useMemo(
    () =>
      stations
        .filter((s) => s.stop__id && s.station_name)
        .map((s) => ({ id: s.stop__id as string, name: s.station_name as string })),
    [stations]
  );
  const CLAIM_VALUE_SEK = 100;

  const [claimEmail, setClaimEmail] = useState("");
  const [claimMobile, setClaimMobile] = useState("");
  const [claimTicketId, setClaimTicketId] = useState("");
  const [claimPersonnummer, setClaimPersonnummer] = useState("");
  const [claimsDoneCount, setClaimsDoneCount] = useState(0);
  const [isPeriodTicket, setIsPeriodTicket] = useState(false);
  const [ticketValidUntil, setTicketValidUntil] = useState("");
  // GTFS IDs (see dim_active_stations). 3 = Malmö Centralstation, 25315 = København H.
  const [preferredFromStopId, setPreferredFromStopId] = useState("3");
  const [preferredToStopId, setPreferredToStopId] = useState("25315");
  const [commuterFromStopId, setCommuterFromStopId] = useState("");
  const [commuterToStopId, setCommuterToStopId] = useState("");
  const [commuterOutboundStartTime, setCommuterOutboundStartTime] = useState("");
  const [commuterOutboundEndTime, setCommuterOutboundEndTime] = useState("");
  const [commuterReturnStartTime, setCommuterReturnStartTime] = useState("");
  const [commuterReturnEndTime, setCommuterReturnEndTime] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setClaimEmail(profile?.claim_email ?? profile?.email ?? "");
    setClaimMobile(profile?.claim_mobile ?? "");
    setClaimTicketId(profile?.claim_ticket_id ?? "");
    setClaimPersonnummer(profile?.claim_personnummer ?? "");
    setClaimsDoneCount(profile?.claims_done_count ?? 0);
    setIsPeriodTicket(profile?.is_period_ticket ?? false);
    setTicketValidUntil(toIsoDate(profile?.ticket_valid_until));
    setPreferredFromStopId(profile?.preferred_from_stop_id ?? "3");
    setPreferredToStopId(profile?.preferred_to_stop_id ?? "25315");
    setCommuterFromStopId(profile?.commuter_from_stop_id ?? "");
    setCommuterToStopId(profile?.commuter_to_stop_id ?? "");
    setCommuterOutboundStartTime(profile?.commuter_outbound_start_time ?? "");
    setCommuterOutboundEndTime(profile?.commuter_outbound_end_time ?? "");
    setCommuterReturnStartTime(profile?.commuter_return_start_time ?? "");
    setCommuterReturnEndTime(profile?.commuter_return_end_time ?? "");
  }, [profile]);

  const validityStatus = useMemo(() => {
    if (!isPeriodTicket) return null;
    if (!ticketValidUntil) {
      return {
        tone: "warning",
        text: "Period ticket is enabled, but no validity end date is set.",
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const validUntilDate = new Date(`${ticketValidUntil}T00:00:00`);
    const diffMs = validUntilDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffMs / 86_400_000);

    if (diffDays < 0) {
      return {
        tone: "expired",
        text: "Your period ticket appears expired. Claims outside validity will show a warning.",
      };
    }
    if (diffDays <= 7) {
      return {
        tone: "warning",
        text: `Your period ticket expires in ${diffDays} day(s). Remember to update it soon.`,
      };
    }
    return {
      tone: "ok",
      text: `Your period ticket is valid for ${diffDays} more day(s).`,
    };
  }, [isPeriodTicket, ticketValidUntil]);

  if (loading) return null;
  if (!user) {
    return <Navigate to="/login?next=%2Fsettings" replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          claim_email: claimEmail || null,
          claim_mobile: claimMobile || null,
          claim_ticket_id: claimTicketId || null,
          claim_personnummer: claimPersonnummer || null,
          claims_done_count: Math.max(0, claimsDoneCount),
          is_period_ticket: isPeriodTicket,
          ticket_valid_until: isPeriodTicket ? ticketValidUntil || null : null,
          preferred_from_stop_id: preferredFromStopId || null,
          preferred_to_stop_id: preferredToStopId || null,
          commuter_from_stop_id: commuterFromStopId || null,
          commuter_to_stop_id: commuterToStopId || null,
          commuter_outbound_start_time: commuterOutboundStartTime || null,
          commuter_outbound_end_time: commuterOutboundEndTime || null,
          commuter_return_start_time: commuterReturnStartTime || null,
          commuter_return_end_time: commuterReturnEndTime || null,
        },
        { onConflict: "id" }
      );
      if (error) throw error;
      toast({
        title: "Settings saved",
        description: "Your claim profile is updated.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save settings";
      toast({
        title: "Save failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground/80">Account</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Account settings</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Save your default claim details to prefill the claim flow faster.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/">
              <Button type="button" variant="outline">Back to main page</Button>
            </Link>
            <UserMenu />
          </div>
        </div>

        <Card className="p-5">
          <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
            <Tabs defaultValue="personal" className="space-y-4">
              <TabsList className="!grid h-auto w-full !grid-cols-3 gap-1 p-1">
                <TabsTrigger value="personal" className="w-full">Personal info</TabsTrigger>
                <TabsTrigger value="ticket" className="w-full">Ticket</TabsTrigger>
                <TabsTrigger value="commuter" className="w-full">Commuter habits</TabsTrigger>
              </TabsList>

              <TabsContent value="personal" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="claim-email">Claim email</Label>
                  <Input
                    id="claim-email"
                    type="email"
                    value={claimEmail}
                    onChange={(event) => setClaimEmail(event.target.value)}
                    placeholder="name@example.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="claim-mobile">Mobile number</Label>
                  <Input
                    id="claim-mobile"
                    type="tel"
                    value={claimMobile}
                    onChange={(event) => setClaimMobile(event.target.value)}
                    placeholder="0701234567"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="claim-personnummer">Personnummer</Label>
                  <Input
                    id="claim-personnummer"
                    value={claimPersonnummer}
                    onChange={(event) => setClaimPersonnummer(event.target.value)}
                    placeholder="19700901-3975"
                  />
                </div>
              </TabsContent>

              <TabsContent value="ticket" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="claim-ticket-id">Ticket ID</Label>
                  <Input
                    id="claim-ticket-id"
                    value={claimTicketId}
                    onChange={(event) => setClaimTicketId(event.target.value)}
                    placeholder="2Y3CE88"
                  />
                </div>

                <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card/70 p-3">
                  <div>
                    <p className="text-sm font-medium">Period ticket</p>
                    <p className="text-xs text-muted-foreground">
                      Enable if your claim uses a ticket with date validity.
                    </p>
                  </div>
                  <Switch checked={isPeriodTicket} onCheckedChange={setIsPeriodTicket} />
                </div>

                {isPeriodTicket && (
                  <div className="space-y-2">
                    <Label htmlFor="ticket-valid-until">Ticket valid until</Label>
                    <Input
                      id="ticket-valid-until"
                      type="date"
                      value={ticketValidUntil}
                      onChange={(event) => setTicketValidUntil(event.target.value)}
                    />
                  </div>
                )}

                {validityStatus && (
                  <div
                    className={`rounded-xl border px-3 py-2 text-sm ${
                      validityStatus.tone === "expired"
                        ? "border-destructive/40 bg-destructive/10 text-destructive"
                        : validityStatus.tone === "warning"
                          ? "border-amber-300 bg-amber-50 text-amber-900"
                          : "border-emerald-300 bg-emerald-50 text-emerald-900"
                    }`}
                  >
                    {validityStatus.text}
                  </div>
                )}

                <div className="space-y-3 rounded-xl border border-border/70 bg-card/70 p-4">
                  <div>
                    <p className="text-sm font-semibold">Claims tracker</p>
                    <p className="text-xs text-muted-foreground">
                      Track total submitted claims and estimated payout at {CLAIM_VALUE_SEK} KR per claim.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="claims-done-count">Claims done</Label>
                    <Input
                      id="claims-done-count"
                      type="number"
                      min={0}
                      value={claimsDoneCount}
                      onChange={(event) =>
                        setClaimsDoneCount(Math.max(0, Number.parseInt(event.target.value || "0", 10) || 0))
                      }
                    />
                  </div>
                  <div className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-foreground">
                    Amount received: <span className="font-semibold">{claimsDoneCount * CLAIM_VALUE_SEK} KR</span>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="commuter" className="space-y-4">
                <div className="space-y-3 rounded-xl border border-border/70 bg-card/70 p-4">
                  <div>
                    <p className="text-sm font-semibold">Usual travel route</p>
                    <p className="text-xs text-muted-foreground">
                      Set the stations you usually travel between so potential claims can be monitored for your route.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="preferred-from">From</Label>
                      <Select value={preferredFromStopId} onValueChange={setPreferredFromStopId}>
                        <SelectTrigger id="preferred-from">
                          <SelectValue placeholder="Loading stations…">
                            {stopOptions.find((s) => s.id === preferredFromStopId)?.name ?? "Loading stations…"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {stopOptions.length === 0 ? (
                            <SelectItem value="__loading__" disabled>Loading stations…</SelectItem>
                          ) : (
                            stopOptions.map((stop) => (
                              <SelectItem key={stop.id} value={stop.id}>
                                {stop.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="preferred-to">To</Label>
                      <Select value={preferredToStopId} onValueChange={setPreferredToStopId}>
                        <SelectTrigger id="preferred-to">
                          <SelectValue placeholder="Loading stations…">
                            {stopOptions.find((s) => s.id === preferredToStopId)?.name ?? "Loading stations…"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {stopOptions.length === 0 ? (
                            <SelectItem value="__loading__" disabled>Loading stations…</SelectItem>
                          ) : (
                            stopOptions.map((stop) => (
                              <SelectItem key={stop.id} value={stop.id}>
                                {stop.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-border/70 bg-card/70 p-4">
                  <div>
                    <p className="text-sm font-semibold">Commuter habits (optional)</p>
                    <p className="text-xs text-muted-foreground">
                      Save your usual commute stops and time windows for going out and coming back.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="commuter-from">From</Label>
                      <Select value={commuterFromStopId || "none"} onValueChange={(value) => setCommuterFromStopId(value === "none" ? "" : value)}>
                        <SelectTrigger id="commuter-from">
                          <SelectValue placeholder="Loading stations…">
                            {commuterFromStopId
                              ? stopOptions.find((s) => s.id === commuterFromStopId)?.name ?? "Loading stations…"
                              : "Not set"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not set</SelectItem>
                          {stopOptions.length === 0 ? (
                            <SelectItem value="__loading__" disabled>Loading stations…</SelectItem>
                          ) : (
                            stopOptions.map((stop) => (
                              <SelectItem key={stop.id} value={stop.id}>
                                {stop.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="commuter-to">To</Label>
                      <Select value={commuterToStopId || "none"} onValueChange={(value) => setCommuterToStopId(value === "none" ? "" : value)}>
                        <SelectTrigger id="commuter-to">
                          <SelectValue placeholder="Loading stations…">
                            {commuterToStopId
                              ? stopOptions.find((s) => s.id === commuterToStopId)?.name ?? "Loading stations…"
                              : "Not set"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not set</SelectItem>
                          {stopOptions.length === 0 ? (
                            <SelectItem value="__loading__" disabled>Loading stations…</SelectItem>
                          ) : (
                            stopOptions.map((stop) => (
                              <SelectItem key={stop.id} value={stop.id}>
                                {stop.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="commuter-outbound-start">Outbound start</Label>
                      <Input
                        id="commuter-outbound-start"
                        type="time"
                        value={commuterOutboundStartTime}
                        onChange={(event) => setCommuterOutboundStartTime(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="commuter-outbound-end">Outbound end</Label>
                      <Input
                        id="commuter-outbound-end"
                        type="time"
                        value={commuterOutboundEndTime}
                        onChange={(event) => setCommuterOutboundEndTime(event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="commuter-return-start">Return start</Label>
                      <Input
                        id="commuter-return-start"
                        type="time"
                        value={commuterReturnStartTime}
                        onChange={(event) => setCommuterReturnStartTime(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="commuter-return-end">Return end</Label>
                      <Input
                        id="commuter-return-end"
                        type="time"
                        value={commuterReturnEndTime}
                        onChange={(event) => setCommuterReturnEndTime(event.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save settings"}
              </Button>
              <Link to="/">
                <Button type="button" variant="outline">Back to main page</Button>
              </Link>
              <Link to="/regions/skanetrafiken/delay-alerts">
                <Button type="button" variant="outline">Back to claimable delays</Button>
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default Settings;
