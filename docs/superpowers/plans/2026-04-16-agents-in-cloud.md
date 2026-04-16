# Agents in Cloud — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the existing smol-cloud Python server into a full open source AI agent infrastructure product with Docker Compose orchestration, Node.js API gateway, React chat showcase, and CLI.

**Architecture:** Monorepo with 5 services (engine, gateway, containers, chat, cli) orchestrated by Docker Compose. Engine (Python/FastAPI) runs agents via smolagents + OpenRouter. Gateway (Node/Express) handles REST API, auth, agent CRUD. Container Manager (Node) manages Docker containers for agent tool execution. Chat (React/Vite/Tailwind) is a showcase UI. CLI is a thin client over the Gateway API.

**Tech Stack:** Python 3.11 + FastAPI + smolagents, Node.js 20 + Express + TypeScript + Drizzle + better-sqlite3, React 18 + Vite + Tailwind, Docker + Docker Compose

**Spec:** `docs/superpowers/specs/2026-04-16-agents-in-cloud-design.md`

---

## Phase 1: Project Scaffold & Container Manager

### Task 1: Project Root Scaffold

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `LICENSE`
- Modify: `README.md`

- [ ] **Step 1: Create .env.example**

```env
# Agents in Cloud Configuration
OPENROUTER_API_KEY=sk-or-v1-your-key-here
AIC_PORT=4000
AIC_SECRET=change-me-to-a-random-string
```

- [ ] **Step 2: Create LICENSE (MIT)**

```
MIT License

Copyright (c) 2026 Agents in Cloud

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 3: Create docker-compose.yml**

```yaml
services:
  engine:
    build: ./engine
    ports:
      - "8200:8200"
    environment:
      - CLOUD_API_URL=http://containers:9090
      - CLOUD_API_SECRET=${AIC_SECRET}
      - SMOLAGENT_PORT=8200
    volumes:
      - ./tools:/app/custom_tools
    depends_on:
      containers:
        condition: service_healthy
    restart: unless-stopped

  gateway:
    build: ./gateway
    ports:
      - "${AIC_PORT:-4000}:4000"
    environment:
      - ENGINE_URL=http://engine:8200
      - CONTAINERS_URL=http://containers:9090
      - AIC_SECRET=${AIC_SECRET}
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      - DATABASE_PATH=/data/agentsincloud.db
    volumes:
      - aic-data:/data
    depends_on:
      engine:
        condition: service_healthy
    restart: unless-stopped

  containers:
    build: ./containers
    ports:
      - "9090:9090"
    environment:
      - AIC_SECRET=${AIC_SECRET}
      - CONTAINERS_PORT=9090
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:9090/health"]
      interval: 5s
      timeout: 3s
      retries: 3
    restart: unless-stopped

  chat:
    build: ./chat
    ports:
      - "3000:80"
    depends_on:
      - gateway
    restart: unless-stopped

volumes:
  aic-data:
```

- [ ] **Step 4: Rewrite README.md for Agents in Cloud**

```markdown
# Agents in Cloud

Open source AI agent infrastructure. Install with one command, get a production-ready agents API.

## Quick Start

```bash
git clone https://github.com/lucasaugustodev/agentsincloud
cd agentsincloud
cp .env.example .env   # add your OpenRouter API key
docker compose up -d
```

Your agents API is running at `http://localhost:4000`.

## What You Get

- REST API for creating and running AI agents
- 8 pre-built agent templates ready to use
- Any LLM via OpenRouter (GPT-4o, Claude, Llama, Gemini, etc.)
- Docker containers for isolated agent tool execution
- Web chat to demo your agents
- Custom tools via Python plugins or YAML config

## API Example

```bash
# List agents
curl http://localhost:4000/api/agents -H "x-api-key: YOUR_KEY"

# Run an agent
curl -N http://localhost:4000/api/agents/web-scraper/run \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input": "Find iPhone 16 prices"}'
```

## Documentation

- [Getting Started](docs/getting-started.md)
- [API Reference](docs/api-reference.md)
- [Custom Tools](docs/custom-tools.md)

## License

MIT
```

- [ ] **Step 5: Commit scaffold**

```bash
git add docker-compose.yml .env.example LICENSE README.md
git commit -m "chore: project scaffold for Agents in Cloud"
```

---

### Task 2: Container Manager Service

**Files:**
- Create: `containers/package.json`
- Create: `containers/tsconfig.json`
- Create: `containers/Dockerfile`
- Create: `containers/src/index.ts`
- Create: `containers/src/docker.ts`
- Create: `containers/src/routes.ts`

- [ ] **Step 1: Initialize containers/ package**

```json
{
  "name": "@agentsincloud/containers",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "dockerode": "^4.0.4",
    "express": "^5.1.0"
  },
  "devDependencies": {
    "@types/dockerode": "^3.3.34",
    "@types/express": "^5.0.2",
    "@types/node": "^22.15.2",
    "tsx": "^4.19.4",
    "typescript": "^5.8.3"
  }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Create containers/src/docker.ts — Docker wrapper**

This module wraps Dockerode to provide simple container lifecycle operations.

```typescript
import Docker from "dockerode";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

const BASE_IMAGE = "ubuntu:24.04";
const CONTAINER_PREFIX = "aic-";

export async function createContainer(
  name: string,
  opts: { cpu?: number; memory?: number } = {}
): Promise<{ name: string; id: string }> {
  const containerName = `${CONTAINER_PREFIX}${name}`;

  // Pull image if not present
  try {
    await docker.getImage(BASE_IMAGE).inspect();
  } catch {
    await new Promise<void>((resolve, reject) => {
      docker.pull(BASE_IMAGE, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (err2) => (err2 ? reject(err2) : resolve()));
      });
    });
  }

  const container = await docker.createContainer({
    Image: BASE_IMAGE,
    name: containerName,
    Cmd: ["sleep", "infinity"],
    HostConfig: {
      NanoCpus: (opts.cpu || 1) * 1e9,
      Memory: (opts.memory || 512) * 1024 * 1024,
    },
  });

  await container.start();
  return { name: containerName, id: container.id };
}

export async function execInContainer(
  name: string,
  command: string,
  user = "root",
  timeout = 60000
): Promise<{ output: string; exit_code: number }> {
  const container = docker.getContainer(name);
  const exec = await container.exec({
    Cmd: ["bash", "-c", command],
    User: user,
    AttachStdout: true,
    AttachStderr: true,
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("exec timeout")), timeout);

    exec.start({ hijack: true, stdin: false }, (err, stream) => {
      if (err || !stream) {
        clearTimeout(timer);
        return reject(err || new Error("no stream"));
      }

      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", async () => {
        clearTimeout(timer);
        const info = await exec.inspect();
        // Docker multiplexed stream: strip 8-byte header from each frame
        const raw = Buffer.concat(chunks);
        let output = "";
        let offset = 0;
        while (offset < raw.length) {
          if (offset + 8 > raw.length) break;
          const size = raw.readUInt32BE(offset + 4);
          if (offset + 8 + size > raw.length) {
            output += raw.subarray(offset + 8).toString("utf-8");
            break;
          }
          output += raw.subarray(offset + 8, offset + 8 + size).toString("utf-8");
          offset += 8 + size;
        }
        resolve({ output, exit_code: info.ExitCode ?? 0 });
      });
    });
  });
}

export async function listContainers(): Promise<
  { name: string; id: string; state: string }[]
> {
  const containers = await docker.listContainers({
    all: true,
    filters: { name: [CONTAINER_PREFIX] },
  });
  return containers.map((c) => ({
    name: c.Names[0]?.replace("/", "") || "",
    id: c.Id,
    state: c.State,
  }));
}

export async function stopContainer(name: string): Promise<void> {
  await docker.getContainer(name).stop();
}

export async function removeContainer(name: string): Promise<void> {
  await docker.getContainer(name).remove({ force: true });
}

export async function getContainerStats(
  name: string
): Promise<{ cpu_percent: number; memory_mb: number }> {
  const stats = await docker.getContainer(name).stats({ stream: false });
  const cpuDelta =
    stats.cpu_stats.cpu_usage.total_usage -
    stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta =
    stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const cpuCount = stats.cpu_stats.online_cpus || 1;
  const cpu_percent =
    systemDelta > 0 ? (cpuDelta / systemDelta) * cpuCount * 100 : 0;
  const memory_mb = stats.memory_stats.usage / (1024 * 1024);
  return { cpu_percent: Math.round(cpu_percent * 100) / 100, memory_mb: Math.round(memory_mb) };
}

export async function uploadFile(
  name: string,
  path: string,
  content: string
): Promise<void> {
  // Use exec to write file — simpler than tar stream
  const dir = path.substring(0, path.lastIndexOf("/"));
  const escaped = content.replace(/'/g, "'\\''");
  await execInContainer(
    name,
    `mkdir -p ${dir} && cat > ${path} << 'AICEOF'\n${escaped}\nAICEOF`
  );
}

export async function downloadFile(
  name: string,
  path: string
): Promise<string> {
  const result = await execInContainer(name, `cat ${path} 2>&1`);
  return result.output;
}

export async function listFiles(
  name: string,
  path: string
): Promise<string> {
  const result = await execInContainer(name, `ls -la ${path} 2>&1`);
  return result.output;
}
```

- [ ] **Step 3: Create containers/src/routes.ts — Express routes**

