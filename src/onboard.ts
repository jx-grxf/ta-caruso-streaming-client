import chalk, { Chalk } from "chalk";
import { confirm, intro, isCancel, note, outro, select, spinner } from "@clack/prompts";
import { spawn } from "node:child_process";
import { config } from "./config.js";
import { createServerManager } from "./server-manager.js";
import { AppStorage } from "./storage.js";
import { runTerminalUi } from "./tui.js";
import { fetchDeviceDescription, type UpnpDeviceDescription } from "./upnp/device-description.js";
import { discoverUpnpDevices } from "./upnp/discovery.js";

type Language = "de" | "en";

type WizardDevice = {
  friendlyName: string;
  address: string;
  location?: string;
  manufacturer?: string;
  modelName?: string;
};

type Copy = {
  title: string;
  welcome: string;
  chooseLanguage: string;
  languageHint: string;
  searchingTitle: string;
  searchingBody: string;
  searchDone: string;
  noDevices: string;
  searchAgain: string;
  selectDevice: string;
  deviceHint: string;
  mediaTitle: string;
  mediaBody: string;
  noFolders: string;
  continueSetup: string;
  openDashboard: string;
  finishTitle: string;
  finishBody: string;
  startTui: string;
  finishDashboard: string;
  saved: string;
  cancelled: string;
  closeout: string;
};

const LOBSTER_PALETTE = {
  accent: "#FF5A2D",
  accentBright: "#FF7A3D",
  success: "#2FBF71",
  warn: "#FFB020",
  error: "#E23D2D",
  muted: "#8B7F77"
} as const;

const hasForceColor =
  typeof process.env.FORCE_COLOR === "string" &&
  process.env.FORCE_COLOR.trim().length > 0 &&
  process.env.FORCE_COLOR.trim() !== "0";

const color = process.env.NO_COLOR && !hasForceColor ? new Chalk({ level: 0 }) : chalk;

const theme = {
  accent: color.hex(LOBSTER_PALETTE.accent),
  accentBright: color.hex(LOBSTER_PALETTE.accentBright),
  success: color.hex(LOBSTER_PALETTE.success),
  warn: color.hex(LOBSTER_PALETTE.warn),
  error: color.hex(LOBSTER_PALETTE.error),
  muted: color.hex(LOBSTER_PALETTE.muted),
  heading: color.bold.hex(LOBSTER_PALETTE.accent)
};

const copy: Record<Language, Copy> = {
  de: {
    title: "Caruso Bridge Setup",
    welcome: "Gefuehrtes Onboarding fuer deinen Caruso-Bridge-Start.",
    chooseLanguage: "Sprache waehlen",
    languageHint: "Du kannst die Sprache spaeter im Dashboard aendern.",
    searchingTitle: "Caruso finden",
    searchingBody: "Bitte sicherstellen: Mac und Caruso sind im gleichen Netzwerk und der Caruso ist eingeschaltet.",
    searchDone: "Passende Geraete gefunden.",
    noDevices: "Kein passendes Caruso-/T+A-Geraet gefunden.",
    searchAgain: "Erneut suchen",
    selectDevice: "Caruso auswaehlen",
    deviceHint: "Die Auswahl wird fuer die kuenftige Filterung gespeichert.",
    mediaTitle: "Medien pruefen",
    mediaBody: "Die Bridge hat deine lokale Musik- und Favoritenbasis geprueft.",
    noFolders: "Noch kein Musikordner erkannt. Das ist okay und kann spaeter gesetzt werden.",
    continueSetup: "Weiter",
    openDashboard: "Dashboard oeffnen",
    finishTitle: "Setup abschliessen",
    finishBody: "Die Basis ist eingerichtet. Du kannst direkt ins Dashboard oder in die TUI wechseln.",
    startTui: "TUI starten",
    finishDashboard: "Dashboard jetzt oeffnen",
    saved: "Auswahl gespeichert.",
    cancelled: "Setup abgebrochen.",
    closeout: "Caruso Bridge ist bereit."
  },
  en: {
    title: "Caruso Bridge Setup",
    welcome: "Guided onboarding for your Caruso Bridge start.",
    chooseLanguage: "Choose language",
    languageHint: "You can change the language later in the dashboard.",
    searchingTitle: "Find your Caruso",
    searchingBody: "Please make sure your Mac and Caruso are on the same network and the Caruso is powered on.",
    searchDone: "Matching devices found.",
    noDevices: "No matching Caruso/T+A device found yet.",
    searchAgain: "Search again",
    selectDevice: "Select Caruso",
    deviceHint: "The selection is saved for future filtering.",
    mediaTitle: "Check media",
    mediaBody: "The bridge checked your local music and favorites baseline.",
    noFolders: "No music folder detected yet. That is okay and can be set later.",
    continueSetup: "Continue",
    openDashboard: "Open dashboard",
    finishTitle: "Finish setup",
    finishBody: "The basics are configured. You can move straight into the dashboard or the TUI.",
    startTui: "Start TUI",
    finishDashboard: "Open dashboard now",
    saved: "Selection saved.",
    cancelled: "Setup cancelled.",
    closeout: "Caruso Bridge is ready."
  }
};

