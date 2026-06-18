import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useStations } from "@/hooks/useStations";
import { useJourneys, type Journey } from "@/hooks/useJourneys";
import { useStartClaim, buildClaimPayload } from "@/hooks/useStartClaim";
import { useToast } from "@/hooks/use-toast";
import { statusMeta } from "@/lib/daylightStatus";
import {
  isSupportedPurchasingOperator,
  purchasingOperatorLabel,
  validateClaimProfile,
  validateEmail,
  PURCHASING_OPERATORS,
  PAYOUT_METHODS,
  type ClaimProfileInput,
  type ClaimProfileErrors,
} from "@/lib/claimProfileValidation";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";
import { savePendingClaim, buildProfileRow, blobToDataUrl } from "@/lib/pendingClaim";
import { Scrim, ModalHead, Field } from "./primitives";
import { ArrowIcon, BellIcon, CheckIcon, GoogleIcon, ShieldIcon } from "./icons";
import { lineLabel } from "./Board";

/** initial: a board row (pre-filled), {blank}, or {blank, loginOnly}. */
export type ClaimInitial = Journey | { blank: true; loginOnly?: boolean };

type Phase = "journey" | "details" | "review" | "account";
type AccountIntent = "login" | "submitted" | "save";

const PAYOUT_LABELS: Record<string, string> = {
  bank: "Bankkonto",
  sms: "Värdekod via SMS",
  email: "Värdekod via e-post",
};

