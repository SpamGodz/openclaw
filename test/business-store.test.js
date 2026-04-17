'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Use a unique temp dir per test run so tests never touch real data
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-test-'));
process.env.DATA_DIR = tmpDir;

// Require AFTER setting DATA_DIR so the module picks up the temp path
const store = require('../src/business-store');

function resetStore() {
  // Clear the in-memory cache by deleting the store file and re-requiring
  // business-store caches the store in a module-level variable, so we need
  // to manipulate the file and call load() via getSummary to force reload.
  const storeFile = path.join(tmpDir, 'business-store.json');
  if (fs.existsSync(storeFile)) fs.unlinkSync(storeFile);
  // Reset module-level `store` variable by poking it through load()
  const s = store.load();
  s.tasks = [];
  s.goals = [];
  s.leads = [];
  s.universes = [];
  s.insights = [];
  // Save empty state
  fs.writeFileSync(storeFile, JSON.stringify(s, null, 2));
}

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Tasks ──────────────────────────────────────────────────────────────────

test('tasks: add and retrieve', () => {
  resetStore();
  const t = store.addTask({ title: 'Ship it', description: 'Deploy today' });
  assert.equal(t.title, 'Ship it');
  assert.equal(t.status, 'todo');
  assert.ok(t.id);
  assert.ok(t.createdAt);

  const tasks = store.getTasks();
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, t.id);
});

test('tasks: filter by universeId', () => {
  resetStore();
  store.addTask({ title: 'Task A', universeId: 'u1' });
  store.addTask({ title: 'Task B', universeId: 'u2' });
  store.addTask({ title: 'Task C' });

  assert.equal(store.getTasks('u1').length, 1);
  assert.equal(store.getTasks('u2').length, 1);
  assert.equal(store.getTasks().length, 3);
});

test('tasks: update status', () => {
  resetStore();
  const t = store.addTask({ title: 'Work item' });
  const updated = store.updateTask(t.id, { status: 'in-progress' });
  assert.equal(updated.status, 'in-progress');
  assert.equal(store.getTasks()[0].status, 'in-progress');
});

test('tasks: updateTask returns null for unknown id', () => {
  resetStore();
  const result = store.updateTask('nonexistent', { status: 'done' });
  assert.equal(result, null);
});

test('tasks: delete', () => {
  resetStore();
  const t = store.addTask({ title: 'Delete me' });
  assert.equal(store.getTasks().length, 1);
  const ok = store.deleteTask(t.id);
  assert.equal(ok, true);
  assert.equal(store.getTasks().length, 0);
});

test('tasks: deleteTask returns false for unknown id', () => {
  resetStore();
  assert.equal(store.deleteTask('ghost'), false);
});

// ── Goals ──────────────────────────────────────────────────────────────────

test('goals: add and retrieve', () => {
  resetStore();
  const g = store.addGoal({ title: 'Hit 1k users', target: 1000, current: 250 });
  assert.equal(g.title, 'Hit 1k users');
  assert.equal(g.target, 1000);
  assert.equal(g.current, 250);

  const goals = store.getGoals();
  assert.equal(goals.length, 1);
});

test('goals: update current progress', () => {
  resetStore();
  const g = store.addGoal({ title: 'Revenue goal', target: 5000, current: 0 });
  const updated = store.updateGoal(g.id, { current: 2500 });
  assert.equal(updated.current, 2500);
});

test('goals: updateGoal returns null for unknown id', () => {
  resetStore();
  assert.equal(store.updateGoal('ghost', { current: 1 }), null);
});

// ── Leads ──────────────────────────────────────────────────────────────────

test('leads: add with defaults', () => {
  resetStore();
  const l = store.addLead({ name: 'Acme Corp' });
  assert.equal(l.name, 'Acme Corp');
  assert.equal(l.stage, 'prospect');
  assert.equal(l.contact, '');
  assert.ok(l.id);
});

test('leads: update stage', () => {
  resetStore();
  const l = store.addLead({ name: 'BigCo', stage: 'prospect' });
  const updated = store.updateLead(l.id, { stage: 'qualified' });
  assert.equal(updated.stage, 'qualified');
});

