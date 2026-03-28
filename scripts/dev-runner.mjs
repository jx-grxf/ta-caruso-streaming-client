import net from "node:net";
import os from "node:os";
import { spawn } from "node:child_process";

function parsePort(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isPortAvailable(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, host);
  });
}

async function findAvailablePort(startPort, host, attempts = 20) {
  for (let offset = 0; offset < attempts; offset += 1) {
    const port = startPort + offset;
    if (await isPortAvailable(port, host)) {
      return port;
    }
  }

  throw new Error(`No free port found between ${startPort} and ${startPort + attempts - 1}.`);
}

function detectExternalAddress() {
  const addresses = [];

  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("169.254.")) {
        addresses.push(entry.address);
      }
    }
  }

  return addresses.sort((left, right) => left.localeCompare(right))[0] || "127.0.0.1";
}

const requestedPort = parsePort(process.env.PORT, 3847);
const host = process.env.HOST || "0.0.0.0";
const selectedPort = await findAvailablePort(requestedPort, host);
const publicBaseUrl = `http://${detectExternalAddress()}:${selectedPort}`;

if (selectedPort !== requestedPort) {
  console.log("");
  console.log(`[dev] Port ${requestedPort} is busy, switching to ${selectedPort}.`);
  console.log(`[dev] Local UI: http://127.0.0.1:${selectedPort}`);
  console.log("");
}

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["tsx", "watch", "src/index.ts"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: String(selectedPort),
      PUBLIC_BASE_URL: publicBaseUrl
    }
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
