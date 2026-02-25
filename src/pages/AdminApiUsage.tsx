import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, LineChart, Line } from "recharts";
import { Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import UserMenu from "@/components/UserMenu";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const ADMIN_EMAIL = "arianfakhravar@gmail.com";
const STOCKHOLM_TIME_ZONE = "Europe/Stockholm";

type RangeOption = 7 | 30 | 90;

type ChartPoint = {
  date: string;
  calls: number;
};

type FunnelPoint = {
  stage: string;
  value: number;
};

type ByHourPoint = {
  hour: number;
  opportunities: number;
};

type ByWeekdayPoint = {
  weekday: string;
  opportunities: number;
};

type SeverityPoint = {
  bucket: string;
  opportunities: number;
};

type SourceBreakdownPoint = {
  source: "user" | "scheduled" | "collector";
  calls: number;
};

type TopRoutePoint = {
  origin: string;
  destination: string;
  searches: number;
};

type AnalyticsPayload = {
  daily_calls: Array<{ day: string; calls: number }>;
  funnel: FunnelPoint[];
  unique_impacted: {
    unique_trains: number;
    unique_stations: number;
    station_touches: number;
  };
  by_hour: ByHourPoint[];
  by_weekday: ByWeekdayPoint[];
  severity: SeverityPoint[];
  quality: {
    calls_count: number;
    total_rows: number;
    delayed_rows: number;
    avg_rows_per_call: number;
    p95_rows_per_call: number;
    claimable_per_100_calls: number;
  };
  freshness: {
    latest_fetch: string | null;
    minutes_since_last_fetch: number;
    avg_gap_minutes: number;
    max_gap_minutes: number;
  };
  source_breakdown: SourceBreakdownPoint[];
  top_user_routes: TopRoutePoint[];
};

const chartConfig = {
  calls: {
    label: "API calls",
    color: "hsl(var(--primary))",
  },
  opportunities: {
    label: "Opportunities",
    color: "hsl(339 80% 58%)",
  },
  value: {
    label: "Count",
    color: "hsl(var(--primary))",
  },
};

const formatDayLabel = (dayKey: string) => {
  const [y, m, d] = dayKey.split("-");
  if (!y || !m || !d) return dayKey;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(date.getTime())) return dayKey;
  return date.toLocaleDateString("sv-SE", { month: "short", day: "numeric" });
};

const CardHint = ({ text }: { text: string }) => (
  <span
    title={text}
    className="inline-flex cursor-help items-center text-muted-foreground/80 transition-colors hover:text-foreground"
    aria-label={text}
  >
    <Info className="h-3.5 w-3.5" />
  </span>
);

const toStockholmDayKey = (isoTimestamp: string) => {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return "";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: STOCKHOLM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
};