test('leads: delete', () => {
  resetStore();
  const l = store.addLead({ name: 'Remove me' });
  assert.equal(store.deleteTask('x'), false); // sanity
  assert.equal(store.deleteLead(l.id), true);
  assert.equal(store.getLeads().length, 0);
});

test('leads: filter by universeId', () => {
  resetStore();
  store.addLead({ name: 'Lead 1', universeId: 'uA' });
  store.addLead({ name: 'Lead 2', universeId: 'uB' });
  assert.equal(store.getLeads('uA').length, 1);
  assert.equal(store.getLeads().length, 2);
});

// ── Universes ──────────────────────────────────────────────────────────────

test('universes: add with prototype status', () => {
  resetStore();
  const u = store.addUniverse({ name: 'LaunchPad', description: 'New venture' });
  assert.equal(u.name, 'LaunchPad');
  assert.equal(u.status, 'prototype');
  assert.ok(u.id);
});

test('universes: promote to real', () => {
  resetStore();
  const u = store.addUniverse({ name: 'ReadyApp' });
  const promoted = store.promoteUniverse(u.id);
  assert.equal(promoted.status, 'real');
  assert.ok(promoted.promotedAt);
});

test('universes: promoteUniverse returns null for unknown id', () => {
  resetStore();
  assert.equal(store.promoteUniverse('ghost'), null);
});

test('universes: update name/description', () => {
  resetStore();
  const u = store.addUniverse({ name: 'Old Name' });
  const updated = store.updateUniverse(u.id, { description: 'Updated desc' });
  assert.equal(updated.description, 'Updated desc');
  assert.equal(updated.name, 'Old Name');
});

// ── Insights ──────────────────────────────────────────────────────────────

test('insights: add and retrieve reversed', () => {
  resetStore();
  store.addInsight({ content: 'First insight', source: 'claude' });
  store.addInsight({ content: 'Second insight', source: 'hermes' });
  const insights = store.getInsights();
  assert.equal(insights.length, 2);
  // getInsights returns most-recent first
  assert.equal(insights[0].content, 'Second insight');
  assert.equal(insights[1].content, 'First insight');
});

test('insights: limit respected', () => {
  resetStore();
  for (let i = 0; i < 10; i++) store.addInsight({ content: `Insight ${i}` });
  assert.equal(store.getInsights(3).length, 3);
  assert.equal(store.getInsights(100).length, 10);
});

test('insights: default source is claude', () => {
  resetStore();
  const i = store.addInsight({ content: 'No source given' });
  assert.equal(i.source, 'claude');
});

// ── Summary ────────────────────────────────────────────────────────────────

test('getSummary returns correct counts', () => {
  resetStore();
  store.addTask({ title: 'T1', status: 'todo' });
  store.addTask({ title: 'T2', status: 'done' });
  store.addLead({ name: 'L1', stage: 'prospect' });
  store.addLead({ name: 'L2', stage: 'qualified' });
  store.addUniverse({ name: 'U1' });
  const u2 = store.addUniverse({ name: 'U2' });
  store.promoteUniverse(u2.id);
  store.addInsight({ content: 'insight' });

  const s = store.getSummary();
  assert.equal(s.tasks.total, 2);
  assert.equal(s.tasks.byStatus.todo, 1);
  assert.equal(s.tasks.byStatus.done, 1);
  assert.equal(s.leads.total, 2);
  assert.equal(s.leads.byStage.prospect, 1);
  assert.equal(s.universes.total, 2);
  assert.equal(s.universes.real, 1);
  assert.equal(s.insights, 1);
});

// ── Persistence ────────────────────────────────────────────────────────────

test('data persists to disk and reloads', () => {
  resetStore();
  store.addTask({ title: 'Persisted task' });
  store.addLead({ name: 'Persisted lead' });

  // Re-load from disk by reading the file directly
  const storeFile = path.join(tmpDir, 'business-store.json');
  const raw = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  assert.equal(raw.tasks.length, 1);
  assert.equal(raw.tasks[0].title, 'Persisted task');
  assert.equal(raw.leads.length, 1);
  assert.equal(raw.leads[0].name, 'Persisted lead');
});
