import { Camera, ShieldAlert, Wifi } from "lucide-react";
import { useLiveDetections } from "@/hooks/useLiveDetections";
import { CAMERA_STREAM_URL } from "@/services/api";
import { cn } from "@/lib/utils";

export function LiveCamera({
  threshold = 0.78,
  rtspUrl,
  fps,
  latencyMs,
}: {
  threshold?: number;
  rtspUrl?: string;
  fps?: number;
  latencyMs?: number;
}) {
  const { detections, connected, live } = useLiveDetections();

  const alert = detections.find((d) => !d.known || d.confidence < threshold);

  return (
    <section className="glass-panel overflow-hidden rounded-2xl">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <Camera className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Lab Entrance · Camera 01</h2>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className={cn("flex items-center gap-1.5", live && !connected ? "text-warning" : "text-primary")}>
            <span
              className={cn(
                "live-dot size-2 rounded-full",
                live && !connected ? "bg-warning" : "bg-primary",
              )}
            />
            {live ? (connected ? "LIVE" : "RECONNECTING") : "DEMO"}
          </span>
          <span className="flex items-center gap-1.5">
            <Wifi className="size-3.5" /> {fps ?? 24} fps · {latencyMs ?? 118} ms
          </span>
        </div>
      </header>

      <div className="scan-line relative aspect-video w-full bg-[radial-gradient(circle_at_50%_40%,var(--color-accent),var(--color-background))]">
        {CAMERA_STREAM_URL ? (
          <img
            src={CAMERA_STREAM_URL}
            alt="Live camera stream of the lab entrance"
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(var(--color-border)_1px,transparent_1px),linear-gradient(90deg,var(--color-border)_1px,transparent_1px)] [background-size:48px_48px]" />
        )}

        {detections.map((d) => {
          const recognized = d.known && d.confidence >= threshold;
          return (
            <div
              key={d.id}
              className={cn(
                "absolute rounded-md border-2 transition-all duration-500 ease-out",
                recognized ? "border-primary shadow-[0_0_24px_-4px_var(--color-primary)]" : "border-destructive",
              )}
              style={{ left: `${d.x}%`, top: `${d.y}%`, width: `${d.w}%`, height: `${d.h}%` }}
            >
              <span
                className={cn(
                  "absolute -top-6 left-0 whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[11px] font-medium",
                  recognized ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground",
                )}
              >
                {recognized ? d.name : "UNKNOWN"} · {(d.confidence * 100).toFixed(0)}%
              </span>
            </div>
          );
        })}

        <div className="absolute bottom-3 left-3 rounded-md bg-background/70 px-2 py-1 font-mono text-[11px] text-muted-foreground backdrop-blur">
          {rtspUrl ?? "rtsp://192.168.0.42:554/lab-entrance"} · faces: {detections.length}
        </div>
      </div>

      {alert ? (
        <div className="flex items-center gap-2 border-t border-border bg-destructive/10 px-5 py-3 text-sm text-destructive">
          <ShieldAlert className="size-4 shrink-0" />
          Unrecognized face detected — below {(threshold * 100).toFixed(0)}% confidence. Logged for review.
        </div>
      ) : (
        <div className="border-t border-border px-5 py-3 text-sm text-primary">
          All faces in frame matched above threshold.
        </div>
      )}
    </section>
  );
}
