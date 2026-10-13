/* Bundled before the card by scripts/build.mjs. */
(() => {
  const languages = __WISER_ROOMS_TRANSLATIONS__;

  // Home Assistant owns generic UI and entity-state wording. Local files only
  // provide a fallback and translations for Wiser-specific concepts.
  const nativeKeys = {
    all:"ui.components.selectors.automation_behavior.trigger.options.all.label",
    show:"ui.common.show",
    name:"ui.common.name",
    unavailable:"state.default.unavailable",
    on:"component.switch.entity_component._.state.on",
    off:"component.switch.entity_component._.state.off",
    current:"ui.card.climate.currently",
    target:"ui.card.climate.target",
    title:"ui.panel.lovelace.editor.card.generic.title",
    entity:"ui.panel.lovelace.editor.card.generic.entity",
    features:"ui.panel.lovelace.editor.card.generic.features",
    features_position:"ui.panel.lovelace.editor.card.tile.features_position",
    bottom:"ui.panel.lovelace.editor.card.tile.features_position_options.bottom",
    inline:"ui.panel.lovelace.editor.card.tile.features_position_options.inline",
    state_content:"ui.panel.lovelace.editor.card.tile.state_content",
    icon:"ui.panel.lovelace.editor.card.generic.icon",
    color:"ui.panel.lovelace.editor.card.tile.color",
    hide_state:"ui.panel.lovelace.editor.card.tile.hide_state",
    content:"ui.panel.lovelace.editor.card.generic.content",
    interactions:"ui.panel.lovelace.editor.card.generic.interactions",
    heating:"component.climate.entity_component._.state_attributes.hvac_action.state.heating",
    cooling:"component.climate.entity_component._.state_attributes.hvac_action.state.cooling",
    cool:"component.climate.entity_component._.state.cool",
    idle:"component.climate.entity_component._.state_attributes.hvac_action.state.idle",
    lights:"panel.light",
    shutters:"ui.panel.lovelace.editor.features.types.area-controls.controls_options.cover-shutter",
    open:"component.cover.entity_component._.state.open",
    closed:"component.cover.entity_component._.state.closed",
    opening:"component.cover.entity_component._.state.opening",
    closing:"component.cover.entity_component._.state.closing",
    next:"ui.common.next",
    schedule:"ui.panel.config.helpers.types.schedule",
    manual:"ui.panel.lovelace.editor.card.generic.manual",
    hubs:"ui.panel.config.integrations.integration_page.entries_hub",
    panel_title:"ui.panel.config.devices.entities.control",
    panel_overview:"panel.home",
    panel_devices:"ui.panel.config.devices.caption",
    panel_detail_control:"ui.dialogs.entity_registry.control",
    panel_detail_heating:"component.climate.entity_component._.state_attributes.hvac_action.state.heating",
    panel_detail_light:"ui.panel.lovelace.editor.card.light.name",
    panel_detail_shutter:"ui.dialogs.entity_registry.editor.device_classes.cover.shutter",
    panel_detail_states:"ui.panel.config.tools.tabs.states.title",
    panel_detail_settings:"ui.dialogs.entity_registry.settings",
    panel_detail_activity:"ui.dialogs.more_info_control.logbook",
    panel_power:"ui.dialogs.entity_registry.editor.device_classes.binary_sensor.power",
    panel_schedule:"ui.panel.config.helpers.types.schedule",
    panel_modes:"ui.card.alarm_control_panel.modes_label",
    panel_device_firmware:"ui.panel.config.devices.data_table.firmware_version",
    panel_device_manufacturer:"ui.panel.config.devices.data_table.manufacturer",
    panel_device_model:"ui.panel.config.devices.data_table.model",
    panel_device_serial:"ui.panel.config.serial.fields.serial_number",
    panel_cancel:"ui.common.cancel",
    panel_save:"ui.common.save",
    panel_retry:"ui.common.retry",
    passive_mode:"component.wiser.entity.switch.passive_mode.name",
  };

  const languageFor = hass => {
    const language = (hass?.locale?.language || hass?.language ||
      (typeof document !== "undefined" ? document.documentElement?.lang : "") || "en-US")
      .replace(/_/g,"-").toLowerCase();
    if (language === "en-gb") return "en-GB";
    if (language === "de" || language.startsWith("de-")) return "de";
    if (language === "fr" || language.startsWith("fr-")) return "fr";
    if (language === "hu" || language.startsWith("hu-")) return "hu";
    return "en-US";
  };

  const localize = (hass, key, values = {}) => {
    const nativeKey = nativeKeys[key];
    const native = nativeKey && hass?.localize?.(nativeKey);
    const language = languageFor(hass);
    const fallback = languages[language]?.[key] || languages["en-US"]?.[key] || key;
    const hasFallback = Object.hasOwn(languages[language] || {}, key)
      || Object.hasOwn(languages["en-US"] || {}, key);
    const value = nativeKey
      ? native && native !== nativeKey ? native : hasFallback ? fallback : ""
      : fallback;
    return value.replace(/\{(\w+)\}/g, (token, name) => String(values[name] ?? token));
  };

  window.WiserRoomsLocalize = {languageFor, localize};
})();
