import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { addWatchRoute } from "@/hooks/useCommuteRoutes";
import { useToast } from "@/hooks/use-toast";
import type { Journey } from "@/hooks/useJourneys";
import { Scrim, ModalHead } from "./primitives";
import { BellIcon, CheckIcon } from "./icons";
import { lineLabel } from "./Board";

/**
 * Minimal shape WatchModal needs — a full board Journey satisfies it (per-row
 * bell), but so does a synthetic route-level target with `origin_scheduled`
 * null (the "Bevaka som pendlare" footer button, which watches a whole O-D leg
 * with no specific departure).
 */
export type WatchTarget = Pick<
  Journey,
  | "origin_scheduled"
  | "origin_local_date"
  | "origin_stop_id"
  | "destination_stop_id"
  | "origin_stop_name"
  | "destination_stop_name"
  | "line_name"
  | "service_number"
>;

/** Mon-first weekday chips (ISO weekday → Swedish short label). */
const WEEKDAYS: [number, string][] = [
  [1, "Mån"], [2, "Tis"], [3, "Ons"], [4, "Tor"], [5, "Fre"], [6, "Lör"], [7, "Sön"],
];

/** Stockholm-local HH:MM from an ISO timestamp. */
function hhmm(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Stockholm",
  });
}

/** ISO weekday (1=Mon … 7=Sun) of a yyyy-mm-dd date. */
function isoWeekday(date: string | null | undefined): number {
  if (!date) return 1;
  const d = new Date(date + "T00:00:00");
  if (Number.isNaN(d.getTime())) return 1;
  const js = d.getDay(); // 0=Sun … 6=Sat
  return js === 0 ? 7 : js;
}

/** Shift a HH:MM clock time by ±minutes, clamped to the same day. */
function shiftClock(time: string, deltaMin: number): string {
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  let total = h * 60 + m + deltaMin;
  total = Math.max(0, Math.min(24 * 60 - 1, total));
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * "Bevaka åt mig" pop-up — opened from the bell on a board departure. Lets the
 * user pick which weekdays to watch this O-D departure on, then persists it as a
 * monitored commute route (CLAUDE.md §16) so the delay digest emails them when
 * that train is late. Defaults to the departure's own weekday; toggle more for a
 * recurring watch. Caller guarantees the user is signed in.
 */
export function WatchModal({ journey, onClose }: { journey: WatchTarget; onClose: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // A route-level watch (footer "Bevaka som pendlare") has no specific
  // departure → no time window, matches all day.
  const routeLevel = !journey.origin_scheduled;
  const depTime = hhmm(journey.origin_scheduled);
  const [days, setDays] = useState<number[]>([isoWeekday(journey.origin_local_date)]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const toggle = (iso: number) =>
    setDays((d) =>
      d.includes(iso) ? d.filter((x) => x !== iso) : [...d, iso].sort((a, b) => a - b)
    );

  const window = useMemo(() => {
    const base = depTime === "—" ? "00:00" : depTime;
    return { start: shiftClock(base, -30), end: shiftClock(base, 30) };
  }, [depTime]);

  const save = async () => {
    if (!user || !journey.origin_stop_id || !journey.destination_stop_id) return;
    setBusy(true);
    try {
      await addWatchRoute({
        userId: user.id,
        fromStopId: journey.origin_stop_id,
        toStopId: journey.destination_stop_id,
        monitoredDays: days,
        // Route-level watch → no window (matches all day).
        ...(routeLevel ? {} : { outboundStart: window.start, outboundEnd: window.end }),
      });
      void queryClient.invalidateQueries({ queryKey: ["commute-routes"] });
      setDone(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Något gick fel.";
      toast({ title: "Kunde inte spara bevakningen", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Scrim onClose={onClose}>
      <div className="modal">
        <ModalHead title="Bevaka åt mig" onClose={onClose} />
        <div className="modal__body">
          {done ? (
            <div className="step acct">
              <div className="acct__badge is-ok"><CheckIcon width={26} height={26} /></div>
              <h3 className="acct__h">Bevakningen är sparad</h3>
              <p className="acct__p">
                Vi mejlar dig så fort <b>{journey.origin_stop_name} → {journey.destination_stop_name}</b>{" "}
                {routeLevel ? "" : `runt ${depTime} `}blir 20 minuter eller mer sen på de valda dagarna.
                Du kan ändra bevakningen under Inställningar → Pendlarvanor.
              </p>
              <div className="acct__btns">
                <button className="btn btn--accent btn--block" onClick={onClose}>Klar</button>
              </div>
            </div>
          ) : (
            <div className="step">
              <p className="lead">
                Vi bevakar den här avgången åt dig och mejlar när den blir försenad. Välj vilka dagar
                den ska bevakas — lämna en dag om det är en engångsresa, eller markera flera för en
                återkommande pendling.
              </p>
              <div className="summary">
                <div className="summary__row">
                  <span>Resa</span>
                  <b>{journey.origin_stop_name} → {journey.destination_stop_name}</b>
                </div>
                <div className="summary__row">
                  <span>Avgång</span>
                  <b>{routeLevel ? "Alla avgångar under dagen" : `${depTime} · ${lineLabel(journey)}`}</b>
                </div>
              </div>

              <div className="field">
                <span className="field__label">Bevaka på dessa dagar</span>
                <div className="daychips">
                  {WEEKDAYS.map(([iso, label]) => {
                    const on = days.includes(iso);
                    return (
                      <button
                        key={iso}
                        type="button"
                        className={"daychip" + (on ? " is-on" : "")}
                        aria-pressed={on}
                        onClick={() => toggle(iso)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                {days.length === 0 && (
                  <span className="field__err">Välj minst en dag att bevaka.</span>
                )}
              </div>
            </div>
          )}
        </div>

        {!done && (
          <div className="modal__foot">
            <button className="btn btn--ghost" onClick={onClose}>Avbryt</button>
            <button
              className="btn btn--accent"
              disabled={busy || days.length === 0}
              onClick={() => void save()}
            >
              {busy ? "Sparar…" : "Bevaka"} <BellIcon width={16} height={16} />
            </button>
          </div>
        )}
      </div>
    </Scrim>
  );
}
