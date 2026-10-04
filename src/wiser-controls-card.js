/* Wiser controls dashboard card. Bundled with the integration. */
(() => {
  const CARD_VERSION = "__WISER_CARD_VERSION__";
  const {localize:text, languageFor} = window.WiserRoomsLocalize;
  const DEVICE_TYPES = ["heating", "shutters", "lights", "plugs"];
  const FEATURES = ["modes", "temperature", "advance"];
  const LEGACY_CONFIG_KEYS = {
    room_columns:"device_columns",
    mobile_room_columns:"mobile_device_columns",
    room_types:"device_types",
    room_order:"device_order",
    room_configuration:"device_configuration",
    room_options:"device_options",
  };
  const CARD_CONFIG_ORDER = [
    "type", "title", "device_columns", "mobile_device_columns", "hubs", "device_types", "entities", "excluded_entities", "device_order",
    "temperature_focus", "device_configuration", "master_options_by_type", "device_options",
    "features", "tap_action", "hold_action", "double_tap_action",
    "icon_tap_action", "icon_hold_action", "icon_double_tap_action", "grid_options",
  ];
  const ROOM_CONFIG_ORDER = [
    "name", "icon", "color", "show_entity_picture", "hide_state", "state_content", "temperature_focus",
    "show_temperatures", "show_next_schedule", "features_position", "features",
    "tap_action", "hold_action", "double_tap_action", "icon_tap_action", "icon_hold_action", "icon_double_tap_action",
  ];
  const NATIVE_FEATURE_ORDER = ["type", "entity", "entities", "state_content", "show_labels", "override_end_time", "preset_modes"];
  const WISER_PRESET_MODES = ["Advance Schedule", "Cancel Overrides", "Boost 30m", "Boost 1h", "Boost 2h", "Boost 3h"];
  const SECONDARY_STATUS_FEATURE = "wiser-secondary-status-feature";
  const OVERRIDE_STATUS_FEATURE = "wiser-override-status-feature";
  const NEXT_SCHEDULE_FEATURE = "wiser-next-schedule-feature";
  const PASSIVE_MODE_FEATURE = "wiser-passive-mode-feature";
  const entityRegistryRequests = new WeakMap();
  const entityRegistryEntries = hass => {
    const key = hass.connection || hass;
    let request = entityRegistryRequests.get(key);
    if (!request) {
      request = hass.callWS({type: "config/entity_registry/list"}).catch(error => {
        entityRegistryRequests.delete(key);
        throw error;
      });
      entityRegistryRequests.set(key, request);
    }
    return request;
  };
  const isSecondaryFeature = feature => feature.type === `custom:${SECONDARY_STATUS_FEATURE}`;
  const isOverrideStatusFeature = feature => feature.type === `custom:${OVERRIDE_STATUS_FEATURE}`;
  const isHeaderFeature = feature => isSecondaryFeature(feature) || isOverrideStatusFeature(feature);
  const isIconFeature = feature => [NEXT_SCHEDULE_FEATURE, PASSIVE_MODE_FEATURE]
    .includes(feature?.type?.replace(/^custom:/, ""));
  const normalizedStateContent = value => Array.isArray(value) && value.length ? value : typeof value === "string" && value ? [value] : ["state"];
  const orderNativeFeatures = list => [...list.filter(isHeaderFeature), ...list.filter(feature => !isHeaderFeature(feature))];
  const featureForRoom = (feature, id) => {
    if (!isSecondaryFeature(feature) || !feature.entities || typeof feature.entities !== "object" || Array.isArray(feature.entities)) return feature;
    const resolved = {...feature};
    const entity = feature.entities[id];
    delete resolved.entities;
    if (typeof entity === "string" && entity) resolved.entity = entity;
    else delete resolved.entity;
    return resolved;
  };
  const normalizeConfig = value => {
    const config = {...(value || {})};
    for (const [legacy, current] of Object.entries(LEGACY_CONFIG_KEYS)) {
      if (!Object.hasOwn(config, current) && Object.hasOwn(config, legacy)) config[current] = config[legacy];
      delete config[legacy];
    }
    if (config.type === "custom:wiser-rooms-card") config.type = "custom:wiser-controls-card";
    return config;
  };
  const masterMode = config => config.device_configuration === "master";
  const typeForEntity = id => id?.startsWith("cover.") ? "shutters" : id?.startsWith("light.") ? "lights" : id?.startsWith("switch.") ? "plugs" : "heating";
  const masterOptions = (config, id) => config.master_options_by_type?.[typeForEntity(id)];
  const roomConfig = (config, id) => ({...config, ...(masterMode(config) ? masterOptions(config, id) : config.device_options?.[id])});
  const isNativeFeatureList = value => Array.isArray(value) && value.every(feature => feature && typeof feature === "object" && !Array.isArray(feature));
  const fallbackFeatures = config => config.features === undefined ? FEATURES : [];
  const featureOrder = () => FEATURES.map((value, index) => `--feature-${value}:${index}`).join(";");
  const nativeFeatures = (config, id, state) => {
    const supported = Array.isArray(state?.attributes?.preset_modes) ? state.attributes.preset_modes : [];
    const presetModes = WISER_PRESET_MODES.filter(mode => supported.includes(mode));
    if (!presetModes.length) presetModes.push("Advance Schedule");
    const list = config.features ?? FEATURES.flatMap(value => {
      const cover = id.startsWith("cover.");
      const light = id.startsWith("light.");
      if (light) return value === "modes" ? [{type:"toggle"}] : value === "temperature" ? [{type:"light-brightness"}] : [];
      if (id.startsWith("switch.")) return value === "modes" ? [{type:"toggle"}] : [];
      if (value === "modes") return [{type: cover ? "cover-open-close" : "climate-hvac-modes"}];
      if (value === "temperature") return [{type: cover ? "cover-position" : "target-temperature"}];
      return cover ? [] : [{type:"climate-preset-modes",preset_modes:presetModes}];
    });
    return orderNativeFeatures(list.map(feature => feature.type === "climate-preset-modes"
      && !Array.isArray(feature.preset_modes)
      ? {...feature,preset_modes:presetModes} : feature));
  };
  const validNativeFeatures = value => Array.isArray(value) && value.every(feature => feature && typeof feature === "object" && typeof feature.type === "string" && feature.type.length);
  const validAction = value => value && typeof value === "object" && !Array.isArray(value) && typeof value.action === "string";
  const orderedObject = (value, order, transform = {}) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const result = {};
    for (const key of order) if (Object.hasOwn(value, key)) result[key] = transform[key] ? transform[key](value[key]) : value[key];
    for (const key of Object.keys(value)) if (!Object.hasOwn(result, key)) result[key] = value[key];
    for (const key of Object.getOwnPropertySymbols(value)) result[key] = value[key];
    return result;
  };
  const orderedNativeFeatures = value => Array.isArray(value)
    ? value.map(feature => orderedObject(feature, NATIVE_FEATURE_ORDER)) : value;
  const orderedRoomConfig = value => orderedObject(value, ROOM_CONFIG_ORDER, {features:orderedNativeFeatures});
  const orderedRoomMap = value => Object.fromEntries(Object.entries(value).map(([id, options]) => [id, orderedRoomConfig(options)]));
  const orderedMasterTypes = value => orderedObject(value, DEVICE_TYPES, Object.fromEntries(DEVICE_TYPES.map(type => [type, orderedRoomConfig])));
  const orderedCardConfig = value => orderedObject(value, CARD_CONFIG_ORDER, {
    master_options_by_type:orderedMasterTypes,
    device_options:orderedRoomMap,
    features:orderedNativeFeatures,
  });
  let nativeLoading;
  const loadNativeFeatures = () => {
    if (!nativeLoading) nativeLoading = (async () => {
      if (!customElements.get("hui-tile-card")) {
        if (!window.loadCardHelpers) throw new Error("Home Assistant card helpers are unavailable");
        const helpers = await window.loadCardHelpers();
        await helpers.createCardElement({type: "tile", entity: "climate.wiser_feature_loader"});
        await customElements.whenDefined("hui-tile-card");
      }
      const Tile = customElements.get("hui-tile-card");
      await Tile.getConfigElement();
      if (!customElements.get("hui-card-features-editor") || !customElements.get("hui-card-features")) throw new Error("Native Tile features are unavailable in this Home Assistant version");
    })().catch(error => { nativeLoading = undefined; throw error; });
    return nativeLoading;
  };
  const PREVIEW_ROOM = Symbol.for("wiser-rooms-card-preview-room");
  const ROOM_SIZE_CACHE = Symbol.for("wiser-rooms-card-room-size-cache");
  const roomSizeCache = window[ROOM_SIZE_CACHE] ||= new Map();
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const entityDisplayName = (hass, state, configuredName) => {
    if (state && typeof hass?.formatEntityName === "function") {
      try {
        const formatted = hass.formatEntityName(state, configuredName);
        if (typeof formatted === "string" && formatted.trim()) return formatted;
      } catch (_) {}
    }
    if (typeof configuredName === "string") return configuredName;
    return state?.attributes?.name || state?.attributes?.friendly_name || state?.entity_id || "";
  };
  const available = state => state && !["unknown", "unavailable"].includes(state.state);
  const isShutter = state => state?.entity_id.startsWith("cover.") && Object.hasOwn(state.attributes, "shutter_id");
  const isLight = state => state?.entity_id.startsWith("light.") && Object.hasOwn(state.attributes, "product_type");
  const isPlug = state => state?.entity_id.startsWith("switch.") && Object.hasOwn(state.attributes, "output_state") && Object.hasOwn(state.attributes, "schedule_id");
  const isSuggestedEntity = state => (state?.entity_id.startsWith("climate.") && Object.hasOwn(state.attributes, "heating_type"))
    || isShutter(state) || isLight(state) || isPlug(state);
  const deviceType = state => isShutter(state) ? "shutters" : isLight(state) ? "lights" : isPlug(state) ? "plugs" : "heating";
  const supportsNativeFeature = (feature, id) => {
    const type = feature?.type || "";
    if (isSecondaryFeature(feature)) return true;
    if (isOverrideStatusFeature(feature) || [NEXT_SCHEDULE_FEATURE, PASSIVE_MODE_FEATURE]
      .some(name => type === `custom:${name}`)) return id.startsWith("climate.");
    if (type === "toggle") return id.startsWith("light.") || id.startsWith("switch.");
    if (type.startsWith("light-")) return id.startsWith("light.");
    if (type.startsWith("cover-")) return id.startsWith("cover.");
    if (type.startsWith("climate-") || type === "target-temperature") return id.startsWith("climate.");
    return true;
  };
  const configuredNativeFeatures = (config, id, state) => {
    const options = roomConfig(config, id);
    const configured = nativeFeatures(options, id, state);
    if (!masterMode(config) || !Array.isArray(options.features)) return configured;
    const headers = configured.filter(feature => isHeaderFeature(feature) && supportsNativeFeature(feature, id));
    const controls = configured.filter(feature => !isHeaderFeature(feature));
    const compatible = controls.filter(feature => supportsNativeFeature(feature, id));
    if (!controls.length || compatible.length) return orderNativeFeatures([...headers, ...compatible]);
    const defaults = nativeFeatures({...options,features:undefined}, id, state)
      .filter(feature => !isHeaderFeature(feature) && supportsNativeFeature(feature, id));
    return orderNativeFeatures([...headers, ...defaults]);
  };
  const isHeatingOverride = room => deviceType(room) === "heating" && available(room) && Boolean(room.attributes.is_override || room.attributes.is_boosted);
  const overrideEnd = room => {
    const value = room.attributes.boost_end || room.attributes.next_schedule_datetime;
    const end = value ? new Date(value) : room.attributes.is_boosted && Number.isFinite(room.attributes.boost_time_remaining)
      ? new Date(Date.now() + Math.max(0, room.attributes.boost_time_remaining) * 60000) : null;
    return end && Number.isFinite(end.getTime()) ? end : null;
  };
  const overrideMinutes = room => {
    if (room.attributes.is_boosted && Number.isFinite(room.attributes.boost_time_remaining)) return Math.max(0, room.attributes.boost_time_remaining);
    const end = overrideEnd(room);
    return end ? Math.max(0, Math.ceil((end.getTime() - Date.now()) / 60000)) : null;
  };
  const formatDuration = minutes => {
    if (!Number.isFinite(minutes)) return "";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60), remainder = minutes % 60;
    return `${hours}h${remainder ? ` ${remainder}m` : ""}`;
  };
  const overrideEndValue = (room, hass) => {
    if (!room || !isHeatingOverride(room)) return text(hass, "no_override");
    const end = overrideEnd(room);
    const locale = hass?.locale?.language || hass?.language;
    const endTime = end?.toLocaleString(locale, {weekday:"short",hour:"2-digit",minute:"2-digit"});
    const remaining = formatDuration(overrideMinutes(room));
    return endTime ? `${endTime}${remaining ? ` · ${text(hass, "remaining", {time:remaining})}` : ""}`
      : remaining ? text(hass, "remaining", {time:remaining}) : text(hass, "unavailable");
  };
  const withOverrideEnd = (state, hass) => state ? {
    ...state,
    attributes:{...state.attributes, override_end_time:overrideEndValue(state, hass)},
  } : state;
  const stateContentLabel = (hass, state, content) => {
    if (content === "state") return hass?.localize?.("ui.common.state") || "State";
    const domain = state?.entity_id?.split(".")[0];
    const key = domain ? `component.${domain}.entity_component._.state_attributes.${content}.name` : "";
    const localized = key && hass?.localize?.(key);
    if (localized && localized !== key) return localized;
    return content.replaceAll("_", " ").replace(/^./, letter => letter.toLocaleUpperCase(hass?.locale?.language || hass?.language));
  };
  const selectedTypes = config => Array.isArray(config?.device_types) && config.device_types.length
    ? DEVICE_TYPES.filter(type => config.device_types.includes(type)) : DEVICE_TYPES;
  const compareDeviceTypes = (hass, left, right) =>
    text(hass,left).localeCompare(text(hass,right), languageFor(hass), {sensitivity:"base"});
  const sortedDeviceTypes = hass => [...DEVICE_TYPES].sort((left, right) =>
    compareDeviceTypes(hass, left, right));
  const isRoom = (entry, state) => entry.platform === "wiser" && !entry.disabled_by && state &&
    (entry.entity_id.startsWith("climate.") && Object.hasOwn(state.attributes, "heating_type") || isShutter(state) || isLight(state) || isPlug(state));
  const matchesType = (state, types = DEVICE_TYPES) => types.includes(deviceType(state));
  const matchesHub = (entry, hubs) => !hubs?.length || hubs.includes(entry.config_entry_id);


  const isEditorPreview = element => {
    if (element.hasAttribute?.("editor-preview")) return true;
    for (let current = element; current; current = current.parentElement || current.assignedSlot || current.getRootNode?.()?.host || null) {
      if (["hui-dialog-edit-card", "hui-dialog-edit-badge"].includes(current.localName)) return true;
    }
    return false;
  };
  const orderRooms = (rooms, order = []) => {
    const positions = new Map(order.map((id, index) => [id, index]));
    return rooms.sort((a, b) => (positions.get(a.entity_id) ?? Infinity) - (positions.get(b.entity_id) ?? Infinity)
      || (a.attributes.name || a.attributes.friendly_name || a.entity_id).localeCompare(b.attributes.name || b.attributes.friendly_name || b.entity_id));
  };

  class WiserRoomsCard extends HTMLElement {
    static panelApiVersion = 1;
    static orderConfig(config) { return orderedCardConfig(normalizeConfig(config)); }
    constructor() {
      super();
      this.attachShadow({mode: "open"});
      this._entries = null;
      this._headerObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => this._layoutHeaders());
      this._observedHeaders = new Set();
      this._busy = false;
      this._temperatureQueue = new Map();
      this._targets = new Map();
      this._boostMenuOpen = false;
      this._error = "";
      this.shadowRoot.addEventListener("click", event => this._click(event));
      this.shadowRoot.addEventListener("dblclick", event => this._doubleClick(event));
      this.shadowRoot.addEventListener("pointerdown", event => this._pointerDown(event));
      this.shadowRoot.addEventListener("pointerup", () => this._pointerEnd());
      this.shadowRoot.addEventListener("pointercancel", () => this._pointerEnd());
      this.shadowRoot.addEventListener("pointerleave", () => this._pointerEnd());
      this.shadowRoot.addEventListener("change", event => this._change(event));
      this.shadowRoot.addEventListener("focusout", () => setTimeout(() => this._render(), 0));
    }
    connectedCallback() { this._layoutHeaders(); }
    disconnectedCallback() { this._headerObserver?.disconnect(); this._observedHeaders.clear(); }
    _layoutHeaders() {
      const headers = new Set(this.shadowRoot.querySelectorAll?.(".top") || []);
      const preview = isEditorPreview(this);
      for (const header of this._observedHeaders) if (!headers.has(header)) this._headerObserver?.unobserve(header.closest(".room"));
      for (const header of headers) {
        const room = header.closest(".room");
        const roomId = room?.getAttribute("data-key");
        const sizeKey = `${this._config?.device_columns || 1}:${roomId}`;
        const bounds = room?.getBoundingClientRect?.();
        if (!preview && bounds?.width > 0 && bounds?.height > 0) roomSizeCache.set(sizeKey, {width:bounds.width, height:bounds.height});
        if (preview && room?.classList.contains("preview-selected")) {
          const measured = roomSizeCache.get(sizeKey);
          if (measured?.width) room.style.setProperty("--preview-room-width", `${measured.width}px`);
        }
        if (!this._observedHeaders.has(header)) this._headerObserver?.observe(room);
        const content = room.querySelector(".room-content");
        // Selected previews use the same text and control sizes as the dashboard.
        content.style.zoom = "1";
        const name = header.querySelector(".name strong");
        const temps = header.querySelector(".temps");
        const gap = parseFloat(getComputedStyle(header).columnGap) || 0;
        const status = header.querySelector(".status");
        header.style.setProperty("--status-width", `${(getComputedStyle(status).display === "none" ? 0 : status.scrollWidth)}px`);
        const needed = 38 + gap * 2 + name.scrollWidth + (getComputedStyle(temps).display === "none" ? 0 : temps.scrollWidth);
        header.classList.toggle("inline-readings", needed <= header.clientWidth);
      }
      this._observedHeaders = headers;
    }
    setConfig(config) {
      config = normalizeConfig(config);
      if (config.entities !== undefined && (!Array.isArray(config.entities) || config.entities.some(id => typeof id !== "string" || !/^(climate|cover|light|switch)\./.test(id)))) {
        throw new Error("entities must be a list of supported Wiser entity IDs");
      }
      if (config.excluded_entities !== undefined && (!Array.isArray(config.excluded_entities) || config.excluded_entities.some(id => typeof id !== "string" || !/^(climate|cover|light|switch)\./.test(id)))) {
        throw new Error("excluded_entities must be a list of supported Wiser entity IDs");
      }
      if (config.device_order !== undefined && (!Array.isArray(config.device_order) || config.device_order.some(id => typeof id !== "string" || !/^(climate|cover|light|switch)\./.test(id)))) {
        throw new Error("device_order must be a list of supported Wiser entity IDs");
      }
      if (config.hubs !== undefined && (!Array.isArray(config.hubs) || config.hubs.some(id => typeof id !== "string" || !id.length))) {
        throw new Error("hubs must be a list of Wiser config entry IDs");
      }
      if (config.device_columns !== undefined && (!Number.isInteger(config.device_columns) || config.device_columns < 1 || config.device_columns > 6)) {
        throw new Error("device_columns must be a whole number from 1 to 6");
      }
      if (config.device_types !== undefined && (!Array.isArray(config.device_types) || !config.device_types.length || new Set(config.device_types).size !== config.device_types.length || config.device_types.some(type => !DEVICE_TYPES.includes(type)))) throw new Error("device_types must contain one or more unique supported device types");
      if (config.temperature_focus !== undefined && !["current", "target"].includes(config.temperature_focus)) throw new Error("temperature_focus must be current or target");
      if (config.features !== undefined && !validNativeFeatures(config.features)) throw new Error("features must contain native feature objects");
      if (config.device_options !== undefined) {
        if (!config.device_options || typeof config.device_options !== "object" || Array.isArray(config.device_options)) throw new Error("device_options must be an entity settings map");
        for (const [id, options] of Object.entries(config.device_options)) {
          if (!/^(climate|cover|light|switch)\./.test(id) || !options || typeof options !== "object" || Array.isArray(options)) throw new Error("Invalid room options");
          if (options.features !== undefined && !validNativeFeatures(options.features)) throw new Error("Invalid room features");
          if (options.features_position !== undefined && !["bottom", "inline"].includes(options.features_position)) throw new Error("Invalid room features_position");
          if (options.temperature_focus !== undefined && !["current", "target"].includes(options.temperature_focus)) throw new Error("Invalid room temperature emphasis");
          for (const key of ["tap_action","icon_tap_action","hold_action","icon_hold_action","double_tap_action","icon_double_tap_action"]) if (options[key] !== undefined && !validAction(options[key])) throw new Error(`Invalid room ${key}`);
        }
      }
      for (const key of ["tap_action","icon_tap_action","hold_action","icon_hold_action","double_tap_action","icon_double_tap_action"]) if (config[key] !== undefined && !validAction(config[key])) throw new Error(`Invalid ${key}`);
      this._config = {device_columns: 1, temperature_focus: "current", ...config};
      this._render();
    }
    static getStubConfig() { return {type: "custom:wiser-controls-card", title: "Wiser controls"}; }
    static async getConfigElement() { await loadNativeFeatures(); return document.createElement("wiser-controls-card-editor"); }
    getCardSize() { return 2 + Math.ceil(this._rooms().length / (this._config?.device_columns || 1)) * 1.6; }
    getGridOptions() { return {columns: 9, min_columns: 9}; }
    set hass(hass) {
      this._hass = hass;
      updateFeatureTranslations(hass);
      if (!this._nativeReady && !this._nativePending) {
        this._nativePending = true;
        loadNativeFeatures().then(() => { this._nativeReady = true; this._render(); })
          .catch(error => { this._error = error.message; this._render(); })
          .finally(() => { this._nativePending = false; });
      }
      if (!this._entries && !this._loading && !this._discoveryFailed) this._discover();
      this._render();
    }
    async _discover() {
      this._loading = true;
      this._discoveryFailed = false;
      this._error = "";
      try {
        this._entries = await entityRegistryEntries(this._hass);
      } catch (error) {
        this._discoveryFailed = true;
        this._error = `Unable to find Wiser devices: ${error.message || error}`;
      } finally { this._loading = false; this._render(); }
    }
    _rooms() {
      if (!this._hass || !this._entries) return [];
      const rooms = this._entries.filter(entry => isRoom(entry, this._hass.states[entry.entity_id]) && matchesHub(entry, this._config?.hubs) && matchesType(this._hass.states[entry.entity_id], selectedTypes(this._config)) && !this._config?.excluded_entities?.includes(entry.entity_id)).map(entry => this._hass.states[entry.entity_id]);
      if (this._config?.entities?.length) return this._config.entities.map(id => rooms.find(room => room.entity_id === id)).filter(Boolean);
      return orderRooms(rooms, this._config?.device_order);
    }
    _name(room) {
      const name = roomConfig(this._config || {}, room.entity_id).name;
      return entityDisplayName(this._hass, room, name);
    }
    _contentClass(options) {
      return `${options.hide_state ? "hide-status" : ""} ${options.show_temperatures === false ? "hide-temps" : ""} ${options.show_next_schedule === false ? "hide-next" : ""}`;
    }
    _contentIcon(room, fallback) {
      const options = roomConfig(this._config, room.entity_id);
      return `<ha-state-icon data-room-icon="${escape(room.entity_id)}" icon="${escape(options.icon || fallback)}"></ha-state-icon>`;
    }
    _contentStatus(room) {
      const configured = roomConfig(this._config, room.entity_id).state_content;
      const content = configured === undefined
        ? this._defaultStateContent(room.entity_id)
        : Array.isArray(configured) ? configured : [configured];
      return content.map(item => `<span class="status-item" title="${escape(stateContentLabel(this._hass, room, item))}"><state-display data-room-status="${escape(room.entity_id)}" data-status-content="${escape(item)}"></state-display></span>`)
        .join('<span class="status-separator"> · </span>');
    }
    _defaultStateContent(id) {
      return id.startsWith("climate.") ? ["hvac_action"] : ["state"];
    }
    _contentColor(room, fallback) {
      const color = roomConfig(this._config, room.entity_id).color;
      if (!available(room) || ["off","closed"].includes(room.state) || !color || color === "state") return fallback;
      if (/^#[0-9a-f]{3,8}$/i.test(color)) return color;
      return /^[a-z][a-z0-9-]*$/i.test(color) ? `var(--${color}-color)` : fallback;
    }
    _temperature(value) {
      return typeof value === "number" && Number.isFinite(value) ? `${new Intl.NumberFormat(this._hass.locale?.language || this._hass.language, {maximumFractionDigits: 1}).format(value)}${this._hass.config?.unit_system?.temperature || "°C"}` : "—";
    }
    async _service(room, service, values, resume = false) {
      if (!available(room) || isShutter(room) || !this._rooms().some(r => r.entity_id === room.entity_id)) return;
      const temperatureEdit = service === "set_temperature";
      if (temperatureEdit && (room.state === "off" || !Number.isFinite(values.temperature))) return;
      if (this._busy) {
        if (temperatureEdit && this._temperatureSending) {
          this._temperatureQueue.set(room.entity_id, values.temperature);
          this._targets.set(room.entity_id, {value: values.temperature, expires: Date.now() + 30000});
        }
        return;
      }
      this._temperatureSending = temperatureEdit;
      if (temperatureEdit) this._targets.set(room.entity_id, {value: values.temperature, expires: Date.now() + 30000});
      this._busy = true; this._error = ""; this._render();
      try {
        await this._hass.callService("climate", service, {entity_id: room.entity_id, ...values});
        if (resume && (room.attributes.is_override || room.attributes.is_boosted) && room.attributes.preset_modes?.includes("Cancel Overrides")) {
          await this._hass.callService("climate", "set_preset_mode", {entity_id: room.entity_id, preset_mode: "Cancel Overrides"});
        }
      }
      catch (error) {
        if (!this._temperatureQueue.has(room.entity_id)) this._targets.delete(room.entity_id);
        this._error = `${this._name(room)}: ${error.message || error}`;
      }
      finally {
        this._busy = false;
        this._temperatureSending = false;
        const queued = this._temperatureQueue.entries().next().value;
        if (queued) {
          const [id, temperature] = queued;
          this._temperatureQueue.delete(id);
          const current = this._rooms().find(r => r.entity_id === id);
          if (current) await this._service(current, "set_temperature", {temperature});
        }
        this._render();
      }
    }
    async _shutterService(room, service, position) {
      const feature = {open_cover: 1, close_cover: 2, set_cover_position: 4, stop_cover: 8}[service];
      if (this._busy || !available(room) || !isShutter(room) || !feature || !(room.attributes.supported_features & feature)
        || !this._rooms().some(item => item.entity_id === room.entity_id)) return;
      if (service === "set_cover_position" && (!Number.isFinite(position) || position < 0 || position > 100)) return;
      this._busy = true; this._error = ""; this._render();
      try {
        await this._hass.callService("cover", service, {entity_id: room.entity_id, ...(service === "set_cover_position" ? {position} : {})});
      } catch (error) { this._error = `Unable to control ${this._name(room)}: ${error.message || error}`; }
      finally { this._busy = false; this._render(); }
    }
    _headerFeatures(room) {
      return configuredNativeFeatures(this._config, room.entity_id, room).filter(isHeaderFeature)
        .map(feature => featureForRoom(feature, room.entity_id));
    }
    _secondaryMarkup(room) {
      return this._headerFeatures(room).map((feature, index) => {
        const tag = isOverrideStatusFeature(feature) ? OVERRIDE_STATUS_FEATURE : SECONDARY_STATUS_FEATURE;
        return `<${tag} data-key="secondary-${index}" data-secondary-room="${escape(room.entity_id)}" data-secondary-index="${index}"></${tag}>`;
      }).join("");
    }
    _nativeMarkup(room) {
      const position = roomConfig(this._config, room.entity_id).features_position || "bottom";
      const list = configuredNativeFeatures(this._config, room.entity_id, room).filter(feature => !isHeaderFeature(feature));
      if (!list.length) return "";
      const host = (feature, index) => `<hui-card-features class="features-${position}${isIconFeature(feature) ? " feature-icon-only" : ""}" data-key="features-${escape(room.entity_id)}-${index}" data-room-features="${escape(room.entity_id)}" data-feature-index="${index}" style="--feature-height:40px"></hui-card-features>`;
      if (position === "inline") return `<div class="features-inline-row">${list.map(host).join("")}</div>`;
      const rows = [];
      list.forEach((feature, index) => {
        if (isIconFeature(feature) && rows.length) rows.at(-1).push([feature, index]);
        else rows.push([[feature, index]]);
      });
      return rows.map(row => row.length > 1
        ? `<div class="features-bottom-row">${row.map(([feature, index]) => host(feature, index)).join("")}</div>`
        : host(row[0][0], row[0][1])).join("");
    }
    _syncNativeFeatures() {
      for (const icon of this.shadowRoot.querySelectorAll?.("ha-state-icon[data-room-icon]") || []) {
        const id = icon.dataset.roomIcon;
        icon.stateObj = this._hass.states[id];
      }
      for (const display of this.shadowRoot.querySelectorAll?.("state-display[data-room-status]") || []) {
        const id = display.dataset.roomStatus;
        display.hass = this._hass; display.stateObj = withOverrideEnd(this._hass.states[id], this._hass);
        display.content = display.dataset.statusContent
          ? [display.dataset.statusContent]
          : roomConfig(this._config, id).state_content ?? this._defaultStateContent(id);
      }
      for (const element of this.shadowRoot.querySelectorAll?.("[data-secondary-room]") || []) {
        const id = element.dataset.secondaryRoom;
        const config = this._headerFeatures(this._hass.states[id])[Number(element.dataset.secondaryIndex)];
        element.hass = this._hass;
        element.context = {entity_id:id};
        if (element._wiserConfig !== JSON.stringify(config)) {
          element.setConfig(config);
          element._wiserConfig = JSON.stringify(config);
        }
      }
      for (const element of this.shadowRoot.querySelectorAll?.("hui-card-features") || []) {
        const id = element.dataset.roomFeatures;
        const allFeatures = configuredNativeFeatures(this._config, id, this._hass.states[id]).filter(feature => !isHeaderFeature(feature));
        const featureIndex = element.dataset.featureIndex;
        const config = featureIndex === undefined ? allFeatures : allFeatures.slice(Number(featureIndex), Number(featureIndex) + 1);
        element.hass = this._hass;
        element.context = {entity_id:id};
        element.stateObj = this._hass.states[id];
        element.columns = 1;
        if (element._wiserConfig !== JSON.stringify(config)) {
          element.features = config;
          element._wiserConfig = JSON.stringify(config);
        }
      }
    }
    _renderShutter(room, preview, previewRoom) {
      const options = roomConfig(this._config, room.entity_id);
      const id = escape(room.entity_id), a = room.attributes;
      const status = !available(room) ? text(this._hass,"unavailable") : ({open:text(this._hass,"open"),closed:text(this._hass,"closed"),opening:text(this._hass,"opening"),closing:text(this._hass,"closing")}[room.state] || room.state);
      const disabled = this._busy || !available(room);
      const position = typeof a.current_position === "number" ? a.current_position : null;
      const color = available(room) ? "var(--state-cover-active-color,var(--primary-color))" : "var(--disabled-text-color)";
      const secondary = this._secondaryMarkup(room);
      const reading = position === null ? "—" : `${position}%`;
      const header = secondary ? `<div class="top has-secondary ${this._contentClass(options)}"><button class="state-icon" data-entity="${id}" data-interaction="icon" aria-label="Open shutter details">${this._contentIcon(room, room.state === "closed" ? "mdi:window-shutter" : "mdi:window-shutter-open")}</button>
        <div class="secondary-layout"><div class="secondary-heading-line"><button class="name" data-entity="${id}" data-interaction="card"><strong>${escape(this._name(room))}</strong></button><div class="temps">${reading}</div></div>
        <div class="secondary-primary-line"><span class="status">${this._contentStatus(room, status)}</span>${options.hide_state ? secondary : ""}<div class="next">${escape(a.room || "")}</div></div>${options.hide_state ? "" : secondary}</div></div>`
        : `<div class="top ${this._contentClass(options)}"><button class="state-icon" data-entity="${id}" data-interaction="icon" aria-label="Open shutter details">${this._contentIcon(room, room.state === "closed" ? "mdi:window-shutter" : "mdi:window-shutter-open")}</button>
        <div class="room-heading"><div class="identity"><button class="name" data-entity="${id}" data-interaction="card"><strong>${escape(this._name(room))}</strong></button><span class="status">${this._contentStatus(room, status)}</span></div>
        <div class="readings"><div class="temps">${reading}</div><div class="next">${escape(a.room || "")}</div></div></div></div>`;
      return `<section data-key="${id}" class="room ${preview && previewRoom === room.entity_id ? "preview-selected" : ""}" style="--room-state-color:${this._contentColor(room, color)};${featureOrder(options)}"><div class="room-content">
        ${header}
        ${this._nativeReady || options.features !== undefined ? this._nativeMarkup(room) : fallbackFeatures(options).some(feature => feature === "modes" || feature === "temperature" && (a.supported_features & 4)) ? `<div class="controls">${fallbackFeatures(options).includes("modes") ? `<div class="modes" role="group" aria-label="Shutter controls">${[["open_cover",1,"arrow-up","Open"],["stop_cover",8,"stop","Stop"],["close_cover",2,"arrow-down","Close"]].map(([service,feature,icon,label]) =>
          `<button class="mode" data-action="shutter" data-entity="${id}" data-service="${service}" title="${label}" aria-label="${label}" ${disabled || !(a.supported_features & feature) ? "disabled" : ""}><ha-icon icon="mdi:${icon}"></ha-icon></button>`).join("")}</div>` : ""}
        ${fallbackFeatures(options).includes("temperature") && a.supported_features & 4 ? `<input type="number" data-entity="${id}" data-field="position" aria-label="${escape(this._name(room))} position percent" title="Position (0% closed, 100% open)" value="${position ?? ""}" min="0" max="100" step="1" ${disabled ? "disabled" : ""}>` : ""}</div>` : ""}</div></section>`;
    }
    _deviceSchedule(state) {
      const date = state.attributes.next_schedule_datetime ? new Date(state.attributes.next_schedule_datetime) : null;
      const time = date && Number.isFinite(date.getTime()) ? date.toLocaleString(this._hass.locale?.language || this._hass.language, {weekday:"short",hour:"2-digit",minute:"2-digit"}) : state.attributes.next_schedule_change;
      return state.attributes.schedule_id && time ? `${text(this._hass,"next")} ${time} · ${state.attributes.next_schedule_state ?? ""}` : state.attributes.schedule_id ? state.attributes.schedule_name : text(this._hass,"no_schedule");
    }
    _formatPower(value, unit = "W") {
      const reading = String(value).trim();
      const numeric = Number(reading);
      if (!Number.isFinite(numeric)) return reading;
      const normalizedUnit = String(unit).trim().toLowerCase();
      const watts = normalizedUnit === "kw" ? numeric * 1000 : numeric;
      const useKilowatts = ["w", "kw"].includes(normalizedUnit) && Math.abs(watts) >= 1000;
      const displayed = useKilowatts ? watts / 1000 : numeric;
      const formatted = displayed.toLocaleString(languageFor(this._hass), {
        maximumFractionDigits: 2,
        useGrouping: false,
      });
      return `${formatted}${useKilowatts ? "kW" : unit}`;
    }
    _powerReading(device) {
      for (const key of ["power", "current_power", "power_usage"]) {
        const value = device.attributes[key];
        if (value !== undefined && value !== null && value !== "") {
          const unit = device.attributes[`${key}_unit`] || device.attributes.power_unit || "W";
          return this._formatPower(value, unit);
        }
      }
      const entry = this._entries?.find(item => item.entity_id === device.entity_id);
      if (!entry?.device_id) return "";
      for (const candidate of this._entries) {
        if (candidate.disabled_by || !candidate.entity_id?.startsWith("sensor.")
          || candidate.device_id !== entry.device_id
          || candidate.config_entry_id && entry.config_entry_id && candidate.config_entry_id !== entry.config_entry_id) continue;
        const state = this._hass.states[candidate.entity_id];
        if (!available(state) || state.attributes.device_class !== "power") continue;
        const unit = state.attributes.unit_of_measurement || "W";
        return this._formatPower(state.state, unit);
      }
      return "";
    }
    _renderPoweredDevice(state, preview, previewRoom) {
      const options = roomConfig(this._config, state.entity_id);
      const id = escape(state.entity_id), light = isLight(state), on = state.state === "on";
      const status = !available(state) ? text(this._hass,"unavailable") : on ? text(this._hass,"on") : text(this._hass,"off");
      const disabled = this._busy || !available(state) ? "disabled" : "";
      const brightness = light && typeof state.attributes.brightness === "number" ? Math.round(state.attributes.brightness / 255 * 100) : null;
      const reading = light
        ? (brightness === null ? "—" : `${brightness}%`)
        : on ? this._powerReading(state) || status : status;
      const icon = light ? (on ? "mdi:lightbulb" : "mdi:lightbulb-outline") : (on ? "mdi:power-socket-uk" : "mdi:power-socket-uk");
      const color = available(state) && on ? "var(--state-light-active-color,var(--primary-color))" : "var(--secondary-text-color)";
      const useNative = this._nativeReady || options.features !== undefined;
      const native = useNative ? this._nativeMarkup(state) : "";
      const brightnessControl = light ? `<input type="number" data-entity="${id}" data-field="brightness" aria-label="${escape(this._name(state))} brightness percent" title="Brightness" value="${brightness ?? ""}" min="1" max="100" step="1" ${disabled}>` : "";
      const fallbackControls = useNative ? "" : `<div class="controls">${brightnessControl}<button data-action="device" data-entity="${id}" data-service="turn_${on ? "off" : "on"}" aria-label="Turn ${escape(this._name(state))} ${on ? "off" : "on"}" title="Turn ${on ? "off" : "on"}" ${disabled}><ha-icon icon="mdi:power"></ha-icon></button></div>`;
      const secondary = this._secondaryMarkup(state);
      const next = options.show_next_schedule === false ? "" : escape(this._deviceSchedule(state));
      const readingMarkup = options.show_temperatures === false ? "" : escape(reading);
      const header = secondary ? `<div class="top has-secondary ${this._contentClass(options)}"><button class="state-icon" data-entity="${id}" data-interaction="icon" aria-label="Open device details">${this._contentIcon(state, icon)}</button>
        <div class="secondary-layout"><div class="secondary-heading-line"><button class="name" data-entity="${id}" data-interaction="card"><strong>${escape(this._name(state))}</strong></button><div class="temps">${readingMarkup}</div></div>
        <div class="secondary-primary-line"><span class="status">${this._contentStatus(state, status)}</span>${options.hide_state ? secondary : ""}<div class="next">${next}</div></div>${options.hide_state ? "" : secondary}</div></div>`
        : `<div class="top ${this._contentClass(options)}"><button class="state-icon" data-entity="${id}" data-interaction="icon" aria-label="Open device details">${this._contentIcon(state, icon)}</button>
        <div class="room-heading"><div class="identity"><button class="name" data-entity="${id}" data-interaction="card"><strong>${escape(this._name(state))}</strong></button><span class="status">${this._contentStatus(state, status)}</span></div>
        <div class="readings"><div class="temps">${readingMarkup}</div><div class="next">${next}</div></div></div></div>`;
      return `<section data-key="${id}" class="room device-${light ? "light" : "plug"} ${on ? "powered" : ""} ${preview && previewRoom === state.entity_id ? "preview-selected" : ""}" style="--room-state-color:${this._contentColor(state, color)};${featureOrder(options)}"><div class="room-content">
        ${header}
        ${fallbackControls}${native}</div></section>`;
    }
    async _deviceService(state, service, data = {}) {
      const domain = isLight(state) ? "light" : isPlug(state) ? "switch" : "";
      if (this._busy || !domain || !available(state) || !["turn_on","turn_off"].includes(service) || !this._rooms().some(item => item.entity_id === state.entity_id)) return;
      this._busy = true; this._error = ""; this._render();
      try { await this._hass.callService(domain, service, {entity_id:state.entity_id, ...data}); }
      catch (error) { this._error = `Unable to control ${this._name(state)}: ${error.message || error}`; }
      finally { this._busy = false; this._render(); }
    }
    async _allOff() {
      if (this._busy) return;
      const rooms = this._rooms().filter(room => !isShutter(room) && available(room) && room.state !== "off" && room.attributes.hvac_modes?.includes("off"));
      if (!rooms.length) return;
      this._busy = true; this._error = ""; this._render();
      const results = await Promise.allSettled(rooms.map(async room => this._hass.callService("climate", "set_hvac_mode", {entity_id: room.entity_id, hvac_mode: "off"})));
      const failed = rooms.filter((_, i) => results[i].status === "rejected");
      if (failed.length) this._error = `Could not turn off: ${failed.map(room => this._name(room)).join(", ")}. Please retry.`;
      this._busy = false; this._render();
    }
    async _cancelAllOverrides() {
      if (this._busy) return;
      const rooms = this._rooms().filter(room => isHeatingOverride(room)
        && room.attributes.preset_modes?.includes("Cancel Overrides"));
      if (!rooms.length) return;
      this._busy = true; this._error = ""; this._render();
      const results = await Promise.allSettled(rooms.map(room => this._hass.callService("climate", "set_preset_mode", {entity_id:room.entity_id, preset_mode:"Cancel Overrides"})));
      const failed = rooms.filter((_, index) => results[index].status === "rejected");
      if (failed.length) this._error = `Could not cancel overrides: ${failed.map(room => this._name(room)).join(", ")}. Please retry.`;
      this._busy = false; this._render();
    }
    _heatingScheduleTargets() {
      return this._rooms().filter(room => deviceType(room) === "heating" && available(room)
        && Boolean(room.attributes.schedule_id) && room.attributes.hvac_modes?.includes("auto")
        && (room.state !== "auto" || room.attributes.is_override || room.attributes.is_boosted));
    }
    async _followHeatingSchedule() {
      if (this._busy || !selectedTypes(this._config).includes("heating")) return;
      const rooms = this._heatingScheduleTargets();
      if (!rooms.length) return;
      this._busy = true; this._error = ""; this._render();
      const results = await Promise.allSettled(rooms.map(room => this._hass.callService("climate", "set_hvac_mode", {entity_id:room.entity_id, hvac_mode:"auto"})));
      const failed = rooms.filter((_, index) => results[index].status === "rejected");
      if (failed.length) this._error = `Could not follow schedules: ${failed.map(room => this._name(room)).join(", ")}. Please retry.`;
      this._busy = false; this._render();
    }
    async _boostAll(presetMode) {
      if (this._busy || !["Boost 30m", "Boost 1h", "Boost 2h", "Boost 3h"].includes(presetMode)
        || !selectedTypes(this._config).includes("heating")) return;
      const rooms = this._rooms().filter(room => deviceType(room) === "heating" && available(room)
        && room.attributes.preset_modes?.includes(presetMode));
      if (!rooms.length) return;
      this._busy = true; this._error = ""; this._render();
      const results = await Promise.allSettled(rooms.map(room => this._hass.callService("climate", "set_preset_mode", {entity_id:room.entity_id, preset_mode:presetMode})));
      const failed = rooms.filter((_, index) => results[index].status === "rejected");
      if (failed.length) this._error = `Could not boost: ${failed.map(room => this._name(room)).join(", ")}. Please retry.`;
      this._busy = false; this._render();
    }
    async _cancelAllBoosts() {
      if (this._busy || !selectedTypes(this._config).includes("heating")) return;
      const rooms = this._rooms().filter(room => deviceType(room) === "heating" && available(room)
        && room.attributes.is_boosted && room.attributes.preset_modes?.includes("Cancel Overrides"));
      if (!rooms.length) return;
      this._busy = true; this._error = ""; this._render();
      const results = await Promise.allSettled(rooms.map(room => this._hass.callService("climate", "set_preset_mode", {entity_id:room.entity_id, preset_mode:"Cancel Overrides"})));
      const failed = rooms.filter((_, index) => results[index].status === "rejected");
      if (failed.length) this._error = `Could not cancel boosts: ${failed.map(room => this._name(room)).join(", ")}. Please retry.`;
      this._busy = false; this._render();
    }
    async _closeAll() {
      if (this._busy || !selectedTypes(this._config).includes("shutters")) return;
      const shutters = this._rooms().filter(room => isShutter(room) && available(room) && room.state !== "closed" && (room.attributes.supported_features & 2));
      if (!shutters.length) return;
      this._busy = true; this._error = ""; this._render();
      const results = await Promise.allSettled(shutters.map(async room => this._hass.callService("cover", "close_cover", {entity_id:room.entity_id})));
      const failed = shutters.filter((_, index) => results[index].status === "rejected");
      if (failed.length) this._error = `Could not close: ${failed.map(room => this._name(room)).join(", ")}. Please retry.`;
      this._busy = false; this._render();
    }
    async _allDevicesOff(type) {
      if (this._busy || !["lights","plugs"].includes(type) || !selectedTypes(this._config).includes(type)) return;
      const devices = this._rooms().filter(state => deviceType(state) === type && available(state) && state.state === "on");
      if (!devices.length) return;
      const domain = type === "lights" ? "light" : "switch";
      this._busy = true; this._error = ""; this._render();
      const results = await Promise.allSettled(devices.map(async state => this._hass.callService(domain, "turn_off", {entity_id:state.entity_id})));
      const failed = devices.filter((_, index) => results[index].status === "rejected");
      if (failed.length) this._error = `Could not turn off: ${failed.map(state => this._name(state)).join(", ")}. Please retry.`;
      this._busy = false; this._render();
    }
    _scheduleModeTarget(device) {
      const entry = this._entries?.find(item => item.entity_id === device.entity_id);
      if (!entry?.device_id) return null;
      for (const candidate of this._entries) {
        if (!candidate.entity_id?.startsWith("select.") || candidate.device_id !== entry.device_id
          || candidate.config_entry_id && entry.config_entry_id && candidate.config_entry_id !== entry.config_entry_id) continue;
        const state = this._hass.states[candidate.entity_id];
        const auto = state?.attributes?.options?.find(option => String(option).toLowerCase() === "auto");
        if (available(state) && auto && String(state.state).toLowerCase() !== "auto") return {device, select:state, option:auto};
      }
      return null;
    }
    _scheduleModeTargets(type) {
      if (!["shutters","lights","plugs"].includes(type)) return [];
      return this._rooms().filter(device => deviceType(device) === type && available(device) && Boolean(device.attributes.schedule_id))
        .map(device => this._scheduleModeTarget(device)).filter(Boolean);
    }
    async _resumeSchedules(type) {
      if (this._busy || !selectedTypes(this._config).includes(type)) return;
      const targets = this._scheduleModeTargets(type);
      if (!targets.length) return;
      this._busy = true; this._error = ""; this._render();
      const results = await Promise.allSettled(targets.map(target => this._hass.callService("select", "select_option", {entity_id:target.select.entity_id, option:target.option})));
      const failed = targets.filter((_, index) => results[index].status === "rejected");
      if (failed.length) this._error = `Could not resume schedules: ${failed.map(target => this._name(target.device)).join(", ")}. Please retry.`;
      this._busy = false; this._render();
    }
    _click(event) {
      const button = event.target.closest("button,ha-button");
      if (!button || button.disabled) {
        if (this._boostMenuOpen) { this._boostMenuOpen = false; this._render(); }
        return;
      }
      if (button.dataset.action === "boost-menu") { this._boostMenuOpen = !this._boostMenuOpen; this._render(); return; }
      if (button.dataset.action === "all-off") { this._allOff(); return; }
      if (button.dataset.action === "cancel-overrides") { this._cancelAllOverrides(); return; }
      if (button.dataset.action === "follow-schedule") { this._followHeatingSchedule(); return; }
      if (button.dataset.action === "cancel-all-boosts") { this._cancelAllBoosts(); return; }
      if (button.dataset.action === "boost-duration") { this._boostMenuOpen = false; this._boostAll(button.dataset.boostMode); return; }
      if (button.dataset.action === "all-close") { this._closeAll(); return; }
      if (button.dataset.action === "all-lights-off") { this._allDevicesOff("lights"); return; }
      if (button.dataset.action === "all-plugs-off") { this._allDevicesOff("plugs"); return; }
      if (button.dataset.action?.startsWith("resume-")) { this._resumeSchedules(button.dataset.action.slice(7)); return; }
      if (button.dataset.action === "retry") { this._discover(); return; }
      const room = this._rooms().find(r => r.entity_id === button.dataset.entity);
      if (room && button.dataset.action === "shutter") {
        this._shutterService(room, button.dataset.service); return;
      }
      if (room && button.dataset.action === "device") {
        this._deviceService(room, button.dataset.service); return;
      }
      if (room && button.dataset.action === "mode") {
        const mode = button.dataset.mode;
        if (room.attributes.hvac_modes?.includes(mode) && (mode !== "auto" || room.attributes.schedule_id)) {
          this._service(room, "set_hvac_mode", {hvac_mode: mode}, mode === "auto");
        }
        return;
      }
      if (room && button.dataset.action === "advance") {
        if (room.state === "auto" && room.attributes.schedule_id && room.attributes.preset_modes?.includes("Advance Schedule")) this._service(room, "set_preset_mode", {preset_mode: "Advance Schedule"});
        return;
      }
      if (room) this._tap(event, room, button.dataset.interaction === "icon" ? "icon" : "card");
    }
    _interactionTarget(event) {
      const button = event.target.closest?.("button[data-entity][data-interaction]:not([data-action])");
      const room = button && !button.disabled ? this._rooms().find(room => room.entity_id === button.dataset.entity) : null;
      return room ? {room, scope:button.dataset.interaction === "icon" ? "icon" : "card"} : null;
    }
    _action(room, key) {
      const configured = roomConfig(this._config, room.entity_id)[key];
      if (configured) return configured;
      if (key === "tap_action") return {action:"more-info"};
      if (key === "icon_tap_action") return {action:isLight(room) || isPlug(room) ? "toggle" : "more-info"};
      return {action:"none"};
    }
    _runAction(room, config) {
      if (!config || config.action === "none") return;
      if (config.confirmation && typeof window.confirm === "function" && !window.confirm(config.confirmation.text || "Are you sure?")) return;
      const entityId = config.entity || config.entity_id || room.entity_id;
      if (config.action === "more-info") {
        this.dispatchEvent(new CustomEvent("hass-more-info", {detail:{entityId}, bubbles:true, composed:true}));
      } else if (config.action === "toggle") {
        const domain = entityId.split(".")[0];
        if (domain) this._hass.callService(domain, "toggle", {entity_id:entityId});
      } else if (["perform-action","call-service"].includes(config.action)) {
        const [domain, service] = (config.perform_action || config.service || "").split(".");
        if (domain && service) this._hass.callService(domain, service, config.data || config.service_data || {}, config.target);
      } else if (config.action === "navigate" && config.navigation_path) {
        window.history?.pushState?.(null, "", config.navigation_path);
        window.dispatchEvent?.(new Event("location-changed"));
      } else if (config.action === "url" && config.url_path) {
        window.open?.(config.url_path, "_blank", "noopener,noreferrer");
      }
    }
    _tap(event, room, scope = "card") {
      if (this._holdTriggered === room.entity_id) { this._holdTriggered = ""; return; }
      clearTimeout(this._tapTimer);
      const tapKey = scope === "icon" ? "icon_tap_action" : "tap_action";
      const doubleKey = scope === "icon" ? "icon_double_tap_action" : "double_tap_action";
      const doubleAction = this._action(room, doubleKey);
      if (doubleAction.action && doubleAction.action !== "none") {
        this._tapTimer = setTimeout(() => { this._tapTimer = null; this._runAction(room, this._action(room, tapKey)); }, 250);
      } else this._runAction(room, this._action(room, tapKey));
    }
    _doubleClick(event) {
      const target = this._interactionTarget(event);
      if (!target) return;
      event.preventDefault();
      clearTimeout(this._tapTimer); this._tapTimer = null;
      this._runAction(target.room, this._action(target.room, target.scope === "icon" ? "icon_double_tap_action" : "double_tap_action"));
    }
    _pointerDown(event) {
      const target = this._interactionTarget(event);
      if (!target || event.button > 0) return;
      const action = this._action(target.room, target.scope === "icon" ? "icon_hold_action" : "hold_action");
      if (!action.action || action.action === "none") return;
      clearTimeout(this._holdTimer);
      this._holdTimer = setTimeout(() => { this._holdTimer = null; this._holdTriggered = target.room.entity_id; this._runAction(target.room, action); }, 500);
    }
    _pointerEnd() {
      clearTimeout(this._holdTimer); this._holdTimer = null;
    }
    _change(event) {
      const input = event.target;
      const room = this._rooms().find(r => r.entity_id === input.dataset.entity);
      if (!room) return;
      if (input.dataset.field === "position" && input.value !== "" && input.checkValidity()) this._shutterService(room, "set_cover_position", Number(input.value));
      if (input.dataset.field === "temperature" && input.value !== "" && input.checkValidity()) this._service(room, "set_temperature", {temperature: Number(input.value)});
      if (input.dataset.field === "brightness" && input.value !== "" && input.checkValidity()) this._deviceService(room, "turn_on", {brightness_pct:Number(input.value)});
    }
    _updateDOM(markup) {
      const template = document.createElement("template");
      template.innerHTML = markup;
      const focused = this.shadowRoot.activeElement;
      const key = node => node?.nodeType === 1 ? node.getAttribute("data-key") : null;
      const sync = (parent, source) => {
        let current = parent.firstChild;
        for (const next of Array.from(source.childNodes)) {
          const nextKey = key(next);
          if (nextKey && key(current) !== nextKey) {
            const existing = Array.from(parent.childNodes).find(node => key(node) === nextKey);
            if (existing) { parent.insertBefore(existing, current); current = existing; }
          }
          if (!current || current.nodeType !== next.nodeType || current.nodeName !== next.nodeName || key(current) !== nextKey) {
            const added = next.cloneNode(true);
            parent.insertBefore(added, current);
            continue;
          }
          if (next.nodeType === 3) {
            if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
          } else if (next.nodeType === 1) {
            const editing = current === focused && current.localName === "input";
            const preserve = name => editing && (name === "value" || name === "disabled");
            for (const attribute of Array.from(current.attributes)) {
              if (!preserve(attribute.name) && !next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
            }
            for (const attribute of Array.from(next.attributes)) {
              if (!preserve(attribute.name) && current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
            }
            if (current.localName === "input" && !editing && current.value !== next.value) current.value = next.value;
            // state-display owns its light DOM. Recursing here replaces its
            // rendered state_content with the static fallback on every update.
            if (current.localName !== "state-display") sync(current, next);
          }
          current = current.nextSibling;
        }
        while (current) { const unused = current; current = current.nextSibling; unused.remove(); }
      };
      sync(this.shadowRoot, template.content);
    }
    _render() {
      if (!this._config || !this._hass) return;
      const rooms = this._rooms();
      const types = selectedTypes(this._config);
      const grouped = types.length > 1;
      const singleType = types[0];
      const canOff = rooms.some(r => available(r) && r.state !== "off" && r.attributes.hvac_modes?.includes("off"));
      const overriddenRooms = rooms.filter(isHeatingOverride);
      const boostedRooms = rooms.filter(room => deviceType(room) === "heating" && available(room) && room.attributes.is_boosted);
      const canCancelOverrides = overriddenRooms.some(room =>
        room.attributes.preset_modes?.includes("Cancel Overrides"));
      const boostModes = [["Boost 30m","30_minutes"], ["Boost 1h","1_hour"], ["Boost 2h","2_hours"], ["Boost 3h","3_hours"]];
      const canBoostMode = mode => rooms.some(room => deviceType(room) === "heating" && available(room) && room.attributes.preset_modes?.includes(mode));
      const canCancelBoosts = boostedRooms.some(room => room.attributes.preset_modes?.includes("Cancel Overrides"));
      const boostRemaining = boostedRooms.map(overrideMinutes).filter(Number.isFinite);
      const boostCountdown = boostRemaining.length ? text(this._hass,"minutes_short",{count:Math.min(...boostRemaining)}) : "";
      const canFollowSchedule = this._heatingScheduleTargets().length > 0;
      const canClose = rooms.some(room => isShutter(room) && available(room) && room.state !== "closed" && (room.attributes.supported_features & 2));
      const canTurnOff = type => rooms.some(state => deviceType(state) === type && available(state) && state.state === "on");
      const canResume = type => this._scheduleModeTargets(type).length > 0;
      const allOffTitle = escape(text(this._hass,"turn_all_off",{devices:text(this._hass,"heating")}));
      const allOffAction = section => `<ha-button class="off${section ? " section-action" : ""}" data-action="all-off" size="m" appearance="filled" variant="danger" ${this._busy || !canOff ? "disabled" : ""} title="${allOffTitle}" aria-label="${allOffTitle}"><ha-icon slot="start" icon="mdi:power"></ha-icon><span class="action-label">${escape(text(this._hass,"all_off"))}</span></ha-button>`;
      const cancelOverridesTitle = escape(text(this._hass,"cancel_all_title"));
      const cancelOverridesAction = section => boostedRooms.length ? "" : `<ha-button class="off cancel-overrides${section ? " section-action" : ""}" data-action="cancel-overrides" size="m" appearance="filled" variant="brand" ${this._busy || !canCancelOverrides ? "disabled" : ""} title="${cancelOverridesTitle}" aria-label="${cancelOverridesTitle}"><ha-icon slot="start" icon="mdi:restore"></ha-icon><span class="action-label">${escape(text(this._hass,"cancel_overrides"))}${overriddenRooms.length ? ` (${overriddenRooms.length})` : ""}</span></ha-button>`;
      const followScheduleTitle = escape(text(this._hass,"follow_schedule_title"));
      const followScheduleAction = section => `<ha-button class="off follow-schedule${section ? " section-action" : ""}" data-action="follow-schedule" size="m" appearance="filled" variant="brand" ${this._busy || !canFollowSchedule ? "disabled" : ""} title="${followScheduleTitle}" aria-label="${followScheduleTitle}"><ha-icon slot="start" icon="mdi:calendar-sync"></ha-icon><span class="action-label">${escape(text(this._hass,"follow_schedule"))}</span></ha-button>`;
      const boostTitle = escape(text(this._hass,"boost_all_title"));
      const cancelBoostsTitle = escape(text(this._hass,"cancel_all_boosts_title"));
      const boostAction = section => boostedRooms.length
        ? `<ha-button class="off cancel-all-boosts${section ? " section-action" : ""}" data-action="cancel-all-boosts" size="m" appearance="filled" variant="brand" ${this._busy || !canCancelBoosts ? "disabled" : ""} title="${cancelBoostsTitle}" aria-label="${cancelBoostsTitle}"><ha-icon slot="start" icon="mdi:fire-off"></ha-icon><span class="action-label"><span>${escape(text(this._hass,"cancel_all"))}</span>${boostCountdown ? `<small>${escape(boostCountdown)}</small>` : ""}</span></ha-button>`
        : `<div class="boost-menu" data-action="boost-all"><ha-button class="off boost-all${section ? " section-action" : ""}" data-action="boost-menu" size="m" appearance="filled" variant="danger" ${this._busy || !boostModes.some(([mode]) => canBoostMode(mode)) ? "disabled" : ""} title="${boostTitle}" aria-label="${boostTitle}" aria-haspopup="menu" aria-expanded="${this._boostMenuOpen}"><ha-icon slot="start" icon="mdi:fire"></ha-icon><span class="action-label">${escape(text(this._hass,"boost_all"))}</span></ha-button>${this._boostMenuOpen ? `<div class="boost-options" role="menu">${boostModes.map(([mode,label]) => `<button role="menuitem" data-action="boost-duration" data-boost-mode="${mode}" ${canBoostMode(mode) ? "" : "disabled"}>${escape(text(this._hass,label))}</button>`).join("")}</div>` : ""}</div>`;
      const heatingActions = section => `<div class="bulk-actions">${boostAction(section)}${followScheduleAction(section)}${cancelOverridesAction(section)}${allOffAction(section)}</div>`;
      const closeAllTitle = escape(text(this._hass,"close_all_title"));
      const closeAllAction = section => `<ha-button class="off close-all${section ? " section-action" : ""}" data-action="all-close" size="m" appearance="filled" variant="brand" ${this._busy || !canClose ? "disabled" : ""} title="${closeAllTitle}" aria-label="${closeAllTitle}"><ha-icon slot="start" icon="mdi:window-shutter"></ha-icon><span class="action-label">${escape(text(this._hass,"close_all"))}</span></ha-button>`;
      const deviceOffAction = (type, section) => {
        const title = escape(text(this._hass,"turn_all_off",{devices:text(this._hass,type)}));
        return `<ha-button class="off device-off${section ? " section-action" : ""}" data-action="all-${type}-off" size="m" appearance="filled" variant="brand" ${this._busy || !canTurnOff(type) ? "disabled" : ""} title="${title}" aria-label="${title}"><ha-icon slot="start" icon="mdi:power"></ha-icon><span class="action-label">${escape(text(this._hass,"all_off"))}</span></ha-button>`;
      };
      const resumeSchedulesAction = (type, section) => {
        const title = escape(text(this._hass,"return_schedules",{devices:text(this._hass,type)}));
        return `<ha-button class="off resume-schedules${section ? " section-action" : ""}" data-action="resume-${type}" size="m" appearance="filled" variant="brand" ${this._busy || !canResume(type) ? "disabled" : ""} title="${title}" aria-label="${title}"><ha-icon slot="start" icon="mdi:calendar-sync"></ha-icon><span class="action-label">${escape(text(this._hass,"resume_schedules"))}</span></ha-button>`;
      };
      const scheduledDeviceActions = (type, section) => `<div class="bulk-actions">${resumeSchedulesAction(type, section)}${type === "shutters" ? closeAllAction(section) : deviceOffAction(type, section)}</div>`;
      const headerAction = grouped ? "" : singleType === "heating" ? heatingActions(false) : scheduledDeviceActions(singleType, false);
      const unit = this._hass.config?.unit_system?.temperature || "°C";
      const groups = grouped
        ? [{key:"heating", title:text(this._hass,"heating"), rooms:rooms.filter(room => deviceType(room) === "heating")},
           {key:"shutters", title:text(this._hass,"shutters"), rooms:rooms.filter(isShutter)},
           {key:"lights", title:text(this._hass,"lights"), rooms:rooms.filter(isLight)},
           {key:"plugs", title:text(this._hass,"plugs"), rooms:rooms.filter(isPlug)}].filter(group => types.includes(group.key) && group.rooms.length)
        : [{key:singleType, title:"", rooms}];
      const groupStatus = group => {
        const total = group.rooms.length;
        const unavailable = group.rooms.filter(room => !available(room)).length;
        const heating = group.key === "heating" ? group.rooms.filter(room => available(room) && room.state !== "off" && room.attributes.hvac_action === "heating").length : 0;
        const cooling = group.key === "heating" ? group.rooms.filter(room => available(room) && room.state !== "off" && room.attributes.hvac_action === "cooling").length : 0;
        const active = group.rooms.filter(room => available(room) && (group.key === "heating"
          ? room.state !== "off" && ["heating","cooling"].includes(room.attributes.hvac_action)
          : group.key === "shutters" ? room.state !== "closed" : room.state === "on")).length;
        const plural = new Intl.PluralRules(languageFor(this._hass)).select(total) === "one" ? "one" : "other";
        const noun = text(this._hass,`${group.key === "heating" ? "room" : group.key === "shutters" ? "shutter" : group.key === "lights" ? "light" : "plug"}_${plural}`);
        const state = text(this._hass, group.key === "heating" ? cooling && !heating ? "cooling" : cooling ? "heating_or_cooling" : "heating" : group.key === "shutters" ? "open" : "on").toLocaleLowerCase(languageFor(this._hass));
        const overrides = group.key === "heating" ? group.rooms.filter(isHeatingOverride) : [];
        const remaining = overrides.map(overrideMinutes).filter(Number.isFinite);
        const overrideStatus = overrides.length ? ` · ${overrides.length} ${text(this._hass,`override_${overrides.length === 1 ? "one" : "other"}`)}${remaining.length ? ` · ${text(this._hass,"next_ends",{time:formatDuration(Math.min(...remaining))})}` : ""}` : "";
        return `${text(this._hass,"group_status",{active,total,noun,state})}${overrideStatus}${unavailable ? ` · ${text(this._hass,"unavailable_count",{count:unavailable})}` : ""}`;
      };
      const configuredTitle = String(this._config.title ?? text(this._hass,"wiser_controls")).trim();
      const title = this._config._panel_hide_title
        ? ""
        : configuredTitle || (!grouped && groups.length ? text(this._hass, singleType) : "");
      const headerStatus = grouped || !groups.length ? "" : `<p>${groupStatus(groups[0])}</p>`;
      const cardHeader = title || headerStatus || headerAction
        ? `<header data-key="header" class="${title ? "" : "titleless"}"><div>${title ? `<h2>${escape(title)}</h2>` : ""}${headerStatus}</div>${headerAction}</header>`
        : "";
      const preview = isEditorPreview(this);
      const masterPreview = preview && masterMode(this._config);
      const configuredPreviewRoom = this._config[PREVIEW_ROOM];
      const previewRoom = configuredPreviewRoom && rooms.some(room => room.entity_id === configuredPreviewRoom)
        ? configuredPreviewRoom : masterPreview ? rooms[0]?.entity_id : configuredPreviewRoom;
      // Orbit expands a selected item to its normal grid width (six of twelve by default).
      const expandPreview = preview && !masterPreview && this._config.device_columns > 2;
      const markup = `<style data-key="style">
        :host {
          display:block;
          container-type:inline-size
        }
        ha-card {
          overflow:hidden
        }
        .room-section {
          border-top:1px solid var(--divider-color)
        }
        .room-section+.room-section {
          margin-top:8px
        }
        .section-title {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:8px;
          margin:0;
          padding:10px 16px;
          background:transparent
        }
        .section-title h3 {
          font-size:18px;
          font-weight:500;
          margin:0
        }
        .rooms {
          display:grid;
          grid-template-columns:repeat(var(--room-columns),minmax(0,1fr))
        }
        .room {
          min-width:0
        }
        .room-content {
          container-type:inline-size;
          container-name:room
        }
        .room.preview-selected {
          isolation:isolate;
          position:relative
        }
        .room.preview-selected::before {
          border:2px solid var(--primary-color);
          border-radius:inherit;
          box-sizing:border-box;
          content:"";
          inset:0;
          pointer-events:none;
          position:absolute;
          z-index:100
        }
        .rooms.preview-rows {
          display:block
        }
        .preview-row {
          display:flex;
          width:100%
        }
        .preview-row>.room {
          flex:1 1 0;
          box-sizing:border-box;
          overflow:hidden
        }
        .preview-row>.room.preview-selected {
          flex:1 1 0
        }
        .preview-row:has(.preview-selected) {
          align-items:stretch;
          flex-wrap:nowrap
        }
        .preview-spacer {
          flex:1 1 0;
          min-width:0
        }
        header {
          padding:14px 16px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:8px
        }
        h2 {
          font-size:18px;
          font-weight:500;
          margin:0 0 3px
        }
        p {
          margin:0;
          color:var(--secondary-text-color);
          font-size:12px
        }
        button,input {
          font:inherit;
          color:var(--primary-text-color);
          box-sizing:border-box
        }
        button {
          cursor:pointer;
          border:0;
          border-radius:10px;
          min-height:36px;
          padding:6px;
          background:var(--secondary-background-color)
        }
        button:disabled,input:disabled {
          opacity:.45;
          cursor:default
        }
        button:focus-visible,input:focus-visible {
          outline:2px solid var(--primary-color);
          outline-offset:2px
        }
        .off {
          --ha-button-height:48px;
          --ha-color-on-disabled-normal:var(--secondary-text-color);
          flex-shrink:0
        }
        .off ha-icon {
          --mdc-icon-size:26px
        }
        .bulk-actions {
          display:flex;
          align-items:center;
          justify-content:flex-end;
          flex-wrap:wrap;
          gap:4px
        }
        .boost-menu {
          position:relative;
          flex-shrink:0
        }
        .boost-options {
          position:absolute;
          z-index:20;
          inset:calc(100% + 6px) auto auto 0;
          min-width:140px;
          padding:6px 0;
          border:1px solid var(--divider-color);
          border-radius:10px;
          background:var(--card-background-color,var(--ha-card-background,var(--primary-background-color)));
          box-shadow:var(--ha-card-box-shadow,0 2px 8px rgba(0,0,0,.3))
        }
        .boost-options button {
          display:block;
          width:100%;
          min-height:40px;
          padding:8px 16px;
          border-radius:0;
          background:transparent;
          text-align:left;
          white-space:nowrap
        }
        .boost-options button:hover:not(:disabled),.boost-options button:focus-visible {
          background:var(--secondary-background-color)
        }
        .cancel-all-boosts .action-label {
          display:flex;
          flex-direction:column;
          align-items:flex-start;
          line-height:16px
        }
        .cancel-all-boosts .action-label small {
          color:var(--secondary-text-color);
          font-size:11px;
          font-weight:400
        }
        .room {
          padding:10px 16px;
          border-top:1px solid var(--divider-color)
        }
        .top {
          display:grid;
          grid-template-columns:38px auto minmax(0,1fr);
          align-items:center;
          column-gap:10px;
          row-gap:0
        }
        .room-heading,.identity,.readings {
          display:contents
        }
        .top .state-icon {
          grid-column:1;
          grid-row:1 / 3;
          align-self:start;
          transform:translateY(5px)
        }
        .top .name {
          grid-column:2 / -1;
          grid-row:1;
          min-height:0;
          line-height:24px
        }
        .identity>.status {
          grid-column:2;
          grid-row:2;
          justify-self:start;
          margin-top:0;
          line-height:18px
        }
        .top .temps {
          grid-column:3;
          grid-row:2;
          line-height:24px;
          justify-self:end;
          text-align:right
        }
        .readings .next {
          grid-column:2 / -1;
          grid-row:3;
          justify-self:end;
          max-width:100%;
          white-space:normal;
          min-width:0;
          margin-top:2px;
          line-height:18px
        }
        .top.inline-readings .name {
          grid-column:2
        }
        .top.inline-readings .temps {
          grid-row:1
        }
        .top.inline-readings .next {
          grid-row:2;
          max-width:calc(100% - var(--status-width,40px) - 10px)
        }
        .state-icon {
          border-radius:50%;
          height:38px;
          width:38px;
          min-width:38px;
          display:grid;
          place-items:center;
          color:var(--room-state-color);
          background:color-mix(in srgb,var(--room-state-color) 20%,transparent)
        }
        ha-icon,ha-state-icon {
          --mdc-icon-size:24px;
          pointer-events:none
        }
        .controls button {
          display:grid;
          place-items:center
        }
        .controls ha-icon {
          width:22px;
          height:22px;
          --mdc-icon-size:22px
        }
        .name {
          flex:1;
          min-width:0;
          padding:0;
          background:none;
          text-align:left
        }
        .name strong {
          display:inline-block;
          max-width:100%;
          vertical-align:middle;
          font-size:14px;
          font-weight:500;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap
        }
        .status {
          display:block;
          font-size:12px;
          color:var(--secondary-text-color);
          margin-top:3px
        }
        .temps {
          font-size:22px;
          white-space:nowrap;
          font-variant-numeric:tabular-nums
        }
        .temps small {
          font-size:18px;
          color:var(--secondary-text-color)
        }
        .controls>.modes {
          order:var(--feature-modes)
        }
        .controls>input,.controls>button:not([data-action='advance']) {
          order:var(--feature-temperature)
        }
        .controls>button[data-action='advance'] {
          order:var(--feature-advance)
        }
        .controls {
          display:flex;
          gap:4px;
          align-items:center;
          margin-top:8px
        }
        input {
          min-width:0;
          min-height:36px;
          border:0;
          border-radius:8px;
          padding:6px;
          background:var(--secondary-background-color);
          font-size:13px
        }
        input {
          flex:0 1 76px;
          min-width:64px;
          width:76px;
          height:40px;
          min-height:40px;
          font-size:18px;
          font-variant-numeric:tabular-nums;
          text-align:right
        }
        .controls button {
          width:40px;
          height:40px;
          min-height:40px;
          flex-shrink:0
        }
        .modes {
          display:flex;
          flex:1 1 120px;
          min-width:108px;
          border-radius:10px;
          background:var(--secondary-background-color);
          overflow:hidden
        }
        .controls .mode {
          flex:1 1 40px;
          min-width:36px;
          width:40px;
          border-radius:10px;
          background:transparent
        }
        .controls .mode.active {
          color:var(--text-primary-color,#fff);
          background:var(--room-state-color)
        }
        .next {
          min-width:0;
          margin-top:2px;
          text-align:right;
          font-size:12px;
          color:var(--secondary-text-color);
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap
        }
        .message {
          padding:12px 16px;
          line-height:1.5
        }
        .error {
          color:var(--error-color)
        }
        @container (max-width: 480px) {
          header {
            display:grid;
            grid-template-columns:minmax(0,1fr) auto;
            align-items:start;
            gap:10px
          }
          header h2 {
            white-space:nowrap
          }
          header .bulk-actions {
            width:auto;
            flex-wrap:nowrap;
            justify-content:flex-end
          }
          header .bulk-actions .off {
            --ha-button-height:40px;
            flex:0 0 44px;
            width:44px;
            min-width:44px;
            position:relative
          }
          .bulk-actions .action-label {
            display:none
          }
          header .bulk-actions .off ha-icon {
            position:absolute;
            inset:50% auto auto 50%;
            margin:0;
            transform:translate(-50%,-50%)
          }
          .section-title {
            display:grid;
            grid-template-columns:minmax(0,1fr) auto;
            align-items:flex-start;
            gap:10px
          }
          .section-title .bulk-actions {
            width:auto;
            flex-wrap:nowrap;
            justify-content:flex-end
          }
          .section-title .bulk-actions .off {
            --ha-button-height:40px;
            flex:0 0 44px;
            width:44px;
            min-width:44px;
            position:relative
          }
          .section-title .bulk-actions .off ha-icon {
            position:absolute;
            inset:50% auto auto 50%;
            margin:0;
            transform:translate(-50%,-50%)
          }
        }
        @container (max-width: 340px) {
          header {
            padding:12px
          }
          .room {
            padding:10px 12px
          }
          .top {
            column-gap:8px;
            row-gap:0
          }
          .top .temps {
            font-size:20px
          }
          .top .temps small {
            font-size:16px
          }
        }
        @container room (max-width: 210px) {
          .top .temps {
            font-size:18px
          }
          .top .temps small {
            font-size:15px
          }
          .controls {
            flex-wrap:wrap
          }
          .modes {
            flex-basis:100%;
            min-width:0
          }
          .controls .mode {
            min-width:0
          }
          .controls input {
            flex:1 1 64px
          }
        }
        .top.has-secondary {
          grid-template-columns:38px minmax(0,1fr);
          align-items:start
        }
        .top.has-secondary .state-icon {
          grid-column:1;
          grid-row:1 / 4
        }
        .secondary-layout {
          grid-column:2;
          min-width:0
        }
        .secondary-heading-line,.secondary-primary-line {
          display:flex;
          align-items:baseline;
          justify-content:space-between;
          gap:10px;
          min-width:0
        }
        .secondary-heading-line .name {
          min-width:0;
          line-height:20px
        }
        .secondary-heading-line .temps {
          flex:0 0 auto;
          line-height:24px;
          text-align:right
        }
        .secondary-primary-line .status {
          flex:0 0 auto;
          margin:0;
          line-height:18px
        }
        .secondary-primary-line .next {
          flex:1 1 auto;
          min-width:0;
          max-width:none;
          margin:0;
          line-height:18px;
          white-space:normal;
          overflow:visible;
          text-overflow:clip;
          text-align:right
        }
        .secondary-primary-line wiser-secondary-status-feature {
          flex:1 1 auto;
          overflow:hidden
        }
        .secondary-layout wiser-secondary-status-feature {
          min-width:0;
          line-height:16px
        }
        hui-card-features.features-bottom {
          display:block;
          margin-top:8px
        }
        .features-bottom-row {
          display:flex;
          align-items:stretch;
          gap:4px;
          margin-top:8px;
          min-width:0
        }
        .features-bottom-row>hui-card-features {
          display:block;
          flex:1 1 0;
          min-width:0;
          margin-top:0
        }
        .features-bottom-row>hui-card-features.feature-icon-only {
          flex:0 0 var(--feature-height,40px)
        }
        .features-inline-row {
          display:flex;
          align-items:stretch;
          gap:4px;
          margin-top:8px;
          min-width:0
        }
        .features-inline-row>hui-card-features {
          display:block;
          flex:1 1 0;
          min-width:0
        }
        .features-inline-row>hui-card-features.feature-icon-only {
          flex:0 0 var(--feature-height,40px)
        }
        .top.hide-status .status,.top.hide-temps .temps,.top.hide-next .next {
          display:none
        }
        .state-icon img {
          width:100%;
          height:100%;
          object-fit:cover;
          border-radius:50%
        }
        .status state-display {
          display:inline;
          max-width:100%;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap
        }
        .status-item,.status-separator {
          display:inline
        }
        /* Match native ha-control-select / ha-control-number-buttons backgrounds. */
        .controls {
          --wiser-control-background:color-mix(in srgb,var(--disabled-color) 20%,transparent)
        }
        .controls .modes,.controls>button,.controls>input {
          background:var(--wiser-control-background)
        }
        .controls button:disabled,.controls input:disabled {
          opacity:1;
          color:var(--disabled-color);
          -webkit-text-fill-color:var(--disabled-color)
        }
        .controls input[data-field='temperature']:disabled {
          color:var(--secondary-text-color);
          -webkit-text-fill-color:var(--secondary-text-color)
        }
        .controls .mode.active:disabled {
          background:var(--disabled-color);
          color:white;
          -webkit-text-fill-color:white
        }
        .editor-preview .room {
          padding:8px 4px
        }
        .editor-preview .preview-placeholder {
          display:flex;
          align-items:center;
          justify-content:center;
          gap:6px;
          min-height:64px;
          color:var(--secondary-text-color);
          font-size:12px;
          text-align:center;
          overflow-wrap:anywhere
        }
        .preview-placeholder ha-icon {
          flex-shrink:0;
          --mdc-icon-size:18px
        }
        .preview-placeholder span {
          min-width:0
        }
        .editor-preview .room.preview-selected {
          padding:10px 16px
        }
        .editor-preview .preview-row>.room.preview-selected {
          flex:0 0 var(--preview-room-width,50%);
          max-width:100%
        }
        .editor-preview .preview-row:has(.preview-selected) {
          align-items:flex-start;
          flex-wrap:wrap
        }
      </style><ha-card data-key="card" class="${preview ? "editor-preview" : ""}">${cardHeader}
          ${this._error ? `<div data-key="error" class="message error" role="alert">${escape(this._error)}${this._discoveryFailed ? '<ha-button data-action="retry" size="s" appearance="outlined" variant="danger">Retry</ha-button>' : ""}</div>` : ""}
      ${!rooms.length ? `<p data-key="empty" class="message">${this._loading ? text(this._hass,"finding") : text(this._hass,"no_devices")}</p>` : groups.map(group => `${grouped ? `<section class="room-section" data-key="section-${group.key}"><div class="section-title" data-key="heading-${group.key}"><div><h3>${group.title}</h3><p>${groupStatus(group)}</p></div>${group.key === "heating" ? heatingActions(true) : scheduledDeviceActions(group.key, true)}</div>` : ""}<div class="rooms ${expandPreview ? "preview-rows" : ""}" data-key="rooms-${group.key}" style="--room-columns:${masterPreview ? 1 : this._config.device_columns}">${group.rooms.map((room, index) => {
        const options = roomConfig(this._config, room.entity_id);
        const columns = this._config.device_columns;
        const rowStart = expandPreview && index % columns === 0 ? `<div class="preview-row" data-key="preview-row-${Math.floor(index / columns)}">` : "";
        const rowEnd = expandPreview && (index % columns === columns - 1 || index === group.rooms.length - 1)
          ? `${index === group.rooms.length - 1 ? '<div class="preview-spacer"></div>'.repeat((columns - group.rooms.length % columns) % columns) : ""}</div>` : "";
        if (preview && previewRoom !== room.entity_id) {
          if (masterPreview) return "";
          return `${rowStart}<section data-key="${escape(room.entity_id)}" class="room preview-placeholder"><ha-icon icon="mdi:${isShutter(room) ? "window-shutter" : isLight(room) ? "lightbulb-outline" : isPlug(room) ? "power-socket-uk" : "home-thermometer-outline"}"></ha-icon><span>${escape(this._name(room))}</span></section>${rowEnd}`;
        }
        if (isShutter(room)) return `${rowStart}${this._renderShutter(room, preview, previewRoom)}${rowEnd}`;
        if (isLight(room) || isPlug(room)) return `${rowStart}${this._renderPoweredDevice(room, preview, previewRoom)}${rowEnd}`;
        const a = room.attributes, id = escape(room.entity_id);
        const pending = this._targets.get(room.entity_id);
        if (pending && (Date.now() > pending.expires || (!this._temperatureSending && a.temperature === pending.value))) this._targets.delete(room.entity_id);
        const targetTemperature = this._targets.get(room.entity_id)?.value ?? a.temperature;
        const heating = available(room) && room.state !== "off" && a.hvac_action === "heating";
        const cooling = available(room) && room.state !== "off" && a.hvac_action === "cooling";
        const active = heating || cooling;
        const status = !available(room) ? text(this._hass,"unavailable") : room.state === "off" ? text(this._hass,"off") : heating ? text(this._hass,"heating") : cooling ? text(this._hass,"cooling") : text(this._hass,"idle");
        const disabled = this._busy || !available(room) ? "disabled" : "";
        const ranged = typeof a.target_temp_low === "number" && typeof a.target_temp_high === "number";
        const target = ranged ? `${this._temperature(a.target_temp_low)} – ${this._temperature(a.target_temp_high)}` : this._temperature(targetTemperature);
        const scheduled = Boolean(a.schedule_id);
        const icon = !available(room) ? "mdi:alert-circle-outline" : room.state === "off" ? "mdi:power" : heating ? "mdi:radiator" : cooling ? "mdi:snowflake" : "mdi:radiator-disabled";
        const nextDate = a.next_schedule_datetime ? new Date(a.next_schedule_datetime) : null;
        const nextTime = nextDate && Number.isFinite(nextDate.getTime()) ? nextDate.toLocaleString(this._hass.locale?.language || this._hass.language, {weekday:"short",hour:"2-digit",minute:"2-digit"}) : a.next_schedule_change;
        const next = room.state !== "auto" ? "" : scheduled && nextTime ? `${text(this._hass,"next")} ${nextTime} · ${this._temperature(a.next_schedule_temp)}` : scheduled ? a.schedule_name : text(this._hass,"no_schedule");
        // Match the native tile's climate state colour and theme fallbacks.
        const mode = ["auto", "heat", "cool", "off"].includes(room.state) ? room.state : "off";
        const colorMode = cooling ? "cool" : heating ? "heat" : mode;
        const activity = colorMode === "off" ? "inactive" : "active";
        const stateColor = available(room)
          ? `var(--state-climate-${colorMode}-color,var(--state-climate-${activity}-color,var(--state-${activity}-color,var(--secondary-text-color))))`
          : "var(--state-unavailable-color,var(--disabled-text-color))";
        const secondary = this._secondaryMarkup(room);
        const temperatureMarkup = options.temperature_focus === "target"
          ? `<small>${escape(this._temperature(a.current_temperature))}</small> ${escape(target)}`
          : `${escape(this._temperature(a.current_temperature))}<small> ${escape(target)}</small>`;
        const statusMarkup = this._contentStatus(room, status + (a.is_boosted ? " · Boost" : a.is_override ? " · Override" : ""));
        const headerMarkup = secondary ? `<div class="top has-secondary ${this._contentClass(options)}"><button class="state-icon" data-entity="${id}" data-interaction="icon" title="${escape(status)} — open room controls" aria-label="${escape(this._name(room))}: ${status}">${this._contentIcon(room, icon)}</button>
          <div class="secondary-layout"><div class="secondary-heading-line"><button class="name" data-entity="${id}" data-interaction="card" title="Open room controls"><strong>${escape(this._name(room))}</strong></button><div class="temps" title="Current ${escape(unit)} → target ${escape(unit)}" aria-label="Current ${escape(this._temperature(a.current_temperature))}; Target ${escape(target)}">${temperatureMarkup}</div></div>
          <div class="secondary-primary-line"><span class="status">${statusMarkup}</span>${options.hide_state ? secondary : ""}<div class="next" title="${escape(a.schedule_name || "")}">${escape(next)}</div></div>${options.hide_state ? "" : secondary}</div></div>`
          : `<div class="top ${this._contentClass(options)}"><button class="state-icon" data-entity="${id}" data-interaction="icon" title="${escape(status)} — open room controls" aria-label="${escape(this._name(room))}: ${status}">${this._contentIcon(room, icon)}</button>
          <div class="room-heading"><div class="identity"><button class="name" data-entity="${id}" data-interaction="card" title="Open room controls"><strong>${escape(this._name(room))}</strong></button><span class="status">${statusMarkup}</span></div>
          <div class="readings"><div class="temps" title="Current ${escape(unit)} → target ${escape(unit)}" aria-label="Current ${escape(this._temperature(a.current_temperature))}; Target ${escape(target)}">${temperatureMarkup}</div>
          <div class="next" title="${escape(a.schedule_name || "")}">${escape(next)}</div></div></div></div>`;
        return `${rowStart}<section data-key="${id}" class="room ${heating ? "heating" : cooling ? "cooling" : ""} ${preview && previewRoom === room.entity_id ? "preview-selected" : ""}" style="--room-state-color:${this._contentColor(room, stateColor)};${featureOrder(options)}"><div class="room-content">
          ${headerMarkup}
          ${this._nativeReady || options.features !== undefined ? this._nativeMarkup(room) : fallbackFeatures(options).length ? `<div class="controls">${fallbackFeatures(options).includes("modes") ? `<div class="modes" role="group" aria-label="${escape(this._name(room))} mode">${["auto", "heat", "cool", "off"].filter(mode => a.hvac_modes?.includes(mode)).map(mode => {
            const label = text(this._hass,{auto:"schedule",heat:"manual",cool:"cool",off:"off"}[mode]);
            const modeIcon = {auto:"mdi:thermostat-auto",heat:"mdi:fire",cool:"mdi:snowflake",off:"mdi:power"}[mode];
            return `<button class="mode ${mode === room.state ? "active" : ""}" data-action="mode" data-entity="${id}" data-mode="${mode}" aria-pressed="${mode === room.state}" aria-label="${label}" title="${label}" ${disabled || mode === "auto" && !scheduled ? "disabled" : ""}><ha-icon icon="${modeIcon}"></ha-icon></button>`;
          }).join("")}</div>` : ""}
          ${fallbackFeatures(options).includes("temperature") ? (ranged ? `<button data-entity="${id}" title="${escape(text(this._hass,"adjust_temperature_range"))}" aria-label="${escape(text(this._hass,"adjust_temperature_range"))}"><ha-icon icon="mdi:thermostat"></ha-icon></button>` : `<input type="number" data-entity="${id}" data-field="temperature" aria-label="${escape(this._name(room))} ${escape(text(this._hass,"target").toLowerCase())}" title="${escape(text(this._hass,"target"))} ${escape(unit)}" value="${typeof targetTemperature === "number" ? targetTemperature : ""}" min="${a.min_temp ?? 5}" max="${a.max_temp ?? 30}" step="${a.target_temp_step || .5}" ${disabled || room.state === "off" ? "disabled" : ""}>`) : ""}
          ${fallbackFeatures(options).includes("advance") ? `<button data-action="advance" data-entity="${id}" aria-label="${escape(text(this._hass,"advance_schedule_for",{name:this._name(room)}))}" title="${escape(text(this._hass,"advance_schedule"))}" ${disabled || !scheduled || room.state !== "auto" || !a.preset_modes?.includes("Advance Schedule") ? "disabled" : ""}><ha-icon icon="mdi:calendar-arrow-right"></ha-icon></button>` : ""}</div>` : ""}</div></section>${rowEnd}`;
      }).join("")}</div>${grouped ? "</section>" : ""}`).join("")}</ha-card>`;
      this._updateDOM(markup);
      this._syncNativeFeatures();
      this._layoutHeaders();
    }
  }
  class WiserSecondaryStatusFeature extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({mode:"open"});
      const style = document.createElement("style");
      style.textContent = `:host{display:block;pointer-events:auto;min-width:0}button{display:block;width:100%;padding:0;border:0;background:none;color:var(--secondary-text-color);font:inherit;font-size:12px;text-align:start;cursor:pointer}button:focus-visible{outline:2px solid var(--primary-color)}state-display{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.unlabelled,.labelled{display:flex;min-width:0;gap:6px;overflow:hidden}.unlabelled[hidden],.labelled[hidden]{display:none!important}.unlabelled-item,.labelled-item{display:flex;min-width:0;gap:3px;white-space:nowrap}.unlabelled-item+.unlabelled-item::before{content:"·"}.label{color:var(--secondary-text-color)}.label::after{content:":"}`;
      this._button = document.createElement("button");
      this._button.type = "button";
      this._unlabelled = document.createElement("span");
      this._unlabelled.className = "unlabelled";
      this._labelled = document.createElement("span");
      this._labelled.className = "labelled";
      this._button.append(this._unlabelled, this._labelled);
      this._button.addEventListener("click", event => {
        event.stopPropagation();
        const id = this._config?.entity || this._context?.entity_id || this._stateObj?.entity_id;
        if (id && this._hass?.states[id]) this.dispatchEvent(new CustomEvent("hass-more-info", {bubbles:true, composed:true, detail:{entityId:id}}));
      });
      this.shadowRoot.append(style, this._button);
    }
    static getStubConfig() { return {type:`custom:${SECONDARY_STATUS_FEATURE}`, state_content:["state"]}; }
    static getConfigElement() { return document.createElement("wiser-secondary-status-feature-editor"); }
    setConfig(config) {
      this._config = {...config};
      this._config.state_content = normalizedStateContent(this._config.state_content);
      if (this._config.override_end_time) {
        this._config.state_content = [...new Set([...this._config.state_content, "override_end_time"])];
        delete this._config.override_end_time;
      }
      this._render();
    }
    set hass(value) { this._hass = value; this._render(); }
    set context(value) { this._context = value; this._render(); }
    set stateObj(value) { this._stateObj = value; this._render(); }
    _render() {
      if (!this._hass || !this._config) return;
      const id = this._config.entity || this._context?.entity_id || this._stateObj?.entity_id;
      const state = this._hass.states[id];
      const content = normalizedStateContent(this._config.state_content);
      const showLabels = this._config.show_labels === true;
      this._button.disabled = !state;
      this._unlabelled.hidden = !state || showLabels;
      this._labelled.hidden = !state || !showLabels;
      this._button.title = state
        ? entityDisplayName(this._hass, state)
        : id || text(this._hass,"secondary_status");
      const displayState = withOverrideEnd(state, this._hass);
      this._unlabelled.innerHTML = "";
      this._unlabelDisplays = content.map(item => {
        const row = document.createElement("span");
        row.className = "unlabelled-item";
        row.title = stateContentLabel(this._hass, state, item);
        const display = document.createElement("state-display");
        display.hass = this._hass;
        display.stateObj = displayState;
        display.content = [item];
        display.timestampTooltip = true;
        row.append(display);
        this._unlabelled.append(row);
        return {row,display};
      });
      this._labelled.innerHTML = "";
      this._labelDisplays = content.map(item => {
        const row = document.createElement("span");
        row.className = "labelled-item";
        row.title = stateContentLabel(this._hass, state, item);
        const label = document.createElement("span");
        label.className = "label";
        label.textContent = row.title;
        const display = document.createElement("state-display");
        display.hass = this._hass;
        display.stateObj = displayState;
        display.content = [item];
        display.timestampTooltip = true;
        row.append(label, display);
        this._labelled.append(row);
        return {label,display};
      });
    }
  }
  class WiserSecondaryStatusFeatureEditor extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({mode:"open"});
      this._form = document.createElement("ha-form");
      this._form.computeLabel = schema => schema.label || text(this._hass, schema.name === "entity" ? "entity" : "state_content");
      this._form.schema = [
        {name:"entity", selector:{entity:{}}},
        {name:"state_content", selector:{ui_state_content:{allow_context:true}}},
      ];
      this._form.addEventListener("value-changed", event => {
        event.stopPropagation();
        const value = {...event.detail.value};
        const rooms = this._context?.wiser_master ? this._context.wiser_rooms || [] : [];
        if (rooms.length) {
          const entities = {...(this._config.entities || {})};
          rooms.forEach((room, index) => {
            const entity = value[`room_${index}`];
            if (entity && entity !== room.entity_id) entities[room.entity_id] = entity;
            else delete entities[room.entity_id];
          });
          this._config = {...this._config,state_content:normalizedStateContent(value.state_content),type:`custom:${SECONDARY_STATUS_FEATURE}`};
          if (value.show_labels) this._config.show_labels = true;
          else delete this._config.show_labels;
          delete this._config.entity;
          if (Object.keys(entities).length) this._config.entities = entities;
          else delete this._config.entities;
        } else {
          if (!value.entity || value.entity === this._context?.entity_id) delete value.entity;
          this._config = {...this._config, ...value,state_content:normalizedStateContent(value.state_content),type:`custom:${SECONDARY_STATUS_FEATURE}`};
          if (!value.entity) delete this._config.entity;
          if (!value.show_labels) delete this._config.show_labels;
        }
        this.dispatchEvent(new CustomEvent("config-changed", {bubbles:true, composed:true, detail:{config:this._config}}));
      });
      this.shadowRoot.append(this._form);
    }
    setConfig(config) {
      this._config = {...config};
      this._config.state_content = normalizedStateContent(this._config.state_content);
      if (this._config.override_end_time) {
        this._config.state_content = [...new Set([...this._config.state_content, "override_end_time"])];
        delete this._config.override_end_time;
      }
      this._render();
    }
    set hass(value) { this._hass = value; this._render(); }
    set context(value) { this._context = value; this._render(); }
    _render() {
      if (!this._hass || !this._config) return;
      const rooms = this._context?.wiser_master ? this._context.wiser_rooms || [] : [];
      const mappedEntity = this._config.entities?.[this._context?.entity_id];
      const effectiveEntity = mappedEntity || this._config.entity || this._context?.entity_id || "";
      const effectiveState = this._hass.states[effectiveEntity];
      this._form.hass = effectiveState ? {...this._hass, states:{...this._hass.states, [effectiveEntity]:withOverrideEnd(effectiveState, this._hass)}} : this._hass;
      this._form.schema = rooms.length ? [
        ...rooms.map((room, index) => ({name:`room_${index}`,label:room.name,selector:{entity:{}}})),
        {name:"state_content", selector:{ui_state_content:{allow_context:true,entity_id:effectiveEntity || undefined}}},
        {name:"show_labels",label:text(this._hass,"show_state_labels"),selector:{boolean:{}}},
      ] : [
        {name:"entity", selector:{entity:{}}},
        {name:"state_content", selector:{ui_state_content:{allow_context:true,entity_id:effectiveEntity || undefined}}},
        {name:"show_labels",label:text(this._hass,"show_state_labels"),selector:{boolean:{}}},
      ];
      const data = rooms.length ? Object.fromEntries([
        ...rooms.map((room, index) => [`room_${index}`,this._config.entities?.[room.entity_id] || ""]),
        ["state_content",normalizedStateContent(this._config.state_content)],
        ["show_labels",this._config.show_labels === true],
      ]) : {entity:this._config.entity || "", state_content:normalizedStateContent(this._config.state_content),show_labels:this._config.show_labels === true};
      if (JSON.stringify(data) !== this._signature) {
        this._form.data = data;
        this._signature = JSON.stringify(data);
      }
    }
  }
  class WiserOverrideStatusFeature extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({mode:"open"});
      const style = document.createElement("style");
      style.textContent = `:host{display:block;pointer-events:auto;min-width:0}button{display:flex;width:100%;min-width:0;align-items:center;gap:6px;padding:0;border:0;background:none;color:var(--secondary-text-color);font:inherit;font-size:12px;text-align:start;cursor:pointer}button:focus-visible{outline:2px solid var(--primary-color)}ha-icon{flex:0 0 auto;--mdc-icon-size:16px}.value{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`;
      this._button = document.createElement("button");
      this._button.type = "button";
      this._icon = document.createElement("ha-icon");
      this._icon.icon = "mdi:timer-outline";
      this._value = document.createElement("span");
      this._value.className = "value";
      this._button.append(this._icon, this._value);
      this._button.addEventListener("click", event => {
        event.stopPropagation();
        const id = this._config?.entity || this._context?.entity_id || this._stateObj?.entity_id;
        if (id && this._hass?.states[id]) this.dispatchEvent(new CustomEvent("hass-more-info", {bubbles:true, composed:true, detail:{entityId:id}}));
      });
      this.shadowRoot.append(style, this._button);
    }
    static getStubConfig() { return {type:`custom:${OVERRIDE_STATUS_FEATURE}`}; }
    setConfig(config) { this._config = {...config}; this._render(); }
    set hass(value) { this._hass = value; this._render(); }
    set context(value) { this._context = value; this._render(); }
    set stateObj(value) { this._stateObj = value; this._render(); }
    _render() {
      if (!this._hass || !this._config) return;
      const id = this._config.entity || this._context?.entity_id || this._stateObj?.entity_id;
      const state = this._hass.states[id];
      this._button.disabled = !state;
      this._button.title = state
        ? entityDisplayName(this._hass, state)
        : id || text(this._hass,"override_end_time");
      this._value.textContent = state && isHeatingOverride(state) ? text(this._hass,"override_ends",{time:overrideEndValue(state, this._hass)}) : state ? text(this._hass,"no_override") : text(this._hass,"unavailable");
    }
  }
  class WiserNextScheduleFeature extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({mode:"open"});
      const style = document.createElement("style");
      style.textContent = `:host{display:block;height:var(--feature-height,42px);min-width:0}ha-control-button{display:block;width:100%;height:100%;--control-button-border-radius:var(--feature-border-radius,12px);--control-button-background-color:var(--control-number-buttons-background-color,var(--disabled-color));--control-button-background-opacity:var(--control-number-buttons-background-opacity,.2);--disabled-text-color:var(--secondary-text-color);--mdc-icon-size:22px}`;
      this._button = document.createElement("ha-control-button");
      this._icon = document.createElement("ha-icon");
      this._icon.icon = "mdi:calendar-arrow-right";
      this._button.append(this._icon);
      this._button.addEventListener("click", event => {
        event.stopPropagation();
        const id = this._config?.entity || this._context?.entity_id || this._stateObj?.entity_id;
        const state = this._hass?.states[id];
        if (state && !this._button.disabled) this._hass.callService("climate", "set_preset_mode", {entity_id:id, preset_mode:"Advance Schedule"});
      });
      this.shadowRoot.append(style, this._button);
    }
    static getStubConfig() { return {type:`custom:${NEXT_SCHEDULE_FEATURE}`}; }
    setConfig(config) { this._config = {...config}; this._render(); }
    set hass(value) { this._hass = value; this._render(); }
    set context(value) { this._context = value; this._render(); }
    set stateObj(value) { this._stateObj = value; this._render(); }
    _render() {
      if (!this._hass || !this._config) return;
      const id = this._config.entity || this._context?.entity_id || this._stateObj?.entity_id;
      const state = this._hass.states[id];
      const attributes = state?.attributes || {};
      const enabled = Boolean(state && state.state === "auto" && attributes.schedule_id && attributes.preset_modes?.includes("Advance Schedule"));
      this._button.disabled = !enabled;
      this._button.title = text(this._hass, enabled ? "advance_schedule" : "advance_unavailable");
      this._button.ariaLabel = this._button.title;
    }
  }
  class WiserPassiveModeFeature extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({mode:"open"});
      const style = document.createElement("style");
      style.textContent = `
        :host {
          display: block;
          height: var(--feature-height, 42px);
          min-width: 0;
        }

        ha-control-button {
          display: block;
          width: 100%;
          height: 100%;
          --control-button-border-radius: var(--feature-border-radius, 12px);
          --control-button-background-color:
            var(--control-number-buttons-background-color, var(--disabled-color));
          --control-button-background-opacity:
            var(--control-number-buttons-background-opacity, 0.2);
          --disabled-text-color: var(--secondary-text-color);
          --mdc-icon-size: 22px;
        }

        ha-control-button[active] {
          --control-button-background-color:
            var(--state-climate-heat-color, var(--primary-color));
          --control-button-background-opacity: 1;
          color: var(--text-primary-color, #fff);
        }

        ha-control-button[muted-active] {
          --control-button-background-color:
            var(--state-climate-off-color, var(--state-inactive-color, var(--disabled-color)));
          --control-button-background-opacity: 1;
          color: var(--text-primary-color, #fff);
        }
      `;
      this._button = document.createElement("ha-control-button");
      this._icon = document.createElement("ha-icon");
      this._icon.icon = "mdi:thermostat-box";
      this._button.append(this._icon);
      this._button.addEventListener("click", event => {
        event.stopPropagation();
        const state = this._hass?.states[this._switchId];
        if (!state || this._button.disabled) return;
        const service = state.state === "on" ? "turn_off" : "turn_on";
        this._hass.callService("switch", service, {entity_id:this._switchId});
      });
      this.shadowRoot.append(style, this._button);
    }

    static getStubConfig() { return {type:`custom:${PASSIVE_MODE_FEATURE}`}; }

    setConfig(config) { this._config = {...config}; this._resolveSwitch(); }
    set hass(value) { this._hass = value; this._resolveSwitch(); }
    set context(value) { this._context = value; this._resolveSwitch(); }
    set stateObj(value) { this._stateObj = value; this._resolveSwitch(); }

    _climateId() {
      return this._config?.entity || this._context?.entity_id || this._stateObj?.entity_id;
    }

    _resolveSwitch() {
      const id = this._climateId();
      if (!this._hass || !this._config || !id) {
        this._render();
        return;
      }
      const key = `${id}:${this._hass.connection ? "connection" : "hass"}`;
      if (key === this._resolvingFor) {
        this._render();
        return;
      }
      this._resolvingFor = key;
      this._switchId = undefined;
      this._render();

      entityRegistryEntries(this._hass).then(entries => {
        if (this._resolvingFor !== key) return;
        const climate = entries.find(entry => entry.entity_id === id);
        const candidate = climate?.device_id && entries.find(entry => {
          if (
            entry.device_id !== climate.device_id
            || entry.platform !== "wiser"
            || !entry.entity_id.startsWith("switch.")
          ) return false;
          const state = this._hass.states[entry.entity_id];
          const identity = [
            entry.translation_key,
            entry.original_name,
            entry.entity_id,
            state?.attributes?.friendly_name,
          ].filter(Boolean).join(" ");
          return entry.translation_key === "passive_mode" || /passive[ _-]?mode/i.test(identity);
        });
        this._switchId = candidate?.entity_id;
        this._render();
      }).catch(() => {
        if (this._resolvingFor === key) {
          this._switchId = undefined;
          this._render();
        }
      });
    }

    _render() {
      if (!this._button) return;
      const state = this._hass?.states[this._switchId];
      const enabled = Boolean(state && !["unknown","unavailable"].includes(state.state));
      const active = enabled && state.state === "on";
      const climate = this._stateObj || this._hass?.states[this._climateId()];
      const mutedActive = active && climate?.state === "off";
      const highlighted = active && !mutedActive;
      this._button.disabled = !enabled;
      this._button.active = highlighted;
      this._button.mutedActive = mutedActive;
      if (highlighted) this._button.setAttribute?.("active", "");
      else this._button.removeAttribute?.("active");
      if (mutedActive) this._button.setAttribute?.("muted-active", "");
      else this._button.removeAttribute?.("muted-active");
      const status = text(this._hass, enabled ? active ? "on" : "off" : "unavailable");
      this._button.title = `${text(this._hass, "passive_mode")}: ${status}`;
      this._button.ariaLabel = this._button.title;
    }
  }
  if (!customElements.get(SECONDARY_STATUS_FEATURE)) customElements.define(SECONDARY_STATUS_FEATURE, WiserSecondaryStatusFeature);
  if (!customElements.get("wiser-secondary-status-feature-editor")) customElements.define("wiser-secondary-status-feature-editor", WiserSecondaryStatusFeatureEditor);
  if (!customElements.get(OVERRIDE_STATUS_FEATURE)) customElements.define(OVERRIDE_STATUS_FEATURE, WiserOverrideStatusFeature);
  if (!customElements.get(NEXT_SCHEDULE_FEATURE)) customElements.define(NEXT_SCHEDULE_FEATURE, WiserNextScheduleFeature);
  if (!customElements.get(PASSIVE_MODE_FEATURE)) customElements.define(PASSIVE_MODE_FEATURE, WiserPassiveModeFeature);
  window.customCardFeatures = window.customCardFeatures || [];
  if (!window.customCardFeatures.some(feature => feature.type === SECONDARY_STATUS_FEATURE)) window.customCardFeatures.push({
    type:SECONDARY_STATUS_FEATURE, name:"Secondary status", configurable:true,
    isSupported:(hass, context) => {
      const state = hass.states[context?.entity_id];
      return Boolean(state && (state.entity_id.startsWith("climate.") || isShutter(state) || isLight(state) || isPlug(state)));
    },
  });
  if (!window.customCardFeatures.some(feature => feature.type === OVERRIDE_STATUS_FEATURE)) window.customCardFeatures.push({
    type:OVERRIDE_STATUS_FEATURE, name:"Override end time", configurable:false,
    isSupported:(hass, context) => Boolean(context?.entity_id?.startsWith("climate.") && hass.states[context.entity_id]),
  });
  if (!window.customCardFeatures.some(feature => feature.type === NEXT_SCHEDULE_FEATURE)) window.customCardFeatures.push({
    type:NEXT_SCHEDULE_FEATURE, name:"Next schedule", configurable:false,
    isSupported:(hass, context) => Boolean(context?.entity_id?.startsWith("climate.") && hass.states[context.entity_id]),
  });
  if (!window.customCardFeatures.some(feature => feature.type === PASSIVE_MODE_FEATURE)) window.customCardFeatures.push({
    type:PASSIVE_MODE_FEATURE, name:"Passive mode", configurable:false,
    isSupported:(hass, context) => {
      const state = hass.states[context?.entity_id];
      return Boolean(state?.entity_id?.startsWith("climate.") && Object.hasOwn(state.attributes, "is_passive"));
    },
  });
  const updateFeatureTranslations = hass => {
    const names = {[SECONDARY_STATUS_FEATURE]:"secondary_status",[OVERRIDE_STATUS_FEATURE]:"override_end_time",[NEXT_SCHEDULE_FEATURE]:"next_schedule",[PASSIVE_MODE_FEATURE]:"passive_mode"};
    for (const feature of window.customCardFeatures) if (names[feature.type]) feature.name = text(hass,names[feature.type]);
  };
  class WiserRoomsCardEditor extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({mode: "open"});
      this._hubForm = document.createElement("ha-form");
      this._hubForm.className = "hubs";
      this._hubForm.computeLabel = schema => schema.label;
      this._hubForm.addEventListener("value-changed", event => {
        event.stopPropagation();
        const hubs = event.detail.value.hubs || [];
        const detected = this._detectedHubs().map(hub => hub.value);
        this._config = {...this._config};
        if (hubs.length && (hubs.length !== detected.length || detected.some(id => !hubs.includes(id)))) this._config.hubs = hubs;
        else delete this._config.hubs;
        this._render();
        this._dispatchConfig();
      });
      this._form = document.createElement("ha-form");
      this._form.className = "settings";
      this._typeForm = document.createElement("div");
      this._typeForm.className = "show-filter";
      this._typeForm.addEventListener("click", event => {
        const button = event.target.closest?.("[data-room-type]");
        if (!button) return;
        const type = button.dataset.roomType;
        const current = selectedTypes(this._config);
        let next;
        if (type === "all") next = DEVICE_TYPES;
        else if (current.length === DEVICE_TYPES.length) next = [type];
        else if (current.includes(type)) next = current.length > 1 ? current.filter(value => value !== type) : current;
        else next = DEVICE_TYPES.filter(value => current.includes(value) || value === type);
        const config = {...this._config};
        if (next.length === DEVICE_TYPES.length) delete config.device_types;
        else config.device_types = next;
        if (masterMode(config)) {
          const existing = config.master_options_by_type || {};
          const byType = {};
          for (const roomType of next) {
            if (current.includes(roomType) && existing[roomType]) byType[roomType] = existing[roomType];
            else byType[roomType] = {};
          }
          config.master_options_by_type = byType;
        }
        this._config = config;
        this._render();
        this._dispatchConfig();
      });
      this._modeForm = document.createElement("ha-form");
      this._modeForm.className = "configuration-mode";
      this._modeForm.computeLabel = schema => schema.label;
      this._modeForm.addEventListener("value-changed", event => {
        event.stopPropagation();
        const mode = event.detail.value.device_configuration || "individual";
        const config = {...this._config};
        if (mode === "master") {
          const enteringMaster = !masterMode(config);
          config.device_configuration = "master";
          const activeTypes = selectedTypes(config);
          if (enteringMaster) {
            config.master_options_by_type = Object.fromEntries(activeTypes.map(roomType => {
              const room = this._rooms().find(item => deviceType(item) === roomType);
              const options = {...(room ? config.device_options?.[room.entity_id] : {})};
              if (room) options.features = nativeFeatures({...config,...options}, room.entity_id, room);
              if (options.features) options.features = this._masterNativeFeatures(config, options.features, roomType);
              return [roomType, options];
            }));
          } else if (!config.master_options_by_type) config.master_options_by_type = {};
          delete config.device_options;
        } else {
          if (masterMode(config)) {
            const roomOptions = {};
            for (const room of this._rooms()) {
              const options = JSON.parse(JSON.stringify(masterOptions(config, room.entity_id) || {}));
              if (Array.isArray(options.features)) {
                options.features = configuredNativeFeatures(config, room.entity_id, room)
                  .map(feature => featureForRoom(feature, room.entity_id));
              }
              roomOptions[room.entity_id] = options;
            }
            config.device_options = roomOptions;
            delete config.master_options_by_type;
          }
          delete config.device_configuration;
        }
        this._config = config;
        this._render();
        this._dispatchConfig();
      });
      this._roomForm = document.createElement("ha-form");
      this._roomForm.computeLabel = schema => {
        const scope = ["color","icon_tap_action","icon_hold_action","icon_double_tap_action","hide_state","state_content"].includes(schema.name) ? "tile" : "generic";
        return this._hass?.localize?.(`ui.panel.lovelace.editor.card.${scope}.${schema.name}`) || schema.label;
      };
      this._roomForm.addEventListener("value-changed", event => {
        event.stopPropagation();
        const value = event.detail.value;
        const options = {};
        for (const key of ["name", "icon", "color", "hide_state", "state_content", "temperature_focus", "show_temperatures", "show_next_schedule",
          "tap_action", "icon_tap_action", "hold_action", "icon_hold_action", "double_tap_action", "icon_double_tap_action"]) options[key] = value[key];
        this._setRoomOptions(options);
      });
      this._featureList = document.createElement("div");
      // Match hui-tile-card-editor: native expansion panel, feature editor and
      // features-position form. There is no standalone HA feature-section element.
      this._featureList.innerHTML = '<ha-expansion-panel outlined><ha-icon slot="leading-icon" icon="mdi:list-box"></ha-icon><h3 slot="header"></h3><div class="content"></div></ha-expansion-panel>';
      this._nativeEditor = document.createElement("hui-card-features-editor");
      this._featurePositionForm = document.createElement("ha-form");
      this._featurePositionForm.className = "features-form";
      this._featurePositionForm.computeLabel = schema => schema.label;
      this._featurePositionForm.addEventListener("value-changed", event => {
        event.stopPropagation();
        this._setRoomOptions({features_position:event.detail.value.features_position || "bottom"});
      });
      this._featureList.querySelector?.(".content")?.append(this._nativeEditor, this._featurePositionForm);
      this._nativeEditor.addEventListener("features-changed", event => {
        event.stopPropagation();
        this._saveNativeFeatures(this._selectedRoom, event.detail.features);
      });
      this._nativeEditor.addEventListener("edit-detail-element", event => {
        event.stopPropagation();
        const id = this._selectedRoom;
        const index = event.detail.subElementConfig.index;
        const config = configuredNativeFeatures(this._config, id, this._hass.states[id])[index];
        this.dispatchEvent(new CustomEvent("edit-sub-element", {bubbles:true, composed:true, detail:{
          type:"feature", config, context:this._featureEditorContext(id),
          saveConfig: newConfig => {
            const list = [...configuredNativeFeatures(this._config, id, this._hass.states[id])];
            list[index] = newConfig;
            this._saveNativeFeatures(id, list);
          },
        }}));
      });
      this._message = document.createElement("p");
      this._message.style.cssText = "color:var(--secondary-text-color);font-size:14px";
      this._version = document.createElement("div");
      this._version.className = "version";
      this._version.textContent = `Wiser Controls Card · ${CARD_VERSION}`;
      this._tabs = document.createElement("div");
      this._tabs.addEventListener("scroll", event => {
        if (!event.target.matches?.(".room-tabs")) return;
        this._updateTabOverflow(event.target);
      }, true);
      this._tabs.addEventListener("click", event => {
        const button = event.target.closest("[data-room],[data-action],[data-tab-scroll]");
        if (!button || button.disabled) return;
        if (button.dataset.room) { this._selectRoom(button.dataset.room); }
        else if (button.dataset.action) this._roomAction(button.dataset.action);
        else if (button.dataset.tabScroll) this._scrollTabs(button, button.dataset.tabScroll);
      });
      this._tabs.addEventListener("keydown", event => {
        if (!event.target.matches('[role="tab"]') || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const rooms = this._tabRooms(this._rooms());
        let index = rooms.findIndex(room => room.entity_id === this._selectedRoom);
        index = event.key === "Home" ? 0 : event.key === "End" ? rooms.length - 1
          : (index + (event.key === "ArrowLeft" ? -1 : 1) + rooms.length) % rooms.length;
        this._selectRoom(rooms[index].entity_id, true);
      });
      const style = document.createElement("style");
      style.textContent = `
        ha-form.hubs{display:block;margin-bottom:16px}
        ha-form.hubs[hidden]{display:none}
        ha-form.settings::part(root){display:grid;grid-template-columns:minmax(0,1fr) 130px;column-gap:8px;align-items:start}
        .show-filter{display:block;margin-top:16px}
        ha-form.configuration-mode{display:block;margin-top:16px}
        .show-label{display:block;margin:0 0 8px;font-size:14px;color:var(--primary-text-color)}
        .show-options{display:flex;flex-wrap:wrap;gap:8px}
        .show-options ha-button[appearance="filled"]::part(base){border-color:currentColor}
        .show-options ha-button[appearance="outlined"]::part(base){color:var(--state-inactive-color);border-color:var(--state-inactive-color)}
        .room-tab-bar {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 6px;
          border-bottom: 1px solid var(--divider-color);
          padding-bottom: 2px;
          margin: 20px 0 12px;
        }
        .room-tab-rows { margin: 20px 0 12px; }
        .room-tab-rows .room-tab-bar { margin: 0; }
        .room-tab-rows .room-tab-bar + .room-tab-bar { margin-top: 4px; }
        .room-tabs-viewport {
          position: relative;
          display: flex;
          flex: 1;
          min-width: 0;
        }
        .room-tabs {
          display: flex;
          flex: 1;
          flex-wrap: nowrap;
          gap: 4px;
          min-width: 0;
          overflow-x: auto;
          overscroll-behavior-x: contain;
          scrollbar-width: thin;
        }
        .tab-overflow-indicator {
          position: absolute;
          z-index: 2;
          top: 0;
          bottom: 0;
          display: none;
          width: 34px;
          align-items: center;
          justify-content: center;
          color: var(--primary-text-color);
          border: 0;
          cursor: pointer;
        }
        .tab-overflow-indicator.left {
          inset-inline-start: 0;
          background: linear-gradient(to right, var(--card-background-color) 40%, transparent);
        }
        .tab-overflow-indicator.right {
          inset-inline-end: 0;
          background: linear-gradient(to left, var(--card-background-color) 40%, transparent);
        }
        .room-tabs-viewport.can-scroll-left .tab-overflow-indicator.left,
        .room-tabs-viewport.can-scroll-right .tab-overflow-indicator.right { display: flex; }
        button{font:inherit;color:var(--primary-text-color);cursor:pointer}
        button:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}
        .room-tabs button{border:0;border-bottom:3px solid transparent;background:transparent;flex:0 0 40px;min-width:40px;min-height:40px;padding:6px 8px;opacity:.6;white-space:nowrap}
        .room-tabs.named-tabs button {
          flex-basis: auto;
          min-width: max-content;
          max-width: 180px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .room-type-label {
          align-self: center;
          flex: 0 0 92px;
          overflow: hidden;
          padding: 0 8px 0 0;
          color: var(--secondary-text-color);
          font-size: 14px;
          font-weight: 600;
          line-height: 40px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .room-tabs button.active{color:var(--primary-color);opacity:1;border-bottom-color:var(--primary-color)}
        .room-tabs.type-tabs button{flex-basis:auto;min-width:max-content}
        .room-tabs button.hidden-room{text-decoration:line-through}
        .room-tools{display:flex;flex-wrap:nowrap;gap:4px;margin-left:auto;flex-shrink:0}
        .room-tools ha-icon-button{--ha-icon-button-size:34px}
        button:disabled{opacity:.35;cursor:default}ha-icon{--mdc-icon-size:20px;pointer-events:none}
        ha-form.room-options{display:block;margin-bottom:24px;--ha-space-6:var(--ha-space-1,4px)}
        ha-expansion-panel{display:block;--expansion-panel-content-padding:0;border-radius:var(--ha-border-radius-md);--ha-card-border-radius:var(--ha-border-radius-md)}
        ha-expansion-panel .content{padding:12px}
        ha-expansion-panel>*[slot="header"]{margin:0;font-size:inherit;font-weight:inherit}
        ha-expansion-panel ha-icon{color:var(--secondary-text-color)}
        .features-form{display:block;margin-top:var(--ha-space-6);margin-bottom:0}
        .version{margin-top:24px;color:var(--secondary-text-color);font-size:12px;text-align:right}
      `;
      this._roomForm.className = "room-options";
      this.shadowRoot.append(style, this._hubForm, this._form, this._typeForm, this._modeForm, this._tabs, this._roomForm, this._featureList, this._message, this._version);
      this._form.computeLabel = schema => schema.label || text(this._hass,"title");
      this._form.addEventListener("value-changed", event => this._changed(event));
    }
    setConfig(config) {
      const normalized = normalizeConfig(config);
      const migrated = JSON.stringify(normalized) !== JSON.stringify(config);
      this._config = normalized;
      this._render();
      if (migrated) this._dispatchConfig();
    }
    set hass(hass) {
      this._hass = hass;
      updateFeatureTranslations(hass);
      if (!this._entries && !this._loading && !this._failed) this._discover();
      this._render();
    }
    async _discover() {
      this._loading = true;
      try {
        const entries = await entityRegistryEntries(this._hass);
        let hubs = [];
        if (!this.hideHubSelector) {
          try {
            const configEntries = await this._hass.callWS({type: "config_entries/get", domain: "wiser"});
            hubs = Array.isArray(configEntries) ? configEntries : [];
          } catch (_) {}
        }
        this._entries = entries;
        this._hubs = hubs;
      } catch (_) {
        this._failed = true;
      } finally {
        this._loading = false;
        this._render();
      }
    }
    _allRooms() {
      if (!this._hass || !this._entries) return [];
      return orderRooms(this._entries.filter(entry => isRoom(entry, this._hass.states[entry.entity_id]) && matchesHub(entry, this._config?.hubs))
        .map(entry => this._hass.states[entry.entity_id]), this._config?.device_order || this._config?.entities);
    }
    _rooms() { return this._allRooms().filter(room => matchesType(room, selectedTypes(this._config))); }
    _detectedHubs() {
      const titles = new Map((this._hubs || []).map(entry => [entry.entry_id, entry.title || entry.entry_id]));
      return [...new Set((this._entries || []).filter(entry => entry.platform === "wiser" && entry.config_entry_id).map(entry => entry.config_entry_id))]
        .map(id => ({value:id, label:titles.get(id) || id}));
    }
    _name(room) { return entityDisplayName(this._hass, room); }
    _tabNames(rooms) {
      const details = rooms.map(room => {
        const area = room.attributes.room || "";
        const name = deviceType(room) === "heating"
          ? area || room.attributes.name || this._name(room)
          : room.attributes.name || this._name(room) || area;
        return {room, area, name};
      });
      const countNames = values => values.reduce((counts, value) => counts.set(value, (counts.get(value) || 0) + 1), new Map());
      const baseCounts = countNames(details.map(detail => detail.name));
      const labels = details.map(detail => baseCounts.get(detail.name) > 1 && detail.area && detail.area !== detail.name
        ? `${detail.area} · ${detail.name}` : detail.name);
      const labelCounts = countNames(labels);
      const seen = new Map();
      return new Map(details.map((detail, index) => {
        const label = labels[index];
        if (labelCounts.get(label) === 1) return [detail.room.entity_id, label];
        const occurrence = (seen.get(label) || 0) + 1;
        seen.set(label, occurrence);
        return [detail.room.entity_id, `${label} ${occurrence}`];
      }));
    }
    _shown(id) {
      return !this._config.excluded_entities?.includes(id) &&
        (!this._config.entities?.length || this._config.entities.includes(id));
    }
    _render() {
      if (!this._config || !this._hass) return;
      const rooms = this._rooms();
      const hubs = this._detectedHubs();
      this._hubForm.hass = this._hass;
      const hubSchema = [{name:"hubs",label:text(this._hass,"hubs"),selector:{select:{multiple:true,mode:"dropdown",options:hubs}}}];
      const hubSignature = JSON.stringify(hubSchema);
      if (hubSignature !== this._hubSchemaSignature) { this._hubForm.schema = hubSchema; this._hubSchemaSignature = hubSignature; }
      const hubData = {hubs:this._config.hubs || hubs.map(hub => hub.value)};
      if (JSON.stringify(hubData) !== JSON.stringify(this._hubForm.data)) this._hubForm.data = hubData;
      this._hubForm.hidden = this.hideHubSelector || !hubs.length;
      this._form.hass = this._hass;
      const appearanceSchema = [
        ...(this.hideTitle ? [] : [{name: "title", selector: {text: {}}}]),
        ...(this.hideRoomColumns ? [] : [{name: "device_columns", label: text(this._hass,"devices_per_row"), selector: {number: {min: 1, max: 6, step: 1, mode: "box"}}}]),
      ];
      const roomTypeSchema = {name: "device_types", label: text(this._hass,"show"), selector: {select: {mode: "box", options: [
          {value: "all", label: text(this._hass,"all")},
          ...sortedDeviceTypes(this._hass).map(value => ({value, label:text(this._hass,value)})),
        ]}}};
      const schema = [
        ...appearanceSchema,
        roomTypeSchema,
        {name: "temperature_focus", label:"", selector: {button_toggle: {options: [
          {value: "current", label: text(this._hass,"current")}, {value: "target", label: text(this._hass,"target")},
        ]}}},

      ];
      // Retain the form schema during state updates so edits keep their focus.
      const signature = JSON.stringify(schema);
      if (signature !== this._schemaSignature) {
        this._form.schema = appearanceSchema;
        this._typeForm.schema = [roomTypeSchema];

        this._schemaSignature = signature;
      }
      this._form.style.maxWidth = this.hideTitle && !this.hideRoomColumns ? "130px" : "";
      const data = {};
      if (!this.hideRoomColumns) data.device_columns = this._config.device_columns ?? 1;
      if (!this.hideTitle) data.title = this._config.title ?? text(this._hass,"wiser_controls");
      if (JSON.stringify(data) !== JSON.stringify(this._form.data)) this._form.data = data;
      const activeTypes = selectedTypes(this._config);
      this._typeForm.data = {device_types:activeTypes};
      const typeOptions = roomTypeSchema.selector.select.options;
      const typeMarkup = `<span class="show-label" id="show-label">${escape(text(this._hass,"show"))}</span><div class="show-options" role="group" aria-labelledby="show-label">${typeOptions.map(option => {
        const active = option.value === "all" ? activeTypes.length === DEVICE_TYPES.length : activeTypes.includes(option.value);
        return `<ha-button size="s" variant="${active ? "brand" : "neutral"}" appearance="${active ? "filled" : "outlined"}" data-room-type="${option.value}" aria-pressed="${active}">${option.label}</ha-button>`;
      }).join("")}</div>`;
      if (typeMarkup !== this._typeMarkup) { this._typeForm.innerHTML = typeMarkup; this._typeMarkup = typeMarkup; }
      this._modeForm.hass = this._hass;
      const modeSchema = [{name:"device_configuration",label:text(this._hass,"configuration_mode"),selector:{button_toggle:{options:[
        {value:"master",label:text(this._hass,"master")},{value:"individual",label:text(this._hass,"individual")},
      ]}}}];
      if (JSON.stringify(modeSchema) !== this._modeSchemaSignature) { this._modeForm.schema = modeSchema; this._modeSchemaSignature = JSON.stringify(modeSchema); }
      const modeData = {device_configuration:masterMode(this._config) ? "master" : "individual"};
      if (JSON.stringify(modeData) !== JSON.stringify(this._modeForm.data)) this._modeForm.data = modeData;
      this._modeForm.hidden = !rooms.length;
      this._modeForm.style.marginBottom = masterMode(this._config) ? "12px" : "";
      this._renderTabs(rooms);
      const selectedOptions = roomConfig(this._config, this._selectedRoom);
      const selectedState = this._hass.states[this._selectedRoom];
      const selectedType = selectedState ? deviceType(selectedState) : "heating";
      const shutter = selectedType === "shutters";
      const heating = selectedType === "heating";
      this._roomForm.hass = heating && selectedState
        ? {...this._hass, states:{...this._hass.states, [this._selectedRoom]:withOverrideEnd(selectedState, this._hass)}}
        : this._hass;
      const metricLabel = text(this._hass,shutter ? "show_position" : selectedType === "lights" ? "show_brightness" : selectedType === "plugs" ? "show_status" : "show_temperatures");
      const identitySchema = [
        {name:"name", label:text(this._hass,"name"), selector:{entity_name:{}}, context:{entity:"entity"}},
        {name:"", type:"grid", schema:[
          {name:"icon", label:text(this._hass,"icon"), selector:{icon:{}}, context:{icon_entity:"entity"}},
          {name:"color", label:text(this._hass,"color"), selector:{ui_color:{default_color:"state",include_state:true}}},
        ]},
      ];
      const contentSchema = [
        ...identitySchema,
        {name:"",type:"grid",column_min_width:"180px",schema:[
          {name:"show_temperatures",label:metricLabel,selector:{boolean:{}}},
          ...(heating ? [schema[3]] : []),
          {name:"show_next_schedule",label:text(this._hass,"show_next_schedule"),selector:{boolean:{}}},
          {name:"hide_state",label:text(this._hass,"hide_state"),selector:{boolean:{}}},
        ]},
        {name:"state_content",label:text(this._hass,"state_content"),visible:{field:"hide_state",operator:"not_eq",value:true},selector:{ui_state_content:{allow_context:true}},context:{filter_entity:"entity"}},
      ];
      const actionSchema = [
        {name:"tap_action",label:"Tap action",selector:{ui_action:{default_action:"more-info"}},context:{filter_entity:"entity"}},
        {name:"",type:"divider"},
        {name:"icon_tap_action",label:"Icon tap action",selector:{ui_action:{default_action:isLight(selectedState) || isPlug(selectedState) ? "toggle" : "more-info"}},context:{filter_entity:"entity"}},
        {name:"",type:"optional_actions",flatten:true,schema:[
          {name:"hold_action",label:"Hold action",selector:{ui_action:{default_action:"none"}},context:{filter_entity:"entity"}},
          {name:"icon_hold_action",label:"Icon hold action",selector:{ui_action:{default_action:"none"}},context:{filter_entity:"entity"}},
          {name:"double_tap_action",label:"Double-tap action",selector:{ui_action:{default_action:"none"}},context:{filter_entity:"entity"}},
          {name:"icon_double_tap_action",label:"Icon double-tap action",selector:{ui_action:{default_action:"none"}},context:{filter_entity:"entity"}},
        ]},
      ];
      const roomSchema = [
        {name:"content",label:text(this._hass,"content"),type:"expandable",flatten:true,icon:"mdi:text-short",schema:contentSchema},
        {name:"interactions",label:text(this._hass,"interactions"),type:"expandable",flatten:true,icon:"mdi:gesture-tap",schema:actionSchema},
      ];
      const roomSignature = JSON.stringify(roomSchema);
      if (roomSignature !== this._roomSchema) { this._roomForm.schema = roomSchema; this._roomSchema = roomSignature; }
      const roomData = {entity:this._selectedRoom,color:selectedOptions.color || "state",hide_state:selectedOptions.hide_state ?? false,state_content:selectedOptions.state_content ?? [heating ? "hvac_action" : "state"],temperature_focus:selectedOptions.temperature_focus ?? "current",show_temperatures:selectedOptions.show_temperatures ?? true,show_next_schedule:selectedOptions.show_next_schedule ?? true,
        tap_action:selectedOptions.tap_action,icon_tap_action:selectedOptions.icon_tap_action,
        hold_action:selectedOptions.hold_action,icon_hold_action:selectedOptions.icon_hold_action,
        double_tap_action:selectedOptions.double_tap_action,icon_double_tap_action:selectedOptions.icon_double_tap_action};
      roomData.name = selectedOptions.name ?? [{type:"area"}];
      roomData.icon = selectedOptions.icon;
      for (const key of Object.keys(roomData)) if (roomData[key] === undefined) delete roomData[key];
      if (JSON.stringify(roomData) !== JSON.stringify(this._roomForm.data)) this._roomForm.data = roomData;
      this._styleTemperatureFocus();
      this._roomForm.hidden = !this._selectedRoom;
      this._featureList.hidden = !this._selectedRoom;
      this._renderFeatures();
      this._message.textContent = this._failed ? text(this._hass,"retry_editor")
        : this._loading ? text(this._hass,"finding")
        : !rooms.length ? text(this._hass,"no_devices")
        : "";
      this._message.hidden = !this._message.textContent;
    }
    async _styleTemperatureFocus() {
      await this._roomForm?.updateComplete;
      const content = [...(this._roomForm?.shadowRoot?.querySelectorAll("ha-form-expandable") || [])]
        .find(item => item.schema?.name === "content");
      await content?.updateComplete;
      const form = content?.shadowRoot?.querySelector("ha-form");
      await form?.updateComplete;
      const grid = [...(form?.shadowRoot?.querySelectorAll("ha-form-grid") || [])]
        .find(item => item.schema?.schema?.some(field => field.name === "temperature_focus"));
      await grid?.updateComplete;
      const index = grid?.schema?.schema?.findIndex(field => field.name === "temperature_focus") ?? -1;
      const fields = [...(grid?.shadowRoot?.children || [])].filter(item => item.localName === "ha-form");
      const field = fields[index];
      if (!field) return;
      field.style.justifySelf = "end";
      field.style.alignSelf = "center";
      field.style.setProperty("--ha-button-height", "32px");
      const show = this._roomForm.data?.show_temperatures !== false;
      field.style.visibility = show ? "" : "hidden";
      field.inert = !show;
      field.setAttribute("aria-hidden", String(!show));
    }
    _setRoomOptions(options) {
      if (!this._selectedRoom) return;
      const master = masterMode(this._config);
      const current = {...(master ? masterOptions(this._config, this._selectedRoom) : this._config.device_options?.[this._selectedRoom])};
      for (const [key, value] of Object.entries(options)) {
        if (value === undefined) delete current[key];
        else current[key] = value;
      }
      if (master) this._config = {...this._config,master_options_by_type:{
        ...this._config.master_options_by_type,[typeForEntity(this._selectedRoom)]:current,
      }};
      else this._config = {...this._config,device_options:{...this._config.device_options,[this._selectedRoom]:current}};
      this._render();
      this._dispatchConfig();
    }
    _masterNativeFeatures(config, list, roomType = typeForEntity(this._selectedRoom)) {
      let secondaryIndex = 0;
      return orderNativeFeatures(list.map(feature => {
        if (!isSecondaryFeature(feature)) return feature;
        const index = secondaryIndex++;
        const entities = {};
        for (const room of this._rooms().filter(item => deviceType(item) === roomType)) {
          const configured = config.device_options?.[room.entity_id]?.features;
          const candidate = Array.isArray(configured) ? configured.filter(isSecondaryFeature)[index] : undefined;
          const entity = candidate?.entities?.[room.entity_id] || candidate?.entity;
          if (typeof entity === "string" && entity) entities[room.entity_id] = entity;
        }
        const shared = {...feature};
        delete shared.entity;
        if (Object.keys(entities).length) shared.entities = entities;
        else delete shared.entities;
        return shared;
      }));
    }
    _featureEditorContext(id) {
      const context = {entity_id:id};
      if (masterMode(this._config)) {
        context.wiser_master = true;
        const roomType = typeForEntity(id);
        context.wiser_rooms = this._rooms().filter(room => deviceType(room) === roomType)
          .map(room => ({entity_id:room.entity_id,name:this._name(room)}));
      }
      return context;
    }
    _saveNativeFeatures(id, list) {
      if (!id || !validNativeFeatures(list)) return;
      const ordered = orderNativeFeatures(list);
      if (masterMode(this._config)) {
        const currentOptions = masterOptions(this._config, id) || {};
        const currentSecondary = (currentOptions.features || []).filter(isSecondaryFeature);
        const roomType = typeForEntity(id);
        const typeRooms = new Set(this._rooms().filter(room => deviceType(room) === roomType).map(room => room.entity_id));
        let secondaryIndex = 0;
        const shared = ordered.map(feature => {
          if (!isSecondaryFeature(feature)) return feature;
          const existing = currentSecondary[secondaryIndex++] || {};
          if (feature.entities && typeof feature.entities === "object" && !Array.isArray(feature.entities)) {
            const saved = {...feature};
            delete saved.entity;
            saved.entities = Object.fromEntries(Object.entries(feature.entities)
              .filter(([roomId, entity]) => typeRooms.has(roomId) && typeof entity === "string" && entity));
            if (!Object.keys(saved.entities).length) delete saved.entities;
            return saved;
          }
          const entities = Object.fromEntries(Object.entries(existing.entities || {}).filter(([roomId]) => typeRooms.has(roomId)));
          if (typeof feature.entity === "string" && feature.entity) entities[id] = feature.entity;
          else delete entities[id];
          const saved = {...feature};
          delete saved.entity;
          if (Object.keys(entities).length) saved.entities = entities;
          else delete saved.entities;
          return saved;
        });
        const options = {...currentOptions,features:shared};
        this._config = {...this._config,master_options_by_type:{
          ...this._config.master_options_by_type,
          [roomType]:options,
        }};
      } else {
        const options = {...this._config.device_options?.[id],features:ordered};
        this._config = {...this._config,device_options:{...this._config.device_options,[id]:options}};
      }
      this._render();
      this._dispatchConfig();
    }
    _hidePinnedFeatureMoveHandle() {
      const root = this._nativeEditor.shadowRoot;
      if (!root) return;
      const existing = root.querySelector?.("style[data-wiser-pinned-feature]");
      const pinned = isSecondaryFeature(this._nativeEditor.features?.[0] || {});
      if (!pinned) { existing?.remove(); return; }
      if (existing) return;
      const style = document.createElement("style");
      style.dataset.wiserPinnedFeature = "";
      style.textContent = ".feature:first-child .handle{visibility:hidden!important}";
      root.append(style);
    }
    _renderFeatures() {
      if (!this._selectedRoom) return;
      const featureHeading = this._featureList.querySelector?.('[slot="header"]');
      if (featureHeading) featureHeading.textContent = text(this._hass,"features");
      this._nativeEditor.hass = this._hass;
      this._featurePositionForm.hass = this._hass;
      this._featurePositionForm.schema = [{name:"features_position",required:true,label:text(this._hass,"features_position"),selector:{select:{mode:"box",options:["bottom","inline"].map(value => ({
        value,
        label:text(this._hass,value),
        description:this._hass.localize(`ui.panel.lovelace.editor.card.tile.features_position_options.${value}_description`),
        image:{src:`/static/images/form/tile_features_position_${value}.svg`,src_dark:`/static/images/form/tile_features_position_${value}_dark.svg`,flip_rtl:true},
      }))}}}];
      this._nativeEditor.context = this._featureEditorContext(this._selectedRoom);
      this._nativeEditor.stateObj = this._hass.states[this._selectedRoom];
      const storedList = configuredNativeFeatures(this._config, this._selectedRoom, this._hass.states[this._selectedRoom]);
      const list = storedList;
      this._featurePositionForm.hidden = !list.length;
      const signature = this._selectedRoom + JSON.stringify(list);
      if (signature !== this._nativeEditorSignature) {
        this._nativeEditor.features = list;
        this._nativeEditorSignature = signature;
      }
      this._hidePinnedFeatureMoveHandle();
      Promise.resolve(this._nativeEditor.updateComplete).then(() => this._hidePinnedFeatureMoveHandle());
      const positionData = {features_position:roomConfig(this._config, this._selectedRoom).features_position || "bottom"};
      if (JSON.stringify(positionData) !== JSON.stringify(this._featurePositionForm.data)) this._featurePositionForm.data = positionData;
    }
    _tabRooms(rooms) {
      if (!masterMode(this._config)) return DEVICE_TYPES.flatMap(roomType => rooms.filter(room => deviceType(room) === roomType));
      const selected = selectedTypes(this._config);
      return selected.map(roomType =>
        rooms.find(room => deviceType(room) === roomType && this._shown(room.entity_id))
          || rooms.find(room => deviceType(room) === roomType))
        .filter(Boolean);
    }
    _updateTabOverflow(strip = this._tabs.querySelector?.(".room-tabs")) {
      const viewport = strip?.parentElement;
      if (!viewport?.classList) return;
      const tolerance = 2;
      viewport.classList.toggle("can-scroll-left", strip.scrollLeft > tolerance);
      viewport.classList.toggle("can-scroll-right", strip.scrollLeft + strip.clientWidth < strip.scrollWidth - tolerance);
    }
    _scrollTabs(control, direction) {
      const strip = control.parentElement?.querySelector?.(".room-tabs");
      if (!strip) return;
      const distance = Math.max(160, strip.clientWidth * 0.75);
      strip.scrollBy({left:direction === "left" ? -distance : distance,behavior:"smooth"});
    }
    _tabScrollPositions() {
      return new Map(Array.from(this._tabs.querySelectorAll?.(".room-tab-bar[data-device-type]") || [], row => [
        row.dataset.deviceType,
        row.querySelector(".room-tabs")?.scrollLeft || 0,
      ]));
    }
    _restoreTabScrollPositions(positions) {
      for (const row of this._tabs.querySelectorAll?.(".room-tab-bar[data-device-type]") || []) {
        const strip = row.querySelector(".room-tabs");
        if (strip && positions.has(row.dataset.deviceType)) strip.scrollLeft = positions.get(row.dataset.deviceType);
      }
    }
    _revealSelectedTab() {
      const active = this._tabs.querySelector?.('[role="tab"][aria-selected="true"]');
      const strip = active?.closest?.(".room-tabs");
      if (!strip?.getBoundingClientRect || !active.getBoundingClientRect) return;
      const stripRect = strip.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      if (activeRect.left < stripRect.left) strip.scrollLeft -= stripRect.left - activeRect.left;
      else if (activeRect.right > stripRect.right) strip.scrollLeft += activeRect.right - stripRect.right;
    }
    _scheduleTabOverflowUpdate() {
      const update = () => {
        const strips = this._tabs.querySelectorAll?.(".room-tabs") || [];
        for (const strip of strips) this._updateTabOverflow(strip);
      };
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(update);
      else setTimeout(update, 0);
    }
    _syncIndividualTabSelection(tabRooms) {
      const selected = tabRooms.find(room => room.entity_id === this._selectedRoom);
      if (!selected) return;
      for (const button of this._tabs.querySelectorAll?.(".room-tabs [data-room]") || []) {
        const active = button.dataset.room === this._selectedRoom;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", String(active));
        button.tabIndex = active ? 0 : -1;
      }
      const row = this._tabs.querySelector?.(`.room-tab-bar[data-device-type="${deviceType(selected)}"]`);
      const tools = this._tabs.querySelector?.(".room-tools");
      if (!row || !tools) return;
      row.append(tools);
      tools.hidden = false;
      const typeRooms = tabRooms.filter(room => deviceType(room) === deviceType(selected));
      const index = typeRooms.findIndex(room => room.entity_id === this._selectedRoom);
      const hide = tools.querySelector?.('[data-action="hide"]');
      if (hide) {
        const shown = this._shown(this._selectedRoom);
        hide.setAttribute("label", shown ? "Hide device" : "Show device");
        hide.querySelector?.("ha-icon")?.setAttribute("icon", `mdi:${shown ? "eye" : "eye-off"}`);
      }
      const left = tools.querySelector?.('[data-action="left"]');
      const right = tools.querySelector?.('[data-action="right"]');
      if (left) left.disabled = index === 0;
      if (right) right.disabled = index === typeRooms.length - 1;
    }
    _renderTabs(rooms) {
      if (!rooms.some(room => room.entity_id === this._selectedRoom)) this._selectedRoom = rooms[0]?.entity_id;
      if (masterMode(this._config)) {
        this._individualTabsSignature = "";
        if (!this._shown(this._selectedRoom)) this._selectedRoom = rooms.find(room => this._shown(room.entity_id))?.entity_id || rooms[0]?.entity_id;
        const typeRooms = this._tabRooms(rooms);
        if (typeRooms.length <= 1) {
          this._tabs.hidden = true;
          this._tabs.innerHTML = "";
          this._tabsMarkup = "";
          return;
        }
        if (!typeRooms.some(room => room.entity_id === this._selectedRoom)) this._selectedRoom = typeRooms[0].entity_id;
        this._tabs.hidden = false;
        const markup = `<div class="room-tab-bar"><div class="room-tabs-viewport"><div class="room-tabs type-tabs" role="tablist" aria-label="${escape(text(this._hass,"configuration_mode"))}">${typeRooms.map(room => {
          const roomType = deviceType(room);
          const active = room.entity_id === this._selectedRoom;
          return `<button type="button" role="tab" title="${escape(text(this._hass,roomType))}" data-room="${escape(room.entity_id)}" aria-selected="${active}" tabindex="${active ? 0 : -1}" class="${active ? "active" : ""}">${escape(text(this._hass,roomType))}</button>`;
        }).join("")}</div><button type="button" class="tab-overflow-indicator left" data-tab-scroll="left" aria-label="Scroll tabs left"><ha-icon icon="mdi:chevron-left"></ha-icon></button><button type="button" class="tab-overflow-indicator right" data-tab-scroll="right" aria-label="Scroll tabs right"><ha-icon icon="mdi:chevron-right"></ha-icon></button></div></div>`;
        if (markup !== this._tabsMarkup) { this._tabs.innerHTML = markup; this._tabsMarkup = markup; this._scheduleTabOverflowUpdate(); }
        return;
      }
      this._tabs.hidden = false;
      const tabRooms = this._tabRooms(rooms);
      const selected = tabRooms.find(room => room.entity_id === this._selectedRoom);
      const tabNames = this._tabNames(tabRooms);
      const groups = DEVICE_TYPES.map(roomType => ({roomType, rooms:tabRooms.filter(room => deviceType(room) === roomType)}))
        .filter(group => group.rooms.length);
      const scrollPositions = this._tabScrollPositions();
      const structureSignature = JSON.stringify(groups.map(group => [group.roomType, group.rooms.map(room => [
        room.entity_id, tabNames.get(room.entity_id), this._shown(room.entity_id),
      ])]));
      const markup = !selected ? "" : `<div class="room-tab-rows">${groups.map(group => {
        return `<div class="room-tab-bar" data-device-type="${group.roomType}"><span class="room-type-label">${escape(text(this._hass,group.roomType))}</span>
          <div class="room-tabs-viewport"><div class="room-tabs named-tabs" role="tablist" aria-label="${escape(text(this._hass,group.roomType))}">${group.rooms.map(room => {
            const active = room.entity_id === this._selectedRoom;
            const hidden = !this._shown(room.entity_id);
            const name = tabNames.get(room.entity_id);
            const label = `${name}${hidden ? " (hidden)" : ""}`;
            return `<button type="button" role="tab" title="${escape(label)}" data-room="${escape(room.entity_id)}" aria-selected="${active}" tabindex="${active ? 0 : -1}" class="${active ? "active" : ""}${hidden ? " hidden-room" : ""}" aria-label="${escape(label)}">${escape(name)}</button>`;
          }).join("")}</div><button type="button" class="tab-overflow-indicator left" data-tab-scroll="left" aria-label="Scroll tabs left"><ha-icon icon="mdi:chevron-left"></ha-icon></button><button type="button" class="tab-overflow-indicator right" data-tab-scroll="right" aria-label="Scroll tabs right"><ha-icon icon="mdi:chevron-right"></ha-icon></button></div></div>`;
      }).join("")}<div class="room-tools" hidden>
        <ha-icon-button data-action="hide"><ha-icon></ha-icon></ha-icon-button>
        <ha-icon-button data-action="left" label="Move left"><ha-icon icon="mdi:arrow-left"></ha-icon></ha-icon-button>
        <ha-icon-button data-action="right" label="Move right"><ha-icon icon="mdi:arrow-right"></ha-icon></ha-icon-button>
      </div></div>`;
      const rebuilt = structureSignature !== this._individualTabsSignature;
      if (rebuilt) {
        this._tabs.innerHTML = markup; this._tabsMarkup = markup;
        this._individualTabsSignature = structureSignature;
        this._restoreTabScrollPositions(scrollPositions);
        this._scheduleTabOverflowUpdate();
      }
      this._syncIndividualTabSelection(tabRooms);
      if (rebuilt) this._revealSelectedTab();
    }
    _selectRoom(id, focusTab = false) {
      this._selectedRoom = id;
      this._render();
      this._dispatchConfig();
      if (focusTab) this._tabs.querySelector?.('[role="tab"][aria-selected="true"]')?.focus({preventScroll: true});
    }
    _dispatchConfig() {
      // Symbols pass to the live preview but are omitted when the config is saved as JSON/YAML.
      const config = {...orderedCardConfig(this._config), [PREVIEW_ROOM]: this._selectedRoom};
      this.dispatchEvent(new CustomEvent("config-changed", {detail: {config}, bubbles: true, composed: true}));
    }
    _roomAction(action) {
      const rooms = this._tabRooms(this._rooms());
      const selected = rooms.find(room => room.entity_id === this._selectedRoom);
      if (!selected) return;
      const typeRooms = rooms.filter(room => deviceType(room) === deviceType(selected));
      const index = typeRooms.findIndex(room => room.entity_id === this._selectedRoom);
      const config = {...this._config};
      const excluded = new Set(config.excluded_entities || []);
      for (const room of rooms) if (!this._shown(room.entity_id)) excluded.add(room.entity_id);
      const order = rooms.map(room => room.entity_id);
      if (action === "hide") {
        if (excluded.has(this._selectedRoom)) excluded.delete(this._selectedRoom);
        else excluded.add(this._selectedRoom);
      } else {
        const target = index + (action === "left" ? -1 : action === "right" ? 1 : 0);
        if (target === index || target < 0 || target >= typeRooms.length) return;
        const sourceOrderIndex = order.indexOf(this._selectedRoom);
        const targetOrderIndex = order.indexOf(typeRooms[target].entity_id);
        [order[sourceOrderIndex], order[targetOrderIndex]] = [order[targetOrderIndex], order[sourceOrderIndex]];
      }
      delete config.entities;
      config.excluded_entities = [...excluded];
      config.device_order = [...order, ...(config.device_order || []).filter(id => !order.includes(id))];
      this._config = config;
      this._render();
      this._dispatchConfig();
    }
    _changed(event) {
      event.stopPropagation();
      const data = event.detail.value;
      const title = Object.hasOwn(data, "title") ? data.title ?? "" : this._config.title ?? text(this._hass,"wiser_controls");
      const config = {...this._config, title};
      if (!this.hideRoomColumns) config.device_columns = data.device_columns ?? 1;
      this._config = config;
      this._render();
      this._dispatchConfig();
    }
  }
  if (!customElements.get("wiser-controls-card-editor")) customElements.define("wiser-controls-card-editor", WiserRoomsCardEditor);
  if (!customElements.get("wiser-rooms-card-editor")) customElements.define("wiser-rooms-card-editor", class extends WiserRoomsCardEditor {});
  if (!customElements.get("wiser-controls-card")) {
    customElements.define("wiser-controls-card", WiserRoomsCard);
    if (!customElements.get("wiser-rooms-card")) customElements.define("wiser-rooms-card", class extends WiserRoomsCard {});
    window.customCards = window.customCards || [];
    window.customCards.push({
      type:"wiser-controls-card",
      name:"Wiser Controls",
      description:"Heating, shutter, light and appliance controls for Wiser devices.",
      documentationURL:"https://github.com/andyblac/wiser-controls-card/wiki",
      preview:true,
      getEntitySuggestion:(hass, entityId) => isSuggestedEntity(hass?.states?.[entityId])
        ? {config:{type:"custom:wiser-controls-card",entities:[entityId]}}
        : null,
    });
  }
})();
