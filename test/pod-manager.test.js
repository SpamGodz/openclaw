'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

// Reset pod-manager between tests by manipulating its internal state
// We re-require a fresh instance for each logical group using module cache tricks
function freshManager() {
  // Delete cached module so we get a clean instance
  const key = require.resolve('../src/pod-manager');
  delete require.cache[key];
  return require('../src/pod-manager');
}

// Minimal WebSocket mock
function mockWS() {
  const sent = [];
  const handlers = {};
  return {
    readyState: 1, // OPEN
    sent,
    _podId: null,
    send(payload) { sent.push(JSON.parse(payload)); },
    on(event, fn) { handlers[event] = fn; },
    _emit(event, ...args) { if (handlers[event]) handlers[event](...args); },
  };
}

// ── Browser registration ───────────────────────────────────────────────────

test('registerBrowser: sends INIT with empty pods', () => {
  const mgr = freshManager();
  const browser = mockWS();
  mgr.registerBrowser(browser);
  assert.equal(browser.sent.length, 1);
  assert.equal(browser.sent[0].type, 'INIT');
  assert.deepEqual(browser.sent[0].pods, []);
});

test('registerBrowser: INIT includes already-registered pods', () => {
  const mgr = freshManager();
  const podWS = mockWS();
  mgr.handlePodMessage(podWS, JSON.stringify({ type: 'pod', name: 'api-service' }));

  const browser = mockWS();
  mgr.registerBrowser(browser);
  const init = browser.sent.find(m => m.type === 'INIT');
  assert.equal(init.pods.length, 1);
  assert.equal(init.pods[0].name, 'api-service');
});

test('registerBrowser: cleans up on close', () => {
  const mgr = freshManager();
  const browser = mockWS();
  mgr.registerBrowser(browser);
  assert.equal(mgr.browserClients.size, 1);
  browser._emit('close');
  assert.equal(mgr.browserClients.size, 0);
});

// ── Pod REGISTER ───────────────────────────────────────────────────────────

test('REGISTER: pod appears in pods map', () => {
  const mgr = freshManager();
  const ws = mockWS();
  mgr.handlePodMessage(ws, JSON.stringify({ type: 'pod', name: 'auth-service' }));
  const pods = Array.from(mgr.pods.values());
  assert.equal(pods.length, 1);
  assert.equal(pods[0].name, 'auth-service');
  assert.equal(pods[0].status, 'running');
});

test('REGISTER: sends REGISTERED with podId back to pod', () => {
  const mgr = freshManager();
  const ws = mockWS();
  mgr.handlePodMessage(ws, JSON.stringify({ type: 'pod', name: 'worker' }));
  const reg = ws.sent.find(m => m.type === 'REGISTERED');
  assert.ok(reg, 'REGISTERED message not sent');
  assert.ok(reg.podId);
});

test('REGISTER: broadcasts POD_EVENT JOINED to browsers', () => {
  const mgr = freshManager();
  const browser = mockWS();
  mgr.registerBrowser(browser);
  browser.sent.length = 0; // clear INIT

  const ws = mockWS();
  mgr.handlePodMessage(ws, JSON.stringify({ type: 'pod', name: 'new-pod' }));

  const joined = browser.sent.find(m => m.type === 'POD_EVENT' && m.event === 'JOINED');
  assert.ok(joined, 'JOINED broadcast not received by browser');
  assert.equal(joined.pod.name, 'new-pod');
});

test('REGISTER: preserves universeId', () => {
  const mgr = freshManager();
  const ws = mockWS();
  mgr.handlePodMessage(ws, JSON.stringify({ type: 'pod', name: 'svc', universeId: 'u42' }));
  const pod = Array.from(mgr.pods.values())[0];
  assert.equal(pod.universeId, 'u42');
});

// ── LOG ────────────────────────────────────────────────────────────────────

test('LOG: appended to pod.logs', () => {
  const mgr = freshManager();
  const ws = mockWS();
  mgr.handlePodMessage(ws, JSON.stringify({ type: 'pod', name: 'svc' }));
  mgr.handlePodMessage(ws, JSON.stringify({ type: 'LOG', message: 'hello world' }));

  const pod = Array.from(mgr.pods.values())[0];
  assert.equal(pod.logs.length, 1);
  assert.equal(pod.logs[0].msg, 'hello world');
  assert.ok(pod.logs[0].ts);
});

test('LOG: broadcast to browsers', () => {
  const mgr = freshManager();
  const browser = mockWS();
  mgr.registerBrowser(browser);
  browser.sent.length = 0;

  const ws = mockWS();
  mgr.handlePodMessage(ws, JSON.stringify({ type: 'pod', name: 'svc' }));
  browser.sent.length = 0;

  mgr.handlePodMessage(ws, JSON.stringify({ type: 'LOG', message: 'log line' }));
  const logMsg = browser.sent.find(m => m.event === 'LOG');
  assert.ok(logMsg);
  assert.equal(logMsg.entry.msg, 'log line');
});

test('LOG: caps at 500 entries', () => {
  const mgr = freshManager();
  const ws = mockWS();
  mgr.handlePodMessage(ws, JSON.stringify({ type: 'pod', name: 'svc' }));
  for (let i = 0; i < 510; i++) {
    mgr.handlePodMessage(ws, JSON.stringify({ type: 'LOG', message: `line ${i}` }));
  }
  const pod = Array.from(mgr.pods.values())[0];
  assert.equal(pod.logs.length, 500);
});

