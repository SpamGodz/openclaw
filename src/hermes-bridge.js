'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');

const podManager = require('./pod-manager');
const orchestrator = require('./agent-orchestrator');
const store = require('./business-store');

const HERMES_URL = process.env.HERMES_URL;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

let hermesAvailable = false;
let anthropicClient = null;

// ── Claude tool definitions ────────────────────────────────────────────────

const CLAUDE_TOOLS = [
  {
    name: 'spawn_agent',
    description: 'Spawn an autonomous agent pod in the openclaw hive',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Agent name' },
        instructions: { type: 'string', description: 'What the agent should do' },
        universeId: { type: 'string', description: 'Universe to assign agent to (optional)' },
      },
      required: ['name', 'instructions'],
    },
  },
  {
    name: 'terminate_agent',
    description: 'Terminate a running agent pod',
    input_schema: {
      type: 'object',
      properties: { agentId: { type: 'string', description: 'Agent ID to terminate' } },
      required: ['agentId'],
    },
  },
  {
    name: 'get_system_status',
    description: 'Get current status of all pods and business data summary',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'add_task',
    description: 'Add a task to the business task board',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        universeId: { type: 'string' },
      },
      required: ['title'],
    },
  },
  {
    name: 'add_insight',
    description: 'Post an AI insight to the insights feed on the dashboard',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Insight text' },
        universeId: { type: 'string' },
      },
      required: ['content'],
    },
  },
  {
    name: 'add_lead',
    description: 'Add a lead to the CRM',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        contact: { type: 'string' },
        notes: { type: 'string' },
        stage: { type: 'string', enum: ['prospect', 'qualified', 'closed'] },
        universeId: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'create_universe',
    description: 'Create a new business project universe',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'promote_universe',
    description: 'Promote a universe from prototype to real product status',
    input_schema: {
      type: 'object',
      properties: { universeId: { type: 'string' } },
      required: ['universeId'],
    },
  },
];

// ── Tool execution ────────────────────────────────────────────────────────

function executeTool(name, input, serverUrl) {
  const actions = [];

  switch (name) {
    case 'spawn_agent': {
      const result = orchestrator.spawnAgent({ ...input, serverUrl });
      actions.push({ type: 'agent_spawned', ...result });
      return { result, actions };
    }
    case 'terminate_agent': {
      const ok = orchestrator.terminateAgent(input.agentId);
      return { result: { success: ok }, actions };
    }
    case 'get_system_status': {
      const result = {
        pods: podManager.getSummary(),
        agents: orchestrator.listAgents(),
        business: store.getSummary(),
      };
      return { result, actions };
    }
    case 'add_task': {
      const task = store.addTask(input);
      actions.push({ type: 'task_added', task });
      podManager.broadcastToAll({ type: 'BUSINESS_EVENT', event: 'TASK_ADDED', task });
      return { result: task, actions };
    }
    case 'add_insight': {
      const insight = store.addInsight({ ...input, source: 'claude' });
      actions.push({ type: 'insight_added', insight });
      podManager.broadcastToAll({ type: 'BUSINESS_EVENT', event: 'INSIGHT_ADDED', insight });
      return { result: insight, actions };
    }
    case 'add_lead': {
      const lead = store.addLead(input);
      actions.push({ type: 'lead_added', lead });
      podManager.broadcastToAll({ type: 'BUSINESS_EVENT', event: 'LEAD_ADDED', lead });
      return { result: lead, actions };
    }
    case 'create_universe': {
      const universe = store.addUniverse(input);
      actions.push({ type: 'universe_created', universe });
      podManager.broadcastToAll({ type: 'BUSINESS_EVENT', event: 'UNIVERSE_CREATED', universe });
      return { result: universe, actions };
    }
    case 'promote_universe': {
      const universe = store.promoteUniverse(input.universeId);
      if (universe) {
        actions.push({ type: 'universe_promoted', universe });
        podManager.broadcastToAll({ type: 'BUSINESS_EVENT', event: 'UNIVERSE_PROMOTED', universe });
      }
      return { result: universe || { error: 'Universe not found' }, actions };
    }
    default:
      return { result: { error: `Unknown tool: ${name}` }, actions };
  }
}

// ── Hermes mode ───────────────────────────────────────────────────────────

const HERMES_BRIDGE_URL = HERMES_URL || `http://localhost:${process.env.HERMES_BRIDGE_PORT || 8000}`;

async function checkHermes() {
  const url = HERMES_URL || HERMES_BRIDGE_URL;
  try {
    const res = await axios.get(`${url}/health`, { timeout: 3000 });
    if (res.data && res.data.status === 'ok') {
      hermesAvailable = true;
      const hermesReady = res.data.hermes !== false;
      console.log(`[hermes-bridge] Connected to Hermes bridge at ${url}`);
      if (!hermesReady) {
        console.log('[hermes-bridge] WARNING: Hermes Agent not installed in bridge — run: openclaw hermes-setup');
      }
      return true;
    }
  } catch {
    if (HERMES_URL) {
      console.log(`[hermes-bridge] Hermes bridge not reachable at ${HERMES_URL}, using Claude fallback`);
    } else {
      console.log('[hermes-bridge] No Hermes bridge running, using Claude fallback');
    }
  }
  return false;
}