```typescript
import { Router, type Request, type Response } from "express";
import * as dock from "./docker.js";

export const router = Router();

// Auth middleware
router.use((req: Request, res: Response, next) => {
  const key = req.headers["x-api-key"];
  if (key !== process.env.AIC_SECRET) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
});

// Health (no auth)
router.get("/health", async (_req: Request, res: Response) => {
  const containers = await dock.listContainers();
  res.json({ status: "ok", service: "containers", count: containers.length });
});

// Create container
router.post("/containers", async (req: Request, res: Response) => {
  try {
    const { name, cpu, memory } = req.body;
    if (!name) { res.status(400).json({ error: "name required" }); return; }
    const result = await dock.createContainer(name, { cpu, memory });
    res.status(201).json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// List containers
router.get("/containers", async (_req: Request, res: Response) => {
  const list = await dock.listContainers();
  res.json(list);
});

// Exec in container
router.post("/containers/:name/exec", async (req: Request, res: Response) => {
  try {
    const { command, user } = req.body;
    if (!command) { res.status(400).json({ error: "command required" }); return; }
    const timeout = req.body.timeout ? req.body.timeout * 1000 : 60000;
    const result = await dock.execInContainer(req.params.name, command, user, timeout);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Upload file
router.post("/containers/:name/upload", async (req: Request, res: Response) => {
  try {
    const { path, content } = req.body;
    if (!path || content === undefined) {
      res.status(400).json({ error: "path and content required" });
      return;
    }
    await dock.uploadFile(req.params.name, path, content);
    res.json({ ok: true, path });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Download file
router.get("/containers/:name/files/download", async (req: Request, res: Response) => {
  try {
    const path = req.query.path as string;
    if (!path) { res.status(400).json({ error: "path query required" }); return; }
    const content = await dock.downloadFile(req.params.name, path);
    res.json({ path, content });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// List files
router.get("/containers/:name/files", async (req: Request, res: Response) => {
  try {
    const path = (req.query.path as string) || "/home/user";
    const listing = await dock.listFiles(req.params.name, path);
    res.json({ path, listing });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Stats
router.get("/containers/:name/stats", async (req: Request, res: Response) => {
  try {
    const stats = await dock.getContainerStats(req.params.name);
    res.json(stats);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Stop container
router.post("/containers/:name/stop", async (req: Request, res: Response) => {
  try {
    await dock.stopContainer(req.params.name);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Delete container
router.delete("/containers/:name", async (req: Request, res: Response) => {
  try {
    await dock.removeContainer(req.params.name);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
```

- [ ] **Step 4: Create containers/src/index.ts — Server entry**

```typescript
import express from "express";
import { router } from "./routes.js";

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(router);

const port = parseInt(process.env.CONTAINERS_PORT || "9090");
app.listen(port, () => {
  console.log(`[AIC Containers] Running on port ${port}`);
});
```

- [ ] **Step 5: Create containers/Dockerfile**

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc
CMD ["node", "dist/index.js"]
```

- [ ] **Step 6: Install deps and verify build**

```bash
cd containers && npm install && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add containers/
git commit -m "feat: container manager service with Docker lifecycle operations"
```

---

## Phase 2: Engine (Python/FastAPI)

### Task 3: Refactor Engine from server.py

**Files:**
- Create: `engine/requirements.txt`
- Create: `engine/Dockerfile`
- Create: `engine/server.py`
- Create: `engine/agent_runner.py`
- Create: `engine/tool_loader.py`
- Create: `engine/builtin_tools/shell.py`
- Create: `engine/builtin_tools/files.py`
- Create: `engine/builtin_tools/web_search.py`
- Create: `engine/builtin_tools/__init__.py`
- Move: old `server.py` to `server.py.bak`

- [ ] **Step 1: Create engine/requirements.txt**

```
fastapi==0.115.12
uvicorn==0.34.2
smolagents[openai]==1.14.0
pyyaml==6.0.2
sse-starlette==2.3.3
```

- [ ] **Step 2: Create engine/builtin_tools/__init__.py**

```python
# Built-in tools for Agents in Cloud engine
```

- [ ] **Step 3: Create engine/builtin_tools/shell.py**

```python
"""Shell execution tool — runs commands in agent containers."""
import json
import urllib.request
from smolagents import tool

CLOUD_URL = ""
CLOUD_SECRET = ""


def configure(cloud_url: str, cloud_secret: str):
    global CLOUD_URL, CLOUD_SECRET
    CLOUD_URL = cloud_url
    CLOUD_SECRET = cloud_secret


def cloud_exec(container: str, command: str, env: dict | None = None, timeout: int = 60) -> str:
    if env:
        exports = " && ".join(f"export {k}={v}" for k, v in env.items())
        command = f"{exports} && {command}"
    try:
        data = json.dumps({"command": command, "user": "root", "timeout": timeout}).encode()
        req = urllib.request.Request(
            f"{CLOUD_URL}/containers/{container}/exec",
            data=data,
            headers={"Content-Type": "application/json", "x-api-key": CLOUD_SECRET},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout + 5) as resp:
            result = json.loads(resp.read())
            output = result.get("output", "")
            if result.get("exit_code", 0) != 0:
                output += f"\n[exit code: {result['exit_code']}]"
            return output or "(no output)"
    except Exception as e:
        return f"[exec error: {e}]"


def make_shell_tool(container: str, env: dict | None = None):
    @tool
    def shell_exec(command: str) -> str:
        """Execute a shell command in the cloud container.
        Args:
            command: The shell command to execute.
        """
        return cloud_exec(container, command, env)

    return shell_exec
```

- [ ] **Step 4: Create engine/builtin_tools/files.py**

```python
"""File operation tools — read, write, list files in agent containers."""
import json
import urllib.request
from smolagents import tool

CLOUD_URL = ""
CLOUD_SECRET = ""


def configure(cloud_url: str, cloud_secret: str):
    global CLOUD_URL, CLOUD_SECRET
    CLOUD_URL = cloud_url
    CLOUD_SECRET = cloud_secret


