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

function detectPublicBaseUrl(): string {
  for (const address of detectExternalIPv4Addresses()) {
    return `http://${address}:${getRequiredNumber("PORT", 3847)}`;
  }

  return `http://127.0.0.1:${getRequiredNumber("PORT", 3847)}`;
}

function detectExternalIPv4Addresses(): string[] {
  const addresses: string[] = [];

  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }

  return [...new Set(addresses)];
}