const AdminApiUsage = () => {
  const { user, loading } = useAuth();
  const [rangeDays, setRangeDays] = useState<RangeOption>(30);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ChartPoint[]>([]);
  const [funnel, setFunnel] = useState<FunnelPoint[]>([]);
  const [byHour, setByHour] = useState<ByHourPoint[]>([]);
  const [byWeekday, setByWeekday] = useState<ByWeekdayPoint[]>([]);
  const [severity, setSeverity] = useState<SeverityPoint[]>([]);
  const [sourceBreakdown, setSourceBreakdown] = useState<SourceBreakdownPoint[]>([]);
  const [topRoutes, setTopRoutes] = useState<TopRoutePoint[]>([]);
  const [uniqueImpacted, setUniqueImpacted] = useState({
    unique_trains: 0,
    unique_stations: 0,
    station_touches: 0,
  });
  const [quality, setQuality] = useState({
    calls_count: 0,
    total_rows: 0,
    delayed_rows: 0,
    avg_rows_per_call: 0,
    p95_rows_per_call: 0,
    claimable_per_100_calls: 0,
  });
  const [freshness, setFreshness] = useState({
    latest_fetch: null as string | null,
    minutes_since_last_fetch: 0,
    avg_gap_minutes: 0,
    max_gap_minutes: 0,
  });

  const isAdmin = (user?.email ?? "").toLowerCase() === ADMIN_EMAIL;

  useEffect(() => {
    if (!isAdmin) return;

    const loadUsage = async () => {
      setLoadingUsage(true);
      setError(null);
      try {
        const since = new Date();
        since.setDate(since.getDate() - rangeDays);

        const { data: payload, error: queryError } = await supabase.rpc("get_admin_api_analytics", {
          since_ts: since.toISOString(),
          timezone_name: STOCKHOLM_TIME_ZONE,
        });

        if (!queryError && payload) {
          const typed = payload as AnalyticsPayload;
          const chartPoints: ChartPoint[] = (typed.daily_calls ?? []).map((row) => ({
            date: formatDayLabel(row.day),
            calls: row.calls,
          }));

          setData(chartPoints);
          setFunnel(typed.funnel ?? []);
          setByHour(typed.by_hour ?? []);
          setByWeekday(typed.by_weekday ?? []);
          setSeverity(typed.severity ?? []);
          setSourceBreakdown(typed.source_breakdown ?? []);
          setTopRoutes(typed.top_user_routes ?? []);
          setUniqueImpacted(
            typed.unique_impacted ?? { unique_trains: 0, unique_stations: 0, station_touches: 0 }
          );
          setQuality(
            typed.quality ?? {
              calls_count: 0,
              total_rows: 0,
              delayed_rows: 0,
              avg_rows_per_call: 0,
              p95_rows_per_call: 0,
              claimable_per_100_calls: 0,
            }
          );
          setFreshness(
            typed.freshness ?? {
              latest_fetch: null,
              minutes_since_last_fetch: 0,
              avg_gap_minutes: 0,
              max_gap_minutes: 0,
            }
          );
        } else {
          // Fallback while migration is not yet applied.
          const { data: rows, error: fallbackError } = await supabase
            .from("departures")
            .select("fetched_at")
            .gte("fetched_at", since.toISOString())
            .order("fetched_at", { ascending: true })
            .limit(50000);
          if (fallbackError) throw fallbackError;

          const timestamps = (rows ?? [])
            .map((row) => row.fetched_at)
            .filter((value): value is string => typeof value === "string");
          const uniqueCalls = new Set(timestamps);
          const countsByDay = new Map<string, number>();
          for (const ts of uniqueCalls) {
            const dayKey = toStockholmDayKey(ts);
            if (!dayKey) continue;
            countsByDay.set(dayKey, (countsByDay.get(dayKey) ?? 0) + 1);
          }
          const sortedDays = Array.from(countsByDay.entries()).sort((a, b) => a[0].localeCompare(b[0]));
          const chartPoints: ChartPoint[] = sortedDays.map(([day, calls]) => ({
            date: formatDayLabel(day),
            calls,
          }));
          setData(chartPoints);
          setFunnel([
            { stage: "API calls", value: uniqueCalls.size },
            { stage: "Departures captured", value: timestamps.length },
            { stage: "Delayed departures", value: 0 },
            { stage: "Claim opportunities (>=20 min)", value: 0 },
          ]);
          setByHour([]);
          setByWeekday([]);
          setSeverity([]);
          setSourceBreakdown([]);
          setTopRoutes([]);
          setUniqueImpacted({ unique_trains: 0, unique_stations: 0, station_touches: 0 });
          setQuality({
            calls_count: uniqueCalls.size,
            total_rows: timestamps.length,
            delayed_rows: 0,
            avg_rows_per_call: uniqueCalls.size > 0 ? timestamps.length / uniqueCalls.size : 0,
            p95_rows_per_call: 0,
            claimable_per_100_calls: 0,
          });
          const latestFetch = timestamps.length > 0 ? timestamps[timestamps.length - 1] : null;
          const minsSince =
            latestFetch && !Number.isNaN(new Date(latestFetch).getTime())
              ? (Date.now() - new Date(latestFetch).getTime()) / 60000
              : 0;
          setFreshness({
            latest_fetch: latestFetch,
            minutes_since_last_fetch: minsSince,
            avg_gap_minutes: 0,
            max_gap_minutes: 0,
          });
          setError("Advanced analytics available after DB migration is applied.");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load API usage.";
        setError(message);
      } finally {
        setLoadingUsage(false);
      }
    };

    void loadUsage();
  }, [isAdmin, rangeDays]);

  const totals = useMemo(() => {
    const totalCalls = data.reduce((sum, point) => sum + point.calls, 0);
    const activeDays = data.length;
    const avgPerActiveDay = activeDays > 0 ? totalCalls / activeDays : 0;
    return {
      totalCalls,
      activeDays,
      avgPerActiveDay,
    };
  }, [data]);

  const latestFetchLabel = useMemo(() => {
    if (!freshness.latest_fetch) return "No data";
    const parsed = new Date(freshness.latest_fetch);
    if (Number.isNaN(parsed.getTime())) return "No data";
    return parsed.toLocaleString("sv-SE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }, [freshness.latest_fetch]);

  const sourceBreakdownChartData = useMemo(() => {
    const order: Array<SourceBreakdownPoint["source"]> = ["user", "scheduled", "collector"];
    const labels: Record<SourceBreakdownPoint["source"], string> = {
      user: "User",
      scheduled: "Scheduled",
      collector: "Collector",
    };
    return order
      .map((source) => {
        const row = sourceBreakdown.find((item) => item.source === source);
        return row ? { source: labels[source], calls: row.calls } : null;
      })
      .filter((row): row is { source: string; calls: number } => Boolean(row));
  }, [sourceBreakdown]);

  if (loading) return null;
  if (!user) return <Navigate to="/login?next=%2Fadmin%2Fapi-usage" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground/80">Admin</p>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground">API Usage</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Estimated API calls based on distinct fetch events in departures data.
            </p>
          </div>
          <UserMenu />
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <Button variant={rangeDays === 7 ? "default" : "outline"} size="sm" onClick={() => setRangeDays(7)}>
            Last 7 days
          </Button>
          <Button variant={rangeDays === 30 ? "default" : "outline"} size="sm" onClick={() => setRangeDays(30)}>
            Last 30 days
          </Button>
          <Button variant={rangeDays === 90 ? "default" : "outline"} size="sm" onClick={() => setRangeDays(90)}>
            Last 90 days
          </Button>
        </div>

        {loadingUsage && <Card className="p-4"><p className="text-sm text-muted-foreground">Loading usage data...</p></Card>}
        {!loadingUsage && error && (
          <Card className="p-4">
            <p className="text-sm text-destructive">{error}</p>
          </Card>
        )}

        {!loadingUsage && (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="!grid h-auto w-full !grid-cols-3 gap-1 p-1">
              <TabsTrigger value="overview" className="w-full">Overview</TabsTrigger>
              <TabsTrigger value="opportunities" className="w-full">Opportunities</TabsTrigger>
              <TabsTrigger value="quality" className="w-full">Quality & Health</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Card className="p-4">
                  <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                    Total calls
                    <CardHint text="Estimated number of upstream API fetch events in the selected period." />
                  </p>
                  <p className="mt-1 text-2xl font-semibold">{totals.totalCalls.toLocaleString("sv-SE")}</p>
                </Card>
                <Card className="p-4">
                  <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                    Active days
                    <CardHint text="Number of calendar days with at least one recorded API call." />
                  </p>
                  <p className="mt-1 text-2xl font-semibold">{totals.activeDays.toLocaleString("sv-SE")}</p>
                </Card>
                <Card className="p-4">
                  <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                    Avg / active day
                    <CardHint text="Average API calls per day, counting only days with activity." />
                  </p>
                  <p className="mt-1 text-2xl font-semibold">{totals.avgPerActiveDay.toFixed(1)}</p>
                </Card>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Card className="p-4">
                  <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                    Unique trains impacted
                    <CardHint text="Distinct train line IDs that had claim opportunities in the selected period." />
                  </p>
                  <p className="mt-1 text-2xl font-semibold">{uniqueImpacted.unique_trains.toLocaleString("sv-SE")}</p>
                </Card>
                <Card className="p-4">
                  <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                    Unique stations impacted
                    <CardHint text="Distinct station names involved in claim opportunities (departure or arrival)." />
                  </p>
                  <p className="mt-1 text-2xl font-semibold">{uniqueImpacted.unique_stations.toLocaleString("sv-SE")}</p>
                </Card>
                <Card className="p-4">
                  <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                    Station touches
                    <CardHint text="Departure station count plus arrival station count across claim opportunities." />
                  </p>
                  <p className="mt-1 text-2xl font-semibold">{uniqueImpacted.station_touches.toLocaleString("sv-SE")}</p>
                </Card>
              </div>

              <Card className="p-4">
                {data.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No usage found for selected period.</p>
                ) : (
                  <ChartContainer config={chartConfig} className="h-[340px] w-full">
                    <BarChart data={data}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="calls" fill="var(--color-calls)" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="opportunities" className="space-y-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="p-4">
                  <p className="mb-2 text-sm font-semibold">Claim opportunity funnel</p>
                  {funnel.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No funnel data available.</p>
                  ) : (
                    <ChartContainer config={chartConfig} className="h-[280px] w-full">
                      <BarChart data={funnel} layout="vertical" margin={{ left: 32 }}>
                        <CartesianGrid horizontal={false} />
                        <XAxis type="number" allowDecimals={false} />
                        <YAxis type="category" dataKey="stage" width={180} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="value" fill="var(--color-value)" radius={[0, 8, 8, 0]} />
                      </BarChart>
                    </ChartContainer>
                  )}
                </Card>

                <Card className="p-4">
                  <p className="mb-2 text-sm font-semibold">By hour of day</p>
                  {byHour.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No claim opportunities for selected period.</p>
                  ) : (
                    <ChartContainer config={chartConfig} className="h-[280px] w-full">
                      <LineChart data={byHour}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="hour" />
                        <YAxis allowDecimals={false} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Line type="monotone" dataKey="opportunities" stroke="var(--color-opportunities)" strokeWidth={2} dot />
                      </LineChart>
                    </ChartContainer>
                  )}
                </Card>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="p-4">
                  <p className="mb-2 text-sm font-semibold">By weekday</p>
                  {byWeekday.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No weekday data for selected period.</p>
                  ) : (
                    <ChartContainer config={chartConfig} className="h-[260px] w-full">
                      <BarChart data={byWeekday}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="weekday" />
                        <YAxis allowDecimals={false} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="opportunities" fill="var(--color-opportunities)" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ChartContainer>
                  )}
                </Card>

                <Card className="p-4">
                  <p className="mb-2 text-sm font-semibold">Delay severity distribution (claim opportunities)</p>
                  {severity.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No severity data for selected period.</p>
                  ) : (
                    <ChartContainer config={chartConfig} className="h-[260px] w-full">
                      <BarChart data={severity}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="bucket" />
                        <YAxis allowDecimals={false} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="opportunities" fill="var(--color-opportunities)" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ChartContainer>
                  )}
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="quality" className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Card className="p-4">
                  <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                    Latest ingestion
                    <CardHint text="Most recent timestamp when departures were stored in the database." />
                  </p>
                  <p className="mt-1 text-sm font-semibold">{latestFetchLabel}</p>
                </Card>
                <Card className="p-4">
                  <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                    Minutes since last fetch
                    <CardHint text="Freshness indicator: lower means collection is running recently." />
                  </p>
                  <p className="mt-1 text-2xl font-semibold">{freshness.minutes_since_last_fetch.toFixed(1)}</p>
                </Card>
                <Card className="p-4">
                  <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                    Avg / max gap (min)
                    <CardHint text="Average and largest gap between consecutive API call events." />
                  </p>
                  <p className="mt-1 text-2xl font-semibold">
                    {freshness.avg_gap_minutes.toFixed(1)} / {freshness.max_gap_minutes.toFixed(1)}
                  </p>
                </Card>
              </div>

              <Card className="p-4">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                  API quality and efficiency
                  <CardHint text="Operational metrics for how efficiently API fetches produce usable data." />
                </p>
                {sourceBreakdown.length > 0 && (
                  <div className="mb-3 rounded-lg border border-border/70 p-3 text-sm">
                    <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Requested vs scheduled calls</p>
                    <ChartContainer config={chartConfig} className="h-[190px] w-full">
                      <BarChart data={sourceBreakdownChartData}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="source" />
                        <YAxis allowDecimals={false} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="calls" fill="var(--color-calls)" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ChartContainer>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border border-border/70 p-3" title="Estimated number of unique API fetch events.">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Calls</p>
                    <p className="mt-1 text-xl font-semibold">{quality.calls_count.toLocaleString("sv-SE")}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 p-3" title="Total rows written to departures from API fetches.">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Rows captured</p>
                    <p className="mt-1 text-xl font-semibold">{quality.total_rows.toLocaleString("sv-SE")}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 p-3" title="Average number of departure rows produced per API call.">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Avg rows/call</p>
                    <p className="mt-1 text-xl font-semibold">{quality.avg_rows_per_call.toFixed(1)}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 p-3" title="95th percentile of rows captured per API call.">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">P95 rows/call</p>
                    <p className="mt-1 text-xl font-semibold">{quality.p95_rows_per_call.toFixed(1)}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 p-3" title="Rows currently marked as delayed in departures data.">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Delayed rows</p>
                    <p className="mt-1 text-xl font-semibold">{quality.delayed_rows.toLocaleString("sv-SE")}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 p-3" title="Claim opportunities generated per 100 API calls.">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Opportunities / 100 calls</p>
                    <p className="mt-1 text-xl font-semibold">{quality.claimable_per_100_calls.toFixed(1)}</p>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                  Most searched station pairs (user requests)
                  <CardHint text="Top origin/destination pairs requested directly by users." />
                </p>
                {topRoutes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No user route search data yet.</p>
                ) : (
                  <div className="space-y-2 text-sm">
                    {topRoutes.map((route, idx) => (
                      <div key={`${route.origin}-${route.destination}-${idx}`} className="flex items-center justify-between rounded-lg border border-border/70 p-2">
                        <span className="truncate">
                          {route.origin} {"->"} {route.destination}
                        </span>
                        <span className="ml-3 font-semibold">{route.searches.toLocaleString("sv-SE")}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default AdminApiUsage;

