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
```

### Room content

Each room tab has a **Content** panel with native composed/custom name, icon,
colour, hide-state and state-content selectors. Wiser options
control the current/target temperature (or shutter position), temperature emphasis,
and next schedule visibility. These settings are stored per entity in
`room_options`. Defaults retain the existing header layout.
