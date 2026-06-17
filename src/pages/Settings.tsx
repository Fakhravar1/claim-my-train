import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useDaylightStyles } from "@/hooks/useDaylightStyles";
import { Nav, Footer } from "@/components/daylight/shell";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useStations } from "@/hooks/useStations";
import { useMyClaims, type ClaimOutcome } from "@/hooks/useMyClaims";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  validateClaimProfile,
  type ClaimProfileErrors,
  PURCHASING_OPERATORS,
  purchasingOperatorLabel,
  isSupportedPurchasingOperator,
} from "@/lib/claimProfileValidation";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";
import StationCombobox from "@/components/region/StationCombobox";
import {
  useCommuteRoutes,
  saveRoutes,
  ALL_WEEKDAYS,
  type CommuteRoute,
} from "@/hooks/useCommuteRoutes";

// Mon-first weekday chips for the commute-route monitor (ISO weekday → label).
const WEEKDAYS: [number, string][] = [
  [1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [7, "Sun"],
];

const PAYOUT_LABELS: Record<string, string> = {
  bank: "Bank transfer",
  sms: "SMS (Värdekod)",
  email: "Email (Värdekod)",
};

const toIsoDate = (value: string | null | undefined) => {
  if (!value) return "";
  return value.slice(0, 10);
};

const CLAIM_STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "border-amber-300 bg-amber-50 text-amber-900" },
  generated: { label: "Form ready", className: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  submitted: { label: "Submitted", className: "border-sky-300 bg-sky-50 text-sky-900" },
  error: { label: "Error", className: "border-destructive/40 bg-destructive/10 text-destructive" },
};

const CLAIM_OUTCOME_META: Record<string, { label: string; className: string }> = {
  paid_out: { label: "Paid out", className: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  denied: { label: "Denied", className: "border-destructive/40 bg-destructive/10 text-destructive" },
};

const fmtStockholm = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
};

const claimDelayLabel = (bucket: string | null, cancelled: boolean) => {
  if (cancelled) return "Cancelled";
  switch (bucket) {
    case "20_39": return "20–39 min";
    case "40_59": return "40–59 min";
    case "60_119": return "60–119 min";
    case "120_plus": return "120+ min";
    default: return "Delay";
  }
};

