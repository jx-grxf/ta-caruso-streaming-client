import chalk, { Chalk } from "chalk";
import { confirm, intro, isCancel, note, outro, select, spinner } from "@clack/prompts";
import {
  config,
  listNetworkCandidates,
  persistNetworkSelection,
  pickBestNetworkCandidate,
  type NetworkCandidate
} from "./config.js";
import { detectDefaultTargetPlatform, openExternalUrl, type TargetPlatform } from "./platform.js";
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
  checkingOs: string;
  osDetectedTitle: string;
  osDetectedBody: string;
  continueDetectedOs: string;
  changeDetectedOs: string;
  choosePlatform: string;
  platformHint: string;
  platformMac: string;
  platformWindows: string;
  platformMacHint: string;
  platformWindowsHint: string;
  chooseNetwork: string;
  networkHint: string;
  networkAuto: string;
  networkAutoHint: string;
  networkManual: string;
  networkManualHint: string;
  networkRecommended: string;
  networkVirtual: string;
  networkSaved: string;
  noNetworkFound: string;
  searchingTitle: string;
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
    title: "Caruso Reborn Setup",
    welcome: "Gefuehrtes Onboarding fuer deinen Caruso-Reborn-Start.",
    chooseLanguage: "Sprache waehlen",
    languageHint: "Du kannst die Sprache spaeter im Dashboard aendern.",
    checkingOs: "Betriebssystem wird geprueft...",
    osDetectedTitle: "Betriebssystem erkannt",
    osDetectedBody: "Dein Betriebssystem wurde als {platform} erkannt.",
    continueDetectedOs: "Weiter mit {platform}",
    changeDetectedOs: "Aendern",
    choosePlatform: "Plattform waehlen",
    platformHint: "Die Auswahl steuert plattformspezifische Defaults und Hinweise.",
    platformMac: "Mac",
    platformWindows: "Windows",
    platformMacHint: "macOS-Optimierungen und Mac-Texte verwenden",
    platformWindowsHint: "Windows-Optimierungen und PC-Texte verwenden",
    chooseNetwork: "Netzwerk waehlen",
    networkHint: "Automatic waehlt den besten lokalen Adapter. Manual listet alle verfuegbaren IPv4-Adapter auf.",
    networkAuto: "Automatic check",
    networkAutoHint: "Empfohlenen lokalen Adapter automatisch auswaehlen",
    networkManual: "Manual selection",
    networkManualHint: "Adapter selbst aus der Liste waehlen",
    networkRecommended: "Empfohlen",
    networkVirtual: "Virtuell / VPN",
    networkSaved: "Netzwerk gespeichert",
    noNetworkFound: "Kein passender IPv4-Netzwerkadapter gefunden.",
    searchingTitle: "Caruso finden",
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
    closeout: "Caruso Reborn ist bereit."
  },
  en: {
    title: "Caruso Reborn Setup",
    welcome: "Guided onboarding for your Caruso Reborn start.",
    chooseLanguage: "Choose language",
    languageHint: "You can change the language later in the dashboard.",
    checkingOs: "Checking OS...",
    osDetectedTitle: "Detected operating system",
    osDetectedBody: "Your operating system was detected as {platform}.",
    continueDetectedOs: "Continue with {platform}",
    changeDetectedOs: "Change",
    choosePlatform: "Choose platform",
    platformHint: "This controls platform-specific defaults and guidance.",
    platformMac: "Mac",
    platformWindows: "Windows",
    platformMacHint: "Use macOS-oriented defaults and copy",
    platformWindowsHint: "Use Windows-oriented defaults and PC copy",
    chooseNetwork: "Choose network",
    networkHint: "Automatic picks the best local adapter. Manual lists every available IPv4 adapter.",
    networkAuto: "Automatic check",
    networkAutoHint: "Automatically use the recommended local adapter",
    networkManual: "Manual selection",
    networkManualHint: "Pick the adapter yourself from a list",
    networkRecommended: "Recommended",
    networkVirtual: "Virtual / VPN",
    networkSaved: "Network saved",
    noNetworkFound: "No suitable IPv4 network adapter found.",
    searchingTitle: "Find your Caruso",
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
    closeout: "Caruso Reborn is ready."
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
    modelName.includes("caruso reborn") ||
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
  openExternalUrl(url);
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

async function confirmDetectedPlatform(language: Language, detectedPlatform: TargetPlatform): Promise<TargetPlatform> {
  const text = copy[language];
  const platformLabel = formatPlatformLabel(detectedPlatform);

  note(
    text.osDetectedBody.replace("{platform}", platformLabel),
    styleTitle(text.osDetectedTitle)
  );

  const selected = guardCancel(await select({
    message: styleAccent(text.checkingOs),
    options: [
      {
        value: "continue",
        label: text.continueDetectedOs.replace("{platform}", platformLabel),
        hint: styleMuted(text.platformHint)
      },
      {
        value: "change",
        label: text.changeDetectedOs,
        hint: styleMuted(text.choosePlatform)
      }
    ],
    initialValue: "continue"
  }), language);

  if (selected === "change") {
    return choosePlatform(language, detectedPlatform);
  }

  return detectedPlatform;
}

async function choosePlatform(language: Language, initialPlatform: TargetPlatform): Promise<TargetPlatform> {
  const text = copy[language];
  const selected = guardCancel(await select({
    message: styleAccent(text.choosePlatform),
    options: [
      {
        value: "mac",
        label: text.platformMac,
        hint: styleMuted(text.platformMacHint)
      },
      {
        value: "windows",
        label: text.platformWindows,
        hint: styleMuted(text.platformWindowsHint)
      }
    ],
    initialValue: initialPlatform
  }), language);

  return selected as TargetPlatform;
}

function formatNetworkCandidate(language: Language, candidate: NetworkCandidate, recommendedAddress?: string): string {
  const tags = [];

  if (candidate.address === recommendedAddress) {
    tags.push(copy[language].networkRecommended);
  }

  if (candidate.isVirtual) {
    tags.push(copy[language].networkVirtual);
  }

  const suffix = tags.length > 0 ? `\n${styleMuted(tags.join(" • "))}` : "";
  return `${candidate.interfaceName} (${candidate.address})${suffix}`;
}

async function chooseNetwork(language: Language): Promise<{
  publicBaseUrl: string;
  interfaceName: string;
  address: string;
}> {
  const text = copy[language];
  const candidates = listNetworkCandidates(config.port);
  const recommended = pickBestNetworkCandidate(candidates);

  note(text.networkHint, styleTitle(text.chooseNetwork));

  if (!recommended) {
    throw new Error(text.noNetworkFound);
  }

  const mode = guardCancel(await select({
    message: styleAccent(text.chooseNetwork),
    options: [
      {
        value: "automatic",
        label: text.networkAuto,
        hint: styleMuted(`${text.networkAutoHint}: ${recommended.interfaceName} (${recommended.address})`)
      },
      {
        value: "manual",
        label: text.networkManual,
        hint: styleMuted(text.networkManualHint)
      }
    ],
    initialValue: "automatic"
  }), language) as "automatic" | "manual";

  let selectedCandidate = recommended;
  if (mode === "manual") {
    const selectedAddress = guardCancel(await select({
      message: styleAccent(text.chooseNetwork),
      options: candidates.map((candidate) => ({
        value: candidate.address,
        label: formatNetworkCandidate(language, candidate, recommended.address),
        hint: styleMuted(candidate.baseUrl)
      })),
      initialValue: recommended.address
    }), language);
    selectedCandidate = candidates.find((candidate) => candidate.address === selectedAddress) ?? recommended;
  }

  if (!selectedCandidate) {
    throw new Error(text.noNetworkFound);
  }

  const saved = await persistNetworkSelection({
    interfaceName: selectedCandidate.interfaceName,
    address: selectedCandidate.address,
    mode,
    port: config.port
  });

  note(
    `${saved.interfaceName} (${saved.address})\n${styleMuted(saved.publicBaseUrl)}`,
    styleTitle(text.networkSaved)
  );

  return saved;
}

async function chooseDevice(language: Language, platform: TargetPlatform): Promise<WizardDevice | undefined> {
  const text = copy[language];

  while (true) {
    note(`${getSearchingBody(language, platform)}\n\n${styleMuted(text.deviceHint)}`, styleTitle(text.searchingTitle));

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
        value: device.location || `${device.friendlyName}::${device.address}`,
        label: formatDevice(device),
        hint: styleMuted(device.location || "")
      }))
    }), language);

    return devices.find((device) => (device.location || `${device.friendlyName}::${device.address}`) === selected);
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

