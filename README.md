# Wiser Rooms Card

A compact Home Assistant dashboard card for Wiser heating, shutters, lights,
dimmers and smart plugs. It automatically discovers supported Wiser entities and
provides room controls, schedule information and device-specific bulk actions.

## Features

- Heating modes, target temperatures, schedules, boosts and overrides
- Shutter open, stop, close and position controls
- Light, dimmer and smart-plug controls
- Separate sections and bulk actions for each selected device type
- Visual editor with per-device or per-type Master configuration
- Native Home Assistant Tile features, interactions, icons and state displays
- Multiple Wiser hub support
- English, German and French localisation

## Quick start

Install the card, restart Home Assistant and refresh the browser. Then add
**Wiser Rooms** from the dashboard card picker.

For a Manual card, use:

```yaml
type: custom:wiser-rooms-card
```

The card discovers supported entities automatically. Use the visual editor to
select hubs and device types, choose the number of devices per row, hide or
reorder devices and configure content, interactions and features.

For YAML-managed resources, register the following URL as a JavaScript module:

```text
/wiser/wiser-rooms-card.js
```

## Documentation

Full installation, configuration and feature documentation is available in the
[Wiser Rooms Card wiki](https://github.com/andyblac/wiser-rooms-card/wiki).

- [Installation](https://github.com/andyblac/wiser-rooms-card/wiki/Installation)
- [Visual editor](https://github.com/andyblac/wiser-rooms-card/wiki/Visual-Editor)
- [Supported devices](https://github.com/andyblac/wiser-rooms-card/wiki/Supported-Devices)
- [Features](https://github.com/andyblac/wiser-rooms-card/wiki/Features)
- [YAML configuration](https://github.com/andyblac/wiser-rooms-card/wiki/YAML-Configuration)
- [Troubleshooting](https://github.com/andyblac/wiser-rooms-card/wiki/Troubleshooting)
- [Development and releases](https://github.com/andyblac/wiser-rooms-card/wiki/Development-and-Releases)

## Support

[Report an issue](https://github.com/andyblac/wiser-rooms-card/issues) and include
the card version, Home Assistant version, relevant YAML and any browser-console
error.

## License

[MIT](LICENSE)
