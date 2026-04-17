'use strict';

// ── State ──────────────────────────────────────────────────────────────────

const state = {
  pods: {},
  selectedPodId: null,
  selectedUniverseId: null,
  tasks: [],
  goals: [],
  leads: [],
  universes: [],
  insights: [],
  ws: null,
  wsReady: false,
};

// ── WebSocket ──────────────────────────────────────────────────────────────

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}`);
  state.ws = ws;

  ws.onopen = () => {
    state.wsReady = true;
    ws.send(JSON.stringify({ type: 'browser' }));
    setHermesStatus('connected');
  };

  ws.onclose = () => {
    state.wsReady = false;
    setHermesStatus('disconnected');
    setTimeout(connectWS, 3000);
  };

  ws.onerror = () => setHermesStatus('error');

  ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    handleServerMessage(msg);
  };
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case 'INIT':
      msg.pods.forEach(pod => { state.pods[pod.id] = pod; });
      renderPodList();
      break;

    case 'POD_EVENT':
      handlePodEvent(msg);
      break;

    case 'BUSINESS_EVENT':
      handleBusinessEvent(msg);
      break;

    case 'AGENT_EVENT':
      break;

    case 'CHAT_THINKING':
      appendChatMessage('ai', '...', [], true);
      break;

    case 'CHAT_RESPONSE':
      removeThinking();
      appendChatMessage('ai', msg.text || '', msg.actions || [], false, msg.source);
      break;
  }
}

// ── Pod events ─────────────────────────────────────────────────────────────

function handlePodEvent(msg) {
  switch (msg.event) {
    case 'JOINED':
      state.pods[msg.pod.id] = msg.pod;
      renderPodList();
      break;
    case 'LOG': {
      const pod = state.pods[msg.podId];
      if (pod) pod.logs.push(msg.entry);
      if (state.selectedPodId === msg.podId) appendLog(msg.entry);
      break;
    }
    case 'METRIC': {
      const pod = state.pods[msg.podId];
      if (pod) pod.metrics = msg.metrics;
      if (state.selectedPodId === msg.podId) updateMetricsUI(msg.metrics);
      break;
    }
    case 'CODE': {
      const pod = state.pods[msg.podId];
      if (pod) pod.code = msg.code;
      if (state.selectedPodId === msg.podId) updateCodeUI(msg.code);
      break;
    }
    case 'STATUS': {
      const pod = state.pods[msg.podId];
      if (pod) pod.status = msg.status;
      renderPodList();
      if (state.selectedPodId === msg.podId) updateDetailStatus(msg.status);
      break;
    }
  }
}

// ── Business events ────────────────────────────────────────────────────────

function handleBusinessEvent(msg) {
  switch (msg.event) {
    case 'TASK_ADDED':
      state.tasks.push(msg.task);
      renderTasks();
      break;
    case 'TASK_UPDATED': {
      const idx = state.tasks.findIndex(t => t.id === msg.task.id);
      if (idx !== -1) state.tasks[idx] = msg.task;
      renderTasks();
      break;
    }
    case 'TASK_DELETED':
      state.tasks = state.tasks.filter(t => t.id !== msg.taskId);
      renderTasks();
      break;
    case 'LEAD_ADDED':
      state.leads.push(msg.lead);
      renderCRM();
      break;
    case 'LEAD_UPDATED': {
      const idx = state.leads.findIndex(l => l.id === msg.lead.id);
      if (idx !== -1) state.leads[idx] = msg.lead;
      renderCRM();
      break;
    }
    case 'LEAD_DELETED':
      state.leads = state.leads.filter(l => l.id !== msg.leadId);
      renderCRM();
      break;
    case 'UNIVERSE_CREATED':
      state.universes.push(msg.universe);
      renderUniverses();
      renderUniverseSelect();
      break;
    case 'UNIVERSE_PROMOTED': {
      const idx = state.universes.findIndex(u => u.id === msg.universe.id);
      if (idx !== -1) state.universes[idx] = msg.universe;
      renderUniverses();
      break;
    }
    case 'INSIGHT_ADDED':
      state.insights.unshift(msg.insight);
      renderInsights();
      break;
    case 'GOAL_UPDATED': {
      const idx = state.goals.findIndex(g => g.id === msg.goal.id);
      if (idx !== -1) state.goals[idx] = msg.goal;
      renderGoals();
      break;
    }
  }
}

// ── Pod list (sidebar) ─────────────────────────────────────────────────────

function renderPodList() {
  const list = document.getElementById('pod-list');
  const pods = Object.values(state.pods)
    .filter(p => !state.selectedUniverseId || p.universeId === state.selectedUniverseId);

  list.innerHTML = pods.length === 0
    ? `<div style="padding:16px;color:var(--text2);font-size:12px">No pods connected</div>`
    : pods.map(pod => `
      <div class="pod-item ${state.selectedPodId === pod.id ? 'selected' : ''}" data-podid="${pod.id}">
        <div class="pod-dot ${pod.status || 'disconnected'}"></div>
        <div>
          <div class="pod-name">${esc(pod.name)}</div>
          ${pod.universeId ? `<div class="pod-universe">${esc(pod.universeId)}</div>` : ''}
        </div>
      </div>
    `).join('');

  list.querySelectorAll('.pod-item').forEach(el => {
    el.addEventListener('click', () => selectPod(el.dataset.podid));
  });

  document.getElementById('pod-count').textContent =
    `${pods.length} pod${pods.length !== 1 ? 's' : ''}`;
}

function selectPod(podId) {
  state.selectedPodId = podId;
  const pod = state.pods[podId];
  if (!pod) return;

  renderPodList();

  document.getElementById('no-pod-selected').style.display = 'none';
  document.getElementById('pod-detail').style.display = 'block';
  document.getElementById('detail-name').textContent = pod.name;

  updateDetailStatus(pod.status || 'disconnected');
  renderLogs(pod.logs || []);
  updateMetricsUI(pod.metrics || {});
  updateCodeUI(pod.code);
}

function updateDetailStatus(status) {
  const el = document.getElementById('detail-status');
  el.textContent = status;
  el.className = `pod-detail-status ${status}`;
}

// ── Logs ───────────────────────────────────────────────────────────────────

function renderLogs(logs) {
  const out = document.getElementById('log-output');
  out.innerHTML = logs.map(e => logEntryHTML(e)).join('');
  out.scrollTop = out.scrollHeight;
}

function appendLog(entry) {
  const out = document.getElementById('log-output');
  const div = document.createElement('div');
  div.innerHTML = logEntryHTML(entry);
  out.appendChild(div.firstElementChild);
  out.scrollTop = out.scrollHeight;
}

function logEntryHTML(entry) {
  const ts = entry.ts ? new Date(entry.ts).toLocaleTimeString() : '';
  return `<div class="log-entry"><span class="log-ts">${ts}</span><span class="log-msg">${esc(entry.msg)}</span></div>`;
}

// ── Metrics ────────────────────────────────────────────────────────────────

function updateMetricsUI({ cpu = 0, memory = 0, uptime = 0 } = {}) {
  document.getElementById('m-cpu').textContent = Number(cpu).toFixed(1);
  document.getElementById('m-mem').textContent = Number(memory).toFixed(0);
  document.getElementById('m-uptime').textContent = Number(uptime).toFixed(0);
  document.getElementById('bar-cpu').style.width = `${Math.min(cpu, 100)}%`;
  document.getElementById('bar-mem').style.width = `${Math.min(memory / 512 * 100, 100)}%`;
}

// ── Code ───────────────────────────────────────────────────────────────────

function updateCodeUI(code) {
  const block = document.getElementById('code-block');
  block.textContent = code || '// No code received yet.';
  if (window.hljs) hljs.highlightElement(block);
}

// ── Chat ───────────────────────────────────────────────────────────────────

function sendChat() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text || !state.wsReady) return;

  appendChatMessage('user', text, []);
  state.ws.send(JSON.stringify({ type: 'chat', message: text }));
  input.value = '';
  document.getElementById('chat-send').disabled = true;
}

function appendChatMessage(role, text, actions = [], thinking = false, source = null) {
  const wrap = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = `chat-msg ${role}${thinking ? ' chat-thinking-wrap' : ''}`;

  const avatarText = role === 'user' ? 'U' : (source === 'hermes' ? 'H' : 'C');
  const actionsHTML = actions.length ? `<div class="chat-actions">${actions.map(a =>
    `<span class="action-tag">${esc(actionLabel(a))}</span>`).join('')}</div>` : '';

  const sourceTag = source && role === 'ai' ? `<span style="font-size:10px;color:var(--text2);margin-left:6px">${source}</span>` : '';

  div.innerHTML = `
    <div class="chat-avatar">${avatarText}</div>
    <div class="chat-bubble">
      ${thinking ? '<span class="chat-thinking">thinking...</span>' : esc(text).replace(/\n/g, '<br>')}
      ${actionsHTML}
      ${sourceTag}
    </div>
  `;
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

function removeThinking() {
  const el = document.querySelector('.chat-thinking-wrap');
  if (el) el.remove();
  document.getElementById('chat-send').disabled = false;
}

function actionLabel(action) {
  const map = {
    agent_spawned: `Spawned: ${action.name}`,
    task_added: `Task: ${action.task?.title}`,
    insight_added: `Insight posted`,
    lead_added: `Lead: ${action.lead?.name}`,
    universe_created: `Universe: ${action.universe?.name}`,
    universe_promoted: `Promoted: ${action.universe?.name}`,
  };
  return map[action.type] || action.type;
}

// ── Tasks ──────────────────────────────────────────────────────────────────

function renderTasks() {
  const filtered = state.selectedUniverseId
    ? state.tasks.filter(t => t.universeId === state.selectedUniverseId)
    : state.tasks;

  const byStatus = { todo: [], 'in-progress': [], done: [] };
  filtered.forEach(t => { (byStatus[t.status] || byStatus.todo).push(t); });

  document.getElementById('col-todo').innerHTML = byStatus.todo.map(taskCardHTML).join('');
  document.getElementById('col-inprogress').innerHTML = byStatus['in-progress'].map(taskCardHTML).join('');
  document.getElementById('col-done').innerHTML = byStatus.done.map(taskCardHTML).join('');

  document.getElementById('todo-count').textContent = byStatus.todo.length;
  document.getElementById('inprogress-count').textContent = byStatus['in-progress'].length;
  document.getElementById('done-count').textContent = byStatus.done.length;

  document.querySelectorAll('.task-card').forEach(el => {
    el.addEventListener('click', () => cycleTaskStatus(el.dataset.taskid));
  });

  renderGoals();
}

function taskCardHTML(task) {
  return `<div class="task-card" data-taskid="${task.id}">
    <div class="task-title">${esc(task.title)}</div>
    ${task.description ? `<div class="task-desc">${esc(task.description)}</div>` : ''}
  </div>`;
}

function cycleTaskStatus(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  const order = ['todo', 'in-progress', 'done'];
  const next = order[(order.indexOf(task.status) + 1) % order.length];
  fetch(`/api/business/tasks/${taskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: next }),
  });
}

