# Smart Interview Platform

A lightweight web app with a Node/Express backend and a static HTML/JS frontend for interview practice.

## Project Structure
- `index.html` and folders like `auth/`, `dashboard/`, `interview/` provide the frontend.
- `interview-ai-backend/` hosts the API and Gemini-powered interview logic.

## Quick Start (Recommended)
1) Install backend dependencies:
   ```bash
   cd interview-ai-backend
   npm install
   ```
2) Create `interview-ai-backend/.env` (start from `interview-ai-backend/.env.example`) and set:
   - `GEMINI_API_KEY` (required for interview question/evaluation)
   - `MONGO_URI` (required for signup/login/profile/feedback)
   - `JWT_SECRET` (required for secure login sessions; use a long random string)
   - Optional: `GEMINI_TTS_MODEL` and `GEMINI_TTS_VOICE` (Gemini neural voice settings)
   - Optional: `OPENAI_API_KEY` (fallback voice/transcription provider)
   - Optional: `GEMINI_MODEL` (override default Gemini model, default `gemini-flash-lite-latest`)
   - Optional: `TTS_PROVIDER` (`gemini` or `openai`; default auto-selects Gemini first)
   - Optional: `JWT_EXPIRES_IN` (default `7d`)
   - Optional: `STT_MODEL` or `GEMINI_STT_MODEL` (override speech-to-text model)
3) Start the server:
   ```bash
   npm start
   ```
4) Open the app:
   - `http://localhost:5000`

## Frontend Usage
- The backend serves the frontend automatically (recommended): open `http://localhost:5000`.
- If you serve the frontend separately, `js/api.js` will try to auto-detect the backend via `/ping` and fall back to `http://127.0.0.1:5000`.
  - Override anytime via `localStorage`:
    - `INTERVIEWAI_API_BASE_URL` (preferred), or
    - `API_BASE_URL`

## Practice Hub (New)
- Open `practice/practice.html` from the dashboard sidebar.
- Features:
  - Weekly practice goals (interviews + questions)
  - Interview templates (save/edit/delete, quick start, open in setup)
  - Recent activity feed that combines saved sessions and local history
- Interview setup now supports loading and saving templates.

## API Endpoints (Backend)
- `POST /signup`
- `POST /login`
- `POST /forgot-password`
- `POST /profile`
- `GET /profile/:userId`
- `POST /feedback`
- `POST /interview/question`
- `POST /interview/evaluate` (returns `evaluation` + optional `evaluationJson`)
- `POST /interview/tts` (returns generated AI voice audio)
- `POST /interview/transcribe` (transcribes user voice answer to text)
- `POST /interview/session/start`
- `POST /interview/session/:sessionId/entry`
- `POST /interview/session/:sessionId/end`
- `GET /interview/session/:sessionId`
- `GET /interview/sessions?userId=...`

## Authentication
- `POST /login` returns `user` and `token`.
- Protected endpoints require `Authorization: Bearer <token>`.
- The frontend stores token in `localStorage` key `INTERVIEWAI_AUTH_TOKEN` and sends it automatically through `js/api.js`.

## Notes
- For production, set `CORS_ORIGIN` to your deployed frontend URL(s).
- Ensure MongoDB IP allowlist includes your machine if using Atlas.
- Interview sessions/reports are persisted when MongoDB is connected; the report page can load previous saved sessions.
