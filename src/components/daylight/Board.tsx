import { forwardRef, useMemo } from "react";
import type { Journey } from "@/hooks/useJourneys";
import { statusMeta } from "@/lib/daylightStatus";
import { resolveOperatorFromJourney, purchasingOperatorLabel } from "@/lib/claimProfileValidation";
import { ArrowIcon, BellIcon } from "./icons";
import { StationField } from "./StationField";

/** HH:MM in Stockholm local time from an ISO timestamp. */
function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Stockholm",
  });
}

/** Short day label, e.g. "15 jun". */
function fmtDayShort(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso)
    .toLocaleDateString("sv-SE", { day: "numeric", month: "short", timeZone: "Europe/Stockholm" })
    .replace(".", "");
}

export function lineLabel(j: Pick<Journey, "line_name" | "service_number">): string {
  return j.line_name ?? "Tåg " + (j.service_number ?? "");
}

/**
 * Transport-mode label taken straight from the data (`transport_mode`), so the
 * board says what the service actually IS — "Tåg" for trains — instead of
 * stamping a line name / train number on every row. Only trains flow today;
 * future modes map here. Unknown/null falls back to the raw value so we never
 * arbitrarily call a non-train a "Tåg".
 */
const MODE_LABELS: Record<string, string> = {
  train: "Tåg",
  bus: "Buss",
  tram: "Spårvagn",
  metro: "Tunnelbana",
  ferry: "Båt",
  boat: "Båt",
};
export function modeLabel(j: Pick<Journey, "transport_mode">): string {
  const m = (j.transport_mode ?? "").toLowerCase();
  return MODE_LABELS[m] ?? (m ? m[0].toUpperCase() + m.slice(1) : "");
}

/**
 * Display-only brands for train_owner codes that deliberately have NO
 * purchasing_operator mapping (mapping them would mis-route a claim — §5/§8),
 * so the card can still name the operator instead of a bare "Tåg".
 * MTRX = MTR Express, acquired by VR Group 2024 and rebranded VR Snabbtåg
 * (Stockholm–Göteborg) — NOT the same claim route as VR-operated Öresundståg.
 */
const TRAIN_OWNER_BRANDS: Record<string, string> = {
  MTRX: "VR Snabbtåg",
  DVVJ: "DVVJ (Dal–Västra Värmlands Järnväg)",
};

/**
 * Operator brand for the card — the name riders recognize (SJ / Öresundståg /
 * Skånetrafiken / Pågatåg), taken from the journey's descriptive `operator`
 * (information_owner on the TV side). When information_owner is null (notably MOST
 * SJ trains) we fall back to the same feed-signal resolver the claim modal uses
 * (train_owner code -> brand), so a card reads "SJ" / "Arlanda Express" instead of
 * a bare "Tåg" — descriptive-only, never a rule key (§5/§8). Codes the resolver
 * deliberately leaves unmapped for routing still get a display brand (or the raw
 * code itself — terser but strictly more informative than "Tåg"). Only when the
 * feed carries no owner signal at all (extra-/ersättningståg: Trafikverket sends
 * every owner field null) do we fall back to the mode ("Tåg").
 */
export function operatorLabel(j: Pick<Journey, "operator" | "train_owner" | "transport_mode">): string {
  const raw = (j.operator ?? "").trim();
  if (raw) return raw;
  const resolved = resolveOperatorFromJourney(j);
  if (resolved) return purchasingOperatorLabel(resolved);
  const code = (j.train_owner ?? "").trim();
  if (code) return TRAIN_OWNER_BRANDS[code] ?? code;
  return modeLabel(j);
}

export type StationOption = { id: string; name: string };

type BoardProps = {
  rows: Journey[];
  loading: boolean;
  date: string;
  setDate: (d: string) => void;
  maxDate: string;
  minDate: string;
  from: string;
  to: string;
  setFrom: (id: string) => void;
  setTo: (id: string) => void;
  stationOptions: StationOption[];
  /** Station deep-link filter — when set, the board is scoped to one station. */
  stationLabel?: string | null;
  onClearStation?: () => void;
  /** Filter checkboxes (delayed / cancelled / claimable). */
  onlyDelayed: boolean;
  onlyCancelled: boolean;
  onlyClaimable: boolean;
  setOnlyDelayed: (v: boolean) => void;
  setOnlyCancelled: (v: boolean) => void;
  setOnlyClaimable: (v: boolean) => void;
  /** Route-mode window expanders — reveal a dozen earlier / later departures. */
  hasEarlier: boolean;
  hasMore: boolean;
  onShowEarlier: () => void;
  onShowMore: () => void;
  onClaim: (j: Journey) => void;
  onInfo: (j: Journey) => void;
  onWatch: (j: Journey) => void;
  /** "Bevaka som pendlare" — watch the selected O-D leg as a commuter. */
  onWatchCommuter: () => void;
};

