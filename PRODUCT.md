# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
A private group of players on the Orvian Minecraft server. Each one uses the launcher on their own Windows PC to keep the modpack up to date and to get into the server without manual setup. A few administrators also publish new versions of the modpack.

## Product Purpose
One click from "I want to play" to being inside the Orvian server. The launcher installs Java, Minecraft 1.20.1, Forge and the modpack. It repairs the installation, keeps itself and the pack up to date, and opens the game connected directly to the server. Success means a player never has to touch files or folders by hand.

## Positioning
This is not a general-purpose launcher. It serves a single modpack and a single server (hosted on exaroton) for a closed community. That is why it has no version or instance picker.

## Operating Context
- Electron desktop app for Windows. It has a frameless main window, a quick-access tray menu and a splash screen.
- One Microsoft (Minecraft Java) account per computer.
- The server runs on exaroton and can be in these states: sleeping, starting, online or offline.
- News comes from GitHub releases of the modpack.
- Mods are installed from Modrinth and CurseForge.

## Capabilities and Constraints
- Microsoft login and logout.
- Install, update and repair the pack, with progress shown by stage.
- Launch with Quick Play straight into the server, or play without joining it.
- Real server status: players, latency, MOTD and version.
- Manage installed mods, and search and install new ones.
- Settings for RAM, pending configs, diagnostics, folders and resetting the launcher.
- Admin-only publishing of new pack versions.
- Self-update of the launcher.
- Strict CSP: fonts must be local, and remote images are limited to Modrinth, CurseForge and minotar.
- Also: screenshot gallery, resource packs and shaders (activation via options.txt and Oculus/Iris), advanced game options (resolution, JVM arguments), Locker (skins and capes through the official Minecraft API, plus a local wardrobe), playtime tracked by the launcher, and a launcher notification history.
- Not available: friends, chat, cloud, shop, multiple accounts and multiple instances. They need a backend that does not exist; none of these may be shown with placeholder data.

## Brand Commitments
- The name is Orvian.
- The logo is a gold and steel "O" with a star and an orbit (`public/logo*.png`).
- Visual reference chosen by the user: the Behance concept "Noctra Client" (shell structure), with Orvian gold as the accent. The background is drawn in CSS (night sky and block floor); the old nebula image is no longer used.
- The interface is entirely in Spanish, with a close and direct tone.

## Evidence on Hand
- Real launcher state: phase, pack, server, news and updater.
- No testimonials or invented metrics.

## Product Principles
1. The play button is the product: its state must always be clear.
2. Never show data or controls that do not work.
3. Explain errors with a concrete action to fix them.
4. Work in the background: the player can close the window while it installs.

## Accessibility & Inclusion
- Full keyboard navigation with visible focus.
- Screen reader support for progress.
- `prefers-reduced-motion` respected.
- AA contrast.
