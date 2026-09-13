import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, UserCheck, UserMinus, Users } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { LiveCamera } from "@/components/dashboard/LiveCamera";
import { RecentCheckIns } from "@/components/dashboard/RecentCheckIns";
import { getCheckIns, getSettings, getStats } from "@/services/api";
import { hourlyFlow } from "@/lib/mock-data";
import { AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Live Overview — LabSense Attendance AI" },
      {
        name: "description",
        content:
          "Real-time face-recognition attendance dashboard for the software lab: live camera stream, detections and today's presence stats.",
      },
      { property: "og:title", content: "Live Overview — LabSense Attendance AI" },
      {
        property: "og:description",
        content: "Real-time attendance monitoring for the software laboratory.",
      },
    ],
  }),
  component: Overview,
});

function Overview() {
  const stats = useQuery({ queryKey: ["stats"], queryFn: getStats, refetchInterval: 15_000 });
  const checkIns = useQuery({ queryKey: ["checkins"], queryFn: getCheckIns, refetchInterval: 15_000 });
  const settings = useQuery({ queryKey: ["settings"], queryFn: getSettings });

  const s = stats.data;

  return (
    <DashboardLayout
      title="Live Overview"
      subtitle="Software Lab 01 · Sunday, 13 September 2026"
      actions={
        <span className="glass-panel flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-primary">
          <span className="live-dot size-2 rounded-full bg-primary" /> Recognition running
        </span>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total registered" value={s?.totalRegistered ?? 0} hint="Active face profiles" icon={Users} tone="info" loading={stats.isLoading} />
        <StatCard label="Present today" value={s?.presentToday ?? 0} hint={`${s?.lateToday ?? 0} marked late`} icon={UserCheck} tone="primary" loading={stats.isLoading} />
        <StatCard label="Absent today" value={s?.absentToday ?? 0} hint="No entry detected" icon={UserMinus} tone="destructive" loading={stats.isLoading} />
        <StatCard
          label="System health"
          value={s?.cameraOnline ? "Healthy" : "Offline"}
          hint={`${s?.fps ?? 0} fps · ${s?.latencyMs ?? 0} ms · ${s?.modelVersion ?? ""}`}
          icon={Activity}
          tone={s?.cameraOnline ? "primary" : "destructive"}
          loading={stats.isLoading}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <LiveCamera threshold={settings.data?.confidenceThreshold ?? 0.78} />
        <RecentCheckIns items={checkIns.data ?? []} loading={checkIns.isLoading} />
      </div>

      <section className="glass-panel mt-4 rounded-2xl p-5">
        <h2 className="text-sm font-semibold">Entry flow today</h2>
        <p className="text-xs text-muted-foreground">Detections accepted per hour</p>
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={hourlyFlow}>
              <defs>
                <linearGradient id="flow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} width={28} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                  color: "var(--color-popover-foreground)",
                }}
              />
              <Area type="monotone" dataKey="entries" stroke="var(--color-primary)" strokeWidth={2} fill="url(#flow)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
    </DashboardLayout>
  );
}
