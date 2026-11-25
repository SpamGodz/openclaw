# Deploying OpenClaw

The frontend (`frontend/`) runs on **Vercel**. The backend (`backend/server.py`) runs on **Render**, with **MongoDB Atlas** as its database.

Vercel forwards every `/api/*` request to Render (`frontend/vercel.json`). The browser only ever talks to the Vercel domain, so the login cookie counts as first-party, and Safari and Chrome's third-party cookie blocking doesn't apply.

```
browser ──> Vercel (React app)
              └── /api/* ──> Render (FastAPI) ──> MongoDB Atlas
                                  └── Emergent Auth (login check)
```

## 1. Database: MongoDB Atlas (free)

1. Create a free M0 cluster at https://www.mongodb.com/cloud/atlas.
2. Under **Database Access**, add a user with a password.
3. Under **Network Access**, allow `0.0.0.0/0`. Render's free tier has no fixed outbound IP.
4. Under **Connect → Drivers**, copy the connection string (`mongodb+srv://…`).

## 2. Backend: Render

1. On https://dashboard.render.com, choose **New → Blueprint** and pick the `SpamGodz/openclaw` repo. Render reads `render.yaml`.
2. When asked, paste `MONGO_URL` (the Atlas string). `EMERGENT_API_KEY` is optional; see "What does not work on Render" below.
3. Deploy. Check that `https://spamgodz-openclaw-api.onrender.com/api/` returns `{"message":"OpenClaw Hosting API"}`.

If Render gives the service a different URL (because the name is taken), update the `/api/:path*` destination in `frontend/vercel.json` to match.

## 3. Frontend: Vercel

1. In Project Settings → General, set **Root Directory** to `frontend`.
2. Leave `REACT_APP_BACKEND_URL` **unset**. The frontend calls `/api` on its own domain and Vercel forwards it to Render.
3. In Deployment Protection, turn off Vercel Authentication, or limit it to previews, so people can reach the login page.

## Known limits

- **Cold starts:** a free Render service sleeps after 15 minutes without requests. The first request after that takes about a minute while it wakes up, and can time out. A paid instance doesn't sleep.
- **What does not work on Render:** starting, stopping and connecting to the OpenClaw gateway (`/api/openclaw/start`, `/stop`, `/ws`). Those need the `openclaw` CLI, `supervisord` and a persistent disk on the same machine. Render's Python runtime has none of them, and Vercel can't forward WebSockets. Login, logout and the instance lock all work. To run the gateway as well, host the backend on a VM or a Docker service that bundles supervisord and the CLI.
