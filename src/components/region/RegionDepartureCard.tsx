import type { ReactNode } from "react";

/**
 * Departure card — v2 layout from the Claim My Train UI kit.
 *
 * ┌────────────────────────────────────────────────────────────┐
 * │ [ÖT]  Öresundståg  ·  Mon 18 May      [● +24 min late]     │
 * ├────────────────────────────────────────────────────────────┤
 * │ DEPARTS FROM                          ARRIVES AT           │
 * │ Malmö Triangeln   ●━━ 31 min ━→●     København H          │
 * │ 08:06 → 08:30                         08:37 → 08:58       │
 * │ +24 min                               +21 min              │
 * └────────────────────────────────────────────────────────────┘
 *
 * Mirrors the JSX in
 * `Claim My Train Design System (1)/ui_kits/web/components/DepartureCard.jsx`.
 */

export interface RegionDeparture {
  line: string;
  lineName?: string;
  /** Display-only operator/brand label (e.g. "VR Sverige AB", "Pågatåg", "SJ") */
  operator?: string | null;
  departureStation: string;
  arrivalStation: string;
  /** Scheduled departure time (origin_scheduled), HH:MM */
  departureTime: string;
  /** Actual departure time (origin_actual), HH:MM — shown when it differs from scheduled */
  departureRealtimeTime?: string | null;
  departureDate: string;
  scheduledArrivalTime?: string | null;
  arrivalTime: string | null;
  arrivalDate: string | null;
  arrivalDelayMinutes?: number;
  canceled?: boolean;
  journeyKey?: string;
}

interface Props {
  dep: RegionDeparture;
  /** Optional action node rendered in the card footer (e.g. "Start claim"). */
  action?: ReactNode;
}

const parseTimeToSeconds = (value?: string | null) => {
  if (!value) return null;
  const [h, m, s = "0"] = value.split(":");
  const hh = Number(h);
  const mm = Number(m);
  const ss = Number(s);
  if ([hh, mm, ss].some(Number.isNaN)) return null;
  return hh * 3600 + mm * 60 + ss;
};

const SECONDS_PER_DAY = 86_400;

// Clock-time subtraction loses the calendar date, so a leg that rolls past
// midnight (e.g. scheduled 23:48, actual 00:11) comes out as a ~-24h delta.
// Wrap the raw difference into [-12h, +12h] so it reads as the real ±minutes.
// Train deltas are always well within half a day, so this is unambiguous.
const wrapHalfDay = (seconds: number) => {
  let s = seconds % SECONDS_PER_DAY;
  if (s > SECONDS_PER_DAY / 2) s -= SECONDS_PER_DAY;
  if (s < -SECONDS_PER_DAY / 2) s += SECONDS_PER_DAY;
  return s;
};

