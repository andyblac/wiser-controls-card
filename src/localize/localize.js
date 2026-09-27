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
    idle:"component.climate.entity_component._.state_attributes.hvac_action.state.idle",
    lights:"panel.light",
    open:"component.cover.entity_component._.state.open",
    closed:"component.cover.entity_component._.state.closed",
    opening:"component.cover.entity_component._.state.opening",
    closing:"component.cover.entity_component._.state.closing",
    next:"ui.common.next",
  };

  const languageFor = hass => {
    const language = (hass?.locale?.language || hass?.language ||
      (typeof document !== "undefined" ? document.documentElement?.lang : "") || "en-US")
      .replace(/_/g,"-").toLowerCase();
    if (language === "en-gb") return "en-GB";
    if (language === "de" || language.startsWith("de-")) return "de";
    if (language === "fr" || language.startsWith("fr-")) return "fr";
    return "en-US";
  };

  const localize = (hass, key, values = {}) => {
    const nativeKey = nativeKeys[key];
    const native = nativeKey && hass?.localize?.(nativeKey);
    const language = languageFor(hass);
    const fallback = languages[language]?.[key] || languages["en-US"]?.[key] || key;
    const value = nativeKey ? native && native !== nativeKey ? native : "" : fallback;
    return value.replace(/\{(\w+)\}/g, (token, name) => String(values[name] ?? token));
  };

  window.WiserRoomsLocalize = {languageFor, localize};
})();
