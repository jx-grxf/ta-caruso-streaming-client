import dotenv from "dotenv";
import os from "node:os";
import path from "node:path";

dotenv.config();

function getRequiredNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number.`);
  }

  return parsed;
}

export const config = {
  host: process.env.HOST ?? "0.0.0.0",
  port: getRequiredNumber("PORT", 3847),
  dataDir: process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(process.cwd(), ".caruso-data"),
  publicBaseUrl: process.env.PUBLIC_BASE_URL?.trim() || detectPublicBaseUrl(),
  networkAddresses: detectExternalIPv4Addresses(),
  carusoFriendlyName: process.env.CARUSO_FRIENDLY_NAME?.trim() || undefined,
  deezerArl: process.env.DEEZER_ARL?.trim() || undefined
};

export function detectPublicBaseUrl(port = getRequiredNumber("PORT", 3847)): string {
  const [address] = detectExternalIPv4Addresses();
  return `http://${address || "127.0.0.1"}:${port}`;
}

function getAddressPriority(address: string): number {
  if (address.startsWith("192.168.")) {
    return 0;
  }

  if (address.startsWith("10.")) {
    return 1;
  }

  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(address)) {
    return 2;
  }

  if (address.startsWith("100.")) {
    return 4;
  }

  return 3;
}

export function detectExternalIPv4Addresses(): string[] {
  const addresses: string[] = [];

  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("169.254.")) {
        addresses.push(entry.address);
      }
    }
  }

  return [...new Set(addresses)].sort((left, right) => {
    const priorityDiff = getAddressPriority(left) - getAddressPriority(right);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return left.localeCompare(right);
  });
}

function isIpv4Address(hostname: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

export function resolveActivePublicBaseUrl(configuredUrl?: string, port = getRequiredNumber("PORT", 3847)): string {
  if (process.env.PUBLIC_BASE_URL?.trim()) {
    return process.env.PUBLIC_BASE_URL.trim();
  }

  if (!configuredUrl?.trim()) {
    return detectPublicBaseUrl(port);
  }

  try {
    const parsed = new URL(configuredUrl);
    if (!isIpv4Address(parsed.hostname)) {
      return parsed.toString().replace(/\/$/, "");
    }

    const currentAddresses = detectExternalIPv4Addresses();
    if (currentAddresses.includes(parsed.hostname)) {
      return parsed.toString().replace(/\/$/, "");
    }
  } catch {
    return detectPublicBaseUrl(port);
  }

  return detectPublicBaseUrl(port);
}
