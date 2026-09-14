import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { QrCode, ScanLine, SquareX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkInByBadge } from "@/services/api";
import type { CheckIn } from "@/lib/mock-data";

/**
 * QR badge check-in. Uses the device camera to decode a student badge and
 * records the check-in on the backend; manual entry is the fallback.
 */
export function BadgeScanner() {
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState("");
  const [last, setLast] = useState<CheckIn | null>(null);
  const busy = useRef(false);

  useEffect(() => () => stopRef.current?.(), []);

  async function record(badgeId: string) {
    if (!badgeId.trim() || busy.current) return;
    busy.current = true;
    try {
      const checkIn = await checkInByBadge(badgeId);
      setLast(checkIn);
      queryClient.setQueryData<CheckIn[]>(["checkins"], (prev) =>
        [checkIn, ...(prev ?? [])].slice(0, 25),
      );
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast.success(`${checkIn.name} checked in via badge.`);
      setManual("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Badge not recognized.");
    } finally {
      setTimeout(() => (busy.current = false), 1500);
    }
  }

  async function startScan() {
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader();
      setScanning(true);
      const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
        if (result) void record(result.getText());
      });
      stopRef.current = () => {
        controls.stop();
        setScanning(false);
      };
    } catch {
      setScanning(false);
      toast.error("Camera unavailable — use manual badge entry.");
    }
  }

  return (
    <section className="glass-panel rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <QrCode className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">QR badge check-in</h2>
        </div>
        {scanning ? (
          <Button size="sm" variant="ghost" onClick={() => stopRef.current?.()}>
            <SquareX className="size-4" /> Stop
          </Button>
        ) : (
          <Button size="sm" onClick={startScan}>
            <ScanLine className="size-4" /> Scan badge
          </Button>
        )}
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-border bg-muted/20">
        <video
          ref={videoRef}
          className={scanning ? "aspect-video w-full object-cover" : "hidden"}
          muted
          playsInline
        />
        {!scanning && (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            Hold a student badge in front of the camera, or type the badge ID below.
          </p>
        )}
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void record(manual);
        }}
      >
        <Input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="SWE-22-101"
          className="font-mono"
        />
        <Button type="submit" variant="secondary">
          Check in
        </Button>
      </form>

      {last && (
        <p className="mt-3 text-xs text-primary">
          Last badge: <span className="font-mono">{last.studentId}</span> · {last.name}
        </p>
      )}
    </section>
  );
}
