# Wiser Rooms Card

Compact Home Assistant dashboard controls for Wiser heating rooms and shutters,
with temperatures, schedules, shutter positions and an All off heating button.

Add **Wiser Rooms** from the dashboard card picker, or add a Manual card:

```yaml
type: custom:wiser-rooms-card
```

The card automatically discovers Wiser heating rooms and shutters across your hubs.
Heating rooms show
current and target temperatures in compact tile-style rows, with icons for
Heating, Idle, Off or Unavailable status.
Change each room's mode or target directly; click its name for the full Home
Assistant controls, including boosts. Passive rooms show their target range and
open the full controls for range adjustment.

Each heating room has schedule shortcuts:

- **Schedule mode icon:** resume its assigned schedule and cancel active overrides or boosts.
- **Calendar/arrow:** advance to the next schedule period while in Schedule mode.
- The next scheduled change and temperature appear beneath the current and target temperatures.

Schedule shortcuts are disabled when no schedule is assigned.

**Turn all heating off** sets every available heating room shown in the card to
Off. Hot water and other integrations are excluded. Unavailable rooms cannot be
controlled; failed commands are reported. To resume a room's schedule, select
Auto/Schedule for that room. Off uses Wiser's normal off mode, including its own
frost protection; it does not disconnect power to the heating system.

Use the card's visual editor to change its title and configure detected Wiser
rooms and shutters using a separate tab for each detected entity. Select a tab and use the
left/right arrows to reorder it, or the eye button to hide/show it. Hidden rooms
remain available in the editor. All rooms are shown by default,
including newly discovered rooms. These selections change card visibility only;
they do not change heating modes. You can hide every room if needed.

Set **Rooms per row** to 1–6 in the editor (default: 1). The selected
number is always used. Use the Layout tab to give the card more width when
showing multiple rooms side by side.
The equivalent YAML setting is `room_columns: 2`.

You can also choose a title and specific rooms in display order using YAML:

```yaml
type: custom:wiser-rooms-card
title: Upstairs heating
entities:
  - climate.wiser_bedroom
  - climate.wiser_office
```

With an explicit list, the master button only affects those rooms.

The integration automatically registers the card for storage-mode dashboards.
After installing the updated integration, restart Home Assistant and refresh your
browser. For YAML-managed resources, register `/wiser/wiser-rooms-card.js` as a
JavaScript module.

## Development

Use Node.js 22 or later. No npm dependencies are required.

```sh
npm test
npm run build:dev
```

The bundle is written to `dist/wiser-rooms-card.js`. A sibling Wiser integration
repository picks up this bundle automatically when running its development build.

## Releases

Run `npm test` and `npm run build` before publishing. Create a GitHub release
with a semantic version tag such as `v0.1.0`; the release workflow builds from
that tag and attaches `wiser-rooms-card.js`. The tag supplies the bundle version.
Prerelease tags such as `v0.1.0-beta.1` should be marked as prereleases on GitHub.
The integration's release builds download published assets from this repository.

## Heating and shutters

The editor's **All / Heating / Shutters** selector controls which detected Wiser
entities appear in the card and its room tabs. The default is All, which displays separate **Heating** and **Shutters** sections,
each using the configured rooms-per-row setting. Set
`room_type: heating` or `room_type: shutters` in YAML to filter the card.
Shutters show open/stop/close controls and a position input when supported
(0% closed, 100% open). Click a shutter name for Home Assistant's full controls.
**All off** only affects the heating rooms shown, never shutters or hot water.

Choose **Temperature emphasis → Current / Target** in the editor to select which
temperature uses larger, brighter text. Current is the default. Display order
stays current then target. The YAML option is `temperature_focus: target`.

Room details and the header All off button remain available when additional features are hidden.

**Additional features** in the visual editor independently enables mode/shutter buttons, temperature/position adjustment, and advance schedule. All are enabled by default. YAML: `features: [modes, temperature, advance]`; use `features: []` to hide all three. Existing `show_controls: false` configurations remain supported when `features` is omitted.

The **Features** panel provides drag handles to reorder controls, remove buttons, and **Add feature** to restore a removed control. Focus a drag handle and use Up/Down for keyboard reordering.

Features and temperature emphasis are edited below the room tabs and apply only to the selected room. They are saved in `room_options`, keyed by entity ID. Existing top-level settings remain defaults for rooms without overrides.

```yaml
room_options:
  climate.lounge:
    temperature_focus: target
    features: [temperature, modes, advance]
  climate.bedroom:
    features: []
```