def make_file_tools(container: str):
    @tool
    def file_read(path: str) -> str:
        """Read a file from the cloud container.
        Args:
            path: Absolute path to the file.
        """
        try:
            from builtin_tools.shell import cloud_exec
            return cloud_exec(container, f"cat {path} 2>&1")
        except Exception as e:
            return f"[read error: {e}]"

    @tool
    def file_write(path: str, content: str) -> str:
        """Write content to a file in the cloud container.
        Args:
            path: Absolute path to write to.
            content: Content to write.
        """
        try:
            data = json.dumps({"path": path, "content": content}).encode()
            req = urllib.request.Request(
                f"{CLOUD_URL}/containers/{container}/upload",
                data=data,
                headers={"Content-Type": "application/json", "x-api-key": CLOUD_SECRET},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                return f"Written to {path}"
        except Exception as e:
            from builtin_tools.shell import cloud_exec
            escaped = content.replace("'", "'\\''")
            return cloud_exec(container, f"mkdir -p $(dirname {path}) && cat > {path} << 'AICEOF'\n{escaped}\nAICEOF")

    @tool
    def list_files(directory: str = "/home/user") -> str:
        """List files in a directory in the cloud container.
        Args:
            directory: Path to list. Defaults to /home/user.
        """
        from builtin_tools.shell import cloud_exec
        return cloud_exec(container, f"ls -la {directory} 2>&1")

    return [file_read, file_write, list_files]
```

- [ ] **Step 5: Create engine/builtin_tools/web_search.py**

```python
"""Web search tool — searches the web via DuckDuckGo."""
import urllib.request
import urllib.parse
from smolagents import tool


def make_web_search_tool():
    @tool
    def web_search(query: str) -> str:
        """Search the web using DuckDuckGo.
        Args:
            query: Search query.
        """
        try:
            url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                html = resp.read().decode("utf-8", errors="replace")
            results = []
            for part in html.split('class="result__snippet"')[1:5]:
                end = part.find("</a>")
                if end > 0:
                    text = part[:end].replace("<b>", "").replace("</b>", "").strip()
                    if text.startswith(">"):
                        text = text[1:].strip()
                    results.append(text)
            return "\n\n".join(results) if results else "No results found."
        except Exception as e:
            return f"[search error: {e}]"

    return web_search
```

- [ ] **Step 6: Create engine/tool_loader.py — Auto-discovery of custom tools**

```python
"""Tool loader — discovers built-in, Python plugin, and YAML tools."""
import importlib
import os
import sys
import yaml
import urllib.request
import json
from pathlib import Path
from smolagents import tool

from builtin_tools.shell import make_shell_tool, configure as configure_shell
from builtin_tools.files import make_file_tools, configure as configure_files
from builtin_tools.web_search import make_web_search_tool

CUSTOM_TOOLS_DIR = os.environ.get("CUSTOM_TOOLS_DIR", "/app/custom_tools")


def init_builtin_config(cloud_url: str, cloud_secret: str):
    configure_shell(cloud_url, cloud_secret)
    configure_files(cloud_url, cloud_secret)


def load_builtin_tools(container: str, tool_names: list[str], env: dict | None = None) -> list:
    """Load built-in tools by name for a given container."""
    available = {}

    shell = make_shell_tool(container, env)
    available["shell_exec"] = shell

    file_tools = make_file_tools(container)
    for t in file_tools:
        available[t.name] = t

    web = make_web_search_tool()
    available["web_search"] = web

    selected = []
    for name in tool_names:
        if name in available:
            selected.append(available[name])
    return selected


def load_python_plugins() -> dict:
    """Scan custom_tools dir for .py files with @tool decorated functions."""
    plugins = {}
    tools_dir = Path(CUSTOM_TOOLS_DIR)
    if not tools_dir.exists():
        return plugins

    if str(tools_dir) not in sys.path:
        sys.path.insert(0, str(tools_dir))

    for py_file in tools_dir.glob("*.py"):
        module_name = py_file.stem
        try:
            mod = importlib.import_module(module_name)
            for attr_name in dir(mod):
                attr = getattr(mod, attr_name)
                if callable(attr) and hasattr(attr, "name") and hasattr(attr, "description"):
                    plugins[attr.name] = attr
        except Exception as e:
            print(f"[ToolLoader] Error loading plugin {py_file}: {e}")
    return plugins


def load_yaml_tools() -> dict:
    """Scan custom_tools dir for .yaml/.yml tool definitions."""
    tools = {}
    tools_dir = Path(CUSTOM_TOOLS_DIR)
    if not tools_dir.exists():
        return tools

    for yaml_file in list(tools_dir.glob("*.yaml")) + list(tools_dir.glob("*.yml")):
        try:
            with open(yaml_file) as f:
                spec = yaml.safe_load(f)

            name = spec["name"]
            description = spec.get("description", name)
            method = spec.get("method", "GET").upper()
            url_template = spec["url"]
            headers = spec.get("headers", {})
            body_template = spec.get("body", "")
            args_spec = spec.get("args", {})

            # Build a dynamic tool function
            arg_names = list(args_spec.keys())
            arg_descs = "\n".join(f"            {k}: {v}" for k, v in args_spec.items())

            def make_yaml_tool(n, d, m, u, h, b, a_names):
                @tool
                def yaml_tool(**kwargs) -> str:
                    f"""YAML-defined tool.
                    Args:
                        kwargs: Tool arguments.
                    """
                    final_url = u
                    final_body = b
                    for k, v in kwargs.items():
                        final_url = final_url.replace(f"{{{{{k}}}}}", str(v))
                        final_body = final_body.replace(f"{{{{{k}}}}}", str(v))
                    try:
                        data = final_body.encode() if final_body and m != "GET" else None
                        req = urllib.request.Request(final_url, data=data, headers=h, method=m)
                        with urllib.request.urlopen(req, timeout=30) as resp:
                            return resp.read().decode("utf-8", errors="replace")[:5000]
                    except Exception as e:
                        return f"[tool error: {e}]"

                yaml_tool.name = n
                yaml_tool.description = d
                return yaml_tool

            tools[name] = make_yaml_tool(name, description, method, url_template, headers, body_template, arg_names)
        except Exception as e:
            print(f"[ToolLoader] Error loading YAML tool {yaml_file}: {e}")
    return tools


def resolve_tools(container: str, tool_names: list[str], env: dict | None = None) -> list:
    """Resolve tool names to actual tool instances. Checks built-in, plugins, YAML."""
    builtin = load_builtin_tools(container, tool_names, env)
    builtin_names = {t.name for t in builtin}

    remaining = [n for n in tool_names if n not in builtin_names]
    if not remaining:
        return builtin

    plugins = load_python_plugins()
    yaml_tools = load_yaml_tools()

    result = list(builtin)
    for name in remaining:
        if name in plugins:
            result.append(plugins[name])
        elif name in yaml_tools:
            result.append(yaml_tools[name])
        else:
            print(f"[ToolLoader] Warning: tool '{name}' not found")
    return result
```

- [ ] **Step 7: Create engine/agent_runner.py — Agent execution wrapper**

```python
"""Agent runner — creates and executes smolagents ToolCallingAgent."""
import re
import traceback
from smolagents import ToolCallingAgent, OpenAIServerModel
from tool_loader import resolve_tools
from builtin_tools.shell import cloud_exec


# Track containers that already ran their setup script
_completed_setups: set = set()


def run_agent(
    api_key: str,
    model_id: str,
    system_prompt: str,
    user_input: str,
    container: str,
    tool_names: list[str],
    setup_script: str = "",
    max_steps: int = 50,
    on_event=None,
):
    """Run an agent and yield SSE events via on_event callback.

    on_event(event_type: str, data: dict) is called for each event.
    """
    if on_event is None:
        on_event = lambda t, d: None

    on_event("run.started", {"model": model_id})

    # Run setup script if provided
    setup_key = f"{container}:{hash(setup_script)}" if setup_script else ""
    if setup_script and container and setup_key not in _completed_setups:
        on_event("agent.text", {"text": "_Preparing environment..._\n\n"})
        try:
            output = cloud_exec(container, setup_script, timeout=180)
            _completed_setups.add(setup_key)
            on_event("agent.text", {"text": "_Environment ready!_\n\n"})
        except Exception as e:
            on_event("agent.text", {"text": f"_Warning: partial setup ({e})_\n\n"})

    # Extract env vars from system_prompt
    env_pattern = re.compile(r"export\s+([A-Z_][A-Z0-9_]*)=([^\s\n]+)")
    found_env = dict(env_pattern.findall(system_prompt))

    try:
        model = OpenAIServerModel(
            model_id=model_id,
            api_key=api_key,
            api_base="https://openrouter.ai/api/v1",
        )

        tools = resolve_tools(container, tool_names, found_env if found_env else None)

        agent = ToolCallingAgent(tools=tools, model=model, max_steps=max_steps)

        if system_prompt:
            agent.prompt_templates["system_prompt"] = (
                system_prompt
                + "\n\nIMPORTANT RULES:"
                "\n- After getting tool results, provide your final answer immediately."
                "\n- Do NOT repeat tool calls. Use final_answer tool to respond."
            )

        # Monkey-patch to stream tool calls
        original_execute = agent.execute_tool_call

        def patched_execute(tool_name, arguments):
            on_event("agent.tool_use", {"tool": tool_name, "input": arguments})
            result = original_execute(tool_name, arguments)
            on_event("agent.tool_result", {"tool": tool_name, "output": str(result)[:500]})
            return result

        agent.execute_tool_call = patched_execute

        result = agent.run(user_input)
        text = str(result)
        on_event("agent.text", {"text": text})

        steps = getattr(agent, "step_number", 0)
        on_event("run.completed", {"model": model_id, "steps": steps})

        return {"text": text, "steps": steps, "model": model_id}

    except Exception as e:
        traceback.print_exc()
        on_event("run.error", {"error": str(e)})
        return {"error": str(e)}
```

- [ ] **Step 8: Create engine/server.py — FastAPI server**

```python
"""Agents in Cloud Engine — FastAPI server for agent execution."""
import json
import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
from tool_loader import init_builtin_config
from agent_runner import run_agent

CLOUD_URL = os.environ.get("CLOUD_API_URL", "http://127.0.0.1:9090")
CLOUD_SECRET = os.environ.get("CLOUD_API_SECRET", "")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_builtin_config(CLOUD_URL, CLOUD_SECRET)
    print(f"[AIC Engine] Connected to Container Manager at {CLOUD_URL}")
    yield


app = FastAPI(title="Agents in Cloud Engine", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "engine"}


@app.post("/run")
async def run(request: Request):
    body = await request.json()

    api_key = body.get("api_key", "")
    model_id = body.get("model", "openai/gpt-4o-mini")
    system_prompt = body.get("system_prompt", "You are a helpful assistant.")
    user_input = body.get("input", "")
    container = body.get("container", "")
    tool_names = body.get("tools", ["shell_exec", "file_read", "file_write", "list_files", "web_search"])
    setup_script = body.get("setup_script", "")
    max_steps = body.get("max_steps", 50)

    if not api_key or not user_input or not container:
        return Response(
            content=json.dumps({"error": "api_key, input, and container are required"}),
            status_code=400,
            media_type="application/json",
        )

    queue: asyncio.Queue = asyncio.Queue()

    def on_event(event_type: str, data: dict):
        queue.put_nowait((event_type, data))

    async def generate():
        loop = asyncio.get_event_loop()
        task = loop.run_in_executor(
            None,
            lambda: run_agent(
                api_key=api_key,
                model_id=model_id,
                system_prompt=system_prompt,
                user_input=user_input,
                container=container,
                tool_names=tool_names,
                setup_script=setup_script,
                max_steps=max_steps,
                on_event=on_event,
            ),
        )

        while True:
            try:
                event_type, data = await asyncio.wait_for(queue.get(), timeout=1.0)
                yield {"event": event_type, "data": json.dumps(data)}
                if event_type in ("run.completed", "run.error"):
                    break
            except asyncio.TimeoutError:
                if task.done():
                    # Drain remaining events
                    while not queue.empty():
                        event_type, data = queue.get_nowait()
                        yield {"event": event_type, "data": json.dumps(data)}
                    break

    return EventSourceResponse(generate())


@app.post("/run/sync")
async def run_sync(request: Request):
    """Synchronous run — waits for completion and returns JSON."""
    body = await request.json()

    api_key = body.get("api_key", "")
    model_id = body.get("model", "openai/gpt-4o-mini")
    system_prompt = body.get("system_prompt", "You are a helpful assistant.")
    user_input = body.get("input", "")
    container = body.get("container", "")
    tool_names = body.get("tools", ["shell_exec", "file_read", "file_write", "list_files", "web_search"])
    setup_script = body.get("setup_script", "")
    max_steps = body.get("max_steps", 50)

    if not api_key or not user_input or not container:
        return Response(
            content=json.dumps({"error": "api_key, input, and container are required"}),
            status_code=400,
            media_type="application/json",
        )

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: run_agent(
            api_key=api_key,
            model_id=model_id,
            system_prompt=system_prompt,
            user_input=user_input,
            container=container,
            tool_names=tool_names,
            setup_script=setup_script,
            max_steps=max_steps,
        ),
    )
    return result


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("SMOLAGENT_PORT", "8200"))
    uvicorn.run(app, host="0.0.0.0", port=port)
```

- [ ] **Step 9: Create engine/Dockerfile**

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
HEALTHCHECK --interval=5s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8200/health')"
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8200"]
```

- [ ] **Step 10: Move old server.py to backup**

```bash
mv server.py server.py.bak
```

- [ ] **Step 11: Commit**

```bash
git add engine/ server.py.bak
git commit -m "feat: engine service — FastAPI + smolagents with tool auto-discovery"
```

---

## Phase 3: Gateway (Node.js API)

### Task 4: Gateway — Database Schema & Setup

**Files:**
- Create: `gateway/package.json`
- Create: `gateway/tsconfig.json`
- Create: `gateway/src/db/schema.ts`
- Create: `gateway/src/db/sqlite.ts`

- [ ] **Step 1: Create gateway/package.json**

```json
{
  "name": "@agentsincloud/gateway",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  },
  "dependencies": {
    "better-sqlite3": "^11.9.1",
    "drizzle-orm": "^0.44.1",
    "express": "^5.1.0",
    "nanoid": "^5.1.5",
    "eventsource-parser": "^3.0.1"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.14",
    "@types/express": "^5.0.2",
    "@types/node": "^22.15.2",
    "drizzle-kit": "^0.31.1",
    "tsx": "^4.19.4",
    "typescript": "^5.8.3"
  }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Create gateway/src/db/sqlite.ts**

```typescript
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

