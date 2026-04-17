# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**OpenClaw** is a web application that wraps **Clawdbot** (a Moltbot fork) with Google OAuth authentication and a React UI. It lets an authenticated user select an LLM provider (Emergent/Anthropic/OpenAI), supply an API key, and launch/stop the Clawdbot gateway process. The gateway runs as a supervised process; the FastAPI backend proxies HTTP and WebSocket traffic to its Control UI.

## Commands

### Backend

```bash
# Start the backend dev server (from /backend)
cd backend && uvicorn server:app --reload --host 0.0.0.0 --port 8001

# Run backend tests
cd backend && pytest backend_test.py -v

# Run POC tests
pytest tests/test_moltbot_poc.py -v

# Lint & format (Python)
black backend/
isort backend/
flake8 backend/
mypy backend/
```

### Frontend

```bash
# Install dependencies (uses yarn)
cd frontend && yarn install

# Start dev server
cd frontend && yarn start

# Build for production
cd frontend && yarn build

# Run frontend tests
cd frontend && yarn test
```

## Architecture

### Request Flow

```
Browser → React (port 3000)
       → /api/* → FastAPI (port 8001)
                → /api/openclaw/ui/* → HTTP proxy → Clawdbot Control UI (port 18789)
                → /api/openclaw/ws  → WS proxy   → Clawdbot gateway
```

### Backend (`backend/server.py`)

All API routes are mounted under `/api` via `api_router = APIRouter(prefix="/api")`.

**Key concerns:**

- **Authentication**: Emergent OAuth. `AuthCallback` in the frontend extracts a `session_id` from the URL fragment (not query string — do not change this) and POSTs to `/api/auth/session`, which verifies it with `https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data`. Sessions are stored in MongoDB and returned as an httpOnly cookie.
- **Instance locking**: A single `instance_config` document with `_id: "instance_owner"` in MongoDB tracks who owns the instance. Only that user can log in; others get a 403.
- **Gateway lifecycle**: Clawdbot is installed at `/root/.clawdbot-bin`. Its process is managed by **supervisord** (program name: `clawdbot-gateway`). `supervisor_client.py` wraps supervisord RPC calls. Credentials are written to `~/.clawdbot/gateway.env` via `gateway_config.py`. In-memory `gateway_state` dict tracks token/provider/owner between requests.
- **Proxying**: `/api/openclaw/ui/` reverse-proxies HTTP to port 18789; `/api/openclaw/ws` bridges WebSocket connections to the same port.

**Required env vars** (loaded from `backend/.env`):
| Variable | Purpose |
|---|---|
| `MONGO_URL` | MongoDB connection string |
| `DB_NAME` | MongoDB database name |
| `EMERGENT_API_KEY` | Default API key for Emergent provider |
| `EMERGENT_BASE_URL` | Emergent LLM proxy endpoint |
| `REACT_APP_BACKEND_URL` | Backend URL surfaced to the frontend |

### Frontend (`frontend/src/`)

Built with Create React App + Craco. Path alias `@` → `src/`.

Three pages, no layout shell:
- **`LoginPage`** — Google sign-in; checks `/api/auth/instance` for lock status before redirecting to `https://auth.emergentagent.com/`.
- **`AuthCallback`** — Detected by `App.js` via `location.hash` containing `session_id=` (URL fragment, not query param). Exchanges session_id for a cookie via `/api/auth/session`.
- **`SetupPage`** — Main control panel: provider selection, API key input, start/stop, status polling at `/api/openclaw/status`, redirect to Control UI at `/api/openclaw/ui/`.

**Critical note in `App.js`**: Do not hardcode URLs or add redirect fallbacks — this breaks auth.

All UI primitives come from `@/components/ui/` (shadcn/ui, New York style). Use `data-testid` attributes in kebab-case for any new interactive elements.

### Design Tokens

| Token | Value |
|---|---|
| Background | `#0f0f10` |
| Card | `#141416` |
| Text | `#F2F3F5` |
| Muted | `#9CA3AF` |
| Border | `#1f2022` |
| Accent | `#FF4500` |
| Success | `#22c55e` |
| Error | `#ef4444` |

Fonts: **Space Grotesk** (headings) · **Fira Sans** (body).

### Supporting Modules

- `supervisor_client.py` — start/stop/status/restart via supervisord XML-RPC
- `gateway_config.py` — writes/clears `~/.clawdbot/gateway.env`
- `whatsapp_monitor.py` — WhatsApp integration status helpers (legacy)
- `install_moltbot_deps.sh` — installs Node.js 22 + clawdbot globally (run once on fresh env)

### Persistent Runtime Paths

| Path | Contents |
|---|---|
| `/root/.clawdbot-bin` | Clawdbot installation |
| `~/.clawdbot/clawdbot.json` | Gateway config |
| `~/.clawdbot/gateway.env` | Provider credentials |
| `~/clawd` | Gateway workspace |
| `/root/run_clawdbot.sh` | Wrapper launch script |