const storage = new AppStorage(config.dataDir);
const manager = createServerManager({
  dataDir: config.dataDir,
  loggerEnabled: false
});

function styleTitle(value: string): string {
  return theme.heading(value);
}

function styleMuted(value: string): string {
  return theme.muted(value);
}

function styleAccent(value: string): string {
  return theme.accent(value);
}

function guardCancel<T>(value: T | symbol, language: Language): T {
  if (isCancel(value)) {
    outro(styleTitle(copy[language].cancelled));
    throw new Error("WIZARD_CANCELLED");
  }

  return value;
}

function formatDevice(device: WizardDevice): string {
  const meta = [device.modelName, device.manufacturer].filter(Boolean).join(" • ");
  return meta
    ? `${device.friendlyName} (${device.address})\n${styleMuted(meta)}`
    : `${device.friendlyName} (${device.address})`;
}

function buildWizardDevice(address: string, location: string | undefined, description: UpnpDeviceDescription): WizardDevice {
  return {
    friendlyName: description.friendlyName || description.modelName || "Unknown device",
    address,
    location,
    manufacturer: description.manufacturer,
    modelName: description.modelName
  };
}

function isBridgeSelfDevice(description: UpnpDeviceDescription): boolean {
  const friendlyName = description.friendlyName?.toLowerCase() || "";
  const manufacturer = description.manufacturer?.toLowerCase() || "";
  const modelName = description.modelName?.toLowerCase() || "";
  const deviceType = description.deviceType?.toLowerCase() || "";

  return (
    manufacturer.includes("codex") ||
    manufacturer.includes("openai") ||
    modelName.includes("caruso bridge") ||
    (deviceType.includes("mediaserver") && friendlyName.includes("caruso"))
  );
}

function isLikelyCarusoRenderer(description: UpnpDeviceDescription): boolean {
  const friendlyName = description.friendlyName?.toLowerCase() || "";
  const manufacturer = description.manufacturer?.toLowerCase() || "";
  const modelName = description.modelName?.toLowerCase() || "";
  const deviceType = description.deviceType?.toLowerCase() || "";
  const hasAvTransport = description.services.some((service) => service.serviceType.toLowerCase().includes("avtransport"));

  return (
    hasAvTransport &&
    !deviceType.includes("mediaserver") &&
    (
      friendlyName.includes("caruso") ||
      manufacturer.includes("t+a") ||
      manufacturer.includes("t+a elektroakustik") ||
      modelName.includes("caruso")
    )
  );
}

async function discoverWizardDevices(): Promise<WizardDevice[]> {
  const devices = await discoverUpnpDevices();
  const enriched = await Promise.all(
    devices
      .filter((device) => device.location)
      .map(async (device) => {
        try {
          const description = await fetchDeviceDescription(device.location!);
          return {
            ...buildWizardDevice(device.address, device.location, description),
            description
          };
        } catch {
          return undefined;
        }
      })
  );

  const filtered = enriched
    .filter((item): item is WizardDevice & { description: UpnpDeviceDescription } => Boolean(item?.description))
    .filter((item) => !isBridgeSelfDevice(item.description))
    .filter((item) => isLikelyCarusoRenderer(item.description));

  const deduped = new Map<string, WizardDevice>();
  for (const item of filtered) {
    const key = `${item.friendlyName}::${item.address}`;
    if (!deduped.has(key)) {
      deduped.set(key, item);
    }
  }

  return [...deduped.values()].sort((left, right) => left.friendlyName.localeCompare(right.friendlyName));
}

async function ensureServerRunning() {
  if (!manager.getState().running) {
    await manager.start();
  }
}

function openBrowser(url: string) {
  spawn("open", [url], {
    detached: true,
    stdio: "ignore"
  }).unref();
}

async function readMediaSnapshot() {
  const [folders, favorites] = await Promise.all([
    storage.getLibraryFolders(),
    storage.getTuneInFavorites()
  ]);

  return {
    folders,
    favoriteCount: favorites.length
  };
}

async function chooseLanguage(initialLanguage: Language): Promise<Language> {
  const selected = guardCancel(await select({
    message: styleAccent(copy[initialLanguage].chooseLanguage),
    options: [
      {
        value: "de",
        label: "Deutsch",
        hint: styleMuted("Setup und TUI auf Deutsch")
      },
      {
        value: "en",
        label: "English",
        hint: styleMuted("Setup and TUI in English")
      }
    ],
    initialValue: initialLanguage
  }), initialLanguage);

  return selected as Language;
}