const dbPath = process.env.DATABASE_PATH || "./agentsincloud.db";
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
```

- [ ] **Step 3: Create gateway/src/db/schema.ts**

```typescript
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(), // nanoid
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  model: text("model").notNull().default("openai/gpt-4o-mini"),
  system_prompt: text("system_prompt").notNull().default(""),
  tools: text("tools", { mode: "json" }).notNull().$type<string[]>().default([]),
  setup_script: text("setup_script").default(""),
  max_steps: integer("max_steps").notNull().default(20),
  category: text("category").default("general"),
  icon: text("icon").default("bot"),
  is_template: integer("is_template", { mode: "boolean" }).default(false),
  created_at: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const api_keys = sqliteTable("api_keys", {
  id: text("id").primaryKey(), // nanoid
  key_hash: text("key_hash").notNull().unique(),
  key_prefix: text("key_prefix").notNull(), // "aic_xxxx" for display
  name: text("name").notNull(),
  created_at: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(), // nanoid
  agent_id: text("agent_id").notNull().references(() => agents.id),
  api_key_id: text("api_key_id").references(() => api_keys.id),
  input: text("input").notNull(),
  output: text("output").default(""),
  model: text("model").notNull(),
  steps: integer("steps").default(0),
  status: text("status").notNull().default("running"), // running, succeeded, failed
  started_at: text("started_at").notNull().$defaultFn(() => new Date().toISOString()),
  finished_at: text("finished_at"),
  tokens_in: integer("tokens_in").default(0),
  tokens_out: integer("tokens_out").default(0),
  cost: real("cost").default(0),
});
```

- [ ] **Step 4: Create drizzle.config.ts**

Create `gateway/drizzle.config.ts`:

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_PATH || "./agentsincloud.db",
  },
});
```

- [ ] **Step 5: Install deps, generate migration, verify**

```bash
cd gateway && npm install && npx drizzle-kit generate
```

- [ ] **Step 6: Commit**

```bash
git add gateway/
git commit -m "feat: gateway database schema — agents, api_keys, runs tables"
```

---

### Task 5: Gateway — Auth Middleware & API Key Routes

**Files:**
- Create: `gateway/src/middleware/auth.ts`
- Create: `gateway/src/routes/keys.ts`

- [ ] **Step 1: Create gateway/src/middleware/auth.ts**

```typescript
import { type Request, type Response, type NextFunction } from "express";
import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/sqlite.js";
import { api_keys } from "../db/schema.js";

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const key = req.headers["x-api-key"] as string;
  if (!key) {
    res.status(401).json({ error: "x-api-key header required" });
    return;
  }

  // Check if it's the master secret (for internal/demo use)
  if (key === process.env.AIC_SECRET) {
    (req as any).apiKeyId = "master";
    next();
    return;
  }

  const hash = hashKey(key);
  const found = db.select().from(api_keys).where(eq(api_keys.key_hash, hash)).get();
  if (!found) {
    res.status(401).json({ error: "invalid api key" });
    return;
  }

  (req as any).apiKeyId = found.id;
  next();
}
```

- [ ] **Step 2: Create gateway/src/routes/keys.ts**

```typescript
import { Router, type Request, type Response } from "express";
import { nanoid } from "nanoid";
import { createHash, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/sqlite.js";
import { api_keys } from "../db/schema.js";
import { hashKey } from "../middleware/auth.js";

export const keysRouter = Router();

// Create API key
keysRouter.post("/", (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name) {
    res.status(400).json({ error: "name required" });
    return;
  }

  const id = nanoid();
  const rawKey = `aic_${randomBytes(24).toString("hex")}`;
  const key_hash = hashKey(rawKey);
  const key_prefix = rawKey.substring(0, 8) + "...";

  db.insert(api_keys).values({ id, key_hash, key_prefix, name }).run();

  // Return the raw key only once — it's not stored
  res.status(201).json({ id, key: rawKey, key_prefix, name });
});

// List API keys
keysRouter.get("/", (_req: Request, res: Response) => {
  const keys = db.select({
    id: api_keys.id,
    key_prefix: api_keys.key_prefix,
    name: api_keys.name,
    created_at: api_keys.created_at,
  }).from(api_keys).all();
  res.json(keys);
});

// Revoke API key
keysRouter.delete("/:id", (req: Request, res: Response) => {
  const result = db.delete(api_keys).where(eq(api_keys.id, req.params.id)).run();
  if (result.changes === 0) {
    res.status(404).json({ error: "key not found" });
    return;
  }
  res.json({ ok: true });
});
```

- [ ] **Step 3: Commit**

```bash
git add gateway/src/middleware/ gateway/src/routes/keys.ts
git commit -m "feat: gateway auth middleware and API key management"
```

---

### Task 6: Gateway — Agent CRUD Routes

**Files:**
- Create: `gateway/src/routes/agents.ts`

- [ ] **Step 1: Create gateway/src/routes/agents.ts**

```typescript
import { Router, type Request, type Response } from "express";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "../db/sqlite.js";
import { agents } from "../db/schema.js";

export const agentsRouter = Router();

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// List agents
agentsRouter.get("/", (_req: Request, res: Response) => {
  const list = db.select().from(agents).all();
  res.json(list);
});

// Create agent
agentsRouter.post("/", (req: Request, res: Response) => {
  const { name, model, system_prompt, tools, setup_script, max_steps, category, icon } = req.body;
  if (!name) {
    res.status(400).json({ error: "name required" });
    return;
  }

  const id = nanoid();
  const slug = slugify(name);

  // Check slug uniqueness
  const existing = db.select().from(agents).where(eq(agents.slug, slug)).get();
  if (existing) {
    res.status(409).json({ error: `agent with slug '${slug}' already exists` });
    return;
  }

  db.insert(agents).values({
    id,
    slug,
    name,
    model: model || "openai/gpt-4o-mini",
    system_prompt: system_prompt || "",
    tools: tools || ["shell_exec", "file_read", "file_write", "list_files", "web_search"],
    setup_script: setup_script || "",
    max_steps: max_steps || 20,
    category: category || "general",
    icon: icon || "bot",
  }).run();

  const agent = db.select().from(agents).where(eq(agents.id, id)).get();
  res.status(201).json(agent);
});

// Get agent by id or slug
agentsRouter.get("/:idOrSlug", (req: Request, res: Response) => {
  const { idOrSlug } = req.params;
  const agent = db.select().from(agents).where(eq(agents.id, idOrSlug)).get()
    || db.select().from(agents).where(eq(agents.slug, idOrSlug)).get();

  if (!agent) {
    res.status(404).json({ error: "agent not found" });
    return;
  }
  res.json(agent);
});

// Update agent
agentsRouter.put("/:idOrSlug", (req: Request, res: Response) => {
  const { idOrSlug } = req.params;
  const agent = db.select().from(agents).where(eq(agents.id, idOrSlug)).get()
    || db.select().from(agents).where(eq(agents.slug, idOrSlug)).get();

  if (!agent) {
    res.status(404).json({ error: "agent not found" });
    return;
  }

  const updates: Record<string, any> = {};
  const allowed = ["name", "model", "system_prompt", "tools", "setup_script", "max_steps", "category", "icon"];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates[key] = req.body[key];
    }
  }

  if (req.body.name && req.body.name !== agent.name) {
    updates.slug = slugify(req.body.name);
  }

  if (Object.keys(updates).length > 0) {
    db.update(agents).set(updates).where(eq(agents.id, agent.id)).run();
  }

  const updated = db.select().from(agents).where(eq(agents.id, agent.id)).get();
  res.json(updated);
});

// Delete agent
agentsRouter.delete("/:idOrSlug", (req: Request, res: Response) => {
  const { idOrSlug } = req.params;
  const agent = db.select().from(agents).where(eq(agents.id, idOrSlug)).get()
    || db.select().from(agents).where(eq(agents.slug, idOrSlug)).get();

  if (!agent) {
    res.status(404).json({ error: "agent not found" });
    return;
  }

  db.delete(agents).where(eq(agents.id, agent.id)).run();
  res.json({ ok: true });
});
```

- [ ] **Step 2: Commit**

```bash
git add gateway/src/routes/agents.ts
git commit -m "feat: gateway agent CRUD routes"
```

---

### Task 7: Gateway — Runs Routes (SSE Proxy + Sync)

**Files:**
- Create: `gateway/src/routes/runs.ts`

- [ ] **Step 1: Create gateway/src/routes/runs.ts**

```typescript
import { Router, type Request, type Response } from "express";
import { nanoid } from "nanoid";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/sqlite.js";
import { agents, runs } from "../db/schema.js";

const ENGINE_URL = process.env.ENGINE_URL || "http://engine:8200";
const CONTAINERS_URL = process.env.CONTAINERS_URL || "http://containers:9090";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const AIC_SECRET = process.env.AIC_SECRET || "";

export const runsRouter = Router();

async function ensureContainer(name: string): Promise<string> {
  const containerName = `aic-agent-${name}`;
  try {
    // Check if container exists
    const resp = await fetch(`${CONTAINERS_URL}/containers`, {
      headers: { "x-api-key": AIC_SECRET },
    });
    const list = await resp.json() as { name: string; state: string }[];
    const existing = list.find((c) => c.name === containerName);
    if (existing && existing.state === "running") return containerName;

    // Create container
    await fetch(`${CONTAINERS_URL}/containers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": AIC_SECRET },
      body: JSON.stringify({ name: `agent-${name}` }),
    });
    return containerName;
  } catch (e) {
    console.error(`[Runs] Error ensuring container: ${e}`);
    return containerName;
  }
}

