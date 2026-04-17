# openclaw

AI-powered pod hive dashboard — real-time microservice monitoring with Hermes Agent integration.

**openclaw** is the visual control center. **[Hermes Agent](https://github.com/NousResearch/hermes-agent)** is the self-improving AI brain. Together they form a live business operating system.

## Quick start

```bash
npm install -g openclaw

# or from this repo:
npm install && npm link

openclaw install    # install dependencies
openclaw build      # check environment
openclaw deploy     # start dashboard at http://localhost:3000
```

## CLI commands

| Command | Description |
|---------|-------------|
| `openclaw install` | Install dependencies |
| `openclaw build` | Validate environment |
| `openclaw deploy` | Start the dashboard server |
| `openclaw pull` | Pull latest updates |
| `openclaw download` | Copy to local directory |

## Connecting a pod (microservice)

```js
const Pod = require('openclaw/sdk/pod');

const pod = new Pod({
  name: 'auth-service',
  server: 'ws://localhost:3000',
  universeId: 'my-universe-id', // optional
});

pod.connect();
pod.log('Service started');
pod.metric({ cpu: 12.4, memory: 128, uptime: 0 });
pod.sendCode(__filename); // streams source code to dashboard
pod.setStatus('running');
```

## Environment variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `ANTHROPIC_API_KEY` | Claude API key (standalone AI mode) | — |
| `HERMES_URL` | Hermes Agent API URL (preferred AI mode) | `http://localhost:8000` |
| `PORT` | Dashboard server port | `3000` |
| `DATA_DIR` | Business data directory | `./data` |

## Dashboard panels

- **Pods** — live status, logs, metrics, and code preview per pod
- **Hive Chat** — talk to Claude or Hermes to control the system
- **Tasks & Goals** — kanban board + goal progress, AI-populated
- **Insights** — reverse-chron AI insights feed
- **CRM** — lead pipeline (Prospect → Qualified → Closed)
- **Universes** — isolated business project workspaces (Prototype → Real)

## Hermes + openclaw sync

When `HERMES_URL` is set and Hermes Agent is running:
- Pod events feed into Hermes persistent memory
- Hermes subagents register as openclaw pods
- Hermes-generated tasks/insights appear on the dashboard live
- Control everything via Telegram, Discord, or the chat panel

Without Hermes, openclaw falls back to direct Claude API (set `ANTHROPIC_API_KEY`).
