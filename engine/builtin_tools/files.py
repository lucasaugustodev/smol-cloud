"""File operation tools — read, write, and list files in cloud containers."""

import json
import urllib.request

from smolagents import tool

from .shell import cloud_exec

_cloud_url: str = ""
_cloud_secret: str = ""


def configure(cloud_url: str, cloud_secret: str) -> None:
    """Set the Cloud Manager connection details."""
    global _cloud_url, _cloud_secret
    _cloud_url = cloud_url
    _cloud_secret = cloud_secret


def make_file_tools(container: str):
    """Create file operation tools bound to a specific container."""

    @tool
    def file_read(path: str) -> str:
        """Read a file from the cloud container.
        Args:
            path: Absolute path to the file.
        """
        try:
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
                f"{_cloud_url}/containers/{container}/upload",
                data=data,
                headers={"Content-Type": "application/json", "x-api-key": _cloud_secret},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                return f"Written to {path}"
        except Exception as e:
            # Fallback: use exec with heredoc
            escaped = content.replace("'", "'\\''")
            return cloud_exec(
                container,
                f"mkdir -p $(dirname {path}) && cat > {path} << 'AGENTEOF'\n{escaped}\nAGENTEOF",
            )

    @tool
    def list_files(directory: str = "/home/user") -> str:
        """List files in a directory in the cloud container.
        Args:
            directory: Path to list. Defaults to /home/user.
        """
        return cloud_exec(container, f"ls -la {directory} 2>&1")

    return [file_read, file_write, list_files]
