"""Engine service — FastAPI server for running smolagents in cloud containers."""

import asyncio
import json
import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse

from agent_runner import run_agent
from tool_loader import init_builtin_config

CLOUD_URL = os.environ.get("CLOUD_API_URL", "http://127.0.0.1:9090")
CLOUD_SECRET = os.environ.get("CLOUD_API_SECRET", "agentify-cloud-secret-2026")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize built-in tool config on startup."""
    init_builtin_config(CLOUD_URL, CLOUD_SECRET)
    print(f"[engine] Started — cloud={CLOUD_URL}")
    yield


app = FastAPI(title="smol-cloud engine", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "engine"}


@app.post("/run")
async def run_sse(request: Request):
    """SSE streaming endpoint — runs agent and streams events."""
    body = await request.json()

    api_key = body.get("api_key", "")
    model_id = body.get("model", "openai/gpt-4o-mini")
    system_prompt = body.get("system_prompt", "You are a helpful assistant.")
    user_input = body.get("input", "")
    container = body.get("container", "")
    tool_names = body.get("tools")
    setup_script = body.get("setup_script", "")
    max_steps = body.get("max_steps", 50)

    if not api_key or not user_input or not container:
        return JSONResponse(
            status_code=400,
            content={"error": "api_key, input, and container are required"},
        )

    queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_event_loop()

    def on_event(event_type: str, data: dict):
        loop.call_soon_threadsafe(queue.put_nowait, (event_type, data))

    async def event_generator():
        # Run agent in thread to avoid blocking the event loop
        future = loop.run_in_executor(
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

        done = False
        while not done:
            try:
                event_type, data = await asyncio.wait_for(queue.get(), timeout=0.5)
                yield {"event": event_type, "data": json.dumps(data)}
                if event_type in ("run.completed", "run.error"):
                    done = True
            except asyncio.TimeoutError:
                # Check if the future is done (agent crashed without emitting events)
                if future.done():
                    exc = future.exception()
                    if exc:
                        yield {
                            "event": "run.error",
                            "data": json.dumps({"error": str(exc)}),
                        }
                    done = True

    return EventSourceResponse(event_generator())


@app.post("/run/sync")
async def run_sync(request: Request):
    """Synchronous endpoint — runs agent and returns JSON result."""
    body = await request.json()

    api_key = body.get("api_key", "")
    model_id = body.get("model", "openai/gpt-4o-mini")
    system_prompt = body.get("system_prompt", "You are a helpful assistant.")
    user_input = body.get("input", "")
    container = body.get("container", "")
    tool_names = body.get("tools")
    setup_script = body.get("setup_script", "")
    max_steps = body.get("max_steps", 50)

    if not api_key or not user_input or not container:
        return JSONResponse(
            status_code=400,
            content={"error": "api_key, input, and container are required"},
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

    if "error" in result:
        return JSONResponse(status_code=500, content=result)
    return result