async function chooseDevice(language: Language): Promise<WizardDevice | undefined> {
  const text = copy[language];

  while (true) {
    note(`${text.searchingBody}\n\n${styleMuted(text.deviceHint)}`, styleTitle(text.searchingTitle));

    const searchSpinner = spinner();
    searchSpinner.start(styleAccent(text.searchingTitle));

    let devices: WizardDevice[];
    try {
      devices = await discoverWizardDevices();
      searchSpinner.stop(theme.success(text.searchDone));
    } catch (error) {
      searchSpinner.stop(theme.error(error instanceof Error ? error.message : text.noDevices));
      const retry = guardCancel(await confirm({
        message: styleAccent(text.searchAgain),
        initialValue: true
      }), language);
      if (!retry) {
        return undefined;
      }
      continue;
    }

    if (devices.length === 0) {
      note(text.noDevices, styleTitle(text.searchingTitle));
      const retry = guardCancel(await confirm({
        message: styleAccent(text.searchAgain),
        initialValue: true
      }), language);
      if (!retry) {
        return undefined;
      }
      continue;
    }

    const selected = guardCancel(await select({
      message: styleAccent(text.selectDevice),
      options: devices.map((device) => ({
        value: device.address,
        label: formatDevice(device),
        hint: styleMuted(device.location || "")
      }))
    }), language);

    return devices.find((device) => device.address === selected);
  }
}

async function showMediaStep(language: Language): Promise<"continue" | "dashboard"> {
  const text = copy[language];
  const media = await readMediaSnapshot();
  const folderLines = media.folders.length > 0
    ? media.folders.slice(0, 5).map((folder, index) => `${index + 1}. ${folder}`).join("\n")
    : styleMuted(text.noFolders);

  note(
    `${text.mediaBody}\n\nFavorites: ${media.favoriteCount}\nFolders: ${media.folders.length}\n\n${folderLines}`,
    styleTitle(text.mediaTitle)
  );

  const next = guardCancel(await select({
    message: styleAccent(text.mediaTitle),
    options: [
      {
        value: "continue",
        label: text.continueSetup
      },
      {
        value: "dashboard",
        label: text.openDashboard
      }
    ],
    initialValue: "continue"
  }), language);

  return next as "continue" | "dashboard";
}

async function finishSetup(language: Language, selectedDevice?: WizardDevice) {
  const text = copy[language];
  const lanUrl = manager.getState().url;

  note(
    `${text.finishBody}\n\nLanguage: ${language === "de" ? "Deutsch" : "English"}\nCaruso: ${selectedDevice?.friendlyName || "-"}\nLocal UI: http://127.0.0.1:${config.port}\nLAN URL: ${lanUrl}`,
    styleTitle(text.finishTitle)
  );

  const next = guardCancel(await select({
    message: styleAccent(text.finishTitle),
    options: [
      {
        value: "dashboard",
        label: text.finishDashboard
      },
      {
        value: "tui",
        label: text.startTui
      }
    ],
    initialValue: "tui"
  }), language);

  if (next === "dashboard") {
    await ensureServerRunning();
    openBrowser(`http://127.0.0.1:${config.port}`);
    outro(styleTitle(text.closeout));
    return;
  }

  await ensureServerRunning();
  outro(styleTitle(text.closeout));
  await runTerminalUi(manager, {
    dataDir: config.dataDir,
    appLabel: "Caruso Bridge"
  });
}

async function main() {
  let language: Language = "en";

  intro(styleTitle(copy[language].title));
  note(copy[language].welcome, styleTitle(copy[language].title));

  language = await chooseLanguage(language);
  await storage.updateConfig({ uiLanguage: language });

  note(styleMuted(copy[language].languageHint), styleTitle(copy[language].chooseLanguage));

  const selectedDevice = await chooseDevice(language);
  if (selectedDevice) {
    await storage.updateConfig({
      carusoFriendlyName: selectedDevice.friendlyName
    });
    note(theme.success(copy[language].saved), styleTitle(copy[language].selectDevice));
  }

  const mediaAction = await showMediaStep(language);
  if (mediaAction === "dashboard") {
    await ensureServerRunning();
    openBrowser(`http://127.0.0.1:${config.port}`);
  }

  await finishSetup(language, selectedDevice);
}

void main().catch(async (error) => {
  if (error instanceof Error && error.message === "WIZARD_CANCELLED") {
    await manager.stop();
    process.exit(0);
  }

  console.error(error);
  await manager.stop();
  process.exit(1);
});
