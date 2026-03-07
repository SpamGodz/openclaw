# MoltBot Installation PRD

## Overview
MoltBot installation on Emergent platform.

## Installation Steps Completed
- Date: 2026-02-07
- Fetched Emergent LLM key via emergent_integrations_manager
- Ran install script from https://moltbot.emergent.to/install.sh with NEW_LLM_KEY set
- LLM key injected into /app/backend/.env
- Frontend rebuilt successfully (production build)
- All services restarted via supervisord

## Service Status (Post-Install)
- backend: RUNNING
- frontend: RUNNING
- mongodb: RUNNING
- nginx-code-proxy: RUNNING
- clawdbot-gateway: STOPPED (Not started - may require manual configuration)

## Reference
- Tutorial: https://emergent.sh/tutorial/moltbot-on-emergent

## Architecture
- Backend: FastAPI (Python)
- Frontend: React (served via nginx after build)
- Database: MongoDB
- LLM Key: Emergent Universal Key (sk-emergent-*)

## Notes
- Slug generation includes high-entropy random suffix (>=32 bits) to prevent guessable URLs
- Do not run installer without setting NEW_LLM_KEY
