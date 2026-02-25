import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import UserMenu from "@/components/UserMenu";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const ADMIN_EMAIL = "arianfakhravar@gmail.com";

type RangeOption = 7 | 30 | 90;

type ChartPoint = {
  date: string;
  calls: number;
};

const chartConfig = {
  calls: {
    label: "API calls",
    color: "hsl(var(--primary))",
  },
};

const toDayKey = (isoTimestamp: string) => {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const formatDayLabel = (dayKey: string) => {
  const date = new Date(`${dayKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dayKey;
  return date.toLocaleDateString("sv-SE", { month: "short", day: "numeric" });
};

const AdminApiUsage = () => {
  const { user, loading } = useAuth();
  const [rangeDays, setRangeDays] = useState<RangeOption>(30);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ChartPoint[]>([]);

  const isAdmin = (user?.email ?? "").toLowerCase() === ADMIN_EMAIL;

  useEffect(() => {
    if (!isAdmin) return;

    const loadUsage = async () => {
      setLoadingUsage(true);
      setError(null);
      try {
        const since = new Date();
        since.setDate(since.getDate() - rangeDays);

        const { data: rows, error: queryError } = await supabase
          .from("departures")
          .select("fetched_at")
          .gte("fetched_at", since.toISOString())
          .order("fetched_at", { ascending: true });

        if (queryError) throw queryError;

        const timestamps = (rows ?? [])
          .map((row) => row.fetched_at)
          .filter((value): value is string => typeof value === "string");

        // Each API call writes multiple departures; dedupe by fetched_at timestamp.
        const uniqueCalls = new Set(timestamps);
        const countsByDay = new Map<string, number>();
        for (const ts of uniqueCalls) {
          const dayKey = toDayKey(ts);
          if (!dayKey) continue;
          countsByDay.set(dayKey, (countsByDay.get(dayKey) ?? 0) + 1);
        }

        const sortedDays = Array.from(countsByDay.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        const chartPoints: ChartPoint[] = sortedDays.map(([day, calls]) => ({
          date: formatDayLabel(day),
          calls,
        }));

        setData(chartPoints);
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

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total calls</p>
            <p className="mt-1 text-2xl font-semibold">{totals.totalCalls.toLocaleString("sv-SE")}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Active days</p>
            <p className="mt-1 text-2xl font-semibold">{totals.activeDays.toLocaleString("sv-SE")}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Avg / active day</p>
            <p className="mt-1 text-2xl font-semibold">{totals.avgPerActiveDay.toFixed(1)}</p>
          </Card>
        </div>

        <Card className="p-4">
          {loadingUsage ? (
            <p className="text-sm text-muted-foreground">Loading usage data...</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : data.length === 0 ? (
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
      </div>
    </div>
  );
};

export default AdminApiUsage;

