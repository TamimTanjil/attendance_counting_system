import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DETECTIONS_WS_URL, USE_MOCK } from "@/services/api";
import { mockDetections, type CheckIn } from "@/lib/mock-data";

export interface Detection {
  id: string;
  name: string;
  confidence: number;
  x: number;
  y: number;
  w: number;
  h: number;
  known: boolean;
}

interface DetectionFrame {
  detections: Detection[];
  checkIn?: CheckIn;
}

/**
 * Live detections from the backend WebSocket (`/ws/detections`).
 * Each frame refreshes the overlay and, when it carries a check-in,
 * pushes it straight into the recent feed and stat cards.
 * Without a backend configured it animates the mock boxes instead.
 */
export function useLiveDetections() {
  const queryClient = useQueryClient();
  const [detections, setDetections] = useState<Detection[]>(mockDetections);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  // Mock fallback: gently drift the boxes so the demo stays alive.
  useEffect(() => {
    if (!USE_MOCK) return;
    let tick = 0;
    const id = setInterval(() => {
      tick += 1;
      setDetections(
        mockDetections.map((d, i) => ({
          ...d,
          x: d.x + Math.sin((tick + i) * 0.9) * 2.2,
          y: d.y + Math.cos((tick + i) * 0.7) * 1.6,
          confidence: Math.min(0.99, Math.max(0.35, d.confidence + Math.sin(tick + i) * 0.02)),
        })),
      );
    }, 2400);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (USE_MOCK || !DETECTIONS_WS_URL) return;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const open = () => {
      if (closed) return;
      const ws = new WebSocket(DETECTIONS_WS_URL);
      socketRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onmessage = (event) => {
        try {
          const frame = JSON.parse(event.data as string) as DetectionFrame;
          setDetections(frame.detections ?? []);
          if (frame.checkIn) {
            const checkIn = frame.checkIn;
            queryClient.setQueryData<CheckIn[]>(["checkins"], (prev) =>
              [checkIn, ...(prev ?? []).filter((c) => c.id !== checkIn.id)].slice(0, 25),
            );
            void queryClient.invalidateQueries({ queryKey: ["stats"] });
          }
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(open, 3000);
      };
      ws.onerror = () => ws.close();
    };

    open();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      socketRef.current?.close();
    };
  }, [queryClient]);

  return { detections, connected, live: !USE_MOCK };
}
