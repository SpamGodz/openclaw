#!/usr/bin/env python3
"""
openclaw Hermes HTTP Bridge
----------------------------
Wraps the Hermes Agent Python SDK (NousResearch/hermes-agent) and exposes a
minimal HTTP API so the openclaw Node.js server can delegate chat to Hermes.

Endpoints:
  GET  /health          - liveness check
  POST /chat            - { "message": "..." } → { "response": "...", "actions": [...] }
  POST /memory          - { "content": "..." } → { "ok": true }

Setup (run once):
  openclaw hermes-setup
  openclaw hermes-bridge
"""

import json
import os
import sys
import re
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler

# ── Locate hermes-agent ───────────────────────────────────────────────────

HERMES_PATH = os.environ.get('HERMES_PATH', os.path.expanduser('~/.hermes-agent'))
BRIDGE_PORT = int(os.environ.get('HERMES_BRIDGE_PORT', 8000))

AIAgent = None

def _try_import():
    global AIAgent
    # 1. Try global install
    try:
        from run_agent import AIAgent as _A
        AIAgent = _A
        return True
    except ImportError:
        pass
    # 2. Try HERMES_PATH (local clone)
    if os.path.isdir(HERMES_PATH):
        sys.path.insert(0, HERMES_PATH)
        try:
            from run_agent import AIAgent as _A
            AIAgent = _A
            return True
        except ImportError:
            sys.path.pop(0)
    return False

HERMES_AVAILABLE = _try_import()

if HERMES_AVAILABLE:
    print(f"[bridge] Hermes Agent loaded from: {'global' if HERMES_PATH not in sys.path[0:1] else HERMES_PATH}")
else:
    print(f"[bridge] WARNING: Could not import hermes run_agent.", file=sys.stderr)
    print(f"[bridge]   Run: openclaw hermes-setup", file=sys.stderr)

# ── Hive context (accumulates pod/business events for Hermes awareness) ───

_hive_context_lock = threading.Lock()
_hive_context_lines = []
MAX_CONTEXT_LINES = 60

def append_context(content: str):
    with _hive_context_lock:
        _hive_context_lines.append(content)
        if len(_hive_context_lines) > MAX_CONTEXT_LINES:
            _hive_context_lines.pop(0)

def get_context() -> str:
    with _hive_context_lock:
        if not _hive_context_lines:
            return ''
        return '\n'.join(_hive_context_lines[-20:])  # last 20 events

# ── Openclaw command protocol ─────────────────────────────────────────────
# Hermes is instructed to include [OPENCLAW:action:arg1:arg2] tags.
# This bridge parses them and returns as structured actions.

OPENCLAW_CMD_RE = re.compile(r'\[OPENCLAW:([^\]]+)\]')

def parse_openclaw_commands(text: str):
    actions = []
    for match in OPENCLAW_CMD_RE.finditer(text):
        parts = match.group(1).split(':', 2)
        action = parts[0].strip().lower()
        args = parts[1:] if len(parts) > 1 else []
        if action == 'spawn_agent' and len(args) >= 1:
            actions.append({'type': 'spawn_agent', 'name': args[0], 'instructions': args[1] if len(args) > 1 else ''})
        elif action == 'add_task' and args:
            actions.append({'type': 'add_task', 'title': args[0], 'description': args[1] if len(args) > 1 else ''})
        elif action == 'add_insight' and args:
            actions.append({'type': 'add_insight', 'content': args[0]})
        elif action == 'add_lead' and args:
            actions.append({'type': 'add_lead', 'name': args[0], 'contact': args[1] if len(args) > 1 else ''})
        elif action == 'create_universe' and args:
            actions.append({'type': 'create_universe', 'name': args[0], 'description': args[1] if len(args) > 1 else ''})
        elif action == 'promote_universe' and args:
            actions.append({'type': 'promote_universe', 'universeId': args[0]})
    # Strip the command tags from the visible response
    clean = OPENCLAW_CMD_RE.sub('', text).strip()
    return clean, actions

# ── System prompt injected into every Hermes call ─────────────────────────

