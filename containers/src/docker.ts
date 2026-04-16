import Docker from "dockerode";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

const PREFIX = "aic-";

interface CreateContainerOpts {
  cpu?: number;
  memory?: number;
}

interface ExecResult {
  output: string;
  exit_code: number;
}

/**
 * Demultiplex Docker stream (header-prefixed frames).
 * Each frame: [type(1) + padding(3) + size(4)] + payload
 */
function demuxStream(buffer: Buffer): string {
  let offset = 0;
  let output = "";
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) break;
    const size = buffer.readUInt32BE(offset + 4);
    if (offset + 8 + size > buffer.length) break;
    output += buffer.subarray(offset + 8, offset + 8 + size).toString("utf-8");
    offset += 8 + size;
  }
  return output;
}

export async function createContainer(
  name: string,
  opts: CreateContainerOpts = {}
): Promise<{ id: string; name: string }> {
  const containerName = `${PREFIX}${name}`;

  const createOpts: Docker.ContainerCreateOptions = {
    Image: "ubuntu:24.04",
    name: containerName,
    Cmd: ["sleep", "infinity"],
    HostConfig: {
      ...(opts.cpu ? { NanoCpus: opts.cpu * 1e9 } : {}),
      ...(opts.memory ? { Memory: opts.memory * 1024 * 1024 } : {}),
    },
  };

  const container = await docker.createContainer(createOpts);
  await container.start();

  return { id: container.id, name: containerName };
}

export async function execInContainer(
  name: string,
  command: string,
  user: string = "root",
  timeout: number = 30
): Promise<ExecResult> {
  const container = docker.getContainer(`${PREFIX}${name}`);

  const exec = await container.exec({
    Cmd: ["bash", "-c", command],
    AttachStdout: true,
    AttachStderr: true,
    User: user,
  });

  const stream = await exec.start({ hijack: true, stdin: false });

  return new Promise<ExecResult>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      stream.destroy();
      resolve({ output: "Command timed out", exit_code: 124 });
    }, timeout * 1000);

    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", async () => {
      clearTimeout(timer);
      const raw = Buffer.concat(chunks);
      const output = demuxStream(raw);
      try {
        const inspect = await exec.inspect();
        resolve({ output, exit_code: inspect.ExitCode ?? -1 });
      } catch {
        resolve({ output, exit_code: -1 });
      }
    });
    stream.on("error", (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export async function listContainers(): Promise<
  Array<{ id: string; name: string; state: string; status: string }>
> {
  const containers = await docker.listContainers({
    all: true,
    filters: { name: [PREFIX] },
  });

  return containers
    .filter((c) => c.Names.some((n) => n.startsWith(`/${PREFIX}`)))
    .map((c) => ({
      id: c.Id,
      name: c.Names[0].replace("/", ""),
      state: c.State,
      status: c.Status,
    }));
}

export async function stopContainer(name: string): Promise<void> {
  const container = docker.getContainer(`${PREFIX}${name}`);
  await container.stop();
}

export async function removeContainer(name: string): Promise<void> {
  const container = docker.getContainer(`${PREFIX}${name}`);
  await container.remove({ force: true });
}

export async function getContainerStats(
  name: string
): Promise<{ cpu_percent: number; memory_mb: number }> {
  const container = docker.getContainer(`${PREFIX}${name}`);
  const stats = (await container.stats({ stream: false })) as any;

  const cpuDelta =
    stats.cpu_stats.cpu_usage.total_usage -
    stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta =
    stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const numCpus = stats.cpu_stats.online_cpus || 1;
  const cpuPercent =
    systemDelta > 0 ? (cpuDelta / systemDelta) * numCpus * 100 : 0;

  const memoryMb = stats.memory_stats.usage / (1024 * 1024);

  return {
    cpu_percent: Math.round(cpuPercent * 100) / 100,
    memory_mb: Math.round(memoryMb * 100) / 100,
  };
}

export async function uploadFile(
  name: string,
  path: string,
  content: string
): Promise<void> {
  const escaped = content.replace(/\\/g, "\\\\").replace(/'/g, "'\\''");
  const dir = path.substring(0, path.lastIndexOf("/"));
  const command = `mkdir -p '${dir}' && cat > '${path}' << 'AICEOF'\n${content}\nAICEOF`;
  const result = await execInContainer(name, command);
  if (result.exit_code !== 0) {
    throw new Error(`Failed to upload file: ${result.output}`);
  }
}

export async function downloadFile(
  name: string,
  path: string
): Promise<string> {
  const result = await execInContainer(name, `cat '${path}'`);
  if (result.exit_code !== 0) {
    throw new Error(`Failed to download file: ${result.output}`);
  }
  return result.output;
}

export async function listFiles(
  name: string,
  path: string
): Promise<string> {
  const result = await execInContainer(name, `ls -la '${path}'`);
  if (result.exit_code !== 0) {
    throw new Error(`Failed to list files: ${result.output}`);
  }
  return result.output;
}
