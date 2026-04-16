import { Router, Request, Response, NextFunction } from "express";
import {
  createContainer,
  execInContainer,
  listContainers,
  stopContainer,
  removeContainer,
  getContainerStats,
  uploadFile,
  downloadFile,
  listFiles,
} from "./docker.js";

export const router = Router();

/** Extract container name from route params (Express v5 types). */
function paramName(req: Request): string {
  return req.params.name as string;
}

// Health endpoint (no auth)
router.get("/health", async (_req: Request, res: Response) => {
  try {
    const containers = await listContainers();
    res.json({ status: "ok", containers: containers.length });
  } catch (err) {
    res.json({ status: "ok", containers: 0 });
  }
});

// Auth middleware
function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.AIC_SECRET;
  if (!secret) {
    res.status(500).json({ error: "AIC_SECRET not configured" });
    return;
  }
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// Apply auth to all routes below
router.use(authMiddleware);

// Create container
router.post("/containers", async (req: Request, res: Response) => {
  try {
    const { name, cpu, memory } = req.body;
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const result = await createContainer(name, { cpu, memory });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// List containers
router.get("/containers", async (_req: Request, res: Response) => {
  try {
    const containers = await listContainers();
    res.json(containers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Exec command
router.post(
  "/containers/:name/exec",
  async (req: Request, res: Response) => {
    try {
      const { command, user, timeout } = req.body;
      if (!command) {
        res.status(400).json({ error: "command is required" });
        return;
      }
      const result = await execInContainer(
        paramName(req),
        command,
        user,
        timeout
      );
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Upload file
router.post(
  "/containers/:name/upload",
  async (req: Request, res: Response) => {
    try {
      const { path, content } = req.body;
      if (!path || content === undefined) {
        res.status(400).json({ error: "path and content are required" });
        return;
      }
      await uploadFile(paramName(req), path, content);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Download file
router.get(
  "/containers/:name/files/download",
  async (req: Request, res: Response) => {
    try {
      const path = req.query.path as string;
      if (!path) {
        res.status(400).json({ error: "path query param is required" });
        return;
      }
      const content = await downloadFile(paramName(req), path);
      res.json({ path, content });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// List files
router.get(
  "/containers/:name/files",
  async (req: Request, res: Response) => {
    try {
      const path = (req.query.path as string) || "/home/user";
      const output = await listFiles(paramName(req), path);
      res.json({ path, output });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Container stats
router.get(
  "/containers/:name/stats",
  async (req: Request, res: Response) => {
    try {
      const stats = await getContainerStats(paramName(req));
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Stop container
router.post(
  "/containers/:name/stop",
  async (req: Request, res: Response) => {
    try {
      await stopContainer(paramName(req));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Remove container
router.delete(
  "/containers/:name",
  async (req: Request, res: Response) => {
    try {
      await removeContainer(paramName(req));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);
