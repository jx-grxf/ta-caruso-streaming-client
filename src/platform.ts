import os from "node:os";
import { spawn } from "node:child_process";

export type TargetPlatform = "mac" | "windows";

export function normalizeTargetPlatform(value?: string): TargetPlatform {
  return value === "windows" ? "windows" : "mac";
}

export function detectDefaultTargetPlatform(): TargetPlatform {
  return process.platform === "win32" ? "windows" : "mac";
}

export function getHostDisplayName(targetPlatform: TargetPlatform): string {
  const hostname = process.env.COMPUTERNAME || process.env.HOSTNAME || os.hostname();
  if (hostname) {
    return hostname;
  }

  return targetPlatform === "windows" ? "Windows-PC" : "MacBook";
}

export function openExternalUrl(url: string) {
  const options = {
    detached: true,
    stdio: "ignore" as const
  };

  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], {
      ...options,
      windowsHide: true
    }).unref();
    return;
  }

  if (process.platform === "darwin") {
    spawn("open", [url], options).unref();
    return;
  }

  spawn("xdg-open", [url], options).unref();
}
