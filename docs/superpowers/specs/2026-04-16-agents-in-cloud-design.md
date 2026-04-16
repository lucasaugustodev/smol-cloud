# Agents in Cloud — Product Design Spec

## 1. Vision

**Agents in Cloud** is an open source AI agent infrastructure platform. A developer installs it on their server with one command, adds an OpenRouter API key (or uses platform credits), and has a production-ready agents API to consume from any product.

**Value proposition:**
- **Self-hosted:** `docker compose up` — full agents API with 8 example agents ready to go
- **Cloud:** `agentsincloud.com` — same thing, zero infra, pay-as-you-go credits
- **No lock-in:** any model via OpenRouter, MIT licensed, data on your server

**Target audience:** Developers who want to add AI agents to their products without building the infra from scratch.

**Comparables:** n8n (self-hosted + cloud), Supabase (open core + hosted), but focused on AI agents instead of workflows or databases.

**What it is NOT:**
- Not an agent framework (smolagents handles that)
- Not an agent marketplace
- Not a no-code builder

**Domain:** agentsincloud.com (Cloudflare, API key: `76a9dc681e6cf0f30b03c46e12a1651b`)

**Repository:** github.com/lucasaugustodev/smol-cloud (to be renamed/reorganized)

**Cloud VM:** Vultr Miami — 45.77.114.97 (smolcloudagents instance)

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Docker Compose                     │
│                                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────────┐   │
│  │   Chat   │    │ Gateway  │    │   Engine     │   │
│  │  React   │    │  Node.js │    │   Python     │   │
│  │  :3000   │───>│  :4000   │───>│   :8200      │   │
│  └──────────┘    └────┬─────┘    └──────┬───────┘   │
│                       │                  │           │
│                       │            ┌─────▼───────┐   │
│                       │            │  Container  │   │
│                       ▼            │  Manager    │   │
│                  ┌─────────┐       │  :9090      │   │
│                  │ SQLite  │       └──────┬──────┘   │
│                  │  (data) │              │          │
│                  └─────────┘        Docker Socket    │
│                                     ┌────▼─────┐    │
│                                     │ Agent    │    │
│                                     │Containers│    │
│                                     └──────────┘    │
└─────────────────────────────────────────────────────┘
```

### Services

| Service | Stack | Port | Responsibility |
|---------|-------|------|----------------|
| **gateway** | Node.js/Express/TypeScript | 4000 | REST API, auth (API keys), billing, agent CRUD, proxy to engine |
| **engine** | Python/smolagents | 8200 | Agent execution, SSE streaming, tool calling, tool auto-discovery |
| **containers** | Node.js/TypeScript | 9090 | Container Manager — create/destroy Docker containers, exec, file I/O |
| **chat** | React/Vite/Tailwind | 3000 | Agent showcase, chat demo, landing page. Served by nginx |
| **db** | SQLite | — | Mounted volume. No external database dependency |

### Why SQLite

- Zero config, zero extra container
- For developer self-hosted use, SQLite handles the volume easily
- Cloud version (agentsincloud.com) uses Postgres — but that's platform infra, not the open source product

### Request Flow

1. Developer calls `POST /api/agents/:id/run` on Gateway
2. Gateway validates API key, checks credits (if using platform key), resolves agent config
3. Gateway POSTs to Engine `/run` with model, system_prompt, tools, container
4. Engine creates ToolCallingAgent, executes, streams SSE back
5. Gateway proxies SSE to client and logs usage for billing

---

## 3. CLI and Installation

### Self-hosted Installation

```bash
# Option 1: npx (recommended)
npx agentsincloud init

# Option 2: manual
git clone https://github.com/lucasaugustodev/agentsincloud
cd agentsincloud
cp .env.example .env   # edit OPENROUTER_API_KEY
docker compose up -d
```

### What `npx agentsincloud init` does

1. Asks desired port (default 4000)
2. Asks OpenRouter API key (optional — can add later)
3. Generates `.env` and `docker-compose.yml` in an `agentsincloud/` folder
4. Runs `docker compose up -d`
5. Prints: `Agents in Cloud running at http://localhost:4000`