// ── METRIC ─────────────────────────────────────────────────────────────────

test('METRIC: updates pod.metrics', () => {
  const mgr = freshManager();
  const ws = mockWS();
  mgr.handlePodMessage(ws, JSON.stringify({ type: 'pod', name: 'svc' }));
  mgr.handlePodMessage(ws, JSON.stringify({ type: 'METRIC', metrics: { cpu: 42.5, memory: 128, uptime: 60 } }));

  const pod = Array.from(mgr.pods.values())[0];
  assert.equal(pod.metrics.cpu, 42.5);
  assert.equal(pod.metrics.memory, 128);
  assert.equal(pod.metrics.uptime, 60);
});

test('METRIC: broadcast to browsers', () => {
  const mgr = freshManager();
  const browser = mockWS();
  mgr.registerBrowser(browser);

  const ws = mockWS();
  mgr.handlePodMessage(ws, JSON.stringify({ type: 'pod', name: 'svc' }));
  browser.sent.length = 0;

  mgr.handlePodMessage(ws, JSON.stringify({ type: 'METRIC', metrics: { cpu: 10 } }));
  const metricMsg = browser.sent.find(m => m.event === 'METRIC');
  assert.ok(metricMsg);
  assert.equal(metricMsg.metrics.cpu, 10);
});

// ── STATUS ─────────────────────────────────────────────────────────────────

test('STATUS: updates pod.status', () => {
  const mgr = freshManager();
  const ws = mockWS();
  mgr.handlePodMessage(ws, JSON.stringify({ type: 'pod', name: 'svc' }));
  mgr.handlePodMessage(ws, JSON.stringify({ type: 'STATUS', status: 'error' }));

  const pod = Array.from(mgr.pods.values())[0];
  assert.equal(pod.status, 'error');
});

test('STATUS: broadcast to browsers', () => {
  const mgr = freshManager();
  const browser = mockWS();
  mgr.registerBrowser(browser);

  const ws = mockWS();
  mgr.handlePodMessage(ws, JSON.stringify({ type: 'pod', name: 'svc' }));
  browser.sent.length = 0;

  mgr.handlePodMessage(ws, JSON.stringify({ type: 'STATUS', status: 'stopped' }));
  const statusMsg = browser.sent.find(m => m.event === 'STATUS');
  assert.ok(statusMsg);
  assert.equal(statusMsg.status, 'stopped');
});

// ── Disconnect ─────────────────────────────────────────────────────────────

test('disconnect: pod status set to disconnected', () => {
  const mgr = freshManager();
  const ws = mockWS();
  mgr.handlePodMessage(ws, JSON.stringify({ type: 'pod', name: 'ephemeral' }));
  const podId = ws._podId;

  ws._emit('close');

  const pod = mgr.pods.get(podId);
  assert.equal(pod.status, 'disconnected');
});

test('disconnect: broadcasts disconnected status to browsers', () => {
  const mgr = freshManager();
  const browser = mockWS();
  mgr.registerBrowser(browser);

  const ws = mockWS();
  mgr.handlePodMessage(ws, JSON.stringify({ type: 'pod', name: 'temp' }));
  browser.sent.length = 0;

  ws._emit('close');

  const msg = browser.sent.find(m => m.event === 'STATUS' && m.status === 'disconnected');
  assert.ok(msg, 'Expected disconnected STATUS broadcast');
});

// ── getSummary ─────────────────────────────────────────────────────────────

test('getSummary: correct counts', () => {
  const mgr = freshManager();

  const ws1 = mockWS();
  mgr.handlePodMessage(ws1, JSON.stringify({ type: 'pod', name: 'running-pod' }));

  const ws2 = mockWS();
  mgr.handlePodMessage(ws2, JSON.stringify({ type: 'pod', name: 'error-pod' }));
  mgr.handlePodMessage(ws2, JSON.stringify({ type: 'STATUS', status: 'error' }));

  const ws3 = mockWS();
  mgr.handlePodMessage(ws3, JSON.stringify({ type: 'pod', name: 'disco-pod' }));
  ws3._emit('close');

  const s = mgr.getSummary();
  assert.equal(s.total, 3);
  assert.equal(s.running, 1);
  assert.equal(s.error, 1);
  assert.equal(s.disconnected, 1);
});

// ── broadcastToAll ─────────────────────────────────────────────────────────

test('broadcastToAll: sends to all registered browsers', () => {
  const mgr = freshManager();
  const b1 = mockWS();
  const b2 = mockWS();
  mgr.registerBrowser(b1);
  mgr.registerBrowser(b2);
  b1.sent.length = 0;
  b2.sent.length = 0;

  mgr.broadcastToAll({ type: 'TEST', data: 'hello' });
  assert.equal(b1.sent.length, 1);
  assert.equal(b2.sent.length, 1);
  assert.equal(b1.sent[0].data, 'hello');
});

test('broadcastToAll: skips closed browser connections', () => {
  const mgr = freshManager();
  const b1 = mockWS();
  const b2 = mockWS();
  b2.readyState = 3; // CLOSED
  mgr.registerBrowser(b1);
  mgr.registerBrowser(b2);
  b1.sent.length = 0;
  b2.sent.length = 0;

  mgr.broadcastToAll({ type: 'TEST' });
  assert.equal(b1.sent.length, 1);
  assert.equal(b2.sent.length, 0);
});
