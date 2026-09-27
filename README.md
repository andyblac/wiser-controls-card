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
rooms and shutters. Use the **Hubs** selector at the top to choose any combination
of detected hubs; all detected hubs are selected by default. Each room or shutter
has a separate tab. Select a tab and use the
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

Hub selection can also be configured in YAML using the Wiser config entry IDs:

```yaml
hubs:
  - 0123456789abcdef0123456789abcdef
```

Omit `hubs` to include all current and newly detected Wiser hubs.

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

The bundle is written to `dist/wiser-rooms-card.js`, with metadata in
`dist/build-info.json`. Development builds use the next patch version followed by
an incrementing `-dev.N` suffix, such as `0.1.1-dev.1`, and print the cache-busting
dashboard resource URL. The ignored `.dev-build.json` file stores the local build
counter; `package.json` remains on the stable release version. A sibling Wiser
integration repository picks up the bundle automatically when running its
development build.

## Releases

Run `npm test` and `npm run build` before publishing. Set the stable semantic
version in `package.json`, then create a matching GitHub release tag such as
`v0.1.0`. The release workflow rejects mismatched tags, verifies the version
marker and build metadata, and attaches `wiser-rooms-card.js`. The integration's
release builds download published assets from this repository. Prerelease
versions and matching tags such as `0.2.0-beta.1` / `v0.2.0-beta.1` are supported.

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

The **Features** panel uses Home Assistant's native Tile feature editor and renderer.
It provides the native add, remove, reorder and edit actions, with available features
filtered by the selected room entity. Installed custom Tile features can also be
selected when compatible. Native controls use Home Assistant's layout and styling.

Features and temperature emphasis are edited below the room tabs and apply only to
the selected room. Feature configurations are stored in `room_options` as
`native_features`, with Home Assistant's standard feature objects preserved intact.

```yaml
room_options:
  climate.lounge:
    temperature_focus: target
    features_position: inline
    native_features:
      - type: target-temperature
      - type: climate-hvac-modes
        hvac_modes: [auto, heat, off]
  climate.bedroom:
    native_features: []
```

Existing `features: [modes, temperature, advance]` settings remain supported and
are translated to native features. An empty feature list or `show_controls: false`
still hides controls. Advance schedule becomes the native climate preset feature
configured with `preset_modes: [Advance Schedule]`. Native features perform their
normal Home Assistant actions; Wiser-specific mode override cancellation used by
the earlier custom buttons is not added to native controls.

Each room also has the native-style **Features position** setting. **Bottom** keeps
features stacked below the room header; **Inline** places all configured feature
controls on one row below the unchanged room header. The setting is stored per room
as `features_position`.

The native frontend components are loaded through Home Assistant's Tile card.
Their availability and compatible features depend on the installed Home Assistant
version. The previous controls remain a loading fallback for legacy configurations.

### Secondary status

Choose **Add feature → Secondary status** on a heating room tab. Its native editor
lets you select an entity and choose/reorder state or attribute fields, as in the
Hot Water Control secondary-status feature. It defaults to the selected room's state.
Clicking the status opens more-info for that entity.

On Wiser Rooms cards, the status appears beneath the normal room status with
compact header spacing, only when configured. It does not consume a bottom feature
row. On native Tile cards it renders in the feature area. It works without Hot Water Control being
installed and can also be used as a custom feature on native Tile cards. Reload
the browser after installing the updated bundle to refresh the feature registry.

```yaml
native_features:
  - type: custom:wiser-secondary-status-feature
    entity: climate.lounge
    state_content: [current_temperature, hvac_action]
  - type: custom:wiser-next-schedule-feature
```

**Next schedule** is also registered in Home Assistant's **Add feature** menu. It
adds a calendar icon that advances the room to its next schedule period. The normal
next-schedule text stays in the Wiser room header.

### Room content

Each room tab has a **Content** panel with native composed/custom name, icon,
colour, hide-state and state-content selectors. Wiser options
control the current/target temperature (or shutter position), temperature emphasis,
and next schedule visibility. These settings are stored per entity in
`room_options`. Defaults retain the existing header layout.
