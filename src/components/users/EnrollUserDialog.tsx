import { useState } from "react";
import { Camera, Plus, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { enrollUser } from "@/services/api";

const ANGLES = ["Front", "Left 30°", "Right 30°", "Up", "Down"];

export function EnrollUserDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ name: "", studentId: "", department: "CSE", email: "" });

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function pickPhoto(angle: string, file?: File) {
    if (!file) return;
    setPhotos((p) => ({ ...p, [angle]: URL.createObjectURL(file) }));
  }

  async function submit() {
    if (!form.name || !form.studentId || !form.email) {
      toast.error("Name, student ID and email are required.");
      return;
    }
    if (Object.keys(photos).length < 2) {
      toast.error("Upload at least 2 angles for a reliable face embedding.");
      return;
    }
    setSaving(true);
    try {
      await createUser({ ...form, photoCount: Object.keys(photos).length });
      toast.success(`${form.name} enrolled — embeddings queued for training.`);
      setForm({ name: "", studentId: "", department: "CSE", email: "" });
      setPhotos({});
      setOpen(false);
      onCreated();
    } catch {
      toast.error("Enrollment failed. Check the backend connection.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Enroll student
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enroll new student</DialogTitle>
          <DialogDescription>
            Multi-angle photos improve recognition accuracy in varied lab lighting.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="Ayesha Rahman" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="sid">Student ID</Label>
              <Input id="sid" value={form.studentId} onChange={(e) => set("studentId")(e.target.value)} placeholder="SWE-22-140" />
            </div>
            <div className="grid gap-2">
              <Label>Department</Label>
              <Select value={form.department} onValueChange={set("department")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["CSE", "SWE", "EEE", "IT", "MCT"].map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} placeholder="ayesha@lab.edu" />
          </div>

          <div className="grid gap-2">
            <Label>Face photos ({Object.keys(photos).length}/5)</Label>
            <div className="grid grid-cols-5 gap-2">
              {ANGLES.map((angle) => (
                <label
                  key={angle}
                  className="group relative flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border border-dashed border-border bg-muted/30 text-center text-[10px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                >
                  {photos[angle] ? (
                    <>
                      <img src={photos[angle]} alt={angle} className="absolute inset-0 size-full object-cover" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setPhotos(({ [angle]: _, ...rest }) => rest);
                        }}
                        className="absolute right-1 top-1 rounded-full bg-background/80 p-0.5"
                      >
                        <X className="size-3" />
                      </button>
                    </>
                  ) : (
                    <>
                      <Camera className="size-4" />
                      {angle}
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => pickPhoto(angle, e.target.files?.[0])}
                  />
                </label>
              ))}
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Upload className="size-3" /> JPG or PNG, face clearly visible, min 2 angles.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Enrolling…" : "Enroll student"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
