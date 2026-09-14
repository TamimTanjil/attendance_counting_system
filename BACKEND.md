# Connecting the dashboard to a Python FastAPI backend

The frontend talks to the backend through a single module: `src/services/api.ts`.
Every function there already has the exact request/response shape the UI expects, so
wiring the real backend is a configuration change, not a rewrite.

## Step 1 — Point the dashboard at your API

Create `.env` in the project root:

```
VITE_API_BASE_URL=http://localhost:8000
```

`USE_MOCK` in `src/services/api.ts` flips to `false` automatically and all handlers
switch from mock JSON to `fetch()` calls.

## Step 2 — Implement these endpoints in FastAPI

| Method | Path                      | Returns / accepts                                                                 |
| ------ | ------------------------- | --------------------------------------------------------------------------------- |
| GET    | `/api/stats/today`        | `{ totalRegistered, presentToday, absentToday, lateToday, cameraOnline, fps, latencyMs, modelVersion }` |
| GET    | `/api/users`              | `LabUser[]`                                                                         |
| POST   | `/api/users`              | body `{ name, studentId, department, email, photoCount }` → `LabUser`               |
| DELETE | `/api/users/{id}`         | `204`                                                                               |
| GET    | `/api/attendance/recent`  | `CheckIn[]`                                                                         |
| GET    | `/api/attendance/logs`    | query `from,to,status,query` → `AttendanceLog[]`                                    |
| GET    | `/api/settings`           | `SystemSettings`                                                                    |
| PUT    | `/api/settings`           | body `SystemSettings` → `SystemSettings`                                            |
| POST   | `/api/camera/test`        | body `{ rtspUrl }` → `{ ok, message }`                                              |
| POST   | `/api/attendance/badge`   | body `{ badgeId }` → `CheckIn` (QR badge check-in; 404 when unknown)                |
| GET    | `/api/camera/stream`      | MJPEG (`multipart/x-mixed-replace`) — rendered directly in the dashboard            |
| WS     | `/ws/detections`          | pushes `{ detections: Detection[], checkIn?: CheckIn }` per frame                   |

`Detection` is `{ id, name, confidence, x, y, w, h, known }` with `x/y/w/h` as
percentages of the frame, so boxes line up over the MJPEG image.

Enrollment (`POST /api/users`) is sent as `multipart/form-data` when
`VITE_API_BASE_URL` is set: text fields `name`, `studentId`, `department`,
`email`, an `angles` JSON array, and one `photos` file part per angle.

Types live in `src/lib/mock-data.ts` — mirror them with Pydantic models.

```python
# main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "https://your-app.lovable.app"],
    allow_methods=["*"], allow_headers=["*"],
)

class SystemSettings(BaseModel):
    rtspUrl: str
    confidenceThreshold: float
    duplicateTimeoutMinutes: int
    lateAfter: str
    autoExitEnabled: bool
    notifyOnUnknownFace: bool

@app.get("/api/stats/today")
def stats_today():
    ...
```

Use camelCase field names (or `alias_generator=to_camel` with
`populate_by_name=True`) so no mapping layer is needed on the client.

## Step 3 — Replace the mock camera view with the real stream

`src/components/dashboard/LiveCamera.tsx` renders a placeholder frame with animated
bounding boxes. In production, have FastAPI transcode RTSP to MJPEG:

```python
@app.get("/api/camera/stream")
def stream():
    return StreamingResponse(frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame")
```

Then swap the placeholder `<div>` for `<img src={`${API_BASE_URL}/api/camera/stream`} />`
and keep the absolutely positioned boxes on top.

## Step 4 — Stream live detections over WebSocket

```python
@app.websocket("/ws/detections")
async def detections(ws: WebSocket):
    await ws.accept()
    async for frame in recognizer.stream():
        await ws.send_json({"detections": frame.boxes, "checkIn": frame.check_in})
```

On the client, open the socket in a `useEffect`, and on each message call
`queryClient.setQueryData(["checkins"], ...)` / `["stats"]` so the cards and feed
update without polling. The current code polls every 15 s as a fallback.

## Step 5 — Recognition pipeline (reference)

1. `cv2.VideoCapture(rtsp_url)` reads frames.
2. Detector (RetinaFace / YOLOv8-face) produces boxes.
3. Embedding model (ArcFace / InsightFace) produces a 512-d vector.
4. Cosine similarity against stored embeddings; accept when
   `score >= confidenceThreshold`.
5. Skip the match if the student already checked in within
   `duplicateTimeoutMinutes`; otherwise insert an attendance row
   (status `late` when the time is past `lateAfter`).

## Step 6 — Enrollment uploads

The enroll modal currently sends a photo count. For real enrollment, post
`multipart/form-data` to `/api/users` with the image files, compute one embedding per
angle, and store the averaged vector alongside the student record.