function renderGoals() {
  const filtered = state.selectedUniverseId
    ? state.goals.filter(g => g.universeId === state.selectedUniverseId)
    : state.goals;
  const list = document.getElementById('goals-list');
  list.innerHTML = filtered.length === 0
    ? `<div class="empty-state" style="padding:16px 0">No goals yet. Ask the hive to create some.</div>`
    : filtered.map(g => {
        const pct = g.target > 0 ? Math.min(g.current / g.target * 100, 100) : 0;
        return `<div class="goal-item">
          <div class="goal-header"><span>${esc(g.title)}</span><span style="color:var(--text2)">${g.current} / ${g.target}</span></div>
          <div class="goal-progress-wrap"><div class="goal-progress" style="width:${pct}%"></div></div>
        </div>`;
      }).join('');
}

// ── Insights ───────────────────────────────────────────────────────────────

function renderInsights() {
  const list = document.getElementById('insights-list');
  const filtered = state.selectedUniverseId
    ? state.insights.filter(i => !i.universeId || i.universeId === state.selectedUniverseId)
    : state.insights;
  list.innerHTML = filtered.length === 0
    ? `<div class="empty-state">No insights yet. The hive is thinking...</div>`
    : filtered.map(i => `
      <div class="insight-card ${i.source === 'hermes' ? 'hermes' : ''}">
        <div class="insight-meta">
          <span class="insight-source ${i.source === 'hermes' ? 'hermes' : ''}">${i.source || 'ai'}</span>
          <span>${new Date(i.createdAt).toLocaleString()}</span>
        </div>
        <div class="insight-body">${esc(i.content)}</div>
      </div>
    `).join('');
}

