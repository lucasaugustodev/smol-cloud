import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import ChatMessage from "../components/ChatMessage";
import ToolCall from "../components/ToolCall";

interface Agent {
  slug: string;
  name: string;
  model: string;
}

interface Message {
  id: string;
  role: "user" | "agent";
  text: string;
}

interface Tool {
  id: string;
  name: string;
  input: string;
  output?: string;
  done: boolean;
}

let msgId = 0;
const nextId = () => String(++msgId);

export default function Chat() {
  const { slug } = useParams<{ slug: string }>();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [tools, setTools] = useState<Map<string, Tool>>(new Map());
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/agents/${slug}`)
      .then((r) => r.json())
      .then(setAgent)
      .catch(() => {});
  }, [slug]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, tools]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || running) return;

    setInput("");
    setMessages((prev) => [...prev, { id: nextId(), role: "user", text }]);
    setRunning(true);

    let agentMsgId = "";

    try {
      const res = await fetch(`/api/agents/${slug}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: text }),
      });

      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw || raw === "[DONE]") continue;

          let event: { type: string; text?: string; tool_use_id?: string; name?: string; input?: string; output?: string };
          try {
            event = JSON.parse(raw);
          } catch {
            continue;
          }

          switch (event.type) {
            case "agent.text":
              if (!agentMsgId) {
                agentMsgId = nextId();
                setMessages((prev) => [
                  ...prev,
                  { id: agentMsgId, role: "agent", text: event.text ?? "" },
                ]);
              } else {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === agentMsgId
                      ? { ...m, text: m.text + (event.text ?? "") }
                      : m,
                  ),
                );
              }
              break;

            case "agent.tool_use": {
              const tid = event.tool_use_id ?? nextId();
              setTools((prev) => {
                const next = new Map(prev);
                next.set(tid, {
                  id: tid,
                  name: event.name ?? "tool",
                  input: event.input ?? "",
                  done: false,
                });
                return next;
              });
              break;
            }

            case "agent.tool_result": {
              const tid = event.tool_use_id ?? "";
              setTools((prev) => {
                const next = new Map(prev);
                const existing = next.get(tid);
                if (existing) {
                  next.set(tid, {
                    ...existing,
                    output: event.output ?? event.text ?? "",
                    done: true,
                  });
                }
                return next;
              });
              break;
            }

            case "run.completed":
            case "run.error":
              setRunning(false);
              break;
          }
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "agent", text: "Connection error. Please try again." },
      ]);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-gray-950">
      {/* Header */}
      <header className="flex items-center gap-4 border-b border-gray-800 px-6 py-4">
        <Link to="/agents" className="text-gray-400 hover:text-white transition">
          &larr;
        </Link>
        <div>
          <h1 className="font-semibold">{agent?.name ?? slug}</h1>
          {agent?.model && (
            <p className="text-xs text-gray-500">{agent.model}</p>
          )}
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {messages.map((m) => (
          <ChatMessage key={m.id} role={m.role} text={m.text} />
        ))}
        {Array.from(tools.values()).map((t) => (
          <ToolCall
            key={t.id}
            name={t.name}
            input={t.input}
            output={t.output}
            done={t.done}
          />
        ))}
        {running && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            Thinking...
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      {/* Input */}
      <form
        onSubmit={send}
        className="flex items-center gap-3 border-t border-gray-800 px-6 py-4"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={running}
          placeholder="Type a message..."
          className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-blue-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={running || !input.trim()}
          className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition"
        >
          Send
        </button>
      </form>
    </div>
  );
}
