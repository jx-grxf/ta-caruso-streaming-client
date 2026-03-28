# Caruso Bridge

Desktop app and local DLNA/UPnP bridge for first-generation T+A Caruso devices whose original internet radio path is no longer usable.

## Overview

Caruso Bridge turns your Mac into a browsable media source and a control surface:

- exposes a local `MediaServer:1` over SSDP/DLNA so the Caruso can browse your MacBook
- provides a `TuneIn > Sender` tree with persistent station favorites
- supports local music folders and serves audio files directly to the Caruso
- offers a dark web UI with renderer discovery, live device status, station search and library management
- wraps the service in an Electron tray app for quick open/start/stop actions

## Current Features

- TuneIn station search through TuneIn OPML endpoints
- persistent station list for the Caruso UPnP browser
- direct `AVTransport` playback for TuneIn and local files
- local file scan for `mp3`, `flac`, `m4a`, `aac`, `wav`, `ogg`, `opus`, `aiff`, `alac`
- German / English UI switch
- live renderer status polling
- SSDP multi-interface announcements for older DLNA clients

## Architecture

- [`src/app.ts`](/Users/johannesgrof/Projects/Private/Private-Projects/T+A%20Internet%20Steaming%20Client/src/app.ts)
  Fastify app, REST API, UPnP XML endpoints, stream proxy routes
- [`src/upnp/media-server.ts`](/Users/johannesgrof/Projects/Private/Private-Projects/T+A%20Internet%20Steaming%20Client/src/upnp/media-server.ts)
  MediaServer description, ContentDirectory browse tree, SSDP announcements
- [`src/upnp/renderer-control.ts`](/Users/johannesgrof/Projects/Private/Private-Projects/T+A%20Internet%20Steaming%20Client/src/upnp/renderer-control.ts)
  `AVTransport` SOAP control and renderer status polling
- [`src/storage.ts`](/Users/johannesgrof/Projects/Private/Private-Projects/T+A%20Internet%20Steaming%20Client/src/storage.ts)
  persisted app config, library folders and TuneIn favorites
- [`ui/index.html`](/Users/johannesgrof/Projects/Private/Private-Projects/T+A%20Internet%20Steaming%20Client/ui/index.html)
  dark UI shell
- [`ui/app.js`](/Users/johannesgrof/Projects/Private/Private-Projects/T+A%20Internet%20Steaming%20Client/ui/app.js)
  UI logic, i18n, polling and actions
- [`electron/main.ts`](/Users/johannesgrof/Projects/Private/Private-Projects/T+A%20Internet%20Steaming%20Client/electron/main.ts)
  desktop shell, tray menu and native folder picker

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

The most important setting is `PUBLIC_BASE_URL`. The Caruso must be able to reach your Mac on a real LAN address, not `127.0.0.1`.

```bash
PORT=3847
HOST=0.0.0.0
PUBLIC_BASE_URL=http://192.168.x.y:3847
CARUSO_FRIENDLY_NAME=Caruso
DEEZER_ARL=
DATA_DIR=/custom/path/for/app-data
```

## User Flow

1. Start the desktop app or local server.
2. Open the web UI.
3. Select the T+A Caruso renderer under `Caruso / Renderer`.
4. Search TuneIn and add stations to the Caruso station list.
5. On the Caruso browse `TuneIn > Sender`.
6. Optionally add local folders and browse them under `Lokale Musik`.

## Verification

Verified locally with:

- `npm run check`
- `npm run build`
- UPnP SSDP discovery on the local network
- SOAP `Browse` against `ContentDirectory`
- direct TuneIn playback to a detected T+A Caruso renderer

## Known Gaps

- Deezer is still only scaffolded as a future provider
- the live status block reflects renderer state and last bridged source, but not full codec introspection from the device
- some old renderers are picky about MIME types and metadata, so compatibility work may continue per device behavior
