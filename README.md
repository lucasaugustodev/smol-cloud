# Smol Cloud Managed Agents

Centralized AI agent service powered by [smolagents](https://github.com/huggingface/smolagents) + [OpenRouter](https://openrouter.ai).

Like Anthropic's Managed Agents, but open — uses any LLM via OpenRouter and executes tools in Docker containers via an external Container Manager API.

## How it works

```
Client → POST /run (SSE stream)
  ├── Creates smolagent with ToolCallingAgent
  ├── LLM calls go to OpenRouter (any model)
  ├── Tool calls (shell, files, web) execute in user's Docker container
  └── Results stream back as SSE events
```

## Quick Start

```bash
pip install smolagents[openai]
python server.py
```

## API

### `GET /health`
```json
{"status": "ok", "service": "smol-cloud"}
```

### `POST /run` → SSE stream
```json
{
  "api_key": "sk-or-v1-...",
  "model": "openai/gpt-4o-mini",
  "system_prompt": "You are a helpful assistant.",
  "input": "List files in /home/user",
  "container": "agentify-user-abc123"
}
```

**SSE Events:**
| Event | Data |
|-------|------|
| `run.started` | `{ type, model }` |
| `agent.tool_use` | `{ tool, input }` |
| `agent.tool_result` | `{ tool, output }` |
| `agent.text` | `{ text }` |
| `run.completed` | `{ model, steps }` |
| `run.error` | `{ error }` |

## Built-in Tools

| Tool | Description |
|------|-------------|
| `shell_exec` | Execute shell commands in the container |
| `file_read` | Read files from the container |
| `file_write` | Write files to the container |
| `list_files` | List directory contents |
| `web_search` | Search the web via DuckDuckGo |

## Environment Variables

| Var | Default | Description |
|-----|---------|-------------|
| `CLOUD_API_URL` | `http://127.0.0.1:9090` | Container Manager API URL |
| `CLOUD_API_SECRET` | — | Container Manager auth key |
| `SMOLAGENT_PORT` | `8200` | Port to listen on |

## Systemd Service

```ini
[Unit]
Description=Smol Cloud Managed Agents
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/smol-cloud
ExecStart=/usr/bin/python3 server.py
Environment=CLOUD_API_URL=http://127.0.0.1:9090
Environment=CLOUD_API_SECRET=your-secret
Restart=always

[Install]
WantedBy=multi-user.target
```

## Supported Models (via OpenRouter)

Any model on OpenRouter: GPT-4o, Claude, Llama 3, Mistral, Gemini, Qwen, DeepSeek, etc.

## License

MIT
