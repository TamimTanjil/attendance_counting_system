/**
 * Mock API service handlers.
 *
 * Every function here mirrors a FastAPI endpoint one-to-one. To go live,
 * flip USE_MOCK to false (or set VITE_API_BASE_URL) — the shapes stay identical.
 * See BACKEND.md for the FastAPI wiring guide.
 */
import {
  defaultSettings,
  mockCheckIns,
  mockLogs,
  mockUsers,
  type AttendanceLog,
  type CheckIn,
  type LabUser,
  type SystemSettings,
} from "@/lib/mock-data";

export const API_BASE_URL = import.meta.env["VITE_API_BASE_URL"] ?? "";
export const USE_MOCK = !API_BASE_URL;

const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms));

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

/* ---------------------------------- state --------------------------------- */

let users = [...mockUsers];
let settings: SystemSettings = { ...defaultSettings };

/* --------------------------------- queries -------------------------------- */

export interface DashboardStats {
  totalRegistered: number;
  presentToday: number;
  absentToday: number;
  lateToday: number;
  cameraOnline: boolean;
  fps: number;
  latencyMs: number;
  modelVersion: string;
}

export async function getStats(): Promise<DashboardStats> {
  if (!USE_MOCK) return request<DashboardStats>("/api/stats/today");
  await delay(200);
  const today = mockLogs.filter((l) => l.date === "2026-09-13");
  return {
    totalRegistered: users.length,
    presentToday: today.filter((l) => l.status === "present").length,
    absentToday: today.filter((l) => l.status === "absent").length,
    lateToday: today.filter((l) => l.status === "late").length,
    cameraOnline: true,
    fps: 24,
    latencyMs: 118,
    modelVersion: "arcface-r100 · v2.3",
  };
}

export async function getUsers(): Promise<LabUser[]> {
  if (!USE_MOCK) return request<LabUser[]>("/api/users");
  await delay();
  return users;
}

export interface NewUserPayload {
  name: string;
  studentId: string;
  department: string;
  email: string;
  photoCount: number;
}

export async function createUser(payload: NewUserPayload): Promise<LabUser> {
  if (!USE_MOCK) {
    return request<LabUser>("/api/users", { method: "POST", body: JSON.stringify(payload) });
  }
  await delay(500);
  const user: LabUser = {
    id: `u_${Math.random().toString(36).slice(2, 8)}`,
    name: payload.name,
    studentId: payload.studentId,
    department: payload.department,
    email: payload.email,
    enrolledPhotos: payload.photoCount,
    active: true,
    createdAt: new Date().toISOString().slice(0, 10),
  };
  users = [user, ...users];
  return user;
}

export async function deleteUser(id: string): Promise<void> {
  if (!USE_MOCK) {
    await request<void>(`/api/users/${id}`, { method: "DELETE" });
    return;
  }
  await delay(250);
  users = users.filter((u) => u.id !== id);
}

export async function getCheckIns(): Promise<CheckIn[]> {
  if (!USE_MOCK) return request<CheckIn[]>("/api/attendance/recent");
  await delay(200);
  return mockCheckIns;
}

export interface LogFilters {
  from?: string;
  to?: string;
  status?: "all" | "present" | "late" | "absent";
  query?: string;
}

export async function getLogs(filters: LogFilters = {}): Promise<AttendanceLog[]> {
  if (!USE_MOCK) {
    const qs = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v && v !== "all") as [string, string][],
    );
    return request<AttendanceLog[]>(`/api/attendance/logs?${qs}`);
  }
  await delay(250);
  return mockLogs.filter((l) => {
    if (filters.from && l.date < filters.from) return false;
    if (filters.to && l.date > filters.to) return false;
    if (filters.status && filters.status !== "all" && l.status !== filters.status) return false;
    if (filters.query) {
      const q = filters.query.toLowerCase();
      if (!l.name.toLowerCase().includes(q) && !l.studentId.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

export async function getSettings(): Promise<SystemSettings> {
  if (!USE_MOCK) return request<SystemSettings>("/api/settings");
  await delay(200);
  return settings;
}

export async function updateSettings(next: SystemSettings): Promise<SystemSettings> {
  if (!USE_MOCK) {
    return request<SystemSettings>("/api/settings", { method: "PUT", body: JSON.stringify(next) });
  }
  await delay(400);
  settings = next;
  return settings;
}

export async function testCameraConnection(rtspUrl: string): Promise<{ ok: boolean; message: string }> {
  if (!USE_MOCK) {
    return request("/api/camera/test", { method: "POST", body: JSON.stringify({ rtspUrl }) });
  }
  await delay(900);
  const ok = rtspUrl.startsWith("rtsp://") || rtspUrl.startsWith("http");
  return {
    ok,
    message: ok ? "Stream handshake succeeded · 24 fps" : "Invalid stream URL",
  };
}

/* --------------------------------- export --------------------------------- */

export function logsToCsv(logs: AttendanceLog[]): string {
  const head = ["Date", "User ID", "Name", "Entry Time", "Exit Time", "Status"];
  const rows = logs.map((l) => [l.date, l.studentId, l.name, l.entryTime, l.exitTime ?? "—", l.status]);
  return [head, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
}
