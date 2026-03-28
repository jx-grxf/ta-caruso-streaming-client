import { XMLParser } from "fast-xml-parser";
import { fetch } from "undici";

export type TuneInStation = {
  type: string;
  text: string;
  subtext?: string;
  image?: string;
  guideId?: string;
  bitrate?: number;
  formats?: string;
  actions?: {
    play?: string;
    browse?: string;
  };
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ""
});

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

export async function searchStations(query: string): Promise<TuneInStation[]> {
  const url = new URL("https://opml.radiotime.com/Search.ashx");
  url.searchParams.set("query", query);
  url.searchParams.set("render", "xml");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`TuneIn search failed with status ${response.status}.`);
  }

  const xml = await response.text();
  const parsed = parser.parse(xml) as {
    opml?: {
      body?: {
        outline?: Array<Record<string, string>> | Record<string, string>;
      };
    };
  };

  return toArray(parsed.opml?.body?.outline)
    .filter((item) => item.type === "audio" || item.type === "link")
    .map((item) => ({
      type: item.type ?? "unknown",
      text: item.text ?? "Unknown",
      subtext: item.subtext,
      image: item.image,
      guideId: item.guide_id,
      bitrate: item.bitrate ? Number(item.bitrate) : undefined,
      formats: item.formats,
      actions: {
        play: item.URL,
        browse: item.BrowseURL
      }
    }));
}

export async function resolvePlayableUrl(inputUrl: string): Promise<string> {
  const response = await fetch(inputUrl);

  if (!response.ok) {
    throw new Error(`TuneIn stream lookup failed with status ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();

  if (!contentType.includes("audio") && !contentType.includes("mpegurl") && !contentType.includes("playlist")) {
    const firstHttpLine = text
      .split("\n")
      .map((line) => line.trim())
      .find((line) => /^https?:\/\//i.test(line));

    if (firstHttpLine) {
      return firstHttpLine;
    }
  }

  return inputUrl;
}
