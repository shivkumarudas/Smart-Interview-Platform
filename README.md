# Smart Interview Platform

A lightweight web app with a Node/Express backend and a static HTML/JS frontend for interview practice.

## Project Structure
- `index.html` and folders like `auth/`, `dashboard/`, `interview/` provide the frontend.
- `interview-ai-backend/` hosts the API and Groq-powered interview logic.

## Backend Setup
1) Install dependencies:
   ```bash
   cd interview-ai-backend
   npm install
   ```
2) Create a `.env` file in `interview-ai-backend/`:
   ```bash
   MONGO_URI=your_mongodb_connection_string
   GROQ_API_KEY=your_groq_api_key
   PORT=5000
   # Optional: CORS_ORIGIN=http://127.0.0.1:5500
   ```
3) Start the server:
   ```bash
   npm start
   ```

## Frontend Usage
- Open `index.html` with a local static server (recommended) or directly in the browser.
- The frontend expects the backend running at `http://127.0.0.1:5000`.

## API Endpoints (Backend)
- `POST /signup`
- `POST /login`
- `POST /profile`
- `GET /profile/:userId`
- `POST /feedback`
- `POST /interview/question`
- `POST /interview/evaluate`

## Notes
- For production, set `CORS_ORIGIN` to your deployed frontend URL(s).
- Ensure MongoDB IP allowlist includes your machine if using Atlas.
