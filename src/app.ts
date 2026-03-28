import fsSync from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config as baseConfig, resolveActivePublicBaseUrl } from "./config.js";
import { createRangedReadStream, getMimeType, isPathAllowed, scanLocalTracks } from "./local-library.js";
import { getDeezerCapabilities } from "./providers/deezer.js";
import { searchRadioBrowserStations } from "./providers/radio-browser.js";
import { browseDirectory, inspectStream, resolvePlayableUrl, searchStations } from "./providers/tunein.js";
import { AppStorage, type PersistedConfig, type TuneInFavorite } from "./storage.js";
import { fetchDeviceDescription } from "./upnp/device-description.js";
import { discoverUpnpDevices } from "./upnp/discovery.js";
import {
  buildConnectionManagerResponse,
  buildContentDirectoryCapabilitiesResponse,
  buildContentDirectoryBrowseResponse,
  buildContentDirectorySystemUpdateIdResponse,
  createMediaServerUuid,
  getConnectionManagerScpdXml,
  getContentDirectoryScpdXml,
  getDeviceDescriptionXml,
  parseSoapAction
} from "./upnp/media-server.js";
import { getRendererStatus, play, setAvTransportUri } from "./upnp/renderer-control.js";
import { readSoapAction } from "./upnp/soap.js";

export type AppContext = {
  startedAt: string;
  dataDir: string;
  storage: AppStorage;
  upnp: {
    serverUuid: string;
    friendlyName: string;
  };
};

let previousCpuSnapshot = takeCpuSnapshot();

class HttpError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function takeCpuSnapshot() {
  const totals = os.cpus().reduce((accumulator, cpu) => {
    const times = cpu.times;
    const idle = accumulator.idle + times.idle;
    const total = accumulator.total + times.user + times.nice + times.sys + times.irq + times.idle;
    return { idle, total };
  }, { idle: 0, total: 0 });

  return {
    idle: totals.idle,
    total: totals.total
  };
}

function getCpuUsagePercent(): number {
  const current = takeCpuSnapshot();
  const idleDelta = current.idle - previousCpuSnapshot.idle;
  const totalDelta = current.total - previousCpuSnapshot.total;
  previousCpuSnapshot = current;

  if (totalDelta <= 0) {
    return 0;
  }

  return Number((((totalDelta - idleDelta) / totalDelta) * 100).toFixed(1));
}

function formatBytes(value: number): string {
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getUiRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const distRelative = path.resolve(currentDir, "../ui");
  if (fsSync.existsSync(distRelative)) {
    return distRelative;
  }

  return path.resolve(currentDir, "../../ui");
}

function mergeConfig(runtimeConfig: PersistedConfig): PersistedConfig {
  return {
    publicBaseUrl: resolveActivePublicBaseUrl(runtimeConfig.publicBaseUrl, baseConfig.port),
    carusoFriendlyName: runtimeConfig.carusoFriendlyName || baseConfig.carusoFriendlyName,
    deezerArl: runtimeConfig.deezerArl || baseConfig.deezerArl,
    uiLanguage: runtimeConfig.uiLanguage || "de"
  };
}

function buildServerFriendlyName(configuredName?: string): string {
  return `${configuredName || "Caruso"} auf ${process.env.HOSTNAME || "MacBook"}`;
}