function formatPlatformLabel(platform: TargetPlatform): string {
  return platform === "windows" ? "Windows" : "Mac";
}

function getSearchingBody(language: Language, platform: TargetPlatform): string {
  if (language === "de") {
    return `Bitte sicherstellen: ${formatPlatformLabel(platform)} und Caruso sind im gleichen Netzwerk und der Caruso ist eingeschaltet.`;
  }

  return `Please make sure your ${formatPlatformLabel(platform)} and Caruso are on the same network and the Caruso is powered on.`;
}

async function finishSetup(language: Language, platform: TargetPlatform, selectedDevice?: WizardDevice) {
  const text = copy[language];
  const lanUrl = manager.getState().url;

  note(
    `${text.finishBody}\n\nLanguage: ${language === "de" ? "Deutsch" : "English"}\nPlatform: ${formatPlatformLabel(platform)}\nCaruso: ${selectedDevice?.friendlyName || "-"}\nLocal UI: http://127.0.0.1:${config.port}\nLAN URL: ${lanUrl}`,
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
    appLabel: "Caruso Reborn"
  });
}

async function main() {
  let language: Language = "en";
  let targetPlatform = detectDefaultTargetPlatform();

  intro(styleTitle(copy[language].title));
  note(copy[language].welcome, styleTitle(copy[language].title));

  language = await chooseLanguage(language);
  targetPlatform = await confirmDetectedPlatform(language, targetPlatform);
  note(styleMuted(copy[language].languageHint), styleTitle(copy[language].chooseLanguage));
  note(styleMuted(copy[language].platformHint), styleTitle(copy[language].osDetectedTitle));

  const networkSelection = await chooseNetwork(language);
  await storage.updateConfig({
    uiLanguage: language,
    targetPlatform,
    publicBaseUrl: networkSelection.publicBaseUrl
  });

  const selectedDevice = await chooseDevice(language, targetPlatform);
  if (selectedDevice) {
    await storage.updateConfig({
      rendererFilterName: selectedDevice.friendlyName
    });
    note(theme.success(copy[language].saved), styleTitle(copy[language].selectDevice));
  }

  const mediaAction = await showMediaStep(language);
  if (mediaAction === "dashboard") {
    await ensureServerRunning();
    openBrowser(`http://127.0.0.1:${config.port}`);
  }

  await finishSetup(language, targetPlatform, selectedDevice);
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
