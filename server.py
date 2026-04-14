#!/usr/bin/env python3
"""
Smol Cloud Managed Agents — centralized AI agent service.

A managed agents service like Anthropic's, but using smolagents + OpenRouter.
Runs as a standalone service, handles multiple users concurrently.
Tools execute in user containers via an external Container Manager API.

Usage:
  python server.py

Environment:
  CLOUD_API_URL    — Container Manager URL (default: http://127.0.0.1:9090)
  CLOUD_API_SECRET — Container Manager auth key
  SMOLAGENT_PORT   — Port to listen on (default: 8200)
"""
import json
import os
import sys
import traceback
import urllib.request
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
from concurrent.futures import ThreadPoolExecutor

try:
    from smolagents import ToolCallingAgent, tool
    from smolagents import OpenAIServerModel
except ImportError:
    import subprocess
    print("[SmolCloud] Installing smolagents...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "smolagents[openai]", "-q"])
    from smolagents import ToolCallingAgent, tool
    from smolagents import OpenAIServerModel

CLOUD_URL = os.environ.get("CLOUD_API_URL", "http://127.0.0.1:9090")
CLOUD_SECRET = os.environ.get("CLOUD_API_SECRET", "agentify-cloud-secret-2026")

executor = ThreadPoolExecutor(max_workers=10)


# ── Container Operations (via Cloud Manager API) ──

def cloud_exec(container: str, command: str) -> str:
    """Execute command in a container via Cloud Manager."""
    try:
        data = json.dumps({"command": command, "user": "root"}).encode()
        req = urllib.request.Request(
            f"{CLOUD_URL}/containers/{container}/exec",
            data=data,
            headers={"Content-Type": "application/json", "x-api-key": CLOUD_SECRET},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
            output = result.get("output", "")
            if result.get("exit_code", 0) != 0:
                output += f"\n[exit code: {result['exit_code']}]"
            return output or "(no output)"
    except Exception as e:
        return f"[exec error: {e}]"


def cloud_read_file(container: str, path: str) -> str:
    """Read file from container."""
    try:
        url = f"{CLOUD_URL}/containers/{container}/files/download?path={urllib.parse.quote(path)}"
        req = urllib.request.Request(url, headers={"x-api-key": CLOUD_SECRET})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
            content = data.get("content", "")
            if len(content) > 50000:
                content = content[:50000] + f"\n[truncated, {len(content)} total]"
            return content or "(empty)"
    except Exception as e:
        return f"[read error: {e}]"


def cloud_write_file(container: str, path: str, content: str) -> str:
    """Write file to container."""
    try:
        data = json.dumps({"path": path, "content": content}).encode()
        req = urllib.request.Request(
            f"{CLOUD_URL}/containers/{container}/files/upload",
            data=data,
            headers={"Content-Type": "application/json", "x-api-key": CLOUD_SECRET},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            return f"Written to {path}"
    except Exception as e:
        return f"[write error: {e}]"


# ── Tool Factory (creates tools bound to a container) ──

def make_tools(container: str):
    @tool
    def shell_exec(command: str) -> str:
        """Execute a shell command in the cloud container.
        Args:
            command: The shell command to execute.
        """
        return cloud_exec(container, command)

    @tool
    def file_read(path: str) -> str:
        """Read a file from the cloud container.
        Args:
            path: Absolute path to the file.
        """
        return cloud_read_file(container, path)

    @tool
    def file_write(path: str, content: str) -> str:
        """Write content to a file in the cloud container.
        Args:
            path: Absolute path to write to.
            content: Content to write.
        """
        return cloud_write_file(container, path, content)

    @tool
    def list_files(directory: str = "/home/user") -> str:
        """List files in a directory in the cloud container.
        Args:
            directory: Path to list. Defaults to /home/user.
        """
        return cloud_exec(container, f"ls -la {directory} 2>&1")

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

    return [shell_exec, file_read, file_write, list_files, web_search]


# ── HTTP Server ──

class SmolCloudHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "service": "smol-cloud"}).encode())
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        if self.path != "/run":
            self.send_response(404)
            self.end_headers()
            return

        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length else {}

        api_key = body.get("api_key", "")
        model_id = body.get("model", "openai/gpt-4o-mini")
        system_prompt = body.get("system_prompt", "You are a helpful assistant. Respond in Portuguese.")
        user_input = body.get("input", "")
        container = body.get("container", "")

        if not api_key or not user_input or not container:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "api_key, input, and container are required"}).encode())
            return

        # SSE streaming response
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        def send_sse(event, data):
            try:
                self.wfile.write(f"event: {event}\ndata: {json.dumps(data)}\n\n".encode())
                self.wfile.flush()
            except:
                pass

        send_sse("run.started", {"type": "smol-cloud", "model": model_id})

        try:
            # Create model via OpenRouter
            model = OpenAIServerModel(
                model_id=model_id,
                api_key=api_key,
                api_base="https://openrouter.ai/api/v1",
            )

            # Create agent with container-bound tools
            tools = make_tools(container)
            agent = ToolCallingAgent(tools=tools, model=model, max_steps=15)

            # Set custom system prompt
            if system_prompt:
                agent.prompt_templates["system_prompt"] = system_prompt

            # Monkey-patch to stream tool calls
            original_execute = agent.execute_tool_call
            def patched_execute(tool_name, arguments):
                send_sse("agent.tool_use", {"tool": tool_name, "input": arguments})
                result = original_execute(tool_name, arguments)
                send_sse("agent.tool_result", {"tool": tool_name, "output": str(result)[:500]})
                return result
            agent.execute_tool_call = patched_execute

            # Run
            result = agent.run(user_input)
            send_sse("agent.text", {"text": str(result)})
            send_sse("run.completed", {
                "model": model_id,
                "steps": getattr(agent, "step_number", 0),
            })

        except Exception as e:
            traceback.print_exc()
            send_sse("run.error", {"error": str(e)})

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()


if __name__ == "__main__":
    port = int(os.environ.get("SMOLAGENT_PORT", "8200"))
    server = HTTPServer(("0.0.0.0", port), SmolCloudHandler)
    print(f"[SmolCloud] Managed Agents service running on port {port}")
    server.serve_forever()