// Run agent (SSE stream)
runsRouter.post("/:idOrSlug/run", async (req: Request, res: Response) => {
  const { idOrSlug } = req.params;
  const agent = db.select().from(agents).where(eq(agents.id, idOrSlug)).get()
    || db.select().from(agents).where(eq(agents.slug, idOrSlug)).get();

  if (!agent) {
    res.status(404).json({ error: "agent not found" });
    return;
  }

  const { input } = req.body;
  if (!input) {
    res.status(400).json({ error: "input required" });
    return;
  }

  const runId = nanoid();
  db.insert(runs).values({
    id: runId,
    agent_id: agent.id,
    api_key_id: (req as any).apiKeyId || null,
    input,
    model: agent.model,
    status: "running",
  }).run();

  const containerName = await ensureContainer(agent.slug);

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  try {
    const engineResp = await fetch(`${ENGINE_URL}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: OPENROUTER_API_KEY,
        model: agent.model,
        system_prompt: agent.system_prompt,
        input,
        container: containerName,
        tools: agent.tools,
        setup_script: agent.setup_script || "",
        max_steps: agent.max_steps,
      }),
    });

    if (!engineResp.ok || !engineResp.body) {
      const errText = await engineResp.text();
      res.write(`event: run.error\ndata: ${JSON.stringify({ error: errText })}\n\n`);
      db.update(runs).set({ status: "failed", finished_at: new Date().toISOString() })
        .where(eq(runs.id, runId)).run();
      res.end();
      return;
    }

    const reader = engineResp.body.getReader();
    const decoder = new TextDecoder();
    let fullOutput = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);

      // Extract text from agent.text events for storage
      const lines = chunk.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith("event: agent.text") && lines[i + 1]?.startsWith("data: ")) {
          try {
            const data = JSON.parse(lines[i + 1].substring(6));
            fullOutput += data.text || "";
          } catch {}
        }
      }
    }

    db.update(runs).set({
      status: "succeeded",
      output: fullOutput,
      finished_at: new Date().toISOString(),
    }).where(eq(runs.id, runId)).run();

  } catch (e: any) {
    res.write(`event: run.error\ndata: ${JSON.stringify({ error: e.message })}\n\n`);
    db.update(runs).set({ status: "failed", finished_at: new Date().toISOString() })
      .where(eq(runs.id, runId)).run();
  }

  res.end();
});

// Run agent (sync)
runsRouter.post("/:idOrSlug/run/sync", async (req: Request, res: Response) => {
  const { idOrSlug } = req.params;
  const agent = db.select().from(agents).where(eq(agents.id, idOrSlug)).get()
    || db.select().from(agents).where(eq(agents.slug, idOrSlug)).get();

  if (!agent) {
    res.status(404).json({ error: "agent not found" });
    return;
  }

  const { input } = req.body;
  if (!input) {
    res.status(400).json({ error: "input required" });
    return;
  }

  const runId = nanoid();
  db.insert(runs).values({
    id: runId,
    agent_id: agent.id,
    api_key_id: (req as any).apiKeyId || null,
    input,
    model: agent.model,
    status: "running",
  }).run();

  const containerName = await ensureContainer(agent.slug);

  try {
    const engineResp = await fetch(`${ENGINE_URL}/run/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: OPENROUTER_API_KEY,
        model: agent.model,
        system_prompt: agent.system_prompt,
        input,
        container: containerName,
        tools: agent.tools,
        setup_script: agent.setup_script || "",
        max_steps: agent.max_steps,
      }),
    });

    const result = await engineResp.json() as any;

    db.update(runs).set({
      status: result.error ? "failed" : "succeeded",
      output: result.text || result.error || "",
      steps: result.steps || 0,
      finished_at: new Date().toISOString(),
    }).where(eq(runs.id, runId)).run();

    res.json({ id: runId, ...result });
  } catch (e: any) {
    db.update(runs).set({ status: "failed", finished_at: new Date().toISOString() })
      .where(eq(runs.id, runId)).run();
    res.status(500).json({ error: e.message });
  }
});

// List runs
runsRouter.get("/", (_req: Request, res: Response) => {
  const list = db.select().from(runs).orderBy(desc(runs.started_at)).limit(50).all();
  res.json(list);
});

// Get run details
runsRouter.get("/:id", (req: Request, res: Response) => {
  const run = db.select().from(runs).where(eq(runs.id, req.params.id)).get();
  if (!run) {
    res.status(404).json({ error: "run not found" });
    return;
  }
  res.json(run);
});
```

- [ ] **Step 2: Commit**

```bash
git add gateway/src/routes/runs.ts
git commit -m "feat: gateway runs routes — SSE proxy and sync execution"
```

---

### Task 8: Gateway — Health Route & Server Entry

**Files:**
- Create: `gateway/src/routes/health.ts`
- Create: `gateway/src/index.ts`
- Create: `gateway/Dockerfile`

- [ ] **Step 1: Create gateway/src/routes/health.ts**

```typescript
import { Router, type Request, type Response } from "express";

const ENGINE_URL = process.env.ENGINE_URL || "http://engine:8200";
const CONTAINERS_URL = process.env.CONTAINERS_URL || "http://containers:9090";

export const healthRouter = Router();

healthRouter.get("/", async (_req: Request, res: Response) => {
  const checks: Record<string, string> = { gateway: "ok" };

  try {
    const engineResp = await fetch(`${ENGINE_URL}/health`);
    checks.engine = engineResp.ok ? "ok" : "error";
  } catch {
    checks.engine = "unreachable";
  }

  try {
    const containersResp = await fetch(`${CONTAINERS_URL}/health`);
    checks.containers = containersResp.ok ? "ok" : "error";
  } catch {
    checks.containers = "unreachable";
  }

  const allOk = Object.values(checks).every((v) => v === "ok");
  res.status(allOk ? 200 : 503).json({ status: allOk ? "ok" : "degraded", services: checks });
});
```

- [ ] **Step 2: Create gateway/src/index.ts**

```typescript
import express from "express";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { db } from "./db/sqlite.js";
import { agents } from "./db/schema.js";
import { authMiddleware } from "./middleware/auth.js";
import { agentsRouter } from "./routes/agents.js";
import { runsRouter } from "./routes/runs.js";
import { keysRouter } from "./routes/keys.js";
import { healthRouter } from "./routes/health.js";

const app = express();
app.use(express.json({ limit: "10mb" }));

// CORS
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");
  if (_req.method === "OPTIONS") { res.sendStatus(200); return; }
  next();
});

// Health — no auth
app.use("/api/health", healthRouter);

// Auth-protected routes
app.use("/api/agents", authMiddleware, agentsRouter);
app.use("/api/agents", authMiddleware, runsRouter); // /api/agents/:id/run
app.use("/api/keys", authMiddleware, keysRouter);
app.use("/api/runs", authMiddleware, (await import("./routes/runs.js")).runsRouter);

// Seed templates on first boot
seedTemplates();

function seedTemplates() {
  const existing = db.select().from(agents).all();
  if (existing.length > 0) return; // Already seeded

  const templatesDir = "/app/templates";
  if (!existsSync(templatesDir)) return;

  const { readdirSync } = await import("fs");
  // Inline since this runs once at boot
  const files = readdirSync(templatesDir).filter((f: string) => f.endsWith(".json"));
  for (const file of files) {
    try {
      const raw = readFileSync(join(templatesDir, file), "utf-8");
      const tmpl = JSON.parse(raw);
      const { nanoid } = await import("nanoid");
      db.insert(agents).values({
        id: nanoid(),
        slug: tmpl.slug,
        name: tmpl.name,
        model: tmpl.model || "openai/gpt-4o-mini",
        system_prompt: tmpl.system_prompt || "",
        tools: tmpl.tools || [],
        setup_script: tmpl.setup_script || "",
        max_steps: tmpl.max_steps || 20,
        category: tmpl.category || "general",
        icon: tmpl.icon || "bot",
        is_template: true,
      }).run();
      console.log(`[AIC Gateway] Seeded template: ${tmpl.name}`);
    } catch (e) {
      console.error(`[AIC Gateway] Error seeding ${file}: ${e}`);
    }
  }
}

const port = parseInt(process.env.GATEWAY_PORT || "4000");
app.listen(port, () => {
  console.log(`[AIC Gateway] Running on port ${port}`);
});
```

Note: The `seedTemplates` function above uses top-level await in the router setup. This needs to be restructured to avoid top-level await issues. The implementation agent should refactor the `app.use` for runs and the seed function to use synchronous imports or proper async initialization. The key point is: on first boot, if no agents exist, read all JSON files from `/app/templates/` directory and insert them into the agents table.

- [ ] **Step 3: Create gateway/Dockerfile**

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY tsconfig.json ./
COPY src/ ./src/
COPY ../templates/ ./templates/ 
RUN npx tsc
RUN npx drizzle-kit migrate
HEALTHCHECK --interval=5s --timeout=3s CMD wget -q --spider http://localhost:4000/api/health || exit 1
CMD ["node", "dist/index.js"]
```

Note: The `COPY ../templates/` won't work in Docker context. The implementation agent should handle this by either: (a) using a volume mount in docker-compose.yml for templates, or (b) copying templates in the Dockerfile with proper build context. The docker-compose.yml approach (volume mount `./templates:/app/templates:ro`) is simpler.

- [ ] **Step 4: Commit**

```bash
git add gateway/
git commit -m "feat: gateway server — Express API with template seeding"
```

---

## Phase 4: Agent Templates

### Task 9: Create 8 Agent Template JSON Files

**Files:**
- Create: `templates/code-assistant.json`
- Create: `templates/web-scraper.json`
- Create: `templates/data-analyst.json`
- Create: `templates/system-admin.json`
- Create: `templates/content-writer.json`
- Create: `templates/api-tester.json`
- Create: `templates/file-organizer.json`
- Create: `templates/research-agent.json`
- Create: `tools/.gitkeep`

- [ ] **Step 1: Create all 8 template files**

Each file follows this schema:
```json
{
  "name": "...",
  "slug": "...",
  "category": "...",
  "model": "...",
  "system_prompt": "...",
  "tools": [...],
  "setup_script": "...",
  "max_steps": N,
  "icon": "..."
}
```

Templates to create:

**templates/code-assistant.json:**
- name: "Code Assistant"
- slug: "code-assistant"
- category: "development"
- model: "openai/gpt-4o"
- system_prompt: "You are an expert programming assistant. You can write, debug, refactor, and explain code in any language. Use the shell to run code and verify it works. Write clean, well-structured code with clear variable names."
- tools: ["shell_exec", "file_read", "file_write", "list_files"]
- setup_script: ""
- max_steps: 20
- icon: "code"

**templates/web-scraper.json:**
- name: "Web Scraper"
- slug: "web-scraper"
- category: "data"
- model: "openai/gpt-4o-mini"
- system_prompt: "You are a web scraping specialist. You extract structured data from websites. Use curl or python scripts to fetch pages, parse HTML, and save results as JSON or CSV. Always respect robots.txt."
- tools: ["shell_exec", "web_search", "file_write"]
- setup_script: "pip install beautifulsoup4 requests -q"
- max_steps: 15
- icon: "spider"

**templates/data-analyst.json:**
- name: "Data Analyst"
- slug: "data-analyst"
- category: "data"
- model: "openai/gpt-4o"
- system_prompt: "You are a data analyst. You analyze CSV and JSON datasets, compute statistics, find patterns, and generate reports. Use Python with pandas and matplotlib for analysis and visualization."
- tools: ["shell_exec", "file_read", "file_write", "list_files"]
- setup_script: "pip install pandas matplotlib -q"
- max_steps: 20
- icon: "chart"

