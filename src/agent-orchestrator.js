'use strict';

const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');

const podManager = require('./pod-manager');

const activeAgents = new Map();

function spawnAgent({ name, instructions, universeId = null, serverUrl }) {
  const agentId = crypto.randomBytes(6).toString('hex');
  const agentName = name || `agent-${agentId}`;
  const wsUrl = serverUrl || `ws://localhost:${process.env.PORT || 3000}`;

  const agentScript = `
'use strict';
const Pod = require(${JSON.stringify(path.resolve(__dirname, '../sdk/pod.js'))});
const pod = new Pod({
  name: ${JSON.stringify(agentName)},
  server: ${JSON.stringify(wsUrl)},
  universeId: ${JSON.stringify(universeId)},
});

pod.connect();
pod.log('Agent started: ${agentName}');

const instructions = ${JSON.stringify(instructions || 'Monitor and report system status.')};
pod.log('Instructions: ' + instructions);

let tick = 0;
const interval = setInterval(() => {
  tick++;
  pod.metric({ cpu: Math.random() * 20, memory: Math.floor(20 + Math.random() * 30), uptime: tick });
  if (tick % 10 === 0) pod.log('Heartbeat #' + tick);
}, 5000);

process.on('SIGTERM', () => {
  clearInterval(interval);
  pod.setStatus('stopped');
  pod.log('Agent shutting down');
  setTimeout(() => process.exit(0), 500);
});
`;

  const child = spawn(process.execPath, ['--eval', agentScript], {
    cwd: path.resolve(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  child.stdout.on('data', d => process.stdout.write(`[agent:${agentName}] ${d}`));
  child.stderr.on('data', d => process.stderr.write(`[agent:${agentName}] ${d}`));

  child.on('exit', (code) => {
    activeAgents.delete(agentId);
    podManager.broadcastToAll({ type: 'AGENT_EVENT', event: 'EXITED', agentId, agentName, code });
  });

  activeAgents.set(agentId, { id: agentId, name: agentName, process: child, universeId });
  podManager.broadcastToAll({ type: 'AGENT_EVENT', event: 'SPAWNED', agentId, agentName, universeId });

  return { agentId, name: agentName };
}

function terminateAgent(agentId) {
  const agent = activeAgents.get(agentId);
  if (!agent) return false;
  agent.process.kill('SIGTERM');
  activeAgents.delete(agentId);
  return true;
}

function listAgents() {
  return Array.from(activeAgents.values()).map(({ id, name, universeId }) => ({ id, name, universeId }));
}

module.exports = { spawnAgent, terminateAgent, listAgents };
