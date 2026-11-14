  const EDITOR_SETTINGS_ROW_HEIGHT = "48px";
  const EDITOR_SETTINGS_ROW_GAP = "var(--ha-space-1,4px)";

  class WiserRoomsCardEditor extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._previewRooms = new Map();
      this._previewRoomsByHub = new Map();
      this._hubForm = document.createElement("ha-form");
      this._hubForm.className = "hubs";
      this._hubForm.computeLabel = (schema) => schema.label;
      this._hubForm.addEventListener("value-changed", (event) => {
        event.stopPropagation();
        const hubs = event.detail.value.hubs || [];
        const detected = this._detectedHubs().map((hub) => hub.value);
        this._config = { ...this._config };
        if (
          hubs.length &&
          (hubs.length !== detected.length || detected.some((id) => !hubs.includes(id)))
        )
          this._config.hubs = hubs;
        else delete this._config.hubs;
        if (Array.isArray(this._config.hub_configs)) {
          const selected = hubs.length ? hubs : detected;
          this._config.hub_configs = selected.map(
            (id) => this._config.hub_configs.find((config) => config.hub === id) || { hub: id },
          );
        }
        if ((hubs.length ? hubs : detected).length < 2) delete this._config.split_hubs;
        this._render();
        this._dispatchConfig();
      });
      this._form = document.createElement("ha-form");
      this._form.className = "settings";
      this._hubTabs = document.createElement("div");
      this._hubTabs.className = "editor-hub-tabs";
      this._hubTabs.addEventListener("click", (event) => {
        const tab = event.target.closest?.("[data-editor-hub]");
        if (tab) this._selectEditorHub(tab.dataset.editorHub);
      });
      this._hubTabs.addEventListener("keydown", (event) => {
        if (
          !event.target.matches?.('[role="tab"]') ||
          !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
        )
          return;
        const hubs = this._editorHubIds();
        if (hubs.length < 2) return;
        event.preventDefault();
        let index = hubs.indexOf(this._editingHub);
        index =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? hubs.length - 1
              : (index + (event.key === "ArrowLeft" ? -1 : 1) + hubs.length) % hubs.length;
        this._selectEditorHub(hubs[index], true);
      });
      this._hubConfigHost = document.createElement("div");
      this._hubConfigHost.className = "hub-config-editor";
      this._typeForm = document.createElement("div");
      this._typeForm.className = "show-filter";
      this._typeForm.addEventListener("click", (event) => {
        const button = event.target.closest?.("[data-room-type]");
        if (!button) return;
        const type = button.dataset.roomType;
        const current = selectedTypes(this._config);
        let next;
        if (type === "all") next = DEVICE_TYPES;
        else if (current.length === DEVICE_TYPES.length) next = [type];
        else if (current.includes(type))
          next = current.length > 1 ? current.filter((value) => value !== type) : current;
        else next = DEVICE_TYPES.filter((value) => current.includes(value) || value === type);
        const config = { ...this._config };
        if (next.length === DEVICE_TYPES.length) delete config.device_types;
        else config.device_types = next;
        if (masterMode(config)) {
          const existing = config.master_options_by_type || {};
          const byType = {};
          for (const roomType of next) {
            if (current.includes(roomType) && existing[roomType])
              byType[roomType] = existing[roomType];
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
      this._modeForm.computeLabel = (schema) => schema.label;
      this._modeForm.addEventListener("value-changed", (event) => {
        event.stopPropagation();
        const data = event.detail.value;
        const config = { ...this._config };
        if (Object.hasOwn(data, "admin_only_header_controls")) {
          if (data.admin_only_header_controls) config.admin_only_header_controls = true;
          else delete config.admin_only_header_controls;
        }
        if (Object.hasOwn(data, "header_button_style")) {
          if (data.header_button_style === "icon_only") config.header_button_style = "icon_only";
          else delete config.header_button_style;
        }
        if (Object.hasOwn(data, "device_configuration")) {
          const mode = data.device_configuration || "individual";
          if (mode === "master") {
            const enteringMaster = !masterMode(config);
            config.device_configuration = "master";
            const activeTypes = selectedTypes(config);
            if (enteringMaster) {
              config.master_options_by_type = Object.fromEntries(
                activeTypes.map((roomType) => {
                  const room = this._rooms().find((item) => deviceType(item) === roomType);
                  const options = { ...(room ? config.device_options?.[room.entity_id] : {}) };
                  if (room)
                    options.features = nativeFeatures(
                      { ...config, ...options },
                      room.entity_id,
                      room,
                    );
                  if (options.secondary_status) {
                    const secondary = { ...options.secondary_status };
                    const entities = {};
                    for (const item of this._rooms().filter(
                      (candidate) => deviceType(candidate) === roomType,
                    )) {
                      const status = config.device_options?.[item.entity_id]?.secondary_status;
                      const entity = status?.entities?.[item.entity_id] || status?.entity;
                      if (typeof entity === "string" && entity) entities[item.entity_id] = entity;
                    }
                    delete secondary.entity;
                    delete secondary.entities;
                    if (Object.keys(entities).length) secondary.entities = entities;
                    options.secondary_status = secondary;
                  }
                  return [roomType, options];
                }),
              );
            } else if (!config.master_options_by_type) config.master_options_by_type = {};
            delete config.device_options;
          } else {
            if (masterMode(config)) {
              const roomOptions = {};
              for (const room of this._rooms()) {
                const options = JSON.parse(
                  JSON.stringify(masterOptions(config, room.entity_id) || {}),
                );
                if (options.secondary_status) {
                  const secondary = { ...options.secondary_status };
                  const entity = secondary.entities?.[room.entity_id] || secondary.entity;
                  delete secondary.entities;
                  if (typeof entity === "string" && entity) secondary.entity = entity;
                  else delete secondary.entity;
                  options.secondary_status = secondary;
                }
                if (Array.isArray(options.features)) {
                  options.features = configuredNativeFeatures(config, room.entity_id, room).map(
                    (feature) => featureForRoom(feature, room.entity_id),
                  );
                }
                roomOptions[room.entity_id] = options;
              }
              config.device_options = roomOptions;
              delete config.master_options_by_type;
            }
            delete config.device_configuration;
          }
        }
        this._config = config;
        this._render();
        this._dispatchConfig();
      });
      this._roomForm = document.createElement("ha-form");
      // Native expansion panels can stop click bubbling. Capture the opening
      // click so layout is reapplied after their hidden content becomes visible.
      this._roomForm.addEventListener("click", () => this._scheduleContentLayout(), true);
      this._roomForm.computeLabel = (schema) => {
        const scope = [
          "color",
          "icon_tap_action",
          "icon_hold_action",
          "icon_double_tap_action",
          "hide_state",
          "state_content",
        ].includes(schema.name)
          ? "tile"
          : "generic";
        return (
          this._hass?.localize?.(`ui.panel.lovelace.editor.card.${scope}.${schema.name}`) ||
          schema.label
        );
      };
      this._roomForm.addEventListener("value-changed", (event) => {
        event.stopPropagation();
        const value = event.detail.value;
        const options = {};
        for (const key of [
          "name",
          "icon",
          "color",
          "hide_state",
          "state_content",
          "temperature_focus",
          "show_temperatures",
          "show_next_schedule",
          "show_heating_glow",
          "tap_action",
          "icon_tap_action",
          "hold_action",
          "icon_hold_action",
          "double_tap_action",
          "icon_double_tap_action",
        ]) {
          if (Object.hasOwn(value, key)) options[key] = value[key];
        }
        Object.assign(options, this._secondaryStatusOptions(value));
        this._setRoomOptions(options);
      });
      this._featureList = document.createElement("div");
      // Match hui-tile-card-editor: native expansion panel, feature editor and
      // features-position form. There is no standalone HA feature-section element.
      this._featureList.innerHTML =
        '<ha-expansion-panel outlined><ha-icon slot="leading-icon" icon="mdi:list-box"></ha-icon><h3 slot="header"></h3><div class="content"></div></ha-expansion-panel>';
      this._nativeEditor = document.createElement("hui-card-features-editor");
      this._featurePositionForm = document.createElement("ha-form");
      this._featurePositionForm.className = "features-form";
      this._featurePositionForm.computeLabel = (schema) => schema.label;
      this._featurePositionForm.addEventListener("value-changed", (event) => {
        event.stopPropagation();
        this._setRoomOptions({
          features_position: event.detail.value.features_position || "bottom",
        });
      });
      this._featureList
        .querySelector?.(".content")
        ?.append(this._nativeEditor, this._featurePositionForm);
      this._nativeEditor.addEventListener("features-changed", (event) => {
        event.stopPropagation();
        this._saveNativeFeatures(this._selectedRoom, event.detail.features, true);
      });
      this._nativeEditor.addEventListener("edit-detail-element", (event) => {
        event.stopPropagation();
        const id = this._selectedRoom;
        const index = event.detail.subElementConfig.index;
        const visibleFeatures = configuredNativeFeatures(this._config, id, this._hass.states[id]);
        const config = visibleFeatures[index];
        this.dispatchEvent(
          new CustomEvent("edit-sub-element", {
            bubbles: true,
            composed: true,
            detail: {
              type: "feature",
              config,
              context: this._featureEditorContext(id),
              saveConfig: (newConfig) => {
                const list = [...visibleFeatures];
                list[index] = newConfig;
                this._saveNativeFeatures(id, list);
              },
            },
          }),
        );
      });
      this._message = document.createElement("p");
      this._message.style.cssText = "color:var(--secondary-text-color);font-size:14px";
      this._version = document.createElement("div");
      this._version.className = "version";
      this._version.textContent = `Wiser Controls Card · ${CARD_VERSION}`;
      this._tabs = document.createElement("div");
      this._tabs.addEventListener(
        "scroll",
        (event) => {
          if (!event.target.matches?.(".room-tabs")) return;
          this._updateTabOverflow(event.target);
        },
        true,
      );
      this._tabs.addEventListener("click", (event) => {
        const button = event.target.closest("[data-room],[data-action],[data-tab-scroll]");
        if (!button || button.disabled) return;
        if (button.dataset.room) {
          this._selectRoom(button.dataset.room);
        } else if (button.dataset.action) this._roomAction(button.dataset.action);
        else if (button.dataset.tabScroll) this._scrollTabs(button, button.dataset.tabScroll);
      });
      this._tabs.addEventListener("keydown", (event) => {
        if (
          !event.target.matches('[role="tab"]') ||
          !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
        )
          return;
        event.preventDefault();
        const rooms = this._tabRooms(this._editorRooms());
        let index = rooms.findIndex((room) => room.entity_id === this._selectedRoom);
        index =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? rooms.length - 1
              : (index + (event.key === "ArrowLeft" ? -1 : 1) + rooms.length) % rooms.length;
        this._selectRoom(rooms[index].entity_id, true);
      });
      const style = document.createElement("style");
      style.textContent = `__WISER_EDITOR_CSS__`;
      this._roomForm.className = "room-options";
      this.shadowRoot.append(
        style,
        this._hubForm,
        this._form,
        this._hubTabs,
        this._hubConfigHost,
        this._typeForm,
        this._modeForm,
        this._tabs,
        this._roomForm,
        this._featureList,
        this._message,
        this._version,
      );
      this._form.computeLabel = (schema) => schema.label || text(this._hass, "title");
      this._form.addEventListener("value-changed", (event) => this._changed(event));
    }
    connectedCallback() {
      this._render();
    }
    disconnectedCallback() {
      // Invalidate in-flight layout work as well as pending retries.
      this._contentLayoutGeneration = (this._contentLayoutGeneration || 0) + 1;
      clearTimeout(this._contentLayoutTimer);
      this._contentLayoutTimer = undefined;
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
            hubs = await wiserConfigEntries(this._hass);
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
      return orderRooms(
        this._entries
          .filter(
            (entry) =>
              isRoom(entry, this._hass.states[entry.entity_id]) &&
              matchesHub(entry, this._config?.hubs),
          )
          .map((entry) => this._hass.states[entry.entity_id]),
        this._config?.device_order || this._config?.entities,
      );
    }
    _rooms() {
      return this._allRooms().filter((room) => matchesType(room, selectedTypes(this._config)));
    }
    _roomHubId(room) {
      return this._entries?.find((entry) => entry.entity_id === room?.entity_id)?.config_entry_id;
    }
    _selectedHubIds() {
      const roomHubs = new Set(
        this._allRooms()
          .map((room) => this._roomHubId(room))
          .filter(Boolean),
      );
      const configured = this._config?.hubs?.length
        ? this._config.hubs
        : this._detectedHubs().map((hub) => hub.value);
      return configured.filter((id) => roomHubs.has(id));
    }
    _editorHubIds() {
      const namedHubs = new Set((this._hubs || []).map((hub) => hub.entry_id));
      return this._selectedHubIds().filter((id) => namedHubs.has(id));
    }
    _editorRooms() {
      const rooms = this._rooms();
      const hubs = this._editorHubIds();
      if (this.hideHubSelector || hubs.length < 2) return rooms;
      if (!hubs.includes(this._editingHub)) this._editingHub = hubs[0];
      return rooms.filter((room) => this._roomHubId(room) === this._editingHub);
    }
    _renderHubTabs(hubs, selectedHubIds) {
      const visible = !this.hideHubSelector && selectedHubIds.length > 1;
      this._hubTabs.hidden = !visible;
      if (!visible) {
        this._hubTabs.innerHTML = "";
        return;
      }
      const labels = new Map(hubs.map((hub) => [hub.value, hub.label]));
      const markup = selectedHubIds
        .map((id) => {
          const active = id === this._editingHub;
          const label = labels.get(id) || id;
          return `<button type="button" role="tab" data-editor-hub="${escape(id)}" aria-selected="${active}" tabindex="${active ? 0 : -1}" class="${active ? "active" : ""}">${escape(label)}</button>`;
        })
        .join("");
      if (markup !== this._hubTabsMarkup) {
        this._hubTabs.innerHTML = markup;
        this._hubTabsMarkup = markup;
      }
    }
    _selectEditorHub(id, focusTab = false) {
      const hubs = this._editorHubIds();
      if (!hubs.includes(id) || id === this._editingHub) return;
      this._selectedRoomByHub ||= new Map();
      if (this._editingHub && this._selectedRoom)
        this._selectedRoomByHub.set(this._editingHub, this._selectedRoom);
      this._editingHub = id;
      const rooms = this._rooms().filter((room) => this._roomHubId(room) === id);
      const remembered = this._selectedRoomByHub.get(id);
      this._selectedRoom = rooms.some((room) => room.entity_id === remembered)
        ? remembered
        : rooms[0]?.entity_id;
      this._render();
      this._dispatchConfig();
      if (focusTab)
        this._hubTabs
          .querySelector?.('[role="tab"][aria-selected="true"]')
          ?.focus({ preventScroll: true });
    }
    _detectedHubs() {
      const titles = new Map(
        (this._hubs || []).map((entry) => [entry.entry_id, entry.title || entry.entry_id]),
      );
      return [
        ...new Set(
          (this._entries || [])
            .filter((entry) => entry.platform === "wiser" && entry.config_entry_id)
            .map((entry) => entry.config_entry_id),
        ),
      ].map((id) => ({ value: id, label: titles.get(id) || id }));
    }
    _migrateHubConfigs() {
      if (this.hideHubSelector || this._config.hub_configs || !this._entries?.length) return false;
      const hubIds = this._selectedHubIds();
      if (
        hubIds.length < 2 ||
        (!this._config.split_hubs && this._config.type !== "custom:wiser-controls-card")
      )
        return false;
      const source = Object.fromEntries(
        Object.entries(this._config).filter(
          ([key]) => !SHARED_CARD_CONFIG_KEYS.has(key) && key !== "hubs",
        ),
      );
      const entityHub = new Map(
        this._entries.map((entry) => [entry.entity_id, entry.config_entry_id]),
      );
      const filterIds = (value, hubId) =>
        Array.isArray(value) ? value.filter((id) => entityHub.get(id) === hubId) : value;
      const filterMap = (value, hubId) =>
        value && typeof value === "object" && !Array.isArray(value)
          ? Object.fromEntries(Object.entries(value).filter(([id]) => entityHub.get(id) === hubId))
          : value;
      const hubConfigs = hubIds.map((id) => {
        const config = JSON.parse(JSON.stringify(source));
        for (const key of ["entities", "excluded_entities", "device_order"])
          if (config[key]) config[key] = filterIds(config[key], id);
        if (config.device_options) config.device_options = filterMap(config.device_options, id);
        return { hub: id, ...orderedCardConfig(config) };
      });
      const shared = Object.fromEntries(
        Object.entries(this._config).filter(
          ([key]) => SHARED_CARD_CONFIG_KEYS.has(key) || key === "hubs",
        ),
      );
      this._config = { ...shared, hubs: hubIds, hub_configs: hubConfigs };
      if (hubIds.length > 1) this._config.split_hubs = true;
      else delete this._config.split_hubs;
      this._dispatchConfig();
      return true;
    }
    _renderHubConfigEditor(hubIds) {
      if (!hubIds.length || !this._config.hub_configs) return false;
      if (!hubIds.includes(this._editingHub)) this._editingHub = hubIds[0];
      const id = this._editingHub;
      const stored = this._config.hub_configs.find((config) => config.hub === id) || { hub: id };
      if (!this._hubConfigEditor) {
        const editor = new WiserRoomsCardEditor();
        editor.hideHubSelector = true;
        editor.hideTitle = true;
        editor.hideRoomColumns = true;
        editor.hideHeaderControlSettings = true;
        editor.hideVersion = true;
        editor._version.hidden = true;
        editor.addEventListener?.("config-changed", (event) => {
          event.stopPropagation();
          if (this._syncingHubConfig) return;
          this._selectedRoom = editor._selectedRoom;
          this._previewRoomsByHub.set(this._editingHub, event.detail.config[PREVIEW_ROOMS] || []);
          const next = Object.fromEntries(
            Object.entries(event.detail.config || {}).filter(
              ([name]) => !SHARED_CARD_CONFIG_KEYS.has(name),
            ),
          );
          delete next.hubs;
          const hubConfigs = this._config.hub_configs.map((config) =>
            config.hub === this._editingHub
              ? { hub: this._editingHub, ...orderedCardConfig(next) }
              : config,
          );
          this._config = { ...this._config, hub_configs: hubConfigs };
          this._dispatchConfig();
        });
        this._hubConfigEditor = editor;
        this._hubConfigHost.innerHTML = "";
        this._hubConfigHost.append(editor);
      }
      this._hubConfigEditor._entries = this._entries;
      this._hubConfigEditor._hubs = this._hubs;
      this._hubConfigEditor.hass = this._hass;
      this._hubConfigEditor._previewRooms = new Map(
        (this._previewRoomsByHub.get(id) || []).flatMap((entityId) => {
          const state = this._hass?.states?.[entityId];
          return state ? [[deviceType(state), entityId]] : [];
        }),
      );
      const rememberedRoom = this._selectedRoomByHub?.get(id);
      if (rememberedRoom && this._roomHubId(this._hass?.states?.[rememberedRoom]) === id) {
        this._hubConfigEditor._selectedRoom = rememberedRoom;
      }
      this._syncingHubConfig = true;
      const { hub, ...options } = stored;
      this._hubConfigEditor.setConfig({ ...options, hubs: [hub] });
      this._syncingHubConfig = false;
      const hadSelectedRoom = Boolean(this._selectedRoom);
      if (this._hubConfigEditor._selectedRoom)
        this._selectedRoom = this._hubConfigEditor._selectedRoom;
      this._hubConfigEditor._rememberPreviewRoom(this._hubConfigEditor._selectedRoom);
      this._previewRoomsByHub.set(id, [...this._hubConfigEditor._previewRooms.values()]);
      this._hubConfigHost.hidden = false;
      for (const element of [
        this._typeForm,
        this._modeForm,
        this._tabs,
        this._roomForm,
        this._featureList,
        this._message,
      ])
        element.hidden = true;
      if (!hadSelectedRoom && this._selectedRoom) this._dispatchConfig();
      return true;
    }
    _name(room) {
      return entityDisplayName(this._hass, room);
    }
    _tabNames(rooms) {
      const originalNames = new Map(
        (this._entries || [])
          .filter((entry) => entry.original_name)
          .map((entry) => [entry.entity_id, entry.original_name]),
      );
      const details = rooms.map((room) => {
        const area = room.attributes.room || "";
        const roomType = deviceType(room);
        const entityName =
          roomType === "hot_water"
            ? originalNames.get(room.entity_id) ||
              String(room.attributes.name || this._name(room))
                .replace(/^Wiser HeatHub\s*\([^)]*\)\s*/i, "")
                .trim()
            : room.attributes.name || this._name(room);
        const name = roomType === "heating" ? area || entityName : entityName || area;
        return { room, area, name };
      });
      const countNames = (values) =>
        values.reduce(
          (counts, value) => counts.set(value, (counts.get(value) || 0) + 1),
          new Map(),
        );
      const baseCounts = countNames(details.map((detail) => detail.name));
      const labels = details.map((detail) =>
        baseCounts.get(detail.name) > 1 && detail.area && detail.area !== detail.name
          ? `${detail.area} · ${detail.name}`
          : detail.name,
      );
      const labelCounts = countNames(labels);
      const seen = new Map();
      return new Map(
        details.map((detail, index) => {
          const label = labels[index];
          if (labelCounts.get(label) === 1) return [detail.room.entity_id, label];
          const occurrence = (seen.get(label) || 0) + 1;
          seen.set(label, occurrence);
          return [detail.room.entity_id, `${label} ${occurrence}`];
        }),
      );
    }
    _shown(id) {
      return (
        !this._config.excluded_entities?.includes(id) &&
        (!this._config.entities?.length || this._config.entities.includes(id))
      );
    }
    _render() {
      if (!this._config || !this._hass) return;
      this._version.hidden = Boolean(this.hideVersion);
      const hubs = this._detectedHubs();
      this._hubForm.hass = this._hass;
      const hubSchema = [
        {
          name: "hubs",
          label: text(this._hass, "hubs"),
          selector: { select: { multiple: true, mode: "dropdown", options: hubs } },
        },
      ];
      const hubSignature = JSON.stringify(hubSchema);
      if (hubSignature !== this._hubSchemaSignature) {
        this._hubForm.schema = hubSchema;
        this._hubSchemaSignature = hubSignature;
      }
      const hubData = { hubs: this._config.hubs || hubs.map((hub) => hub.value) };
      if (JSON.stringify(hubData) !== JSON.stringify(this._hubForm.data))
        this._hubForm.data = hubData;
      this._hubForm.hidden = this.hideHubSelector || !hubs.length;
      this._form.hass = this._hass;
      const selectedHubIds = this._selectedHubIds();
      const hasMultipleHubs = !this.hideHubSelector && selectedHubIds.length > 1;
      const editorHubIds = this._editorHubIds();
      if (editorHubIds.length > 1 && !editorHubIds.includes(this._editingHub))
        this._editingHub = editorHubIds[0];
      const rooms = this._editorRooms();
      this._renderHubTabs(hubs, editorHubIds);
      if (this._migrateHubConfigs()) return this._render();
      const hasMultipleHeatingChannels =
        heatingChannelGroups(this._allRooms()).filter((group) => group.key !== "unassigned")
          .length > 1;
      const appearanceSchema = [
        ...(this.hideTitle ? [] : [{ name: "title", selector: { text: {} } }]),
        ...(this.hideRoomColumns
          ? []
          : [
              {
                name: "device_columns",
                label: text(this._hass, "devices_per_row"),
                selector: { number: { min: 1, max: 6, step: 1, mode: "box" } },
              },
            ]),
        ...(hasMultipleHubs
          ? [
              {
                name: "split_hubs",
                label: text(this._hass, "split_hubs"),
                selector: { boolean: {} },
              },
            ]
          : []),
        ...(hasMultipleHeatingChannels
          ? [
              {
                name: "split_heating_channels",
                label: text(this._hass, "split_heating_channels"),
                selector: { boolean: {} },
              },
            ]
          : []),
      ];
      const roomTypeSchema = {
        name: "device_types",
        label: text(this._hass, "show"),
        selector: {
          select: {
            mode: "box",
            options: [
              { value: "all", label: text(this._hass, "all") },
              ...sortedDeviceTypes(this._hass).map((value) => ({
                value,
                label: text(this._hass, value),
              })),
            ],
          },
        },
      };
      const temperatureFocusSchema = {
        name: "temperature_focus",
        label: "",
        selector: {
          button_toggle: {
            options: [
              { value: "current", label: text(this._hass, "current") },
              { value: "target", label: text(this._hass, "target") },
            ],
          },
        },
      };
      const schema = [...appearanceSchema, roomTypeSchema, temperatureFocusSchema];
      // Retain the form schema during state updates so edits keep their focus.
      const signature = JSON.stringify(schema);
      if (signature !== this._schemaSignature) {
        this._form.schema = appearanceSchema;
        this._typeForm.schema = [roomTypeSchema];

        this._schemaSignature = signature;
      }
      this._form.className = "settings";
      this._form.style.maxWidth =
        this.hideTitle && !this.hideRoomColumns && this.hideHeaderControlSettings ? "130px" : "";
      const data = {};
      if (!this.hideRoomColumns) data.device_columns = this._config.device_columns ?? 1;
      if (!this.hideTitle) data.title = this._config.title ?? text(this._hass, "wiser_controls");
      if (hasMultipleHubs) data.split_hubs = this._config.split_hubs ?? false;
      if (hasMultipleHeatingChannels)
        data.split_heating_channels = this._config.split_heating_channels ?? false;
      if (JSON.stringify(data) !== JSON.stringify(this._form.data)) this._form.data = data;
      this._form.hidden = !appearanceSchema.length;
      if (this._renderHubConfigEditor(editorHubIds)) return;
      this._hubConfigHost.hidden = true;
      const activeTypes = selectedTypes(this._config);
      this._typeForm.data = { device_types: activeTypes };
      const typeOptions = roomTypeSchema.selector.select.options;
      const typeMarkup = `<span class="show-label" id="show-label">${escape(text(this._hass, "show"))}</span><div class="show-options" role="group" aria-labelledby="show-label">${typeOptions
        .map((option) => {
          const active =
            option.value === "all"
              ? activeTypes.length === DEVICE_TYPES.length
              : activeTypes.includes(option.value);
          return `<ha-button size="s" variant="${active ? "brand" : "neutral"}" appearance="${active ? "filled" : "outlined"}" data-room-type="${option.value}" aria-pressed="${active}">${option.label}</ha-button>`;
        })
        .join("")}</div>`;
      if (typeMarkup !== this._typeMarkup) {
        this._typeForm.innerHTML = typeMarkup;
        this._typeMarkup = typeMarkup;
      }
      this._typeForm.hidden = this.hideDeviceTypes === true;
      this._modeForm.hass = this._hass;
      const modeSchema = [
        ...(this.hideHeaderControlSettings
          ? []
          : [
              {
                name: "admin_only_header_controls",
                label: text(this._hass, "admin_only_header_controls"),
                selector: { boolean: {} },
              },
            ]),
        ...(this.hideHeaderControlSettings
          ? []
          : [
              {
                name: "header_button_style",
                label: text(this._hass, "header_button_style"),
                selector: {
                  button_toggle: {
                    size: "small",
                    options: [
                      { value: "icon_only", label: text(this._hass, "icon_only") },
                      { value: "icon_text", label: text(this._hass, "icon_and_text") },
                    ],
                  },
                },
              },
            ]),
        ...(rooms.length
          ? [
              {
                name: "device_configuration",
                label: text(this._hass, "configuration_mode"),
                selector: {
                  button_toggle: {
                    size: "small",
                    options: [
                      { value: "master", label: text(this._hass, "master") },
                      { value: "individual", label: text(this._hass, "individual") },
                    ],
                  },
                },
              },
            ]
          : []),
      ];
      if (JSON.stringify(modeSchema) !== this._modeSchemaSignature) {
        this._modeForm.schema = modeSchema;
        this._modeSchemaSignature = JSON.stringify(modeSchema);
      }
      const modeData = {
        ...(!this.hideHeaderControlSettings
          ? { admin_only_header_controls: this._config.admin_only_header_controls ?? false }
          : {}),
        ...(!this.hideHeaderControlSettings
          ? { header_button_style: this._config.header_button_style ?? "icon_text" }
          : {}),
        ...(rooms.length
          ? { device_configuration: masterMode(this._config) ? "master" : "individual" }
          : {}),
      };
      if (JSON.stringify(modeData) !== JSON.stringify(this._modeForm.data))
        this._modeForm.data = modeData;
      this._modeForm.hidden = !modeSchema.length;
      this._compactHeaderSettings();
      this._modeForm.style.marginBottom = masterMode(this._config) ? "12px" : "";
      const hadSelectedRoom = Boolean(this._selectedRoom);
      this._renderTabs(rooms);
      if (!hadSelectedRoom && this._selectedRoom) this._dispatchConfig();
      const selectedOptions = roomConfig(this._config, this._selectedRoom);
      const selectedState = this._hass.states[this._selectedRoom];
      const secondaryStatus = this._secondaryStatusSource(this._selectedRoom);
      const secondaryEntity =
        secondaryStatus?.entities?.[this._selectedRoom] ||
        secondaryStatus?.entity ||
        this._selectedRoom;
      const secondaryRooms = masterMode(this._config)
        ? this._rooms().filter((room) => deviceType(room) === typeForEntity(this._selectedRoom))
        : [];
      const selectedType = selectedState ? deviceType(selectedState) : "heating";
      const shutter = selectedType === "shutters";
      const heating = selectedType === "heating";
      const temperatureDevice =
        heating || isOpenThermHotWater(selectedState) || isStoredHotWaterClimate(selectedState);
      if (heating && selectedState) {
        const states = {
          ...this._hass.states,
          [this._selectedRoom]: withOverrideEnd(selectedState, this._hass),
        };
        const secondaryState = states[secondaryEntity];
        if (secondaryState)
          states[secondaryEntity] = {
            ...secondaryState,
            attributes: {
              ...secondaryState.attributes,
              override_end_time: overrideEndValue(selectedState, this._hass),
            },
          };
        this._roomForm.hass = { ...this._hass, states };
      } else this._roomForm.hass = this._hass;
      this._roomForm.hass = withNativeCurrentAction(this._roomForm.hass);
      const metricLabel = text(
        this._hass,
        shutter
          ? "show_position"
          : selectedType === "lights"
            ? "show_brightness"
            : selectedType === "plugs" || isStoredHotWaterSwitch(selectedState)
              ? "show_status"
              : "show_temperatures",
      );
      const identitySchema = [
        {
          name: "name",
          label: text(this._hass, "name"),
          selector: { entity_name: {} },
          context: { entity: "entity" },
        },
        {
          name: "",
          type: "grid",
          schema: [
            {
              name: "icon",
              label: text(this._hass, "icon"),
              selector: { icon: {} },
              context: { icon_entity: "entity" },
            },
            {
              name: "color",
              label: text(this._hass, "color"),
              selector: { ui_color: { default_color: "state", include_state: true } },
            },
          ],
        },
      ];
      // Content row 1: temperature visibility switch and Current / Target pill.
      const primaryContentFields = [
        {
          name: "show_temperatures",
          label: metricLabel,
          selector: { boolean: {} },
        },
        ...(temperatureDevice ? [temperatureFocusSchema] : []),
      ];

      const contentRows = [
        primaryContentFields,

        // Content row 2: schedule visibility and state visibility switches.
        [
          {
            name: "show_next_schedule",
            label: text(this._hass, "show_next_schedule"),
            selector: { boolean: {} },
          },
          {
            name: "hide_state",
            label: text(this._hass, "hide_state"),
            selector: { boolean: {} },
          },
        ],

        // Content row 3: glow switch, shown for heating devices only.
        ...(heating
          ? [
              [
                {
                  name: "show_heating_glow",
                  label: text(this._hass, "show_heating_glow"),
                  selector: { boolean: {} },
                },
              ],
            ]
          : []),
      ]
        .filter((fields) => fields.length)
        .map((schema) => ({
          name: "",
          type: "grid",
          column_min_width: "180px",
          schema,
        }));
      const contentSchema = [
        ...identitySchema,
        ...contentRows,
        {
          name: "state_content",
          label: text(this._hass, "state_content"),
          visible: { field: "hide_state", operator: "not_eq", value: true },
          selector: { ui_state_content: { allow_context: true } },
          context: { filter_entity: "entity" },
        },
      ];
      const actionSchema = [
        {
          name: "tap_action",
          label: "Tap action",
          selector: { ui_action: { default_action: "more-info" } },
          context: { filter_entity: "entity" },
        },
        { name: "", type: "divider" },
        {
          name: "icon_tap_action",
          label: "Icon tap action",
          selector: {
            ui_action: {
              default_action:
                isLight(selectedState) || isPlug(selectedState) ? "toggle" : "more-info",
            },
          },
          context: { filter_entity: "entity" },
        },
        {
          name: "",
          type: "optional_actions",
          flatten: true,
          schema: [
            {
              name: "hold_action",
              label: "Hold action",
              selector: { ui_action: { default_action: "none" } },
              context: { filter_entity: "entity" },
            },
            {
              name: "icon_hold_action",
              label: "Icon hold action",
              selector: { ui_action: { default_action: "none" } },
              context: { filter_entity: "entity" },
            },
            {
              name: "double_tap_action",
              label: "Double-tap action",
              selector: { ui_action: { default_action: "none" } },
              context: { filter_entity: "entity" },
            },
            {
              name: "icon_double_tap_action",
              label: "Icon double-tap action",
              selector: { ui_action: { default_action: "none" } },
              context: { filter_entity: "entity" },
            },
          ],
        },
      ];
      const secondaryStatusSchema = [
        ...(secondaryRooms.length
          ? secondaryRooms.map((room, index) => ({
              name: `secondary_status_room_${index}`,
              label: this._name(room),
              selector: { entity: {} },
            }))
          : [
              {
                name: "secondary_status_entity",
                label:
                  this._hass.localize?.("ui.panel.lovelace.editor.card.generic.entity") || "Entity",
                selector: { entity: {} },
              },
            ]),
        {
          name: "secondary_status_content",
          label:
            this._hass.localize?.("ui.panel.lovelace.editor.card.tile.state_content") ||
            text(this._hass, "state_content"),
          selector: {
            ui_state_content: { allow_context: true, entity_id: secondaryEntity || undefined },
          },
        },
        {
          name: "secondary_status_show_labels",
          label: text(this._hass, "show_state_labels"),
          selector: { boolean: {} },
        },
      ];
      const roomSchema = [
        {
          name: "content",
          label: text(this._hass, "content"),
          type: "expandable",
          flatten: true,
          icon: "mdi:text-short",
          schema: contentSchema,
        },
        {
          name: "secondary_status_section",
          label: text(this._hass, "secondary_status"),
          type: "expandable",
          flatten: true,
          icon: "mdi:list-status",
          schema: secondaryStatusSchema,
        },
        {
          name: "interactions",
          label: text(this._hass, "interactions"),
          type: "expandable",
          flatten: true,
          icon: "mdi:gesture-tap",
          schema: actionSchema,
        },
      ];
      const roomSignature = JSON.stringify(roomSchema);
      if (roomSignature !== this._roomSchema) {
        this._roomForm.schema = roomSchema;
        this._roomSchema = roomSignature;
      }
      const roomData = {
        entity: this._selectedRoom,
        color: selectedOptions.color || "state",
        hide_state: selectedOptions.hide_state ?? false,
        state_content: selectedOptions.state_content ?? [heating ? "hvac_action" : "state"],
        temperature_focus: selectedOptions.temperature_focus ?? "current",
        show_temperatures: selectedOptions.show_temperatures ?? true,
        show_next_schedule: selectedOptions.show_next_schedule ?? true,
        secondary_status_content: secondaryStatus
          ? selectedOptions.secondary_status
            ? normalizedSecondaryStateContent(secondaryStatus.state_content)
            : normalizedStateContent(secondaryStatus.state_content)
          : [],
        secondary_status_show_labels: secondaryStatus?.show_labels === true,
        tap_action: selectedOptions.tap_action,
        icon_tap_action: selectedOptions.icon_tap_action,
        hold_action: selectedOptions.hold_action,
        icon_hold_action: selectedOptions.icon_hold_action,
        double_tap_action: selectedOptions.double_tap_action,
        icon_double_tap_action: selectedOptions.icon_double_tap_action,
      };
      roomData.name = selectedOptions.name ?? [{ type: "area" }];
      roomData.icon = selectedOptions.icon;
      if (heating) roomData.show_heating_glow = selectedOptions.show_heating_glow ?? false;
      if (secondaryRooms.length)
        secondaryRooms.forEach((room, index) => {
          roomData[`secondary_status_room_${index}`] =
            secondaryStatus?.entities?.[room.entity_id] || "";
        });
      else roomData.secondary_status_entity = secondaryStatus?.entity || "";
      for (const key of Object.keys(roomData))
        if (roomData[key] === undefined) delete roomData[key];
      if (JSON.stringify(roomData) !== JSON.stringify(this._roomForm.data))
        this._roomForm.data = roomData;
      this._scheduleContentLayout();
      this._extendNamePicker();
      this._roomForm.hidden = !this._selectedRoom;
      this._featureList.hidden = !this._selectedRoom;
      this._renderFeatures();
      this._message.textContent = this._failed
        ? text(this._hass, "retry_editor")
        : this._loading
          ? text(this._hass, "finding")
          : !rooms.length
            ? text(this._hass, "no_devices")
            : "";
      this._message.hidden = !this._message.textContent;
    }
    async _compactHeaderSettings() {
      // Header settings layout: edit these two values to adjust all three rows.
      const rowHeight = EDITOR_SETTINGS_ROW_HEIGHT;
      const gapBetweenRows = EDITOR_SETTINGS_ROW_GAP;

      await this._modeForm?.updateComplete;
      const root = this._modeForm?.shadowRoot?.querySelector('[part~="root"], .root, #root');
      if (!root) return;

      root.style.display = "grid";
      root.style.gridAutoRows = rowHeight;
      root.style.rowGap = gapBetweenRows;

      // Centre each control within its row and remove native bottom margins.
      for (const field of root?.children || []) {
        field.style.marginBlock = "0";
        field.style.height = rowHeight;
        field.style.minHeight = "0";
        field.style.display = "flex";
        field.style.flexDirection = "column";
        field.style.justifyContent = "center";
        field.style.alignSelf = "center";
        await this._useSmallNativePill(field);
        const toggle = findInShadowRoots(field.shadowRoot, "ha-switch");
        if (toggle) {
          // HA's boolean selector gives this host a 56px minimum height,
          // although its visible switch and label are only 24px tall.
          // Centre that visible content inside our equal-height row.
          toggle.style.minHeight = "0";
          toggle.style.height = "auto";
        }
      }
    }
    async _useSmallNativePill(field) {
      await field?.updateComplete;
      const selector = findInShadowRoots(field?.shadowRoot, "ha-selector");
      await selector?.updateComplete;
      const pillSelector = findInShadowRoots(field?.shadowRoot, "ha-selector-button_toggle");
      await pillSelector?.updateComplete;
      const group = findInShadowRoots(field?.shadowRoot, "ha-button-toggle-group");
      if (group) {
        // Older HA uses small/medium; newer HA uses s/m. Preserve the native
        // API already in use by this group instead of passing an invalid size.
        const size = ["small", "medium"].includes(group.size) ? "small" : "s";
        group.size = size;
        group.setAttribute("size", size);
        await group.updateComplete;
        const buttons = group.shadowRoot?.querySelector("ha-button-group");
        await buttons?.updateComplete;
      }
    }
    _scheduleContentLayout() {
      clearTimeout(this._contentLayoutTimer);
      const generation = (this._contentLayoutGeneration || 0) + 1;
      this._contentLayoutGeneration = generation;
      const apply = async (attempt = 0) => {
        if (generation !== this._contentLayoutGeneration) return;
        this._contentLayoutTimer = undefined;
        // Header selector modules may still be loading on the initial render.
        // Retry their sizing together with the Content layout.
        await this._compactHeaderSettings();
        const ready = await this._styleTemperatureFocus();
        if (generation !== this._contentLayoutGeneration) return;
        if (!ready && this.isConnected && attempt < 10) {
          this._contentLayoutTimer = setTimeout(() => apply(attempt + 1), 50);
        }
      };
      this._contentLayoutTimer = setTimeout(() => apply(), 0);
    }
    async _styleTemperatureFocus() {
      // Content layout settings.
      const gapBetweenRows = EDITOR_SETTINGS_ROW_GAP;
      const pillHeight = "32px";

      await this._roomForm?.updateComplete;
      const content = [
        ...(this._roomForm?.shadowRoot?.querySelectorAll("ha-form-expandable") || []),
      ].find((item) => item.schema?.name === "content");
      await content?.updateComplete;
      const form = content?.shadowRoot?.querySelector("ha-form");
      await form?.updateComplete;
      const grids = [...(form?.shadowRoot?.querySelectorAll("ha-form-grid") || [])];
      // Native ha-form adds a fixed 24px bottom margin to each grid.
      // Keep consecutive Content rows compact, including the standalone glow row.
      for (const row of grids) {
        row.style.marginBottom = gapBetweenRows;
        row.style.gridTemplateColumns = `repeat(${row.schema.schema.length},minmax(0,1fr))`;
        row.style.alignItems = "center";
        if (row.schema.schema.some(field => field.selector?.boolean)) {
          await this._centreContentRow(row);
        }
      }
      const grid = grids.find((item) =>
        item.schema?.schema?.some((field) => field.name === "temperature_focus"),
      );
      await grid?.updateComplete;
      if (!grid) return false;

      // Let the switch use the available space and give the pill only its
      // natural width. This anchors the pill to the right edge of the row.
      grid.style.gridTemplateColumns = "repeat(2,minmax(0,1fr))";
      grid.style.alignItems = "center";
      const index =
        grid?.schema?.schema?.findIndex((field) => field.name === "temperature_focus") ?? -1;
      const fields = [...(grid?.shadowRoot?.querySelectorAll("ha-form") || [])];
      const field = fields[index] || [...(grid.shadowRoot?.children || [])]
        .filter(element => element.localName !== "style")[index];
      if (!field) return false;

      field.style.width = "max-content";
      field.style.maxWidth = "100%";
      field.style.marginInlineStart = "auto";
      field.style.justifySelf = "end";
      field.style.alignSelf = "center";
      field.style.setProperty("--ha-button-height", pillHeight);
      await field.updateComplete;
      const root = field.shadowRoot?.querySelector('[part~="root"], .root, #root');
      if (root) {
        // Horizontal pill alignment and vertical centring.
        root.style.display = "flex";
        root.style.justifyContent = "flex-end";
        root.style.alignItems = "center";
      }
      await this._useSmallNativePill(field);
      const show = this._roomForm.data?.show_temperatures !== false;
      field.style.visibility = show ? "" : "hidden";
      field.inert = !show;
      field.setAttribute("aria-hidden", String(!show));
      return !show || this._alignTemperatureControls(grid, field);
    }
    async _centreContentRow(row) {
      // Use the same row height for temperature, schedule/state and glow.
      const rowHeight = EDITOR_SETTINGS_ROW_HEIGHT;
      await row.updateComplete;
      row.style.minHeight = rowHeight;
      for (const cell of row.shadowRoot?.querySelectorAll("ha-form") || []) {
        await cell.updateComplete;
        const toggle = findInShadowRoots(cell.shadowRoot, "ha-switch");
        if (toggle) {
          // Centre the visible 24px switch, not HA's padded 56px host.
          toggle.style.minHeight = "0";
          toggle.style.height = "auto";
        }
        cell.style.alignSelf = "center";
        cell.style.marginBlock = "0";
        cell.style.height = rowHeight;
        cell.style.display = "flex";
        cell.style.flexDirection = "column";
        cell.style.justifyContent = "center";
        const cellRoot = cell.shadowRoot?.querySelector('[part~="root"], .root, #root');
        if (cellRoot) {
          cellRoot.style.height = "100%";
          cellRoot.style.display = "flex";
          cellRoot.style.alignItems = "center";
          for (const control of cellRoot.children) {
            control.style.marginBlock = "0";
            control.style.width = "100%";
          }
        }
      }
    }
    async _alignTemperatureControls(grid, field) {
      // Align the visible native controls rather than their differently sized
      // form wrappers. Reset first so repeated updates never accumulate offsets.
      const toggle = findInShadowRoots(grid.shadowRoot, "ha-switch");
      const pill = findInShadowRoots(field.shadowRoot, "ha-button-toggle-group");
      if (!toggle || !pill) return false;
      await pill.updateComplete;
      field.style.transform = "";
      const visibleToggle = findInShadowRoots(toggle.shadowRoot, '[part~="control"]') || toggle;
      const toggleBounds = visibleToggle.getBoundingClientRect();
      const pillBounds = pill.getBoundingClientRect();
      if (!toggleBounds.height || !pillBounds.height) return false;
      const toggleCentre = toggleBounds.top + toggleBounds.height / 2;
      const pillCentre = pillBounds.top + pillBounds.height / 2;
      const offset = toggleCentre - pillCentre;
      if (Math.abs(offset) > 0.5) field.style.transform = `translateY(${offset}px)`;
      return true;
    }
    _extendNamePicker() {
      if (this._namePickerLookup) return this._namePickerLookup;
      this._namePickerLookup = (async () => {
        for (let attempt = 0; attempt <= 10; attempt += 1) {
          await this._roomForm?.updateComplete;
          const picker = findInShadowRoots(this._roomForm?.shadowRoot, "ha-entity-name-picker");
          if (extendWiserNamePicker(picker) || !this.isConnected) return;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      })().finally(() => {
        this._namePickerLookup = undefined;
      });
      return this._namePickerLookup;
    }
    _secondaryStatusSource(id) {
      if (!id) return undefined;
      const options = roomConfig(this._config, id);
      if (
        options.secondary_status &&
        typeof options.secondary_status === "object" &&
        !Array.isArray(options.secondary_status)
      )
        return options.secondary_status;
      return undefined;
    }
    _secondaryStatusOptions(value) {
      const id = this._selectedRoom;
      const hasSecondaryValue = Object.keys(value).some(
        (key) =>
          key === "secondary_status_entity" ||
          key === "secondary_status_content" ||
          key === "secondary_status_show_labels" ||
          key.startsWith("secondary_status_room_"),
      );
      if (!id || !hasSecondaryValue) return {};
      const rawOptions = masterMode(this._config)
        ? masterOptions(this._config, id) || {}
        : this._config.device_options?.[id] || {};
      const existingStatus = this._secondaryStatusSource(id) || {};
      const result = {};
      const status = {};
      if (masterMode(this._config)) {
        const entities = {};
        this._rooms()
          .filter((room) => deviceType(room) === typeForEntity(id))
          .forEach((room, index) => {
            const key = `secondary_status_room_${index}`;
            const entity = Object.hasOwn(value, key)
              ? value[key]
              : existingStatus.entities?.[room.entity_id];
            if (typeof entity === "string" && entity && entity !== room.entity_id)
              entities[room.entity_id] = entity;
          });
        if (Object.keys(entities).length) status.entities = entities;
      } else {
        const entity = Object.hasOwn(value, "secondary_status_entity")
          ? value.secondary_status_entity
          : existingStatus.entity;
        if (typeof entity === "string" && entity && entity !== id) status.entity = entity;
      }
      status.state_content = Object.hasOwn(value, "secondary_status_content")
        ? normalizedSecondaryStateContent(value.secondary_status_content)
        : rawOptions.secondary_status
          ? normalizedSecondaryStateContent(existingStatus.state_content)
          : existingStatus.type
            ? normalizedStateContent(existingStatus.state_content)
            : [];
      const showLabels = Object.hasOwn(value, "secondary_status_show_labels")
        ? value.secondary_status_show_labels
        : existingStatus.show_labels;
      if (showLabels) status.show_labels = true;
      result.secondary_status =
        status.state_content.length || status.entity || status.entities || status.show_labels
          ? status
          : undefined;
      return result;
    }
    _setRoomOptions(options) {
      if (!this._selectedRoom) return;
      const master = masterMode(this._config);
      const current = {
        ...(master
          ? masterOptions(this._config, this._selectedRoom)
          : this._config.device_options?.[this._selectedRoom]),
      };
      for (const [key, value] of Object.entries(options)) {
        if (value === undefined) delete current[key];
        else current[key] = value;
      }
      if (master)
        this._config = {
          ...this._config,
          master_options_by_type: {
            ...this._config.master_options_by_type,
            [typeForEntity(this._selectedRoom)]: current,
          },
        };
      else
        this._config = {
          ...this._config,
          device_options: { ...this._config.device_options, [this._selectedRoom]: current },
        };
      this._render();
      this._dispatchConfig();
    }
    _featureEditorContext(id) {
      const context = { entity_id: id };
      if (masterMode(this._config)) {
        context.wiser_master = true;
        const roomType = typeForEntity(id);
        context.wiser_rooms = this._rooms()
          .filter((room) => deviceType(room) === roomType)
          .map((room) => ({ entity_id: room.entity_id, name: this._name(room) }));
      }
      return context;
    }
    _saveNativeFeatures(id, list, editorOwnsList = false) {
      if (!id || !validNativeFeatures(list)) return;
      const existingOptions = masterMode(this._config)
        ? masterOptions(this._config, id) || {}
        : this._config.device_options?.[id] || {};
      const features = uniqueNativeFeatures([...list]);
      if (masterMode(this._config)) {
        const currentOptions = existingOptions;
        const roomType = typeForEntity(id);
        const options = { ...currentOptions, features };
        this._config = {
          ...this._config,
          master_options_by_type: {
            ...this._config.master_options_by_type,
            [roomType]: options,
          },
        };
      } else {
        const options = { ...existingOptions, features };
        this._config = {
          ...this._config,
          device_options: { ...this._config.device_options, [id]: options },
        };
      }
      if (editorOwnsList && id === this._selectedRoom) {
        this._nativeEditor.features = features;
        this._nativeEditorSignature = id + JSON.stringify(features);
      }
      this._render();
      this._dispatchConfig();
    }
    _renderFeatures() {
      if (!this._selectedRoom) return;
      const featureHeading = this._featureList.querySelector?.('[slot="header"]');
      if (featureHeading) featureHeading.textContent = text(this._hass, "features");
      this._nativeEditor.hass = this._hass;
      this._featurePositionForm.hass = this._hass;
      this._featurePositionForm.schema = [
        {
          name: "features_position",
          required: true,
          label: text(this._hass, "features_position"),
          selector: {
            select: {
              mode: "box",
              options: ["bottom", "inline"].map((value) => ({
                value,
                label: text(this._hass, value),
                description: this._hass.localize(
                  `ui.panel.lovelace.editor.card.tile.features_position_options.${value}_description`,
                ),
                image: {
                  src: `/static/images/form/tile_features_position_${value}.svg`,
                  src_dark: `/static/images/form/tile_features_position_${value}_dark.svg`,
                  flip_rtl: true,
                },
              })),
            },
          },
        },
      ];
      this._nativeEditor.context = this._featureEditorContext(this._selectedRoom);
      this._nativeEditor.stateObj = this._hass.states[this._selectedRoom];
      const storedList = configuredNativeFeatures(
        this._config,
        this._selectedRoom,
        this._hass.states[this._selectedRoom],
      );
      const list = storedList;
      this._featurePositionForm.hidden = !list.length;
      const signature = this._selectedRoom + JSON.stringify(list);
      if (signature !== this._nativeEditorSignature) {
        this._nativeEditor.features = list;
        this._nativeEditorSignature = signature;
      }
      const positionData = {
        features_position:
          roomConfig(this._config, this._selectedRoom).features_position || "bottom",
      };
      if (JSON.stringify(positionData) !== JSON.stringify(this._featurePositionForm.data))
        this._featurePositionForm.data = positionData;
    }
    _tabRooms(rooms) {
      if (!masterMode(this._config))
        return DEVICE_TYPES.flatMap((roomType) =>
          rooms.filter((room) => deviceType(room) === roomType),
        );
      const selected = selectedTypes(this._config);
      return selected
        .map(
          (roomType) =>
            rooms.find((room) => deviceType(room) === roomType && this._shown(room.entity_id)) ||
            rooms.find((room) => deviceType(room) === roomType),
        )
        .filter(Boolean);
    }
    _updateTabOverflow(strip = this._tabs.querySelector?.(".room-tabs")) {
      const viewport = strip?.parentElement;
      if (!viewport?.classList) return;
      const tolerance = 2;
      const fullWidth = Math.max(strip.clientWidth, viewport.clientWidth || 0);
      if (strip.scrollWidth <= fullWidth + tolerance) {
        viewport.classList.toggle("can-scroll-left", false);
        viewport.classList.toggle("can-scroll-right", false);
        strip.scrollLeft = 0;
        return;
      }
      viewport.classList.toggle("can-scroll-left", strip.scrollLeft > tolerance);
      viewport.classList.toggle(
        "can-scroll-right",
        strip.scrollLeft + strip.clientWidth < strip.scrollWidth - tolerance,
      );
    }
    _scrollTabs(control, direction) {
      const strip = control.parentElement?.querySelector?.(".room-tabs");
      if (!strip) return;
      const distance = Math.max(160, strip.clientWidth * 0.75);
      strip.scrollBy({ left: direction === "left" ? -distance : distance, behavior: "smooth" });
    }
    _tabScrollPositions() {
      return new Map(
        Array.from(
          this._tabs.querySelectorAll?.(".room-tab-bar[data-device-type]") || [],
          (row) => [row.dataset.deviceType, row.querySelector(".room-tabs")?.scrollLeft || 0],
        ),
      );
    }
    _restoreTabScrollPositions(positions) {
      for (const row of this._tabs.querySelectorAll?.(".room-tab-bar[data-device-type]") || []) {
        const strip = row.querySelector(".room-tabs");
        if (strip && positions.has(row.dataset.deviceType))
          strip.scrollLeft = positions.get(row.dataset.deviceType);
      }
    }
    _revealSelectedTab() {
      const active = this._tabs.querySelector?.('[role="tab"][aria-selected="true"]');
      const strip = active?.closest?.(".room-tabs");
      if (!strip?.getBoundingClientRect || !active.getBoundingClientRect) return;
      const stripRect = strip.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      if (activeRect.left < stripRect.left) strip.scrollLeft -= stripRect.left - activeRect.left;
      else if (activeRect.right > stripRect.right)
        strip.scrollLeft += activeRect.right - stripRect.right;
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
      const selected = tabRooms.find((room) => room.entity_id === this._selectedRoom);
      if (!selected) return;
      for (const button of this._tabs.querySelectorAll?.(".room-tabs [data-room]") || []) {
        const active = button.dataset.room === this._selectedRoom;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", String(active));
        button.tabIndex = active ? 0 : -1;
      }
      const row = this._tabs.querySelector?.(
        `.room-tab-bar[data-device-type="${deviceType(selected)}"]`,
      );
      const tools = this._tabs.querySelector?.(".room-tools");
      if (!row || !tools) return;
      row.append(tools);
      tools.hidden = false;
      const typeRooms = tabRooms.filter((room) => deviceType(room) === deviceType(selected));
      const index = typeRooms.findIndex((room) => room.entity_id === this._selectedRoom);
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
      if (!rooms.some((room) => room.entity_id === this._selectedRoom))
        this._selectedRoom = rooms[0]?.entity_id;
      if (masterMode(this._config)) {
        this._individualTabsSignature = "";
        if (!this._shown(this._selectedRoom))
          this._selectedRoom =
            rooms.find((room) => this._shown(room.entity_id))?.entity_id || rooms[0]?.entity_id;
        const typeRooms = this._tabRooms(rooms);
        if (typeRooms.length <= 1) {
          this._tabs.hidden = true;
          this._tabs.innerHTML = "";
          this._tabsMarkup = "";
          return;
        }
        if (!typeRooms.some((room) => room.entity_id === this._selectedRoom))
          this._selectedRoom = typeRooms[0].entity_id;
        this._tabs.hidden = false;
        const markup = `<div class="room-tab-bar"><div class="room-tabs-viewport"><div class="room-tabs type-tabs" role="tablist" aria-label="${escape(text(this._hass, "configuration_mode"))}">${typeRooms
          .map((room) => {
            const roomType = deviceType(room);
            const active = room.entity_id === this._selectedRoom;
            return `<button type="button" role="tab" title="${escape(text(this._hass, roomType))}" data-room="${escape(room.entity_id)}" aria-selected="${active}" tabindex="${active ? 0 : -1}" class="${active ? "active" : ""}">${escape(text(this._hass, roomType))}</button>`;
          })
          .join(
            "",
          )}</div><button type="button" class="tab-overflow-indicator left" data-tab-scroll="left" aria-label="Scroll tabs left"><ha-icon icon="mdi:chevron-left"></ha-icon></button><button type="button" class="tab-overflow-indicator right" data-tab-scroll="right" aria-label="Scroll tabs right"><ha-icon icon="mdi:chevron-right"></ha-icon></button></div></div>`;
        if (markup !== this._tabsMarkup) {
          this._tabs.innerHTML = markup;
          this._tabsMarkup = markup;
          this._scheduleTabOverflowUpdate();
        }
        return;
      }
      this._tabs.hidden = false;
      const tabRooms = this._tabRooms(rooms);
      const selected = tabRooms.find((room) => room.entity_id === this._selectedRoom);
      const tabNames = this._tabNames(tabRooms);
      const groups = DEVICE_TYPES.map((roomType) => ({
        roomType,
        rooms: tabRooms.filter((room) => deviceType(room) === roomType),
      })).filter((group) => group.rooms.length);
      const scrollPositions = this._tabScrollPositions();
      const structureSignature = JSON.stringify([
        this.hideVisibilityControl === true,
        groups.map((group) => [
          group.roomType,
          group.rooms.map((room) => [
            room.entity_id,
            tabNames.get(room.entity_id),
            this._shown(room.entity_id),
          ]),
        ]),
      ]);
      const markup = !selected
        ? ""
        : `<div class="room-tab-rows">${groups
            .map((group) => {
              const typeLabel =
                groups.length > 1
                  ? `<span class="room-type-label">${escape(text(this._hass, group.roomType))}</span>`
                  : "";
              return `<div class="room-tab-bar" data-device-type="${group.roomType}">${typeLabel}
          <div class="room-tabs-viewport"><div class="room-tabs named-tabs" role="tablist" aria-label="${escape(text(this._hass, group.roomType))}">${group.rooms
            .map((room) => {
              const active = room.entity_id === this._selectedRoom;
              const hidden = !this._shown(room.entity_id);
              const name = tabNames.get(room.entity_id);
              const label = `${name}${hidden ? " (hidden)" : ""}`;
              return `<button type="button" role="tab" title="${escape(label)}" data-room="${escape(room.entity_id)}" aria-selected="${active}" tabindex="${active ? 0 : -1}" class="${active ? "active" : ""}${hidden ? " hidden-room" : ""}" aria-label="${escape(label)}">${escape(name)}</button>`;
            })
            .join(
              "",
            )}</div><button type="button" class="tab-overflow-indicator left" data-tab-scroll="left" aria-label="Scroll tabs left"><ha-icon icon="mdi:chevron-left"></ha-icon></button><button type="button" class="tab-overflow-indicator right" data-tab-scroll="right" aria-label="Scroll tabs right"><ha-icon icon="mdi:chevron-right"></ha-icon></button></div></div>`;
            })
            .join("")}<div class="room-tools" hidden>
        ${this.hideVisibilityControl ? "" : '<ha-icon-button data-action="hide"><ha-icon></ha-icon></ha-icon-button>'}
        <ha-icon-button data-action="left" label="Move left"><ha-icon icon="mdi:arrow-left"></ha-icon></ha-icon-button>
        <ha-icon-button data-action="right" label="Move right"><ha-icon icon="mdi:arrow-right"></ha-icon></ha-icon-button>
      </div></div>`;
      const rebuilt = structureSignature !== this._individualTabsSignature;
      if (rebuilt) {
        this._tabs.innerHTML = markup;
        this._tabsMarkup = markup;
        this._individualTabsSignature = structureSignature;
        this._restoreTabScrollPositions(scrollPositions);
        this._scheduleTabOverflowUpdate();
      }
      this._syncIndividualTabSelection(tabRooms);
      if (rebuilt) this._revealSelectedTab();
    }
    _selectRoom(id, focusTab = false) {
      this._selectedRoom = id;
      this._rememberPreviewRoom(id);
      this._render();
      this._dispatchConfig();
      if (focusTab)
        this._tabs
          .querySelector?.('[role="tab"][aria-selected="true"]')
          ?.focus({ preventScroll: true });
    }
    _dispatchConfig() {
      // Symbols pass to the live preview but are omitted when the config is saved as JSON/YAML.
      this._rememberPreviewRoom(this._selectedRoom);
      const previewRooms = this._previewRoomsByHub.size
        ? [...this._previewRoomsByHub.values()].flat()
        : [...this._previewRooms.values()];
      const config = {
        ...orderedCardConfig(this._config),
        [PREVIEW_ALL_TYPES]: true,
        [PREVIEW_ROOM]: this._selectedRoom,
        [PREVIEW_ROOMS]: previewRooms,
      };
      this.dispatchEvent(
        new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }),
      );
    }
    _rememberPreviewRoom(id) {
      const state = this._hass?.states?.[id];
      if (state) this._previewRooms.set(deviceType(state), id);
    }
    _roomAction(action) {
      const rooms = this._tabRooms(this._editorRooms());
      const selected = rooms.find((room) => room.entity_id === this._selectedRoom);
      if (!selected) return;
      const typeRooms = rooms.filter((room) => deviceType(room) === deviceType(selected));
      const index = typeRooms.findIndex((room) => room.entity_id === this._selectedRoom);
      const config = { ...this._config };
      const excluded = new Set(config.excluded_entities || []);
      for (const room of rooms) if (!this._shown(room.entity_id)) excluded.add(room.entity_id);
      const order = rooms.map((room) => room.entity_id);
      if (action === "hide") {
        if (excluded.has(this._selectedRoom)) excluded.delete(this._selectedRoom);
        else excluded.add(this._selectedRoom);
      } else {
        const target = index + (action === "left" ? -1 : action === "right" ? 1 : 0);
        if (target === index || target < 0 || target >= typeRooms.length) return;
        const sourceOrderIndex = order.indexOf(this._selectedRoom);
        const targetOrderIndex = order.indexOf(typeRooms[target].entity_id);
        [order[sourceOrderIndex], order[targetOrderIndex]] = [
          order[targetOrderIndex],
          order[sourceOrderIndex],
        ];
      }
      delete config.entities;
      config.excluded_entities = [...excluded];
      config.device_order = [
        ...order,
        ...(config.device_order || []).filter((id) => !order.includes(id)),
      ];
      this._config = config;
      this._render();
      this._dispatchConfig();
    }
    _changed(event) {
      event.stopPropagation();
      const data = event.detail.value;
      const title = Object.hasOwn(data, "title")
        ? (data.title ?? "")
        : (this._config.title ?? text(this._hass, "wiser_controls"));
      const config = { ...this._config, title };
      if (!this.hideRoomColumns) config.device_columns = data.device_columns ?? 1;
      if (Object.hasOwn(data, "admin_only_header_controls")) {
        if (data.admin_only_header_controls) config.admin_only_header_controls = true;
        else delete config.admin_only_header_controls;
      }
      if (Object.hasOwn(data, "header_button_style")) {
        if (data.header_button_style === "icon_only") config.header_button_style = "icon_only";
        else delete config.header_button_style;
      }
      if (Object.hasOwn(data, "split_hubs")) {
        if (data.split_hubs) config.split_hubs = true;
        else delete config.split_hubs;
      }
      if (Object.hasOwn(data, "split_heating_channels")) {
        if (data.split_heating_channels) config.split_heating_channels = true;
        else delete config.split_heating_channels;
      }
      this._config = config;
      this._render();
      this._dispatchConfig();
    }
  }