const Settings = () => {
  useDaylightStyles();
  const { user, profile, loading, refreshProfile, signOut, signInWithGoogle } = useAuth();
  const { toast } = useToast();
  const { data: stations = [] } = useStations();
  const { data: myClaims = [], isLoading: claimsLoading } = useMyClaims(user?.id);
  const { data: commuteRoutes = [], isSuccess: routesLoaded } = useCommuteRoutes(user?.id);
  const queryClient = useQueryClient();

  // Route-card helpers. Cards carry a client temp id; the DB assigns the real id
  // on save (saveRoutes strips it). New cards default to the preferred O-D.
  const addRoute = () =>
    setRoutes((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        from_stop_id: preferredFromStopId || "",
        to_stop_id: preferredToStopId || "",
        outbound_start_time: null,
        outbound_end_time: null,
        return_start_time: null,
        return_end_time: null,
        monitored_days: [...ALL_WEEKDAYS],
      },
    ]);
  const removeRoute = (id: string) => setRoutes((prev) => prev.filter((r) => r.id !== id));
  const updateRoute = (id: string, patch: Partial<CommuteRoute>) =>
    setRoutes((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const toggleDay = (id: string, iso: number) =>
    setRoutes((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              monitored_days: r.monitored_days.includes(iso)
                ? r.monitored_days.filter((day) => day !== iso)
                : [...r.monitored_days, iso].sort((a, b) => a - b),
            }
          : r
      )
    );
  const [outcomeSavingId, setOutcomeSavingId] = useState<string | null>(null);

  // Lets the user record what Skånetrafiken decided. Setting outcome back to
  // null clears it. Requires the claims UPDATE RLS policy (own rows).
  const setClaimOutcome = async (id: string, outcome: ClaimOutcome) => {
    setOutcomeSavingId(id);
    try {
      const { error } = await supabase
        .from("claims")
        .update({ outcome } as never)
        .eq("id", id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["my-claims"] });
    } catch (error) {
      toast({
        title: "Could not update claim",
        description: error instanceof Error ? error.message : "Update failed",
        variant: "destructive",
      });
    } finally {
      setOutcomeSavingId(null);
    }
  };
  const stopOptions = useMemo(
    () =>
      stations
        .filter((s) => s.stop__id && s.station_name)
        .map((s) => ({ id: s.stop__id as string, name: s.station_name as string })),
    [stations]
  );
  const CLAIM_VALUE_SEK = 100;

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [payoutMethod, setPayoutMethod] = useState("");
  const [claimEmail, setClaimEmail] = useState("");
  const [claimMobile, setClaimMobile] = useState("");
  const [claimTicketId, setClaimTicketId] = useState("");
  const [claimPersonnummer, setClaimPersonnummer] = useState("");
  const [purchasingOperator, setPurchasingOperator] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [claimsDoneCount, setClaimsDoneCount] = useState(0);
  const [isPeriodTicket, setIsPeriodTicket] = useState(false);
  const [ticketValidUntil, setTicketValidUntil] = useState("");
  // GTFS IDs (see dim_active_stations). 3 = Malmö Centralstation, 25315 = København H.
  const [preferredFromStopId, setPreferredFromStopId] = useState("3");
  const [preferredToStopId, setPreferredToStopId] = useState("25315");
  const [routes, setRoutes] = useState<CommuteRoute[]>([]);
  const [routesInit, setRoutesInit] = useState(false);
  const [digestFrequency, setDigestFrequency] = useState("off");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<ClaimProfileErrors>({});
  const [activeTab, setActiveTab] = useState("personal");

  // Signature: stored once in the private `signatures` bucket; profiles.signature_path
  // points at it. We preview the saved one (signed URL) and let the user draw a
  // replacement. A fresh drawing overrides the saved one on Save.
  const sigPadRef = useRef<SignaturePadHandle>(null);
  const [existingSigUrl, setExistingSigUrl] = useState<string | null>(null);
  const [hasNewSignature, setHasNewSignature] = useState(false);
  const [sigError, setSigError] = useState<string | null>(null);
  const hasSignatureOnFile = Boolean(profile?.signature_path) || hasNewSignature;

  useEffect(() => {
    let active = true;
    const path = profile?.signature_path;
    if (!path) {
      setExistingSigUrl(null);
      return;
    }
    supabase.storage
      .from("signatures")
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (active) setExistingSigUrl(data?.signedUrl ?? null);
      });
    return () => {
      active = false;
    };
  }, [profile?.signature_path]);

  useEffect(() => {
    setFirstName(profile?.first_name ?? "");
    setLastName(profile?.last_name ?? "");
    setPayoutMethod(profile?.payout_method ?? "");
    setClaimEmail(profile?.claim_email ?? profile?.email ?? "");
    setClaimMobile(profile?.claim_mobile ?? "");
    setClaimTicketId(profile?.claim_ticket_id ?? "");
    setClaimPersonnummer(profile?.claim_personnummer ?? "");
    setPurchasingOperator(profile?.purchasing_operator ?? "");
    setStreetAddress(profile?.street_address ?? "");
    setPostalCode(profile?.postal_code ?? "");
    setCity(profile?.city ?? "");
    setClaimsDoneCount(profile?.claims_done_count ?? 0);
    setIsPeriodTicket(profile?.is_period_ticket ?? false);
    setTicketValidUntil(toIsoDate(profile?.ticket_valid_until));
    setPreferredFromStopId(profile?.preferred_from_stop_id ?? "3");
    setPreferredToStopId(profile?.preferred_to_stop_id ?? "25315");
    setDigestFrequency(profile?.digest_frequency ?? "off");
  }, [profile]);

  // Seed the route cards once the saved routes load. Guarded so later refetches
  // don't clobber unsaved edits in the cards.
  useEffect(() => {
    if (!routesLoaded || routesInit) return;
    setRoutes(
      commuteRoutes.map((r) => ({
        ...r,
        monitored_days: r.monitored_days ?? [...ALL_WEEKDAYS],
      }))
    );
    setRoutesInit(true);
  }, [routesLoaded, commuteRoutes, routesInit]);

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

    const validationErrors = validateClaimProfile({
      firstName,
      lastName,
      claimEmail,
      claimMobile,
      claimPersonnummer,
      streetAddress,
      postalCode,
      city,
      claimTicketId,
      payoutMethod,
      purchasingOperator,
    });
    setErrors(validationErrors);

    // Signature lives outside validateClaimProfile (it's a canvas, not a text
    // field). The form requires one, so block save without a saved or new signature.
    const signatureMissing = !hasSignatureOnFile;
    setSigError(signatureMissing ? "A signature is required for the claim form." : null);

    if (Object.keys(validationErrors).length > 0 || signatureMissing) {
      // Surface the tab that holds the first problem. Ticket ID lives on the
      // ticket tab; everything else (incl. signature) is on the personal tab.
      const ticketTabKeys = new Set(["claimTicketId", "payoutMethod", "purchasingOperator"]);
      const allOnTicketTab =
        !signatureMissing &&
        Object.keys(validationErrors).length > 0 &&
        Object.keys(validationErrors).every((key) => ticketTabKeys.has(key));
      setActiveTab(allOnTicketTab ? "ticket" : "personal");
      toast({
        title: "Please fix the highlighted fields",
        description:
          "These details go on your Skånetrafiken claim. Incomplete or wrongly formatted data can get the claim rejected.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      // Upload a freshly drawn signature (if any) before the profile upsert, so
      // signature_path always points at an object that exists. Stable filename →
      // upsert overwrites the previous one.
      let signaturePath = profile?.signature_path ?? null;
      if (hasNewSignature) {
        const blob = await sigPadRef.current?.toBlob();
        if (blob) {
          const path = `${user.id}/signature.png`;
          const { error: uploadError } = await supabase.storage
            .from("signatures")
            .upload(path, blob, { contentType: "image/png", upsert: true });
          if (uploadError) throw uploadError;
          signaturePath = path;
        }
      }

      const { error } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          signature_path: signaturePath,
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          full_name: `${firstName.trim()} ${lastName.trim()}`.trim() || null,
          claim_email: claimEmail || null,
          claim_mobile: claimMobile || null,
          claim_ticket_id: claimTicketId || null,
          claim_personnummer: claimPersonnummer || null,
          purchasing_operator: purchasingOperator || null,
          street_address: streetAddress || null,
          postal_code: postalCode || null,
          city: city || null,
          payout_method: payoutMethod || null,
          claims_done_count: Math.max(0, claimsDoneCount),
          is_period_ticket: isPeriodTicket,
          ticket_valid_until: isPeriodTicket ? ticketValidUntil || null : null,
          preferred_from_stop_id: preferredFromStopId || null,
          preferred_to_stop_id: preferredToStopId || null,
          digest_frequency: digestFrequency,
        },
        { onConflict: "id" }
      );
      if (error) throw error;

      // Persist the commute routes (replace-all). Throws on failure → outer catch
      // surfaces the toast, same as the profile save.
      await saveRoutes(user.id, routes);
      await queryClient.invalidateQueries({ queryKey: ["commute-routes", user.id] });

      // Pull the saved row back into AuthContext so the new signature_path (and
      // any other change) is live everywhere — the Settings preview on revisit
      // and the delay-alerts claim gate both read profile.signature_path.
      if (hasNewSignature) {
        sigPadRef.current?.clear();
        setHasNewSignature(false);
      }
      await refreshProfile();

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
    <div style={{ minHeight: "100vh", background: "#F2F5F3" }}>
      {/* Daylight nav/footer live in their own scoped wrapper; the shadcn form
          below stays OUTSIDE .cmt-daylight so the theme's `* { padding:0 }`
          reset can't clobber the form's spacing. */}
      <div className="cmt-daylight" style={{ minHeight: 0, background: "transparent" }}>
        <Nav
          signedIn={Boolean(user)}
          accountLabel={profile?.full_name || profile?.first_name || user?.email || "Konto"}
          onSignOut={() => void signOut()}
          onLogin={() => void signInWithGoogle("/settings")}
        />
      </div>

      <div className="container mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground/80">Konto</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Inställningar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Spara dina standarduppgifter så fylls ansökan i snabbare.
          </p>
        </div>

        <Card className="p-5">
          <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">Why these details matter</p>
              <p className="mt-1">
                Your personal details, address, personnummer and ticket ID are submitted on the
                Skånetrafiken reklamation. If any required field is missing or wrongly formatted,
                Skånetrafiken can reject the claim. Fields marked with{" "}
                <span className="font-semibold text-destructive">*</span> are mandatory.
              </p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <TabsList className="!grid h-auto w-full !grid-cols-2 gap-1 p-1 sm:!grid-cols-4">
                <TabsTrigger value="personal" className="w-full">Personal info</TabsTrigger>
                <TabsTrigger value="ticket" className="w-full">Ticket</TabsTrigger>
                <TabsTrigger value="commuter" className="w-full">Commuter habits</TabsTrigger>
                <TabsTrigger value="claims" className="w-full">My claims</TabsTrigger>
              </TabsList>

              <TabsContent value="personal" className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="first-name">
                      First name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="first-name"
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      placeholder="Anna"
                      autoComplete="given-name"
                      aria-invalid={Boolean(errors.firstName)}
                    />
                    {errors.firstName && (
                      <p className="text-sm text-destructive">{errors.firstName}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="last-name">
                      Last name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="last-name"
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      placeholder="Andersson"
                      autoComplete="family-name"
                      aria-invalid={Boolean(errors.lastName)}
                    />
                    {errors.lastName && (
                      <p className="text-sm text-destructive">{errors.lastName}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="claim-email">
                    Claim email <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="claim-email"
                    type="email"
                    value={claimEmail}
                    onChange={(event) => setClaimEmail(event.target.value)}
                    placeholder="name@example.com"
                    aria-invalid={Boolean(errors.claimEmail)}
                  />
                  {errors.claimEmail && (
                    <p className="text-sm text-destructive">{errors.claimEmail}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="claim-mobile">
                    Mobile number <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="claim-mobile"
                    type="tel"
                    value={claimMobile}
                    onChange={(event) => setClaimMobile(event.target.value)}
                    placeholder="+46 70 123 45 67"
                    aria-invalid={Boolean(errors.claimMobile)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Swedish (0701234567) or international with country code (+46…).
                  </p>
                  {errors.claimMobile && (
                    <p className="text-sm text-destructive">{errors.claimMobile}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="claim-personnummer">
                    Personnummer <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="claim-personnummer"
                    value={claimPersonnummer}
                    onChange={(event) => setClaimPersonnummer(event.target.value)}
                    placeholder="19700901-3975"
                    aria-invalid={Boolean(errors.claimPersonnummer)}
                  />
                  {errors.claimPersonnummer && (
                    <p className="text-sm text-destructive">{errors.claimPersonnummer}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="street-address">
                    Street address <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="street-address"
                    value={streetAddress}
                    onChange={(event) => setStreetAddress(event.target.value)}
                    placeholder="Storgatan 1"
                    autoComplete="street-address"
                    aria-invalid={Boolean(errors.streetAddress)}
                  />
                  {errors.streetAddress && (
                    <p className="text-sm text-destructive">{errors.streetAddress}</p>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="postal-code">
                      Postal code <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="postal-code"
                      value={postalCode}
                      onChange={(event) => setPostalCode(event.target.value)}
                      placeholder="211 20"
                      autoComplete="postal-code"
                      aria-invalid={Boolean(errors.postalCode)}
                    />
                    {errors.postalCode && (
                      <p className="text-sm text-destructive">{errors.postalCode}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">
                      City <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="city"
                      value={city}
                      onChange={(event) => setCity(event.target.value)}
                      placeholder="Malmö"
                      autoComplete="address-level2"
                      aria-invalid={Boolean(errors.city)}
                    />
                    {errors.city && <p className="text-sm text-destructive">{errors.city}</p>}
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-border/70 bg-card/70 p-4">
                  <div>
                    <p className="text-sm font-semibold">
                      Signature <span className="text-destructive">*</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Drawn once and reused on every claim form. The Skånetrafiken reklamation
                      requires a signature; we add it only when you confirm and submit a claim.
                    </p>
                  </div>

                  {existingSigUrl && !hasNewSignature && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Signature on file:</p>
                      <img
                        src={existingSigUrl}
                        alt="Your saved signature"
                        className="h-20 w-auto max-w-full rounded-md border border-border/70 bg-white p-1"
                      />
                      <p className="text-xs text-muted-foreground">
                        Draw below to replace it.
                      </p>
                    </div>
                  )}

                  <SignaturePad
                    ref={sigPadRef}
                    onChange={(hasInk) => {
                      setHasNewSignature(hasInk);
                      if (hasInk) setSigError(null);
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        sigPadRef.current?.clear();
                        setHasNewSignature(false);
                      }}
                    >
                      Clear
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {hasNewSignature
                        ? "New signature ready — Save to store it."
                        : existingSigUrl
                          ? "Using your saved signature."
                          : "Draw your signature in the box."}
                    </span>
                  </div>
                  {sigError && <p className="text-sm text-destructive">{sigError}</p>}
                </div>
              </TabsContent>

              <TabsContent value="ticket" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="purchasing-operator">
                    Where did you buy your ticket? <span className="text-destructive">*</span>
                  </Label>
                  <Select value={purchasingOperator} onValueChange={setPurchasingOperator}>
                    <SelectTrigger id="purchasing-operator" aria-invalid={Boolean(errors.purchasingOperator)}>
                      <SelectValue placeholder="Choose your ticket vendor">
                        {purchasingOperator ? purchasingOperatorLabel(purchasingOperator) : undefined}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {PURCHASING_OPERATORS.map((op) => (
                        <SelectItem key={op.value} value={op.value}>
                          {op.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    We currently only handle <span className="font-medium">Skånetrafiken</span> claims.
                    If you bought your ticket from another operator, use that operator's own
                    förseningsersättning process.
                  </p>
                  {errors.purchasingOperator && (
                    <p className="text-sm text-destructive">{errors.purchasingOperator}</p>
                  )}
                  {purchasingOperator && !isSupportedPurchasingOperator(purchasingOperator) && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      Heads up: claims aren't supported for {purchasingOperatorLabel(purchasingOperator)} yet,
                      so you won't be able to file from the delay pages with this selection.
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="claim-ticket-id">
                    Ticket ID <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="claim-ticket-id"
                    value={claimTicketId}
                    onChange={(event) => setClaimTicketId(event.target.value)}
                    placeholder="2Y3CE88"
                    aria-invalid={Boolean(errors.claimTicketId)}
                  />
                  {errors.claimTicketId && (
                    <p className="text-sm text-destructive">{errors.claimTicketId}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payout-method">
                    Preferred payout method <span className="text-destructive">*</span>
                  </Label>
                  <Select value={payoutMethod} onValueChange={setPayoutMethod}>
                    <SelectTrigger id="payout-method" aria-invalid={Boolean(errors.payoutMethod)}>
                      <SelectValue placeholder="Choose how you want to be paid">
                        {payoutMethod ? PAYOUT_LABELS[payoutMethod] ?? payoutMethod : undefined}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank">Bank transfer</SelectItem>
                      <SelectItem value="sms">SMS (Värdekod)</SelectItem>
                      <SelectItem value="email">Email (Värdekod)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Skånetrafiken pays out either by bank transfer or as a Värdekod sent by SMS or email.
                  </p>
                  {errors.payoutMethod && (
                    <p className="text-sm text-destructive">{errors.payoutMethod}</p>
                  )}
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
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Monitored commutes (optional)</p>
                      <p className="text-xs text-muted-foreground">
                        Add each route you commute. For every back-and-forth route, set the
                        time windows for going out and coming back, and pick which weekdays to
                        monitor. The delay digest only covers these routes.
                      </p>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={addRoute}>
                      Add route
                    </Button>
                  </div>

                  {routes.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No routes yet — add one to monitor your commute.
                    </p>
                  )}

                  {routes.map((route, idx) => (
                    <div
                      key={route.id}
                      className="space-y-3 rounded-lg border border-border/60 bg-background/60 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Route {idx + 1}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => removeRoute(route.id)}
                        >
                          Remove
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>From</Label>
                          <StationCombobox
                            value={route.from_stop_id}
                            options={stopOptions}
                            onSelect={(id) => updateRoute(route.id, { from_stop_id: id })}
                            ariaLabel={`Route ${idx + 1} from station`}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>To</Label>
                          <StationCombobox
                            value={route.to_stop_id}
                            options={stopOptions}
                            onSelect={(id) => updateRoute(route.id, { to_stop_id: id })}
                            ariaLabel={`Route ${idx + 1} to station`}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Outbound start</Label>
                          <Input
                            type="time"
                            value={route.outbound_start_time ?? ""}
                            onChange={(event) =>
                              updateRoute(route.id, { outbound_start_time: event.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Outbound end</Label>
                          <Input
                            type="time"
                            value={route.outbound_end_time ?? ""}
                            onChange={(event) =>
                              updateRoute(route.id, { outbound_end_time: event.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Return start</Label>
                          <Input
                            type="time"
                            value={route.return_start_time ?? ""}
                            onChange={(event) =>
                              updateRoute(route.id, { return_start_time: event.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Return end</Label>
                          <Input
                            type="time"
                            value={route.return_end_time ?? ""}
                            onChange={(event) =>
                              updateRoute(route.id, { return_end_time: event.target.value })
                            }
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Monitor on</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {WEEKDAYS.map(([iso, label]) => {
                            const on = route.monitored_days.includes(iso);
                            return (
                              <button
                                key={iso}
                                type="button"
                                aria-pressed={on}
                                onClick={() => toggleDay(route.id, iso)}
                                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                                  on
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                        {route.monitored_days.length === 0 && (
                          <p className="text-xs text-amber-600">
                            No days selected — this route is paused.
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-3 rounded-xl border border-border/70 bg-card/70 p-4">
                  <div>
                    <p className="text-sm font-semibold">Delay digest emails</p>
                    <p className="text-xs text-muted-foreground">
                      Get an email listing late departures on your monitored commutes (the routes
                      above), with a one-click way to claim them. Only sent when there is something
                      to claim.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="digest-frequency">Frequency</Label>
                      <Select value={digestFrequency} onValueChange={setDigestFrequency}>
                        <SelectTrigger id="digest-frequency">
                          <SelectValue>
                            {digestFrequency === "daily"
                              ? "Daily (evenings)"
                              : digestFrequency === "weekly"
                              ? "Weekly (Sunday evenings)"
                              : "Off"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="off">Off</SelectItem>
                          <SelectItem value="daily">Daily (evenings)</SelectItem>
                          <SelectItem value="weekly">Weekly (Sunday evenings)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {digestFrequency !== "off" && routes.length === 0 && (
                    <p className="text-xs text-amber-600">
                      Add at least one commute route above — the digest only covers your monitored
                      routes.
                    </p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="claims" className="space-y-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">Your filed claims</p>
                  <p className="text-xs text-muted-foreground">
                    Each delay you submit appears here. Once we've generated the filled
                    Skånetrafiken form, you can download it.
                  </p>
                </div>

                {claimsLoading ? (
                  <p className="text-sm text-muted-foreground">Loading your claims…</p>
                ) : myClaims.length === 0 ? (
                  <div className="rounded-xl border border-border/70 bg-card/70 p-4 text-sm text-muted-foreground">
                    No claims yet. Find a delayed trip on{" "}
                    <Link to="/regions/skanetrafiken/delay-alerts" className="underline font-medium">
                      claimable delays
                    </Link>{" "}
                    and hit “Start claim”.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {myClaims.map((claim) => {
                      const meta = CLAIM_STATUS_META[claim.status] ?? {
                        label: claim.status,
                        className: "border-border bg-muted text-foreground",
                      };
                      const outcomeMeta = claim.outcome ? CLAIM_OUTCOME_META[claim.outcome] : null;
                      const saving = outcomeSavingId === claim.id;
                      return (
                        <div
                          key={claim.id}
                          className="space-y-3 rounded-xl border border-border/70 bg-card/70 p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold">
                              {claim.origin_stop_name} → {claim.destination_stop_name}
                            </p>
                            <div className="flex items-center gap-2">
                              <span
                                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.className}`}
                              >
                                {meta.label}
                              </span>
                              {outcomeMeta && (
                                <span
                                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${outcomeMeta.className}`}
                                >
                                  {outcomeMeta.label}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* What was filed on this claim (the stored journey snapshot). */}
                          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                            <div>
                              <dt className="text-muted-foreground">Travel date</dt>
                              <dd>{toIsoDate(claim.trip_start_date)}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Compensation tier</dt>
                              <dd>{claimDelayLabel(claim.delay_bucket, claim.was_cancelled)}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Filed</dt>
                              <dd>{toIsoDate(claim.created_at)}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Scheduled departure</dt>
                              <dd>{fmtStockholm(claim.origin_scheduled)}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Scheduled arrival</dt>
                              <dd>{fmtStockholm(claim.destination_scheduled)}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Actual arrival</dt>
                              <dd>{claim.was_cancelled ? "Cancelled" : fmtStockholm(claim.destination_actual)}</dd>
                            </div>
                          </dl>
                          <p className="text-[11px] text-muted-foreground">
                            Personal details (name, personnummer, address, payout) are taken from your
                            profile above at the time the form is generated.
                          </p>

                          {claim.status === "error" && claim.error_message && (
                            <p className="text-xs text-destructive">{claim.error_message}</p>
                          )}

                          {/* Outcome controls */}
                          <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                            <span className="text-xs text-muted-foreground">Outcome:</span>
                            <Button
                              type="button"
                              size="sm"
                              variant={claim.outcome === "paid_out" ? "default" : "outline"}
                              disabled={saving}
                              onClick={() => void setClaimOutcome(claim.id, "paid_out")}
                            >
                              Paid out
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={claim.outcome === "denied" ? "destructive" : "outline"}
                              disabled={saving}
                              onClick={() => void setClaimOutcome(claim.id, "denied")}
                            >
                              Denied
                            </Button>
                            {claim.outcome && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={saving}
                                onClick={() => void setClaimOutcome(claim.id, null)}
                              >
                                Clear
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
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

      <div className="cmt-daylight" style={{ minHeight: 0, background: "transparent" }}>
        <Footer />
      </div>
    </div>
  );
};

export default Settings;
