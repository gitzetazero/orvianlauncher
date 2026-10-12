---
name: Orvian Launcher
description: A warm near-black lobby lit in Noctra purple, with one turquoise door into the server.
colors:
  bg: "#080305"
  bg-raised: "#0c070a"
  surface-1: "#110b0f"
  surface-2: "#181116"
  surface-3: "#21171e"
  border: "rgba(230, 205, 225, 0.075)"
  border-strong: "rgba(230, 205, 225, 0.15)"
  text: "#e2dee1"
  text-muted: "#a89ea5"
  text-subtle: "#887c84"
  accent: "#a051a2"
  accent-hover: "#c97ccb"
  accent-press: "#8a428c"
  on-accent: "#ffffff"
  accent-soft: "rgba(176, 92, 178, 0.16)"
  accent-line: "rgba(176, 92, 178, 0.5)"
  focus: "#d28ad4"
  launch: "#22827a"
  on-launch: "#ffffff"
  info: "#8db4ee"
  success: "#4fc08d"
  warning: "#f0954a"
  danger: "#ef6b6b"
typography:
  launch:
    fontFamily: "Figtree Variable, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 800
    lineHeight: "40px"
    letterSpacing: "0.16em"
  display:
    fontFamily: "Figtree Variable, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: "40px"
    letterSpacing: "0.24em"
  headline:
    fontFamily: "Figtree Variable, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: "32px"
  title:
    fontFamily: "Figtree Variable, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "28px"
    letterSpacing: "0.3em"
  title-sm:
    fontFamily: "Figtree Variable, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "22px"
  body:
    fontFamily: "Figtree Variable, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
    fontFeature: "tnum"
  body-sm:
    fontFamily: "Figtree Variable, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "21px"
  label:
    fontFamily: "Figtree Variable, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: "16px"
    letterSpacing: "0.12em"
  mono:
    fontFamily: "ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "12px"
rounded:
  xs: "4px"
  sm: "6px"
  md: "10px"
  lg: "14px"
  pill: "999px"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-5: "20px"
  space-6: "24px"
  space-8: "32px"
  space-10: "40px"
  space-12: "48px"
  space-16: "64px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.on-accent}"
  button-primary-active:
    backgroundColor: "{colors.accent-press}"
  button-secondary:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "36px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-3}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "36px"
  button-ghost-hover:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
  button-danger:
    backgroundColor: "rgba(239, 107, 107, 0.13)"
    textColor: "#ffb3b3"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "36px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.sm}"
    size: "34px"
  input:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "38px"
  search-input:
    backgroundColor: "{colors.surface-1}"
    rounded: "{rounded.md}"
    padding: "0 36px"
    height: "38px"
  chip:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "28px"
  badge:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.xs}"
    padding: "0 8px"
    height: "20px"
  badge-accent:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-hover}"
  rail-item:
    backgroundColor: "transparent"
    textColor: "{colors.text-subtle}"
    rounded: "{rounded.md}"
    size: "44px"
  rail-item-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
  launch-ready:
    backgroundColor: "{colors.launch}"
    textColor: "{colors.on-launch}"
    typography: "{typography.launch}"
    rounded: "{rounded.sm}"
    padding: "16px 24px 12px"
    height: "84px"
  launch-login:
    backgroundColor: "#ffffff"
    textColor: "#121318"
  launch-working:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.text}"
  launch-running:
    backgroundColor: "rgba(79, 192, 141, 0.16)"
    textColor: "#bff0d8"
  launch-idle:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.text-muted}"
  news-card:
    backgroundColor: "{colors.surface-1}"
    rounded: "{rounded.md}"
    padding: "32px 20px 16px"
  panel:
    backgroundColor: "{colors.surface-1}"
    rounded: "{rounded.lg}"
    padding: "24px"
  dialog:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "24px"
  side-row:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "8px"
    height: "48px"
  tab:
    textColor: "{colors.text-subtle}"
    height: "40px"
---

# Design System: Orvian Launcher

