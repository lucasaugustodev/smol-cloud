"""Tool loader — auto-discovery of built-in, plugin, and YAML tools."""

import importlib.util
import os
import sys
from pathlib import Path
from typing import Any

import yaml

from smolagents import tool

from builtin_tools import shell, files, web_search

CUSTOM_TOOLS_DIR = os.environ.get("CUSTOM_TOOLS_DIR", "/app/custom_tools")

# Registry of built-in tool factories
_BUILTIN_FACTORIES = {
    "shell_exec": lambda container, env: [shell.make_shell_tool(container, env)],
    "file_read": lambda container, env: [files.make_file_tools(container)[0]],
    "file_write": lambda container, env: [files.make_file_tools(container)[1]],
    "list_files": lambda container, env: [files.make_file_tools(container)[2]],
    "web_search": lambda container, env: [web_search.make_web_search_tool()],
}

# All built-in tool names for wildcard resolution
ALL_BUILTIN = list(_BUILTIN_FACTORIES.keys())

# Plugin cache
_plugin_cache: dict[str, Any] = {}
_yaml_cache: dict[str, Any] = {}


def init_builtin_config(cloud_url: str, cloud_secret: str) -> None:
    """Configure built-in tool modules with Cloud Manager connection."""
    shell.configure(cloud_url, cloud_secret)
    files.configure(cloud_url, cloud_secret)


def load_builtin_tools(container: str, tool_names: list[str], env: dict | None = None) -> list:
    """Create tool instances for specified built-in tools."""
    tools = []
    names = tool_names if tool_names else ALL_BUILTIN

    for name in names:
        factory = _BUILTIN_FACTORIES.get(name)
        if factory:
            tools.extend(factory(container, env))

    return tools


def load_python_plugins() -> dict[str, Any]:
    """Scan CUSTOM_TOOLS_DIR for .py files with @tool decorated functions."""
    global _plugin_cache

    if _plugin_cache:
        return _plugin_cache

    tools_dir = Path(CUSTOM_TOOLS_DIR)
    if not tools_dir.exists():
        return {}

    for py_file in tools_dir.glob("*.py"):
        module_name = py_file.stem
        try:
            spec = importlib.util.spec_from_file_location(module_name, str(py_file))
            if spec and spec.loader:
                mod = importlib.util.module_from_spec(spec)
                sys.modules[module_name] = mod
                spec.loader.exec_module(mod)

                # Find @tool decorated functions (they have .name attribute from smolagents)
                for attr_name in dir(mod):
                    obj = getattr(mod, attr_name)
                    if callable(obj) and hasattr(obj, "name"):
                        _plugin_cache[obj.name] = obj
        except Exception as e:
            print(f"[tool_loader] Failed to load plugin {py_file}: {e}")

    return _plugin_cache


def load_yaml_tools() -> dict[str, Any]:
    """Scan CUSTOM_TOOLS_DIR for .yaml/.yml files and create HTTP wrapper tools."""
    global _yaml_cache

    if _yaml_cache:
        return _yaml_cache

    tools_dir = Path(CUSTOM_TOOLS_DIR)
    if not tools_dir.exists():
        return {}

    for yaml_file in tools_dir.glob("*.y*ml"):
        try:
            with open(yaml_file, "r") as f:
                spec = yaml.safe_load(f)

            if not spec or "name" not in spec:
                continue

            tool_name = spec["name"]
            url = spec.get("url", "")
            method = spec.get("method", "GET").upper()
            headers = spec.get("headers", {})
            description = spec.get("description", f"HTTP tool: {tool_name}")

            import json
            import urllib.request

            def _make_yaml_tool(t_name, t_url, t_method, t_headers, t_desc):
                @tool
                def yaml_http_tool(input_data: str = "") -> str:
                    f"""{t_desc}
                    Args:
                        input_data: Input data to send (JSON string for POST, query params for GET).
                    """
                    try:
                        req_url = t_url
                        data = None
                        req_headers = dict(t_headers)

                        if t_method == "POST" and input_data:
                            data = input_data.encode()
                            req_headers.setdefault("Content-Type", "application/json")
                        elif input_data:
                            req_url = f"{t_url}?{input_data}"

                        req = urllib.request.Request(
                            req_url, data=data, headers=req_headers, method=t_method
                        )
                        with urllib.request.urlopen(req, timeout=30) as resp:
                            return resp.read().decode("utf-8", errors="replace")
                    except Exception as e:
                        return f"[{t_name} error: {e}]"

                yaml_http_tool.name = t_name
                return yaml_http_tool

            _yaml_cache[tool_name] = _make_yaml_tool(
                tool_name, url, method, headers, description
            )
        except Exception as e:
            print(f"[tool_loader] Failed to load YAML tool {yaml_file}: {e}")

    return _yaml_cache


def resolve_tools(
    container: str, tool_names: list[str] | None = None, env: dict | None = None
) -> list:
    """Resolve tool names to instances.

    Checks built-in first, then plugins, then YAML tools.
    If tool_names is None or empty, returns all built-in tools.
    """
    if not tool_names:
        return load_builtin_tools(container, ALL_BUILTIN, env)

    resolved = []
    remaining = []

    # Try built-in first
    for name in tool_names:
        if name in _BUILTIN_FACTORIES:
            resolved.extend(_BUILTIN_FACTORIES[name](container, env))
        else:
            remaining.append(name)

    if not remaining:
        return resolved

    # Try plugins
    plugins = load_python_plugins()
    still_remaining = []
    for name in remaining:
        if name in plugins:
            resolved.append(plugins[name])
        else:
            still_remaining.append(name)

    if not still_remaining:
        return resolved

    # Try YAML tools
    yaml_tools = load_yaml_tools()
    for name in still_remaining:
        if name in yaml_tools:
            resolved.append(yaml_tools[name])
        else:
            print(f"[tool_loader] Warning: tool '{name}' not found")

    return resolved
