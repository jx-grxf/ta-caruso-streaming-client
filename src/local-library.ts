import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const SUPPORTED_EXTENSIONS = new Set([
  ".mp3",
  ".flac",
  ".m4a",
  ".aac",
  ".wav",
  ".ogg",
  ".opus",
  ".aiff",
  ".alac"
]);

export type LocalTrack = {
  id: string;
  title: string;
  relativePath: string;
  absolutePath: string;
  folder: string;
  extension: string;
  size: number;
  url: string;
};

export async function scanLocalTracks(folders: string[], baseUrl: string): Promise<LocalTrack[]> {
  const tracks: LocalTrack[] = [];

  for (const folder of folders) {
    await walkFolder(folder, folder, baseUrl, tracks);
  }

  return tracks.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export function createTrackId(filePath: string): string {
  return crypto.createHash("sha1").update(filePath).digest("hex");
}

export function isPathAllowed(filePath: string, folders: string[]): boolean {
  return folders.some((folder) => {
    const relative = path.relative(folder, filePath);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
}

export function getMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".mp3":
      return "audio/mpeg";
    case ".flac":
      return "audio/flac";
    case ".m4a":
    case ".aac":
      return "audio/aac";
    case ".wav":
      return "audio/wav";
    case ".ogg":
    case ".opus":
      return "audio/ogg";
    case ".aiff":
      return "audio/aiff";
    default:
      return "application/octet-stream";
  }
}

export async function createRangedReadStream(filePath: string, rangeHeader?: string): Promise<{
  stream: fs.ReadStream;
  start: number;
  end: number;
  size: number;
  partial: boolean;
}> {
  const stats = await fsp.stat(filePath);
  const size = stats.size;

  if (!rangeHeader?.startsWith("bytes=")) {
    return {
      stream: fs.createReadStream(filePath),
      start: 0,
      end: size - 1,
      size,
      partial: false
    };
  }

  const [rawStart, rawEnd] = rangeHeader.replace("bytes=", "").split("-");
  const hasStart = rawStart !== undefined && rawStart !== "";
  const hasEnd = rawEnd !== undefined && rawEnd !== "";

  let start: number;
  let end: number;

  if (!hasStart && !hasEnd) {
    throw new RangeError("Invalid byte range.");
  }

  if (!hasStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      throw new RangeError("Invalid byte range.");
    }

    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = hasEnd ? Number(rawEnd) : size - 1;
  }

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    throw new RangeError("Invalid byte range.");
  }

  end = Math.min(end, size - 1);

  return {
    stream: fs.createReadStream(filePath, { start, end }),
    start,
    end,
    size,
    partial: true
  };
}

async function walkFolder(rootFolder: string, currentFolder: string, baseUrl: string, tracks: LocalTrack[]): Promise<void> {
  let entries: fs.Dirent[];

  try {
    entries = await fsp.readdir(currentFolder, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const absolutePath = path.join(currentFolder, entry.name);

    if (entry.isDirectory()) {
      await walkFolder(rootFolder, absolutePath, baseUrl, tracks);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      continue;
    }

    const stats = await fsp.stat(absolutePath);
    const id = createTrackId(absolutePath);
    tracks.push({
      id,
      title: path.basename(entry.name, extension),
      relativePath: path.relative(rootFolder, absolutePath),
      absolutePath,
      folder: rootFolder,
      extension,
      size: stats.size,
      url: new URL(`/media/local/${id}`, baseUrl).toString()
    });
  }
}
