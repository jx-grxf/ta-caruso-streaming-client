# T+A Caruso Streaming Bridge

A local desktop app and UPnP/DLNA bridge for first-generation T+A Caruso systems.

It brings back a practical internet radio workflow for devices whose original native service path is no longer reliable, while also exposing local music from your Mac as a browsable media source.

## Why This Exists

Older Caruso units can still browse UPnP/DLNA media servers on the local network, even if their original internet radio integration is no longer useful.

This project turns your Mac into:

- a browsable UPnP media server for the Caruso
- a web dashboard for station search and device status
- a local audio bridge for internet radio streams
- a small desktop tray app for quick control

## Features

- TuneIn search and browse integration
- Radio Browser search for alternative and higher-bitrate radio streams
- persistent station list that appears on the Caruso inside the UPnP tree
- local music library support from user-selected folders
- direct playback controls from the dashboard for compatible renderers
- German and English UI
- live renderer status and server metrics
- automatic network rebinding when switching between LAN and Wi-Fi
- Electron tray app with quick open/start/stop actions

## How It Works

The bridge announces itself as a UPnP/DLNA media server on your local network.

On the Caruso, you browse the bridge as a network media source and access:

- `TuneIn`
- `TuneIn > Sender`
- `TuneIn > Browse`
- `Local Music`

Stations added from the dashboard are resolved to their real stream URLs and stored locally, so they appear in the browsable station list on the device.

## Screenshot

The app ships with a dark dashboard optimized for both desktop and mobile browsers, including Safari on iPhone.

## Requirements

- macOS
- Node.js 20 or newer
- a T+A Caruso on the same local network

## Quick Start

```bash
npm install
cp .env.example .env
npm run build
npm run desktop
```

For server-only development:

```bash
npm run dev
```

## Configuration

The bridge usually detects the correct local network address automatically. You can still override it if needed.

Example `.env`:

```bash
PORT=3847
HOST=0.0.0.0
PUBLIC_BASE_URL=http://192.168.x.y:3847
CARUSO_FRIENDLY_NAME=Caruso on MacBook
DEEZER_ARL=
DATA_DIR=/custom/path/for/app-data
```

Important notes:

- `PUBLIC_BASE_URL` must be reachable by the Caruso on your LAN
- the desktop UI itself is loaded locally via `127.0.0.1`
- when your Mac changes from LAN to Wi-Fi, the bridge rebinds automatically

## Usage

1. Start the app.
2. Open the dashboard.
3. Let the bridge discover your Caruso renderer.
4. Search for stations with TuneIn or Radio Browser.
5. Add stations to the saved station list.
6. On the Caruso, open the UPnP/DLNA media source and browse the bridge.
7. Open `TuneIn > Sender` to play saved stations.
8. Add local music folders if you also want file-based playback.

## Project Structure

- `src/app.ts`: Fastify server, REST API, stream routes, UI hosting
- `src/upnp/media-server.ts`: DLNA/UPnP MediaServer implementation
- `src/upnp/renderer-control.ts`: renderer discovery, SOAP transport, status polling
- `src/providers/tunein.ts`: TuneIn search, browse and stream resolution
- `src/providers/radio-browser.ts`: Radio Browser integration
- `src/storage.ts`: persisted settings, folders and saved stations
- `src/server-manager.ts`: service lifecycle and network rebinding
- `electron/main.ts`: Electron shell and tray integration
- `ui/`: dashboard frontend

## Troubleshooting

### The Caruso cannot see the bridge

- make sure the Mac and Caruso are on the same local network
- reopen the network media source on the Caruso
- wait a few seconds after switching between LAN and Wi-Fi

### A station can play now but fails when saving

Some stations respond differently to `HEAD`, playlist URLs, redirects, or malformed upstream servers. The bridge already includes multiple resolution fallbacks, but internet radio is messy and provider behavior changes over time.

### A station shows buffering or format errors

That usually means the upstream station is using a playlist wrapper, a temporary HTML redirect, an unsupported codec variant, or a flaky origin server.

### Why use both TuneIn and Radio Browser?

- TuneIn is useful for familiar catalog results and browse trees
- Radio Browser is useful for alternative direct stream URLs, bitrate sorting, and compatibility hunting

## Current Scope

Implemented and usable today:

- internet radio search
- saved station list for the Caruso
- local music folders
- dashboard status and controls
- desktop tray app

Planned or still incomplete:

- Deezer integration
- deeper stream validation badges per station
- richer metadata extraction from currently playing streams

## Development

Useful commands:

```bash
npm run check
npm run build
npm run dev
npm run desktop
```

## License

MIT

Copyright (c) Johannes Grof