### CLI Management Commands

```bash
# Agents
agentsincloud agents list
agentsincloud agents create --name "Web Scraper" --model openai/gpt-4o-mini
agentsincloud agents run <id> --input "Search iPhone prices on Google"
agentsincloud agents delete <id>

# API Keys
agentsincloud keys create --name "my-app"
agentsincloud keys list
agentsincloud keys revoke <key>

# Config
agentsincloud config set OPENROUTER_API_KEY sk-or-...
agentsincloud config get

# Status
agentsincloud status
agentsincloud logs --follow
```

The CLI is a thin client that calls the Gateway REST API. Installed via `npm i -g agentsincloud` or used via `npx`.

---

## 4. REST API

**Base URL:** `http://localhost:4000/api` (self-hosted) or `https://agentsincloud.com/api` (cloud)

**Auth:** Header `x-api-key: aic_...` on all calls.

### Agents

```
GET    /api/agents                — list agents
POST   /api/agents                — create agent
GET    /api/agents/:id            — agent details
PUT    /api/agents/:id            — update agent
DELETE /api/agents/:id            — delete agent
POST   /api/agents/:id/run        — run agent (SSE stream)
POST   /api/agents/:id/run/sync   — run agent (JSON response)
```

**POST /api/agents body:**
```json
{
  "name": "Web Scraper",
  "model": "openai/gpt-4o-mini",
  "system_prompt": "You extract data from websites.",
  "tools": ["shell_exec", "file_read", "file_write", "web_search"],
  "setup_script": "pip install beautifulsoup4",
  "max_steps": 20
}
```

**POST /api/agents/:id/run body:**
```json
{
  "input": "Search iPhone 16 prices on Mercado Livre",
  "stream": true
}
```

### API Keys

```
POST   /api/keys          — create key
GET    /api/keys          — list keys
DELETE /api/keys/:id      — revoke key
```

### Credits (Cloud only / when using platform key)

```
GET    /api/credits        — current balance
POST   /api/credits/buy    — redirect to Stripe checkout
GET    /api/usage          — usage history by agent/model
```

### Runs

```
GET    /api/runs           — list recent runs
GET    /api/runs/:id       — run details (input, output, steps, cost)
```

### Health

```
GET    /api/health         — service status (gateway, engine, containers)
```

---

## 5. Agent Templates

8 pre-built agents included on install:

| # | Name | Default Model | Description | Tools |
|---|------|--------------|-------------|-------|
| 1 | Code Assistant | openai/gpt-4o | Writes, debugs, refactors code | shell, file_read, file_write, list_files |
| 2 | Web Scraper | openai/gpt-4o-mini | Extracts data from websites | shell, web_search, file_write |
| 3 | Data Analyst | openai/gpt-4o | Analyzes CSVs, generates reports and charts | shell, file_read, file_write, list_files |
| 4 | System Admin | openai/gpt-4o-mini | Monitors server, manages processes | shell, file_read, list_files |
| 5 | Content Writer | anthropic/claude-sonnet | Writes articles, posts, copy | web_search, file_write |
| 6 | API Tester | openai/gpt-4o-mini | Tests REST endpoints, validates responses | shell, web_search, file_write |
| 7 | File Organizer | openai/gpt-4o-mini | Organizes, renames, categorizes files | shell, file_read, list_files, file_write |
| 8 | Research Agent | anthropic/claude-sonnet | Researches topics, compiles summaries with sources | web_search, file_write |

### Template Format

Each agent is a JSON file in `/templates/`:

