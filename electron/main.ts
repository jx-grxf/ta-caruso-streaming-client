import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, shell } from "electron";
import { config } from "../src/config.js";
import { createServerManager } from "../src/server-manager.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const preloadPath = path.resolve(currentDir, "../../electron/preload.cjs");
const dataDir = path.join(app.getPath("userData"), "data");
const serverManager = createServerManager({ dataDir });
const desktopUiUrl = `http://127.0.0.1:${config.port}`;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function getTrayIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
      <rect x="2" y="2" width="16" height="16" rx="4" fill="#1f2937"/>
      <path d="M6 13.5V6.5h2.2c2.5 0 4.1 1.2 4.1 3.5S10.7 13.5 8.2 13.5H6zm2-1.7h.2c1.4 0 2.1-.5 2.1-1.8 0-1.4-.7-1.8-2.1-1.8H8v3.6z" fill="#f59e0b"/>
    </svg>
  `;

  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}

async function ensureServerRunning() {
  await serverManager.start();
}

function getServerUrl() {
  return serverManager.getState().url;
}

async function createMainWindow() {
  await ensureServerRunning();

  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1220,
    height: 860,
    minWidth: 980,
    minHeight: 720,
    title: "Caruso Bridge",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(desktopUiUrl);
  return mainWindow;
}

function rebuildTray() {
  if (!tray) {
    tray = new Tray(getTrayIcon());
  }

  const state = serverManager.getState();
  const menu = Menu.buildFromTemplate([
    {
      label: "UI oeffnen",
      click: () => {
        void createMainWindow();
      }
    },
    {
      label: state.running ? "Server stoppen" : "Server starten",
      click: async () => {
        if (state.running) {
          await serverManager.stop();
        } else {
          await serverManager.start();
        }

        if (mainWindow && !mainWindow.isDestroyed()) {
          if (serverManager.getState().running) {
            await mainWindow.loadURL(desktopUiUrl);
          }
        }

        rebuildTray();
      }
    },
    {
      label: "Im Browser oeffnen",
      click: async () => {
        await ensureServerRunning();
        await shell.openExternal(getServerUrl());
      }
    },
    { type: "separator" },
    {
      label: "Beenden",
      click: async () => {
        await serverManager.stop();
        app.quit();
      }
    }
  ]);

  tray.setToolTip(`Caruso Bridge${state.running ? " aktiv" : " gestoppt"}`);
  tray.setContextMenu(menu);
  tray.on("double-click", () => {
    void createMainWindow();
  });
}

app.on("window-all-closed", () => {
  // Keep the app alive in the menu bar/tray when all windows are closed.
});

app.whenReady().then(async () => {
  await ensureServerRunning();
  rebuildTray();
  await createMainWindow();
});

ipcMain.handle("desktop:getServerState", async () => serverManager.getState());
ipcMain.handle("desktop:startServer", async () => {
  await serverManager.start();
  rebuildTray();
  return serverManager.getState();
});
ipcMain.handle("desktop:stopServer", async () => {
  await serverManager.stop();
  rebuildTray();
  return serverManager.getState();
});
ipcMain.handle("desktop:openBrowser", async () => {
  await ensureServerRunning();
  await shell.openExternal(getServerUrl());
  return true;
});
ipcMain.handle("desktop:chooseFolder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});