// ── CRM ────────────────────────────────────────────────────────────────────

function renderCRM() {
  const filtered = state.selectedUniverseId
    ? state.leads.filter(l => l.universeId === state.selectedUniverseId)
    : state.leads;
  const byStage = { prospect: [], qualified: [], closed: [] };
  filtered.forEach(l => { (byStage[l.stage] || byStage.prospect).push(l); });

  document.getElementById('crm-prospect').innerHTML = byStage.prospect.map(leadCardHTML).join('');
  document.getElementById('crm-qualified').innerHTML = byStage.qualified.map(leadCardHTML).join('');
  document.getElementById('crm-closed').innerHTML = byStage.closed.map(leadCardHTML).join('');

  document.querySelectorAll('.lead-card').forEach(el => {
    el.addEventListener('click', () => cycleLeadStage(el.dataset.leadid));
  });
}

function leadCardHTML(lead) {
  return `<div class="lead-card" data-leadid="${lead.id}">
    <div class="lead-name">${esc(lead.name)}</div>
    ${lead.contact ? `<div class="lead-contact">${esc(lead.contact)}</div>` : ''}
    ${lead.notes ? `<div class="lead-notes">${esc(lead.notes)}</div>` : ''}
  </div>`;
}

function cycleLeadStage(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;
  const order = ['prospect', 'qualified', 'closed'];
  const next = order[(order.indexOf(lead.stage) + 1) % order.length];
  fetch(`/api/business/leads/${leadId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage: next }),
  });
}

// ── Universes ──────────────────────────────────────────────────────────────

function renderUniverses() {
  const grid = document.getElementById('universes-grid');
  grid.innerHTML = state.universes.map(u => `
    <div class="universe-card">
      <span class="universe-badge ${u.status}">${u.status}</span>
      <div class="universe-name">${esc(u.name)}</div>
      <div class="universe-desc">${esc(u.description || 'No description')}</div>
      <div class="universe-actions">
        ${u.status === 'prototype'
          ? `<button class="btn-promote" data-uid="${u.id}">Promote to Real</button>`
          : ''}
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.btn-promote').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      fetch(`/api/business/universes/${btn.dataset.uid}/promote`, { method: 'POST' });
    });
  });
}

