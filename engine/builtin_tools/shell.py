"""Shell execution tool — runs commands in cloud containers."""

import json
import urllib.request

from smolagents import tool

_cloud_url: str = ""
_cloud_secret: str = ""


def configure(cloud_url: str, cloud_secret: str) -> None:
    """Set the Cloud Manager connection details."""
    global _cloud_url, _cloud_secret
    _cloud_url = cloud_url
    _cloud_secret = cloud_secret


def cloud_exec(container: str, command: str, env: dict | None = None, timeout: int = 60) -> str:
    """Execute a command in a container via Cloud Manager API."""
    try:
        if env:
            exports = " && ".join(f"export {k}={v}" for k, v in env.items())
            command = f"{exports} && {command}"

        data = json.dumps({"command": command, "user": "root"}).encode()
        req = urllib.request.Request(
            f"{_cloud_url}/containers/{container}/exec",
            data=data,
            headers={"Content-Type": "application/json", "x-api-key": _cloud_secret},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            result = json.loads(resp.read())
            output = result.get("output", "")
            if result.get("exit_code", 0) != 0:
                output += f"\n[exit code: {result['exit_code']}]"
            return output or "(no output)"
    except Exception as e:
        return f"[exec error: {e}]"


def make_shell_tool(container: str, env: dict | None = None):
    """Create a shell_exec tool bound to a specific container."""

    @tool
    def shell_exec(command: str) -> str:
        """Execute a shell command in the cloud container.
        Args:
            command: The shell command to execute.
        """
        return cloud_exec(container, command, env=env)

    return shell_exec
