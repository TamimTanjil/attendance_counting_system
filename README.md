# Lab Attendance Hub

Act as a Senior Full-Stack Engineer and AI Architect. I want you to design and build a modern, high-performance web dashboard for an "Automatic Attendance Counting System" used in a software laboratory.

### Core Features & UI Requirements:

1. Dashboard Overview:

   - Real-time stat cards: Total Registered, Present Today, Absent Today, System Health/Status.

   - Live Camera Stream view area featuring mock bounding box overlays and real-time detection alerts.

   - Recent Check-ins feed displaying user avatar, name, timestamp, and confidence score.

2. Student/User Management Page:

   - Data table to list registered users with filter/search functionality.

   - Modal form to enroll new users: Name, ID, Department, Email, and multi-angle Photo Upload.

3. Attendance Logs & Analytics Page:

   - Detailed logs table (Date, User ID, Name, Entry Time, Exit Time, Status).

   - Date range picker and filters (Present, Late, Absent).

   - Button to export data to CSV and PDF formats.

   - Graphical charts for weekly/monthly attendance trends.

4. System Settings Page:

   - Configuration panel for Camera RTSP URL, Recognition Confidence Threshold Slider (0.50 - 0.95), and Anti-Duplicate Timeout (minutes).

### Design & Tech Stack Preferences:

- Tech Stack: Next.js / React, Tailwind CSS, Lucide Icons, and Recharts (or Chart.js).

- Aesthetics: Sleek, dark-mode software laboratory dashboard theme with glassmorphism touches and crisp contrast accents (e.g., emerald green for recognized check-ins).

- Architecture: Provide clean component separation, mock JSON data for local demonstration, and clear step-by-step instructions on how to hook this frontend to a Python FastAPI backend.

Generate the clean code structure, layout components, and mock API service handlers step by step.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://attendance-countingsyster.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f52a1161-97cc-4265-9817-a4b59e599e40).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
