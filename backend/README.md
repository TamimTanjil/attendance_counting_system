# Attendance backend (FastAPI)

Real camera, real faces, real database — this replaces the dashboard's demo data.

## 1. Install

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

Face *recognition* needs the optional extras in `requirements.txt`:

```bash
pip install insightface onnxruntime
```

Without them the system still detects and boxes faces (OpenCV Haar cascade) but
cannot identify anyone — QR badge check-in keeps working. `GET /api/health`
tells you which mode is live.

## 2. Point it at a camera

Edit `.env`:

```
CAMERA_SOURCE=rtsp://user:pass@192.168.1.50:554/stream1   # or 0 for a webcam, or a video file
DATABASE_URL=sqlite:///./attendance.db
CORS_ORIGINS=http://localhost:8080
```

The camera URL can also be changed at runtime from the dashboard's Settings page.

## 3. Run

```bash
uvicorn app.main:app --reload --port 8000
```

Interactive docs: http://localhost:8000/docs

## 4. Connect the dashboard

Set `VITE_API_BASE_URL=http://localhost:8000` for the frontend and restart it.
The mock data layer switches itself off automatically.

## How it works

- `camera.py` — one background thread owns the capture device and keeps only the
  newest frame, with automatic reconnect. Serves `/api/camera/stream` as MJPEG.
- `recognition.py` — RetinaFace detection + ArcFace 512-d embeddings via
  InsightFace, cosine matching against the enrolled gallery, plus OpenCV QR
  decoding for badges.
- `pipeline.py` — recognition worker (~3 fps) that matches faces, writes
  attendance and broadcasts `{ detections, checkIn? }` to every WebSocket
  client on `/ws/detections`. Boxes are sent as percentages of the frame so the
  overlay scales with the video element.
- `attendance.py` — one row per user per day: first sighting stamps entry and
  present/late (cutoff from Settings), later sightings refresh the exit time,
  and the anti-duplicate timeout suppresses repeats.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Recognition mode, model, camera state |
| GET | `/api/stats/today` | Stat cards |
| GET | `/api/users` | Registered students |
| POST | `/api/users` | Enrol (multipart: fields + `angles` + `photos`) |
| DELETE | `/api/users/{id}` | Remove a student and their embeddings |
| GET | `/api/attendance/recent` | Recent check-ins feed |
| GET | `/api/attendance/logs` | `?from&to&status&query` |
| POST | `/api/attendance/badge` | QR badge check-in `{ badgeId }` |
| POST | `/api/attendance/close-day` | Stamp exits for anyone still open |
| GET | `/api/camera/stream` | MJPEG stream |
| POST | `/api/camera/test` | Verify an RTSP/HTTP URL |
| GET/PUT | `/api/settings` | Threshold, timeout, late cutoff, camera URL |
| WS | `/ws/detections` | Live boxes + check-ins |

## Notes for production

- SQLite is fine for a single lab; switch `DATABASE_URL` to Postgres for more.
- Put the API behind HTTPS so the browser badge scanner can use the camera, and
  add authentication before exposing it beyond the lab network.
- Absences are derived (registered minus present today); run `close-day` on a
  nightly cron if you want exits stamped automatically.
