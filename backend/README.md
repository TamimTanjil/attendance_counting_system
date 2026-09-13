# LabSense FastAPI backend

Real camera capture, face recognition and QR check-in for the attendance dashboard.

## Run it

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
RTSP_URL=0 uvicorn app.main:app --reload --port 8000
```

`RTSP_URL=0` uses the built-in webcam; use `rtsp://user:pass@192.168.0.42:554/stream`
for an IP camera. The value is also stored in settings and can be changed from the
dashboard's Settings page at runtime.

Environment variables: `RTSP_URL`, `ALLOWED_ORIGINS` (comma separated),
`DATA_DIR`, `JPEG_QUALITY`, `PROCESS_EVERY_N_FRAMES`.

## What runs inside

- `app/camera.py` — background thread reading the source with auto-reconnect, plus the
  MJPEG generator that serves `/api/camera/stream` with boxes drawn on the frame.
- `app/recognition.py` — Haar cascade face detection, LBPH face recognition
  (`opencv-contrib`), and `cv2.QRCodeDetector` multi-QR decoding. A QR payload is the
  student ID.
- `app/pipeline.py` — matches detections to students, applies the confidence threshold,
  late cut-off and anti-duplicate timeout, writes attendance rows, and pushes
  `detections` / `checkin` events to every WebSocket subscriber.
- `app/db.py` — SQLite (`data/attendance.db`) for users, attendance and settings.
  Enrolled face crops live in `data/faces/<user_id>/NN.png`; the trained model in
  `data/lbph.yml`.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/stats/today` | Cards on the overview page |
| GET/POST | `/api/users` | List / create students |
| POST | `/api/users/enroll` | multipart: fields + `photos[]`, saves crops and retrains |
| DELETE | `/api/users/{id}` | Remove student and their face samples |
| GET | `/api/attendance/recent` | Recent check-in feed |
| GET | `/api/attendance/logs` | `from,to,status,query` filters |
| GET/PUT | `/api/settings` | Camera URL, threshold, timeout, late cut-off |
| POST | `/api/camera/test` | Probe a stream URL |
| GET | `/api/camera/stream` | MJPEG stream with overlays |
| GET | `/api/camera/detections` | Current boxes as JSON (WebSocket fallback) |
| GET | `/api/camera/snapshot` | Single annotated JPEG |
| WS | `/ws/detections` | `{type:"detections"\|"checkin", ...}` |
| POST | `/api/model/retrain` | Rebuild LBPH from all stored samples |
| GET | `/api/health` | Liveness + camera status |

## QR badges

Generate a badge whose QR payload is exactly the student ID (`SWE-22-101`).
The pipeline resolves it against the users table and records a check-in with
`method: "qr"` and confidence 1.0. Unknown payloads render as a red box only.

## Connect the dashboard

Create `.env` in the project root:

```
VITE_API_BASE_URL=http://localhost:8000
```

The dashboard then switches off mock data, shows the live MJPEG frame and overlays
boxes from the WebSocket in real time.
