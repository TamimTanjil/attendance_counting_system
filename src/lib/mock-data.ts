/**
 * Mock data layer for local demonstration.
 * Replace with real API responses from the FastAPI backend (see BACKEND.md).
 */

export type AttendanceStatus = "present" | "late" | "absent";

export interface LabUser {
  id: string;
  studentId: string;
  name: string;
  department: string;
  email: string;
  enrolledPhotos: number;
  active: boolean;
  createdAt: string;
}

export interface CheckIn {
  id: string;
  studentId: string;
  name: string;
  timestamp: string;
  confidence: number;
  status: AttendanceStatus;
}

export interface AttendanceLog {
  id: string;
  date: string;
  studentId: string;
  name: string;
  entryTime: string;
  exitTime: string | null;
  status: AttendanceStatus;
}

export interface SystemSettings {
  rtspUrl: string;
  confidenceThreshold: number;
  duplicateTimeoutMinutes: number;
  lateAfter: string;
  autoExitEnabled: boolean;
  notifyOnUnknownFace: boolean;
}

const DEPARTMENTS = ["CSE", "SWE", "EEE", "IT", "MCT"];

const NAMES = [
  "Tamim Tanjil",
  "Ayesha Rahman",
  "Rafiul Karim",
  "Nusrat Jahan",
  "Sabbir Hossain",
  "Mahmuda Akter",
  "Imran Chowdhury",
  "Farzana Islam",
  "Tanvir Ahmed",
  "Sadia Noor",
  "Rezaul Haque",
  "Mitu Barua",
  "Shakib Al Amin",
  "Lamia Sultana",
  "Arif Mahmud",
  "Jannatul Ferdous",
  "Rohan Das",
  "Sumaiya Binte",
  "Naimur Rashid",
  "Priya Saha",
];

export const mockUsers: LabUser[] = NAMES.map((name, i) => ({
  id: `u_${String(i + 1).padStart(3, "0")}`,
  studentId: `SWE-22-${String(101 + i)}`,
  name,
  department: DEPARTMENTS[i % DEPARTMENTS.length]!,
  email: `${name.toLowerCase().replace(/\s+/g, ".")}@lab.edu`,
  enrolledPhotos: 3 + (i % 3),
  active: i % 9 !== 0,
  createdAt: `2026-0${(i % 8) + 1}-1${i % 9}`,
}));

function timeAgo(minutes: number) {
  return new Date(Date.UTC(2026, 8, 13, 3, 30) - minutes * 60_000).toISOString();
}

export const mockCheckIns: CheckIn[] = [
  { idx: 0, min: 1, conf: 0.97, status: "present" },
  { idx: 3, min: 4, conf: 0.94, status: "present" },
  { idx: 7, min: 9, conf: 0.88, status: "late" },
  { idx: 2, min: 14, conf: 0.96, status: "present" },
  { idx: 11, min: 21, conf: 0.91, status: "present" },
  { idx: 5, min: 28, conf: 0.83, status: "late" },
  { idx: 14, min: 35, conf: 0.95, status: "present" },
  { idx: 9, min: 47, conf: 0.99, status: "present" },
].map((c, i) => ({
  id: `c_${i}`,
  studentId: mockUsers[c.idx]!.studentId,
  name: mockUsers[c.idx]!.name,
  timestamp: timeAgo(c.min),
  confidence: c.conf,
  status: c.status as AttendanceStatus,
}));

const DATES = [
  "2026-09-13",
  "2026-09-12",
  "2026-09-11",
  "2026-09-10",
  "2026-09-09",
  "2026-09-08",
  "2026-09-07",
];

export const mockLogs: AttendanceLog[] = DATES.flatMap((date, d) =>
  mockUsers.slice(0, 14).map((u, i) => {
    const seed = (d * 7 + i * 3) % 10;
    const status: AttendanceStatus = seed === 0 ? "absent" : seed < 3 ? "late" : "present";
    const entryMinute = 0 + ((i * 7) % 50);
    return {
      id: `l_${date}_${u.id}`,
      date,
      studentId: u.studentId,
      name: u.name,
      entryTime: status === "absent" ? "—" : `09:${String(entryMinute).padStart(2, "0")}`,
      exitTime: status === "absent" ? null : `1${(i % 5) + 2}:${String((i * 11) % 60).padStart(2, "0")}`,
      status,
    };
  }),
);

export const weeklyTrend = [
  { label: "Mon", present: 62, late: 9, absent: 5 },
  { label: "Tue", present: 58, late: 12, absent: 6 },
  { label: "Wed", present: 66, late: 6, absent: 4 },
  { label: "Thu", present: 61, late: 10, absent: 5 },
  { label: "Fri", present: 48, late: 14, absent: 14 },
  { label: "Sat", present: 55, late: 11, absent: 10 },
  { label: "Sun", present: 41, late: 8, absent: 27 },
];

export const monthlyTrend = Array.from({ length: 12 }, (_, i) => ({
  label: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i]!,
  rate: 72 + ((i * 13) % 23),
}));

export const hourlyFlow = [
  { label: "08:00", entries: 4 },
  { label: "09:00", entries: 27 },
  { label: "10:00", entries: 14 },
  { label: "11:00", entries: 9 },
  { label: "12:00", entries: 5 },
  { label: "13:00", entries: 11 },
  { label: "14:00", entries: 18 },
  { label: "15:00", entries: 7 },
  { label: "16:00", entries: 3 },
];

export const departmentSplit = DEPARTMENTS.map((d, i) => ({
  label: d,
  value: 12 + ((i * 9) % 17),
}));

export const defaultSettings: SystemSettings = {
  rtspUrl: "rtsp://192.168.0.42:554/lab-entrance/main",
  confidenceThreshold: 0.78,
  duplicateTimeoutMinutes: 15,
  lateAfter: "09:15",
  autoExitEnabled: true,
  notifyOnUnknownFace: true,
};

export const mockDetections = [
  { id: "d1", name: "Ayesha Rahman", confidence: 0.96, x: 14, y: 22, w: 20, h: 34, known: true },
  { id: "d2", name: "Tanvir Ahmed", confidence: 0.89, x: 44, y: 30, w: 18, h: 30, known: true },
  { id: "d3", name: "Unknown", confidence: 0.42, x: 71, y: 26, w: 17, h: 30, known: false },
];
