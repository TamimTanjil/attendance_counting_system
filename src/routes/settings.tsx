import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, Plug, SlidersHorizontal, Video } from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { defaultSettings, type SystemSettings } from "@/lib/mock-data";
import { getSettings, testCameraConnection, updateSettings } from "@/services/api";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "System Settings — LabSense Attendance AI" },
      {
        name: "description",
        content:
          "Configure the lab camera RTSP stream, recognition confidence threshold and anti-duplicate check-in timeout.",
      },
      { property: "og:title", content: "System Settings — LabSense" },
      { property: "og:description", content: "Camera, recognition and scheduling configuration." },
    ],
  }),
  component: SettingsPage,
});

function Panel({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Video;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-panel rounded-2xl p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/12 text-primary">
          <Icon className="size-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-5">{children}</div>
    </section>
  );
}

function SettingsPage() {
  const query = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const [form, setForm] = useState<SystemSettings>(defaultSettings);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (query.data) setForm(query.data);
  }, [query.data]);

  const set = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    setSaving(true);
    try {
      await updateSettings(form);
      toast.success("Settings applied — recognition worker reloaded.");
    } catch {
      toast.error("Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function testStream() {
    setTesting(true);
    const res = await testCameraConnection(form.rtspUrl);
    res.ok ? toast.success(res.message) : toast.error(res.message);
    setTesting(false);
  }

  return (
    <DashboardLayout
      title="System Settings"
      subtitle="Camera, recognition and attendance rules"
      actions={
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel icon={Video} title="Camera source" description="RTSP or HTTP stream consumed by the inference worker.">
          <div className="grid gap-2">
            <Label htmlFor="rtsp">Stream URL</Label>
            <div className="flex gap-2">
              <Input id="rtsp" value={form.rtspUrl} onChange={(e) => set("rtspUrl", e.target.value)} className="font-mono text-xs" />
              <Button variant="secondary" onClick={testStream} disabled={testing}>
                <Plug className="size-4" /> {testing ? "Testing…" : "Test"}
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Auto exit detection</p>
              <p className="text-xs text-muted-foreground">Close the session when a student leaves the frame zone.</p>
            </div>
            <Switch checked={form.autoExitEnabled} onCheckedChange={(v) => set("autoExitEnabled", v)} />
          </div>
        </Panel>

        <Panel icon={SlidersHorizontal} title="Recognition" description="Tune the accuracy / strictness balance of the face matcher.">
          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <Label>Confidence threshold</Label>
              <span className="rounded-md bg-primary/12 px-2 py-0.5 font-mono text-sm text-primary">
                {form.confidenceThreshold.toFixed(2)}
              </span>
            </div>
            <Slider
              min={0.5}
              max={0.95}
              step={0.01}
              value={[form.confidenceThreshold]}
              onValueChange={([v]) => set("confidenceThreshold", v ?? form.confidenceThreshold)}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0.50 · permissive</span>
              <span>0.95 · strict</span>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Alert on unknown face</p>
              <p className="text-xs text-muted-foreground">Raise a dashboard alert and store the crop for review.</p>
            </div>
            <Switch checked={form.notifyOnUnknownFace} onCheckedChange={(v) => set("notifyOnUnknownFace", v)} />
          </div>
        </Panel>

        <Panel icon={Clock} title="Attendance rules" description="Duplicate suppression and lateness policy.">
          <div className="grid gap-2">
            <Label htmlFor="dup">Anti-duplicate timeout (minutes)</Label>
            <Input
              id="dup"
              type="number"
              min={1}
              max={240}
              value={form.duplicateTimeoutMinutes}
              onChange={(e) => set("duplicateTimeoutMinutes", Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              The same student will not be counted again within this window.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="late">Mark late after</Label>
            <Input id="late" type="time" value={form.lateAfter} onChange={(e) => set("lateAfter", e.target.value)} />
          </div>
        </Panel>

        <Panel icon={Plug} title="Backend connection" description="Where the dashboard reads and writes data.">
          <div className="rounded-lg border border-border bg-muted/30 p-4 font-mono text-xs leading-relaxed text-muted-foreground">
            VITE_API_BASE_URL = http://localhost:8000
            <br />
            mode = {import.meta.env["VITE_API_BASE_URL"] ? "live FastAPI" : "mock data"}
          </div>
          <p className="text-xs text-muted-foreground">
            Set the variable and every service handler switches from mock JSON to the FastAPI endpoints. Full wiring
            steps live in BACKEND.md.
          </p>
        </Panel>
      </div>
    </DashboardLayout>
  );
}
