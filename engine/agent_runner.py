"""Agent runner — creates and runs ToolCallingAgent with streaming events."""

import re
from typing import Callable

from smolagents import ToolCallingAgent, OpenAIServerModel

from builtin_tools.shell import cloud_exec
from tool_loader import resolve_tools

# Track containers that already ran their setup script
_completed_setups: set = set()

# Per-container env vars (extracted from system_prompt)
_container_env: dict = {}


def _extract_env_vars(system_prompt: str) -> dict[str, str]:
    """Extract env vars from system_prompt (lines with export KEY=VALUE)."""
    pattern = re.compile(r"export\s+([A-Z_][A-Z0-9_]*)=([^\s\n]+)")
    return dict(pattern.findall(system_prompt))


def run_agent(
    api_key: str,
    model_id: str,
    system_prompt: str,
    user_input: str,
    container: str,
    tool_names: list[str] | None = None,
    setup_script: str | None = None,
    max_steps: int = 50,
    on_event: Callable | None = None,
) -> dict:
    """Run a ToolCallingAgent and return the result.

    Args:
        api_key: OpenRouter API key.
        model_id: Model identifier (e.g. openai/gpt-4o-mini).
        system_prompt: Custom system prompt for the agent.
        user_input: The user's input/question.
        container: Container name for tool execution.
        tool_names: List of tool names to load (None = all built-in).
        setup_script: Optional script to run in container before agent starts.
        max_steps: Maximum agent steps.
        on_event: Callback for streaming events: on_event(event_type, data).

    Returns:
        dict with keys: result, model, steps, error (if any).
    """

    def emit(event_type: str, data: dict):
        if on_event:
            on_event(event_type, data)

    emit("run.started", {"type": "smol-cloud", "model": model_id})

    # Extract and store env vars from system_prompt
    env_vars = _extract_env_vars(system_prompt)
    if env_vars and container:
        _container_env[container] = env_vars
        print(
            f"[engine] Injecting {len(env_vars)} env vars for {container}: "
            f"{list(env_vars.keys())}"
        )

    # Merge container env
    env = _container_env.get(container, {}) or None

    # Run setup script if needed
    setup_key = f"{container}:{hash(setup_script)}" if setup_script else ""
    if setup_script and container and setup_key not in _completed_setups:
        emit("agent.text", {"text": "_Preparando ambiente (instalando dependencias)..._\n\n"})
        print(f"[engine] Running setup in {container} ({len(setup_script)} chars)")
        try:
            output = cloud_exec(container, setup_script, env=env, timeout=180)
            print(f"[engine] Setup done: {output[:300]}")
            _completed_setups.add(setup_key)
            emit("agent.text", {"text": "_Ambiente pronto!_\n\n"})
        except Exception as e:
            print(f"[engine] Setup error: {e}")
            emit("agent.text", {"text": f"_Aviso: setup parcial ({e})_\n\n"})

    try:
        # Create model via OpenRouter
        model = OpenAIServerModel(
            model_id=model_id,
            api_key=api_key,
            api_base="https://openrouter.ai/api/v1",
        )

        # Resolve tools
        tools = resolve_tools(container, tool_names, env)

        # Create agent
        agent = ToolCallingAgent(tools=tools, model=model, max_steps=max_steps)

        # Set custom system prompt
        if system_prompt:
            agent.prompt_templates["system_prompt"] = (
                system_prompt
                + "\n\nIMPORTANT RULES:"
                "\n- ALWAYS respond in Portuguese (Brazilian Portuguese)."
                "\n- After getting tool results, provide your final answer immediately."
                "\n- Do NOT repeat tool calls. Use final_answer tool to respond."
                "\n- NEVER respond in Chinese, Japanese, or any language other than Portuguese."
            )

        # Monkey-patch execute_tool_call to stream tool events
        original_execute = agent.execute_tool_call

        def patched_execute(tool_name, arguments):
            emit("agent.tool_use", {"tool": tool_name, "input": arguments})
            result = original_execute(tool_name, arguments)
            emit("agent.tool_result", {"tool": tool_name, "output": str(result)[:500]})
            return result

        agent.execute_tool_call = patched_execute

        # Run the agent
        result = agent.run(user_input)

        emit("agent.text", {"text": str(result)})
        emit(
            "run.completed",
            {"model": model_id, "steps": getattr(agent, "step_number", 0)},
        )

        return {
            "result": str(result),
            "model": model_id,
            "steps": getattr(agent, "step_number", 0),
        }

    except Exception as e:
        import traceback

        traceback.print_exc()
        emit("run.error", {"error": str(e)})
        return {"error": str(e), "model": model_id}