SYSTEM_PREFIX = """You are the master root of the openclaw hive — an AI-powered microservice dashboard and business operating system.

When you want to interact with the live openclaw system, include one or more of these tags ANYWHERE in your response (they will be executed and hidden from display):

  [OPENCLAW:spawn_agent:agent-name:instructions for the agent]
  [OPENCLAW:add_task:task title:optional description]
  [OPENCLAW:add_insight:your insight text here]
  [OPENCLAW:add_lead:lead name:contact info]
  [OPENCLAW:create_universe:universe name:description]
  [OPENCLAW:promote_universe:universeId]

Use these tags when the user asks you to take action. For example:
  - "create a task to build the landing page" → include [OPENCLAW:add_task:Build landing page]
  - "spawn a monitoring agent" → include [OPENCLAW:spawn_agent:monitor-agent:Watch system health and report anomalies]
  - "add insight about growth" → include [OPENCLAW:add_insight:Your insight text]

Current hive context (recent events):
"""

def build_prompt(user_message: str) -> str:
    ctx = get_context()
    context_block = ctx if ctx else '(no events yet — hive is fresh)'
    return f"{SYSTEM_PREFIX}{context_block}\n\n---\nUser: {user_message}"

# ── Request handler ───────────────────────────────────────────────────────

class BridgeHandler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        pass  # suppress default CLF logging

    def _read_body(self):
        length = int(self.headers.get('Content-Length', 0))
        if length == 0:
            return {}
        try:
            return json.loads(self.rfile.read(length))
        except Exception:
            return {}

    def _json(self, data, status=200):
        payload = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path == '/health':
            self._json({'status': 'ok', 'hermes': HERMES_AVAILABLE, 'port': BRIDGE_PORT})
        else:
            self._json({'error': 'not found'}, 404)

    def do_POST(self):
        body = self._read_body()

        if self.path == '/chat':
            if not HERMES_AVAILABLE:
                self._json({'error': 'Hermes not installed. Run: openclaw hermes-setup'}, 503)
                return
            try:
                model = os.environ.get('HERMES_MODEL', 'anthropic/claude-opus-4.6')
                api_key = os.environ.get('ANTHROPIC_API_KEY', '')
                prompt = build_prompt(body.get('message', ''))

                agent = AIAgent(
                    model=model,
                    api_key=api_key if api_key else None,
                    quiet_mode=True,
                    max_iterations=int(os.environ.get('HERMES_MAX_ITER', '15')),
                )
                raw_response = agent.run_conversation(prompt)
                response_text = str(raw_response) if raw_response else ''
                clean_text, actions = parse_openclaw_commands(response_text)
                self._json({'response': clean_text, 'actions': actions})
            except Exception as e:
                print(f"[bridge] chat error: {e}", file=sys.stderr)
                self._json({'error': str(e)}, 500)

        elif self.path == '/memory':
            content = body.get('content', '')
            if content:
                append_context(content)
            self._json({'ok': True})

        else:
            self._json({'error': 'not found'}, 404)


class ThreadedHTTPServer(HTTPServer):
    """Handle each request in a new thread."""
    def process_request(self, request, client_address):
        t = threading.Thread(target=self._process_request_thread, args=(request, client_address))
        t.daemon = True
        t.start()

    def _process_request_thread(self, request, client_address):
        try:
            self.finish_request(request, client_address)
        except Exception:
            self.handle_error(request, client_address)
        finally:
            self.shutdown_request(request)


if __name__ == '__main__':
    server = ThreadedHTTPServer(('0.0.0.0', BRIDGE_PORT), BridgeHandler)
    print(f"\n[openclaw-hermes-bridge] Hermes HTTP bridge running on http://0.0.0.0:{BRIDGE_PORT}")
    print(f"[openclaw-hermes-bridge] Hermes available: {HERMES_AVAILABLE}")
    print(f"[openclaw-hermes-bridge] Model: {os.environ.get('HERMES_MODEL', 'anthropic/claude-opus-4.6')}")
    print(f"[openclaw-hermes-bridge] HERMES_PATH: {HERMES_PATH}")
    print(f"[openclaw-hermes-bridge] Press Ctrl+C to stop\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n[openclaw-hermes-bridge] Stopped.')