const EMPTY_DETAILS: ClaimProfileInput = {
  firstName: "",
  lastName: "",
  claimEmail: "",
  claimMobile: "",
  claimPersonnummer: "",
  streetAddress: "",
  postalCode: "",
  city: "",
  claimTicketId: "",
  payoutMethod: "",
  purchasingOperator: "skanetrafiken",
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
  const [accountIntent] = useState<AccountIntent>(loginOnly ? "save" : "login");
  const [submitted, setSubmitted] = useState(false);
  const [editing, setEditing] = useState(!prefilled); // blank entry starts editable
  const [from, setFrom] = useState<string>(prefilled?.origin_stop_id ?? "");
  const [to, setTo] = useState<string>(prefilled?.destination_stop_id ?? "");
  const [date, setDate] = useState<string>(
    prefilled?.origin_local_date ?? new Date().toISOString().slice(0, 10)
  );
  const [sel, setSel] = useState<Journey | null>(prefilled);
  const [sigUrl, setSigUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  // Logged-out inline claim details (typed by the user; nothing is persisted
  // until the account is created on the final step).
  const [details, setDetails] = useState<ClaimProfileInput>(EMPTY_DETAILS);
  const [detailErrors, setDetailErrors] = useState<ClaimProfileErrors>({});
  const [sigError, setSigError] = useState<string | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const sigPadRef = useRef<SignaturePadHandle>(null);
  const setField = (k: keyof ClaimProfileInput, v: string) =>
    setDetails((d) => ({ ...d, [k]: v }));

  // Final create-account step inputs.
  const [acctEmail, setAcctEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState(false);

  const stationOptions = useMemo(
    () =>
      stations
        .filter((s) => s.stop__id && s.station_name)
        .map((s) => ({ id: s.stop__id as string, name: s.station_name as string })),
    [stations]
  );

  // Candidate departures on the chosen route+date (blank/edit mode's match-finder).
  const { data: matches = [] } = useJourneys({
    fromStopId: from || null,
    toStopId: to || null,
    date,
    onlyClaimable: false,
  });

  // Profile fields that will be printed on the claim — same set the existing
  // dialog gates on (CLAUDE.md §6). Missing any → can't file. Logged-in only.
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

  // Signature preview (short-lived signed URL) once a logged-in user reaches the
  // confirm steps.
  useEffect(() => {
    let active = true;
    const path = profile?.signature_path;
    if (!path || (phase !== "details" && phase !== "review") || !user) {
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
  }, [phase, profile?.signature_path, user]);

  const STEPS = user ? (["Resan", "Uppgifter", "Granska"] as const) : (["Resan", "Uppgifter", "Konto"] as const);
  const stepIndex = { journey: 0, details: 1, review: 2, account: 2 }[phase];
  const selMeta = sel ? statusMeta(sel.destination_delay_minutes, Boolean(sel.canceled)) : null;
  const detailsOperatorSupported = isSupportedPurchasingOperator(details.purchasingOperator);

  // Chrome (header + stepper + footer) shows only during the claim funnel — not
  // on the login pop-up (loginOnly) nor the post-submit success screen.
  const showChrome = !submitted && !loginOnly;

  const proceedFromDetails = () => {
    // Logged-in users have a complete profile already; just advance to review.
    if (user) {
      setPhase("review");
      return;
    }
    const errs = validateClaimProfile(details);
    setDetailErrors(errs);
    const sigOk = hasInk;
    setSigError(sigOk ? null : "Signatur krävs av operatören.");
    if (Object.keys(errs).length === 0 && sigOk && detailsOperatorSupported) {
      setAcctEmail(details.claimEmail.trim());
      setPhase("account");
    }
  };

  // Logged-in path: file against the saved profile + stored signature.
  const submit = async () => {
    if (!sel) return;
    setStatus("Skickar…");
    const result = await startClaim(sel, profile?.signature_path ?? null);
    if (result.ok) {
      setStatus("");
      void queryClient.invalidateQueries({ queryKey: ["my-claims"] });
      onClaimed?.();
      setSubmitted(true);
      setPhase("account");
    } else {
      setStatus(result.error);
      toast({ title: "Kunde inte spara ansökan", description: result.error, variant: "destructive" });
    }
  };

  // Logged-out path: create the account, then (with the new session) save the
  // profile, upload the signature, and insert the claim — all need auth.uid().
  const submitAsNewUser = async () => {
    if (!sel) return;
    const emailErr = validateEmail(acctEmail);
    if (emailErr) {
      setStatus(emailErr);
      return;
    }
    if (password.length < 8) {
      setStatus("Lösenordet måste vara minst 8 tecken.");
      return;
    }
    setBusy(true);
    setStatus("Skapar konto…");
    try {
      const { data, error } = await supabase.auth.signUp({
        email: acctEmail.trim(),
        password,
        options: { emailRedirectTo: `${window.location.origin}/` },
      });
      if (error) {
        setStatus(error.message);
        toast({ title: "Kunde inte skapa konto", description: error.message, variant: "destructive" });
        return;
      }
      // Capture the drawn signature once — used either immediately (session) or
      // stashed for replay after email confirmation (no session).
      const blob = await sigPadRef.current?.toBlob();

      // No session → email confirmation is required. We can't write under RLS
      // yet, so stash the journey + details + signature and finish the claim
      // once they confirm and return authenticated (usePendingClaimCompletion).
      if (!data.session || !data.user) {
        savePendingClaim({
          userId: data.user?.id ?? "",
          journey: sel,
          details,
          signatureDataUrl: blob ? await blobToDataUrl(blob) : null,
          savedAt: new Date().toISOString(),
        });
        setStatus("");
        setConfirmEmail(true);
        return;
      }
      const uid = data.user.id;

      // 1. Signature → private own-folder bucket.
      let signaturePath: string | null = null;
      if (blob) {
        const path = `${uid}/signature.png`;
        const { error: upErr } = await supabase.storage
          .from("signatures")
          .upload(path, blob, { contentType: "image/png", upsert: true });
        if (upErr) throw upErr;
        signaturePath = path;
      }

      // 2. Profile row (shared mapping with the deferred-replay path).
      const { error: pErr } = await supabase
        .from("profiles")
        .upsert(buildProfileRow(uid, details, signaturePath), { onConflict: "id" });
      if (pErr) throw pErr;

      // 3. The claim itself (shared snapshot builder).
      const payload = buildClaimPayload(sel, uid, signaturePath);
      const { error: cErr } = await supabase.from("claims").insert(payload);
      if (cErr && cErr.code !== "23505") throw cErr;

      setStatus("");
      void queryClient.invalidateQueries({ queryKey: ["my-claims"] });
      onClaimed?.();
      setSubmitted(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Något gick fel.";
      setStatus(msg);
      toast({ title: "Kunde inte skicka ansökan", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const dateLong = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" });
  const timeOf = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" }) : "—";

  return (
    <Scrim onClose={onClose}>
      <div className="modal">
        {showChrome && (
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
              {prefilled && !editing && sel && selMeta ? (
                <>
                  <p className="lead">Vi har identifierat din avgång. Stämmer den?</p>
                  <div className="summary">
                    <div className="summary__row"><span>Resa</span><b>{sel.origin_stop_name} → {sel.destination_stop_name}</b></div>
                    <div className="summary__row"><span>Avgång</span><b>{timeOf(sel.origin_scheduled)} · {lineLabel(sel)}</b></div>
                    <div className="summary__row"><span>Datum</span><b>{dateLong(sel.origin_local_date ?? date)}</b></div>
                    <div className="summary__row"><span>Försening</span><b>{sel.canceled ? "Inställt" : selMeta.minutes + " min"}</b></div>
                  </div>
                  <div className={"verdict verdict--" + selMeta.status}>
                    {selMeta.eligible ? (
                      <><b>Enligt våra uppgifter kan du ha rätt till ersättning.</b> {selMeta.minutes} min sen — över 20-minutersgränsen.</>
                    ) : (
                      <><b>Precis under gränsen.</b> {selMeta.minutes} min räcker inte riktigt enligt våra uppgifter.</>
                    )}
                  </div>
                  <button className="linkbtn linkbtn--center" onClick={() => setEditing(true)}>Välj en annan avgång</button>
                </>
              ) : (
                <>
                  <p className="lead">
                    Vet du inte exakt vilken avgång? Välj sträcka och datum, så listar vi de förseningar vi har.
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
                </>
              )}
            </div>
          )}

          {phase === "details" && user && (
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

          {phase === "details" && !user && (
            <div className="step">
              <p className="lead">
                Operatören (Skånetrafiken) kräver dessa uppgifter för att behandla din reklamation —
                inklusive din signatur. Allt sparas först när du skapar ditt konto i nästa steg.
              </p>
              <div className="grid2">
                <FormField label="Förnamn" err={detailErrors.firstName}>
                  <input value={details.firstName} onChange={(e) => setField("firstName", e.target.value)} autoComplete="given-name" />
                </FormField>
                <FormField label="Efternamn" err={detailErrors.lastName}>
                  <input value={details.lastName} onChange={(e) => setField("lastName", e.target.value)} autoComplete="family-name" />
                </FormField>
              </div>
              <FormField label="Personnummer" err={detailErrors.claimPersonnummer}>
                <input value={details.claimPersonnummer} onChange={(e) => setField("claimPersonnummer", e.target.value)} placeholder="ÅÅMMDD-XXXX" />
              </FormField>
              <FormField label="Gatuadress" err={detailErrors.streetAddress}>
                <input value={details.streetAddress} onChange={(e) => setField("streetAddress", e.target.value)} autoComplete="street-address" />
              </FormField>
              <div className="grid2">
                <FormField label="Postnummer" err={detailErrors.postalCode}>
                  <input value={details.postalCode} onChange={(e) => setField("postalCode", e.target.value)} placeholder="211 20" />
                </FormField>
                <FormField label="Ort" err={detailErrors.city}>
                  <input value={details.city} onChange={(e) => setField("city", e.target.value)} autoComplete="address-level2" />
                </FormField>
              </div>
              <div className="grid2">
                <FormField label="Mobil" err={detailErrors.claimMobile}>
                  <input value={details.claimMobile} onChange={(e) => setField("claimMobile", e.target.value)} placeholder="070-123 45 67" autoComplete="tel" />
                </FormField>
                <FormField label="E-post" err={detailErrors.claimEmail}>
                  <input type="email" value={details.claimEmail} onChange={(e) => setField("claimEmail", e.target.value)} autoComplete="email" />
                </FormField>
              </div>
              <FormField label="Var köpte du biljetten?" err={detailErrors.purchasingOperator}>
                <select value={details.purchasingOperator} onChange={(e) => setField("purchasingOperator", e.target.value)}>
                  {PURCHASING_OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </FormField>
              <div className="grid2">
                <FormField label="Biljett-ID / referens" err={detailErrors.claimTicketId}>
                  <input value={details.claimTicketId} onChange={(e) => setField("claimTicketId", e.target.value)} />
                </FormField>
                <FormField label="Utbetalning" err={detailErrors.payoutMethod}>
                  <select value={details.payoutMethod} onChange={(e) => setField("payoutMethod", e.target.value)}>
                    <option value="">Välj…</option>
                    {PAYOUT_METHODS.map((m) => <option key={m} value={m}>{PAYOUT_LABELS[m]}</option>)}
                  </select>
                </FormField>
              </div>

              <div className="field">
                <span className="field__label">Signatur</span>
                <SignaturePad ref={sigPadRef} className="sigpad" onChange={setHasInk} />
                <div className="sigrow">
                  <span className="muted">Krävs av operatören för reklamationen.</span>
                  <button className="linkbtn" onClick={() => { sigPadRef.current?.clear(); setHasInk(false); }}>Rensa</button>
                </div>
                {sigError && <span className="field__err">{sigError}</span>}
              </div>

              {!detailsOperatorSupported && (
                <div className="verdict verdict--near">
                  Ansökningar stöds bara för Skånetrafiken-biljetter just nu. Andra operatörer har egna
                  reklamationsvägar.
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

          {phase === "account" && submitted && (
            <AccountView
              intent="submitted"
              email={details.claimEmail || profile?.claim_email || user?.email || null}
              onGoogle={() => void signInWithGoogle("/")}
              onHabits={() => { onClose(); navigate("/settings"); }}
              onClose={onClose}
            />
          )}

          {phase === "account" && !submitted && loginOnly && (
            <AccountView
              intent={accountIntent}
              email={profile?.claim_email ?? user?.email ?? null}
              onGoogle={() => void signInWithGoogle("/")}
              onHabits={() => { onClose(); navigate("/settings"); }}
              onClose={onClose}
            />
          )}

          {phase === "account" && !submitted && !loginOnly && (
            <div className="step">
              <p className="lead">
                Välj ett lösenord för att skicka in din ansökan direkt och skapa ett konto. Då sparar vi
                dina uppgifter och du kan följa ärendet — och bevaka dina pendlartåg.
              </p>
              <Field label="E-post">
                <input type="email" value={acctEmail} onChange={(e) => setAcctEmail(e.target.value)} autoComplete="email" />
              </Field>
              <Field label="Lösenord">
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minst 8 tecken" autoComplete="new-password" />
              </Field>
              {confirmEmail ? (
                <div className="verdict verdict--near">
                  Vi har skapat ditt konto, men din e-post måste bekräftas först. Klicka på länken vi
                  mejlade, logga in och skicka in ansökan därifrån.
                </div>
              ) : (
                <PayoutNote />
              )}
              <div className="acct__btns">
                <button className="btn btn--accent btn--block" disabled={busy} onClick={() => void submitAsNewUser()}>
                  {busy ? "Skickar…" : "Skicka ansökan & skapa konto"} <CheckIcon width={16} height={16} />
                </button>
                <button className="btn btn--ghost btn--block" disabled={busy} onClick={() => setPhase("details")}>Tillbaka</button>
              </div>
              {status && <p className="muted" style={{ textAlign: "center" }}>{status}</p>}
            </div>
          )}
        </div>

        {showChrome && phase !== "account" && (
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
              <button className="btn btn--accent" disabled={!sel || !selMeta?.eligible} onClick={() => setPhase("details")}>
                Nästa <ArrowIcon width={16} height={16} />
              </button>
            )}
            {phase === "details" && (
              <button
                className="btn btn--accent"
                disabled={user ? !canFile : false}
                onClick={proceedFromDetails}
              >
                {user ? "Granska" : "Nästa"} <ArrowIcon width={16} height={16} />
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
        {status && showChrome && phase !== "account" && (
          <p className="muted" style={{ padding: "0 1.3rem 1rem" }}>{status}</p>
        )}
      </div>
    </Scrim>
  );
}

function FormField({ label, err, children }: { label: string; err?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {err && <span className="field__err">{err}</span>}
    </label>
  );
}

function AccountView({
  intent,
  email,
  onGoogle,
  onHabits,
  onClose,
}: {
  intent: AccountIntent;
  email: string | null;
  onGoogle: () => void;
  onHabits: () => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  // null = the Google / e-post chooser; otherwise the inline e-post form.
  const [emailMode, setEmailMode] = useState<null | "signin" | "signup">(null);
  const [acctEmail, setAcctEmail] = useState(email ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

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

  const saving = intent === "save";

  // Inline e-post form — the sign-in / create-account options live right in the
  // pop-up instead of redirecting to a separate page (auth state propagates via
  // AuthContext, which closes the modal once a session lands).
  const submitEmail = async () => {
    const emailErr = validateEmail(acctEmail);
    if (emailErr) {
      setInfo(emailErr);
      return;
    }
    if (password.length < 8) {
      setInfo("Lösenordet måste vara minst 8 tecken.");
      return;
    }
    setBusy(true);
    setInfo(null);
    try {
      if (emailMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: acctEmail.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) {
          setInfo(error.message);
          toast({ title: "Kunde inte skapa konto", description: error.message, variant: "destructive" });
          return;
        }
        if (!data.session) {
          setInfo("Vi har mejlat en bekräftelselänk. Klicka på den för att slutföra registreringen.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: acctEmail.trim(), password });
        if (error) {
          setInfo(error.message);
          toast({ title: "Inloggning misslyckades", description: error.message, variant: "destructive" });
          return;
        }
        // AuthContext picks up the session and the parent closes the modal.
      }
    } finally {
      setBusy(false);
    }
  };

  if (emailMode) {
    return (
      <div className="step acct">
        <div className="acct__badge"><BellIcon width={24} height={24} /></div>
        <h3 className="acct__h">{emailMode === "signup" ? "Skapa konto" : "Logga in"}</h3>
        <div className="acct__tabs">
          <button
            className={"acct__tab" + (emailMode === "signin" ? " is-on" : "")}
            onClick={() => { setEmailMode("signin"); setInfo(null); }}
          >
            Logga in
          </button>
          <button
            className={"acct__tab" + (emailMode === "signup" ? " is-on" : "")}
            onClick={() => { setEmailMode("signup"); setInfo(null); }}
          >
            Skapa konto
          </button>
        </div>
        <Field label="E-post">
          <input type="email" value={acctEmail} onChange={(e) => setAcctEmail(e.target.value)} autoComplete="email" />
        </Field>
        <Field label="Lösenord">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={emailMode === "signup" ? "Minst 8 tecken" : ""}
            autoComplete={emailMode === "signup" ? "new-password" : "current-password"}
          />
        </Field>
        {info && <p className="muted" style={{ textAlign: "center" }}>{info}</p>}
        <div className="acct__btns">
          <button className="btn btn--accent btn--block" disabled={busy} onClick={() => void submitEmail()}>
            {busy ? "…" : emailMode === "signup" ? "Skapa konto" : "Logga in"}
          </button>
          <button className="btn btn--ghost btn--block" disabled={busy} onClick={() => { setEmailMode(null); setInfo(null); }}>
            Tillbaka
          </button>
        </div>
      </div>
    );
  }

  // login / save intents — the in-modal sign-in pop-up (Google / e-post chooser).
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
        <button className="btn btn--ghost btn--block" onClick={() => { setEmailMode(saving ? "signup" : "signin"); setInfo(null); }}>
          Fortsätt med e-post
        </button>
      </div>
      <button className="linkbtn linkbtn--center" onClick={onClose}>Inte nu</button>
    </div>
  );
}
