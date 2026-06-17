import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useStations } from "@/hooks/useStations";
import { useJourneys, type Journey } from "@/hooks/useJourneys";
import { useStartClaim } from "@/hooks/useStartClaim";
import { useToast } from "@/hooks/use-toast";
import { statusMeta } from "@/lib/daylightStatus";
import { isSupportedPurchasingOperator, purchasingOperatorLabel } from "@/lib/claimProfileValidation";
import { Scrim, ModalHead, Field } from "./primitives";
import { ArrowIcon, BellIcon, CheckIcon, GoogleIcon, ShieldIcon } from "./icons";
import { lineLabel } from "./Board";

/** initial: a board row (pre-filled), {blank}, or {blank, loginOnly}. */
export type ClaimInitial = Journey | { blank: true; loginOnly?: boolean };

const STEPS = ["Resan", "Uppgifter", "Granska"] as const;
type Phase = "journey" | "details" | "review" | "account";
type AccountIntent = "login" | "submitted" | "save";

const PAYOUT_LABELS: Record<string, string> = {
  bank: "Bankkonto",
  sms: "Värdekod via SMS",
  email: "Värdekod via e-post",
};

function isJourney(x: ClaimInitial): x is Journey {
  return !(x as { blank?: boolean }).blank;
}

function PayoutNote() {
  return (
    <div className="paynote">
      <span className="paynote__ico"><ShieldIcon width={18} height={18} /></span>
      <span>
        Vi hanterar aldrig dina pengar. Ersättningen betalas ut <b>direkt från operatören</b> till din
        valda mottagningsmetod — vi rör aldrig beloppet.
      </span>
    </div>
  );
}