**templates/system-admin.json:**
- name: "System Admin"
- slug: "system-admin"
- category: "devops"
- model: "openai/gpt-4o-mini"
- system_prompt: "You are a Linux system administrator. You monitor system resources, manage processes, check logs, configure services, and troubleshoot issues. Always explain what you're doing before running commands."
- tools: ["shell_exec", "file_read", "list_files"]
- setup_script: ""
- max_steps: 15
- icon: "server"

**templates/content-writer.json:**
- name: "Content Writer"
- slug: "content-writer"
- category: "content"
- model: "anthropic/claude-3.5-sonnet"
- system_prompt: "You are a professional content writer. You write articles, blog posts, social media copy, and marketing content. Research topics before writing. Deliver well-structured, engaging content."
- tools: ["web_search", "file_write"]
- setup_script: ""
- max_steps: 10
- icon: "pencil"

**templates/api-tester.json:**
- name: "API Tester"
- slug: "api-tester"
- category: "development"
- model: "openai/gpt-4o-mini"
- system_prompt: "You are an API testing specialist. You test REST API endpoints using curl, validate response codes, check response bodies, and report results. Document all test cases and their outcomes."
- tools: ["shell_exec", "web_search", "file_write"]
- setup_script: "apt-get update && apt-get install -y jq -q"
- max_steps: 15
- icon: "flask"

**templates/file-organizer.json:**
- name: "File Organizer"
- slug: "file-organizer"
- category: "productivity"
- model: "openai/gpt-4o-mini"
- system_prompt: "You organize files and directories. You can rename files, move them into categorized folders, clean up duplicates, and create structured directory layouts. Always list what you plan to do before making changes."
- tools: ["shell_exec", "file_read", "list_files", "file_write"]
- setup_script: ""
- max_steps: 15
- icon: "folder"

**templates/research-agent.json:**
- name: "Research Agent"
- slug: "research-agent"
- category: "research"
- model: "anthropic/claude-3.5-sonnet"
- system_prompt: "You are a research assistant. You investigate topics thoroughly, search multiple sources, cross-reference information, and compile comprehensive summaries with citations. Always cite your sources."
- tools: ["web_search", "file_write"]
- setup_script: ""
- max_steps: 15
- icon: "search"

- [ ] **Step 2: Create tools/.gitkeep**

Empty file to keep the custom tools directory in git.

- [ ] **Step 3: Commit**

```bash
git add templates/ tools/.gitkeep
git commit -m "feat: 8 pre-built agent templates"
```

---

## Phase 5: CLI

### Task 10: CLI — Init & Agent Commands

**Files:**
- Create: `cli/package.json`
- Create: `cli/tsconfig.json`
- Create: `cli/src/api-client.ts`
- Create: `cli/src/commands/init.ts`
- Create: `cli/src/commands/agents.ts`
- Create: `cli/src/commands/keys.ts`
- Create: `cli/src/commands/config.ts`
- Create: `cli/src/commands/status.ts`
- Create: `cli/bin/agentsincloud.ts`

- [ ] **Step 1: Create cli/package.json**

```json
{
  "name": "agentsincloud",
  "version": "0.1.0",
  "description": "Agents in Cloud CLI — AI agent infrastructure in one command",
  "bin": {
    "agentsincloud": "./dist/bin/agentsincloud.js"
  },
  "scripts": {
    "dev": "tsx bin/agentsincloud.ts",
    "build": "tsc",
    "start": "node dist/bin/agentsincloud.js"
  },
  "dependencies": {
    "commander": "^13.1.0",
    "chalk": "^5.4.1",
    "ora": "^8.2.0",
    "inquirer": "^12.6.0"
  },
  "devDependencies": {
    "@types/node": "^22.15.2",
    "tsx": "^4.19.4",
    "typescript": "^5.8.3"
  }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["bin", "src"]
}
```

- [ ] **Step 2: Create cli/src/api-client.ts**

```typescript
const DEFAULT_URL = "http://localhost:4000";

export class AICClient {
  constructor(
    private baseUrl: string = process.env.AIC_URL || DEFAULT_URL,
    private apiKey: string = process.env.AIC_API_KEY || ""
  ) {}

  private async request(path: string, opts: RequestInit = {}): Promise<any> {
    const resp = await fetch(`${this.baseUrl}/api${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        ...opts.headers,
      },
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText }));
      throw new Error(err.error || resp.statusText);
    }
    return resp.json();
  }

  // Agents
  listAgents() { return this.request("/agents"); }
  getAgent(id: string) { return this.request(`/agents/${id}`); }
  createAgent(data: any) { return this.request("/agents", { method: "POST", body: JSON.stringify(data) }); }
  updateAgent(id: string, data: any) { return this.request(`/agents/${id}`, { method: "PUT", body: JSON.stringify(data) }); }
  deleteAgent(id: string) { return this.request(`/agents/${id}`, { method: "DELETE" }); }

  // Runs
  async runAgent(id: string, input: string, onEvent: (event: string, data: any) => void) {
    const resp = await fetch(`${this.baseUrl}/api/agents/${id}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": this.apiKey },
      body: JSON.stringify({ input }),
    });
    if (!resp.ok || !resp.body) throw new Error("run failed");

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";
      for (const part of parts) {
        const eventMatch = part.match(/^event: (.+)/m);
        const dataMatch = part.match(/^data: (.+)/m);
        if (eventMatch && dataMatch) {
          try { onEvent(eventMatch[1], JSON.parse(dataMatch[1])); } catch {}
        }
      }
    }
  }

  runAgentSync(id: string, input: string) {
    return this.request(`/agents/${id}/run/sync`, { method: "POST", body: JSON.stringify({ input }) });
  }

  // Keys
  listKeys() { return this.request("/keys"); }
  createKey(name: string) { return this.request("/keys", { method: "POST", body: JSON.stringify({ name }) }); }
  revokeKey(id: string) { return this.request(`/keys/${id}`, { method: "DELETE" }); }

  // Health
  health() { return this.request("/health"); }

  // Runs history
  listRuns() { return this.request("/runs"); }
  getRun(id: string) { return this.request(`/runs/${id}`); }
}
```

- [ ] **Step 3: Create cli/src/commands/init.ts**

```typescript
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const ENV_TEMPLATE = `# Agents in Cloud Configuration
OPENROUTER_API_KEY=__KEY__
AIC_PORT=__PORT__
AIC_SECRET=__SECRET__
`;

export async function initCommand(opts: { port?: string; key?: string }) {
  const chalk = (await import("chalk")).default;
  const inquirer = (await import("inquirer")).default;

  console.log(chalk.bold("\n  Agents in Cloud\n"));

  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "port",
      message: "API port:",
      default: opts.port || "4000",
    },
    {
      type: "input",
      name: "key",
      message: "OpenRouter API key (leave blank to add later):",
      default: opts.key || "",
    },
  ]);

  const dir = join(process.cwd(), "agentsincloud");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  // Generate random secret
  const secret = Array.from({ length: 32 }, () =>
    Math.random().toString(36)[2]
  ).join("");

  const envContent = ENV_TEMPLATE
    .replace("__KEY__", answers.key || "sk-or-v1-your-key-here")
    .replace("__PORT__", answers.port)
    .replace("__SECRET__", secret);

  writeFileSync(join(dir, ".env"), envContent);
  console.log(chalk.green("  Created .env"));

  // Write docker-compose.yml pointing to the Docker images
  const compose = `# Agents in Cloud — docker-compose.yml
# Generated by: npx agentsincloud init

services:
  engine:
    image: agentsincloud/engine:latest
    ports:
      - "8200:8200"
    environment:
      - CLOUD_API_URL=http://containers:9090
      - CLOUD_API_SECRET=\${AIC_SECRET}
    volumes:
      - ./tools:/app/custom_tools
    depends_on:
      containers:
        condition: service_healthy
    restart: unless-stopped

  gateway:
    image: agentsincloud/gateway:latest
    ports:
      - "\${AIC_PORT:-4000}:4000"
    environment:
      - ENGINE_URL=http://engine:8200
      - CONTAINERS_URL=http://containers:9090
      - AIC_SECRET=\${AIC_SECRET}
      - OPENROUTER_API_KEY=\${OPENROUTER_API_KEY}
      - DATABASE_PATH=/data/agentsincloud.db
    volumes:
      - aic-data:/data
    depends_on:
      - engine
    restart: unless-stopped

  containers:
    image: agentsincloud/containers:latest
    ports:
      - "9090:9090"
    environment:
      - AIC_SECRET=\${AIC_SECRET}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:9090/health"]
      interval: 5s
      timeout: 3s
      retries: 3
    restart: unless-stopped

  chat:
    image: agentsincloud/chat:latest
    ports:
      - "3000:80"
    depends_on:
      - gateway
    restart: unless-stopped

volumes:
  aic-data:
`;

  writeFileSync(join(dir, "docker-compose.yml"), compose);
  console.log(chalk.green("  Created docker-compose.yml"));

  // Create tools dir
  const toolsDir = join(dir, "tools");
  if (!existsSync(toolsDir)) mkdirSync(toolsDir);

  console.log(chalk.bold.green(`\n  Done! To start:\n`));
  console.log(`  cd agentsincloud`);
  console.log(`  docker compose up -d`);
  console.log(`\n  API: http://localhost:${answers.port}`);
  console.log(`  Chat: http://localhost:3000\n`);
}
```

- [ ] **Step 4: Create cli/src/commands/agents.ts**

```typescript
import { AICClient } from "../api-client.js";

export async function agentsList() {
  const chalk = (await import("chalk")).default;
  const client = new AICClient();
  const agents = await client.listAgents();
  if (agents.length === 0) {
    console.log("No agents found.");
    return;
  }
  console.log(chalk.bold(`\n  ${agents.length} agents:\n`));
  for (const a of agents) {
    const tmpl = a.is_template ? chalk.dim(" (template)") : "";
    console.log(`  ${chalk.cyan(a.slug)}  ${a.name}  [${a.model}]${tmpl}`);
  }
  console.log();
}

export async function agentsCreate(opts: { name: string; model?: string }) {
  const chalk = (await import("chalk")).default;
  const client = new AICClient();
  const agent = await client.createAgent({
    name: opts.name,
    model: opts.model || "openai/gpt-4o-mini",
  });
  console.log(chalk.green(`\n  Agent created: ${agent.slug} (${agent.id})\n`));
}

export async function agentsRun(idOrSlug: string, opts: { input: string }) {
  const chalk = (await import("chalk")).default;
  const client = new AICClient();
  console.log(chalk.dim(`\n  Running ${idOrSlug}...\n`));
  await client.runAgent(idOrSlug, opts.input, (event, data) => {
    switch (event) {
      case "agent.text":
        process.stdout.write(data.text || "");
        break;
      case "agent.tool_use":
        console.log(chalk.yellow(`  [tool] ${data.tool}`));
        break;
      case "agent.tool_result":
        console.log(chalk.dim(`  ${(data.output || "").substring(0, 200)}`));
        break;
      case "run.completed":
        console.log(chalk.green(`\n  Completed (${data.steps} steps)\n`));
        break;
      case "run.error":
        console.log(chalk.red(`\n  Error: ${data.error}\n`));
        break;
    }
  });
}

export async function agentsDelete(idOrSlug: string) {
  const chalk = (await import("chalk")).default;
  const client = new AICClient();
  await client.deleteAgent(idOrSlug);
  console.log(chalk.green(`\n  Agent ${idOrSlug} deleted.\n`));
}
```

- [ ] **Step 5: Create cli/src/commands/keys.ts**

```typescript
import { AICClient } from "../api-client.js";

export async function keysList() {
  const chalk = (await import("chalk")).default;
  const client = new AICClient();
  const keys = await client.listKeys();
  if (keys.length === 0) { console.log("No API keys."); return; }
  console.log(chalk.bold(`\n  ${keys.length} API keys:\n`));
  for (const k of keys) {
    console.log(`  ${chalk.cyan(k.key_prefix)}  ${k.name}  ${chalk.dim(k.created_at)}`);
  }
  console.log();
}

export async function keysCreate(opts: { name: string }) {
  const chalk = (await import("chalk")).default;
  const client = new AICClient();
  const result = await client.createKey(opts.name);
  console.log(chalk.green(`\n  API key created:\n`));
  console.log(`  ${chalk.bold(result.key)}\n`);
  console.log(chalk.yellow("  Save this key — it won't be shown again.\n"));
}

export async function keysRevoke(id: string) {
  const chalk = (await import("chalk")).default;
  const client = new AICClient();
  await client.revokeKey(id);
  console.log(chalk.green(`\n  Key revoked.\n`));
}
```

- [ ] **Step 6: Create cli/src/commands/config.ts and status.ts**

**config.ts:**
```typescript
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const ENV_PATH = join(process.cwd(), ".env");

export function configSet(key: string, value: string) {
  let content = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf-8") : "";
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content += `\n${key}=${value}`;
  }
  writeFileSync(ENV_PATH, content);
  console.log(`  Set ${key}`);
}

