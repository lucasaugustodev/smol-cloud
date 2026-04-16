/**
 * AICClient — wraps all Gateway API calls for the CLI.
 */

export interface Agent {
  id: string;
  slug: string;
  name: string;
  model: string;
  system_prompt: string;
  tools: string[];
  setup_script: string;
  max_steps: number;
  category: string;
  icon: string;
  is_template: boolean;
  created_at: string;
}

export interface ApiKey {
  id: string;
  key_prefix: string;
  name: string;
  created_at: string;
}

export interface ApiKeyCreateResult extends ApiKey {
  raw_key: string;
}

export interface Run {
  id: string;
  agent_id: string;
  api_key_id: string | null;
  input: string;
  output: string;
  model: string;
  steps: number;
  status: "running" | "succeeded" | "failed";
  started_at: string;
  finished_at: string | null;
  tokens_in: number;
  tokens_out: number;
  cost: number;
}

export interface HealthResponse {
  status: string;
  version?: string;
  services?: Record<string, { status: string }>;
}

export interface SSEEvent {
  event: string;
  data: string;
}

export class AICClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(
    baseUrl?: string,
    apiKey?: string,
  ) {
    this.baseUrl = (baseUrl || process.env.AIC_URL || "http://localhost:4000").replace(/\/+$/, "");
    this.apiKey = apiKey || process.env.AIC_API_KEY || "";
  }

  private async request<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(this.apiKey ? { "x-api-key": this.apiKey } : {}),
      ...(opts?.headers as Record<string, string> || {}),
    };

    const res = await fetch(url, {
      ...opts,
      headers,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      let message: string;
      try {
        const json = JSON.parse(body);
        message = json.error || json.message || body;
      } catch {
        message = body || `HTTP ${res.status}`;
      }
      throw new Error(`API Error (${res.status}): ${message}`);
    }

    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  // ── Agents ──────────────────────────────────────────

  async listAgents(): Promise<Agent[]> {
    return this.request<Agent[]>("/api/agents");
  }

  async getAgent(idOrSlug: string): Promise<Agent> {
    return this.request<Agent>(`/api/agents/${encodeURIComponent(idOrSlug)}`);
  }

  async createAgent(data: Partial<Agent>): Promise<Agent> {
    return this.request<Agent>("/api/agents", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateAgent(idOrSlug: string, data: Partial<Agent>): Promise<Agent> {
    return this.request<Agent>(`/api/agents/${encodeURIComponent(idOrSlug)}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteAgent(idOrSlug: string): Promise<void> {
    await this.request(`/api/agents/${encodeURIComponent(idOrSlug)}`, {
      method: "DELETE",
    });
  }

  // ── Agent Runs ──────────────────────────────────────

  async runAgent(
    idOrSlug: string,
    input: string,
    onEvent: (event: SSEEvent) => void,
  ): Promise<void> {
    const url = `${this.baseUrl}/api/agents/${encodeURIComponent(idOrSlug)}/run`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...(this.apiKey ? { "x-api-key": this.apiKey } : {}),
      },
      body: JSON.stringify({ input }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`API Error (${res.status}): ${body || "Run failed"}`);
    }

    if (!res.body) {
      throw new Error("No response body for SSE stream");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      let currentEvent = "message";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          const data = line.slice(6);
          onEvent({ event: currentEvent, data });
          currentEvent = "message";
        }
      }
    }
  }

  async runAgentSync(idOrSlug: string, input: string): Promise<Run> {
    return this.request<Run>(`/api/agents/${encodeURIComponent(idOrSlug)}/run`, {
      method: "POST",
      body: JSON.stringify({ input, stream: false }),
    });
  }

  // ── API Keys ────────────────────────────────────────

  async listKeys(): Promise<ApiKey[]> {
    return this.request<ApiKey[]>("/api/keys");
  }

  async createKey(name?: string): Promise<ApiKeyCreateResult> {
    return this.request<ApiKeyCreateResult>("/api/keys", {
      method: "POST",
      body: JSON.stringify({ name: name || "" }),
    });
  }

  async revokeKey(id: string): Promise<void> {
    await this.request(`/api/keys/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  // ── Health ──────────────────────────────────────────

  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>("/health");
  }

  // ── Runs ────────────────────────────────────────────

  async listRuns(agentId?: string): Promise<Run[]> {
    const query = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : "";
    return this.request<Run[]>(`/api/runs${query}`);
  }

  async getRun(id: string): Promise<Run> {
    return this.request<Run>(`/api/runs/${encodeURIComponent(id)}`);
  }
}
