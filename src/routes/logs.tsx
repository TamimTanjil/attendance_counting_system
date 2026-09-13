import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Search } from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getLogs, logsToCsv, type LogFilters } from "@/services/api";
import { monthlyTrend, weeklyTrend } from "@/lib/mock-data";

export const Route = createFileRoute("/logs")({
  head: () => ({
    meta: [
      { title: "Attendance Logs & Analytics — LabSense" },
      {
        name: "description",
        content:
          "Filter lab attendance logs by date and status, review weekly and monthly trends, and export records to CSV or PDF.",
      },
      { property: "og:title", content: "Attendance Logs & Analytics — LabSense" },
      { property: "og:description", content: "Detailed attendance records, trends and exports." },
    ],
  }),
  component: LogsPage,
});

const chartAxis = {
  stroke: "var(--color-muted-foreground)",
  fontSize: 12,
  tickLine: false,
  axisLine: false,
} as const;

const tooltipStyle = {
  background: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  color: "var(--color-popover-foreground)",
};

function LogsPage() {
  const [filters, setFilters] = useState<LogFilters>({
    from: "2026-09-07",
    to: "2026-09-13",
    status: "all",
    query: "",
  });

  const logs = useQuery({ queryKey: ["logs", filters], queryFn: () => getLogs(filters) });
  const rows = logs.data ?? [];

  function exportCsv() {
    const blob = new Blob([logsToCsv(rows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance_${filters.from}_${filters.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} records to CSV.`);
  }

  function exportPdf() {
    const win = window.open("", "_blank");
    if (!win) return toast.error("Allow pop-ups to export PDF.");
    win.document.write(`<html><head><title>Attendance ${filters.from} — ${filters.to}</title>
      <style>body{font-family:system-ui;padding:24px;color:#111}h1{font-size:18px}
      table{width:100%;border-collapse:collapse;font-size:12px;margin-top:16px}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f3f4f6}</style></head><body>
      <h1>Software Lab — Attendance report (${filters.from} to ${filters.to})</h1>
      <table><thead><tr><th>Date</th><th>User ID</th><th>Name</th><th>Entry</th><th>Exit</th><th>Status</th></tr></thead><tbody>
      ${rows
        .map(
          (l) =>
            `<tr><td>${l.date}</td><td>${l.studentId}</td><td>${l.name}</td><td>${l.entryTime}</td><td>${l.exitTime ?? "—"}</td><td>${l.status}</td></tr>`,
        )
        .join("")}
      </tbody></table></body></html>`);
    win.document.close();
    win.print();
  }

  return (
    <DashboardLayout
      title="Attendance Logs & Analytics"
      subtitle={`${rows.length} records in range`}
      actions={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportCsv}>
            <Download className="size-4" /> CSV
          </Button>
          <Button variant="secondary" onClick={exportPdf}>
            <FileText className="size-4" /> PDF
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="glass-panel rounded-2xl p-5">
          <h2 className="text-sm font-semibold">Weekly attendance breakdown</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyTrend}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="label" {...chartAxis} />
                <YAxis {...chartAxis} width={28} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-accent)", opacity: 0.3 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="present" stackId="a" fill="var(--color-chart-1)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="late" stackId="a" fill="var(--color-chart-3)" />
                <Bar dataKey="absent" stackId="a" fill="var(--color-chart-4)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="glass-panel rounded-2xl p-5">
          <h2 className="text-sm font-semibold">Monthly attendance rate (%)</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrend}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="label" {...chartAxis} />
                <YAxis domain={[50, 100]} {...chartAxis} width={32} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="rate" stroke="var(--color-chart-2)" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="glass-panel mt-4 rounded-2xl">
        <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1.5">
            <Label htmlFor="from" className="text-xs text-muted-foreground">From</Label>
            <Input id="from" type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="to" className="text-xs text-muted-foreground">To</Label>
            <Input id="to" type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select
              value={filters.status}
              onValueChange={(v) => setFilters((f) => ({ ...f, status: v as LogFilters["status"] }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="present">Present</SelectItem>
                <SelectItem value="late">Late</SelectItem>
                <SelectItem value="absent">Absent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="q" className="text-xs text-muted-foreground">Search</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="q" className="pl-9" placeholder="Name or ID" value={filters.query} onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))} />
            </div>
          </div>
        </div>

        <div className="max-h-[520px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card/95 backdrop-blur">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>User ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Entry</TableHead>
                <TableHead>Exit</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Loading logs…</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No records for these filters.</TableCell>
                </TableRow>
              ) : (
                rows.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">{l.date}</TableCell>
                    <TableCell className="font-mono text-xs">{l.studentId}</TableCell>
                    <TableCell className="text-sm">{l.name}</TableCell>
                    <TableCell className="font-mono text-xs">{l.entryTime}</TableCell>
                    <TableCell className="font-mono text-xs">{l.exitTime ?? "—"}</TableCell>
                    <TableCell><StatusBadge status={l.status} /></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </DashboardLayout>
  );
}
