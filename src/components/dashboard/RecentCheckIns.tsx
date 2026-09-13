import type { CheckIn } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("");
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function RecentCheckIns({ items, loading }: { items: CheckIn[]; loading?: boolean }) {
  return (
    <section className="glass-panel flex h-full flex-col rounded-2xl">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold">Recent check-ins</h2>
        <span className="text-xs text-muted-foreground">{items.length} today</span>
      </header>
      <ul className="flex-1 divide-y divide-border overflow-y-auto">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="h-16 animate-pulse bg-muted/30" />
            ))
          : items.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 font-mono text-xs font-semibold text-primary">
                  {initials(c.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {c.studentId} · {formatTime(c.timestamp)}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-1 font-mono text-xs font-semibold",
                    c.confidence >= 0.9
                      ? "bg-primary/15 text-primary"
                      : c.confidence >= 0.8
                        ? "bg-warning/15 text-warning"
                        : "bg-destructive/15 text-destructive",
                  )}
                >
                  {(c.confidence * 100).toFixed(0)}%
                </span>
              </li>
            ))}
      </ul>
    </section>
  );
}