function normalizeFavoriteId(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

function inferQualityLabel(input: {
  bitrate?: number;
  mimeType?: string;
  currentUri?: string;
  currentTrackUri?: string;
}): string {
  if (input.bitrate) {
    return `${input.bitrate} kbps`;
  }

  const uri = input.currentTrackUri || input.currentUri || "";
  if (uri.includes("ffhchannels")) {
    return "128 kbps MP3";
  }

  if (input.mimeType?.includes("flac") || uri.endsWith(".flac")) {
    return "FLAC";
  }

  if (input.mimeType?.includes("mpeg") || uri.endsWith(".mp3")) {
    return "MP3 stream";
  }

  return "Unknown";
}

function normalizeUriForCompare(value?: string): string {
  if (!value) {
    return "";
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function buildAudioMetadata(title: string, url: string, mimeType = "audio/mpeg"): string {
  const escapedTitle = title
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  const escapedUrl = url
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  return `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"><item id="0" parentID="-1" restricted="1"><dc:title>${escapedTitle}</dc:title><upnp:class>object.item.audioItem.musicTrack</upnp:class><res protocolInfo="http-get:*:${mimeType}:*">${escapedUrl}</res></item></DIDL-Lite>`;
}

function dlnaContentFeaturesForMimeType(mimeType: string): string {
  if (mimeType === "audio/mpeg") {
    return "DLNA.ORG_PN=MP3;DLNA.ORG_OP=01;DLNA.ORG_FLAGS=01700000000000000000000000000000";
  }

  if (mimeType === "audio/aac") {
    return "DLNA.ORG_OP=01;DLNA.ORG_FLAGS=01700000000000000000000000000000";
  }

  return "DLNA.ORG_OP=01;DLNA.ORG_FLAGS=01700000000000000000000000000000";
}

function isSupportedStreamMimeType(mimeType: string): boolean {
  return ["audio/mpeg", "audio/aac", "audio/flac"].includes(mimeType);
}

function applyStreamHeaders(reply: FastifyReply, mimeType: string) {
  reply.header("content-type", mimeType);
  reply.header("cache-control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  reply.header("pragma", "no-cache");
  reply.header("expires", "0");
  reply.header("transferMode.dlna.org", "Streaming");
  reply.header("contentFeatures.dlna.org", dlnaContentFeaturesForMimeType(mimeType));
  reply.header("accept-ranges", "none");
  reply.header("icy-metadata", "0");
}

function resolveRequestBaseUrl(hostHeader: string | undefined, fallbackBaseUrl: string): string {
  if (!hostHeader) {
    return fallbackBaseUrl;
  }

  const normalizedHost = hostHeader.startsWith("http://") || hostHeader.startsWith("https://")
    ? hostHeader
    : `http://${hostHeader}`;

  try {
    return new URL(normalizedHost).origin;
  } catch {
    return fallbackBaseUrl;
  }
}

function isPrivateHostname(hostname: string): boolean {
  if (hostname === "localhost") {
    return true;
  }

  const normalizedHostname = hostname.replace(/^\[|\]$/g, "");
  const ipVersion = net.isIP(normalizedHostname);

  if (ipVersion === 4) {
    const [a, b] = hostname.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  if (ipVersion === 6) {
    const compact = normalizedHostname.toLowerCase();
    return (
      compact === "::1" ||
      compact.startsWith("fe8") ||
      compact.startsWith("fe9") ||
      compact.startsWith("fea") ||
      compact.startsWith("feb") ||
      compact.startsWith("fc") ||
      compact.startsWith("fd")
    );
  }

  return normalizedHostname.endsWith(".local");
}

function parseAndValidateUrl(rawValue: string, options?: {
  allowedHosts?: string[];
  allowPrivateHosts?: boolean;
  allowHostnames?: boolean;
}): URL {
  let parsed: URL;

  try {
    parsed = new URL(rawValue);
  } catch {
    throw new HttpError("Invalid URL.", 400);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new HttpError("Only http and https URLs are supported.", 400);
  }

  if (options?.allowedHosts && !options.allowedHosts.includes(parsed.hostname)) {
    throw new HttpError("URL host is not allowed.", 400);
  }

  if (!options?.allowPrivateHosts && isPrivateHostname(parsed.hostname)) {
    throw new HttpError("Private or local network URLs are not allowed here.", 400);
  }

  if (options?.allowHostnames === false && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(parsed.hostname)) {
    throw new HttpError("Renderer URL must use an IPv4 address.", 400);
  }

  return parsed;
}

async function assertKnownRendererUrl(deviceDescriptionUrl: string) {
  const discoveredDevices = await discoverUpnpDevices();
  const isKnownDevice = discoveredDevices.some((device) => device.location === deviceDescriptionUrl);

  if (!isKnownDevice) {
    throw new HttpError("Unknown or unauthorized deviceDescriptionUrl.", 400);
  }
}

export async function createApp(dataDir: string) {
  const storage = new AppStorage(dataDir);
  const serverUuid = createMediaServerUuid(dataDir);
  const initialConfig = mergeConfig(await storage.getConfig());
  const rendererSessions = new Map<string, { title: string; quality: string; sourceType: string }>();
  const app = Fastify({
    logger: {
      transport: {
        target: "pino-pretty",
        options: {
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname"
        }
      }
    }
  });

  app.addContentTypeParser(["text/xml", "application/xml", "application/soap+xml"], { parseAs: "string" }, (_request, body, done) => {
    done(null, body);
  });

  const context: AppContext = {
    startedAt: new Date().toISOString(),
    dataDir,
    storage,
    upnp: {
      serverUuid,
      friendlyName: buildServerFriendlyName(initialConfig.carusoFriendlyName)
    }
  };

  await app.register(fastifyStatic, {
    root: getUiRoot(),
    prefix: "/",
    maxAge: 0,
    immutable: false,
    etag: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html") || filePath.endsWith(".js") || filePath.endsWith(".css")) {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      }
    }
  });

  app.get("/health", async () => {
    const runtimeConfig = mergeConfig(await storage.getConfig());
    return {
      ok: true,
      upnp: context.upnp,
      deezer: getDeezerCapabilities(runtimeConfig.deezerArl)
    };
  });

  app.get("/api/status", async () => {
    const runtimeConfig = mergeConfig(await storage.getConfig());
    const folders = await storage.getLibraryFolders();
    const tracks = await scanLocalTracks(folders, runtimeConfig.publicBaseUrl || baseConfig.publicBaseUrl);
    const favorites = await storage.getTuneInFavorites();
    const memoryUsage = process.memoryUsage();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();

    return {
      server: {
        running: true,
        startedAt: context.startedAt,
        publicBaseUrl: runtimeConfig.publicBaseUrl || baseConfig.publicBaseUrl,
        dataDir,
        metrics: {
          cpuUsagePercent: getCpuUsagePercent(),
          processMemoryRss: formatBytes(memoryUsage.rss),
          processHeapUsed: formatBytes(memoryUsage.heapUsed),
          systemMemoryUsed: formatBytes(totalMemory - freeMemory),
          systemMemoryTotal: formatBytes(totalMemory),
          uptimeSeconds: Math.floor(process.uptime()),
          loadAverage1m: Number(os.loadavg()[0].toFixed(2)),
          platform: `${os.type()} ${os.release()}`,
          hostname: os.hostname(),
          cpuCores: os.cpus().length
        }
      },
      upnp: {
        enabled: true,
        friendlyName: context.upnp.friendlyName,
        deviceDescriptionUrl: new URL("/upnp/device-description.xml", runtimeConfig.publicBaseUrl || baseConfig.publicBaseUrl).toString()
      },
      config: runtimeConfig,
      library: {
        folders,
        trackCount: tracks.length
      },
      tunein: {
        favorites
      },
      deezer: getDeezerCapabilities(runtimeConfig.deezerArl)
    };
  });

  app.get("/api/config", async () => {
    const runtimeConfig = mergeConfig(await storage.getConfig());
    return runtimeConfig;
  });

  app.put("/api/config", async (request) => {
    const body = request.body as PersistedConfig;
    const nextConfig = await storage.updateConfig({
      publicBaseUrl: body.publicBaseUrl?.trim() || undefined,
      carusoFriendlyName: body.carusoFriendlyName?.trim() || undefined,
      deezerArl: body.deezerArl?.trim() || undefined,
      uiLanguage: body.uiLanguage === "en" ? "en" : "de"
    });

    const mergedConfig = mergeConfig(nextConfig);
    context.upnp.friendlyName = buildServerFriendlyName(mergedConfig.carusoFriendlyName);

    return mergedConfig;
  });

  app.get("/api/discover", async () => {
    const runtimeConfig = mergeConfig(await storage.getConfig());
    const devices = await discoverUpnpDevices();
    const descriptions: Array<{
      address: string;
      usn?: string;
      st?: string;
      location?: string;
      server?: string;
      description?: Awaited<ReturnType<typeof fetchDeviceDescription>>;
    }> = await Promise.all(
      devices
        .filter((device) => device.location)
        .map(async (device) => {
          try {
            const description = await fetchDeviceDescription(device.location!);
            return { ...device, description };
          } catch (error) {
            app.log.warn({ error, device }, "Could not fetch device description");
            return device;
          }
        })
    );

    const filtered = runtimeConfig.carusoFriendlyName
      ? descriptions.filter((item) => item.description?.friendlyName?.includes(runtimeConfig.carusoFriendlyName!))
      : descriptions;

    const deduped = new Map<string, typeof filtered[number]>();
    for (const item of filtered) {
      const key = item.location || item.description?.friendlyName || `${item.address}-${item.st}`;
      if (!deduped.has(key)) {
        deduped.set(key, item);
      }
    }

    return {
      devices: [...deduped.values()].filter((item) =>
        item.description?.services?.some((service) => service.serviceType.includes("AVTransport"))
      )
    };
  });

  app.get("/api/tunein/search", async (request) => {
    const query = (request.query as { q?: string }).q?.trim();
    if (!query) {
      return { items: [] };
    }

    const [tuneInItems, radioBrowserItems] = await Promise.allSettled([
      searchStations(query),
      searchRadioBrowserStations(query)
    ]);

    const merged = [
      ...(tuneInItems.status === "fulfilled" ? tuneInItems.value : []),
      ...(radioBrowserItems.status === "fulfilled" ? radioBrowserItems.value : [])
    ];

    const deduped = new Map<string, typeof merged[number]>();
    for (const item of merged) {
      const key = `${item.text.trim().toLowerCase()}::${item.actions?.play || ""}`;
      if (!deduped.has(key)) {
        deduped.set(key, item);
      }
    }

    return {
      items: [...deduped.values()].sort((left, right) => (right.bitrate || 0) - (left.bitrate || 0))
    };
  });

  app.get("/api/tunein/browse", async (request) => {
    const browseUrl = (request.query as { url?: string }).url || "https://opml.radiotime.com/Browse.ashx?render=xml";
    const validatedUrl = parseAndValidateUrl(browseUrl, {
      allowedHosts: ["opml.radiotime.com"]
    });
    return {
      items: await browseDirectory(validatedUrl.toString())
    };
  });

  app.get("/api/tunein/favorites", async () => ({
    items: await storage.getTuneInFavorites()
  }));

  app.post("/api/tunein/favorites", async (request) => {
    const body = request.body as Partial<TuneInFavorite> & { title?: string; streamUrl?: string; id?: string };

    if (!body.title?.trim() || !body.streamUrl?.trim()) {
      throw new HttpError("title and streamUrl are required.", 400);
    }

    parseAndValidateUrl(body.streamUrl.trim());

    const inspected = await inspectStream(body.streamUrl.trim());
    if (!isSupportedStreamMimeType(inspected.mimeType)) {
      throw new HttpError(`Unsupported stream format for Caruso: ${inspected.mimeType}`, 400);
    }

    return {
      items: await storage.addTuneInFavorite({
        id: body.id?.trim() || normalizeFavoriteId(body.title),
        title: body.title.trim(),
        streamUrl: inspected.resolvedUrl,
        subtitle: body.subtitle?.trim(),
        image: body.image?.trim(),
        mimeType: inspected.mimeType || body.mimeType?.trim(),
        bitrate: body.bitrate
      })
    };
  });

  app.delete("/api/tunein/favorites/:id", async (request) => {
    const id = (request.params as { id: string }).id;
    const title = (request.query as { title?: string }).title;
    return {
      items: await storage.removeTuneInFavorite(title?.trim() || id)
    };
  });

  app.get("/api/renderer/status", async (request) => {
    const deviceDescriptionUrl = (request.query as { deviceDescriptionUrl?: string }).deviceDescriptionUrl;
    if (!deviceDescriptionUrl) {
      throw new HttpError("deviceDescriptionUrl is required.", 400);
    }

    const validatedDeviceDescriptionUrl = parseAndValidateUrl(deviceDescriptionUrl, {
      allowPrivateHosts: true
    });
    await assertKnownRendererUrl(validatedDeviceDescriptionUrl.toString());

    const status = await getRendererStatus(validatedDeviceDescriptionUrl.toString());
    const activeUris = [status.currentTrackUri, status.currentUri].map(normalizeUriForCompare);
    const matchedSessionEntry = [...rendererSessions.entries()]
      .find(([uri]) => activeUris.includes(normalizeUriForCompare(uri)));
    const matchedSession = matchedSessionEntry?.[1];
    const favorite = (await storage.getTuneInFavorites()).find((item) =>
      status.currentUri?.includes(`/stream/tunein-favorite/${item.id}`) ||
      status.currentTrackUri?.includes(`/stream/tunein-favorite/${item.id}`) ||
      status.currentUri?.includes(item.streamUrl) ||
      status.currentTrackUri?.includes(item.streamUrl)
    );

    return {
      status: {
        ...status,
        title: matchedSession?.title || favorite?.title || "Unknown",
        quality: matchedSession?.quality || inferQualityLabel({
          bitrate: favorite?.bitrate,
          mimeType: favorite?.mimeType,
          currentUri: status.currentUri,
          currentTrackUri: status.currentTrackUri
        })
      }
    };
  });

  app.get("/upnp/device-description.xml", async (request, reply) => {
    const runtimeConfig = mergeConfig(await storage.getConfig());
    const baseUrl = resolveRequestBaseUrl(request.headers.host, runtimeConfig.publicBaseUrl || baseConfig.publicBaseUrl);
    reply.type("application/xml");
    return getDeviceDescriptionXml({
      baseUrl,
      serverUuid: context.upnp.serverUuid,
      friendlyName: context.upnp.friendlyName
    });
  });

  app.get("/upnp/content-directory.xml", async (_request, reply) => {
    reply.type("application/xml");
    return getContentDirectoryScpdXml();
  });

  app.get("/upnp/connection-manager.xml", async (_request, reply) => {
    reply.type("application/xml");
    return getConnectionManagerScpdXml();
  });

  app.post("/upnp/control/content-directory", async (request, reply) => {
    const body = typeof request.body === "string" ? request.body : String(request.body ?? "");
    const headerAction = readSoapAction(request.headers);
    const parsed = parseSoapAction(body);
    const actionName = headerAction || parsed.actionName;
    const runtimeConfig = mergeConfig(await storage.getConfig());
    const baseUrl = resolveRequestBaseUrl(request.headers.host, runtimeConfig.publicBaseUrl || baseConfig.publicBaseUrl);
    const tracks = await scanLocalTracks(
      await storage.getLibraryFolders(),
      baseUrl
    );
    const favorites = await storage.getTuneInFavorites();

    reply.type("application/xml; charset=utf-8");

    if (actionName === "Browse") {
      return buildContentDirectoryBrowseResponse(parsed.args, {
        serverName: context.upnp.friendlyName,
        baseUrl,
        tracks,
        favorites
      });
    }

    if (actionName === "GetSystemUpdateID") {
      return buildContentDirectorySystemUpdateIdResponse();
    }

    if (actionName === "GetSearchCapabilities" || actionName === "GetSortCapabilities") {
      return buildContentDirectoryCapabilitiesResponse(actionName);
    }

    throw new HttpError(`Unsupported ContentDirectory action ${actionName}.`, 400);
  });

  app.post("/upnp/control/connection-manager", async (request, reply) => {
    const body = typeof request.body === "string" ? request.body : String(request.body ?? "");
    const headerAction = readSoapAction(request.headers);
    const parsed = parseSoapAction(body);
    const actionName = headerAction || parsed.actionName;

    reply.type("application/xml; charset=utf-8");
    return buildConnectionManagerResponse(actionName);
  });

  app.get("/api/library/folders", async () => ({
    folders: await storage.getLibraryFolders()
  }));

  app.post("/api/library/folders", async (request) => {
    const body = request.body as { path?: string };
    if (!body.path?.trim()) {
      throw new HttpError("Folder path is required.", 400);
    }

    const folderPath = path.resolve(body.path.trim());
    const stats = await fs.stat(folderPath);
    if (!stats.isDirectory()) {
      throw new HttpError("Given path is not a directory.", 400);
    }

    return {
      folders: await storage.addLibraryFolder(folderPath)
    };
  });

  app.delete("/api/library/folders", async (request) => {
    const folderPath = (request.query as { path?: string }).path;
    if (!folderPath?.trim()) {
      throw new HttpError("Folder path is required.", 400);
    }

    return {
      folders: await storage.removeLibraryFolder(folderPath)
    };
  });

  app.get("/api/library/tracks", async () => {
    const runtimeConfig = mergeConfig(await storage.getConfig());
    const folders = await storage.getLibraryFolders();

    return {
      items: await scanLocalTracks(folders, runtimeConfig.publicBaseUrl || baseConfig.publicBaseUrl)
    };
  });

  async function handleTuneInProxy(request: FastifyRequest, reply: FastifyReply) {
    const source = (request.query as { url?: string }).url;
    if (!source) {
      return reply.code(400).send({ error: "Missing url query parameter." });
    }

    const resolved = await resolvePlayableUrl(parseAndValidateUrl(source).toString());
    const upstream = await fetch(resolved, {
      headers: {
        "user-agent": "CarusoBridge/0.2.0",
        "accept": "audio/mpeg,audio/aac,audio/*,*/*;q=0.8"
      }
    });

    if (!upstream.ok || !upstream.body) {
      return reply.code(502).send({ error: `Could not open upstream stream (${upstream.status}).` });
    }

    const contentType = upstream.headers.get("content-type")?.split(";")[0]?.trim() || "audio/mpeg";
    applyStreamHeaders(reply, contentType);

    return reply.send(upstream.body);
  }

  app.get("/stream/tunein", handleTuneInProxy);
  app.get("/stream/tunein.mp3", handleTuneInProxy);

  app.get("/stream/tunein-favorite/:stationId", async (request, reply) => {
    const stationId = (request.params as { stationId: string }).stationId;
    const favorites = await storage.getTuneInFavorites();
    const favorite = favorites.find((item) => item.id === stationId);
    const source = favorite?.streamUrl;

    if (!source) {
      return reply.code(404).send({ error: "Unknown TuneIn station." });
    }

    parseAndValidateUrl(source);
    const inspected = await inspectStream(source);
    const upstream = await fetch(inspected.resolvedUrl, {
      headers: {
        "user-agent": "CarusoBridge/0.2.0",
        "accept": "audio/mpeg,audio/aac,audio/*,*/*;q=0.8"
      }
    });
    if (!upstream.ok || !upstream.body) {
      return reply.code(502).send({ error: `Could not open upstream stream (${upstream.status}).` });
    }

    const mimeType = upstream.headers.get("content-type")?.split(";")[0]?.trim() || favorite?.mimeType || inspected.mimeType || "audio/mpeg";
    applyStreamHeaders(reply, mimeType);
    return reply.send(upstream.body);
  });

  app.get("/media/local/:trackId", async (request, reply) => {
    const trackId = (request.params as { trackId: string }).trackId;
    const runtimeConfig = mergeConfig(await storage.getConfig());
    const folders = await storage.getLibraryFolders();
    const tracks = await scanLocalTracks(folders, runtimeConfig.publicBaseUrl || baseConfig.publicBaseUrl);
    const track = tracks.find((item) => item.id === trackId);

    if (!track) {
      return reply.code(404).send({ error: "Track not found." });
    }

    if (!isPathAllowed(track.absolutePath, folders)) {
      return reply.code(403).send({ error: "Track path is not allowed." });
    }

    let ranged;

    try {
      ranged = await createRangedReadStream(track.absolutePath, request.headers.range);
    } catch (error) {
      if (error instanceof RangeError) {
        const stat = await fs.stat(track.absolutePath);
        reply.header("content-range", `bytes */${stat.size}`);
        return reply.code(416).send({ error: error.message });
      }

      throw error;
    }

    reply.header("content-type", getMimeType(track.absolutePath));
    reply.header("accept-ranges", "bytes");
    reply.header("content-length", String(ranged.end - ranged.start + 1));

    if (ranged.partial) {
      reply.code(206);
      reply.header("content-range", `bytes ${ranged.start}-${ranged.end}/${ranged.size}`);
    }

    return reply.send(ranged.stream);
  });

  app.post("/api/caruso/play/tunein", async (request) => {
    const body = request.body as {
      deviceDescriptionUrl?: string;
      streamUrl?: string;
      title?: string;
    };

    if (!body.deviceDescriptionUrl || !body.streamUrl) {
      throw new HttpError("deviceDescriptionUrl and streamUrl are required.", 400);
    }

    const validatedDeviceDescriptionUrl = parseAndValidateUrl(body.deviceDescriptionUrl, {
      allowPrivateHosts: true
    });
    await assertKnownRendererUrl(validatedDeviceDescriptionUrl.toString());
    const validatedStreamUrl = parseAndValidateUrl(body.streamUrl);

    const runtimeConfig = mergeConfig(await storage.getConfig());
    const localUrl = new URL("/stream/tunein.mp3", runtimeConfig.publicBaseUrl || baseConfig.publicBaseUrl);
    localUrl.searchParams.set("url", validatedStreamUrl.toString());
    const metadata = buildAudioMetadata(body.title || "TuneIn Stream", localUrl.toString(), "audio/mpeg");
    rendererSessions.set(localUrl.toString(), {
      title: body.title || "TuneIn Stream",
      quality: "128 kbps MP3",
      sourceType: "tunein"
    });

    await setAvTransportUri(validatedDeviceDescriptionUrl.toString(), localUrl.toString(), metadata);
    await play(validatedDeviceDescriptionUrl.toString());

    return {
      ok: true,
      proxiedStreamUrl: localUrl.toString()
    };
  });

  app.post("/api/caruso/play/local", async (request) => {
    const body = request.body as {
      deviceDescriptionUrl?: string;
      trackId?: string;
    };

    if (!body.deviceDescriptionUrl || !body.trackId) {
      throw new HttpError("deviceDescriptionUrl and trackId are required.", 400);
    }

    const validatedDeviceDescriptionUrl = parseAndValidateUrl(body.deviceDescriptionUrl, {
      allowPrivateHosts: true
    });
    await assertKnownRendererUrl(validatedDeviceDescriptionUrl.toString());

    const runtimeConfig = mergeConfig(await storage.getConfig());
    const folders = await storage.getLibraryFolders();
    const tracks = await scanLocalTracks(folders, runtimeConfig.publicBaseUrl || baseConfig.publicBaseUrl);
    const track = tracks.find((item) => item.id === body.trackId);

    if (!track) {
      throw new HttpError("Track not found.", 404);
    }

    const localMimeType = getMimeType(track.absolutePath);
    rendererSessions.set(track.url, {
      title: track.title,
      quality: localMimeType.includes("flac") ? "FLAC" : localMimeType.includes("mpeg") ? "MP3 file" : localMimeType,
      sourceType: "local"
    });

    await setAvTransportUri(validatedDeviceDescriptionUrl.toString(), track.url, buildAudioMetadata(track.title, track.url, localMimeType));
    await play(validatedDeviceDescriptionUrl.toString());

    return {
      ok: true,
      track
    };
  });

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    reply.code(statusCode).send({
      error: error instanceof Error ? error.message : "Unknown error"
    });
  });

  return {
    app,
    context
  };
}
