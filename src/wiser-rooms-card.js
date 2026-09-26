/* Wiser rooms dashboard card. Bundled with the integration. */
(() => {
  const FEATURES = ["modes", "temperature", "advance"];
  const roomConfig = (config, id) => ({...config, ...config.room_options?.[id]});
  const featureOrder = config => FEATURES.map(value => `--feature-${value}:${features(config).indexOf(value)}`).join(";");
  const features = config => config.features ?? (config.show_controls === false ? [] : FEATURES);
  const PREVIEW_ROOM = Symbol.for("wiser-rooms-card-preview-room");
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const available = state => state && !["unknown", "unavailable"].includes(state.state);
  const isShutter = state => state?.entity_id.startsWith("cover.") && Object.hasOwn(state.attributes, "shutter_id");
  const isRoom = (entry, state) => entry.platform === "wiser" && !entry.disabled_by && state &&
    (entry.entity_id.startsWith("climate.") && Object.hasOwn(state.attributes, "heating_type") || isShutter(state));
  const matchesType = (state, type = "all") => type === "all" || (type === "shutters" ? isShutter(state) : !isShutter(state));


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
      this.shadowRoot.addEventListener("change", event => this._change(event));
      this.shadowRoot.addEventListener("focusout", () => setTimeout(() => this._render(), 0));
    }
    connectedCallback() { this._layoutHeaders(); }
    disconnectedCallback() { this._headerObserver?.disconnect(); this._observedHeaders.clear(); }
    _layoutHeaders() {
      const headers = new Set(this.shadowRoot.querySelectorAll?.(".top") || []);
      for (const header of this._observedHeaders) if (!headers.has(header)) this._headerObserver?.unobserve(header.closest(".room"));
      for (const header of headers) {
        const room = header.closest(".room");
        if (!this._observedHeaders.has(header)) this._headerObserver?.observe(room);
        const content = room.querySelector(".room-content");
        // Selected previews use the same text and control sizes as the dashboard.
        content.style.zoom = "1";
        const name = header.querySelector(".name strong");
        const temps = header.querySelector(".temps");
        const gap = parseFloat(getComputedStyle(header).columnGap) || 0;
        const status = header.querySelector(".status");
        header.style.setProperty("--status-width", `${status.scrollWidth}px`);
        const needed = 38 + gap * 2 + name.scrollWidth + temps.scrollWidth;
        header.classList.toggle("inline-readings", needed <= header.clientWidth);
      }
      this._observedHeaders = headers;
    }
    setConfig(config) {
      if (config.entities !== undefined && (!Array.isArray(config.entities) || config.entities.some(id => typeof id !== "string" || !/^(climate|cover)\./.test(id)))) {
        throw new Error("entities must be a list of climate or cover entity IDs");
      }
      if (config.excluded_entities !== undefined && (!Array.isArray(config.excluded_entities) || config.excluded_entities.some(id => typeof id !== "string" || !/^(climate|cover)\./.test(id)))) {
        throw new Error("excluded_entities must be a list of climate or cover entity IDs");
      }
      if (config.room_order !== undefined && (!Array.isArray(config.room_order) || config.room_order.some(id => typeof id !== "string" || !/^(climate|cover)\./.test(id)))) {
        throw new Error("room_order must be a list of climate or cover entity IDs");
      }
      if (config.room_columns !== undefined && (!Number.isInteger(config.room_columns) || config.room_columns < 1 || config.room_columns > 6)) {
        throw new Error("room_columns must be a whole number from 1 to 6");
      }
      if (config.room_type !== undefined && !["all", "heating", "shutters"].includes(config.room_type)) throw new Error("room_type must be all, heating or shutters");
      if (config.temperature_focus !== undefined && !["current", "target"].includes(config.temperature_focus)) throw new Error("temperature_focus must be current or target");
      if (config.show_controls !== undefined && typeof config.show_controls !== "boolean") throw new Error("show_controls must be a boolean");
      if (config.features !== undefined && (!Array.isArray(config.features) || config.features.some(feature => !FEATURES.includes(feature)))) throw new Error("features must contain modes, temperature or advance");
      if (config.room_options !== undefined) {
        if (!config.room_options || typeof config.room_options !== "object" || Array.isArray(config.room_options)) throw new Error("room_options must be an entity settings map");
        for (const [id, options] of Object.entries(config.room_options)) {
          if (!/^(climate|cover)\./.test(id) || !options || typeof options !== "object" || Array.isArray(options)) throw new Error("Invalid room options");
          if (options.features !== undefined && (!Array.isArray(options.features) || options.features.some(value => !FEATURES.includes(value)))) throw new Error("Invalid room features");
          if (options.temperature_focus !== undefined && !["current", "target"].includes(options.temperature_focus)) throw new Error("Invalid room temperature emphasis");
        }
      }
      this._config = {show_controls: true, title: "Wiser rooms", room_columns: 1, room_type: "all", temperature_focus: "current", ...config};
      this._render();
    }
    static getStubConfig() { return {type: "custom:wiser-rooms-card", title: "Wiser rooms"}; }
    static getConfigElement() { return document.createElement("wiser-rooms-card-editor"); }
    getCardSize() { return 2 + Math.ceil(this._rooms().length / (this._config?.room_columns || 1)) * 1.6; }
    getGridOptions() { return {columns: 9, min_columns: 9}; }
    set hass(hass) {
      this._hass = hass;
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
      const rooms = this._entries.filter(entry => isRoom(entry, this._hass.states[entry.entity_id]) && matchesType(this._hass.states[entry.entity_id], this._config?.room_type) && !this._config?.excluded_entities?.includes(entry.entity_id)).map(entry => this._hass.states[entry.entity_id]);
      if (this._config?.entities?.length) return this._config.entities.map(id => rooms.find(room => room.entity_id === id)).filter(Boolean);
      return orderRooms(rooms, this._config?.room_order);
    }
    _name(room) { return room.attributes.name || room.attributes.friendly_name || room.entity_id; }
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
    _renderShutter(room, preview) {
      const options = roomConfig(this._config, room.entity_id);
      const id = escape(room.entity_id), a = room.attributes;
      const status = !available(room) ? "Unavailable" : ({open:"Open",closed:"Closed",opening:"Opening",closing:"Closing"}[room.state] || room.state);
      const disabled = this._busy || !available(room);
      const position = typeof a.current_position === "number" ? a.current_position : null;
      const color = available(room) ? "var(--state-cover-active-color,var(--primary-color))" : "var(--disabled-text-color)";
      return `<section data-key="${id}" class="room ${preview && this._config[PREVIEW_ROOM] === room.entity_id ? "preview-selected" : ""}" style="--room-state-color:${color};${featureOrder(options)}"><div class="room-content">
        <div class="top"><button class="state-icon" data-entity="${id}" aria-label="Open shutter details"><ha-icon icon="mdi:${room.state === "closed" ? "window-shutter" : "window-shutter-open"}"></ha-icon></button>
        <div class="room-heading"><div class="identity"><button class="name" data-entity="${id}"><strong>${escape(this._name(room))}</strong></button><span class="status">${escape(status)}</span></div>
        <div class="readings"><div class="temps">${position === null ? "—" : `${position}%`}</div><div class="next">${escape(a.room || "")}</div></div></div></div>
        ${features(options).some(feature => feature === "modes" || feature === "temperature" && (a.supported_features & 4)) ? `<div class="controls">${features(options).includes("modes") ? `<div class="modes" role="group" aria-label="Shutter controls">${[["open_cover",1,"arrow-up","Open"],["stop_cover",8,"stop","Stop"],["close_cover",2,"arrow-down","Close"]].map(([service,feature,icon,label]) =>
          `<button class="mode" data-action="shutter" data-entity="${id}" data-service="${service}" title="${label}" aria-label="${label}" ${disabled || !(a.supported_features & feature) ? "disabled" : ""}><ha-icon icon="mdi:${icon}"></ha-icon></button>`).join("")}</div>` : ""}
        ${features(options).includes("temperature") && a.supported_features & 4 ? `<input type="number" data-entity="${id}" data-field="position" aria-label="${escape(this._name(room))} position percent" title="Position (0% closed, 100% open)" value="${position ?? ""}" min="0" max="100" step="1" ${disabled ? "disabled" : ""}>` : ""}</div>` : ""}</div></section>`;
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
    _click(event) {
      const button = event.target.closest("button");
      if (!button || button.disabled) return;
      if (button.dataset.action === "all-off") { this._allOff(); return; }
      if (button.dataset.action === "retry") { this._discover(); return; }
      const room = this._rooms().find(r => r.entity_id === button.dataset.entity);
      if (room && button.dataset.action === "shutter") {
        this._shutterService(room, button.dataset.service); return;
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
      if (room) this.dispatchEvent(new CustomEvent("hass-more-info", {detail: {entityId: room.entity_id}, bubbles: true, composed: true}));
    }
    _change(event) {
      const input = event.target;
      const room = this._rooms().find(r => r.entity_id === input.dataset.entity);
      if (!room) return;
      if (input.dataset.field === "position" && input.value !== "" && input.checkValidity()) this._shutterService(room, "set_cover_position", Number(input.value));
      if (input.dataset.field === "temperature" && input.value !== "" && input.checkValidity()) this._service(room, "set_temperature", {temperature: Number(input.value)});
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
            sync(current, next);
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
      const heating = rooms.filter(r => available(r) && r.state !== "off" && r.attributes.hvac_action === "heating").length;
      const unavailable = rooms.filter(r => !available(r)).length;
      const canOff = rooms.some(r => available(r) && r.state !== "off" && r.attributes.hvac_modes?.includes("off"));
      const unit = this._hass.config?.unit_system?.temperature || "°C";
      const grouped = this._config.room_type === "all";
      const groups = grouped
        ? [{key:"heating", title:"Heating", rooms:rooms.filter(room => !isShutter(room))},
           {key:"shutters", title:"Shutters", rooms:rooms.filter(isShutter)}].filter(group => group.rooms.length)
        : [{key:this._config.room_type, title:"", rooms}];
      const preview = isEditorPreview(this);
      // Orbit expands a selected item to its normal grid width (six of twelve by default).
      const expandPreview = preview && this._config.room_columns > 2;
      const markup = `<style data-key="style">
        :host{display:block;container-type:inline-size}ha-card{overflow:hidden}.section-title{font-size:14px;font-weight:500;margin:0;padding:12px 16px 8px;border-top:1px solid var(--divider-color)}.rooms{display:grid;grid-template-columns:repeat(var(--room-columns),minmax(0,1fr))}.room{min-width:0}.room-content{container-type:inline-size;container-name:room}.room.preview-selected{isolation:isolate;position:relative}.room.preview-selected::before{border:2px solid var(--primary-color);border-radius:inherit;box-sizing:border-box;content:"";inset:0;pointer-events:none;position:absolute;z-index:100}.rooms.preview-rows{display:block}.preview-row{display:flex;width:100%}.preview-row>.room{flex:1 1 0;box-sizing:border-box;overflow:hidden}.preview-row>.room.preview-selected{flex:0 0 min(100%,max(50%,280px))}.preview-row:has(.preview-selected){align-items:flex-start;flex-wrap:wrap}.preview-spacer{flex:1 1 0;min-width:0}header{padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:8px}h2{font-size:18px;font-weight:500;margin:0 0 3px}p{margin:0;color:var(--secondary-text-color);font-size:12px}button,input{font:inherit;color:var(--primary-text-color);box-sizing:border-box}button{cursor:pointer;border:0;border-radius:10px;min-height:36px;padding:6px;background:var(--secondary-background-color)}button:disabled,input:disabled{opacity:.45;cursor:default}button:focus-visible,input:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}.off{color:var(--error-color);display:flex;align-items:center;gap:8px;font-size:16px;min-height:48px;padding:10px 16px;border-radius:14px;flex-shrink:0}.off ha-icon{--mdc-icon-size:26px}.room{padding:10px 16px;border-top:1px solid var(--divider-color)}.top{display:grid;grid-template-columns:38px auto minmax(0,1fr);align-items:center;column-gap:10px;row-gap:0}.room-heading,.identity,.readings{display:contents}.top .state-icon{grid-column:1;grid-row:1 / 3}.top .name{grid-column:2 / -1;grid-row:1;min-height:0;line-height:24px}.identity>.status{grid-column:2;grid-row:2;justify-self:start;margin-top:0;line-height:18px}.top .temps{grid-column:3;grid-row:2;line-height:24px;justify-self:end;text-align:right}.readings .next{grid-column:2 / -1;grid-row:3;justify-self:end;max-width:100%;white-space:normal;min-width:0;margin-top:2px;line-height:18px}.top.inline-readings .name{grid-column:2}.top.inline-readings .temps{grid-row:1}.top.inline-readings .next{grid-row:2;max-width:calc(100% - var(--status-width,40px) - 10px)}.state-icon{border-radius:50%;height:38px;width:38px;min-width:38px;display:grid;place-items:center;color:var(--room-state-color);background:color-mix(in srgb,var(--room-state-color) 20%,transparent)}ha-icon{--mdc-icon-size:24px;pointer-events:none}.controls button{display:grid;place-items:center}.controls ha-icon{width:22px;height:22px;--mdc-icon-size:22px}.name{flex:1;min-width:0;padding:0;background:none;text-align:left}.name strong{display:inline-block;max-width:100%;vertical-align:middle;font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.status{display:block;font-size:12px;color:var(--secondary-text-color);margin-top:3px}.temps{font-size:22px;white-space:nowrap;font-variant-numeric:tabular-nums}.temps small{font-size:18px;color:var(--secondary-text-color)}.controls>.modes{order:var(--feature-modes)}.controls>input,.controls>button:not([data-action='advance']){order:var(--feature-temperature)}.controls>button[data-action='advance']{order:var(--feature-advance)}.controls{display:flex;gap:4px;align-items:center;margin-top:8px}input{min-width:0;min-height:36px;border:0;border-radius:8px;padding:6px;background:var(--secondary-background-color);font-size:13px}input{flex:0 1 76px;min-width:64px;width:76px;height:40px;min-height:40px;font-size:18px;font-variant-numeric:tabular-nums;text-align:right}.controls button{width:40px;height:40px;min-height:40px;flex-shrink:0}.modes{display:flex;flex:1 1 120px;min-width:108px;border-radius:10px;background:var(--secondary-background-color);overflow:hidden}.controls .mode{flex:1 1 40px;min-width:36px;width:40px;border-radius:10px;background:transparent}.controls .mode.active{color:var(--text-primary-color,#fff);background:var(--room-state-color)}.next{min-width:0;margin-top:2px;text-align:right;font-size:12px;color:var(--secondary-text-color);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.message{padding:12px 16px;line-height:1.5}.error{color:var(--error-color)}

        @container (max-width: 340px){header{padding:12px}.room{padding:10px 12px}.top{column-gap:8px;row-gap:0}.top .temps{font-size:20px}.top .temps small{font-size:16px}.off{padding:8px 10px;font-size:14px}}
        @container room (max-width: 210px){.top .temps{font-size:18px}.top .temps small{font-size:15px}.controls{flex-wrap:wrap}.modes{flex-basis:100%;min-width:0}.controls .mode{min-width:0}.controls input{flex:1 1 64px}}
      /* Match native ha-control-select / ha-control-number-buttons backgrounds. */
      .controls{--wiser-control-background:color-mix(in srgb,var(--disabled-color) 20%,transparent)}
      .controls .modes,.controls>button,.controls>input{background:var(--wiser-control-background)}
      .controls button:disabled,.controls input:disabled{opacity:1;color:var(--disabled-color);-webkit-text-fill-color:var(--disabled-color)}
      .controls input[data-field='temperature']:disabled{color:var(--secondary-text-color);-webkit-text-fill-color:var(--secondary-text-color)}
      .controls .mode.active:disabled{background:var(--disabled-color);color:white;-webkit-text-fill-color:white}
      .editor-preview .room{padding:8px 4px}.editor-preview .preview-placeholder{display:flex;align-items:center;justify-content:center;gap:6px;min-height:64px;color:var(--secondary-text-color);font-size:12px;text-align:center;overflow-wrap:anywhere}.preview-placeholder ha-icon{flex-shrink:0;--mdc-icon-size:18px}.preview-placeholder span{min-width:0}.editor-preview .room.preview-selected{padding:10px 12px}
      </style><ha-card data-key="card" class="${preview ? "editor-preview" : ""}"><header data-key="header"><div><h2>${escape(this._config.title)}</h2><p>${heating} of ${rooms.filter(room => !isShutter(room)).length} rooms heating${rooms.some(isShutter) ? ` · ${rooms.filter(isShutter).length} shutters` : ""}${unavailable ? ` · ${unavailable} unavailable` : ""}</p></div><button class="off" data-action="all-off" ${this._busy || !canOff ? "disabled" : ""} title="Turn all heating off" aria-label="Turn all heating off"><ha-icon icon="mdi:power"></ha-icon>All off</button></header>
      ${this._error ? `<div data-key="error" class="message error" role="alert">${escape(this._error)}${this._discoveryFailed ? '<button data-action="retry">Retry</button>' : ""}</div>` : ""}
      ${!rooms.length ? `<p data-key="empty" class="message">${this._loading ? "Finding Wiser rooms…" : "No matching Wiser rooms or shutters found."}</p>` : groups.map(group => `${grouped ? `<h3 class="section-title" data-key="heading-${group.key}">${group.title}</h3>` : ""}<div class="rooms ${expandPreview ? "preview-rows" : ""}" data-key="rooms-${group.key}" style="--room-columns:${this._config.room_columns}">${group.rooms.map((room, index) => {
        const options = roomConfig(this._config, room.entity_id);
        const columns = this._config.room_columns;
        const rowStart = expandPreview && index % columns === 0 ? `<div class="preview-row" data-key="preview-row-${Math.floor(index / columns)}">` : "";
        const rowEnd = expandPreview && (index % columns === columns - 1 || index === group.rooms.length - 1)
          ? `${index === group.rooms.length - 1 ? '<div class="preview-spacer"></div>'.repeat((columns - group.rooms.length % columns) % columns) : ""}</div>` : "";
        if (preview && this._config[PREVIEW_ROOM] !== room.entity_id) {
          return `${rowStart}<section data-key="${escape(room.entity_id)}" class="room preview-placeholder"><ha-icon icon="mdi:${isShutter(room) ? "window-shutter" : "home-thermometer-outline"}"></ha-icon><span>${escape(this._name(room))}</span></section>${rowEnd}`;
        }
        if (isShutter(room)) return `${rowStart}${this._renderShutter(room, preview)}${rowEnd}`;
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
        return `${rowStart}<section data-key="${id}" class="room ${active ? "heating" : ""} ${preview && this._config[PREVIEW_ROOM] === room.entity_id ? "preview-selected" : ""}" style="--room-state-color:${stateColor};${featureOrder(options)}"><div class="room-content">
          <div class="top"><button class="state-icon" data-entity="${id}" title="${escape(status)} — open room controls" aria-label="${escape(this._name(room))}: ${status}"><ha-icon icon="${icon}"></ha-icon></button>
          <div class="room-heading"><div class="identity"><button class="name" data-entity="${id}" title="Open room controls"><strong>${escape(this._name(room))}</strong></button><span class="status">${status}${a.is_boosted ? " · Boost" : a.is_override ? " · Override" : ""}</span></div>
          <div class="readings"><div class="temps" title="Current ${escape(unit)} → target ${escape(unit)}" aria-label="Current ${escape(this._temperature(a.current_temperature))}; Target ${escape(target)}">${options.temperature_focus === "target"
            ? `<small>${escape(this._temperature(a.current_temperature))}</small> ${escape(target)}`
            : `${escape(this._temperature(a.current_temperature))}<small> ${escape(target)}</small>`}</div>
          <div class="next" title="${escape(a.schedule_name || "")}">${escape(next)}</div></div></div></div>
          ${features(options).length ? `<div class="controls">${features(options).includes("modes") ? `<div class="modes" role="group" aria-label="${escape(this._name(room))} mode">${["auto", "heat", "off"].filter(mode => a.hvac_modes?.includes(mode)).map(mode => {
            const label = {auto:"Schedule",heat:"Manual",off:"Off"}[mode];
            const modeIcon = {auto:"mdi:thermostat-auto",heat:"mdi:fire",off:"mdi:power"}[mode];
            return `<button class="mode ${mode === room.state ? "active" : ""}" data-action="mode" data-entity="${id}" data-mode="${mode}" aria-pressed="${mode === room.state}" aria-label="${label}" title="${label}" ${disabled || mode === "auto" && !scheduled ? "disabled" : ""}><ha-icon icon="${modeIcon}"></ha-icon></button>`;
          }).join("")}</div>` : ""}
          ${features(options).includes("temperature") ? (ranged ? `<button data-entity="${id}" title="Adjust temperature range" aria-label="Adjust temperature range"><ha-icon icon="mdi:thermostat"></ha-icon></button>` : `<input type="number" data-entity="${id}" data-field="temperature" aria-label="${escape(this._name(room))} target temperature" title="Target ${escape(unit)}" value="${typeof targetTemperature === "number" ? targetTemperature : ""}" min="${a.min_temp ?? 5}" max="${a.max_temp ?? 30}" step="${a.target_temp_step || .5}" ${disabled || room.state === "off" ? "disabled" : ""}>`) : ""}
          ${features(options).includes("advance") ? `<button data-action="advance" data-entity="${id}" aria-label="Advance schedule for ${escape(this._name(room))}" title="Advance to next schedule period" ${disabled || !scheduled || room.state !== "auto" || !a.preset_modes?.includes("Advance Schedule") ? "disabled" : ""}><ha-icon icon="mdi:calendar-arrow-right"></ha-icon></button>` : ""}</div>` : ""}</div></section>${rowEnd}`;
      }).join("")}</div>`).join("")}</ha-card>`;
      this._updateDOM(markup);
      this._layoutHeaders();
    }
  }
  class WiserRoomsCardEditor extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({mode: "open"});
      this._form = document.createElement("ha-form");
      this._form.className = "settings";
      this._typeForm = document.createElement("ha-form");
      this._typeForm.computeLabel = schema => schema.label;
      this._typeForm.addEventListener("value-changed", event => this._changed({stopPropagation: () => event.stopPropagation(), detail: {value: {...this._form.data, ...event.detail.value}}}));
      this._roomForm = document.createElement("ha-form");
      this._roomForm.computeLabel = schema => schema.label;
      this._roomForm.addEventListener("value-changed", event => {
        event.stopPropagation();
        this._setRoomOptions({temperature_focus: event.detail.value.temperature_focus});
      });
      this._featureList = document.createElement("div");
      this._featureList.addEventListener("click", event => {
        const button = event.target.closest("button");
        if (!button) return;
        if (button.dataset.removeFeature) this._setFeatures(this._selectedFeatures().filter(value => value !== button.dataset.removeFeature));
        else if (button.dataset.addFeature) { this._addingFeature = !this._addingFeature; this._renderFeatures(); }
        else if (button.dataset.feature) { this._addingFeature = false; this._setFeatures([...this._selectedFeatures(), button.dataset.feature]); }
      });
      this._featureList.addEventListener("item-moved", event => {
        event.stopPropagation();
        this._moveFeature(event.detail.oldIndex, event.detail.newIndex);
      });
      this._featureList.addEventListener("keydown", event => {
        const handle = event.target.closest("[data-feature-handle]");
        if (!handle || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        const index = this._selectedFeatures().indexOf(handle.dataset.featureHandle);
        this._moveFeature(index, index + (event.key === "ArrowUp" ? -1 : 1));
        this._featureList.querySelector(`[data-feature-handle="${handle.dataset.featureHandle}"]`)?.focus();
      });
      this._message = document.createElement("p");
      this._message.style.cssText = "color:var(--secondary-text-color);font-size:14px";
      this._tabs = document.createElement("div");
      this._tabs.addEventListener("click", event => {
        const button = event.target.closest("button");
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
        ha-form.settings::part(root){display:grid;grid-template-columns:minmax(0,1fr) 130px;column-gap:8px;align-items:start}
        .room-tab-bar{display:flex;flex-direction:row;align-items:center;gap:6px;border-bottom:1px solid var(--divider-color);padding-bottom:2px;margin:20px 0 12px}
        .room-tabs{display:flex;flex-wrap:nowrap;gap:4px;flex:1;min-width:0;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:thin}
        button{font:inherit;color:var(--primary-text-color);cursor:pointer}
        button:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}
        .room-tabs button{border:0;border-bottom:3px solid transparent;background:transparent;flex:0 0 40px;min-width:40px;min-height:40px;padding:6px 8px;opacity:.6;white-space:nowrap}
        .room-tabs button.active{color:var(--primary-color);opacity:1;border-bottom-color:var(--primary-color)}
        .room-tabs button.hidden-room{text-decoration:line-through}
        .room-tools{display:flex;flex-wrap:nowrap;gap:4px;margin-left:auto;flex-shrink:0}
        .room-tools button{display:flex;align-items:center;justify-content:center;width:34px;height:34px;padding:0;border:1px solid var(--divider-color);border-radius:var(--ha-border-radius-lg,12px);background:var(--secondary-background-color)}
        button:disabled{opacity:.35;cursor:default}ha-icon{--mdc-icon-size:20px;pointer-events:none}
        .features-panel{border:1px solid var(--divider-color);border-radius:12px;margin-top:20px;overflow:hidden}
        .features-panel summary{display:flex;align-items:center;gap:12px;padding:16px;background:var(--secondary-background-color);cursor:pointer;font-weight:500;list-style:none}
        .features-panel summary::-webkit-details-marker{display:none}.features-panel summary .chevron{margin-left:auto}.features-panel[open] .chevron{transform:rotate(180deg)}
        .feature-body{padding:8px 12px 16px}.feature-row{display:flex;align-items:center;gap:12px;min-height:56px}.feature-label{flex:1;min-width:0}
        .feature-row button{background:none;border:0;min-width:36px;min-height:40px;padding:6px;color:var(--secondary-text-color)}.feature-handle{cursor:grab!important}
        .feature-add{display:flex;align-items:center;gap:8px;border:0;border-radius:24px;padding:8px 14px;margin-top:10px;background:var(--primary-color);color:var(--text-primary-color)!important}
        .feature-options{display:flex;flex-direction:column;gap:4px;margin-top:8px}.feature-options button{text-align:left;padding:10px;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color)}
      `;
      this.shadowRoot.append(style, this._form, this._typeForm, this._tabs, this._roomForm, this._featureList, this._message);
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
      } catch (_) {
        this._failed = true;
      } finally {
        this._loading = false;
        this._render();
      }
    }
    _rooms() {
      if (!this._hass || !this._entries) return [];
      return orderRooms(this._entries.filter(entry => isRoom(entry, this._hass.states[entry.entity_id]) && matchesType(this._hass.states[entry.entity_id], this._config?.room_type))
        .map(entry => this._hass.states[entry.entity_id]), this._config?.room_order || this._config?.entities);
    }
    _name(room) { return room.attributes.name || room.attributes.friendly_name || room.entity_id; }
    _shown(id) {
      return !this._config.excluded_entities?.includes(id) &&
        (!this._config.entities?.length || this._config.entities.includes(id));
    }
    _render() {
      if (!this._config || !this._hass) return;
      const rooms = this._rooms();
      this._form.hass = this._hass;
      this._typeForm.hass = this._hass;
      const schema = [
        {name: "title", selector: {text: {}}},
        {name: "room_columns", label: "Rooms per row", selector: {number: {min: 1, max: 6, step: 1, mode: "box"}}},
        {name: "room_type", label: "Show", selector: {select: {mode: "box", options: [
          {value: "all", label: "All"}, {value: "heating", label: "Heating"}, {value: "shutters", label: "Shutters"},
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
        this._roomForm.schema = schema.slice(3);
        this._schemaSignature = signature;
      }
      const data = {title: this._config.title ?? "Wiser rooms", room_columns: this._config.room_columns ?? 1, room_type: this._config.room_type ?? "all"};
      if (JSON.stringify(data) !== JSON.stringify(this._form.data)) this._form.data = data;
      this._typeForm.data = {room_type: data.room_type};
      this._renderTabs(rooms);
      const selectedOptions = roomConfig(this._config, this._selectedRoom);
      this._roomForm.hass = this._hass;
      this._roomForm.data = {temperature_focus: selectedOptions.temperature_focus ?? "current"};
      this._roomForm.hidden = !this._selectedRoom || this._selectedRoom.startsWith("cover.");
      this._featureList.hidden = !this._selectedRoom;
      this._renderFeatures();
      this._message.textContent = this._failed ? "Unable to detect rooms. Close and reopen the editor to retry."
        : this._loading ? "Finding Wiser rooms…"
        : !rooms.length ? "No matching Wiser rooms or shutters found."
        : "";
      this._message.hidden = !this._message.textContent;
    }
    _availableFeatures() {
      return this._selectedRoom?.startsWith("cover.") ? ["modes", "temperature"] : FEATURES;
    }
    _selectedFeatures() {
      return features(roomConfig(this._config, this._selectedRoom)).filter(value => this._availableFeatures().includes(value));
    }
    _setFeatures(values) {
      this._setRoomOptions({features: [...new Set(values)].filter(value => this._availableFeatures().includes(value))});
    }
    _setRoomOptions(options) {
      if (!this._selectedRoom) return;
      this._config = {...this._config, room_options: {...this._config.room_options,
        [this._selectedRoom]: {...this._config.room_options?.[this._selectedRoom], ...options}}};
      this._render();
      this._dispatchConfig();
    }
    _moveFeature(from, to) {
      const values = [...this._selectedFeatures()];
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= values.length || to >= values.length) return;
      values.splice(to, 0, values.splice(from, 1)[0]);
      this._setFeatures(values);
    }
    _renderFeatures() {
      const shutter = this._selectedRoom?.startsWith("cover.");
      const labels = {modes: shutter ? "Shutter controls" : "Climate HVAC modes", temperature: shutter ? "Position" : "Target temperature", advance: "Advance schedule"};
      const selected = this._selectedFeatures();
      const missing = this._availableFeatures().filter(value => !selected.includes(value));
      const open = this._featureList.querySelector?.("details")?.open ?? true;
      const markup = `<details class="features-panel" ${open ? "open" : ""}><summary><ha-icon icon="mdi:list-box"></ha-icon>Features<ha-icon class="chevron" icon="mdi:chevron-down"></ha-icon></summary><div class="feature-body">
        <ha-sortable handle-selector=".feature-handle" draggable-selector=".feature-row"><div>${selected.map(value => `<div class="feature-row"><button class="feature-handle" data-feature-handle="${value}" aria-label="Move ${labels[value]}" title="Drag to reorder, or use arrow keys"><ha-icon icon="mdi:drag-horizontal"></ha-icon></button><span class="feature-label">${labels[value]}</span><button data-remove-feature="${value}" aria-label="Remove ${labels[value]}"><ha-icon icon="mdi:delete"></ha-icon></button></div>`).join("")}</div></ha-sortable>
        <button class="feature-add" data-add-feature="true" ${missing.length ? "" : "disabled"}><ha-icon icon="mdi:plus"></ha-icon>Add feature</button>
        ${this._addingFeature && missing.length ? `<div class="feature-options">${missing.map(value => `<button data-feature="${value}">${labels[value]}</button>`).join("")}</div>` : ""}
      </div></details>`;
      if (markup !== this._featureMarkup) { this._featureList.innerHTML = markup; this._featureMarkup = markup; }
    }
    _renderTabs(rooms) {
      if (!rooms.some(room => room.entity_id === this._selectedRoom)) this._selectedRoom = rooms[0]?.entity_id;
      const index = rooms.findIndex(room => room.entity_id === this._selectedRoom);
      const selected = rooms[index];
      const markup = !selected ? "" : `<div class="room-tab-bar"><div class="room-tabs" role="tablist" aria-label="Rooms">${rooms.map((room, tabIndex) => {
        const active = room.entity_id === this._selectedRoom;
        return `<button type="button" role="tab" title="${escape(this._name(room))}${this._shown(room.entity_id) ? "" : " (hidden)"}" data-room="${escape(room.entity_id)}" aria-selected="${active}" tabindex="${active ? 0 : -1}" class="${active ? "active" : ""} ${this._shown(room.entity_id) ? "" : "hidden-room"}" aria-label="${escape(this._name(room))}${this._shown(room.entity_id) ? "" : " (hidden)"}">${tabIndex + 1}</button>`;
      }).join("")}</div><div class="room-tools">
        <button type="button" data-action="hide" title="${this._shown(selected.entity_id) ? "Hide room" : "Show room"}" aria-label="${this._shown(selected.entity_id) ? "Hide room" : "Show room"}"><ha-icon icon="mdi:${this._shown(selected.entity_id) ? "eye" : "eye-off"}"></ha-icon></button>
        <button type="button" data-action="left" title="Move left" aria-label="Move left" ${index === 0 ? "disabled" : ""}><ha-icon icon="mdi:arrow-left"></ha-icon></button>
        <button type="button" data-action="right" title="Move right" aria-label="Move right" ${index === rooms.length - 1 ? "disabled" : ""}><ha-icon icon="mdi:arrow-right"></ha-icon></button>
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
      const config = {...this._config, title: data.title ?? "Wiser rooms", room_columns: data.room_columns ?? 1, room_type: data.room_type ?? "all"};
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
