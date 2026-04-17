'use strict';

const crypto = require('crypto');

class PodManager {
  constructor() {
    this.pods = new Map();
    this.podSockets = new Map();
    this.browserClients = new Set();
  }

  registerBrowser(ws) {
    this.browserClients.add(ws);
    ws.on('close', () => this.browserClients.delete(ws));
    this._sendToBrowser(ws, { type: 'INIT', pods: this._allPodStates() });
  }

  handlePodMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'pod':
      case 'REGISTER': {
        const podId = msg.podId || crypto.randomBytes(6).toString('hex');
        const state = {
          id: podId,
          name: msg.name || podId,
          status: 'running',
          logs: [],
          metrics: { cpu: 0, memory: 0, uptime: 0 },
          code: msg.code || null,
          universeId: msg.universeId || null,
          connectedAt: new Date().toISOString(),
        };
        this.pods.set(podId, state);
        this.podSockets.set(podId, ws);
        ws._podId = podId;
        ws.on('close', () => this._onPodDisconnect(podId));
        ws.send(JSON.stringify({ type: 'REGISTERED', podId }));
        this._broadcast({ type: 'POD_EVENT', event: 'JOINED', pod: state });
        break;
      }
      case 'LOG': {
        const pod = this.pods.get(ws._podId);
        if (!pod) return;
        const entry = { ts: new Date().toISOString(), msg: String(msg.message || '') };
        pod.logs.push(entry);
        if (pod.logs.length > 500) pod.logs.shift();
        this._broadcast({ type: 'POD_EVENT', event: 'LOG', podId: pod.id, entry });
        break;
      }
      case 'METRIC': {
        const pod = this.pods.get(ws._podId);
        if (!pod) return;
        pod.metrics = { ...pod.metrics, ...msg.metrics };
        this._broadcast({ type: 'POD_EVENT', event: 'METRIC', podId: pod.id, metrics: pod.metrics });
        break;
      }
      case 'CODE': {
        const pod = this.pods.get(ws._podId);
        if (!pod) return;
        pod.code = msg.code;
        this._broadcast({ type: 'POD_EVENT', event: 'CODE', podId: pod.id, code: pod.code });
        break;
      }
      case 'STATUS': {
        const pod = this.pods.get(ws._podId);
        if (!pod) return;
        pod.status = msg.status;
        this._broadcast({ type: 'POD_EVENT', event: 'STATUS', podId: pod.id, status: pod.status });
        break;
      }
    }
  }

  _onPodDisconnect(podId) {
    const pod = this.pods.get(podId);
    if (!pod) return;
    pod.status = 'disconnected';
    this.podSockets.delete(podId);
    this._broadcast({ type: 'POD_EVENT', event: 'STATUS', podId, status: 'disconnected' });
  }

  _allPodStates() {
    return Array.from(this.pods.values());
  }

  _broadcast(data) {
    const payload = JSON.stringify(data);
    for (const client of this.browserClients) {
      if (client.readyState === 1) client.send(payload);
    }
  }

  _sendToBrowser(ws, data) {
    if (ws.readyState === 1) ws.send(JSON.stringify(data));
  }

  broadcastToAll(data) {
    this._broadcast(data);
  }

  getSummary() {
    const pods = this._allPodStates();
    return {
      total: pods.length,
      running: pods.filter(p => p.status === 'running').length,
      disconnected: pods.filter(p => p.status === 'disconnected').length,
      error: pods.filter(p => p.status === 'error').length,
    };
  }
}

module.exports = new PodManager();
