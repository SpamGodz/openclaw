'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../data');
const STORE_FILE = path.join(DATA_DIR, 'business-store.json');

const EMPTY_STORE = {
  tasks: [],
  goals: [],
  leads: [],
  universes: [],
  insights: [],
};

let store = null;

function load() {
  if (store) return store;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(STORE_FILE)) {
    try {
      store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    } catch {
      store = structuredClone(EMPTY_STORE);
    }
  } else {
    store = structuredClone(EMPTY_STORE);
  }
  for (const key of Object.keys(EMPTY_STORE)) {
    if (!store[key]) store[key] = [];
  }
  return store;
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

function id() {
  return crypto.randomBytes(6).toString('hex');
}

function now() {
  return new Date().toISOString();
}

// ── Tasks ──────────────────────────────────────────────────────────────────

function getTasks(universeId) {
  const s = load();
  return universeId ? s.tasks.filter(t => t.universeId === universeId) : s.tasks;
}

function addTask({ title, description = '', status = 'todo', universeId = null }) {
  const s = load();
  const task = { id: id(), title, description, status, universeId, createdAt: now() };
  s.tasks.push(task);
  save();
  return task;
}

function updateTask(taskId, updates) {
  const s = load();
  const idx = s.tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return null;
  s.tasks[idx] = { ...s.tasks[idx], ...updates };
  save();
  return s.tasks[idx];
}

function deleteTask(taskId) {
  const s = load();
  const idx = s.tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return false;
  s.tasks.splice(idx, 1);
  save();
  return true;
}

// ── Goals ──────────────────────────────────────────────────────────────────

function getGoals(universeId) {
  const s = load();
  return universeId ? s.goals.filter(g => g.universeId === universeId) : s.goals;
}

function addGoal({ title, target, current = 0, universeId = null }) {
  const s = load();
  const goal = { id: id(), title, target, current, universeId, createdAt: now() };
  s.goals.push(goal);
  save();
  return goal;
}

function updateGoal(goalId, updates) {
  const s = load();
  const idx = s.goals.findIndex(g => g.id === goalId);
  if (idx === -1) return null;
  s.goals[idx] = { ...s.goals[idx], ...updates };
  save();
  return s.goals[idx];
}

// ── Leads ──────────────────────────────────────────────────────────────────

function getLeads(universeId) {
  const s = load();
  return universeId ? s.leads.filter(l => l.universeId === universeId) : s.leads;
}

function addLead({ name, contact = '', notes = '', stage = 'prospect', universeId = null }) {
  const s = load();
  const lead = { id: id(), name, contact, notes, stage, universeId, createdAt: now() };
  s.leads.push(lead);
  save();
  return lead;
}

function updateLead(leadId, updates) {
  const s = load();
  const idx = s.leads.findIndex(l => l.id === leadId);
  if (idx === -1) return null;
  s.leads[idx] = { ...s.leads[idx], ...updates };
  save();
  return s.leads[idx];
}

function deleteLead(leadId) {
  const s = load();
  const idx = s.leads.findIndex(l => l.id === leadId);
  if (idx === -1) return false;
  s.leads.splice(idx, 1);
  save();
  return true;
}

// ── Universes ─────────────────────────────────────────────────────────────

function getUniverses() {
  return load().universes;
}

function addUniverse({ name, description = '' }) {
  const s = load();
  const universe = { id: id(), name, description, status: 'prototype', createdAt: now() };
  s.universes.push(universe);
  save();
  return universe;
}

function promoteUniverse(universeId) {
  const s = load();
  const idx = s.universes.findIndex(u => u.id === universeId);
  if (idx === -1) return null;
  s.universes[idx].status = 'real';
  s.universes[idx].promotedAt = now();
  save();
  return s.universes[idx];
}

function updateUniverse(universeId, updates) {
  const s = load();
  const idx = s.universes.findIndex(u => u.id === universeId);
  if (idx === -1) return null;
  s.universes[idx] = { ...s.universes[idx], ...updates };
  save();
  return s.universes[idx];
}

// ── Insights ──────────────────────────────────────────────────────────────

function getInsights(limit = 50) {
  const s = load();
  return [...s.insights].reverse().slice(0, limit);
}

function addInsight({ content, source = 'claude', universeId = null }) {
  const s = load();
  const insight = { id: id(), content, source, universeId, createdAt: now() };
  s.insights.push(insight);
  save();
  return insight;
}

// ── Summary (for Hermes context) ──────────────────────────────────────────

function getSummary() {
  const s = load();
  return {
    tasks: { total: s.tasks.length, byStatus: groupCount(s.tasks, 'status') },
    goals: s.goals.length,
    leads: { total: s.leads.length, byStage: groupCount(s.leads, 'stage') },
    universes: { total: s.universes.length, real: s.universes.filter(u => u.status === 'real').length },
    insights: s.insights.length,
  };
}

function groupCount(arr, key) {
  return arr.reduce((acc, item) => {
    acc[item[key]] = (acc[item[key]] || 0) + 1;
    return acc;
  }, {});
}

module.exports = {
  getTasks, addTask, updateTask, deleteTask,
  getGoals, addGoal, updateGoal,
  getLeads, addLead, updateLead, deleteLead,
  getUniverses, addUniverse, promoteUniverse, updateUniverse,
  getInsights, addInsight,
  getSummary,
  load,
};
