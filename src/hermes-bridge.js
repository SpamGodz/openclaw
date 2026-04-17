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

async function checkHermes() {
  if (!HERMES_URL) return false;
  try {
    await axios.get(`${HERMES_URL}/health`, { timeout: 3000 });
    hermesAvailable = true;
    console.log(`[hermes-bridge] Connected to Hermes at ${HERMES_URL}`);
    return true;
  } catch {
    console.log('[hermes-bridge] Hermes not reachable, using Claude fallback');
    return false;
  }
}

async function chatWithHermes(message) {
  const res = await axios.post(`${HERMES_URL}/chat`, { message }, { timeout: 30000 });
  return res.data;
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
      const data = await chatWithHermes(message);
      return { text: data.response || data.message || JSON.stringify(data), actions: [], source: 'hermes' };
    }
    const result = await chatWithClaude(message, serverUrl);
    return { ...result, source: 'claude' };
  } catch (err) {
    console.error('[hermes-bridge] chat error:', err.message);
    return { text: `Error: ${err.message}`, actions: [], source: 'error' };
  }
}

// ── Sync pod events → Hermes memory ──────────────────────────────────────

async function syncEventToHermes(event) {
  if (!hermesAvailable || !HERMES_URL) return;
  try {
    await axios.post(`${HERMES_URL}/memory`, { content: JSON.stringify(event) }, { timeout: 5000 });
  } catch { /* non-critical */ }
}

async function init() {
  await checkHermes();
  if (!hermesAvailable) initClaude();
}

module.exports = { init, chat, syncEventToHermes, executeTool };
