import { Card } from "@/components/ui/card";

interface Departure {
  line: string;
  operator: string;
  lineName: string;
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
}

interface DepartureCardProps {
  departure: Departure;
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

const DepartureCard = ({ departure }: DepartureCardProps) => {
  const calculateDuration = () => {
    if (!departure.arrivalTime) return null;
    const [depHours, depMinutes] = departure.departureTime.split(":").map(Number);
    const [arrHours, arrMinutes] = departure.arrivalTime.split(":").map(Number);
    const depTotalMinutes = depHours * 60 + depMinutes;
    const arrTotalMinutes = arrHours * 60 + arrMinutes;
    const duration = arrTotalMinutes - depTotalMinutes;
    return duration > 0 ? duration : 0;
  };

  const duration = calculateDuration();
  const departureScheduled = departure.scheduledTime ?? departure.departureTime;
  const departureScheduledSeconds = parseTimeToSeconds(departureScheduled);
  const departureRealtimeSeconds = parseTimeToSeconds(departure.departureTime);
  const departureDeltaSeconds =
    departureScheduledSeconds !== null && departureRealtimeSeconds !== null
      ? departureRealtimeSeconds - departureScheduledSeconds
      : 0;
  const departureDeltaRounded =
    departureDeltaSeconds === 0
      ? 0
      : Math.sign(departureDeltaSeconds) * Math.floor(Math.abs(departureDeltaSeconds) / 60);
  const hasDepartureRealtime = departureDeltaSeconds !== 0;
  const departureRealtime = hasDepartureRealtime ? departure.departureTime : "";
  const departureDelta =
    departureDeltaRounded !== 0
      ? `${departureDeltaRounded > 0 ? "+" : ""}${departureDeltaRounded} min`
      : "";

  const arrivalScheduled = departure.scheduledArrivalTime ?? departure.arrivalTime ?? "";
  const arrivalScheduledSeconds = parseTimeToSeconds(arrivalScheduled);
  const arrivalRealtimeSeconds = parseTimeToSeconds(departure.arrivalTime);
  const arrivalDeltaSeconds =
    arrivalScheduledSeconds !== null && arrivalRealtimeSeconds !== null
      ? arrivalRealtimeSeconds - arrivalScheduledSeconds
      : 0;
  const arrivalDeltaRounded =
    arrivalDeltaSeconds === 0
      ? 0
      : Math.sign(arrivalDeltaSeconds) * Math.floor(Math.abs(arrivalDeltaSeconds) / 60);
  const hasArrivalRealtime = arrivalDeltaSeconds !== 0;
  const arrivalRealtime = hasArrivalRealtime ? (departure.arrivalTime ?? "") : "";
  const arrivalDelta =
    arrivalDeltaRounded !== 0
      ? `${arrivalDeltaRounded > 0 ? "+" : ""}${arrivalDeltaRounded} min`
      : "";
  const hasOrangeChange = arrivalDeltaSeconds !== null && arrivalDeltaSeconds >= 40 * 60;
  const hasMajorChange =
    arrivalDeltaSeconds !== null &&
    arrivalDeltaSeconds >= 20 * 60 &&
    arrivalDeltaSeconds < 40 * 60;
  const departureDateLabel = departure.departureDate || "-";
  const arrivalDateLabel = departure.arrivalDate || departure.departureDate || "-";
  const spansMultipleDays = arrivalDateLabel !== departureDateLabel;

  // Severity styling using design tokens
  const severityClass = hasOrangeChange
    ? "border-l-4 border-l-destructive/60"
    : hasMajorChange
    ? "border-l-4 border-l-warning"
    : "border-l-4 border-l-transparent";

  return (
    <Card className={`p-4 transition-colors hover:bg-accent/40 ${severityClass}`}>
      {/* Top row: route + line */}
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-sm font-medium text-foreground truncate">
            {departure.departureStation}
          </span>
          <span className="text-xs text-muted-foreground">→</span>
          <span className="text-sm font-medium text-foreground truncate">
            {departure.arrivalStation}
          </span>
        </div>
        <div className="flex items-baseline gap-2 shrink-0 ml-3">
          <span className="text-xs font-medium text-muted-foreground">{departure.line}</span>
          <span className="text-[11px] text-muted-foreground truncate max-w-[100px]">
            {departure.lineName}
          </span>
        </div>
      </div>

      {/* Date row */}
      <div className="text-[11px] text-muted-foreground mb-2.5">
        {departureDateLabel}
        {spansMultipleDays && <span> → {arrivalDateLabel}</span>}
        {duration !== null && (
          <span className="ml-2">· {duration} min</span>
        )}
      </div>

      {/* Time grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[280px]">
          {/* Header */}
          <div className="grid grid-cols-[52px_1fr_1fr_1fr] gap-x-2 text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
            <span />
            <span>Sched.</span>
            <span>Actual</span>
            <span>Diff</span>
          </div>

          <div className="grid grid-cols-[52px_1fr_1fr_1fr] gap-x-2 gap-y-1 items-center text-sm">
            {/* Departure row */}
            <span className="text-[11px] text-muted-foreground">Dep</span>
            <span className={`font-medium tabular-nums ${hasDepartureRealtime ? "text-muted-foreground line-through" : "text-foreground"}`}>
              {departureScheduled || "\u00A0"}
            </span>
            <span className={`font-medium tabular-nums ${
              hasDepartureRealtime
                ? departureDeltaSeconds > 0
                  ? "text-destructive"
                  : "text-success"
                : "text-transparent"
            }`}>
              {departureRealtime || "\u00A0"}
            </span>
            <span className={`font-medium tabular-nums ${
              departureDelta !== ""
                ? departureDeltaSeconds > 0
                  ? "text-destructive"
                  : "text-success"
                : "text-transparent"
            }`}>
              {departureDelta || "\u00A0"}
            </span>

            {/* Arrival row */}
            <span className="text-[11px] text-muted-foreground">Arr</span>
            <span className={`font-medium tabular-nums ${hasArrivalRealtime ? "text-muted-foreground line-through" : "text-foreground"}`}>
              {arrivalScheduled || "\u00A0"}
            </span>
            <span className={`font-medium tabular-nums ${
              hasArrivalRealtime
                ? arrivalDeltaSeconds > 0
                  ? "text-destructive"
                  : "text-success"
                : "text-transparent"
            }`}>
              {arrivalRealtime || "\u00A0"}
            </span>
            <span className={`font-medium tabular-nums ${
              arrivalDelta !== ""
                ? arrivalDeltaSeconds > 0
                  ? "text-destructive"
                  : "text-success"
                : "text-transparent"
            }`}>
              {arrivalDelta || "\u00A0"}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default DepartureCard;