export const Board = forwardRef<HTMLDivElement, BoardProps>(function Board(
  {
    rows,
    loading,
    date,
    setDate,
    maxDate,
    minDate,
    from,
    to,
    setFrom,
    setTo,
    stationOptions,
    stationLabel,
    onClearStation,
    onlyDelayed,
    onlyCancelled,
    onlyClaimable,
    setOnlyDelayed,
    setOnlyCancelled,
    setOnlyClaimable,
    hasEarlier,
    hasMore,
    onShowEarlier,
    onShowMore,
    onClaim,
    onInfo,
    onWatch,
    onWatchCommuter,
  },
  ref
) {
  const elig = useMemo(
    () => rows.filter((d) => statusMeta(d.destination_delay_minutes, Boolean(d.canceled), d.route_distance_km).eligible).length,
    [rows]
  );

  return (
    <section className="board-wrap" id="board" ref={ref}>
      <div className="wrap">
        <div className="board">
          <div className="board__head">
            <div className="board__title">
              <span className="live"><span className="live__dot" />LIVE</span>
              <span className="board__h">Förseningar i nätet</span>
            </div>
          </div>

          {stationLabel ? (
            <p className="board__cap board__cap--station">
              Visar avgångar som rör <b>{stationLabel}</b>.{" "}
              <button type="button" className="linkbtn" onClick={onClearStation}>
                Visa hela nätet
              </button>
            </p>
          ) : null}

          <div className="board__controls">
            <StationField label="Från" value={from} onChange={setFrom} options={stationOptions} />
            <StationField label="Till" value={to} onChange={setTo} options={stationOptions} />
            <label className="board__control">
              <span>Datum</span>
              <input type="date" value={date} min={minDate} max={maxDate} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>

          <div className="board__filters">
            <label className="board__filter">
              <input
                type="checkbox"
                checked={onlyDelayed}
                onChange={(e) => setOnlyDelayed(e.target.checked)}
              />
              Försenade
            </label>
            <label className="board__filter">
              <input
                type="checkbox"
                checked={onlyCancelled}
                onChange={(e) => setOnlyCancelled(e.target.checked)}
              />
              Inställda
            </label>
            <label className="board__filter">
              <input
                type="checkbox"
                checked={onlyClaimable}
                onChange={(e) => setOnlyClaimable(e.target.checked)}
              />
              Kan ge ersättning
            </label>
          </div>

          <div className="board__sub">
            <span>{rows.length} avgångar</span>
            <span className="board__elig">{elig} kan ge ersättning</span>
          </div>

          {!loading && hasEarlier && (
            <div className="board__more board__more--top">
              <button className="btn btn--quiet btn--sm" onClick={onShowEarlier}>
                Visa tidigare avgångar
              </button>
            </div>
          )}

          <div className="rows">
            {loading && <div className="empty">Hämtar avgångar…</div>}
            {!loading && rows.length === 0 && (
              <div className="empty">Inga avgångar att visa för {date}.</div>
            )}
            {!loading && rows.map((d) => (
              <Row key={d.journey_key} d={d} onClaim={onClaim} onInfo={onInfo} onWatch={onWatch} />
            ))}
          </div>

          {!loading && hasMore && (
            <div className="board__more">
              <button className="btn btn--quiet btn--sm" onClick={onShowMore}>
                Visa senare avgångar
              </button>
            </div>
          )}

          <div className="board__foot">
            <span>Pendlar du den här sträckan? Få mejl när tåget är sent.</span>
            <button className="linkbtn" onClick={onWatchCommuter}>
              Bevaka som pendlare <BellIcon width={14} height={14} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
});

function Row({
  d,
  onClaim,
  onInfo,
  onWatch,
}: {
  d: Journey;
  onClaim: (j: Journey) => void;
  onInfo: (j: Journey) => void;
  onWatch: (j: Journey) => void;
}) {
  const m = statusMeta(d.destination_delay_minutes, Boolean(d.canceled), d.route_distance_km);
  return (
    <div className={"row row--" + m.tone}>
      <div className="row__time">
        <span className="row__dep">{fmtTime(d.origin_scheduled)}</span>
      </div>

      <div className="row__route">
        <span className="st st--from">{d.origin_stop_name}</span>
        <ArrowIcon className="row__arrow" width={13} height={13} />
        <span className="st st--to">{d.destination_stop_name}</span>
      </div>

      <span className="row__line">
        {fmtDayShort(d.origin_local_date)} · {operatorLabel(d)}
      </span>

      <div className="row__status">
        <span className={"tag tag--" + m.tone}>{m.chipLabel}</span>
        {m.near && <span className="row__hint">Strax under gränsen</span>}
      </div>

      <div className="row__action">
        {/* Everyone can file — it's their right; our tiers only indicate what
            our data thinks is eligible. So the claim button is always shown. */}
        <button className="btn btn--accent btn--sm" onClick={() => onClaim(d)}>
          Ansök om ersättning
        </button>
        <button
          type="button"
          className="watchbtn"
          onClick={() => onWatch(d)}
          aria-label="Bevaka åt mig"
          title="Bevaka åt mig"
        >
          <BellIcon width={16} height={16} />
        </button>
      </div>
    </div>
  );
}