```json
{
  "name": "Web Scraper",
  "slug": "web-scraper",
  "category": "data",
  "model": "openai/gpt-4o-mini",
  "system_prompt": "You are a web scraping specialist...",
  "tools": ["shell_exec", "web_search", "file_write"],
  "setup_script": "pip install beautifulsoup4 requests",
  "max_steps": 15,
  "icon": "spider"
}
```

All templates are auto-imported on `npx agentsincloud init`.

---

## 6. Custom Tools

### Python Plugins (full power)

Developer creates a `.py` file in `tools/`:

```python
# tools/weather.py
from agentsincloud import tool

@tool
def get_weather(city: str) -> str:
    """Get current weather for a city.
    Args:
        city: City name.
    """
    import requests
    resp = requests.get(f"https://wttr.in/{city}?format=j1")
    data = resp.json()
    current = data["current_condition"][0]
    return f"{city}: {current['temp_C']}C, {current['weatherDesc'][0]['value']}"
```

Engine auto-discovers: reads all `.py` files in `tools/`, imports functions decorated with `@tool`, and makes them available to agents.

### YAML Config (simple cases)

```yaml
# tools/slack_notify.yaml
name: slack_notify
description: "Send a notification to a Slack channel"
type: http
method: POST
url: "https://hooks.slack.com/services/T00/B00/xxx"
headers:
  Content-Type: application/json
body: '{"text": "{{message}}"}'
args:
  message: "The notification message to send"
```

Engine parses YAML, generates a tool wrapper that makes the HTTP call with interpolated args.

### Binding to Agents

Via CLI or API:

```bash
agentsincloud agents update web-scraper --add-tool weather
agentsincloud agents update web-scraper --add-tool slack_notify
```

Built-in tools + Python plugins + YAML tools share the same namespace. Agents reference by name.

---

## 7. Monetization and Billing

### Model: Pay-as-you-go credits

**When it charges:** Only when the developer uses the platform's OpenRouter key. If they provide their own OpenRouter key, the platform is free.

### Credit Flow

```
Developer without own key
  -> Calls POST /api/agents/:id/run
  -> Gateway checks: no own OPENROUTER_API_KEY
  -> Uses Agents in Cloud's OpenRouter key
  -> Run executes
  -> Calculates cost based on tokens (in/out) + markup
  -> Debits from developer's balance
```

### Pricing

| Component | Calculation |
|-----------|-------------|
| Base cost | OpenRouter price for the model used |
| Markup | +30% over base cost |
| Minimum credit | $5 to start |
| Packages | $5, $10, $25, $50, $100 |

### Example

- Developer runs 1 agent with GPT-4o-mini
- Run uses 2K tokens in + 500 tokens out
- OpenRouter cost: ~$0.0004
- Developer cost: ~$0.0005 (with 30% markup)
- With $5 credit: ~10,000 runs

### Payment

- **Stripe** for payments
- Developer buys credits via `POST /api/credits/buy` -> Stripe Checkout redirect
- Stripe webhook credits the balance
- Credits never expire

### Transparency

- `GET /api/usage` shows each run: model, tokens, cost
- Developer always sees exactly how much they spent and why
- Public docs with per-model pricing table

### Self-hosted

Billing module is **not included** in the self-hosted `docker-compose.yml`. The gateway skips all credit checks when no billing config is present. Developer uses their own OpenRouter key, cost goes directly to OpenRouter. The billing module (Stripe integration, credit management) only exists in the Cloud deployment.

---

## 8. Chat Web (Showcase)

### Purpose

Simple page to demonstrate agents. Developer installs, opens `http://localhost:3000` and sees agents working. Can share the link for others to test.

### Screens

**Home:** Grid of agent cards with name, icon, description, and "Chat" button.

**Chat:** Conversation view with agent. Shows messages, tool calls in real-time (spinner, tool name, collapsible result), and streaming text.

### Characteristics

