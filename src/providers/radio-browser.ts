import { fetch } from "undici";
import type { TuneInStation } from "./tunein.js";

type RadioBrowserStation = {
  stationuuid: string;
  name: string;
  url_resolved?: string;
  favicon?: string;
  codec?: string;
  bitrate?: number;
  hls?: number;
  lastcheckok?: number;
  country?: string;
  countrycode?: string;
  homepage?: string;
};

const BASE_URL = "https://de1.api.radio-browser.info/json/stations/search";

export async function searchRadioBrowserStations(query: string): Promise<TuneInStation[]> {
  const terms = [query, ...buildFallbackTerms(query)];
  const stations = new Map<string, RadioBrowserStation>();

  for (const term of terms) {
    const data = await fetchStations(term);
    for (const item of data) {
      if (!stations.has(item.stationuuid)) {
        stations.set(item.stationuuid, item);
      }
    }
    if (stations.size >= 20) {
      break;
    }
  }

  return [...stations.values()]
    .filter((item) =>
      item.lastcheckok === 1 &&
      item.url_resolved &&
      item.hls === 0 &&
      ["MP3", "AAC", "AAC+"].includes((item.codec || "").toUpperCase())
    )
    .map((item) => ({
      type: "audio",
      text: item.name,
      subtext: ["Radio Browser", item.country || item.countrycode, item.codec].filter(Boolean).join(" · "),
      image: item.favicon,
      guideId: item.stationuuid,
      bitrate: normalizeBitrate(item.bitrate),
      formats: (item.codec || "").toLowerCase().includes("mp3") ? "mp3" : "aac",
      key: "radio-browser",
      actions: {
        play: item.url_resolved
      }
    }));
}

async function fetchStations(query: string): Promise<RadioBrowserStation[]> {
  const url = new URL(BASE_URL);
  url.searchParams.set("name", query);
  url.searchParams.set("hidebroken", "true");
  url.searchParams.set("limit", "20");
  url.searchParams.set("reverse", "true");
  url.searchParams.set("order", "bitrate");

  const response = await fetch(url, {
    headers: {
      "user-agent": "CarusoBridge/0.2.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Radio Browser search failed with status ${response.status}.`);
  }

  return response.json() as Promise<RadioBrowserStation[]>;
}

function buildFallbackTerms(query: string): string[] {
  const tokens = query
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3)
    .filter((item) => !["radio", "fm", "live"].includes(item.toLowerCase()));

  return [...new Set(tokens.sort((left, right) => right.length - left.length))];
}

function normalizeBitrate(value?: number): number | undefined {
  if (!value) {
    return undefined;
  }

  return value > 1000 ? Math.round(value / 1000) : value;
}
