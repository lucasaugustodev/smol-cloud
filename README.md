# Agents in Cloud

Open source AI agent infrastructure. Install with one command, get a production-ready agents API.

## Quick Start

```bash
git clone https://github.com/agentsincloud/agentsincloud.git
cd agentsincloud
cp .env.example .env   # edit with your OpenRouter key
docker compose up -d
```

Your agents API is now running at `http://localhost:4000`.

## What You Get

- **Agent Engine** -- smolagents-powered execution engine with tool calling and streaming
- **Container Manager** -- Docker-based sandboxed environments for each agent session
- **API Gateway** -- REST + SSE API with auth, templates, and usage tracking
- **Chat UI** -- browser-based interface to interact with your agents
- **Template System** -- prebuilt agent configs (coding assistant, data analyst, etc.)
- **Any LLM** -- use any model via OpenRouter (GPT-4o, Claude, Llama, Gemini, etc.)

## API Example

List available agents:

```bash
curl http://localhost:4000/api/agents \
  -H "Authorization: Bearer $AIC_SECRET"
```

Run an agent:

```bash
curl http://localhost:4000/api/agents/run \
  -H "Authorization: Bearer $AIC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"template": "coding", "input": "Create a hello world HTTP server"}'
```

## Architecture

```
chat (port 3000) --> gateway (port 4000) --> engine (port 8200)
                                         --> containers (port 9090)
```

## Documentation

- [Implementation Plan](docs/implementation-plan.md)
- [Product Design](docs/product-design.md)

## License

[MIT](LICENSE)