const trimSeconds = (value?: string | null) => {
  if (!value) return "";
  const parts = value.split(":");
  if (parts.length < 2) return value;
  return `${parts[0]}:${parts[1]}`;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const formatNiceDate = (iso: string) => {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

const dayDiff = (fromIso: string, toIso: string) => {
  const a = new Date(`${fromIso}T00:00:00`);
  const b = new Date(`${toIso}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
};

const fmtDelta = (m: number) => (m === 0 ? "" : `${m > 0 ? "+" : ""}${m} min`);

interface TimePairProps {
  scheduled: string;
  realtime: string;
  deltaMin: number;
  hasRealtime: boolean;
}

function TimePair({ scheduled, realtime, deltaMin, hasRealtime }: TimePairProps) {
  if (!scheduled && !realtime) {
    return <div className="leg__times leg__times--empty">—</div>;
  }
  if (!hasRealtime) {
    return (
      <div className="leg__times">
        <span className="leg__time leg__time--plain">{scheduled}</span>
      </div>
    );
  }
  const tone = deltaMin > 0 ? "leg__time--late" : "leg__time--early";
  return (
    <div className="leg__times">
      <span className="leg__time leg__time--was">{scheduled}</span>
      <span className="leg__arrow" aria-hidden="true">→</span>
      <span className={`leg__time ${tone}`}>{realtime}</span>
    </div>
  );
}

export default function RegionDepartureCard({ dep, action }: Props) {
  // ─── Departure time math (origin_scheduled vs origin_actual)
  const depScheduled = trimSeconds(dep.departureTime);
  const depRealtime = trimSeconds(dep.departureRealtimeTime ?? dep.departureTime);
  const depSchedSec = parseTimeToSeconds(dep.departureTime);
  const depRealSec = parseTimeToSeconds(dep.departureRealtimeTime ?? dep.departureTime);
  const depDeltaSeconds =
    depSchedSec !== null && depRealSec !== null ? wrapHalfDay(depRealSec - depSchedSec) : 0;
  const depDeltaMin =
    depDeltaSeconds === 0
      ? 0
      : Math.sign(depDeltaSeconds) * Math.floor(Math.abs(depDeltaSeconds) / 60);
  const hasDepRealtime = depDeltaSeconds !== 0;

  const arrScheduledRaw = dep.scheduledArrivalTime ?? dep.arrivalTime ?? "";
  const arrScheduled = trimSeconds(arrScheduledRaw);
  const arrRealtime = trimSeconds(dep.arrivalTime);
  const arrSchedSec = parseTimeToSeconds(arrScheduledRaw);
  const arrRealSec = parseTimeToSeconds(dep.arrivalTime);
  const arrDeltaSeconds =
    arrSchedSec !== null && arrRealSec !== null ? wrapHalfDay(arrRealSec - arrSchedSec) : 0;
  const arrDeltaMin =
    arrDeltaSeconds === 0
      ? 0
      : Math.sign(arrDeltaSeconds) * Math.floor(Math.abs(arrDeltaSeconds) / 60);
  const hasArrRealtime = arrDeltaSeconds !== 0;

  // ─── Severity (drives card tint + status pill colour)
  const orangeChange = arrDeltaSeconds >= 40 * 60;
  const majorChange = arrDeltaSeconds >= 20 * 60 && arrDeltaSeconds < 40 * 60;
  const severity: "neutral" | "amber" | "rose" = orangeChange
    ? "rose"
    : majorChange
    ? "amber"
    : "neutral";

  // ─── Duration (min)
  let duration: number | null = null;
  if (dep.arrivalTime && dep.departureTime) {
    const [dh, dm] = dep.departureTime.split(":").map(Number);
    const [ah, am] = dep.arrivalTime.split(":").map(Number);
    if (![dh, dm, ah, am].some(Number.isNaN)) {
      let mins = ah * 60 + am - (dh * 60 + dm);
      if (mins < 0) mins += 1440; // arrival rolled past midnight
      duration = mins;
    }
  }

  // ─── Day shift (arrival on different calendar day)
  const depDateLabel = dep.departureDate || "";
  const arrDateLabel = dep.arrivalDate || dep.departureDate || "";
  const spansDays = Boolean(arrDateLabel) && arrDateLabel !== depDateLabel;
  const shiftDays = spansDays ? dayDiff(depDateLabel, arrDateLabel) : 0;
  const dayshiftLabel =
    shiftDays === 1
      ? "next day"
      : shiftDays === -1
      ? "prev day"
      : shiftDays > 0
      ? `+${shiftDays}d`
      : `${shiftDays}d`;

  // ─── Headline status pill label
  const headlineDelta = arrDeltaMin !== 0 ? arrDeltaMin : depDeltaMin;
  const statusLabel =
    severity === "rose"
      ? `+${arrDeltaMin} min · severe`
      : severity === "amber"
      ? `+${arrDeltaMin} min late`
      : headlineDelta === 0
      ? "On time"
      : headlineDelta > 0
      ? `+${headlineDelta} min`
      : `${headlineDelta} min`;

  return (
    <article className={`dep dep--${severity}`}>
      {/* ─── Meta band */}
      <header className="dep__meta">
        <div className="dep__id">
          <div className="dep__id-row">
            {dep.line && <span className="dep__line">{dep.line}</span>}
            {dep.operator && (
              <>
                <span className="dep__sep" aria-hidden="true">·</span>
                <span className="dep__date">{dep.operator}</span>
              </>
            )}
            {depDateLabel && (
              <>
                <span className="dep__sep" aria-hidden="true">·</span>
                <span className="dep__date">{formatNiceDate(depDateLabel)}</span>
              </>
            )}
          </div>
          {dep.lineName && (
            <div className="dep__direction">
              <span className="dep__direction-label">Direction:</span>
              {dep.lineName}
            </div>
          )}
        </div>
        <div className={`dep__status dep__status--${severity}`}>
          <span className="dep__status-dot" aria-hidden="true" />
          {statusLabel}
        </div>
      </header>

      {/* ─── Journey row: from-block · rail · to-block */}
      <div className="dep__journey">
        <section className="leg leg--from">
          <p className="leg__eyebrow">Departs from</p>
          <h3 className="leg__station">{dep.departureStation || "—"}</h3>
          <TimePair
            scheduled={depScheduled}
            realtime={depRealtime}
            deltaMin={depDeltaMin}
            hasRealtime={hasDepRealtime}
          />
          <p
            className={`leg__delta leg__delta--${
              hasDepRealtime ? (depDeltaSeconds > 0 ? "late" : "early") : "muted"
            }`}
          >
            {hasDepRealtime ? fmtDelta(depDeltaMin) : "scheduled"}
          </p>
        </section>

        <div className="rail" aria-hidden="true">
          <div className="rail__line">
            <span className="rail__dot rail__dot--from" />
            <span className="rail__dash" />
            <span className="rail__arrow">→</span>
          </div>
          {duration !== null && <div className="rail__duration">{duration} min</div>}
        </div>

        <section className="leg leg--to">
          <p className="leg__eyebrow">Arrives at</p>
          <h3 className="leg__station">
            {dep.arrivalStation || "—"}
            {spansDays && <span className="leg__dayshift">{dayshiftLabel}</span>}
          </h3>
          <TimePair
            scheduled={arrScheduled}
            realtime={arrRealtime}
            deltaMin={arrDeltaMin}
            hasRealtime={hasArrRealtime}
          />
          <p
            className={`leg__delta leg__delta--${
              hasArrRealtime ? (arrDeltaSeconds > 0 ? "late" : "early") : "muted"
            }`}
          >
            {hasArrRealtime ? fmtDelta(arrDeltaMin) : "scheduled"}
          </p>
        </section>
      </div>

      {dep.canceled && <div className="dep__cancelled">Cancelled</div>}
      {action && <div className="dep__action">{action}</div>}
    </article>
  );
}