export function ClaimModal({
  initial,
  onClose,
  onClaimed,
}: {
  initial: ClaimInitial;
  onClose: () => void;
  onClaimed?: () => void;
}) {
  const navigate = useNavigate();
  const { user, profile, signInWithGoogle } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { startClaim, pending: submitting } = useStartClaim();
  const { data: stations = [] } = useStations();

  const prefilled = isJourney(initial) ? initial : null;
  const loginOnly = !isJourney(initial) && Boolean(initial.loginOnly);

  const [phase, setPhase] = useState<Phase>(loginOnly ? "account" : "journey");
  const [accountIntent, setAccountIntent] = useState<AccountIntent>(loginOnly ? "save" : "login");
  const [from, setFrom] = useState<string>(prefilled?.origin_stop_id ?? "");
  const [to, setTo] = useState<string>(prefilled?.destination_stop_id ?? "");
  const [date, setDate] = useState<string>(
    prefilled?.origin_local_date ?? new Date().toISOString().slice(0, 10)
  );
  const [sel, setSel] = useState<Journey | null>(prefilled);
  const [sigUrl, setSigUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const stationOptions = useMemo(
    () =>
      stations
        .filter((s) => s.stop__id && s.station_name)
        .map((s) => ({ id: s.stop__id as string, name: s.station_name as string })),
    [stations]
  );

  // Candidate departures on the chosen route+date (blank mode's match-finder).
  const { data: matches = [] } = useJourneys({
    fromStopId: from || null,
    toStopId: to || null,
    date,
    onlyClaimable: false,
  });

  // Profile fields that will be printed on the claim — same set the existing
  // dialog gates on (CLAUDE.md §6). Missing any → can't file.
  const claimFields = useMemo<[string, string][]>(
    () => [
      ["Namn", [profile?.first_name, profile?.last_name].filter(Boolean).join(" ")],
      ["Personnummer", profile?.claim_personnummer ?? ""],
      [
        "Adress",
        [profile?.street_address, [profile?.postal_code, profile?.city].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(", "),
      ],
      ["Mobil", profile?.claim_mobile ?? ""],
      ["E-post", profile?.claim_email ?? ""],
      ["Biljett-ID", profile?.claim_ticket_id ?? ""],
      ["Utbetalning", profile?.payout_method ? PAYOUT_LABELS[profile.payout_method] ?? profile.payout_method : ""],
      ["Signatur", profile?.signature_path ? "Sparad" : ""],
    ],
    [profile]
  );
  const missing = claimFields.filter(([, v]) => !v.trim()).map(([k]) => k);
  const operatorSupported = isSupportedPurchasingOperator(profile?.purchasing_operator);
  const canFile = user && missing.length === 0 && operatorSupported;

  // Signature preview (short-lived signed URL) once we reach the confirm steps.
  useEffect(() => {
    let active = true;
    const path = profile?.signature_path;
    if (!path || (phase !== "details" && phase !== "review")) {
      setSigUrl(null);
      return;
    }
    supabase.storage
      .from("signatures")
      .createSignedUrl(path, 60 * 10)
      .then(({ data }) => {
        if (active) setSigUrl(data?.signedUrl ?? null);
      });
    return () => {
      active = false;
    };
  }, [phase, profile?.signature_path]);

  const stepIndex = { journey: 0, details: 1, review: 2, account: 2 }[phase];
  const selMeta = sel ? statusMeta(sel.destination_delay_minutes, Boolean(sel.canceled)) : null;

  const goFromJourney = () => {
    if (!user) {
      setAccountIntent("login");
      setPhase("account");
      return;
    }
    setPhase("details");
  };

  const submit = async () => {
    if (!sel) return;
    setStatus("Skickar…");
    const result = await startClaim(sel, profile?.signature_path ?? null);
    if (result.ok) {
      setStatus("");
      void queryClient.invalidateQueries({ queryKey: ["my-claims"] });
      onClaimed?.();
      setAccountIntent("submitted");
      setPhase("account");
    } else {
      setStatus(result.error);
      toast({ title: "Kunde inte spara ansökan", description: result.error, variant: "destructive" });
    }
  };

  const dateLong = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" });
  const timeOf = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" }) : "—";

  return (
    <Scrim onClose={onClose}>
      <div className="modal">
        {phase !== "account" && (
          <>
            <ModalHead title="Ansök om ersättning" onClose={onClose} />
            <div className="stepper">
              {STEPS.map((s, i) => (
                <div key={s} className={"stepper__item" + (i === stepIndex ? " is-active" : "") + (i < stepIndex ? " is-done" : "")}>
                  <span className="stepper__dot">{i < stepIndex ? <CheckIcon width={12} height={12} /> : i + 1}</span>
                  <span className="stepper__label">{s}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="modal__body">
          {phase === "journey" && (
            <div className="step">
              <p className="lead">
                {prefilled
                  ? "Vi har identifierat din avgång. Stämmer den?"
                  : "Vet du inte exakt vilken avgång? Välj sträcka och datum, så listar vi de förseningar vi har."}
              </p>
              <div className="grid2">
                <Field label="Från">
                  <select value={from} onChange={(e) => { setFrom(e.target.value); setSel(null); }}>
                    <option value="">Välj station</option>
                    {stationOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
                <Field label="Till">
                  <select value={to} onChange={(e) => { setTo(e.target.value); setSel(null); }}>
                    <option value="">Välj station</option>
                    {stationOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Datum">
                <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setSel(null); }} />
              </Field>

              {from && to && (
                <div className="matches">
                  <span className="matches__h">
                    {matches.length ? "Avgångar på sträckan" : "Inga registrerade avgångar — prova en annan sträcka"}
                  </span>
                  {matches.map((d) => {
                    const mm = statusMeta(d.destination_delay_minutes, Boolean(d.canceled));
                    const on = sel?.journey_key === d.journey_key;
                    return (
                      <button key={d.journey_key} className={"match" + (on ? " is-on" : "")} onClick={() => setSel(d)}>
                        <span className="match__time">{timeOf(d.origin_scheduled)}</span>
                        <span className="match__line">{lineLabel(d)}</span>
                        <span className={"tag tag--" + mm.status}>{mm.label}</span>
                        {on && <span className="match__check"><CheckIcon width={15} height={15} /></span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {sel && selMeta && (
                <div className={"verdict verdict--" + selMeta.status}>
                  {selMeta.eligible ? (
                    <><b>Enligt våra uppgifter kan du ha rätt till ersättning.</b> {lineLabel(sel)} var {selMeta.minutes} min sen — över 20-minutersgränsen.</>
                  ) : (
                    <><b>Precis under gränsen.</b> {selMeta.minutes} min räcker inte riktigt enligt våra uppgifter — men vi kan bevaka den åt dig.</>
                  )}
                </div>
              )}
            </div>
          )}

          {phase === "details" && (
            <div className="step">
              <p className="lead">
                Vi fyller i operatörens formulär med uppgifterna från ditt konto. Kontrollera att de stämmer.
              </p>
              <div className="summary">
                {claimFields.map(([k, v]) => (
                  <div key={k} className="summary__row">
                    <span>{k}</span>
                    <b style={v.trim() ? undefined : { color: "var(--severe)" }}>{v.trim() || "— saknas —"}</b>
                  </div>
                ))}
              </div>
              {sigUrl && (
                <div>
                  <p className="muted" style={{ marginBottom: 6 }}>Den här signaturen fästs på formuläret:</p>
                  <img src={sigUrl} alt="Din signatur" style={{ height: 56, width: "auto", maxWidth: "100%", background: "#fff", borderRadius: 8, border: "1px solid var(--line)", padding: 2 }} />
                </div>
              )}
              {missing.length > 0 && (
                <div className="verdict verdict--near">
                  Dessa uppgifter saknas: {missing.join(", ")}.{" "}
                  <button className="linkbtn" onClick={() => navigate("/settings")}>Komplettera i inställningar</button>
                </div>
              )}
              {!operatorSupported && (
                <div className="verdict verdict--near">
                  {profile?.purchasing_operator
                    ? `Ansökningar stöds inte för ${purchasingOperatorLabel(profile.purchasing_operator)}-biljetter ännu — bara Skånetrafiken. `
                    : "Ange var du köpte biljetten innan du ansöker — just nu stöds bara Skånetrafiken. "}
                  <button className="linkbtn" onClick={() => navigate("/settings")}>Uppdatera i inställningar</button>
                </div>
              )}
              <PayoutNote />
            </div>
          )}

          {phase === "review" && sel && selMeta && (
            <div className="step">
              <p className="lead">Granska innan du skickar. Vi fyller i operatörens formulär åt dig.</p>
              <div className="summary">
                <div className="summary__row"><span>Resa</span><b>{sel.origin_stop_name} → {sel.destination_stop_name}</b></div>
                <div className="summary__row"><span>Avgång</span><b>{timeOf(sel.origin_scheduled)} · {lineLabel(sel)}</b></div>
                <div className="summary__row"><span>Datum</span><b>{dateLong(sel.origin_local_date ?? date)}</b></div>
                <div className="summary__row"><span>Försening</span><b>{sel.canceled ? "Inställt" : selMeta.minutes + " min"}</b></div>
                <div className="summary__row"><span>Mottagare</span><b>{[profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "—"}</b></div>
                <div className="summary__row"><span>Utbetalning</span><b>{profile?.payout_method ? PAYOUT_LABELS[profile.payout_method] ?? profile.payout_method : "—"}</b></div>
              </div>
              <PayoutNote />
            </div>
          )}

          {phase === "account" && (
            <AccountView
              intent={accountIntent}
              email={profile?.claim_email ?? user?.email ?? null}
              onGoogle={() => void signInWithGoogle("/")}
              onEmail={() => navigate("/login?next=/")}
              onHabits={() => { onClose(); navigate("/settings"); }}
              onClose={onClose}
            />
          )}
        </div>

        {phase !== "account" && (
          <div className="modal__foot">
            <button
              className="btn btn--ghost"
              onClick={() => {
                if (phase === "journey") onClose();
                else if (phase === "details") setPhase("journey");
                else setPhase("details");
              }}
            >
              {phase === "journey" ? "Avbryt" : "Tillbaka"}
            </button>
            {phase === "journey" && (
              <button className="btn btn--accent" disabled={!sel || !selMeta?.eligible} onClick={goFromJourney}>
                Nästa <ArrowIcon width={16} height={16} />
              </button>
            )}
            {phase === "details" && (
              <button className="btn btn--accent" disabled={!canFile} onClick={() => setPhase("review")}>
                Granska <ArrowIcon width={16} height={16} />
              </button>
            )}
            {phase === "review" && (
              <div className="foot__pair">
                <button className="btn btn--quiet" onClick={onClose}>Avbryt</button>
                <button className="btn btn--accent" disabled={submitting || !canFile} onClick={() => void submit()}>
                  {submitting ? "Skickar…" : "Skicka ansökan"} <CheckIcon width={16} height={16} />
                </button>
              </div>
            )}
          </div>
        )}
        {status && phase !== "account" && (
          <p className="muted" style={{ padding: "0 1.3rem 1rem" }}>{status}</p>
        )}
      </div>
    </Scrim>
  );
}

function AccountView({
  intent,
  email,
  onGoogle,
  onEmail,
  onHabits,
  onClose,
}: {
  intent: AccountIntent;
  email: string | null;
  onGoogle: () => void;
  onEmail: () => void;
  onHabits: () => void;
  onClose: () => void;
}) {
  if (intent === "submitted") {
    return (
      <div className="step acct">
        <div className="acct__badge is-ok"><CheckIcon width={26} height={26} /></div>
        <h3 className="acct__h">Ansökan inskickad</h3>
        <p className="acct__p">
          Vi har skickat in din ansökan och mejlar när den är behandlad. Ange dina pendlarvanor, så
          mejlar vi dig så fort tågen du brukar ta blir försenade.
        </p>
        <div className="acct__btns">
          <button className="btn btn--dark btn--block" onClick={onHabits}>Ställ in pendlarvanor</button>
          <button className="btn btn--ghost btn--block" onClick={onClose}>Klar</button>
        </div>
      </div>
    );
  }
  // login / save intents — both need the user signed in.
  const saving = intent === "save";
  return (
    <div className="step acct">
      <div className="acct__badge"><BellIcon width={24} height={24} /></div>
      <h3 className="acct__h">{saving ? "Spara dina uppgifter?" : "Logga in för att ansöka"}</h3>
      <p className="acct__p">
        {saving
          ? "Skapa ett konto så sparar vi resa och utbetalningssätt — och ange dina pendlarvanor, så mejlar vi dig så fort tågen du brukar ta blir försenade."
          : "Vi fyller i operatörens formulär med dina sparade uppgifter och fäster din signatur. Logga in för att fortsätta."}
      </p>
      <div className="acct__btns">
        <button className="btn btn--dark btn--block" onClick={onGoogle}><GoogleIcon width={18} height={18} /> Fortsätt med Google</button>
        <button className="btn btn--ghost btn--block" onClick={onEmail}>Fortsätt med {email ? email : "e-post"}</button>
      </div>
      <button className="linkbtn linkbtn--center" onClick={onClose}>Inte nu</button>
    </div>
  );
}