export function configGet() {
  if (!existsSync(ENV_PATH)) {
    console.log("No .env file found. Run 'agentsincloud init' first.");
    return;
  }
  const content = readFileSync(ENV_PATH, "utf-8");
  const lines = content.split("\n").filter((l) => l.includes("=") && !l.startsWith("#"));
  for (const line of lines) {
    const [key, ...rest] = line.split("=");
    const value = rest.join("=");
    // Mask sensitive values
    const masked = key.includes("KEY") || key.includes("SECRET")
      ? value.substring(0, 8) + "..."
      : value;
    console.log(`  ${key} = ${masked}`);
  }
}
```

**status.ts:**
```typescript
import { AICClient } from "../api-client.js";

export async function statusCommand() {
  const chalk = (await import("chalk")).default;
  const client = new AICClient();
  try {
    const health = await client.health();
    console.log(chalk.bold("\n  Agents in Cloud Status\n"));
    for (const [service, status] of Object.entries(health.services)) {
      const icon = status === "ok" ? chalk.green("*") : chalk.red("*");
      console.log(`  ${icon} ${service}: ${status}`);
    }
    console.log();
  } catch (e: any) {
    console.log(chalk.red(`\n  Cannot connect to Agents in Cloud: ${e.message}\n`));
  }
}
```

- [ ] **Step 7: Create cli/bin/agentsincloud.ts**

```typescript
#!/usr/bin/env node
import { Command } from "commander";
import { initCommand } from "../src/commands/init.js";
import { agentsList, agentsCreate, agentsRun, agentsDelete } from "../src/commands/agents.js";
import { keysList, keysCreate, keysRevoke } from "../src/commands/keys.js";
import { configSet, configGet } from "../src/commands/config.js";
import { statusCommand } from "../src/commands/status.js";

const program = new Command();

program
  .name("agentsincloud")
  .description("Agents in Cloud — AI agent infrastructure in one command")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize Agents in Cloud in the current directory")
  .option("-p, --port <port>", "API port", "4000")
  .option("-k, --key <key>", "OpenRouter API key")
  .action(initCommand);

// Agents
const agentsCmd = program.command("agents").description("Manage agents");
agentsCmd.command("list").description("List all agents").action(agentsList);
agentsCmd.command("create").description("Create an agent")
  .requiredOption("--name <name>", "Agent name")
  .option("--model <model>", "Model ID", "openai/gpt-4o-mini")
  .action(agentsCreate);
agentsCmd.command("run <id>").description("Run an agent")
  .requiredOption("--input <input>", "User input")
  .action(agentsRun);
agentsCmd.command("delete <id>").description("Delete an agent").action(agentsDelete);

// Keys
const keysCmd = program.command("keys").description("Manage API keys");
keysCmd.command("list").description("List API keys").action(keysList);
keysCmd.command("create").description("Create API key")
  .requiredOption("--name <name>", "Key name")
  .action(keysCreate);
keysCmd.command("revoke <id>").description("Revoke API key").action(keysRevoke);

// Config
const cfgCmd = program.command("config").description("Manage configuration");
cfgCmd.command("set <key> <value>").description("Set config value").action(configSet);
cfgCmd.command("get").description("Show current config").action(configGet);

// Status
program.command("status").description("Check service health").action(statusCommand);

// Logs
program.command("logs").description("View logs")
  .option("-f, --follow", "Follow log output")
  .action(async (opts) => {
    const { execSync } = await import("child_process");
    const cmd = opts.follow ? "docker compose logs -f" : "docker compose logs --tail=100";
    execSync(cmd, { stdio: "inherit" });
  });

program.parse();
```

- [ ] **Step 8: Install deps and verify build**

```bash
cd cli && npm install && npx tsc --noEmit
```

- [ ] **Step 9: Commit**

```bash
git add cli/
git commit -m "feat: CLI — init, agents, keys, config, status commands"
```

---

## Phase 6: Chat Web (React)

### Task 11: Chat — React App with Landing, Agent Grid, and Chat

**Files:**
- Create: `chat/package.json`
- Create: `chat/vite.config.ts`
- Create: `chat/tsconfig.json`
- Create: `chat/tailwind.config.js`
- Create: `chat/postcss.config.js`
- Create: `chat/index.html`
- Create: `chat/src/main.tsx`
- Create: `chat/src/App.tsx`
- Create: `chat/src/index.css`
- Create: `chat/src/pages/Landing.tsx`
- Create: `chat/src/pages/Home.tsx`
- Create: `chat/src/pages/Chat.tsx`
- Create: `chat/src/components/AgentCard.tsx`
- Create: `chat/src/components/ChatMessage.tsx`
- Create: `chat/src/components/ToolCall.tsx`
- Create: `chat/Dockerfile`
- Create: `chat/nginx.conf`

- [ ] **Step 1: Create chat/package.json and config files**

```json
{
  "name": "@agentsincloud/chat",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "react-router-dom": "^7.5.2"
  },
  "devDependencies": {
    "@types/react": "^19.1.2",
    "@types/react-dom": "^19.1.2",
    "@vitejs/plugin-react": "^4.4.1",
    "autoprefixer": "^10.4.21",
    "postcss": "^8.5.3",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.8.3",
    "vite": "^6.3.2"
  }
}
```

**vite.config.ts:**
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
});
```

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

**tailwind.config.js:**
```javascript
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: { extend: {} },
  plugins: [],
};
```

**postcss.config.js:**
```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 2: Create chat/index.html**

```html
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Agents in Cloud</title>
</head>
<body class="bg-gray-950 text-gray-100">
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 3: Create chat/src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: Create chat/src/main.tsx and App.tsx**

**main.tsx:**
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
```

**App.tsx:**
```tsx
import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Home from "./pages/Home";
import Chat from "./pages/Chat";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/agents" element={<Home />} />
      <Route path="/agents/:slug" element={<Chat />} />
    </Routes>
  );
}
```

- [ ] **Step 5: Create chat/src/pages/Landing.tsx**

Build a single-page landing with these sections stacked vertically:

1. **Hero**: "AI Agents API in one command." heading, subtext, animated terminal showing `npx agentsincloud init`, two CTA buttons ("Get Started" linking to /agents, "GitHub" linking to repo)
2. **How it works**: 3-column grid — Install, Configure, Use the API — each with icon, title, description
3. **Templates**: Grid of the 8 agent cards (hardcoded data, links to /agents/:slug)
4. **Pricing**: Two cards — "Self-hosted: Free forever" and "Cloud: Pay as you go" with feature lists
5. **Footer**: Links to GitHub, docs

Use Tailwind utility classes. Dark theme (bg-gray-950 base). Keep it clean and modern.

- [ ] **Step 6: Create chat/src/pages/Home.tsx**

Fetches agents from `GET /api/agents` and renders a grid of `AgentCard` components. Shows loading spinner while fetching. Links each card to `/agents/:slug`.

```tsx
import { useState, useEffect } from "react";
import AgentCard from "../components/AgentCard";

interface Agent {
  id: string;
  slug: string;
  name: string;
  model: string;
  category: string;
  icon: string;
  system_prompt: string;
}

