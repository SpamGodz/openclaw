'use strict';

const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');

const podManager = require('./pod-manager');
const hermesBridge = require('./hermes-bridge');
const store = require('./business-store');

const PORT = parseInt(process.env.PORT || '3000', 10);
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── REST API ───────────────────────────────────────────────────────────────

app.get('/api/business/summary', (_, res) => res.json(store.getSummary()));

app.get('/api/business/tasks', (req, res) => res.json(store.getTasks(req.query.universeId)));
app.post('/api/business/tasks', (req, res) => res.json(store.addTask(req.body)));
app.patch('/api/business/tasks/:id', (req, res) => {
  const t = store.updateTask(req.params.id, req.body);
  if (!t) return res.status(404).json({ error: 'Not found' });
  podManager.broadcastToAll({ type: 'BUSINESS_EVENT', event: 'TASK_UPDATED', task: t });
  res.json(t);
});
app.delete('/api/business/tasks/:id', (req, res) => {
  const ok = store.deleteTask(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  podManager.broadcastToAll({ type: 'BUSINESS_EVENT', event: 'TASK_DELETED', taskId: req.params.id });
  res.json({ ok: true });
});

app.get('/api/business/leads', (req, res) => res.json(store.getLeads(req.query.universeId)));
app.post('/api/business/leads', (req, res) => {
  const lead = store.addLead(req.body);
  podManager.broadcastToAll({ type: 'BUSINESS_EVENT', event: 'LEAD_ADDED', lead });
  res.json(lead);
});
app.patch('/api/business/leads/:id', (req, res) => {
  const lead = store.updateLead(req.params.id, req.body);
  if (!lead) return res.status(404).json({ error: 'Not found' });
  podManager.broadcastToAll({ type: 'BUSINESS_EVENT', event: 'LEAD_UPDATED', lead });
  res.json(lead);
});
app.delete('/api/business/leads/:id', (req, res) => {
  const ok = store.deleteLead(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  podManager.broadcastToAll({ type: 'BUSINESS_EVENT', event: 'LEAD_DELETED', leadId: req.params.id });
  res.json({ ok: true });
});

app.get('/api/business/universes', (_, res) => res.json(store.getUniverses()));
app.post('/api/business/universes', (req, res) => {
  const universe = store.addUniverse(req.body);
  podManager.broadcastToAll({ type: 'BUSINESS_EVENT', event: 'UNIVERSE_CREATED', universe });
  res.json(universe);
});
app.post('/api/business/universes/:id/promote', (req, res) => {
  const universe = store.promoteUniverse(req.params.id);
  if (!universe) return res.status(404).json({ error: 'Not found' });
  podManager.broadcastToAll({ type: 'BUSINESS_EVENT', event: 'UNIVERSE_PROMOTED', universe });
  res.json(universe);
});

app.get('/api/business/insights', (_, res) => res.json(store.getInsights()));

app.get('/api/business/goals', (req, res) => res.json(store.getGoals(req.query.universeId)));
app.post('/api/business/goals', (req, res) => res.json(store.addGoal(req.body)));
app.patch('/api/business/goals/:id', (req, res) => {
  const goal = store.updateGoal(req.params.id, req.body);
  if (!goal) return res.status(404).json({ error: 'Not found' });
  podManager.broadcastToAll({ type: 'BUSINESS_EVENT', event: 'GOAL_UPDATED', goal });
  res.json(goal);
});

// ── HTTP + WebSocket server ───────────────────────────────────────────────

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws._type = null;

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (!ws._type) {
      ws._type = msg.type;

      if (msg.type === 'browser') {
        podManager.registerBrowser(ws);
        return;
      }
      if (msg.type === 'pod') {
        podManager.handlePodMessage(ws, raw);
        return;
      }
    }

    if (ws._type === 'pod') {
      podManager.handlePodMessage(ws, raw);
      hermesBridge.syncEventToHermes(msg).catch(() => {});
      return;
    }

    if (ws._type === 'browser' && msg.type === 'chat') {
      const serverUrl = `ws://localhost:${PORT}`;
      ws.send(JSON.stringify({ type: 'CHAT_THINKING' }));
      const result = await hermesBridge.chat(msg.message, serverUrl);
      ws.send(JSON.stringify({ type: 'CHAT_RESPONSE', ...result }));
      return;
    }
  });

  ws.on('error', (err) => console.error('[ws] error:', err.message));
});

// ── Boot ──────────────────────────────────────────────────────────────────

async function start() {
  await hermesBridge.init();
  server.listen(PORT, () => {
    console.log(`\nopenclaw running at http://localhost:${PORT}`);
    console.log('Dashboard: http://localhost:' + PORT);
    console.log('WebSocket: ws://localhost:' + PORT);
    console.log('\nPod SDK usage:');
    console.log('  const Pod = require("openclaw/sdk/pod");');
    console.log('  const pod = new Pod({ name: "my-service", server: "ws://localhost:' + PORT + '" });');
    console.log('  pod.connect();\n');
  });
}

start().catch(err => { console.error('Failed to start:', err); process.exit(1); });

module.exports = { app, server };
