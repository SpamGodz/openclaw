# openclaw

AI-powered pod hive dashboard — real-time microservice monitoring with Hermes Agent integration.

**openclaw** is the visual control center (Node.js). **[Hermes Agent](https://github.com/NousResearch/hermes-agent)** (Nous Research) is the self-improving AI brain. Together they form a live business operating system.

---

## Quick start (Claude-only mode — no Hermes needed)

```bash
# Install globally
npm install -g openclaw

# Or from this repo
npm install && npm link

# Configure
export ANTHROPIC_API_KEY=sk-ant-...

# Run
openclaw deploy
# Dashboard at http://localhost:3000
```

---

## Full setup with Hermes Agent (recommended)

### 1. Install openclaw

```bash
npm install -g openclaw
# or: npm install && npm link
```

### 2. Install Hermes Agent

```bash
openclaw hermes-setup
# Clones NousResearch/hermes-agent → ~/.hermes-agent
# Runs: pip install -e ".[all]"
# Creates: ~/.hermes-agent/.env
```

**Requires:** Python 3.11+ and `pip` on your PATH.

After setup, edit `~/.hermes-agent/.env` and add your API keys:

```
ANTHROPIC_API_KEY=sk-ant-...
# Optional extras:
# OPENROUTER_API_KEY=...
# TELEGRAM_TOKEN=...    ← control the hive from Telegram
# DISCORD_TOKEN=...     ← control via Discord
```

### 3. Start the Hermes bridge

The bridge wraps Hermes' Python SDK as a local HTTP API that openclaw talks to.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export HERMES_PATH=~/.hermes-agent   # set if hermes-setup used a custom path

openclaw hermes-bridge               # starts on http://localhost:8000
```

### 4. Start openclaw

In a new terminal:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export HERMES_URL=http://localhost:8000   # points to bridge from step 3

openclaw deploy                           # dashboard at http://localhost:3000
```

### 5. Open the dashboard

```
http://localhost:3000
```

The Hermes status dot (top-right) turns green when the bridge is connected.

---

## CLI commands

| Command | Description |
|---------|-------------|
| `openclaw install` | Install Node.js dependencies |
| `openclaw build` | Check environment variables and readiness |
| `openclaw deploy` | Start the dashboard server |
| `openclaw hermes-setup` | Clone and install Hermes Agent |
| `openclaw hermes-bridge` | Start the Hermes HTTP bridge |
| `openclaw pull` | Pull latest openclaw updates |
| `openclaw download` | Copy openclaw to a local directory |

---

## Connecting a pod (microservice)

Any service can plug into the hive using the pod SDK:

```js
const Pod = require('openclaw/sdk/pod');

const pod = new Pod({
  name: 'auth-service',
  server: 'ws://localhost:3000',
  universeId: 'my-universe-id',  // optional
});

pod.connect();
pod.log('Service started');
pod.metric({ cpu: 12.4, memory: 128, uptime: 0 });
pod.sendCode(__filename);         // stream source code to dashboard
pod.setStatus('running');

// Later...
pod.setStatus('error');
pod.log('Connection failed — retrying');
pod.disconnect();
```

---

## How Hermes + openclaw sync

```
You ─── Telegram/Discord ───┐
                             ▼
You ─── Hive Chat panel ──► Hermes Agent  (self-improving AI)
                             │   ↕ learns from pod events
                             ▼
                        openclaw server  (dashboard + WS)
                             │   ↕ pod SDK
                        Microservice pods
```

- **Pod events feed Hermes memory** — Hermes learns which pods exist, their health, logs
- **Hermes can act on openclaw** by including `[OPENCLAW:action:args]` tags in responses
- **Hermes subagents** (spawned via chat) appear as pod cards on the dashboard
- **Tasks, leads, insights, universes** can be created from the Hive Chat panel

### Hermes command protocol

When you chat with Hermes via the dashboard or messaging platforms, it can include these tags to act on the live system:

```
[OPENCLAW:spawn_agent:agent-name:what it should do]
[OPENCLAW:add_task:task title:optional description]
[OPENCLAW:add_insight:insight text here]
[OPENCLAW:add_lead:lead name:contact info]
[OPENCLAW:create_universe:universe name:description]
[OPENCLAW:promote_universe:universeId]
```

Example chat: *"Create a universe called ProductX and spawn a monitoring agent for it"*
Hermes responds with the answer and silently includes:
```
[OPENCLAW:create_universe:ProductX:New product universe]
[OPENCLAW:spawn_agent:monitor-agent-productx:Monitor ProductX metrics]
```
Both actions execute instantly — universe and pod card appear on the dashboard live.

---

## Dashboard panels

| Panel | What it shows |
|-------|--------------|
| **Pods** | Live status, streaming logs, CPU/memory metrics, code preview |
| **Hive Chat** | Talk to Hermes (or Claude fallback) — actions execute live |
| **Tasks & Goals** | Kanban board + goal progress bars; AI-populated |
| **Insights** | Reverse-chron AI insight feed (tagged hermes or claude) |
| **CRM** | Lead pipeline: Prospect → Qualified → Closed |
| **Universes** | Project workspaces; Promote from Prototype → Real |

---

## Environment variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `ANTHROPIC_API_KEY` | Claude API key (Hermes + standalone mode) | — |
| `HERMES_URL` | URL of the Hermes HTTP bridge | auto-detect :8000 |
| `HERMES_PATH` | Path to hermes-agent clone | `~/.hermes-agent` |
| `HERMES_MODEL` | Model for Hermes to use | `anthropic/claude-opus-4.6` |
| `HERMES_MAX_ITER` | Max Hermes tool iterations per chat | `15` |
| `HERMES_BRIDGE_PORT` | Port for the Python HTTP bridge | `8000` |
| `PORT` | openclaw dashboard port | `3000` |
| `DATA_DIR` | Business data directory | `./data` |

---

## Architecture

```
Browser (http://localhost:3000)
    ↕ WebSocket
Express Server (Node.js)
    ├── pod-manager.js        ← WS hub for microservice pods
    ├── hermes-bridge.js      ← proxies chat to Hermes bridge / Claude
    ├── agent-orchestrator.js ← spawns autonomous agent pods
    ├── business-store.js     ← JSON: tasks, leads, universes, insights
    └── /public               ← dashboard HTML/JS/CSS

scripts/hermes-http-bridge.py  (Python)
    ← wraps Hermes AIAgent.run_conversation()
    ← parses [OPENCLAW:...] action tags from Hermes responses
    ← feeds pod/business events into Hermes memory
    → exposes: GET /health, POST /chat, POST /memory
```
