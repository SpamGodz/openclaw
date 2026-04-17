# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start              # start the dashboard server (default port 3000)
npm test               # run all tests
node --test test/business-store.test.js   # run a single test file
npm pack --dry-run     # verify npm publish contents (should be 14 files, ~25 kB)

node bin/openclaw.js build       # check env vars
node bin/openclaw.js deploy -p 3100
node bin/openclaw.js hermes-bridge
```

## Architecture

There are five main modules in `src/` that are wired together by `server.js`:

### WebSocket routing (`src/server.js`)
The first WebSocket message from a client determines its identity (`ws._type`). Type `'pod'` routes all subsequent messages to `podManager.handlePodMessage()`; type `'browser'` registers the client to receive broadcasts and routes `'chat'` messages to `hermesBridge.chat()`. The dashboard is served as static files from `src/public/`.

### Pod lifecycle (`src/pod-manager.js`)
Maintains two Maps: `pods` (state objects) and `podSockets` (WebSocket handles). The initial `{ type: 'pod' }` registration message creates a pod entry with a random `podId`. Subsequent messages (`LOG`, `METRIC`, `CODE`, `STATUS`) update pod state and broadcast `POD_EVENT` frames to all connected browsers. `ws._podId` ties each socket to its pod entry.

### Data layer (`src/business-store.js`)
A module-level `store` object is lazy-loaded from `$DATA_DIR/business-store.json` (default `./data/`) on first call and kept in memory. Every mutation calls `save()` to write it back. Entities: tasks, goals, leads, universes, insights. Tests override `process.env.DATA_DIR` **before** requiring this module to isolate disk I/O to a temp directory.

### AI chat & actions (`src/hermes-bridge.js`)
On startup, tries to reach Hermes at `HERMES_URL`. Falls back to Claude (via `@anthropic-ai/sdk`) if Hermes is unreachable, or to echo-only if neither is available. Returns `{ text, actions, source }` where `actions` are parsed from `[OPENCLAW:action:args]` tags in the response and applied to the business store.

### Agent spawning (`src/agent-orchestrator.js`)
Spawns child Node processes that run inline-generated Pod SDK scripts. Each agent loops and sends heartbeat metrics. Tracked in `activeAgents` Map; `terminateAgent` kills the child process.

### Pod SDK (`sdk/pod.js`)
Exported as `openclaw/sdk/pod`. Constructor: `new Pod({ name, server, universeId })`. Connects over WebSocket with exponential-backoff retry (5 attempts). Public methods: `log(msg)`, `metric({cpu, memory, uptime})`, `sendCode(filepath)`, `setStatus(s)`, `disconnect()`.

## Environment Variables

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | Dashboard server port | `3000` |
| `DATA_DIR` | Directory for `business-store.json` | `./data` |
| `ANTHROPIC_API_KEY` | Claude fallback for chat | — |
| `HERMES_URL` | Hermes bridge HTTP URL | `http://localhost:8000` |
| `HERMES_BRIDGE_PORT` | Port for the Python bridge process | `8000` |
| `HERMES_PATH` | Path to hermes-agent clone | `~/.hermes-agent` |
| `POD_DEBUG` | Verbose pod SDK logging | — |

## Tests

Tests use Node's built-in `node:test` — no test framework dependencies. Both test files follow the same isolation pattern:

1. `fs.mkdtempSync(...)` creates a unique temp dir
2. `process.env.DATA_DIR` is set **before** `require('../src/business-store')`
3. `resetStore()` deletes the JSON file, calls `store.load()`, clears all arrays, and writes empty state

`pod-manager.test.js` uses a `freshManager()` helper that removes the module from `require.cache` to get a clean instance per test group. Mock WebSocket objects expose `sent[]`, `on()`, and `_emit()`.

To write a new pod-manager test, register a pod first:
```js
const mgr = freshManager();
const ws = mockWS();
mgr.handlePodMessage(ws, JSON.stringify({ type: 'pod', name: 'my-svc' }));
// ws._podId is now set; mgr.pods has one entry
```