async function chatWithHermes(message, serverUrl) {
  const url = HERMES_URL || HERMES_BRIDGE_URL;
  // Hermes calls can take a while — 120s timeout
  const res = await axios.post(`${url}/chat`, { message }, { timeout: 120000 });
  const data = res.data;

  // Bridge returns { response, actions } where actions come from [OPENCLAW:...] tags
  const text = data.response || data.message || JSON.stringify(data);
  const hermesActions = Array.isArray(data.actions) ? data.actions : [];

  // Execute any openclaw actions Hermes requested
  const executedActions = [];
  for (const action of hermesActions) {
    try {
      const { result, actions } = executeTool(action.type, action, serverUrl);
      executedActions.push(...actions);
    } catch (err) {
      console.error(`[hermes-bridge] Action ${action.type} failed:`, err.message);
    }
  }

  return { text, actions: executedActions };
}

// ── Claude fallback mode ──────────────────────────────────────────────────

function initClaude() {
  if (!ANTHROPIC_API_KEY) {
    console.log('[hermes-bridge] No ANTHROPIC_API_KEY — chat panel will echo only');
    return;
  }
  anthropicClient = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  console.log('[hermes-bridge] Claude fallback mode active');
}

async function chatWithClaude(message, serverUrl) {
  if (!anthropicClient) {
    return { text: 'No AI configured. Set ANTHROPIC_API_KEY or HERMES_URL to enable chat.', actions: [] };
  }

  const messages = [{ role: 'user', content: message }];
  const allActions = [];

  const systemPrompt = `You are the master root of the openclaw hive — an AI-powered pod dashboard and business operating system. You control microservice pods, manage business tasks, track leads, create project universes, and post insights. Use your tools to interact with the live system when appropriate. Be concise and action-oriented.`;

  let response = await anthropicClient.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    tools: CLAUDE_TOOLS,
    messages,
  });

  while (response.stop_reason === 'tool_use') {
    const toolUses = response.content.filter(b => b.type === 'tool_use');
    const toolResults = [];

    for (const tu of toolUses) {
      const { result, actions } = executeTool(tu.name, tu.input, serverUrl);
      allActions.push(...actions);
      toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) });
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });

    response = await anthropicClient.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      tools: CLAUDE_TOOLS,
      messages,
    });
  }

  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return { text, actions: allActions };
}

// ── Main chat entry point ─────────────────────────────────────────────────

async function chat(message, serverUrl) {
  try {
    if (hermesAvailable) {
      const result = await chatWithHermes(message, serverUrl);
      return { ...result, source: 'hermes' };
    }
    const result = await chatWithClaude(message, serverUrl);
    return { ...result, source: 'claude' };
  } catch (err) {
    console.error('[hermes-bridge] chat error:', err.message);
    // On Hermes timeout/error, fall through to Claude if available
    if (hermesAvailable && anthropicClient) {
      console.log('[hermes-bridge] Falling back to Claude after Hermes error');
      try {
        const result = await chatWithClaude(message, serverUrl);
        return { ...result, source: 'claude' };
      } catch { /* ignore */ }
    }
    return { text: `AI error: ${err.message}`, actions: [], source: 'error' };
  }
}

// ── Sync pod events → Hermes memory ──────────────────────────────────────

async function syncEventToHermes(event) {
  if (!hermesAvailable) return;
  const url = HERMES_URL || HERMES_BRIDGE_URL;
  try {
    const summary = summariseEvent(event);
    if (summary) {
      await axios.post(`${url}/memory`, { content: summary }, { timeout: 5000 });
    }
  } catch { /* non-critical — don't let memory sync break anything */ }
}

function summariseEvent(event) {
  if (!event || !event.type) return null;
  if (event.type === 'POD_EVENT') {
    const p = event.pod || {};
    const ev = event.event;
    if (ev === 'JOINED') return `Pod joined hive: ${p.name} (id=${p.id}, universe=${p.universeId || 'none'})`;
    if (ev === 'STATUS') return `Pod ${event.podId} status → ${event.status}`;
    if (ev === 'LOG') return `Pod ${event.podId} log: ${event.entry?.msg}`;
    if (ev === 'METRIC') return `Pod ${event.podId} metrics: cpu=${event.metrics?.cpu}% mem=${event.metrics?.memory}MB`;
  }
  if (event.type === 'BUSINESS_EVENT') {
    const ev = event.event;
    if (ev === 'TASK_ADDED') return `Task added: "${event.task?.title}"`;
    if (ev === 'LEAD_ADDED') return `New lead: ${event.lead?.name} (${event.lead?.stage})`;
    if (ev === 'UNIVERSE_CREATED') return `Universe created: "${event.universe?.name}"`;
    if (ev === 'UNIVERSE_PROMOTED') return `Universe promoted to real: "${event.universe?.name}"`;
    if (ev === 'INSIGHT_ADDED') return `Insight posted: ${event.insight?.content?.slice(0, 80)}`;
  }
  return null;
}

async function init() {
  await checkHermes();
  // Always init Claude as fallback (used when Hermes unavailable or errors)
  initClaude();
}

module.exports = { init, chat, syncEventToHermes, executeTool };
