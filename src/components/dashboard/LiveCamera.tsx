import { useEffect, useState } from "react";
import { Camera, ShieldAlert, Wifi } from "lucide-react";
import { mockDetections } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export function LiveCamera({ threshold = 0.78 }: { threshold?: number }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2400);
    return () => clearInterval(id);
  }, []);

  const detections = mockDetections.map((d, i) => ({
    ...d,
    x: d.x + Math.sin((tick + i) * 0.9) * 2.2,
    y: d.y + Math.cos((tick + i) * 0.7) * 1.6,
    confidence: Math.min(0.99, Math.max(0.35, d.confidence + Math.sin(tick + i) * 0.02)),
  }));

  const alert = detections.find((d) => !d.known || d.confidence < threshold);

  return (
    <section className="glass-panel overflow-hidden rounded-2xl">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <Camera className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Lab Entrance · Camera 01</h2>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5 text-primary">
            <span className="live-dot size-2 rounded-full bg-primary" /> LIVE
          </span>
          <span className="flex items-center gap-1.5">
            <Wifi className="size-3.5" /> 24 fps · 118 ms
          </span>
        </div>
      </header>

      <div className="scan-line relative aspect-video w-full bg-[radial-gradient(circle_at_50%_40%,var(--color-accent),var(--color-background))]">
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(var(--color-border)_1px,transparent_1px),linear-gradient(90deg,var(--color-border)_1px,transparent_1px)] [background-size:48px_48px]" />

        {detections.map((d) => {
          const recognized = d.known && d.confidence >= threshold;
          return (
            <div
              key={d.id}
              className={cn(
                "absolute rounded-md border-2 transition-all duration-1000 ease-out",
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
          rtsp://192.168.0.42:554/lab-entrance · faces: {detections.length}
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