## Overview

**Creative North Star: "The Night Lobby"**

Orvian is the lobby you pass through before entering the world: a warm near-black room (an icon rail on the left, a slim top bar, a tabbed side column on the right) lit by Noctra purple lamps, with one turquoise door. The hero and the release cards hang the player's own latest screenshots like artwork, darkened and washed in purple, with a dark side so the text reads. When there are no screenshots, the room falls back to a CSS night sky (a purple glow at the horizon, steel overhead, a drifting block-grid floor in perspective).

The density is that of a desktop tool: 13–14px text, 36px controls, hairline borders, and short, sure transitions (120–260ms, ease-out). Purple carries the interface (selection, primary buttons, flags, focus). Turquoise is spent only on the launch block, so the product's one essential control is the coolest, brightest thing on screen. Information is steel blue.

Voice comes from spaced capitals: section labels, view titles, the launch word, and the sign-in wordmark all use uppercase with wide tracking (0.12–0.3em), and body copy stays in sentence case.

**Key Characteristics:**
- Warm near-black surfaces with a plum cast (#080305 up to #21171e), all in the same hue.
- Noctra purple is the interface accent. Turquoise belongs to the launch block alone.
- Steel blue carries information: links, server and info icons, the overhead sky glow.
- Figtree Variable throughout, bundled locally, with tabular numerals.
- Spaced-capital labels and titles.
- 1px warm translucent hairlines instead of heavy dividers.
- The player's captures as hero and card art under a purple wash, with a CSS scene as the fallback.
- The launch block changes tone with launcher state.

## Colors

A warm plum-black ground with stepped surfaces, one purple for the interface, one turquoise for the launch, and steel blue for information. Status hues appear only as small signals.

### Primary
- **Noctra Orchid** (accent): primary buttons (as the 180deg gradient #a051a2 → #a051a2), the active rail item and its edge light, the selected tab underline, switches when on, the release flag, text buttons, the input caret, list markers, and the purple washes over screenshots and the scene. Hover lifts it to **Lilac Lamp** (accent-hover); press settles to **Deep Orchid** (accent-press).
- **Orchid Wash** (accent-soft) and **Orchid Hairline** (accent-line): the translucent pair that marks selection without filling it. Active rail and settings items, input focus ring, chip hover border, top-bar chips.
- **Focus Lilac** (focus): the 2px focus outline everywhere.

### Secondary
- **Lagoon Turquoise** (launch): the ready launch block only, as the gradient #2e9a90 → #22827a → #1b6e67 with its own turquoise glow and white ink (on-launch).

### Tertiary
- **Logo Stone Steel** (info): links, server and info icons, info notices, the steel news-card variant, and the overhead glow in the CSS scene (a deeper rgba(112, 150, 222, …) that only the scene uses).
- **Status hues**: success green (installing fill, running tone, online pulse dot), warning orange (server waking, ember news-card variant), danger red (errors, destructive buttons). Each has a 12–13% translucent companion for backgrounds. They are signals, never decoration.

### Neutral
- **Plum Black** (bg): the app ground, input fill, segmented-control well, and the bottom of every screenshot wash.
- **Raised Plum** (bg-raised): the rail, top bar, side column and sign-in panel, the shell's frame.
- **Surface 1 / 2 / 3** (surface-1, surface-2, surface-3): cards, panels and dialogs on 1; hover fills and secondary buttons on 2; badges, tooltips and idle launch on 3.
- **Hairline / Strong Hairline** (border, border-strong): warm-white lines at 7.5% and 15% for every divider and outline.
- **Bone / Mauve Mist / Dusk Mauve text** (text, text-muted, text-subtle): primary copy, secondary copy, and tertiary meta, inactive navigation and placeholders.

### Named Rules
**The One Door Rule.** Turquoise appears only on the launch block. Nothing else on screen may use it, so the way into the server is never in doubt.

**The Orchid Is the Interface Rule.** Purple means "selected" or "act" everywhere except the launch. Use the wash and hairline for selection and the full gradient only on primary buttons.

**The Steel Is Information Rule.** Steel blue labels and informs. It never fills a button.

**The Warm Ladder Rule.** Surfaces get lighter in small steps from bg to surface-3 and keep the same plum hue. Use a higher step, not a new colour, to bring a surface forward.

## Typography

**Display Font:** Figtree Variable (with Segoe UI Variable Text, Segoe UI, system-ui)
**Body Font:** Figtree Variable (same stack)
**Label/Mono Font:** ui-monospace, Cascadia Mono, Consolas, used only for code, tokens and crash codes

**Character:** A friendly geometric sans that handles both the loud and the quiet registers. Weight (400 to 800) and tracking, not a second family, separate the launch word from body copy. Numbers are tabular everywhere.

### Hierarchy
- **Launch** (800, 34px, 40px, 0.16em, uppercase): the word on the launch block only. Drops to 22px with 0.08–0.12em for long labels and the Microsoft sign-in tone.
- **Display** (700, 32px, 40px, 0.24em, uppercase): the sign-in wordmark.
- **Headline** (600, 24px, 32px): the home greeting.
- **Title** (600, 20px, 28px, 0.3em, uppercase): view titles. Dialog titles use the same size and weight in sentence case without tracking.
- **Title small** (600–700, 16px, 22px): settings section titles, side-column tabs, news card titles (the news titles are uppercase with 0.04em).
- **Body** (400, 14px, 20px): default text. Paragraphs cap at 65ch.
- **Body small** (400, 13px, 21px): leads, dialog descriptions, control text.
- **Label** (700, 11px, 16px, 0.12em, uppercase): section labels, which are real h2 headings that name their block, plus the launch bar's "more options" toggle and the release flag (0.1em).

### Named Rules
**The Spaced Capitals Rule.** Uppercase always comes with tracking: 0.12em for labels, 0.16em for the launch word, 0.24–0.3em for titles and the wordmark. Sentence-case text is never tracked out.

**The Label Is the Heading Rule.** A spaced-capital label names its own block as that block's heading. It never sits above another heading as an eyebrow.

## Layout

The shell is a fixed grid: a 72px icon rail, then a column with a 40px top bar over a scrolling main area. Home splits main into a fluid column and a 304px sticky side column. The hero runs a three-part launch row (the launch block at 320–420px, a versions block, a grid of shortcut tiles) above a two-up news grid. Content views centre at 980px (1180px when wide) with 32px / 40px / 48px padding. Settings uses a 210px sticky nav beside a section column capped at 760px. The sign-in screen splits into a 42% panel and an artwork half.

Spacing follows a 4px base (4, 8, 12, 16, 20, 24, 32, 40, 48, 64). Gaps inside controls are 8px, gaps between blocks 24–32px, and page gutters 40px. The window minimum is 1120 × 720. Below 1360px the launch row and settings nav tighten; below 1200px the news grid collapses to one column and gutters drop to 32px.

## Elevation & Depth

Depth comes mostly from tonal layering plus hairlines. Surfaces are flat at rest. Shadows are reserved for things that float above the shell (dialogs, menus, tooltips) and for light: the turquoise glow under the launch block, the purple glow on primary buttons, green while installing or running, and drop-shadow halos on the logo. Lit fills carry a 1px inset top highlight (rgba(255,255,255,0.28–0.3)). Screenshot art sits behind a directional plum gradient (dark on the text side, near-clear on the far side) and a purple radial wash.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 1px 0 rgba(255,255,255,0.04) inset, 0 10px 28px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.4)`): rail tooltips.
- **Pop** (`box-shadow: 0 24px 64px rgba(0,0,0,0.6), 0 4px 14px rgba(0,0,0,0.45)`): dialogs, menus, notification panel.
- **Launch Glow** (`box-shadow: 0 12px 36px rgba(70,188,177,0.28), 0 2px 8px rgba(70,188,177,0.2)`): the ready launch block.
- **Orchid Glow** (`box-shadow: 0 10px 34px rgba(176,92,178,0.3), 0 2px 8px rgba(176,92,178,0.2)`): primary buttons on hover.
- **Tone Glow** (`0 10px 34px` in green at 14–16%): the launch block while installing or running.

### Named Rules
**The Glow Is Light Rule.** A coloured shadow is light from a turquoise, purple or green source, never a decorative offset. Neutral elevation shadows are soft and black, and only for overlays.

## Shapes

Corners are gently rounded and grow with the size of the container: 4px for badges and segments, 6px for buttons, inputs, the launch block and rows, 10px for rail items, cards, list frames and search, 14px for dialogs and settings panels. Pills (999px) are reserved for chips, switches and top-bar chips. Every outline is a 1px translucent hairline. The launch block is one shape split in two: the play face (rounded top corners) above a dark launch bar (rounded bottom corners), with one shared tone edge.

## Components

### Buttons
Compact and lit from above.
- **Shape:** gently rounded (6px), 36px tall (30px small, 46px large), 600 weight.
- **Primary:** the orchid gradient with a pale lilac edge, white ink, an inset top highlight and a faint purple glow. Hover flattens to accent-hover and adds the full Orchid Glow; press settles to accent-press and nudges down 1px.
- **Secondary:** surface-2 with a strong hairline. Hover goes to surface-3.
- **Ghost:** transparent muted text. Hover fills surface-2.
- **Danger:** a red wash with a red hairline and pale red text, never a solid red fill.
- **Icon button:** a 34px square, transparent. Hover fills surface-2.
- **Disabled:** 45% opacity.

### Chips
- **Style:** a pill, 28px, surface-1 with a hairline, muted 12px semibold text.
- **State:** hover turns the border to the orchid hairline and the text to bone. Top-bar chips are orchid wash with an orchid hairline, or surface-2 when quiet.

### Cards / Containers
- **Corner Style:** 10px (cards, list frames), 14px (settings panels, dialogs).
- **Background:** surface-1 on the bg ground.
- **Shadow Strategy:** none at rest (see Elevation).
- **Border:** 1px hairline, which strengthens on hover.
- **Internal Padding:** 24px for panels, 12px 16px for list rows (64px minimum).

### Inputs / Fields
- **Style:** a 38px field on the bg ground (darker than its panel) with a strong hairline and 6px corners. Placeholders use text-subtle. Search fields sit on surface-1 with 10px corners and an inset icon.
- **Focus:** the border turns to the orchid hairline and a 3px orchid wash ring appears. The global focus ring is a 2px Focus Lilac outline offset by 2px.
- **Error / Disabled:** a red border at 60%; 50% opacity.

### Navigation
- **Rail:** 44px icon squares (10px corners) in dusk mauve. Hover fills surface-2. The active item takes an orchid wash, an orchid hairline and an orchid icon, plus a 3px orchid light on the rail's left edge. Labels appear as tooltips on hover and focus.
- **Tabs:** 13px semibold dusk text with a 2px orchid underline that scales in on selection.
- **Side tabs:** 16px bold words separated by hairline ticks. The selected tab is bone and the others are dusk.
- **Segmented control:** a bg well with surface-3 for the pressed segment.

### Launch Block (signature)
The product's one essential control: an 84px face carrying the uppercase launch word and a one-line sub-status, sitting on a 30px dark bar with a "Más opciones" toggle. Its tone follows launcher state:
- **Ready:** turquoise gradient with Launch Glow. A light sheen crosses it on hover.
- **Login:** a white gradient with near-black text and the Microsoft mark.
- **Working:** surface-3 with a green edge, and a green fill that grows left to right across the face as installation progresses, plus a 3px green progress line.
- **Running:** a translucent green wash with mint text.
- **Busy / Idle:** surface-3 with muted text and no glow. An orchid progress line marks busy.

### News Card (signature)
Each release is a 168px-minimum tile on surface-1. With a capture available, the card shows it at 75% brightness behind a plum gradient that runs from 96% on the text side to 25% on the far side, and the capture zooms to 1.04× on hover. Without one, a radial glow rises from the bottom-right corner (orchid, steel or ember variant). Either way the version number is set huge (96px, 800) as faint watermark art. A flag in the top-left corner marks the new release (orchid) or the installed one (surface-3).

### Hero Artwork
The player's latest capture fills the hero at 70% brightness, under a left-to-right plum gradient, a purple radial wash and a fade into bg at the bottom. The sign-in half uses a lighter wash (85% brightness) so the capture reads. With no capture, the CSS night sky and block floor take its place.

### Side Rows
48px rows with a 34px icon square, a 13px bold title and an 11px sub-line coloured by tone. Groups are headed by a status dot that pulses green when the server is online and breathes orange while it wakes.

### Sign-in Screen
Without an account the launcher is only its sign-in screen and the window bar: no rail, no side column and no "Más opciones" bar. The launch block stands alone (sign-in tone) above a "Ver código en GitHub" secondary button. The right half holds the hero artwork and the latest release card.

### 3D Skin Preview (Locker)
The current skin stands in 3D (skinview3d, loaded only when the Locker opens) on the lit floor of the "Skin actual" panel. Drag orbits the camera (polar angle limited to 0.12π–0.82π), the wheel zooms; panning is off. A row of icon buttons turns the player 45° either way and toggles auto-rotation, walking and stillness (pressed state: orchid wash); still by default under reduced motion. The canvas fades in when ready.

### Skin Editor
Three columns on the warm ladder, after Crafty.gg's editor: Origen and Color on the left, the Skin stage in the centre (sticky; 3D, Plano and 2D views on a dotted well with an orchid floor glow), Herramientas and Capas on the right. Each card has a 34px orchid icon tile, a 16px title and an 11px lead; groups inside are headed by 11px spaced capitals with an orchid icon. The active tool is an orchid gradient tile. A six-step guided tour dims the page (72% plum veil) around the panel it explains and places a 360px card beside it with progress dots; it opens once and again from "Ver el tutorial".

### Skin Cards (Locker)
A pixel-rendered skin on a bg well with an orchid floor glow, a 13px name, an 11px meta line, and a row with a small primary action plus icon actions. Wardrobe cards carry a favourite star top-left. History cards carry a history mark instead and get an orchid hairline when they are the skin worn now ("Puesta"). Legacy 64×32 overlays are drawn only when they hold a transparent pixel, the same rule Minecraft follows.

### Official Packs
Resource packs and shaders shipped by the modpack show an info badge "Del modpack" and a locked pill ("Activo" or "Oficial") where the switch would be, with no delete action.

## Do's and Don'ts

### Do:
- **Do** keep turquoise for the launch block alone, and purple for every other selected or actionable element.
- **Do** build depth by stepping up the warm surface ladder (bg → surface-3) and outlining with 1px hairlines at 7.5% or 15%.
- **Do** set section labels at 11px / 700 / 0.12em uppercase, and view titles at 20px / 600 / 0.3em uppercase.
- **Do** put the player's own captures under a plum gradient and a purple wash before setting text on them, and fall back to the CSS scene when there are none.
- **Do** let the launch block show state through tone: turquoise ready, white sign-in, green filling, green running, grey waiting.
- **Do** use ease-out at 120–260ms for state changes, and respect prefers-reduced-motion.

### Don't:
- **Don't** use turquoise anywhere outside the launch block.
- **Don't** fill a button with steel blue or with a status colour. Info stays informational and danger stays a wash.
- **Don't** put a spaced-capital label above a heading as an eyebrow. A label is the heading of its own block.
- **Don't** track out sentence-case text, or set uppercase without tracking.
- **Don't** use hard offset shadows or neutral drop shadows on resting cards. Shadows are for overlays and coloured light.
- **Don't** introduce a second typeface. Weight and tracking carry the hierarchy.
