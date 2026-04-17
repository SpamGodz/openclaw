'use strict';

const { WebSocket } = require('ws');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class Pod {
  constructor({ name, server = 'ws://localhost:3000', universeId = null, code = null } = {}) {
    this.name = name || `pod-${crypto.randomBytes(4).toString('hex')}`;
    this.server = server;
    this.universeId = universeId;
    this.code = code;
    this.podId = null;
    this.ws = null;
    this._retries = 0;
    this._maxRetries = 5;
    this._queue = [];
    this._connected = false;
  }

  connect() {
    this._open();
    return this;
  }

  _open() {
    this.ws = new WebSocket(this.server);

    this.ws.on('open', () => {
      this._retries = 0;
      this._connected = true;
      this.ws.send(JSON.stringify({
        type: 'pod',
        name: this.name,
        universeId: this.universeId,
        code: this.code,
        podId: this.podId,
      }));
      this._flush();
    });

    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        if (msg.type === 'REGISTERED') this.podId = msg.podId;
      } catch { /* ignore */ }
    });

    this.ws.on('close', () => {
      this._connected = false;
      this._reconnect();
    });

    this.ws.on('error', (err) => {
      if (process.env.POD_DEBUG) console.error(`[pod:${this.name}] ws error: ${err.message}`);
    });
  }

  _reconnect() {
    if (this._retries >= this._maxRetries) return;
    const delay = Math.pow(2, this._retries) * 1000;
    this._retries++;
    setTimeout(() => this._open(), delay);
  }

  _send(data) {
    const payload = JSON.stringify(data);
    if (this._connected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
    } else {
      this._queue.push(payload);
    }
  }

  _flush() {
    while (this._queue.length > 0) {
      const payload = this._queue.shift();
      if (this.ws.readyState === WebSocket.OPEN) this.ws.send(payload);
    }
  }

  log(message) {
    this._send({ type: 'LOG', message: String(message) });
    return this;
  }

  metric({ cpu = 0, memory = 0, uptime = 0 } = {}) {
    this._send({ type: 'METRIC', metrics: { cpu, memory, uptime } });
    return this;
  }

  sendCode(filepath) {
    try {
      const code = fs.readFileSync(path.resolve(filepath), 'utf8');
      this._send({ type: 'CODE', code });
    } catch (err) {
      this._send({ type: 'LOG', message: `[sendCode error] ${err.message}` });
    }
    return this;
  }

  setStatus(status) {
    const valid = ['running', 'stopped', 'error'];
    if (!valid.includes(status)) throw new Error(`Invalid status: ${status}. Use: ${valid.join(', ')}`);
    this._send({ type: 'STATUS', status });
    return this;
  }

  disconnect() {
    this._maxRetries = 0;
    this._connected = false;
    if (this.ws) this.ws.close();
  }
}

module.exports = Pod;
