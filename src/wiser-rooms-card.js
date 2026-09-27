/* Wiser rooms dashboard card. Bundled with the integration. */
(() => {
  const CARD_VERSION = "__WISER_CARD_VERSION__";
  const DEVICE_TYPES = ["heating", "shutters", "lights", "plugs"];
  const FEATURES = ["modes", "temperature", "advance"];
  const roomConfig = (config, id) => ({...config, ...config.room_options?.[id]});
  const featureOrder = config => FEATURES.map(value => `--feature-${value}:${features(config).indexOf(value)}`).join(";");
  const features = config => config.features ?? (config.show_controls === false ? [] : FEATURES);
  const nativeFeatures = (config, id) => config.native_features ?? features(config).flatMap(value => {
    const cover = id.startsWith("cover.");
    const light = id.startsWith("light.");
    if (light) return value === "modes" ? [{type:"toggle"}] : value === "temperature" ? [{type:"light-brightness"}] : [];
    if (id.startsWith("switch.")) return value === "modes" ? [{type:"toggle"}] : [];
    if (value === "modes") return [{type: cover ? "cover-open-close" : "climate-hvac-modes"}];
    if (value === "temperature") return [{type: cover ? "cover-position" : "target-temperature"}];
    return cover ? [] : [{type: "climate-preset-modes", preset_modes: ["Advance Schedule"]}];
  });
  const validNativeFeatures = value => Array.isArray(value) && value.every(feature => feature && typeof feature === "object" && typeof feature.type === "string" && feature.type.length);
  const validAction = value => value && typeof value === "object" && !Array.isArray(value) && typeof value.action === "string";
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
  const available = state => state && !["unknown", "unavailable"].includes(state.state);
  const isShutter = state => state?.entity_id.startsWith("cover.") && Object.hasOwn(state.attributes, "shutter_id");
  const isLight = state => state?.entity_id.startsWith("light.") && Object.hasOwn(state.attributes, "product_type");
  const isPlug = state => state?.entity_id.startsWith("switch.") && Object.hasOwn(state.attributes, "output_state") && Object.hasOwn(state.attributes, "schedule_id");
  const deviceType = state => isShutter(state) ? "shutters" : isLight(state) ? "lights" : isPlug(state) ? "plugs" : "heating";
  const selectedTypes = config => Array.isArray(config?.room_types) && config.room_types.length
    ? DEVICE_TYPES.filter(type => config.room_types.includes(type))
    : config?.room_type && config.room_type !== "all" ? [config.room_type] : DEVICE_TYPES;
  const isRoom = (entry, state) => entry.platform === "wiser" && !entry.disabled_by && state &&
    (entry.entity_id.startsWith("climate.") && Object.hasOwn(state.attributes, "heating_type") || isShutter(state) || isLight(state) || isPlug(state));
  const matchesType = (state, types = DEVICE_TYPES) => types.includes(deviceType(state));
  const matchesHub = (entry, hubs) => !hubs?.length || hubs.includes(entry.config_entry_id);


  const isEditorPreview = element => {
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
    constructor() {
      super();
      this.attachShadow({mode: "open"});
      this._entries = null;
      this._headerObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => this._layoutHeaders());
      this._observedHeaders = new Set();
      this._busy = false;
      this._temperatureQueue = new Map();
      this._targets = new Map();
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
        const sizeKey = `${this._config?.room_columns || 1}:${roomId}`;
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
      if (config.entities !== undefined && (!Array.isArray(config.entities) || config.entities.some(id => typeof id !== "string" || !/^(climate|cover|light|switch)\./.test(id)))) {
        throw new Error("entities must be a list of supported Wiser entity IDs");
      }
      if (config.excluded_entities !== undefined && (!Array.isArray(config.excluded_entities) || config.excluded_entities.some(id => typeof id !== "string" || !/^(climate|cover|light|switch)\./.test(id)))) {
        throw new Error("excluded_entities must be a list of supported Wiser entity IDs");
      }
      if (config.room_order !== undefined && (!Array.isArray(config.room_order) || config.room_order.some(id => typeof id !== "string" || !/^(climate|cover|light|switch)\./.test(id)))) {
        throw new Error("room_order must be a list of supported Wiser entity IDs");
      }
      if (config.hubs !== undefined && (!Array.isArray(config.hubs) || config.hubs.some(id => typeof id !== "string" || !id.length))) {
        throw new Error("hubs must be a list of Wiser config entry IDs");
      }
      if (config.room_columns !== undefined && (!Number.isInteger(config.room_columns) || config.room_columns < 1 || config.room_columns > 6)) {
        throw new Error("room_columns must be a whole number from 1 to 6");
      }
      if (config.room_type !== undefined && !["all", "heating", "shutters", "lights", "plugs"].includes(config.room_type)) throw new Error("room_type must be all, heating, shutters, lights or plugs");
      if (config.room_types !== undefined && (!Array.isArray(config.room_types) || !config.room_types.length || new Set(config.room_types).size !== config.room_types.length || config.room_types.some(type => !DEVICE_TYPES.includes(type)))) throw new Error("room_types must contain one or more unique supported device types");
      if (config.temperature_focus !== undefined && !["current", "target"].includes(config.temperature_focus)) throw new Error("temperature_focus must be current or target");
      if (config.show_controls !== undefined && typeof config.show_controls !== "boolean") throw new Error("show_controls must be a boolean");
      if (config.features !== undefined && (!Array.isArray(config.features) || config.features.some(feature => !FEATURES.includes(feature)))) throw new Error("features must contain modes, temperature or advance");
      if (config.room_options !== undefined) {
        if (!config.room_options || typeof config.room_options !== "object" || Array.isArray(config.room_options)) throw new Error("room_options must be an entity settings map");
        for (const [id, options] of Object.entries(config.room_options)) {
          if (!/^(climate|cover|light|switch)\./.test(id) || !options || typeof options !== "object" || Array.isArray(options)) throw new Error("Invalid room options");
          if (options.native_features !== undefined && !validNativeFeatures(options.native_features)) throw new Error("Invalid room native_features");
          if (options.features !== undefined && (!Array.isArray(options.features) || options.features.some(value => !FEATURES.includes(value)))) throw new Error("Invalid room features");
          if (options.features_position !== undefined && !["bottom", "inline"].includes(options.features_position)) throw new Error("Invalid room features_position");
          if (options.temperature_focus !== undefined && !["current", "target"].includes(options.temperature_focus)) throw new Error("Invalid room temperature emphasis");
          for (const key of ["tap_action","icon_tap_action","hold_action","icon_hold_action","double_tap_action","icon_double_tap_action"]) if (options[key] !== undefined && !validAction(options[key])) throw new Error(`Invalid room ${key}`);
        }
      }
      if (config.native_features !== undefined && !validNativeFeatures(config.native_features)) throw new Error("Invalid native_features");
      for (const key of ["tap_action","icon_tap_action","hold_action","icon_hold_action","double_tap_action","icon_double_tap_action"]) if (config[key] !== undefined && !validAction(config[key])) throw new Error(`Invalid ${key}`);
      this._config = {show_controls: true, title: "Wiser rooms", room_columns: 1, room_type: "all", temperature_focus: "current", ...config};
      this._render();
    }
    static getStubConfig() { return {type: "custom:wiser-rooms-card", title: "Wiser rooms"}; }
    static async getConfigElement() { await loadNativeFeatures(); return document.createElement("wiser-rooms-card-editor"); }
    getCardSize() { return 2 + Math.ceil(this._rooms().length / (this._config?.room_columns || 1)) * 1.6; }
    getGridOptions() { return {columns: 9, min_columns: 9}; }
    set hass(hass) {
      this._hass = hass;
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
        this._entries = await this._hass.callWS({type: "config/entity_registry/list"});
      } catch (error) {
        this._discoveryFailed = true;
        this._error = `Unable to find Wiser rooms: ${error.message || error}`;
      } finally { this._loading = false; this._render(); }
    }
    _rooms() {
      if (!this._hass || !this._entries) return [];
      const rooms = this._entries.filter(entry => isRoom(entry, this._hass.states[entry.entity_id]) && matchesHub(entry, this._config?.hubs) && matchesType(this._hass.states[entry.entity_id], selectedTypes(this._config)) && !this._config?.excluded_entities?.includes(entry.entity_id)).map(entry => this._hass.states[entry.entity_id]);
      if (this._config?.entities?.length) return this._config.entities.map(id => rooms.find(room => room.entity_id === id)).filter(Boolean);
      return orderRooms(rooms, this._config?.room_order);
    }
    _name(room) {
      const name = roomConfig(this._config || {}, room.entity_id).name;
      if (typeof name === "string") return name;
      if (name && this._hass?.formatEntityName) return this._hass.formatEntityName(room, name);
      return room.attributes.name || room.attributes.friendly_name || room.entity_id;
    }
    _contentClass(options) {
      return `${options.hide_state ? "hide-status" : ""} ${options.show_temperatures === false ? "hide-temps" : ""} ${options.show_next_schedule === false ? "hide-next" : ""}`;
    }
    _contentIcon(room, fallback) {
      const options = roomConfig(this._config, room.entity_id);
      return `<ha-state-icon data-room-icon="${escape(room.entity_id)}" icon="${escape(options.icon || fallback)}"></ha-state-icon>`;
    }
    _contentStatus(room) {
      return `<state-display data-room-status="${escape(room.entity_id)}"></state-display>`;
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
    _secondaryFeatures(room) {
      return nativeFeatures(roomConfig(this._config, room.entity_id), room.entity_id).filter(feature => isSecondaryFeature(feature));
    }
    _secondaryMarkup(room) {
      return this._secondaryFeatures(room).map((_, index) => `<wiser-secondary-status-feature data-key="secondary-${index}" data-secondary-room="${escape(room.entity_id)}" data-secondary-index="${index}"></wiser-secondary-status-feature>`).join("");
    }
    _nativeMarkup(room) {
      const position = roomConfig(this._config, room.entity_id).features_position || "bottom";
      const list = nativeFeatures(roomConfig(this._config, room.entity_id), room.entity_id).filter(feature => !isHeaderFeature(feature));
      if (!list.length) return "";
      const host = (feature, index) => `<hui-card-features class="features-${position}${feature.type === `custom:${NEXT_SCHEDULE_FEATURE}` ? " feature-icon-only" : ""}" data-key="features-${escape(room.entity_id)}-${index}" data-room-features="${escape(room.entity_id)}" data-feature-index="${index}" style="--feature-height:40px"></hui-card-features>`;
      if (position === "inline") return `<div class="features-inline-row">${list.map(host).join("")}</div>`;
      const rows = [];
      list.forEach((feature, index) => {
        if (feature.type === `custom:${NEXT_SCHEDULE_FEATURE}` && rows.length) rows.at(-1).push([feature, index]);
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
        display.hass = this._hass; display.stateObj = this._hass.states[id];
        display.content = roomConfig(this._config, id).state_content ?? this._defaultStateContent(id);
      }
      for (const element of this.shadowRoot.querySelectorAll?.("wiser-secondary-status-feature[data-secondary-room]") || []) {
        const id = element.dataset.secondaryRoom;
        const config = this._secondaryFeatures(this._hass.states[id])[Number(element.dataset.secondaryIndex)];
        element.hass = this._hass;
        element.context = {entity_id:id};
        if (element._wiserConfig !== JSON.stringify(config)) {
          element.setConfig(config);
          element._wiserConfig = JSON.stringify(config);
        }
      }
      for (const element of this.shadowRoot.querySelectorAll?.("hui-card-features") || []) {
        const id = element.dataset.roomFeatures;
        const allFeatures = nativeFeatures(roomConfig(this._config, id), id).filter(feature => !isHeaderFeature(feature));
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
    _renderShutter(room, preview) {
      const options = roomConfig(this._config, room.entity_id);
      const id = escape(room.entity_id), a = room.attributes;
      const status = !available(room) ? "Unavailable" : ({open:"Open",closed:"Closed",opening:"Opening",closing:"Closing"}[room.state] || room.state);
      const disabled = this._busy || !available(room);
      const position = typeof a.current_position === "number" ? a.current_position : null;
      const color = available(room) ? "var(--state-cover-active-color,var(--primary-color))" : "var(--disabled-text-color)";
      return `<section data-key="${id}" class="room ${preview && this._config[PREVIEW_ROOM] === room.entity_id ? "preview-selected" : ""}" style="--room-state-color:${this._contentColor(room, color)};${featureOrder(options)}"><div class="room-content">
        <div class="top ${this._secondaryFeatures(room).length ? "has-secondary" : ""} ${this._contentClass(options)}"><button class="state-icon" data-entity="${id}" data-interaction="icon" aria-label="Open shutter details">${this._contentIcon(room, room.state === "closed" ? "mdi:window-shutter" : "mdi:window-shutter-open")}</button>
        <div class="room-heading"><div class="identity"><button class="name" data-entity="${id}" data-interaction="card"><strong>${escape(this._name(room))}</strong></button><span class="status">${this._contentStatus(room, status)}</span>${this._secondaryMarkup(room)}</div>
        <div class="readings"><div class="temps">${position === null ? "—" : `${position}%`}</div><div class="next">${escape(a.room || "")}</div></div></div></div>
        ${this._nativeReady || options.native_features ? this._nativeMarkup(room) : features(options).some(feature => feature === "modes" || feature === "temperature" && (a.supported_features & 4)) ? `<div class="controls">${features(options).includes("modes") ? `<div class="modes" role="group" aria-label="Shutter controls">${[["open_cover",1,"arrow-up","Open"],["stop_cover",8,"stop","Stop"],["close_cover",2,"arrow-down","Close"]].map(([service,feature,icon,label]) =>
          `<button class="mode" data-action="shutter" data-entity="${id}" data-service="${service}" title="${label}" aria-label="${label}" ${disabled || !(a.supported_features & feature) ? "disabled" : ""}><ha-icon icon="mdi:${icon}"></ha-icon></button>`).join("")}</div>` : ""}
        ${features(options).includes("temperature") && a.supported_features & 4 ? `<input type="number" data-entity="${id}" data-field="position" aria-label="${escape(this._name(room))} position percent" title="Position (0% closed, 100% open)" value="${position ?? ""}" min="0" max="100" step="1" ${disabled ? "disabled" : ""}>` : ""}</div>` : ""}</div></section>`;
    }
    _deviceSchedule(state) {
      const date = state.attributes.next_schedule_datetime ? new Date(state.attributes.next_schedule_datetime) : null;
      const time = date && Number.isFinite(date.getTime()) ? date.toLocaleString(this._hass.locale?.language || this._hass.language, {weekday:"short",hour:"2-digit",minute:"2-digit"}) : state.attributes.next_schedule_change;
      return state.attributes.schedule_id && time ? `Next ${time} · ${state.attributes.next_schedule_state ?? ""}` : state.attributes.schedule_id ? state.attributes.schedule_name : "No schedule assigned";
    }
    _renderPoweredDevice(state, preview) {
      const options = roomConfig(this._config, state.entity_id);
      const id = escape(state.entity_id), light = isLight(state), on = state.state === "on";
      const status = !available(state) ? "Unavailable" : on ? "On" : "Off";
      const disabled = this._busy || !available(state) ? "disabled" : "";
      const brightness = light && typeof state.attributes.brightness === "number" ? Math.round(state.attributes.brightness / 255 * 100) : null;
      const reading = light ? (brightness === null ? "—" : `${brightness}%`) : status;
      const icon = light ? (on ? "mdi:lightbulb" : "mdi:lightbulb-outline") : (on ? "mdi:power-socket-uk" : "mdi:power-socket-uk");
      const color = available(state) && on ? "var(--state-light-active-color,var(--primary-color))" : "var(--secondary-text-color)";
      const useNative = this._nativeReady || options.native_features !== undefined;
      const native = useNative ? this._nativeMarkup(state) : "";
      const brightnessControl = light ? `<input type="number" data-entity="${id}" data-field="brightness" aria-label="${escape(this._name(state))} brightness percent" title="Brightness" value="${brightness ?? ""}" min="1" max="100" step="1" ${disabled}>` : "";
      const fallbackControls = useNative ? "" : `<div class="controls">${brightnessControl}<button data-action="device" data-entity="${id}" data-service="turn_${on ? "off" : "on"}" aria-label="Turn ${escape(this._name(state))} ${on ? "off" : "on"}" title="Turn ${on ? "off" : "on"}" ${disabled}><ha-icon icon="mdi:power"></ha-icon></button></div>`;
      return `<section data-key="${id}" class="room device-${light ? "light" : "plug"} ${on ? "powered" : ""} ${preview && this._config[PREVIEW_ROOM] === state.entity_id ? "preview-selected" : ""}" style="--room-state-color:${this._contentColor(state, color)};${featureOrder(options)}"><div class="room-content">
        <div class="top ${this._secondaryFeatures(state).length ? "has-secondary" : ""} ${this._contentClass(options)}"><button class="state-icon" data-entity="${id}" data-interaction="icon" aria-label="Open device details">${this._contentIcon(state, icon)}</button>
        <div class="room-heading"><div class="identity"><button class="name" data-entity="${id}" data-interaction="card"><strong>${escape(this._name(state))}</strong></button><span class="status">${this._contentStatus(state, status)}</span>${this._secondaryMarkup(state)}</div>
        <div class="readings"><div class="temps">${options.show_temperatures === false ? "" : escape(reading)}</div><div class="next">${options.show_next_schedule === false ? "" : escape(this._deviceSchedule(state))}</div></div></div></div>
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
    _click(event) {
      const button = event.target.closest("button,ha-button");
      if (!button || button.disabled) return;
      if (button.dataset.action === "all-off") { this._allOff(); return; }
      if (button.dataset.action === "all-close") { this._closeAll(); return; }
      if (button.dataset.action === "all-lights-off") { this._allDevicesOff("lights"); return; }
      if (button.dataset.action === "all-plugs-off") { this._allDevicesOff("plugs"); return; }
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
      const canClose = rooms.some(room => isShutter(room) && available(room) && room.state !== "closed" && (room.attributes.supported_features & 2));
      const canTurnOff = type => rooms.some(state => deviceType(state) === type && available(state) && state.state === "on");
      const allOffAction = section => `<ha-button class="off${section ? " section-action" : ""}" data-action="all-off" size="m" appearance="plain" variant="danger" ${this._busy || !canOff ? "disabled" : ""} title="Turn all heating off"><ha-icon slot="start" icon="mdi:power"></ha-icon>All off</ha-button>`;
      const closeAllAction = section => `<ha-button class="off close-all${section ? " section-action" : ""}" data-action="all-close" size="m" appearance="plain" variant="brand" ${this._busy || !canClose ? "disabled" : ""} title="Close all shutters"><ha-icon slot="start" icon="mdi:window-shutter"></ha-icon>Close all</ha-button>`;
      const deviceOffAction = (type, section) => `<ha-button class="off device-off${section ? " section-action" : ""}" data-action="all-${type}-off" size="m" appearance="plain" variant="brand" ${this._busy || !canTurnOff(type) ? "disabled" : ""} title="Turn all ${type === "plugs" ? "smart plugs" : type} off"><ha-icon slot="start" icon="mdi:power"></ha-icon>All off</ha-button>`;
      const headerAction = grouped ? "" : singleType === "shutters" ? closeAllAction(false) : singleType === "lights" ? deviceOffAction("lights", false) : singleType === "plugs" ? deviceOffAction("plugs", false) : allOffAction(false);
      const unit = this._hass.config?.unit_system?.temperature || "°C";
      const groups = grouped
        ? [{key:"heating", title:"Heating", rooms:rooms.filter(room => deviceType(room) === "heating")},
           {key:"shutters", title:"Shutters", rooms:rooms.filter(isShutter)},
           {key:"lights", title:"Lights", rooms:rooms.filter(isLight)},
           {key:"plugs", title:"Smart plugs", rooms:rooms.filter(isPlug)}].filter(group => types.includes(group.key) && group.rooms.length)
        : [{key:singleType, title:"", rooms}];
      const groupStatus = group => {
        const total = group.rooms.length;
        const unavailable = group.rooms.filter(room => !available(room)).length;
        const active = group.rooms.filter(room => available(room) && (group.key === "heating"
          ? room.state !== "off" && room.attributes.hvac_action === "heating"
          : group.key === "shutters" ? room.state !== "closed" : room.state === "on")).length;
        const noun = group.key === "heating" ? `room${total === 1 ? "" : "s"}`
          : group.key === "shutters" ? `shutter${total === 1 ? "" : "s"}`
          : group.key === "lights" ? `light${total === 1 ? "" : "s"}` : `smart plug${total === 1 ? "" : "s"}`;
        const state = group.key === "heating" ? "heating" : group.key === "shutters" ? "open" : "on";
        return `${active} of ${total} ${noun} ${state}${unavailable ? ` · ${unavailable} unavailable` : ""}`;
      };
      const preview = isEditorPreview(this);
      // Orbit expands a selected item to its normal grid width (six of twelve by default).
      const expandPreview = preview && this._config.room_columns > 2;
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
          flex-shrink:0
        }
        .off ha-icon {
          --mdc-icon-size:26px
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
          transform:translateY(4px)
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
      </style><ha-card data-key="card" class="${preview ? "editor-preview" : ""}"><header data-key="header"><div><h2>${escape(this._config.title)}</h2>${grouped || !groups.length ? "" : `<p>${groupStatus(groups[0])}</p>`}</div>${headerAction}</header>
          ${this._error ? `<div data-key="error" class="message error" role="alert">${escape(this._error)}${this._discoveryFailed ? '<ha-button data-action="retry" size="s" appearance="outlined" variant="danger">Retry</ha-button>' : ""}</div>` : ""}
      ${!rooms.length ? `<p data-key="empty" class="message">${this._loading ? "Finding Wiser devices…" : "No matching Wiser devices found."}</p>` : groups.map(group => `${grouped ? `<section class="room-section" data-key="section-${group.key}"><div class="section-title" data-key="heading-${group.key}"><div><h3>${group.title}</h3><p>${groupStatus(group)}</p></div>${group.key === "heating" ? allOffAction(true) : group.key === "shutters" ? closeAllAction(true) : deviceOffAction(group.key, true)}</div>` : ""}<div class="rooms ${expandPreview ? "preview-rows" : ""}" data-key="rooms-${group.key}" style="--room-columns:${this._config.room_columns}">${group.rooms.map((room, index) => {
        const options = roomConfig(this._config, room.entity_id);
        const columns = this._config.room_columns;
        const rowStart = expandPreview && index % columns === 0 ? `<div class="preview-row" data-key="preview-row-${Math.floor(index / columns)}">` : "";
        const rowEnd = expandPreview && (index % columns === columns - 1 || index === group.rooms.length - 1)
          ? `${index === group.rooms.length - 1 ? '<div class="preview-spacer"></div>'.repeat((columns - group.rooms.length % columns) % columns) : ""}</div>` : "";
        if (preview && this._config[PREVIEW_ROOM] !== room.entity_id) {
          return `${rowStart}<section data-key="${escape(room.entity_id)}" class="room preview-placeholder"><ha-icon icon="mdi:${isShutter(room) ? "window-shutter" : isLight(room) ? "lightbulb-outline" : isPlug(room) ? "power-socket-uk" : "home-thermometer-outline"}"></ha-icon><span>${escape(this._name(room))}</span></section>${rowEnd}`;
        }
        if (isShutter(room)) return `${rowStart}${this._renderShutter(room, preview)}${rowEnd}`;
        if (isLight(room) || isPlug(room)) return `${rowStart}${this._renderPoweredDevice(room, preview)}${rowEnd}`;
        const a = room.attributes, id = escape(room.entity_id);
        const pending = this._targets.get(room.entity_id);
        if (pending && (Date.now() > pending.expires || (!this._temperatureSending && a.temperature === pending.value))) this._targets.delete(room.entity_id);
        const targetTemperature = this._targets.get(room.entity_id)?.value ?? a.temperature;
        const active = available(room) && room.state !== "off" && a.hvac_action === "heating";
        const status = !available(room) ? "Unavailable" : room.state === "off" ? "Off" : active ? "Heating" : "Idle";
        const disabled = this._busy || !available(room) ? "disabled" : "";
        const ranged = typeof a.target_temp_low === "number" && typeof a.target_temp_high === "number";
        const target = ranged ? `${this._temperature(a.target_temp_low)} – ${this._temperature(a.target_temp_high)}` : this._temperature(targetTemperature);
        const scheduled = Boolean(a.schedule_id);
        const icon = !available(room) ? "mdi:alert-circle-outline" : room.state === "off" ? "mdi:power" : active ? "mdi:fire" : "mdi:radiator";
        const nextDate = a.next_schedule_datetime ? new Date(a.next_schedule_datetime) : null;
        const nextTime = nextDate && Number.isFinite(nextDate.getTime()) ? nextDate.toLocaleString(this._hass.locale?.language || this._hass.language, {weekday:"short",hour:"2-digit",minute:"2-digit"}) : a.next_schedule_change;
        const next = scheduled && nextTime ? `Next ${nextTime} · ${this._temperature(a.next_schedule_temp)}` : scheduled ? a.schedule_name : "No schedule assigned";
        // Match the native tile's climate state colour and theme fallbacks.
        const mode = ["auto", "heat", "off"].includes(room.state) ? room.state : "off";
        const activity = mode === "off" ? "inactive" : "active";
        const stateColor = available(room)
          ? `var(--state-climate-${mode}-color,var(--state-climate-${activity}-color,var(--state-${activity}-color,var(--secondary-text-color))))`
          : "var(--state-unavailable-color,var(--disabled-text-color))";
        const secondary = this._secondaryMarkup(room);
        const temperatureMarkup = options.temperature_focus === "target"
          ? `<small>${escape(this._temperature(a.current_temperature))}</small> ${escape(target)}`
          : `${escape(this._temperature(a.current_temperature))}<small> ${escape(target)}</small>`;
        const statusMarkup = this._contentStatus(room, status + (a.is_boosted ? " · Boost" : a.is_override ? " · Override" : ""));
        const headerMarkup = secondary ? `<div class="top has-secondary ${this._contentClass(options)}"><button class="state-icon" data-entity="${id}" data-interaction="icon" title="${escape(status)} — open room controls" aria-label="${escape(this._name(room))}: ${status}">${this._contentIcon(room, icon)}</button>
          <div class="secondary-layout"><div class="secondary-heading-line"><button class="name" data-entity="${id}" data-interaction="card" title="Open room controls"><strong>${escape(this._name(room))}</strong></button><div class="temps" title="Current ${escape(unit)} → target ${escape(unit)}" aria-label="Current ${escape(this._temperature(a.current_temperature))}; Target ${escape(target)}">${temperatureMarkup}</div></div>
          <div class="secondary-primary-line"><span class="status">${statusMarkup}</span><div class="next" title="${escape(a.schedule_name || "")}">${escape(next)}</div></div>${secondary}</div></div>`
          : `<div class="top ${this._contentClass(options)}"><button class="state-icon" data-entity="${id}" data-interaction="icon" title="${escape(status)} — open room controls" aria-label="${escape(this._name(room))}: ${status}">${this._contentIcon(room, icon)}</button>
          <div class="room-heading"><div class="identity"><button class="name" data-entity="${id}" data-interaction="card" title="Open room controls"><strong>${escape(this._name(room))}</strong></button><span class="status">${statusMarkup}</span></div>
          <div class="readings"><div class="temps" title="Current ${escape(unit)} → target ${escape(unit)}" aria-label="Current ${escape(this._temperature(a.current_temperature))}; Target ${escape(target)}">${temperatureMarkup}</div>
          <div class="next" title="${escape(a.schedule_name || "")}">${escape(next)}</div></div></div></div>`;
        return `${rowStart}<section data-key="${id}" class="room ${active ? "heating" : ""} ${preview && this._config[PREVIEW_ROOM] === room.entity_id ? "preview-selected" : ""}" style="--room-state-color:${this._contentColor(room, stateColor)};${featureOrder(options)}"><div class="room-content">
          ${headerMarkup}
          ${this._nativeReady || options.native_features ? this._nativeMarkup(room) : features(options).length ? `<div class="controls">${features(options).includes("modes") ? `<div class="modes" role="group" aria-label="${escape(this._name(room))} mode">${["auto", "heat", "off"].filter(mode => a.hvac_modes?.includes(mode)).map(mode => {
            const label = {auto:"Schedule",heat:"Manual",off:"Off"}[mode];
            const modeIcon = {auto:"mdi:thermostat-auto",heat:"mdi:fire",off:"mdi:power"}[mode];
            return `<button class="mode ${mode === room.state ? "active" : ""}" data-action="mode" data-entity="${id}" data-mode="${mode}" aria-pressed="${mode === room.state}" aria-label="${label}" title="${label}" ${disabled || mode === "auto" && !scheduled ? "disabled" : ""}><ha-icon icon="${modeIcon}"></ha-icon></button>`;
          }).join("")}</div>` : ""}
          ${features(options).includes("temperature") ? (ranged ? `<button data-entity="${id}" title="Adjust temperature range" aria-label="Adjust temperature range"><ha-icon icon="mdi:thermostat"></ha-icon></button>` : `<input type="number" data-entity="${id}" data-field="temperature" aria-label="${escape(this._name(room))} target temperature" title="Target ${escape(unit)}" value="${typeof targetTemperature === "number" ? targetTemperature : ""}" min="${a.min_temp ?? 5}" max="${a.max_temp ?? 30}" step="${a.target_temp_step || .5}" ${disabled || room.state === "off" ? "disabled" : ""}>`) : ""}
          ${features(options).includes("advance") ? `<button data-action="advance" data-entity="${id}" aria-label="Advance schedule for ${escape(this._name(room))}" title="Advance to next schedule period" ${disabled || !scheduled || room.state !== "auto" || !a.preset_modes?.includes("Advance Schedule") ? "disabled" : ""}><ha-icon icon="mdi:calendar-arrow-right"></ha-icon></button>` : ""}</div>` : ""}</div></section>${rowEnd}`;
      }).join("")}</div>${grouped ? "</section>" : ""}`).join("")}</ha-card>`;
      this._updateDOM(markup);
      this._syncNativeFeatures();
      this._layoutHeaders();
    }
  }
  const SECONDARY_STATUS_FEATURE = "wiser-secondary-status-feature";
  const NEXT_SCHEDULE_FEATURE = "wiser-next-schedule-feature";
  const isSecondaryFeature = feature => feature.type === `custom:${SECONDARY_STATUS_FEATURE}`;
  const isHeaderFeature = feature => isSecondaryFeature(feature);
  class WiserSecondaryStatusFeature extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({mode:"open"});
      const style = document.createElement("style");
      style.textContent = `:host{display:block;pointer-events:auto;min-width:0}button{display:block;width:100%;padding:0;border:0;background:none;color:var(--secondary-text-color);font:inherit;font-size:12px;text-align:start;cursor:pointer}button:focus-visible{outline:2px solid var(--primary-color)}state-display{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`;
      this._button = document.createElement("button");
      this._button.type = "button";
      this._display = document.createElement("state-display");
      this._button.append(this._display);
      this._button.addEventListener("click", event => {
        event.stopPropagation();
        const id = this._config?.entity || this._context?.entity_id || this._stateObj?.entity_id;
        if (id && this._hass?.states[id]) this.dispatchEvent(new CustomEvent("hass-more-info", {bubbles:true, composed:true, detail:{entityId:id}}));
      });
      this.shadowRoot.append(style, this._button);
    }
    static getStubConfig() { return {type:`custom:${SECONDARY_STATUS_FEATURE}`, state_content:["state"]}; }
    static getConfigElement() { return document.createElement("wiser-secondary-status-feature-editor"); }
    setConfig(config) { this._config = {...config}; this._render(); }
    set hass(value) { this._hass = value; this._render(); }
    set context(value) { this._context = value; this._render(); }
    set stateObj(value) { this._stateObj = value; this._render(); }
    _render() {
      if (!this._hass || !this._config) return;
      const id = this._config.entity || this._context?.entity_id || this._stateObj?.entity_id;
      const state = this._hass.states[id];
      this._button.disabled = !state;
      this._display.hidden = !state;
      this._button.title = state?.attributes?.friendly_name || id || "Secondary status";
      this._display.hass = this._hass;
      this._display.stateObj = state;
      this._display.content = this._config.state_content?.length ? this._config.state_content : ["state"];
      this._display.timestampTooltip = true;
    }
  }
  class WiserSecondaryStatusFeatureEditor extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({mode:"open"});
      this._form = document.createElement("ha-form");
      this._form.computeLabel = schema => schema.name === "entity" ? "Entity" : "State content";
      this._form.schema = [
        {name:"entity", required:true, selector:{entity:{}}},
        {name:"state_content", selector:{ui_state_content:{allow_context:true}}, context:{filter_entity:"entity"}},
      ];
      this._form.addEventListener("value-changed", event => {
        event.stopPropagation();
        this._config = {...this._config, ...event.detail.value, type:`custom:${SECONDARY_STATUS_FEATURE}`};
        this.dispatchEvent(new CustomEvent("config-changed", {bubbles:true, composed:true, detail:{config:this._config}}));
      });
      this.shadowRoot.append(this._form);
    }
    setConfig(config) { this._config = {...config}; this._render(); }
    set hass(value) { this._hass = value; this._render(); }
    set context(value) { this._context = value; this._render(); }
    _render() {
      if (!this._hass || !this._config) return;
      this._form.hass = this._hass;
      const data = {entity:this._config.entity || this._context?.entity_id || "", state_content:this._config.state_content?.length ? this._config.state_content : ["state"]};
      if (JSON.stringify(data) !== this._signature) {
        this._form.data = data;
        this._signature = JSON.stringify(data);
      }
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
      this._button.title = enabled ? "Advance to next schedule period" : "Advance schedule unavailable";
      this._button.ariaLabel = this._button.title;
    }
  }
  if (!customElements.get(SECONDARY_STATUS_FEATURE)) customElements.define(SECONDARY_STATUS_FEATURE, WiserSecondaryStatusFeature);
  if (!customElements.get("wiser-secondary-status-feature-editor")) customElements.define("wiser-secondary-status-feature-editor", WiserSecondaryStatusFeatureEditor);
  if (!customElements.get(NEXT_SCHEDULE_FEATURE)) customElements.define(NEXT_SCHEDULE_FEATURE, WiserNextScheduleFeature);
  window.customCardFeatures = window.customCardFeatures || [];
  if (!window.customCardFeatures.some(feature => feature.type === SECONDARY_STATUS_FEATURE)) window.customCardFeatures.push({
    type:SECONDARY_STATUS_FEATURE, name:"Secondary status", configurable:true,
    isSupported:(hass, context) => Boolean(context?.entity_id?.startsWith("climate.") && hass.states[context.entity_id]),
  });
  if (!window.customCardFeatures.some(feature => feature.type === NEXT_SCHEDULE_FEATURE)) window.customCardFeatures.push({
    type:NEXT_SCHEDULE_FEATURE, name:"Next schedule", configurable:false,
    isSupported:(hass, context) => Boolean(context?.entity_id?.startsWith("climate.") && hass.states[context.entity_id]),
  });
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
        if (next.length === DEVICE_TYPES.length) { config.room_type = "all"; delete config.room_types; }
        else { config.room_types = next; delete config.room_type; }
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
      this._featureList.innerHTML = '<ha-expansion-panel outlined><ha-icon slot="leading-icon" icon="mdi:list-box"></ha-icon><h3 slot="header">Features</h3><div class="content"></div></ha-expansion-panel>';
      this._nativeEditor = document.createElement("hui-card-features-editor");
      this._featurePositionForm = document.createElement("ha-form");
      this._featurePositionForm.className = "features-form";
      this._featurePositionForm.computeLabel = schema => schema.label;
      this._featurePositionForm.schema = [{name:"features_position",label:"Features position",selector:{select:{mode:"box",options:[
        {value:"bottom",label:"Bottom"},{value:"inline",label:"Inline"},
      ]}}}];
      this._featurePositionForm.addEventListener("value-changed", event => {
        event.stopPropagation();
        this._setRoomOptions({features_position:event.detail.value.features_position || "bottom"});
      });
      this._featureList.querySelector?.(".content")?.append(this._nativeEditor, this._featurePositionForm);
      this._nativeEditor.addEventListener("features-changed", event => {
        event.stopPropagation();
        this._setRoomOptions({native_features:event.detail.features});
      });
      this._nativeEditor.addEventListener("edit-detail-element", event => {
        event.stopPropagation();
        const id = this._selectedRoom;
        const index = event.detail.subElementConfig.index;
        const config = nativeFeatures(roomConfig(this._config, id), id)[index];
        this.dispatchEvent(new CustomEvent("edit-sub-element", {bubbles:true, composed:true, detail:{
          type:"feature", config, context:{entity_id:id},
          saveConfig: newConfig => {
            const list = [...nativeFeatures(roomConfig(this._config, id), id)];
            list[index] = newConfig;
            this._saveNativeFeatures(id, list);
          },
        }}));
      });
      this._message = document.createElement("p");
      this._message.style.cssText = "color:var(--secondary-text-color);font-size:14px";
      this._version = document.createElement("div");
      this._version.className = "version";
      this._version.textContent = `Wiser Rooms Card · ${CARD_VERSION}`;
      this._tabs = document.createElement("div");
      this._tabs.addEventListener("click", event => {
        const button = event.target.closest("[data-room],[data-action]");
        if (!button || button.disabled) return;
        if (button.dataset.room) { this._selectRoom(button.dataset.room); }
        else if (button.dataset.action) this._roomAction(button.dataset.action);
      });
      this._tabs.addEventListener("keydown", event => {
        if (!event.target.matches('[role="tab"]') || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const rooms = this._rooms();
        let index = rooms.findIndex(room => room.entity_id === this._selectedRoom);
        index = event.key === "Home" ? 0 : event.key === "End" ? rooms.length - 1
          : (index + (event.key === "ArrowLeft" ? -1 : 1) + rooms.length) % rooms.length;
        this._selectRoom(rooms[index].entity_id);
        this._tabs.querySelector('[role="tab"][aria-selected="true"]').focus();
      });
      const style = document.createElement("style");
      style.textContent = `
        ha-form.hubs{display:block;margin-bottom:16px}
        ha-form.settings::part(root){display:grid;grid-template-columns:minmax(0,1fr) 130px;column-gap:8px;align-items:start}
        .show-filter{display:block;margin-top:16px}
        .show-label{display:block;margin:0 0 8px;font-size:14px;color:var(--primary-text-color)}
        .show-options{display:flex;flex-wrap:wrap;gap:8px}
        .room-tab-bar{display:flex;flex-direction:row;align-items:center;gap:6px;border-bottom:1px solid var(--divider-color);padding-bottom:2px;margin:20px 0 12px}
        .room-tabs{display:flex;flex-wrap:nowrap;gap:4px;flex:1;min-width:0;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:thin}
        button{font:inherit;color:var(--primary-text-color);cursor:pointer}
        button:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}
        .room-tabs button{border:0;border-bottom:3px solid transparent;background:transparent;flex:0 0 40px;min-width:40px;min-height:40px;padding:6px 8px;opacity:.6;white-space:nowrap}
        .room-tabs button.active{color:var(--primary-color);opacity:1;border-bottom-color:var(--primary-color)}
        .room-tabs button.hidden-room{text-decoration:line-through}
        .room-tools{display:flex;flex-wrap:nowrap;gap:4px;margin-left:auto;flex-shrink:0}
        .room-tools ha-icon-button{--ha-icon-button-size:34px}
        button:disabled{opacity:.35;cursor:default}ha-icon{--mdc-icon-size:20px;pointer-events:none}
        ha-form.room-options{display:block;margin-bottom:24px}
        ha-expansion-panel{display:block;--expansion-panel-content-padding:0;border-radius:var(--ha-border-radius-md);--ha-card-border-radius:var(--ha-border-radius-md)}
        ha-expansion-panel .content{padding:12px}
        ha-expansion-panel>*[slot="header"]{margin:0;font-size:inherit;font-weight:inherit}
        ha-expansion-panel ha-icon{color:var(--secondary-text-color)}
        .features-form{display:block;margin-top:var(--ha-space-6);margin-bottom:0}
        .version{margin-top:24px;color:var(--secondary-text-color);font-size:12px;text-align:right}
      `;
      this._roomForm.className = "room-options";
      this.shadowRoot.append(style, this._hubForm, this._form, this._typeForm, this._tabs, this._roomForm, this._featureList, this._message, this._version);
      this._form.computeLabel = schema => schema.label || "Title";
      this._form.addEventListener("value-changed", event => this._changed(event));
    }
    setConfig(config) {
      this._config = {...config};
      this._render();
    }
    set hass(hass) {
      this._hass = hass;
      if (!this._entries && !this._loading && !this._failed) this._discover();
      this._render();
    }
    async _discover() {
      this._loading = true;
      try {
        this._entries = await this._hass.callWS({type: "config/entity_registry/list"});
        try {
          const entries = await this._hass.callWS({type: "config_entries/get", domain: "wiser"});
          this._hubs = Array.isArray(entries) ? entries : [];
        } catch (_) {
          this._hubs = [];
        }
      } catch (_) {
        this._failed = true;
      } finally {
        this._loading = false;
        this._render();
      }
    }
    _rooms() {
      if (!this._hass || !this._entries) return [];
      return orderRooms(this._entries.filter(entry => isRoom(entry, this._hass.states[entry.entity_id]) && matchesHub(entry, this._config?.hubs) && matchesType(this._hass.states[entry.entity_id], selectedTypes(this._config)))
        .map(entry => this._hass.states[entry.entity_id]), this._config?.room_order || this._config?.entities);
    }
    _detectedHubs() {
      const titles = new Map((this._hubs || []).map(entry => [entry.entry_id, entry.title || entry.entry_id]));
      return [...new Set((this._entries || []).filter(entry => entry.platform === "wiser" && entry.config_entry_id).map(entry => entry.config_entry_id))]
        .map(id => ({value:id, label:titles.get(id) || id}));
    }
    _name(room) { return room.attributes.name || room.attributes.friendly_name || room.entity_id; }
    _shown(id) {
      return !this._config.excluded_entities?.includes(id) &&
        (!this._config.entities?.length || this._config.entities.includes(id));
    }
    _render() {
      if (!this._config || !this._hass) return;
      const rooms = this._rooms();
      const hubs = this._detectedHubs();
      this._hubForm.hass = this._hass;
      const hubSchema = [{name:"hubs",label:"Hubs",selector:{select:{multiple:true,mode:"dropdown",options:hubs}}}];
      const hubSignature = JSON.stringify(hubSchema);
      if (hubSignature !== this._hubSchemaSignature) { this._hubForm.schema = hubSchema; this._hubSchemaSignature = hubSignature; }
      const hubData = {hubs:this._config.hubs || hubs.map(hub => hub.value)};
      if (JSON.stringify(hubData) !== JSON.stringify(this._hubForm.data)) this._hubForm.data = hubData;
      this._hubForm.hidden = !hubs.length;
      this._form.hass = this._hass;
      const schema = [
        {name: "title", selector: {text: {}}},
        {name: "room_columns", label: "Devices per row", selector: {number: {min: 1, max: 6, step: 1, mode: "box"}}},
        {name: "room_type", label: "Show", selector: {select: {mode: "box", options: [
          {value: "all", label: "All"}, {value: "heating", label: "Heating"}, {value: "shutters", label: "Shutters"},
          {value: "lights", label: "Lights"}, {value: "plugs", label: "Smart plugs"},
        ]}}},
        {name: "temperature_focus", label: "Temperature emphasis", selector: {select: {mode: "box", options: [
          {value: "current", label: "Current"}, {value: "target", label: "Target"},
        ]}}},

      ];
      // Retain the form schema during state updates so edits keep their focus.
      const signature = JSON.stringify(schema);
      if (signature !== this._schemaSignature) {
        this._form.schema = schema.slice(0, 2);
        this._typeForm.schema = schema.slice(2, 3);

        this._schemaSignature = signature;
      }
      const data = {title: this._config.title ?? "Wiser rooms", room_columns: this._config.room_columns ?? 1};
      if (JSON.stringify(data) !== JSON.stringify(this._form.data)) this._form.data = data;
      const activeTypes = selectedTypes(this._config);
      this._typeForm.data = {room_types:activeTypes};
      const typeOptions = schema[2].selector.select.options;
      const typeMarkup = `<span class="show-label" id="show-label">Show</span><div class="show-options" role="group" aria-labelledby="show-label">${typeOptions.map(option => {
        const active = option.value === "all" ? activeTypes.length === DEVICE_TYPES.length : activeTypes.includes(option.value);
        return `<ha-button size="s" appearance="${active ? "filled" : "outlined"}" data-room-type="${option.value}" aria-pressed="${active}">${option.label}</ha-button>`;
      }).join("")}</div>`;
      if (typeMarkup !== this._typeMarkup) { this._typeForm.innerHTML = typeMarkup; this._typeMarkup = typeMarkup; }
      this._renderTabs(rooms);
      const selectedOptions = roomConfig(this._config, this._selectedRoom);
      this._roomForm.hass = this._hass;
      const selectedState = this._hass.states[this._selectedRoom];
      const selectedType = selectedState ? deviceType(selectedState) : "heating";
      const shutter = selectedType === "shutters";
      const heating = selectedType === "heating";
      const metricLabel = shutter ? "Show position" : selectedType === "lights" ? "Show brightness" : selectedType === "plugs" ? "Show status reading" : "Show current / target temperature";
      const contentSchema = [
        {name:"name", label:"Name", selector:{entity_name:{}}, context:{entity:"entity"}},
        {name:"", type:"grid", schema:[
          {name:"icon", label:"Icon", selector:{icon:{}}, context:{icon_entity:"entity"}},
          {name:"color", label:"Colour", selector:{ui_color:{default_color:"state",include_state:true}}},
        ]},
        {name:"", type:"grid", schema:[
          {name:"hide_state",label:"Hide state",selector:{boolean:{}}},
          {name:"show_temperatures",label:metricLabel,selector:{boolean:{}}},
        ]},
        {name:"state_content",label:"State content",visible:{field:"hide_state",operator:"not_eq",value:true},selector:{ui_state_content:{allow_context:true}},context:{filter_entity:"entity"}},
        ...(heating ? [schema[3]] : []),
        {name:"show_next_schedule",label:"Show next schedule",selector:{boolean:{}}},
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
        {name:"content",type:"expandable",flatten:true,icon:"mdi:text-short",schema:contentSchema},
        {name:"interactions",type:"expandable",flatten:true,icon:"mdi:gesture-tap",schema:actionSchema},
      ];
      const roomSignature = JSON.stringify(roomSchema);
      if (roomSignature !== this._roomSchema) { this._roomForm.schema = roomSchema; this._roomSchema = roomSignature; }
      const roomData = {entity:this._selectedRoom,name:selectedOptions.name ?? [{type:"area"}],icon:selectedOptions.icon,color:selectedOptions.color || "state",hide_state:selectedOptions.hide_state ?? false,state_content:selectedOptions.state_content ?? [heating ? "hvac_action" : "state"],temperature_focus:selectedOptions.temperature_focus ?? "current",show_temperatures:selectedOptions.show_temperatures ?? true,show_next_schedule:selectedOptions.show_next_schedule ?? true,
        tap_action:selectedOptions.tap_action,icon_tap_action:selectedOptions.icon_tap_action,
        hold_action:selectedOptions.hold_action,icon_hold_action:selectedOptions.icon_hold_action,
        double_tap_action:selectedOptions.double_tap_action,icon_double_tap_action:selectedOptions.icon_double_tap_action};
      for (const key of Object.keys(roomData)) if (roomData[key] === undefined) delete roomData[key];
      if (JSON.stringify(roomData) !== JSON.stringify(this._roomForm.data)) this._roomForm.data = roomData;
      this._roomForm.hidden = !this._selectedRoom;
      this._featureList.hidden = !this._selectedRoom;
      this._renderFeatures();
      this._message.textContent = this._failed ? "Unable to detect rooms. Close and reopen the editor to retry."
        : this._loading ? "Finding Wiser rooms…"
        : !rooms.length ? "No matching Wiser devices found."
        : "";
      this._message.hidden = !this._message.textContent;
    }
    _setRoomOptions(options) {
      if (!this._selectedRoom) return;
      const current = {...this._config.room_options?.[this._selectedRoom]};
      for (const [key, value] of Object.entries(options)) {
        if (value === undefined) delete current[key];
        else current[key] = value;
      }
      this._config = {...this._config, room_options: {...this._config.room_options,
        [this._selectedRoom]: current}};
      this._render();
      this._dispatchConfig();
    }
    _saveNativeFeatures(id, list) {
      if (!id || !validNativeFeatures(list)) return;
      this._config = {...this._config, room_options:{...this._config.room_options,
        [id]:{...this._config.room_options?.[id], native_features:list}}};
      this._render();
      this._dispatchConfig();
    }
    _renderFeatures() {
      if (!this._selectedRoom) return;
      this._nativeEditor.hass = this._hass;
      this._featurePositionForm.hass = this._hass;
      this._nativeEditor.context = {entity_id:this._selectedRoom};
      this._nativeEditor.stateObj = this._hass.states[this._selectedRoom];
      const list = nativeFeatures(roomConfig(this._config, this._selectedRoom), this._selectedRoom);
      const signature = this._selectedRoom + JSON.stringify(list);
      if (signature !== this._nativeEditorSignature) {
        this._nativeEditor.features = list;
        this._nativeEditorSignature = signature;
      }
      const positionData = {features_position:roomConfig(this._config, this._selectedRoom).features_position || "bottom"};
      if (JSON.stringify(positionData) !== JSON.stringify(this._featurePositionForm.data)) this._featurePositionForm.data = positionData;
    }
    _renderTabs(rooms) {
      if (!rooms.some(room => room.entity_id === this._selectedRoom)) this._selectedRoom = rooms[0]?.entity_id;
      const index = rooms.findIndex(room => room.entity_id === this._selectedRoom);
      const selected = rooms[index];
      const markup = !selected ? "" : `<div class="room-tab-bar"><div class="room-tabs" role="tablist" aria-label="Rooms">${rooms.map((room, tabIndex) => {
        const active = room.entity_id === this._selectedRoom;
        return `<button type="button" role="tab" title="${escape(this._name(room))}${this._shown(room.entity_id) ? "" : " (hidden)"}" data-room="${escape(room.entity_id)}" aria-selected="${active}" tabindex="${active ? 0 : -1}" class="${active ? "active" : ""} ${this._shown(room.entity_id) ? "" : "hidden-room"}" aria-label="${escape(this._name(room))}${this._shown(room.entity_id) ? "" : " (hidden)"}">${tabIndex + 1}</button>`;
      }).join("")}</div><div class="room-tools">
        <ha-icon-button data-action="hide" label="${this._shown(selected.entity_id) ? "Hide room" : "Show room"}"><ha-icon icon="mdi:${this._shown(selected.entity_id) ? "eye" : "eye-off"}"></ha-icon></ha-icon-button>
        <ha-icon-button data-action="left" label="Move left" ${index === 0 ? "disabled" : ""}><ha-icon icon="mdi:arrow-left"></ha-icon></ha-icon-button>
        <ha-icon-button data-action="right" label="Move right" ${index === rooms.length - 1 ? "disabled" : ""}><ha-icon icon="mdi:arrow-right"></ha-icon></ha-icon-button>
        </div></div>`;
      if (markup !== this._tabsMarkup) {
        const scrollLeft = this._tabs.querySelector?.(".room-tabs")?.scrollLeft || 0;
        this._tabs.innerHTML = markup; this._tabsMarkup = markup;
        const strip = this._tabs.querySelector?.(".room-tabs");
        const active = this._tabs.querySelector?.('[role="tab"][aria-selected="true"]');
        if (strip && active) {
          strip.scrollLeft = scrollLeft;
          const left = active.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft;
          if (left < strip.scrollLeft) strip.scrollLeft = left;
          else if (left + active.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = left + active.offsetWidth - strip.clientWidth;
        }
      }
    }
    _selectRoom(id) {
      this._selectedRoom = id;
      this._render();
      this._dispatchConfig();
      this._tabs.querySelector?.('[role="tab"][aria-selected="true"]')?.focus({preventScroll: true});
    }
    _dispatchConfig() {
      // Symbols pass to the live preview but are omitted when the config is saved as JSON/YAML.
      const config = {...this._config, [PREVIEW_ROOM]: this._selectedRoom};
      this.dispatchEvent(new CustomEvent("config-changed", {detail: {config}, bubbles: true, composed: true}));
    }
    _roomAction(action) {
      const rooms = this._rooms();
      const index = rooms.findIndex(room => room.entity_id === this._selectedRoom);
      if (index < 0) return;
      const config = {...this._config};
      const excluded = new Set(config.excluded_entities || []);
      for (const room of rooms) if (!this._shown(room.entity_id)) excluded.add(room.entity_id);
      const order = rooms.map(room => room.entity_id);
      if (action === "hide") {
        if (excluded.has(this._selectedRoom)) excluded.delete(this._selectedRoom);
        else excluded.add(this._selectedRoom);
      } else {
        const target = index + (action === "left" ? -1 : action === "right" ? 1 : 0);
        if (target === index || target < 0 || target >= order.length) return;
        [order[index], order[target]] = [order[target], order[index]];
      }
      delete config.entities;
      config.excluded_entities = [...excluded];
      config.room_order = [...order, ...(config.room_order || []).filter(id => !order.includes(id))];
      this._config = config;
      this._render();
      this._dispatchConfig();
    }
    _changed(event) {
      event.stopPropagation();
      const data = event.detail.value;
      const config = {...this._config, title: data.title ?? "Wiser rooms", room_columns: data.room_columns ?? 1};
      this._config = config;
      this._render();
      this._dispatchConfig();
    }
  }
  if (!customElements.get("wiser-rooms-card-editor")) customElements.define("wiser-rooms-card-editor", WiserRoomsCardEditor);
  if (!customElements.get("wiser-rooms-card")) {
    customElements.define("wiser-rooms-card", WiserRoomsCard);
    window.customCards = window.customCards || [];
    window.customCards.push({type:"wiser-rooms-card",name:"Wiser Rooms",description:"Room temperatures, heating states and controls, with all heating off.",preview:true});
  }
})();
