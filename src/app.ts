import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config as baseConfig } from "./config.js";
import { createRangedReadStream, getMimeType, isPathAllowed, scanLocalTracks } from "./local-library.js";
import { getDeezerCapabilities } from "./providers/deezer.js";
import { resolvePlayableUrl, searchStations } from "./providers/tunein.js";
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
    publicBaseUrl: runtimeConfig.publicBaseUrl || baseConfig.publicBaseUrl,
    carusoFriendlyName: runtimeConfig.carusoFriendlyName || baseConfig.carusoFriendlyName,
    deezerArl: runtimeConfig.deezerArl || baseConfig.deezerArl,
    uiLanguage: runtimeConfig.uiLanguage || "de"
  };
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

export async function createApp(dataDir: string) {
  const storage = new AppStorage(dataDir);
  const serverUuid = createMediaServerUuid(dataDir);
  const serverFriendlyName = `${baseConfig.carusoFriendlyName || "Caruso"} auf ${process.env.HOSTNAME || "MacBook"}`;
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
      friendlyName: serverFriendlyName
    }
  };

  await app.register(fastifyStatic, {
    root: getUiRoot(),
    prefix: "/"
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

    return {
      server: {
        running: true,
        startedAt: context.startedAt,
        publicBaseUrl: runtimeConfig.publicBaseUrl || baseConfig.publicBaseUrl,
        dataDir
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

    return mergeConfig(nextConfig);
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

    return {
      items: await searchStations(query)
    };
  });

  app.get("/api/tunein/favorites", async () => ({
    items: await storage.getTuneInFavorites()
  }));

  app.post("/api/tunein/favorites", async (request) => {
    const body = request.body as Partial<TuneInFavorite> & { title?: string; streamUrl?: string; id?: string };

    if (!body.title?.trim() || !body.streamUrl?.trim()) {
      throw new Error("title and streamUrl are required.");
    }

    return {
      items: await storage.addTuneInFavorite({
        id: body.id?.trim() || normalizeFavoriteId(body.title),
        title: body.title.trim(),
        streamUrl: body.streamUrl.trim(),
        subtitle: body.subtitle?.trim(),
        image: body.image?.trim(),
        mimeType: body.mimeType?.trim(),
        bitrate: body.bitrate
      })
    };
  });

  app.delete("/api/tunein/favorites/:id", async (request) => {
    const id = (request.params as { id: string }).id;
    return {
      items: await storage.removeTuneInFavorite(id)
    };
  });

  app.get("/api/renderer/status", async (request) => {
    const deviceDescriptionUrl = (request.query as { deviceDescriptionUrl?: string }).deviceDescriptionUrl;
    if (!deviceDescriptionUrl) {
      throw new Error("deviceDescriptionUrl is required.");
    }

    const status = await getRendererStatus(deviceDescriptionUrl);
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

    throw new Error(`Unsupported ContentDirectory action ${actionName}.`);
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
      throw new Error("Folder path is required.");
    }

    const folderPath = path.resolve(body.path.trim());
    const stats = await fs.stat(folderPath);
    if (!stats.isDirectory()) {
      throw new Error("Given path is not a directory.");
    }

    return {
      folders: await storage.addLibraryFolder(folderPath)
    };
  });

  app.delete("/api/library/folders", async (request) => {
    const folderPath = (request.query as { path?: string }).path;
    if (!folderPath?.trim()) {
      throw new Error("Folder path is required.");
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

    const resolved = await resolvePlayableUrl(source);
    const upstream = await fetch(resolved);

    if (!upstream.ok || !upstream.body) {
      return reply.code(502).send({ error: `Could not open upstream stream (${upstream.status}).` });
    }

    const contentType = upstream.headers.get("content-type");
    if (contentType) {
      reply.header("content-type", contentType);
    }

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

    const upstream = await fetch(source);
    if (!upstream.ok || !upstream.body) {
      return reply.code(502).send({ error: `Could not open upstream stream (${upstream.status}).` });
    }

    reply.header("content-type", upstream.headers.get("content-type") || favorite?.mimeType || "audio/mpeg");
    reply.header("icy-metadata", upstream.headers.get("icy-metadata") || "0");
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

    const ranged = await createRangedReadStream(track.absolutePath, request.headers.range);
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
      throw new Error("deviceDescriptionUrl and streamUrl are required.");
    }

    const runtimeConfig = mergeConfig(await storage.getConfig());
    const localUrl = new URL("/stream/tunein.mp3", runtimeConfig.publicBaseUrl || baseConfig.publicBaseUrl);
    localUrl.searchParams.set("url", body.streamUrl);
    const metadata = buildAudioMetadata(body.title || "TuneIn Stream", localUrl.toString(), "audio/mpeg");
    rendererSessions.set(localUrl.toString(), {
      title: body.title || "TuneIn Stream",
      quality: "128 kbps MP3",
      sourceType: "tunein"
    });

    await setAvTransportUri(body.deviceDescriptionUrl, localUrl.toString(), metadata);
    await play(body.deviceDescriptionUrl);

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
      throw new Error("deviceDescriptionUrl and trackId are required.");
    }

    const runtimeConfig = mergeConfig(await storage.getConfig());
    const folders = await storage.getLibraryFolders();
    const tracks = await scanLocalTracks(folders, runtimeConfig.publicBaseUrl || baseConfig.publicBaseUrl);
    const track = tracks.find((item) => item.id === body.trackId);

    if (!track) {
      throw new Error("Track not found.");
    }

    const localMimeType = getMimeType(track.absolutePath);
    rendererSessions.set(track.url, {
      title: track.title,
      quality: localMimeType.includes("flac") ? "FLAC" : localMimeType.includes("mpeg") ? "MP3 file" : localMimeType,
      sourceType: "local"
    });

    await setAvTransportUri(body.deviceDescriptionUrl, track.url, buildAudioMetadata(track.title, track.url, localMimeType));
    await play(body.deviceDescriptionUrl);

    return {
      ok: true,
      track
    };
  });

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    reply.code(500).send({
      error: error instanceof Error ? error.message : "Unknown error"
    });
  });

  return {
    app,
    context
  };
}
