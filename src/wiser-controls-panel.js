/** Sidebar host for the Wiser controls card. */
class WiserRoomsPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: "open"});
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-width: 0;
          overflow: auto;
          color: var(--primary-text-color);
          background: var(--primary-background-color);
        }

        header {
          display: flex;
          flex-shrink: 0;
          align-items: center;
          gap: 16px;
          height: 64px;
          padding: 0 16px;
          color: var(--app-header-text-color);
          background: var(--app-header-background-color);
        }

        h1 {
          flex: 0 0 auto;
          margin: 0;
          font-size: 20px;
          font-weight: 400;
        }

        #menu,
        #settings {
          flex-shrink: 0;
          color: inherit;
        }

        #menu ha-icon,
        #settings ha-icon {
          color: var(--app-header-text-color, var(--primary-text-color));
        }

        #settings[disabled] ha-icon {
          color: var(--disabled-text-color);
        }

        #hub-tabs {
          display: flex;
          flex: 1;
          align-self: stretch;
          min-width: 0;
          margin-inline-start: 24px;
          overflow-x: auto;
        }

        #hub-tabs[hidden],
        wiser-controls-card[hidden] {
          display: none;
        }

        .hub-tab {
          flex: 0 0 auto;
          min-height: 48px;
          padding: 0 24px;
          border: 0;
          border-bottom: 2px solid transparent;
          color: var(--secondary-text-color);
          font: inherit;
          background: transparent;
          cursor: pointer;
        }

        .hub-tab[aria-selected="true"] {
          color: var(--app-header-text-color, var(--primary-text-color));
          border-bottom-color: currentColor;
        }

        .hub-tab:focus-visible {
          outline: 2px solid currentColor;
          outline-offset: -4px;
        }

        main {
          display: flex;
          flex: 1 0 auto;
          flex-direction: column;
          box-sizing: border-box;
          width: 100%;
          min-width: 0;
          padding: 16px;
        }

        wiser-controls-card {
          display: block;
          min-width: 0;
        }

        ha-dialog {
          --ha-dialog-width-md: 1200px;
          --ha-dialog-surface-background: var(
            --primary-background-color,
            var(--ha-color-surface-default, #fff)
          );
        }

        .dialog-description {
          margin: 0 0 20px;
          color: var(--secondary-text-color);
          font-size: 14px;
          line-height: 20px;
        }

        .dialog-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }

        #editor-mode {
          margin-inline-end: auto;
        }

        .yaml-editor[hidden],
        .visual-editor[hidden],
        .feature-detail[hidden] {
          display: none;
        }

        .feature-detail-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 16px;
        }

        #editors .feature-detail-header h3 {
          flex: 1;
          margin: 0;
          line-height: 40px;
        }

        .feature-detail-header ha-icon-button {
          flex: 0 0 40px;
          --ha-icon-button-size: 40px;
        }

        .feature-detail-header ha-icon {
          color: var(--primary-text-color);
        }

        .feature-code[hidden],
        .feature-visual[hidden] {
          display: none;
        }

        #editors section + section {
          margin-top: 24px;
          padding-top: 16px;
          border-top: 1px solid var(--divider-color);
        }

        .editor-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(320px, 44%);
          align-items: start;
          gap: 24px;
        }

        .editor-form,
        .editor-preview {
          min-width: 0;
        }

        .panel-columns {
          display: block;
          margin-bottom: 16px;
        }

        .editor-preview {
          position: sticky;
          top: 0;
        }

        #editors h3 {
          margin: 0 0 16px;
          font-size: 16px;
          font-weight: 500;
        }

        #editor-error:empty {
          display: none;
        }

        #editor-error {
          color: var(--error-color, #db4437);
        }

        :host([nested]) header {
          flex-basis: 56px;
          height: 56px;
        }

        :host([nested]) #menu,
        :host([nested]) h1,
        :host([nested]) #settings {
          display: none;
        }

        :host([nested]) #hub-tabs {
          margin-inline-start: 0;
        }

        :host([nested][single-hub]) header {
          display: none;
        }

        @media (max-width: 600px) {
          header {
            gap: 8px;
            padding: 0 8px;
          }

          #hub-tabs {
            margin-inline-start: 0;
          }

          h1 {
            flex: 0 1 auto;
            min-width: 0;
            max-width: 30%;
            font-size: 16px;
          }

          .hub-tab {
            padding: 0 12px;
          }

          .editor-layout {
            grid-template-columns: minmax(0, 1fr);
          }

          .editor-preview {
            position: static;
          }
        }
      </style>
      <header>
        <ha-button id="menu" appearance="plain" aria-label="Toggle sidebar">
          <ha-icon icon="mdi:menu"></ha-icon>
        </ha-button>
        <h1 id="panel-title">Controls</h1>
        <nav id="hub-tabs" role="tablist" aria-label="Wiser hubs" hidden></nav>
        <ha-button
          id="settings"
          appearance="plain"
          aria-label="Edit rooms card settings"
          title="Edit rooms card settings"
          disabled
        >
          <ha-icon icon="mdi:cog"></ha-icon>
        </ha-button>
      </header>
      <ha-dialog id="editor-dialog" header-title="Panel settings" width="medium">
        <p id="editor-description" class="dialog-description">
          Customize this panel. Dashboard cards keep their own settings.
        </p>
        <div id="editors"></div>
        <p id="editor-error" role="alert"></p>
        <div class="dialog-actions" id="editor-actions" slot="footer">
          <ha-button id="editor-mode" appearance="plain" disabled>
            Show code editor
          </ha-button>
          <ha-button id="cancel" appearance="plain">Cancel</ha-button>
          <ha-button id="save">Save</ha-button>
        </div>
      </ha-dialog>
      <main>
        <p id="loading" role="status">Loading Wiser controls…</p>
      </main>
    `;

    this.shadowRoot.getElementById("menu").addEventListener("click", () => {
      this.dispatchEvent(
        new CustomEvent("hass-toggle-menu", {
          bubbles: true,
          composed: true,
        }),
      );
    });
    this.shadowRoot
      .getElementById("settings")
      .addEventListener("click", () => this._openEditor());
    this.shadowRoot
      .getElementById("cancel")
      .addEventListener("click", () => this._closeEditor());
    this.shadowRoot
      .getElementById("save")
      .addEventListener("click", () => this._saveEditor());
    this.shadowRoot
      .getElementById("editor-mode")
      .addEventListener("click", () => this._toggleEditorMode());
    this.shadowRoot
      .getElementById("editor-dialog")
      .addEventListener("closed", () => this._closeEditor());
    this.shadowRoot
      .getElementById("editor-dialog")
      .addEventListener("close-dialog", () => this._closeEditor());

    this._cards = [];
    this._editors = [];
    this._editorEntries = [];
    this._previews = [];
    this._yamlErrors = new Set();
    this._yamlMode = false;
    this._generation = 0;
    this._mobileMedia = window.matchMedia?.("(max-width: 600px)");
    this._handleMobileMediaChange = () => {
      this._refreshResponsiveColumns();
    };
  }

  _t(key, values = {}) {
    return window.WiserRoomsLocalize.localize(this._hass, key, values);
  }

  _localizeControls() {
    const root = this.shadowRoot;
    root.getElementById("panel-title").textContent = this._t("panel_title");
    root.getElementById("hub-tabs").setAttribute("aria-label", this._t("panel_hubs"));
    for (const [id, key] of [["menu", "panel_menu"], ["settings", "panel_edit_settings"]]) {
      const element = root.getElementById(id);
      element.setAttribute("aria-label", this._t(key));
      element.title = this._t(key);
    }
    root.getElementById("editor-description").textContent = this._t("panel_description");
    const loading = root.getElementById("loading");
    if (loading) loading.textContent = this._t("panel_loading");
    root.getElementById("cancel").textContent = this._t("panel_cancel");
    root.getElementById("save").textContent = this._t("panel_save");
    root.getElementById("editor-mode").textContent = this._editorModeLabel();
    const dialog = root.getElementById("editor-dialog");
    dialog.setAttribute("header-title", this._t("panel_settings"));
    dialog.heading = this._t("panel_settings");
  }

  connectedCallback() {
    if (this._mobileMedia?.addEventListener) {
      this._mobileMedia.addEventListener("change", this._handleMobileMediaChange);
    } else {
      this._mobileMedia?.addListener?.(this._handleMobileMediaChange);
    }
    window.addEventListener?.("resize", this._handleMobileMediaChange);
    this._refreshResponsiveColumns();
    clearTimeout(this._responsiveInitTimer);
    this._responsiveInitTimer = setTimeout(() => {
      this._responsiveInitTimer = undefined;
      this._refreshResponsiveColumns();
    }, 0);
  }

  disconnectedCallback() {
    if (this._mobileMedia?.removeEventListener) {
      this._mobileMedia.removeEventListener("change", this._handleMobileMediaChange);
    } else {
      this._mobileMedia?.removeListener?.(this._handleMobileMediaChange);
    }
    window.removeEventListener?.("resize", this._handleMobileMediaChange);
    clearTimeout(this._responsiveInitTimer);
    this._responsiveInitTimer = undefined;
    if (this._scrollRestoreFrame !== undefined) {
      window.cancelAnimationFrame?.(this._scrollRestoreFrame);
      this._scrollRestoreFrame = undefined;
    }
  }

  set hass(hass) {
    const scrollTop = this.scrollTop;
    this._hass = hass;
    this._localizeControls();
    const editing = Boolean(
      this.shadowRoot.getElementById("editor-dialog")?.open,
    );

    if (editing) {
      this._schedulePreviewHass(hass);
    } else {
      for (const card of this._cards) {
        card.hass = hass;
      }
    }

    if (this._scrollRestoreFrame !== undefined) {
      window.cancelAnimationFrame?.(this._scrollRestoreFrame);
      this._scrollRestoreFrame = undefined;
    }
    if (scrollTop > 0) {
      this.scrollTop = scrollTop;
      this._scrollRestoreFrame = window.requestAnimationFrame?.(() => {
        this.scrollTop = scrollTop;
        this._scrollRestoreFrame = undefined;
      });
    }

    this.shadowRoot.getElementById("settings").hidden = !hass?.user?.is_admin;
  }

  set panel(panel) {
    const config = panel.config;
    if (JSON.stringify(config) === JSON.stringify(this._config)) {
      return;
    }

    this._config = config;
    this._loadCards();
  }

  _hubId(hub) {
    return this._config.hub_ids?.[hub] || hub;
  }

  _storedCardConfig(hub) {
    const {room_type: _unusedRoomType, ...stored} =
      this._config.card_configs?.[hub] || {};
    const Card = customElements.get("wiser-controls-card");
    const normalized = Card?.orderConfig?.(stored) || stored;
    return Card?.orderConfig?.({
      title: this._config.hubs.length > 1 ? hub : "Wiser controls",
      ...normalized,
      mobile_device_columns: normalized.mobile_device_columns ?? 1,
      type: "custom:wiser-controls-card",
      hubs: [this._hubId(hub)],
      _panel_hide_title: true,
    }) || normalized;
  }

  _effectiveCardConfig(config) {
    const {mobile_device_columns, ...effective} = config;
    effective.device_columns = this._mobileMedia?.matches
      ? mobile_device_columns ?? 1
      : effective.device_columns ?? 1;
    return effective;
  }

  _cardConfig(hub) {
    return this._effectiveCardConfig(this._storedCardConfig(hub));
  }

  _refreshResponsiveColumns() {
    this._cards.forEach((card, index) => {
      const hub = this._config?.hubs?.[index];
      if (hub) card.setConfig(this._cardConfig(hub));
    });
    this._editorEntries.forEach((entry) => {
      const config = this._drafts?.[entry.hub];
      if (config) {
        this._syncColumnForm(entry.columns, config);
        this._schedulePreview(entry.preview, config);
      }
    });
  }

  _selectHub(hub) {
    this._activeHub = hub;

    this._cards.forEach((card, index) => {
      const selected = this._config.hubs[index] === hub;
      card.hidden = !selected;
      if (selected) {
        card.hass = this._hass;
      }

      this._tabs[index].setAttribute("aria-selected", String(selected));
      this._tabs[index].tabIndex = selected ? 0 : -1;
    });
  }

  _renderHubTabs() {
    const hubs = this._config.hubs;
    const container = this.shadowRoot.getElementById("hub-tabs");

    this.toggleAttribute("single-hub", hubs.length <= 1);
    container.hidden = hubs.length <= 1;

    this._tabs = hubs.map((hub, index) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "hub-tab";
      tab.textContent = hub;
      tab.id = `hub-tab-${index}`;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", `hub-panel-${index}`);
      tab.addEventListener("click", () => this._selectHub(hub));
      tab.addEventListener("keydown", (event) => {
        let next;
        if (event.key === "ArrowRight") {
          next = (index + 1) % hubs.length;
        } else if (event.key === "ArrowLeft") {
          next = (index + hubs.length - 1) % hubs.length;
        } else if (event.key === "Home") {
          next = 0;
        } else if (event.key === "End") {
          next = hubs.length - 1;
        } else {
          return;
        }

        event.preventDefault();
        this._selectHub(hubs[next]);
        this._tabs[next].focus();
      });

      const card = this._cards[index];
      card.id = `hub-panel-${index}`;
      card.setAttribute("role", "tabpanel");
      card.setAttribute("aria-labelledby", tab.id);
      return tab;
    });

    container.replaceChildren(...this._tabs);
    const selectedHub = hubs.includes(this._activeHub)
      ? this._activeHub
      : hubs[0];
    this._selectHub(selectedHub);
  }

  _closeEditor() {
    for (const preview of this._previews) {
      if (preview._wiserPreviewTimer !== undefined) {
        clearTimeout(preview._wiserPreviewTimer);
      }
    }
    if (this._previewHassTimer !== undefined) {
      clearTimeout(this._previewHassTimer);
      this._previewHassTimer = undefined;
    }
    this.shadowRoot.getElementById("editor-dialog").open = false;
    this._editors = [];
    this._editorEntries = [];
    this._previews = [];
    this._yamlErrors.clear();
    this._yamlMode = false;
    this.shadowRoot.getElementById("editors").replaceChildren();
    for (const card of this._cards) {
      card.hass = this._hass;
    }
  }

  _schedulePreview(preview, config) {
    preview._wiserPendingConfig = this._effectiveCardConfig(config);
    if (preview._wiserPreviewTimer !== undefined) {
      clearTimeout(preview._wiserPreviewTimer);
    }
    preview._wiserPreviewTimer = setTimeout(() => {
      preview._wiserPreviewTimer = undefined;
      const pendingConfig = preview._wiserPendingConfig;
      preview._wiserPendingConfig = undefined;
      if (pendingConfig) preview.setConfig(pendingConfig);
    }, 100);
  }

  _schedulePreviewHass(hass) {
    this._pendingPreviewHass = hass;
    if (this._previewHassTimer !== undefined) return;
    this._previewHassTimer = setTimeout(() => {
      this._previewHassTimer = undefined;
      const pendingHass = this._pendingPreviewHass;
      this._pendingPreviewHass = undefined;
      for (const preview of this._previews) {
        preview.hass = pendingHass;
      }
    }, 250);
  }

  _editorModeLabel() {
    const key = this._yamlMode
      ? "ui.panel.lovelace.editor.edit_card.show_visual_editor"
      : "ui.panel.lovelace.editor.edit_card.show_code_editor";
    return (
      this._hass?.localize?.(key) ||
      (this._yamlMode ? "Show visual editor" : "Show code editor")
    );
  }

  _normaliseDraft(hub, config) {
    const normalized = {
      ...config,
      type: "custom:wiser-controls-card",
      hubs: [this._hubId(hub)],
      _panel_hide_title: true,
    };
    delete normalized.room_type;
    const Card = customElements.get("wiser-controls-card");
    return Card?.orderConfig?.(normalized) || normalized;
  }

  _syncColumnForm(form, config) {
    const mobile = this._mobileMedia?.matches;
    const key = mobile ? "mobile_device_columns" : "device_columns";
    form.schema = [{
      name: key,
      label: `Devices per row — ${mobile ? "mobile" : "desktop"}`,
      selector: {number: {min: 1, max: 6, step: 1, mode: "box"}},
    }];
    form.data = {[key]: config[key] ?? 1};
  }

  _createColumnForm(hub, preview) {
    const form = document.createElement("ha-form");
    form.className = "panel-columns";
    form.hass = this._hass;
    form.computeLabel = (schema) => schema.label;
    this._syncColumnForm(form, this._drafts[hub]);
    form.addEventListener("value-changed", (event) => {
      event.stopPropagation();
      const value = event.detail.value;
      const key = this._mobileMedia?.matches
        ? "mobile_device_columns"
        : "device_columns";
      this._drafts[hub] = this._normaliseDraft(hub, {
        ...this._drafts[hub],
        [key]: value[key] ?? 1,
      });
      this._schedulePreview(preview, this._drafts[hub]);
    });
    return form;
  }

  _closeFeatureEditor(entry) {
    if (entry.featureState?.yamlInvalid) {
      this.shadowRoot.getElementById("editor-error").textContent = "";
      this.shadowRoot.getElementById("save").disabled = this._yamlErrors.size > 0;
    }
    entry.featureState = undefined;
    entry.featureDetail.hidden = true;
    entry.featureDetail.replaceChildren();
    entry.columns.hidden = false;
    entry.editor.hidden = false;
  }

  _setFeatureEditorModeButton(button, showVisual) {
    const key = showVisual
      ? "ui.panel.lovelace.editor.edit_card.show_visual_editor"
      : "ui.panel.lovelace.editor.edit_card.show_code_editor";
    button.innerHTML = `<ha-icon icon="mdi:${showVisual ? "format-list-bulleted" : "code-braces"}"></ha-icon>`;
    button.label =
      this._hass?.localize?.(key) ||
      (showVisual ? "Show visual editor" : "Show code editor");
  }

  async _toggleFeatureEditorMode(entry) {
    const state = entry.featureState;
    if (!state) return;
    state.mode.disabled = true;
    try {
      if (state.code.hidden) {
        await this._loadYamlEditor();
        if (entry.featureState !== state) return;
        if (!state.yaml) {
          state.yaml = document.createElement("ha-yaml-editor");
          state.yaml.inDialog = true;
          state.yaml.addEventListener("value-changed", (event) => {
            event.stopPropagation();
            state.yamlInvalid = !event.detail.isValid;
            if (state.yamlInvalid) {
              this.shadowRoot.getElementById("editor-error").textContent =
                this._t("panel_feature_yaml_fix");
              this.shadowRoot.getElementById("save").disabled = true;
              return;
            }
            state.config = event.detail.value;
            state.featureEditor.setConfig(state.config);
            state.saveConfig(state.config);
            this.shadowRoot.getElementById("editor-error").textContent = "";
            this.shadowRoot.getElementById("save").disabled =
              this._yamlErrors.size > 0;
          });
          state.code.replaceChildren(state.yaml);
        }
        state.yaml.defaultValue = state.config;
        state.visual.hidden = true;
        state.code.hidden = false;
        this._setFeatureEditorModeButton(state.mode, true);
        state.yaml.focus?.();
      } else {
        state.code.hidden = true;
        state.visual.hidden = false;
        this._setFeatureEditorModeButton(state.mode, false);
      }
    } catch (error) {
      this.shadowRoot.getElementById("editor-error").textContent =
        this._t("panel_feature_yaml_load_error");
      console.error("Unable to load Home Assistant YAML editor", error);
    } finally {
      state.mode.disabled = false;
    }
  }

  async _openFeatureEditor(entry, event) {
    event.stopPropagation();
    const {config, context, saveConfig, type} = event.detail || {};
    if (type !== "feature" || !config?.type || typeof saveConfig !== "function") {
      return;
    }

    const featureTag = config.type.startsWith("custom:")
      ? config.type.slice(7)
      : `hui-${config.type}-card-feature`;
    const Feature = customElements.get(featureTag);
    const featureEditor = await Feature?.getConfigElement?.();
    if (!featureEditor) {
      this.shadowRoot.getElementById("editor-error").textContent =
        this._t("panel_feature_editor_error");
      return;
    }

    const header = document.createElement("div");
    const back = document.createElement("ha-icon-button");
    const title = document.createElement("h3");
    const mode = document.createElement("ha-icon-button");
    const visual = document.createElement("div");
    const code = document.createElement("div");
    header.className = "feature-detail-header";
    back.label = this._hass?.localize?.("ui.common.back") || "Back";
    back.innerHTML = '<ha-icon icon="mdi:chevron-left"></ha-icon>';
    title.textContent =
      this._hass?.localize?.(
        "ui.panel.lovelace.editor.sub-element-editor.types.feature",
      ) || "Feature";
    this._setFeatureEditorModeButton(mode, false);
    back.addEventListener("click", () => this._closeFeatureEditor(entry));
    mode.addEventListener("click", () => this._toggleFeatureEditorMode(entry));
    header.append(back, title, mode);

    featureEditor.hass = this._hass;
    featureEditor.context = context;
    featureEditor.setConfig(config);
    visual.className = "feature-visual";
    code.className = "feature-code";
    code.hidden = true;
    visual.append(featureEditor);
    entry.featureState = {
      config,
      saveConfig,
      featureEditor,
      visual,
      code,
      mode,
      yaml: undefined,
      yamlInvalid: false,
    };
    const state = entry.featureState;
    featureEditor.addEventListener("config-changed", (changeEvent) => {
      changeEvent.stopPropagation();
      state.config = changeEvent.detail.config;
      saveConfig(state.config);
    });

    entry.columns.hidden = true;
    entry.editor.hidden = true;
    entry.featureDetail.replaceChildren(header, visual, code);
    entry.featureDetail.hidden = false;
  }

  _yamlConfig(hub) {
    const {_panel_hide_title, ...config} = this._drafts[hub];
    const Card = customElements.get("wiser-controls-card");
    return Card?.orderConfig?.(config) || config;
  }

  async _loadYamlEditor() {
    if (customElements.get("ha-yaml-editor")) return;

    const resolver = document.createElement("partial-panel-resolver");
    const route = {
      component_name: "developer-tools",
      url_path: "wiser-yaml-editor",
    };
    const routes =
      resolver.getRoutes?.([route]) ||
      resolver._getRoutes?.({"wiser-yaml-editor": route});
    await routes?.routes?.["wiser-yaml-editor"]?.load?.();

    const router = document.createElement("developer-tools-router");
    await router.routerOptions?.routes?.service?.load?.();

    if (!customElements.get("ha-yaml-editor")) {
      throw new Error("Home Assistant YAML editor is unavailable");
    }
  }

  _createYamlEditor(entry) {
    const yaml = document.createElement("ha-yaml-editor");
    yaml.defaultValue = this._yamlConfig(entry.hub);
    yaml.inDialog = true;
    yaml.setAttribute("aria-label", this._t("panel_yaml_label", {hub:entry.hub}));
    yaml.addEventListener("value-changed", (event) => {
      event.stopPropagation();
      if (!event.detail.isValid) {
        this._yamlErrors.add(entry.hub);
        this.shadowRoot.getElementById("editor-error").textContent =
          this._t("panel_yaml_fix");
        this.shadowRoot.getElementById("save").disabled = true;
        return;
      }

      this._yamlErrors.delete(entry.hub);
      this._drafts[entry.hub] = this._normaliseDraft(
        entry.hub,
        event.detail.value,
      );
      this._schedulePreview(entry.preview, this._drafts[entry.hub]);
      if (!this._yamlErrors.size) {
        this.shadowRoot.getElementById("editor-error").textContent = "";
        this.shadowRoot.getElementById("save").disabled = false;
      }
    });
    return yaml;
  }

  async _toggleEditorMode() {
    const mode = this.shadowRoot.getElementById("editor-mode");
    mode.disabled = true;

    try {
      if (!this._yamlMode) {
        for (const entry of this._editorEntries) {
          this._closeFeatureEditor(entry);
        }
        await this._loadYamlEditor();
        for (const entry of this._editorEntries) {
          const yaml = this._createYamlEditor(entry);
          entry.yaml.replaceChildren(yaml);
          entry.visual.hidden = true;
          entry.yaml.hidden = false;
        }
        this._yamlMode = true;
        this._editorEntries[0]?.yaml.children[0]?.focus?.();
      } else {
        for (const entry of this._editorEntries) {
          entry.editor.setConfig({...this._drafts[entry.hub]});
          this._syncColumnForm(
            entry.columns,
            this._drafts[entry.hub],
          );
          entry.yaml.hidden = true;
          entry.visual.hidden = false;
        }
        this._yamlErrors.clear();
        this.shadowRoot.getElementById("editor-error").textContent = "";
        this.shadowRoot.getElementById("save").disabled = false;
        this._yamlMode = false;
      }
      mode.textContent = this._editorModeLabel();
    } catch (error) {
      this.shadowRoot.getElementById("editor-error").textContent =
        this._t("panel_yaml_load_error");
      console.error("Unable to load Home Assistant YAML editor", error);
    } finally {
      mode.disabled = false;
    }
  }

  async _openEditor() {
    const dialog = this.shadowRoot.getElementById("editor-dialog");
    if (dialog.open || !this._cards.length || !this._hass?.user?.is_admin) {
      return;
    }

    const container = this.shadowRoot.getElementById("editors");
    const errorMessage = this.shadowRoot.getElementById("editor-error");
    const save = this.shadowRoot.getElementById("save");
    const mode = this.shadowRoot.getElementById("editor-mode");

    this._drafts = {};
    this._editors = [];
    this._editorEntries = [];
    this._previews = [];
    this._yamlErrors.clear();
    this._yamlMode = false;
    errorMessage.textContent = "";
    container.replaceChildren();
    save.disabled = true;
    mode.disabled = true;
    mode.textContent = this._editorModeLabel();
    dialog.heading = this._t("panel_settings");

    const dialogPrototype = customElements.get("ha-dialog")?.prototype || {};
    if (!("headerTitle" in dialogPrototype)) {
      this.shadowRoot.getElementById("editor-actions").removeAttribute("slot");
    }
    dialog.open = true;

    try {
      if (!window.loadCardHelpers) {
        const resolver = document.createElement("partial-panel-resolver");
        const routes = resolver._getRoutes?.({
          lovelace: {
            component_name: "lovelace",
            url_path: "lovelace",
          },
        });
        await routes?.routes?.lovelace?.load?.();
      }

      const Card = customElements.get("wiser-controls-card");
      for (const hub of this._config.hubs) {
        const editor = await Card.getConfigElement();
        if (!dialog.open) {
          return;
        }

        const config = this._normaliseDraft(
          hub,
          this._storedCardConfig(hub),
        );
        this._drafts[hub] = config;
        editor.hideHubSelector = true;
        editor.hideTitle = true;
        editor.hideRoomColumns = true;
        editor.hass = this._hass;
        editor.setConfig({...config});

        const preview = document.createElement("wiser-controls-card");
        preview.className = "editor-preview";
        preview.hass = this._hass;
        preview.setAttribute("editor-preview", "");
        preview.setAttribute("aria-label", this._t("panel_preview_label", {hub}));
        preview.setConfig(this._effectiveCardConfig(config));

        const columns = this._createColumnForm(hub, preview);

        editor.addEventListener("config-changed", (event) => {
          event.stopPropagation();
          this._drafts[hub] = this._normaliseDraft(
            hub,
            {
              ...event.detail.config,
              device_columns: this._drafts[hub].device_columns ?? 1,
              mobile_device_columns:
                this._drafts[hub].mobile_device_columns ?? 1,
            },
          );
          this._schedulePreview(preview, this._drafts[hub]);
        });

        const section = document.createElement("section");
        const title = document.createElement("h3");
        const layout = document.createElement("div");
        const form = document.createElement("div");
        const visual = document.createElement("div");
        const yaml = document.createElement("div");
        const featureDetail = document.createElement("div");
        title.textContent = hub;
        layout.className = "editor-layout";
        form.className = "editor-form";
        visual.className = "visual-editor";
        yaml.className = "yaml-editor";
        featureDetail.className = "feature-detail";
        yaml.hidden = true;
        featureDetail.hidden = true;
        visual.append(columns, editor, featureDetail);
        form.append(visual);
        form.append(yaml);
        layout.replaceChildren(form, preview);
        section.replaceChildren(
          ...(this._config.hubs.length > 1 ? [title, layout] : [layout]),
        );
        container.append(section);
        this._editors.push(editor);
        const entry = {
          hub,
          editor,
          preview,
          columns,
          visual,
          yaml,
          featureDetail,
        };
        editor.addEventListener("edit-sub-element", (event) => {
          this._openFeatureEditor(entry, event);
        });
        this._editorEntries.push(entry);
        this._previews.push(preview);
      }

      save.disabled = false;
      mode.disabled = false;
    } catch (error) {
      errorMessage.textContent =
        this._t("panel_editor_error");
      console.error("Unable to open Wiser controls editor", error);
    }
  }

  async _saveEditor() {
    const save = this.shadowRoot.getElementById("save");
    save.disabled = true;

    try {
      await this._hass.callWS({
        type: "wiser/panel/configure",
        panel_id: this._config.panel_id,
        configs: this._drafts,
      });
      this._config = {
        ...this._config,
        card_configs: {
          ...this._config.card_configs,
          ...this._drafts,
        },
      };
      this._closeEditor();
      this._loadCards();
    } catch (error) {
      this.shadowRoot.getElementById("editor-error").textContent =
        this._t("panel_save_error");
      console.error("Unable to save Wiser controls panel settings", error);
    } finally {
      save.disabled = false;
    }
  }

  async _loadCards() {
    const generation = ++this._generation;
    const main = this.shadowRoot.querySelector("main");

    try {
      const Card = customElements.get("wiser-controls-card");
      if (Card?.panelApiVersion !== 1) {
        throw new Error(
          this._t("panel_version_error"),
        );
      }
      if (generation !== this._generation) {
        return;
      }

      const cards = this._config.hubs.map((hub) => {
        const card = document.createElement("wiser-controls-card");
        card.hass = this._hass;
        card.setConfig(this._cardConfig(hub));
        return card;
      });

      this._cards = cards;
      main.replaceChildren(...cards);
      this._renderHubTabs();
      this.shadowRoot.getElementById("settings").disabled = false;
    } catch (error) {
      if (generation !== this._generation) {
        return;
      }

      this._cards = [];
      this.shadowRoot.getElementById("hub-tabs").hidden = true;
      this.shadowRoot.getElementById("settings").disabled = true;

      const message = document.createElement("p");
      message.setAttribute("role", "alert");
      message.textContent = error.message || this._t("panel_load_error");

      const retry = document.createElement("ha-button");
      retry.textContent = this._t("panel_retry");
      retry.addEventListener("click", () => this._loadCards());

      main.replaceChildren(message, retry);
      console.error("Unable to load Wiser controls", error);
    }
  }
}

if (!customElements.get("wiser-controls-panel")) customElements.define("wiser-controls-panel", WiserRoomsPanel);
if (!customElements.get("wiser-rooms-panel")) customElements.define("wiser-rooms-panel", class extends WiserRoomsPanel {});
