import fs from "node:fs/promises";
import path from "node:path";

export type PersistedConfig = {
  publicBaseUrl?: string;
  carusoFriendlyName?: string;
  deezerArl?: string;
  uiLanguage?: "de" | "en";
};

export type TuneInFavorite = {
  id: string;
  title: string;
  streamUrl: string;
  subtitle?: string;
  image?: string;
  mimeType?: string;
  bitrate?: number;
};

type PersistedState = {
  config: PersistedConfig;
  libraryFolders: string[];
  tuneinFavorites: TuneInFavorite[];
};

const DEFAULT_STATE: PersistedState = {
  config: {},
  libraryFolders: [],
  tuneinFavorites: [
    {
      id: "ffh-die-80er",
      title: "FFH Die 80er",
      streamUrl: "http://mp3.ffh.de/ffhchannels/hq80er.mp3",
      subtitle: "Preset",
      mimeType: "audio/mpeg",
      bitrate: 128
    }
  ]
};

export class AppStorage {
  private readonly filePath: string;
  private state: PersistedState | null = null;

  constructor(private readonly dataDir: string) {
    this.filePath = path.join(this.dataDir, "settings.json");
  }

  async load(): Promise<PersistedState> {
    if (this.state) {
      return this.state;
    }

    await fs.mkdir(this.dataDir, { recursive: true });

    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      this.state = {
        ...DEFAULT_STATE,
        ...JSON.parse(raw)
      };
    } catch (error) {
      const isMissing = (error as NodeJS.ErrnoException).code === "ENOENT";
      this.state = isMissing ? structuredClone(DEFAULT_STATE) : DEFAULT_STATE;

      if (!isMissing) {
        throw error;
      }
    }

    return this.state!;
  }

  async getConfig(): Promise<PersistedConfig> {
    const state = await this.load();
    return state.config;
  }

  async updateConfig(nextConfig: PersistedConfig): Promise<PersistedConfig> {
    const state = await this.load();
    state.config = {
      ...state.config,
      ...nextConfig
    };
    await this.save();
    return state.config;
  }

  async getLibraryFolders(): Promise<string[]> {
    const state = await this.load();
    return [...state.libraryFolders];
  }

  async getTuneInFavorites(): Promise<TuneInFavorite[]> {
    const state = await this.load();
    return [...state.tuneinFavorites];
  }

  async addTuneInFavorite(favorite: TuneInFavorite): Promise<TuneInFavorite[]> {
    const state = await this.load();
    const existingIndex = state.tuneinFavorites.findIndex((item) => item.id === favorite.id);

    if (existingIndex >= 0) {
      state.tuneinFavorites[existingIndex] = favorite;
    } else {
      state.tuneinFavorites.push(favorite);
    }

    state.tuneinFavorites.sort((left, right) => left.title.localeCompare(right.title));
    await this.save();
    return [...state.tuneinFavorites];
  }

  async removeTuneInFavorite(id: string): Promise<TuneInFavorite[]> {
    const state = await this.load();
    state.tuneinFavorites = state.tuneinFavorites.filter((item) => item.id !== id);
    await this.save();
    return [...state.tuneinFavorites];
  }

  async addLibraryFolder(folderPath: string): Promise<string[]> {
    const state = await this.load();
    const normalized = path.resolve(folderPath);

    if (!state.libraryFolders.includes(normalized)) {
      state.libraryFolders.push(normalized);
      state.libraryFolders.sort((left, right) => left.localeCompare(right));
      await this.save();
    }

    return [...state.libraryFolders];
  }

  async removeLibraryFolder(folderPath: string): Promise<string[]> {
    const state = await this.load();
    const normalized = path.resolve(folderPath);
    state.libraryFolders = state.libraryFolders.filter((item) => item !== normalized);
    await this.save();
    return [...state.libraryFolders];
  }

  private async save(): Promise<void> {
    if (!this.state) {
      return;
    }

    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.state, null, 2), "utf8");
  }
}
