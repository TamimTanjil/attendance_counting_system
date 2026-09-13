import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatTone = "primary" | "warning" | "destructive" | "info";

const TONES: Record<StatTone, { text: string; bg: string; ring: string }> = {
  primary: { text: "text-primary", bg: "bg-primary/12", ring: "ring-primary/20" },
  warning: { text: "text-warning", bg: "bg-warning/12", ring: "ring-warning/20" },
  destructive: { text: "text-destructive", bg: "bg-destructive/12", ring: "ring-destructive/20" },
  info: { text: "text-info", bg: "bg-info/12", ring: "ring-info/20" },
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "primary",
  loading,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: StatTone;
  loading?: boolean;
}) {
  const t = TONES[tone];
  return (
    <div className="glass-panel rounded-2xl p-5 transition-transform hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className={cn("mt-2 font-display text-3xl font-semibold", loading && "opacity-40")}>
            {loading ? "—" : value}
          </p>
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <span className={cn("flex size-10 items-center justify-center rounded-xl ring-1", t.bg, t.text, t.ring)}>
          <Icon className="size-5" />
        </span>
      </div>
    </div>
  );
}