- No login, no persistent history — refresh clears, that's fine
- SSE streaming — shows tool calls in real-time
- Responsive — works on mobile
- Dark mode default
- Stack: React + Vite + Tailwind, served by nginx in compose
- Chat calls Gateway `/api/agents/:id/run` with an internal demo API key

---

## 9. Landing Page (agentsincloud.com)

### URL Structure

```
agentsincloud.com              — Landing page (marketing)
agentsincloud.com/docs         — Documentation
agentsincloud.com/chat         — Chat demo (Cloud)
agentsincloud.com/api          — Cloud API
```

### Landing Sections

1. **Hero** — "AI Agents API in one command." + `npx agentsincloud init` with animated terminal
2. **How it works** — 3 steps: Install > Configure > Use the API
3. **Use cases** — "Add AI agents to your SaaS", "Automate tasks", "Build internal tools"
4. **Agent templates** — Visual grid with the 8 example agents
5. **Pricing** — "Self-hosted: Free forever" | "Cloud: Pay only for what you use" | per-model cost table
6. **Open Source** — GitHub badge, stars, "MIT Licensed"
7. **Footer** — GitHub, docs, Discord/community link

### Stack

Same React app as `chat/` with landing routes. In production (Cloud) served via Cloudflare.

---

## 10. Repository Structure

```
agentsincloud/
├── docker-compose.yml
├── .env.example
├── README.md
├── LICENSE (MIT)
│
├── engine/                     # Python - execution core
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── server.py               # HTTP server (FastAPI)
│   ├── agent_runner.py         # ToolCallingAgent wrapper
│   ├── tool_loader.py          # Tool auto-discovery
│   └── builtin_tools/
│       ├── shell.py
│       ├── files.py
│       └── web_search.py
│
├── gateway/                    # Node.js - REST API
│   ├── Dockerfile
│   ├── package.json
│   ├── src/
│   │   ├── index.ts            # Express server
│   │   ├── routes/
│   │   │   ├── agents.ts
│   │   │   ├── runs.ts
│   │   │   ├── keys.ts
│   │   │   ├── credits.ts
│   │   │   └── health.ts
│   │   ├── middleware/
│   │   │   └── auth.ts         # API key validation
│   │   ├── billing/
│   │   │   ├── credits.ts      # Balance, debit
│   │   │   └── stripe.ts       # Checkout, webhooks
│   │   └── db/
│   │       ├── schema.ts       # Drizzle schema
│   │       └── sqlite.ts       # SQLite connection
│   └── drizzle/
│       └── migrations/
│
├── containers/                 # Node.js - Container Manager
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.ts
│       ├── docker.ts           # Docker API wrapper
│       └── routes.ts           # CRUD containers, exec, files
│
├── chat/                       # React - Showcase + Landing
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── App.tsx
│       ├── pages/
│       │   ├── Landing.tsx     # Marketing landing page
│       │   ├── Home.tsx        # Agent grid
│       │   └── Chat.tsx        # Agent conversation
│       └── components/
│           ├── AgentCard.tsx
│           ├── ChatMessage.tsx
│           └── ToolCall.tsx
│
├── cli/                        # Node.js - CLI
│   ├── package.json
│   ├── bin/
│   │   └── agentsincloud.ts
│   └── src/
│       ├── commands/
│       │   ├── init.ts
│       │   ├── agents.ts
│       │   ├── keys.ts
│       │   ├── config.ts
│       │   └── status.ts
│       └── api-client.ts       # REST API wrapper
│
├── templates/                  # Example agents
│   ├── code-assistant.json
│   ├── web-scraper.json
│   ├── data-analyst.json
│   ├── system-admin.json
│   ├── content-writer.json
│   ├── api-tester.json
│   ├── file-organizer.json
│   └── research-agent.json
│
├── tools/                      # Custom tools (user-created)
│   └── .gitkeep
│
└── docs/
    ├── getting-started.md
    ├── api-reference.md
    ├── custom-tools.md
    └── cloud.md
```
