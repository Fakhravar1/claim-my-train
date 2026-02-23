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

const toIsoDate = (value: string | null | undefined) => {
  if (!value) return "";
  return value.slice(0, 10);
};

const Settings = () => {
  const { user, profile, loading } = useAuth();
  const { toast } = useToast();

  const [claimEmail, setClaimEmail] = useState("");
  const [claimMobile, setClaimMobile] = useState("");
  const [claimTicketId, setClaimTicketId] = useState("");
  const [claimPersonnummer, setClaimPersonnummer] = useState("");
  const [isPeriodTicket, setIsPeriodTicket] = useState(false);
  const [ticketValidUntil, setTicketValidUntil] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setClaimEmail(profile?.claim_email ?? profile?.email ?? "");
    setClaimMobile(profile?.claim_mobile ?? "");
    setClaimTicketId(profile?.claim_ticket_id ?? "");
    setClaimPersonnummer(profile?.claim_personnummer ?? "");
    setIsPeriodTicket(profile?.is_period_ticket ?? false);
    setTicketValidUntil(toIsoDate(profile?.ticket_valid_until));
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
          is_period_ticket: isPeriodTicket,
          ticket_valid_until: isPeriodTicket ? ticketValidUntil || null : null,
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
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Claim settings</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Save your default claim details to prefill the claim flow faster.
            </p>
          </div>
          <UserMenu />
        </div>

        <Card className="p-5">
          <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
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
              <Label htmlFor="claim-ticket-id">Ticket ID</Label>
              <Input
                id="claim-ticket-id"
                value={claimTicketId}
                onChange={(event) => setClaimTicketId(event.target.value)}
                placeholder="2Y3CE88"
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

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save settings"}
              </Button>
              <Link to="/delay-alerts">
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