export default function Home() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agents", {
      headers: { "x-api-key": import.meta.env.VITE_AIC_DEMO_KEY || "demo" },
    })
      .then((r) => r.json())
      .then(setAgents)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Agents</h1>
        <p className="text-gray-400 mb-8">Choose an agent to start a conversation.</p>
        {loading ? (
          <p className="text-gray-500">Loading agents...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {agents.map((a) => (
              <AgentCard key={a.id} agent={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create chat/src/components/AgentCard.tsx**

```tsx
import { Link } from "react-router-dom";

const ICONS: Record<string, string> = {
  code: "\u{1F4BB}", spider: "\u{1F577}", chart: "\u{1F4CA}",
  server: "\u{1F5A5}", pencil: "\u{270F}", flask: "\u{1F9EA}",
  folder: "\u{1F4C1}", search: "\u{1F50D}", bot: "\u{1F916}",
};

interface Props {
  agent: { slug: string; name: string; model: string; category: string; icon: string };
}

export default function AgentCard({ agent }: Props) {
  return (
    <Link
      to={`/agents/${agent.slug}`}
      className="block p-6 rounded-xl bg-gray-900 border border-gray-800 hover:border-blue-500 transition-colors"
    >
      <div className="text-3xl mb-3">{ICONS[agent.icon] || ICONS.bot}</div>
      <h3 className="font-semibold text-lg">{agent.name}</h3>
      <p className="text-sm text-gray-400 mt-1">{agent.model}</p>
      <span className="inline-block mt-3 text-xs px-2 py-1 rounded-full bg-gray-800 text-gray-300">
        {agent.category}
      </span>
    </Link>
  );
}
```

- [ ] **Step 8: Create chat/src/pages/Chat.tsx**

Chat page that:
1. Fetches agent info from `/api/agents/:slug`
2. Shows a message input at the bottom
3. On submit, calls `POST /api/agents/:slug/run` with SSE
4. Renders messages using `ChatMessage` component
5. Shows tool calls using `ToolCall` component
6. Has a "Back" link to `/agents`

Key implementation: use `fetch()` with SSE parsing (read the stream, split by `\n\n`, parse `event:` and `data:` lines). Accumulate messages in state array.

```tsx
import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import ChatMessage from "../components/ChatMessage";
import ToolCall from "../components/ToolCall";

interface Message {
  type: "user" | "agent" | "tool";
  text: string;
  toolName?: string;
  toolInput?: any;
  toolOutput?: string;
}

export default function Chat() {
  const { slug } = useParams<{ slug: string }>();
  const [agent, setAgent] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const API_KEY = import.meta.env.VITE_AIC_DEMO_KEY || "demo";

  useEffect(() => {
    fetch(`/api/agents/${slug}`, { headers: { "x-api-key": API_KEY } })
      .then((r) => r.json())
      .then(setAgent)
      .catch(console.error);
  }, [slug]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || running) return;

    const userMsg = input.trim();
    setInput("");
    setMessages((m) => [...m, { type: "user", text: userMsg }]);
    setRunning(true);

    try {
      const resp = await fetch(`/api/agents/${slug}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({ input: userMsg }),
      });

      if (!resp.ok || !resp.body) throw new Error("Run failed");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const eventMatch = part.match(/^event: (.+)/m);
          const dataMatch = part.match(/^data: (.+)/m);
          if (!eventMatch || !dataMatch) continue;
          const event = eventMatch[1];
          let data: any;
          try { data = JSON.parse(dataMatch[1]); } catch { continue; }

          switch (event) {
            case "agent.text":
              setMessages((m) => [...m, { type: "agent", text: data.text || "" }]);
              break;
            case "agent.tool_use":
              setMessages((m) => [...m, { type: "tool", text: "", toolName: data.tool, toolInput: data.input }]);
              break;
            case "agent.tool_result":
              setMessages((m) => {
                const updated = [...m];
                for (let i = updated.length - 1; i >= 0; i--) {
                  if (updated[i].type === "tool" && updated[i].toolName === data.tool && !updated[i].toolOutput) {
                    updated[i] = { ...updated[i], toolOutput: data.output };
                    break;
                  }
                }
                return updated;
              });
              break;
          }
        }
      }
    } catch (e: any) {
      setMessages((m) => [...m, { type: "agent", text: `Error: ${e.message}` }]);
    }

    setRunning(false);
  }

  if (!agent) return <div className="p-8 text-gray-500">Loading...</div>;

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-800">
        <Link to="/agents" className="text-gray-400 hover:text-white">&larr;</Link>
        <h1 className="font-semibold text-lg">{agent.name}</h1>
        <span className="text-sm text-gray-500">{agent.model}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((m, i) =>
          m.type === "tool" ? (
            <ToolCall key={i} name={m.toolName!} input={m.toolInput} output={m.toolOutput} />
          ) : (
            <ChatMessage key={i} role={m.type} text={m.text} />
          )
        )}
        {running && <div className="text-gray-500 animate-pulse">Thinking...</div>}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-800">
        <div className="flex gap-2 max-w-4xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-3 rounded-lg bg-gray-900 border border-gray-700 focus:border-blue-500 focus:outline-none"
            disabled={running}
          />
          <button
            type="submit"
            disabled={running || !input.trim()}
            className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 9: Create chat/src/components/ChatMessage.tsx and ToolCall.tsx**

**ChatMessage.tsx:**
```tsx
interface Props {
  role: "user" | "agent";
  text: string;
}

export default function ChatMessage({ role, text }: Props) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-2xl px-4 py-3 rounded-xl whitespace-pre-wrap ${
          isUser
            ? "bg-blue-600 text-white"
            : "bg-gray-800 text-gray-100"
        }`}
      >
        {text}
      </div>
    </div>
  );
}
```

**ToolCall.tsx:**
```tsx
import { useState } from "react";

interface Props {
  name: string;
  input: any;
  output?: string;
}

export default function ToolCall({ name, input, output }: Props) {
  const [expanded, setExpanded] = useState(false);
  const inputStr = typeof input === "string" ? input : JSON.stringify(input, null, 2);

  return (
    <div className="mx-4 border border-gray-700 rounded-lg overflow-hidden text-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-gray-900 hover:bg-gray-800 text-left"
      >
        <span className="text-yellow-400">{output ? "\u2713" : "\u25B6"}</span>
        <span className="font-mono text-gray-300">{name}</span>
        <span className="ml-auto text-gray-500">{expanded ? "\u25B2" : "\u25BC"}</span>
      </button>
      {expanded && (
        <div className="p-3 bg-gray-950 space-y-2">
          <div>
            <div className="text-xs text-gray-500 mb-1">Input:</div>
            <pre className="text-gray-400 text-xs overflow-x-auto">{inputStr}</pre>
          </div>
          {output && (
            <div>
              <div className="text-xs text-gray-500 mb-1">Output:</div>
              <pre className="text-gray-400 text-xs overflow-x-auto">{output}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 10: Create chat/Dockerfile and nginx.conf**

**nginx.conf:**
```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://gateway:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
        proxy_cache off;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
    }
}
```

**Dockerfile:**
```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

- [ ] **Step 11: Install deps and verify build**

```bash
cd chat && npm install && npx tsc --noEmit
```

- [ ] **Step 12: Commit**

```bash
git add chat/
git commit -m "feat: chat web — landing page, agent grid, and chat UI"
```

---

## Phase 7: Integration & Polish

### Task 12: Docker Compose Integration Test

- [ ] **Step 1: Update docker-compose.yml volumes for templates**

Add read-only template volume mount to gateway service:

```yaml
  gateway:
    # ... existing config ...
    volumes:
      - aic-data:/data
      - ./templates:/app/templates:ro
```

- [ ] **Step 2: Build and test all services**

```bash
docker compose build
docker compose up -d
```

- [ ] **Step 3: Verify health**

```bash
curl http://localhost:4000/api/health
# Expected: {"status":"ok","services":{"gateway":"ok","engine":"ok","containers":"ok"}}
```

- [ ] **Step 4: Verify agents were seeded**

```bash
curl http://localhost:4000/api/agents -H "x-api-key: $(grep AIC_SECRET .env | cut -d= -f2)"
# Expected: array of 8 template agents
```

- [ ] **Step 5: Test a run**

```bash
curl -N http://localhost:4000/api/agents/research-agent/run \
  -H "x-api-key: $(grep AIC_SECRET .env | cut -d= -f2)" \
  -H "Content-Type: application/json" \
  -d '{"input": "What is Agents in Cloud?"}'
```

- [ ] **Step 6: Verify chat UI**

Open `http://localhost:3000` in a browser. Verify:
- Landing page loads with all sections
- `/agents` shows 8 agent cards
- Clicking an agent opens chat
- Sending a message streams a response

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: docker compose integration adjustments"
```

---

### Task 13: Update .gitignore and Final Cleanup

**Files:**
- Create: `.gitignore`
- Delete: `server.py.bak` (after confirming engine works)

- [ ] **Step 1: Create .gitignore**

```
node_modules/
dist/
.env
*.db
__pycache__/
*.pyc
.vite/
```

- [ ] **Step 2: Remove old server.py backup**

```bash
rm server.py.bak
```

- [ ] **Step 3: Final commit**

```bash
git add .gitignore
git rm server.py.bak
git commit -m "chore: cleanup — add .gitignore, remove old server.py"
```

---

### Task 14: Deploy to agentsincloud.com

- [ ] **Step 1: SSH to Vultr Miami VM and pull repo**

```bash
ssh root@45.77.114.97
cd /opt && git clone https://github.com/lucasaugustodev/smol-cloud agentsincloud
cd agentsincloud
cp .env.example .env
# Edit .env with production values
```

- [ ] **Step 2: Configure .env for production**

Set `OPENROUTER_API_KEY`, generate a strong `AIC_SECRET`, set `AIC_PORT=4000`.

- [ ] **Step 3: Build and start with Docker Compose**

```bash
docker compose up -d --build
```

- [ ] **Step 4: Point agentsincloud.com domain via Cloudflare**

Using Cloudflare API (key: `76a9dc681e6cf0f30b03c46e12a1651b`):
- Create A record: `agentsincloud.com` -> `45.77.114.97` (proxied)
- Create A record: `*.agentsincloud.com` -> `45.77.114.97` (proxied)

- [ ] **Step 5: Configure nginx reverse proxy on VM**

Set up nginx to proxy:
- Port 80/443 -> gateway:4000 for `/api`
- Port 80/443 -> chat:3000 for everything else
- SSL via Cloudflare (Full strict mode)

- [ ] **Step 6: Verify production deployment**

```bash
curl https://agentsincloud.com/api/health
```

- [ ] **Step 7: Commit any deployment config**

```bash
git add -A
git commit -m "chore: production deployment config"
```
