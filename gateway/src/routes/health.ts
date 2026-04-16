import { Router } from "express";

const ENGINE_URL = process.env.ENGINE_URL || "http://engine:8200";
const CONTAINERS_URL = process.env.CONTAINERS_URL || "http://containers:9090";

export const healthRouter = Router();

async function checkService(url: string): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.ok ? "ok" : "unhealthy";
  } catch {
    return "unreachable";
  }
}

healthRouter.get("/", async (_req, res) => {
  const [engine, containers] = await Promise.all([
    checkService(`${ENGINE_URL}/health`),
    checkService(`${CONTAINERS_URL}/health`),
  ]);

  const allOk = engine === "ok" && containers === "ok";
  res.status(allOk ? 200 : 207).json({
    status: allOk ? "ok" : "degraded",
    services: {
      gateway: "ok",
      engine,
      containers,
    },
  });
});