function renderUniverseSelect() {
  const sel = document.getElementById('universe-select');
  const current = sel.value;
  sel.innerHTML = `<option value="">All Universes</option>` +
    state.universes.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
  sel.value = current;
}

// ── Data loading ───────────────────────────────────────────────────────────

async function loadBusinessData() {
  const [tasks, goals, leads, universes, insights] = await Promise.all([
    fetch('/api/business/tasks').then(r => r.json()),
    fetch('/api/business/goals').then(r => r.json()),
    fetch('/api/business/leads').then(r => r.json()),
    fetch('/api/business/universes').then(r => r.json()),
    fetch('/api/business/insights').then(r => r.json()),
  ]);
  state.tasks = tasks;
  state.goals = goals;
  state.leads = leads;
  state.universes = universes;
  state.insights = insights;
  renderTasks();
  renderCRM();
  renderUniverses();
  renderUniverseSelect();
  renderInsights();
}

// ── Hermes status ──────────────────────────────────────────────────────────

function setHermesStatus(status) {
  const dot = document.getElementById('hermes-dot');
  const label = document.getElementById('hermes-label');
  if (status === 'connected') {
    dot.classList.add('connected');
    label.textContent = 'hive connected';
  } else {
    dot.classList.remove('connected');
    label.textContent = status === 'disconnected' ? 'reconnecting...' : 'connection error';
  }
}

// ── Modals ─────────────────────────────────────────────────────────────────

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ── Utility ────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Event listeners ────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  connectWS();
  loadBusinessData();

  // Nav tabs
  document.getElementById('nav').addEventListener('click', e => {
    const tab = e.target.closest('.nav-tab');
    if (!tab) return;
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`panel-${tab.dataset.panel}`).classList.add('active');
  });

  // Pod sub-tabs
  document.addEventListener('click', e => {
    const tab = e.target.closest('.pod-tab');
    if (!tab) return;
    const container = tab.closest('.pod-tabs').parentElement;
    container.querySelectorAll('.pod-tab').forEach(t => t.classList.remove('active'));
    container.querySelectorAll('.pod-tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    const content = container.querySelector(`#tab-${tab.dataset.tab}`);
    if (content) content.classList.add('active');
  });

  // Universe filter
  document.getElementById('universe-select').addEventListener('change', e => {
    state.selectedUniverseId = e.target.value || null;
    renderPodList();
    renderTasks();
    renderCRM();
    renderUniverses();
    renderInsights();
  });

  // Chat
  document.getElementById('chat-send').addEventListener('click', sendChat);
  document.getElementById('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });

  // Add task
  document.getElementById('btn-add-task').addEventListener('click', () => openModal('modal-task'));
  document.getElementById('cancel-task').addEventListener('click', () => closeModal('modal-task'));
  document.getElementById('submit-task').addEventListener('click', () => {
    const title = document.getElementById('task-title').value.trim();
    const description = document.getElementById('task-desc').value.trim();
    if (!title) return;
    fetch('/api/business/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, universeId: state.selectedUniverseId }),
    }).then(() => {
      document.getElementById('task-title').value = '';
      document.getElementById('task-desc').value = '';
      closeModal('modal-task');
    });
  });

  // Create universe
  document.getElementById('btn-create-universe').addEventListener('click', () => openModal('modal-universe'));
  document.getElementById('cancel-universe').addEventListener('click', () => closeModal('modal-universe'));
  document.getElementById('submit-universe').addEventListener('click', () => {
    const name = document.getElementById('universe-name').value.trim();
    const description = document.getElementById('universe-desc').value.trim();
    if (!name) return;
    fetch('/api/business/universes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    }).then(() => {
      document.getElementById('universe-name').value = '';
      document.getElementById('universe-desc').value = '';
      closeModal('modal-universe');
    });
  });

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
});
