import { useEffect, useState } from "react";
import AgentCard from "../components/AgentCard";

interface Agent {
  slug: string;
  name: string;
  model: string;
  category?: string;
}

export default function Home() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agents", { headers: { "x-api-key": "demo" } })
      .then((r) => r.json())
      .then((data) => setAgents(data))
      .catch(() => setAgents([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-bold">Agents</h1>
        <p className="mt-2 text-gray-400">
          Select an agent to start chatting
        </p>

        {loading ? (
          <div className="mt-12 flex justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : agents.length === 0 ? (
          <p className="mt-12 text-center text-gray-500">
            No agents found. Make sure the gateway is running.
          </p>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((a) => (
              <AgentCard
                key={a.slug}
                slug={a.slug}
                name={a.name}
                model={a.model}
                category={a.category}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
