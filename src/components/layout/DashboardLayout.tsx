import { Link } from "@tanstack/react-router";
import { Activity, BarChart3, Cpu, LayoutDashboard, Settings, Users } from "lucide-react";
import type { ReactNode } from "react";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/users", label: "Students", icon: Users },
  { to: "/logs", label: "Logs & Analytics", icon: BarChart3 },
  { to: "/settings", label: "System", icon: Settings },
] as const;

export function DashboardLayout({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="glass-panel sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-8 p-5 md:flex">
        <div className="flex items-center gap-3">
          <div className="glow-ring flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Cpu className="size-5" />
          </div>
          <div>
            <p className="font-display text-sm font-semibold leading-tight">LabSense</p>
            <p className="text-xs text-muted-foreground">Attendance AI</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              activeProps={{
                className: "bg-primary/12 text-primary border-primary/25",
              }}
              inactiveProps={{
                className: "text-muted-foreground border-transparent hover:bg-accent/50",
              }}
              className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors"
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto rounded-xl border border-border bg-card/60 p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-primary">
            <span className="live-dot size-2 rounded-full bg-primary" />
            Edge node online
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Lab-01 · GPU inference 24 fps · queue empty
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass-panel sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">{title}</h1>
            {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          <div className="flex items-center gap-3">{actions}</div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-border px-4 py-2 md:hidden">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              activeProps={{ className: "bg-primary/12 text-primary" }}
              inactiveProps={{ className: "text-muted-foreground" }}
              className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium"
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>

        <main className="flex-1 p-4 md:p-6">{children}</main>

        <footer className="flex items-center gap-2 px-6 py-4 text-xs text-muted-foreground">
          <Activity className="size-3.5" />
          Mock data mode — connect the FastAPI backend via VITE_API_BASE_URL (see BACKEND.md)
        </footer>
      </div>
    </div>
  );
}
