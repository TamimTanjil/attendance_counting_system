import type { AttendanceStatus } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const MAP: Record<AttendanceStatus, string> = {
  present: "bg-primary/15 text-primary ring-primary/25",
  late: "bg-warning/15 text-warning ring-warning/25",
  absent: "bg-destructive/15 text-destructive ring-destructive/25",
};

export function StatusBadge({ status }: { status: AttendanceStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1",
        MAP[status],
      )}
    >
      {status}
    </span>
  );
}
