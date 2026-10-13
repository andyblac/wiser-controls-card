/** Sidebar host for the Wiser controls card. */
const ACTIVE_HUB_STORAGE_PREFIX = "wiser-controls-panel:active-hub:";
const PANEL_DEVICE_TYPES = ["heating", "hot_water", "plugs", "lights", "shutters"];
const DEVICE_DETAIL_TABS = ["control", "states", "settings", "identification", "activity"];
const unbrandWiserName = value => {
  const name = String(value ?? "");
  const unbranded = name.replace(/^wiser\s+/i,"").trimStart();
  return unbranded || name;
};
const WISER_DEVICE_IMAGES = Object.freeze({
  Controller:"__WISER_DEVICE_IMAGE_CONTROLLER__",
  RoomStat:"__WISER_DEVICE_IMAGE_ROOMSTAT__",
  SmartPlug:"__WISER_DEVICE_IMAGE_SMARTPLUG__",
  TemperatureHumiditySensor:"__WISER_DEVICE_IMAGE_TEMPERATUREHUMIDITYSENSOR__",
  iTRV:"__WISER_DEVICE_IMAGE_ITRV__",
  UnderFloorHeating:"__WISER_DEVICE_IMAGE_UNDERFLOORHEATING__",
  HeatingActuator:"__WISER_DEVICE_IMAGE_HEATINGACTUATOR__",
  DimmableLight:"__WISER_DEVICE_IMAGE_DIMMABLELIGHT__",
  OnOffLight:"__WISER_DEVICE_IMAGE_ONOFFLIGHT__",
  Shutter:"__WISER_DEVICE_IMAGE_SHUTTER__",
  SmokeAlarmDevice:"__WISER_DEVICE_IMAGE_SMOKEALARMDEVICE__",
  WaterLeakageSensor:"__WISER_DEVICE_IMAGE_WATERLEAKAGESENSOR__",
  MotionLightSensor:"__WISER_DEVICE_IMAGE_MOTIONLIGHTSENSOR__",
  WindowDoorSensor:"__WISER_DEVICE_IMAGE_WINDOWDOORSENSOR__",
  CFMT:"__WISER_DEVICE_IMAGE_CFMT__",
  PowerTagE:"__WISER_DEVICE_IMAGE_POWERTAGE__",
  ButtonPanel:"__WISER_DEVICE_IMAGE_BUTTONPANEL__",
  BoilerInterface:"__WISER_DEVICE_IMAGE_BOILERINTERFACE__",
});
const WISER_DEVICE_IMAGE_MATCHERS = [
  ["RoomStat",/roomstat|roomthermostat/],
  ["SmartPlug",/smartplug|nhpbplug/],
  ["TemperatureHumiditySensor",/temperaturehumiditysensor|temphumiditysensor/],
  ["iTRV",/itrv|radiatorthermostat/],
  ["UnderFloorHeating",/underfloorheating|underfloorcontroller|ufh/],
  ["HeatingActuator",/heatingactuator|electricalheatswitch|ehs/],
  ["DimmableLight",/dimmablelight|dimmer/],
  ["OnOffLight",/onofflight|loadcontrol|powermicromodule/],
  ["Shutter",/shutter|shadecontrol/],
  ["SmokeAlarmDevice",/smokealarm/],
  ["WaterLeakageSensor",/waterleak|leakagesensor/],
  ["MotionLightSensor",/motionlightsensor|motionsensor/],
  ["WindowDoorSensor",/windowdoorsensor|doorwindowsensor/],
  ["CFMT",/cfmt/],
  ["PowerTagE",/powertage|powertag/],
  ["ButtonPanel",/buttonpanel/],
  ["BoilerInterface",/boilerinterface/],
  ["Controller",/controller|heathub|cctfr6311g2|wt714r1s0902/],
];
const activePanelHubs = new Map();
const activePanelViews = new Map();
const rememberedPanelHub = panelId => {
  if (!panelId) return undefined;
  try {
    return window.sessionStorage?.getItem(`${ACTIVE_HUB_STORAGE_PREFIX}${panelId}`)
      || activePanelHubs.get(panelId);
  } catch (_) {
    return activePanelHubs.get(panelId);
  }
};
const rememberPanelHub = (panelId, hub) => {
  if (!panelId || !hub) return;
  activePanelHubs.set(panelId, hub);
  try {
    window.sessionStorage?.setItem(`${ACTIVE_HUB_STORAGE_PREFIX}${panelId}`, hub);
  } catch (_) {}
};

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
        #device-tabs[hidden],
        #detail-tabs[hidden],
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

        #device-tabs,
        #detail-tabs {
          display: flex;
          flex-shrink: 0;
          min-width: 0;
          margin: 12px 28px 0;
          overflow-x: auto;
          border-bottom: 1px solid var(--divider-color);
        }

        #detail-tabs {
          width: calc(100% - 32px);
          box-sizing: border-box;
          margin: 16px auto 0;
          overflow: hidden;
          border: 1px solid var(--divider-color);
          border-radius: var(--ha-card-border-radius,12px) var(--ha-card-border-radius,12px) 0 0;
          background: var(--card-background-color);
        }

        .device-tab {
          flex: 0 0 auto;
          min-height: 44px;
          padding: 0 16px;
          border: 0;
          border-bottom: 3px solid transparent;
          color: var(--secondary-text-color);
          font: inherit;
          font-size: 17px;
          background: transparent;
          cursor: pointer;
          white-space: nowrap;
        }

        .device-tab[aria-selected="true"] {
          color: var(--primary-color);
          border-bottom-color: currentColor;
        }

        .device-tab:focus-visible {
          outline: 2px solid var(--primary-color);
          outline-offset: -4px;
        }

        .detail-tab {
          flex: 1 1 0;
          min-width: 120px;
          min-height: 44px;
          padding: 0 16px;
          border: 0;
          border-bottom: 3px solid transparent;
          color: var(--secondary-text-color);
          font: inherit;
          background: transparent;
          cursor: pointer;
          white-space: nowrap;
        }

        .detail-tab[aria-selected="true"] {
          color: var(--primary-color);
          border-bottom-color: currentColor;
        }

        #detail-back {
          display: grid;
          flex: 0 0 auto;
          place-items: center;
          width: 40px;
          height: 40px;
          padding: 0;
          border: 0;
          border-radius: 50%;
          color: var(--primary-text-color);
          background: transparent;
          cursor: pointer;
        }

        #detail-back[hidden] {
          display: none;
        }

        #device-detail {
          display: block;
          flex: 0 0 auto;
          width: calc(100% - 32px);
          min-height: 420px;
          margin: 0 auto 24px;
          padding: 0;
          gap: 16px;
          overflow: hidden;
          border: 1px solid var(--divider-color);
          border-top: 0;
          border-radius: 0 0 var(--ha-card-border-radius,12px) var(--ha-card-border-radius,12px);
          background: var(--card-background-color);
        }

        .detail-columns {
          display: grid;
          grid-template-columns: repeat(2,minmax(0,1fr));
          min-height: 420px;
          align-items: stretch;
        }

        .detail-columns.three-column {
          grid-template-columns: repeat(3,minmax(0,1fr));
        }

        .detail-column {
          display: grid;
          align-content: start;
          gap: 8px;
          min-width: 0;
          overflow: hidden;
          padding: 12px 16px;
          border-inline-start: 1px solid var(--divider-color);
          --paper-item-min-height: 40px;
          --mdc-list-item-one-line-height: 40px;
        }

        .detail-column:first-child {
          border-inline-start: 0;
        }

        .detail-column > h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 500;
        }

        .detail-column > * {
          min-width: 0;
          max-width: 100%;
          box-sizing: border-box;
        }

        .detail-summary {
          display: grid;
          min-height: 260px;
          grid-template-rows: auto auto minmax(140px,1fr);
          align-items: start;
          gap: 8px;
          padding: 16px;
          text-align: start;
        }

        .detail-summary ha-state-icon {
          align-self: center;
          justify-self: center;
          --mdc-icon-size: 88px;
          color: var(--state-icon-color,var(--primary-color));
          padding: 56px;
          border-radius: 50% 50% 0 0;
          background: color-mix(in srgb,currentColor 18%,transparent);
        }

        .detail-summary .detail-device-image {
          align-self: center;
          justify-self: center;
          display: block;
          width: min(78%,320px);
          max-height: 300px;
          object-fit: contain;
          border-radius: 24px;
        }

        .detail-summary h3,
        .detail-summary p {
          margin: 0;
        }

        .detail-summary h3 {
          color: var(--primary-color);
          font-size: 24px;
        }

        .detail-summary p {
          color: var(--secondary-text-color);
        }

        .detail-activity {
          width: 100%;
        }

        .detail-identification {
          display: grid;
          grid-template-columns: repeat(2,minmax(0,1fr));
          min-height: 420px;
        }

        .detail-identification > section {
          padding: 12px 16px;
        }

        .detail-identification > section + section {
          border-inline-start: 1px solid var(--divider-color);
        }

        .detail-identification-section h3 {
          margin: 0 0 8px;
          font-size: 18px;
          font-weight: 500;
        }

        .detail-identification-list {
          display: grid;
          margin: 0;
          overflow: hidden;
          border: 1px solid var(--divider-color);
          border-radius: var(--ha-card-border-radius,12px);
          background: var(--card-background-color);
        }

        .detail-identification-row {
          display: grid;
          grid-template-columns: 24px minmax(0,1fr) auto;
          gap: 12px;
          align-items: center;
          min-height: 44px;
          box-sizing: border-box;
          padding: 4px 14px;
          border-bottom: 1px solid var(--divider-color);
        }

        .detail-identification-row:last-child {
          border-bottom: 0;
        }

        .detail-identification-row ha-icon {
          --mdc-icon-size: 20px;
          color: var(--primary-color);
        }

        .detail-identification-row dt {
          min-width: 0;
          color: var(--primary-text-color);
          font-size: 14px;
        }

        .detail-identification-row dd {
          margin: 0;
          color: var(--secondary-text-color);
          text-align: end;
          overflow-wrap: anywhere;
        }

        .detail-id-list {
          display: grid;
          gap: 6px;
        }

        .detail-device-heading {
          margin: 8px 0 0;
          color: var(--primary-text-color);
          font-size: 14px;
          font-weight: 500;
        }

        .detail-device-heading:first-child {
          margin-top: 0;
        }

        .detail-id-card {
          display: grid;
          grid-template-columns: 28px minmax(0,1fr);
          gap: 12px;
          align-items: center;
          min-height: 40px;
          box-sizing: border-box;
          padding: 6px 12px;
          border: 1px solid var(--divider-color);
          border-radius: var(--ha-card-border-radius,12px);
          background: var(--card-background-color);
        }

        .detail-id-card ha-icon {
          color: var(--primary-color);
        }

        .detail-id-card.signal ha-icon {
          color: var(--success-color,var(--state-sensor-on-color,var(--primary-color)));
        }

        .detail-id-card strong,
        .detail-id-card small {
          display: block;
          overflow-wrap: anywhere;
        }

        .detail-id-card strong {
          font-size: 14px;
        }

        .detail-id-card small {
          margin-top: 2px;
          color: var(--secondary-text-color);
          font-size: 12px;
        }

        .detail-empty {
          color: var(--secondary-text-color);
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

        main[hidden],
        #view-header[hidden] {
          display: none;
        }

        #view-header {
          display: flex;
          flex-shrink: 0;
          align-items: center;
          gap: 16px;
          padding: 24px 28px 0;
        }

        #view-title {
          margin: 0;
          font-size: 24px;
          font-weight: 500;
        }

        #view-navigation {
          display: inline-flex;
          gap: 6px;
          margin-inline-start: auto;
        }

        .view-button {
          display: grid;
          place-items: center;
          width: 44px;
          height: 44px;
          padding: 0;
          border: 1px solid transparent;
          border-radius: 10px;
          color: var(--secondary-text-color);
          background: transparent;
          cursor: pointer;
        }

        .view-button[aria-pressed="true"] {
          color: var(--primary-color);
          border-color: var(--secondary-text-color);
          background: var(--secondary-background-color);
        }

        .view-button:hover {
          background: var(--secondary-background-color);
        }

        .view-button:focus-visible {
          outline: 2px solid var(--primary-color);
          outline-offset: 2px;
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

        #editors > section[hidden],
        .editor-hub-tabs[hidden] {
          display: none;
        }

        .editor-hub-tabs {
          display: flex;
          min-width: 0;
          margin: 0 0 16px;
          overflow-x: auto;
          border-bottom: 1px solid var(--divider-color);
        }

        .editor-hub-tab {
          flex: 0 0 auto;
          min-height: 44px;
          padding: 0 16px;
          border: 0;
          border-bottom: 3px solid transparent;
          color: var(--secondary-text-color);
          font: inherit;
          background: transparent;
          cursor: pointer;
          white-space: nowrap;
        }

        .editor-hub-tab[aria-selected="true"] {
          color: var(--primary-color);
          border-bottom-color: currentColor;
        }

        .editor-hub-tab:focus-visible {
          outline: 2px solid var(--primary-color);
          outline-offset: -4px;
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

        .panel-default-view {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 16px;
        }

        .panel-default-view > span {
          flex: 1;
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

          #view-header {
            padding: 16px 16px 0;
          }

          #view-title {
            font-size: 20px;
          }

          #device-tabs {
            margin-inline: 16px;
          }

          .detail-columns {
            grid-template-columns: minmax(0,1fr);
          }

          .detail-columns.three-column {
            grid-template-columns: minmax(0,1fr);
          }

          #detail-tabs,
          #device-detail {
            width: calc(100% - 16px);
          }

          .detail-columns,
          .detail-identification {
            grid-template-columns: minmax(0,1fr);
          }

          .detail-column,
          .detail-identification > section + section {
            border-inline-start: 0;
          }

          .detail-column + .detail-column,
          .detail-identification > section + section {
            border-top: 1px solid var(--divider-color);
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
      <section id="view-header">
        <button id="detail-back" type="button" hidden aria-label="Back to devices">
          <ha-icon icon="mdi:arrow-left"></ha-icon>
        </button>
        <h2 id="view-title">Overview</h2>
        <nav id="view-navigation" aria-label="Controls view">
          <button class="view-button" type="button" data-view="overview" aria-pressed="true">
            <ha-icon icon="mdi:view-dashboard-outline"></ha-icon>
          </button>
          <button class="view-button" type="button" data-view="devices" aria-pressed="false">
            <ha-icon icon="mdi:devices"></ha-icon>
          </button>
        </nav>
      </section>
      <nav id="device-tabs" role="tablist" aria-label="Device types" hidden></nav>
      <nav id="detail-tabs" role="tablist" aria-label="Device details" hidden></nav>
      <main id="overview-view">
        <p id="loading" role="status">Loading Wiser controls…</p>
      </main>
      <main id="devices-view" hidden></main>
      <main id="device-detail" hidden></main>
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
      .getElementById("detail-back")
      .addEventListener("click", () => this._closeDeviceDetail());
    const openDeviceDetail = (event) => {
      const entityId = event.detail?.entityId;
      if (!this._isDeviceEntity(entityId)) return;
      event.preventDefault?.();
      event.stopPropagation?.();
      this._openDeviceDetail(entityId);
    };
    this.shadowRoot.getElementById("devices-view").addEventListener("hass-more-info", openDeviceDetail);
    this.shadowRoot
      .getElementById("editor-dialog")
      .addEventListener("closed", () => this._closeEditor());
    this.shadowRoot
      .getElementById("editor-dialog")
      .addEventListener("close-dialog", () => this._closeEditor());
    for (const button of this.shadowRoot.querySelectorAll?.(".view-button") || []) {
      button.addEventListener("click", () => this._selectView(button.dataset.view));
    }

    this._cards = [];
    this._editors = [];
    this._editorEntries = [];
    this._previews = [];
    this._yamlErrors = new Set();
    this._yamlMode = false;
    this._generation = 0;
    this._activeView = "overview";
    this._activeDeviceType = "heating";
    this._panelId = undefined;
    this._mobileMedia = window.matchMedia?.("(max-width: 600px)");
    this._handleMobileMediaChange = () => {
      this._refreshResponsiveColumns();
    };
  }

  _t(key, values = {}) {
    return window.WiserRoomsLocalize.localize(this._hass, key, values);
  }

  _editorHeading() {
    const hubs = this._config?.hubs || [];
    const hub = hubs.includes(this._activeHub) ? this._activeHub : hubs[0];
    return hub
      ? this._t("panel_settings_for_hub", {hub})
      : this._t("panel_settings");
  }

  _updateEditorHeading() {
    const dialog = this.shadowRoot.getElementById("editor-dialog");
    const title = this._editorHeading();
    dialog.setAttribute("header-title", title);
    dialog.headerTitle = title;
    dialog.heading = title;
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
    const loading = root.getElementById("loading");
    if (loading) loading.textContent = this._t("panel_loading");
    root.getElementById("cancel").textContent = this._t("panel_cancel");
    root.getElementById("save").textContent = this._t("panel_save");
    root.getElementById("editor-mode").textContent = this._editorModeLabel();
    root.getElementById("view-navigation").setAttribute("aria-label", this._t("panel_view"));
    root.getElementById("device-tabs").setAttribute("aria-label", this._t("panel_device_types"));
    root.getElementById("detail-tabs").setAttribute("aria-label", this._t("panel_device_details"));
    const back = root.getElementById("detail-back");
    back.setAttribute("aria-label", this._t("panel_back_to_devices"));
    back.title = this._t("panel_back_to_devices");
    for (const button of root.querySelectorAll?.(".view-button") || []) {
      const label = this._t(`panel_${button.dataset.view}`);
      button.setAttribute("aria-label", label);
      button.title = label;
    }
    this._syncView();
    this._renderDeviceTabs();
    this._updateEditorHeading();
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
      const cards = this._detailEntity ? this._detailCards
        : this._activeView === "devices" ? this._deviceCards : this._cards;
      for (const card of cards || []) {
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

    this.shadowRoot.getElementById("settings").hidden = Boolean(this._detailEntity) || !hass?.user?.is_admin;
  }

  set panel(panel) {
    const config = panel.config;
    if (JSON.stringify(config) === JSON.stringify(this._config)) {
      return;
    }

    this._config = config;
    if (!config.hubs.includes(this._activeHub)) {
      const rememberedHub = rememberedPanelHub(config.panel_id);
      this._activeHub = config.hubs.includes(rememberedHub)
        ? rememberedHub
        : undefined;
    }
    if (this._panelId !== config.panel_id) {
      this._panelId = config.panel_id;
      const hub = this._activeHub || config.hubs[0];
      const remembered = activePanelViews.get(config.panel_id);
      this._activeView = remembered?.view === "devices" || remembered?.view === "overview"
        ? remembered.view
        : this._defaultView(hub);
      this._activeDeviceType = PANEL_DEVICE_TYPES.includes(remembered?.deviceType)
        ? remembered.deviceType
        : "heating";
    }
    this._syncView();
    this._loadCards();
  }

  _defaultView(hub) {
    return this._config?.card_configs?.[hub]?.default_view === "devices"
      ? "devices"
      : "overview";
  }

  _selectView(view) {
    if (view !== "overview" && view !== "devices") return;
    this._detailEntity = undefined;
    this._detailCards = [];
    this._activeView = view;
    activePanelViews.set(this._panelId, {view, deviceType: this._activeDeviceType});
    this._syncView();
    const cards = view === "devices" ? this._deviceCards : this._cards;
    for (const card of cards || []) if (!card.hidden) card.hass = this._hass;
  }

  _selectDeviceType(type, focus = false) {
    if (!PANEL_DEVICE_TYPES.includes(type)) return;
    this._detailEntity = undefined;
    this._detailCards = [];
    this._activeDeviceType = type;
    activePanelViews.set(this._panelId, {view: this._activeView, deviceType: type});
    this._deviceCards?.forEach((card, index) => {
      const hub = this._config?.hubs?.[index];
      if (!hub) return;
      card.setConfig(this._deviceCardConfig(hub, type));
      if (this._activeView === "devices" && hub === this._activeHub) card.hass = this._hass;
    });
    this._renderDeviceTabs(focus);
  }

  _renderDeviceTabs(focus = false) {
    const container = this.shadowRoot?.getElementById("device-tabs");
    if (!container) return;
    if (!this._deviceTabs || this._deviceTabs.length !== PANEL_DEVICE_TYPES.length) {
      this._deviceTabs = PANEL_DEVICE_TYPES.map((type) => {
        const tab = document.createElement("button");
        tab.type = "button";
        tab.className = "device-tab";
        tab.dataset.deviceType = type;
        tab.setAttribute("role", "tab");
        tab.addEventListener("click", () => this._selectDeviceType(type));
        tab.addEventListener("keydown", (event) => {
          let index = PANEL_DEVICE_TYPES.indexOf(type);
          if (event.key === "ArrowRight") index = (index + 1) % PANEL_DEVICE_TYPES.length;
          else if (event.key === "ArrowLeft") index = (index + PANEL_DEVICE_TYPES.length - 1) % PANEL_DEVICE_TYPES.length;
          else if (event.key === "Home") index = 0;
          else if (event.key === "End") index = PANEL_DEVICE_TYPES.length - 1;
          else return;
          event.preventDefault();
          this._selectDeviceType(PANEL_DEVICE_TYPES[index], true);
        });
        return tab;
      });
      container.replaceChildren(...this._deviceTabs);
    }
    for (const tab of this._deviceTabs) {
      const type = tab.dataset.deviceType;
      const selected = type === this._activeDeviceType;
      tab.textContent = this._t(type);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    if (focus) this._deviceTabs[PANEL_DEVICE_TYPES.indexOf(this._activeDeviceType)]?.focus?.();
  }

  _syncView() {
    if (!this.shadowRoot) return;
    const view = this._activeView === "devices" ? "devices" : "overview";
    const title = this.shadowRoot.getElementById("view-title");
    if (title) title.textContent = this._detailEntity
      ? this._detailRoomTitle || this._roomName(this._detailEntity)
      : this._t(`panel_${view}`);
    const overview = this.shadowRoot.getElementById("overview-view");
    const devices = this.shadowRoot.getElementById("devices-view");
    const detail = this.shadowRoot.getElementById("device-detail");
    const deviceTabs = this.shadowRoot.getElementById("device-tabs");
    const detailTabs = this.shadowRoot.getElementById("detail-tabs");
    const navigation = this.shadowRoot.getElementById("view-navigation");
    const back = this.shadowRoot.getElementById("detail-back");
    if (overview) overview.hidden = Boolean(this._detailEntity) || view !== "overview";
    if (devices) devices.hidden = Boolean(this._detailEntity) || view !== "devices";
    if (detail) detail.hidden = !this._detailEntity;
    if (deviceTabs) deviceTabs.hidden = Boolean(this._detailEntity) || view !== "devices";
    if (detailTabs) detailTabs.hidden = !this._detailEntity;
    if (navigation) navigation.hidden = Boolean(this._detailEntity);
    if (back) back.hidden = !this._detailEntity;
    this.shadowRoot.getElementById("settings").hidden = Boolean(this._detailEntity) || !this._hass?.user?.is_admin;
    for (const button of this.shadowRoot.querySelectorAll?.(".view-button") || []) {
      button.setAttribute("aria-pressed", String(button.dataset.view === view));
    }
  }

  _entityName(entityId) {
    const state = this._hass?.states?.[entityId];
    const name = state
      ? state.attributes?.name || this._hass?.formatEntityName?.(state) || state.attributes?.friendly_name || entityId
      : entityId;
    return unbrandWiserName(name);
  }

  _roomName(entityId) {
    const state = this._hass?.states?.[entityId];
    return unbrandWiserName(state?.attributes?.room || state?.attributes?.name || this._entityName(entityId));
  }

  _isDeviceEntity(entityId) {
    return Boolean(this._hass?.states?.[entityId])
      && ["climate","cover","light","switch","water_heater"].includes(entityId.split(".")[0]);
  }

  async _registryEntries() {
    const local = Object.entries(this._hass?.entities || {}).map(([entity_id, entry]) => ({entity_id,...entry}));
    if (local.length) return local;
    if (!this._registryEntriesPromise) {
      this._registryEntriesPromise = this._hass.callWS({type:"config/entity_registry/list"})
        .catch(() => []);
    }
    return this._registryEntriesPromise;
  }

  async _deviceContext(entityId) {
    const entries = await this._registryEntries();
    const selected = entries.find(entry => entry.entity_id === entityId);
    if (!selected) return {selected:undefined,device:undefined,deviceEntries:[],roomEntries:[]};
    const device = await this._deviceRegistryEntry(selected.device_id);
    const areaId = selected.area_id || device?.area_id;
    const devices = new Map(Object.entries(this._hass?.devices || {})
      .map(([id,value]) => [id,{id,...value}]));
    if (device?.id && !devices.has(device.id)) devices.set(device.id,device);
    if (areaId) {
      const registryDevices = await this._deviceRegistryEntries();
      for (const candidate of registryDevices) devices.set(candidate.id,candidate);
    }
    const selectedConfigEntries = new Set([
      selected.config_entry_id,
      ...(device?.config_entries || []),
    ].filter(Boolean));
    const sameIntegration = entry => {
      if (selected.platform && entry.platform && entry.platform !== selected.platform) return false;
      const candidateDevice = devices.get(entry.device_id);
      const candidateConfigEntries = new Set([
        entry.config_entry_id,
        ...(candidateDevice?.config_entries || []),
      ].filter(Boolean));
      if (selectedConfigEntries.size && candidateConfigEntries.size) {
        return [...candidateConfigEntries].some(id => selectedConfigEntries.has(id));
      }
      if (selected.platform && entry.platform) return true;
      return entry.device_id === selected.device_id;
    };
    const usable = entry => this._hass.states?.[entry.entity_id]
      && !entry.hidden_by
      && sameIntegration(entry);
    const deviceEntries = entries.filter(entry => entry.device_id === selected.device_id && usable(entry));
    const roomEntries = areaId
      ? entries.filter(entry => usable(entry)
        && (entry.area_id || devices.get(entry.device_id)?.area_id) === areaId)
      : deviceEntries;
    return {selected,device,devices,areaId,deviceEntries,roomEntries};
  }

  _renderDetailTabs(focus = false) {
    const container = this.shadowRoot.getElementById("detail-tabs");
    if (!this._detailTabs) {
      this._detailTabs = DEVICE_DETAIL_TABS.map(tabName => {
        const tab = document.createElement("button");
        tab.type = "button";
        tab.className = "detail-tab";
        tab.dataset.detailTab = tabName;
        tab.setAttribute("role", "tab");
        tab.addEventListener("click", () => this._selectDetailTab(tabName));
        tab.addEventListener("keydown", event => {
          let index = DEVICE_DETAIL_TABS.indexOf(tabName);
          if (event.key === "ArrowRight") index = (index + 1) % DEVICE_DETAIL_TABS.length;
          else if (event.key === "ArrowLeft") index = (index + DEVICE_DETAIL_TABS.length - 1) % DEVICE_DETAIL_TABS.length;
          else if (event.key === "Home") index = 0;
          else if (event.key === "End") index = DEVICE_DETAIL_TABS.length - 1;
          else return;
          event.preventDefault();
          this._selectDetailTab(DEVICE_DETAIL_TABS[index], true);
        });
        return tab;
      });
      container.replaceChildren(...this._detailTabs);
    }
    for (const tab of this._detailTabs) {
      const name = tab.dataset.detailTab;
      const selected = name === this._activeDetailTab;
      tab.textContent = name === "control"
        ? this._t(this._detailDeviceTabLabel(this._detailEntity))
        : this._t(`panel_detail_${name}`);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    if (focus) this._detailTabs[DEVICE_DETAIL_TABS.indexOf(this._activeDetailTab)]?.focus?.();
  }

  async _openDeviceDetail(entityId) {
    if (!this._hass?.states?.[entityId]) return;
    this._detailEntity = entityId;
    this._detailRoomTitle = this._roomName(entityId);
    this._activeDetailTab = "control";
    this._syncView();
    this._renderDetailTabs();
    await this._renderDeviceDetail();
  }

  _closeDeviceDetail() {
    this._detailGeneration = (this._detailGeneration || 0) + 1;
    this._detailEntity = undefined;
    this._detailRoomTitle = undefined;
    this._detailCards = [];
    this.shadowRoot.getElementById("device-detail").replaceChildren();
    this._syncView();
    const cards = this._activeView === "devices" ? this._deviceCards : this._cards;
    for (const card of cards || []) if (!card.hidden) card.hass = this._hass;
  }

  async _selectDetailTab(tabName, focus = false) {
    if (!DEVICE_DETAIL_TABS.includes(tabName) || !this._detailEntity) return;
    this._activeDetailTab = tabName;
    this._renderDetailTabs(focus);
    await this._renderDeviceDetail();
  }

  _detailDeviceType(entityId) {
    return {
      climate:"heating",
      water_heater:"hot_water",
      switch:"plugs",
      light:"lights",
      cover:"shutters",
    }[entityId?.split(".")[0]] || this._activeDeviceType;
  }

  _detailDeviceTabLabel(entityId) {
    return {
      climate:"panel_detail_heating",
      water_heater:"panel_detail_hot_water",
      switch:"panel_detail_appliance",
      light:"panel_detail_light",
      cover:"panel_detail_shutter",
    }[entityId?.split(".")[0]] || this._detailDeviceType(entityId);
  }

  async _nativeCard(config) {
    const helpers = await window.loadCardHelpers();
    if (typeof helpers?.createCardElement !== "function") return undefined;
    const card = helpers.createCardElement(config);
    card.hass = this._hass;
    return card;
  }

  _isClimateDevice(device) {
    return new Set(["room","controller","roomstat","temperaturehumiditysensor","itrv","underfloorheating","heatingactuator","cfmt","boilerinterface"])
      .has(String(device?.model || "").toLowerCase());
  }

  _climateRoomContext(context) {
    if (this._detailEntity?.split(".")[0] !== "climate") return undefined;
    const entries = context.roomEntries.filter(entry => this._isClimateDevice(context.devices?.get(entry.device_id)));
    const deviceIds = [...new Set(entries.map(entry => entry.device_id))];
    const devices = deviceIds.map(id => context.devices?.get(id)).filter(Boolean);
    const physicalDevices = devices.filter(device => !["room","controller"].includes(String(device.model || "").toLowerCase()));
    const signalStates = new Map();
    for (const entry of entries) {
      const state = this._hass.states?.[entry.entity_id];
      if (state?.attributes?.zigbee_channel !== undefined
        || state?.attributes?.displayed_signal_strength !== undefined) {
        signalStates.set(entry.device_id,state);
      }
    }
    return {entries,devices,physicalDevices,signalStates};
  }

  _climateProductDevice(climate) {
    const priority = ["roomstat","temperaturehumiditysensor","itrv","cfmt","underfloorheating","heatingactuator","boilerinterface"];
    return [...(climate?.physicalDevices || [])].sort((left,right) => {
      const leftIndex = priority.indexOf(String(left?.model || "").toLowerCase());
      const rightIndex = priority.indexOf(String(right?.model || "").toLowerCase());
      return (leftIndex < 0 ? priority.length : leftIndex) - (rightIndex < 0 ? priority.length : rightIndex);
    })[0];
  }

  _deviceSectionHeading(device) {
    const heading = document.createElement("h4");
    heading.className = "detail-device-heading";
    heading.textContent = unbrandWiserName(device?.name_by_user || device?.name || device?.model);
    return heading;
  }

  _entityNameWithoutDevice(entityId, device) {
    const entityName = this._entityName(entityId);
    const state = this._hass.states?.[entityId];
    const deviceNames = [
      device?.name_by_user,
      device?.name,
      device?.model,
      state?.attributes?.product_type,
      state?.attributes?.product_model,
    ]
      .map(unbrandWiserName)
      .filter(Boolean)
      .sort((left,right) => right.length - left.length);
    const prefix = deviceNames.find(name => entityName.length > name.length
      && entityName.slice(0,name.length).toLocaleLowerCase() === name.toLocaleLowerCase()
      && /^\s+/.test(entityName.slice(name.length)));
    if (!prefix) return entityName;
    const shortName = entityName.slice(prefix.length).trimStart();
    return `${shortName.charAt(0).toLocaleUpperCase()}${shortName.slice(1)}`;
  }

  _emptyDetail() {
    const empty = document.createElement("p");
    empty.className = "detail-empty";
    empty.textContent = this._t("panel_detail_empty");
    return empty;
  }

  _detailColumn(titleKey, ...children) {
    const column = document.createElement("section");
    column.className = "detail-column";
    if (titleKey) {
      const heading = document.createElement("h3");
      heading.textContent = this._t(titleKey);
      column.append(heading);
    }
    column.append(...children.filter(Boolean));
    return column;
  }

  _detailProductImage(state, device) {
    const configuredPicture = state?.attributes?.entity_picture
      || device?.image_url
      || device?.entity_picture;
    if (configuredPicture) return configuredPicture;
    const products = [
      state?.attributes?.product_type,
      state?.attributes?.product_model,
      state?.attributes?.product_identifier,
      device?.model,
      device?.name,
    ].filter(Boolean).map(value => String(value).toLowerCase().replaceAll(/[^a-z0-9]/g,""));
    const match = WISER_DEVICE_IMAGE_MATCHERS.find(([,matcher]) => products.some(product => matcher.test(product)));
    return match ? WISER_DEVICE_IMAGES[match[0]] : undefined;
  }

  _detailSummary(entityId, device) {
    const state = this._hass.states[entityId];
    const summary = document.createElement("section");
    summary.className = "detail-summary";
    const icon = document.createElement("ha-state-icon");
    icon.hass = this._hass;
    icon.stateObj = state;
    const name = document.createElement("h3");
    name.textContent = this._roomName(entityId);
    const status = document.createElement("p");
    status.textContent = this._hass.formatEntityState?.(state) || state.state;
    const imageSource = this._detailProductImage(state,device);
    if (imageSource) {
      const image = document.createElement("img");
      image.className = "detail-device-image";
      image.alt = device?.model || name.textContent;
      image.src = imageSource;
      icon.hidden = true;
      image.addEventListener("error",() => {
        image.hidden = true;
        icon.hidden = false;
      });
      summary.append(name,status,image,icon);
    } else {
      summary.append(name,status,icon);
    }
    return summary;
  }

  _detailAttributeRows(attributes, keys) {
    return keys
      .filter(key => attributes[key] !== undefined && attributes[key] !== null && attributes[key] !== "")
      .map(key => [key,this._attributeLabel(key),this._attributeValue(attributes[key])]);
  }

  _availableAttributeKeys(attributes, predicate) {
    return Object.keys(attributes).filter(key => ![
      "friendly_name","icon","entity_picture","unit_of_measurement","device_class","state_class",
      "supported_features","hvac_modes","hvac_action","preset_modes","preset_mode","fan_modes","fan_mode",
      "swing_modes","swing_mode","min_temp","max_temp","target_temp_step","current_temperature","temperature",
      "target_temp_high","target_temp_low","current_position","current_cover_position","current_tilt_position",
      "brightness","color_mode","supported_color_modes","effect_list","effect",
    ].includes(key) && predicate(key));
  }

  _scheduleAttributeKeys(attributes) {
    return this._availableAttributeKeys(attributes,key => key === "schedule_id"
      || key === "schedule_name"
      || key === "next_day_change"
      || key.startsWith("next_schedule_")
      || key.startsWith("current_schedule_"));
  }

  _positionAttributeKeys(attributes) {
    return this._availableAttributeKeys(attributes,key => /(position|lift|tilt|brightness)/.test(key)
      && !/(supported|time|angle|summer_comfort)/.test(key));
  }

  _seasonalComfortAttributeKeys(attributes) {
    return this._availableAttributeKeys(attributes,key => /(seasonal|summer_comfort|comfort_position|facade|covering_type|thermostat|derogation)/.test(key));
  }

  _stateAttributeKeys(attributes) {
    return this._availableAttributeKeys(attributes,key => /^(is_|current_state$|target_state$|window_state$|control_output_state$|output_state$|manual_state$|scheduled_state$|control_source$|heating_rate$|demand_type$|percentage_demand$|boost_|comfort_mode_score$|displayed_setpoint$|floor_sensor_state$|occupancy$|lift_movement$|tilt_movement$)/.test(key)
      && !/(supported|schedule)/.test(key));
  }

  _statusEntryGroupKey(entry) {
    const state = this._hass.states?.[entry.entity_id];
    const explicit = state?.attributes?.device_class || entry.device_class || entry.original_device_class;
    if (explicit) return String(explicit).toLowerCase();
    const text = `${entry.entity_id} ${state?.attributes?.friendly_name || ""}`.toLowerCase();
    return ["battery","temperature","humidity","demand","signal","window","valve","firmware"]
      .find(type => text.includes(type)) || entry.entity_id;
  }

  _isPowerEntry(entry) {
    const state = this._hass.states?.[entry.entity_id];
    const deviceClass = String(state?.attributes?.device_class || entry.device_class || entry.original_device_class || "").toLowerCase();
    return ["power","energy","current","voltage","power_factor","frequency"].includes(deviceClass)
      || /(^|_)(power|energy|current|voltage|power_factor|frequency)($|_)/.test(entry.entity_id.toLowerCase());
  }

  _statusEntryGroups(entries) {
    const keyed = new Map();
    for (const entry of entries) {
      const key = this._statusEntryGroupKey(entry);
      if (!keyed.has(key)) keyed.set(key,[]);
      keyed.get(key).push(entry);
    }
    const repeated = new Set([...keyed].filter(([,items]) => items.length > 1).map(([key]) => key));
    const groups = [];
    let singles;
    for (const entry of entries) {
      const key = this._statusEntryGroupKey(entry);
      if (repeated.has(key)) {
        if (!groups.some(group => group.key === key)) groups.push({key,entries:keyed.get(key)});
      } else {
        if (!singles) {
          singles = {key:"other",entries:[]};
          groups.push(singles);
        }
        singles.entries.push(entry);
      }
    }
    return groups.map(group => group.entries);
  }

  async _detailEntityCards(groups) {
    return (await Promise.all(groups.map(group => this._nativeCard({
      type:"entities",
      entities:group.map(entry => ({entity:entry.entity_id,name:this._entityName(entry.entity_id)})),
    })))).filter(Boolean);
  }

  async _detailDeviceEntitySections(entries, devices) {
    const groups = new Map();
    for (const entry of entries) {
      const key = entry.device_id || entry.entity_id;
      if (!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(entry);
    }
    const content = [];
    const cards = [];
    for (const [deviceId,group] of groups) {
      const device = devices?.get?.(deviceId) || devices?.[deviceId];
      const card = await this._nativeCard({
        type:"entities",
        entities:group.map(entry => ({
          entity:entry.entity_id,
          name:this._entityNameWithoutDevice(entry.entity_id,device),
        })),
      });
      if (!card) continue;
      if (device) content.push(this._deviceSectionHeading(device));
      content.push(card);
      cards.push(card);
    }
    return {content,cards};
  }

  _parameterAttributeKeys(attributes) {
    const excluded = new Set([
      ...this._scheduleAttributeKeys(attributes),
      ...this._positionAttributeKeys(attributes),
      ...this._stateAttributeKeys(attributes),
      "vendor","name","room","model","product_type","product_identifier","product_model","serial_number","firmware",
      "type","uuid","device_id","node_id","zigbee_channel","displayed_signal_strength","hub_route","repeater",
      "parent_node_id","device_reception_RSSI","device_reception_LQI","device_reception_percent",
      "controller_reception_RSSI","controller_reception_LQI","controller_reception_percent",
    ]);
    return this._availableAttributeKeys(attributes,key => !excluded.has(key));
  }

  _attributeLabel(key) {
    return key.split("_").map((part,index) => index ? part : `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ");
  }

  _attributeValue(value) {
    if (typeof value === "boolean") {
      return this._hass.localize?.(`state.default.${value ? "on" : "off"}`) || (value ? "On" : "Off");
    }
    if (Array.isArray(value)) return value.join(", ");
    return String(value);
  }

  _detailAttributeGroup(titleKey, attributes, keys) {
    const rows = this._detailAttributeRows(attributes,keys);
    return rows.length ? this._identificationGroup(titleKey,rows).section : undefined;
  }

  _identificationGroup(titleKey, rows) {
    const section = document.createElement("section");
    section.className = "detail-identification-section";
    const list = document.createElement("dl");
    list.className = "detail-identification-list";
    for (const [attributeKey,key,value] of rows.filter(([, ,item]) => item !== undefined && item !== null && item !== "")) {
      const row = document.createElement("div");
      row.className = "detail-identification-row";
      const icon = document.createElement("ha-icon");
      icon.icon = this._detailAttributeIcon(attributeKey);
      const term = document.createElement("dt");
      const description = document.createElement("dd");
      term.textContent = this._t(key);
      description.textContent = String(value);
      row.append(icon,term,description);
      list.append(row);
    }
    if (titleKey) {
      const heading = document.createElement("h3");
      heading.textContent = this._t(titleKey);
      section.append(heading);
    }
    section.append(list);
    return {section,count:list.children.length};
  }

  _detailAttributeIcon(key) {
    if (key.includes("schedule") || key.includes("day_change")) return "mdi:clock-outline";
    if (key.includes("temperature") || key.endsWith("_temp")) return "mdi:thermometer";
    if (key.includes("humidity")) return "mdi:water-percent";
    if (key.includes("position") || key.includes("lift") || key.includes("tilt")) return "mdi:window-shutter-settings";
    if (key.includes("mode") || key.includes("source")) return "mdi:tune-variant";
    if (key.endsWith("_id")) return "mdi:identifier";
    return "mdi:information-outline";
  }

  _identificationCard(iconName, labelKey, value, secondaryLabelKey, secondaryValue, signal = false) {
    if (value === undefined || value === null || value === "") return undefined;
    const card = document.createElement("div");
    card.className = `detail-id-card${signal ? " signal" : ""}`;
    const icon = document.createElement("ha-icon");
    icon.icon = iconName;
    const text = document.createElement("div");
    const headline = document.createElement("strong");
    headline.textContent = `${this._t(labelKey)} = ${value}`;
    text.append(headline);
    if (secondaryValue !== undefined && secondaryValue !== null && secondaryValue !== "") {
      const secondary = document.createElement("small");
      secondary.textContent = `${this._t(secondaryLabelKey)} = ${secondaryValue}`;
      text.append(secondary);
    }
    card.append(icon,text);
    return card;
  }

  _identificationSection(titleKey, cards) {
    const section = document.createElement("section");
    section.className = "detail-identification-section";
    const heading = document.createElement("h3");
    heading.textContent = this._t(titleKey);
    const list = document.createElement("div");
    list.className = "detail-id-list";
    list.append(...cards.filter(Boolean));
    section.append(heading,list);
    return {section,count:list.children.length};
  }

  _receptionSignal(attributes, prefix) {
    const parts = [];
    const rssi = attributes[`${prefix}_RSSI`];
    const lqi = attributes[`${prefix}_LQI`];
    if (rssi !== undefined && rssi !== null) parts.push(`${rssi} RSSI`);
    if (lqi !== undefined && lqi !== null) parts.push(`${lqi} LQI`);
    return parts.join(" · ");
  }

  _deviceIdentificationCards(device, signalState, primaryAttributes = {}) {
    const attributes = {...primaryAttributes,...(signalState?.attributes || {})};
    const productIdentifier = attributes.product_identifier || attributes.product_type || device?.model;
    const productType = attributes.product_type || device?.model;
    const productReference = attributes.product_model || attributes.model_identifier || attributes.model;
    const serial = attributes.serial_number || device?.serial_number;
    const firmware = attributes.firmware || device?.sw_version;
    const route = attributes.hub_route
      ? `${attributes.hub_route}${attributes.repeater ? ` (${attributes.repeater})` : ""}`
      : attributes.repeater;
    const unknown = this._hass.localize?.("state.default.unknown") || "Unknown";
    const deviceReception = this._receptionSignal(attributes,"device_reception");
    const controllerReception = this._receptionSignal(attributes,"controller_reception");
    return {
      identity:[
        this._identificationCard("mdi:memory","panel_device_equipment",productIdentifier,"panel_product_type",productType),
        this._identificationCard("mdi:format-list-bulleted","panel_device_reference",productReference,"panel_product_type",productIdentifier),
        this._identificationCard("mdi:numeric","panel_device_serial",serial,"panel_device_firmware",firmware),
      ].filter(Boolean),
      zigbee:[
        this._identificationCard("mdi:zigbee","panel_zigbee_channel",attributes.zigbee_channel),
        this._identificationCard("mdi:signal","panel_signal_quality",attributes.displayed_signal_strength || signalState?.state,"panel_hub_route",route,true),
        this._identificationCard("mdi:signal-cellular-outline","panel_device_reception",attributes.device_reception_percent ?? (deviceReception ? unknown : undefined),"panel_device_reception_details",deviceReception),
        this._identificationCard("mdi:signal-cellular-3","panel_controller_reception",attributes.controller_reception_percent ?? (controllerReception ? unknown : undefined),"panel_controller_reception_details",controllerReception,true),
      ].filter(Boolean),
    };
  }

  async _deviceRegistryEntry(deviceId) {
    if (!deviceId) return undefined;
    const local = this._hass?.devices?.[deviceId];
    if (local) return local;
    if (!this._deviceRegistryPromise) {
      this._deviceRegistryPromise = this._hass.callWS({type:"config/device_registry/list"})
        .catch(() => []);
    }
    return (await this._deviceRegistryPromise).find(device => device.id === deviceId);
  }

  async _deviceRegistryEntries() {
    const local = Object.entries(this._hass?.devices || {}).map(([id,device]) => ({id,...device}));
    if (local.length) return local;
    if (!this._deviceRegistryPromise) {
      this._deviceRegistryPromise = this._hass.callWS({type:"config/device_registry/list"})
        .catch(() => []);
    }
    return this._deviceRegistryPromise;
  }

  async _renderDeviceDetail() {
    const entityId = this._detailEntity;
    const target = this.shadowRoot.getElementById("device-detail");
    const generation = (this._detailGeneration || 0) + 1;
    this._detailGeneration = generation;
    this._detailCards = [];
    target.replaceChildren();
    if (!entityId) return;

    const context = await this._deviceContext(entityId);
    if (generation !== this._detailGeneration || entityId !== this._detailEntity) return;
    const climate = this._climateRoomContext(context);
    const scopedEntries = climate?.entries || context.deviceEntries;
    const signalStates = scopedEntries.map(entry => this._hass.states?.[entry.entity_id])
      .filter(state => state?.attributes?.zigbee_channel !== undefined
        || state?.attributes?.displayed_signal_strength !== undefined);
    const signalState = context.deviceEntries.map(entry => this._hass.states?.[entry.entity_id])
      .find(state => state?.attributes?.zigbee_channel !== undefined
        || state?.attributes?.displayed_signal_strength !== undefined) || signalStates[0];
    const signalIds = new Set(signalStates.map(state => state.entity_id));
    const domain = entry => entry.entity_id.split(".")[0];
    const states = scopedEntries.filter(entry => entry.entity_id !== entityId
      && !signalIds.has(entry.entity_id)
      && entry.entity_category !== "config"
      && entry.entity_category !== "diagnostic"
      && ["sensor","binary_sensor"].includes(domain(entry)));
    const settings = scopedEntries.filter(entry => entry.entity_id !== entityId
      && !signalIds.has(entry.entity_id)
      && (entry.entity_category === "config" || ["select","number","switch","button"].includes(domain(entry))));
    const deviceSettings = climate
      ? settings.filter(entry => String(context.devices?.get(entry.device_id)?.model || "").toLowerCase() !== "room")
      : settings;
    const selectedIsRoom = String(context.device?.model || "").toLowerCase() === "room";
    const roomSettings = (climate ? settings : []).filter(entry => entry.entity_id !== entityId
      && String(context.devices?.get(entry.device_id)?.model || "").toLowerCase() === "room"
      && entry.entity_category !== "diagnostic");
    const primaryAttributes = this._hass.states?.[entityId]?.attributes || {};
    const detailType = this._detailDeviceType(entityId);
    let content;

    if (this._activeDetailTab === "control") {
      const card = document.createElement("wiser-controls-card");
      const type = this._detailDeviceType(entityId);
      card.setConfig({
        ...this._deviceCardConfig(this._activeHub, type),
        title:this._entityName(entityId),
        device_types:[type],
        entities:[entityId],
        device_order:[entityId],
        excluded_entities:[],
        device_columns:1,
        mobile_device_columns:1,
        _panel_hide_title:true,
        _panel_card_click:false,
      });
      card.hass = this._hass;
      const columns = document.createElement("div");
      columns.className = "detail-columns";
      columns.append(this._detailSummary(entityId,this._climateProductDevice(climate) || context.device),this._detailColumn(undefined,card));
      this._detailCards.push(card);
      content = columns;
    } else if (this._activeDetailTab === "states") {
      const statusKeys = this._stateAttributeKeys(primaryAttributes);
      const isPlugDetail = detailType === "plugs";
      const powerEntries = isPlugDetail ? states.filter(entry => this._isPowerEntry(entry)) : [];
      const modeEntries = isPlugDetail ? states.filter(entry => !this._isPowerEntry(entry)) : [];
      const modeCards = await this._detailEntityCards(this._statusEntryGroups(modeEntries));
      const deviceSections = isPlugDetail
        ? {content:[],cards:await this._detailEntityCards(this._statusEntryGroups(powerEntries))}
        : await this._detailDeviceEntitySections(states,context.devices);
      const status = this._detailAttributeGroup(undefined,primaryAttributes,statusKeys);
      const positions = this._detailAttributeGroup(undefined,primaryAttributes,this._positionAttributeKeys(primaryAttributes));
      const schedule = this._detailAttributeGroup(undefined,primaryAttributes,this._scheduleAttributeKeys(primaryAttributes));
      const columns = document.createElement("div");
      const middleTitle = isPlugDetail
        ? "panel_modes"
        : detailType === "shutters" ? "panel_positions" : "panel_devices";
      const middleCards = isPlugDetail ? modeCards : deviceSections.cards;
      const middleContent = isPlugDetail ? modeCards : deviceSections.content;
      const middleAttributeGroup = isPlugDetail ? undefined : positions;
      const middle = this._detailColumn(
        middleTitle,
        middleAttributeGroup,
        ...middleContent,
        !middleAttributeGroup && !middleCards.length ? this._emptyDetail() : undefined,
      );
      const scheduleColumn = this._detailColumn("panel_schedule",schedule || this._emptyDetail());
      if (isPlugDetail && deviceSections.cards.length) {
        const powerHeading = document.createElement("h3");
        powerHeading.textContent = this._t("panel_power");
        scheduleColumn.append(powerHeading,...deviceSections.cards);
      }
      columns.className = "detail-columns three-column status";
      columns.append(
        this._detailColumn("panel_detail_states",status || this._emptyDetail()),
        middle,
        scheduleColumn,
      );
      this._detailCards.push(...middleCards,...(isPlugDetail ? deviceSections.cards : []));
      content = columns;
    } else if (this._activeDetailTab === "settings") {
      const physicalSettings = climate ? deviceSettings : selectedIsRoom ? [] : deviceSettings;
      const roomCard = roomSettings.length
        ? await this._nativeCard({type:"entities", entities:roomSettings.map(entry => ({entity:entry.entity_id,name:this._entityName(entry.entity_id)}))})
        : undefined;
      const columns = document.createElement("div");
      if (climate) {
        const parameterKeys = this._parameterAttributeKeys(primaryAttributes);
        const deviceSections = await this._detailDeviceEntitySections(physicalSettings,context.devices);
        const parameters = this._detailAttributeGroup(undefined,primaryAttributes,parameterKeys);
        columns.className = "detail-columns three-column settings";
        columns.append(
          this._detailColumn("panel_parameters",parameters || this._emptyDetail()),
          this._detailColumn("panel_detail_settings",...deviceSections.content,!deviceSections.cards.length ? this._emptyDetail() : undefined),
          this._detailColumn("panel_seasonal_comfort",roomCard || this._emptyDetail()),
        );
        this._detailCards.push(...deviceSections.cards);
      } else {
        const settingSections = await this._detailDeviceEntitySections(physicalSettings,context.devices);
        const allParameterKeys = this._parameterAttributeKeys(primaryAttributes);
        const seasonalKeys = detailType === "shutters" ? this._seasonalComfortAttributeKeys(primaryAttributes) : [];
        const seasonalKeySet = new Set(seasonalKeys);
        const parameters = this._detailAttributeGroup(undefined,primaryAttributes,allParameterKeys.filter(key => !seasonalKeySet.has(key)));
        const seasonal = this._detailAttributeGroup(undefined,primaryAttributes,seasonalKeys);
        columns.className = `detail-columns${seasonal ? " three-column" : ""} settings`;
        columns.append(
          this._detailColumn("panel_parameters",parameters || this._emptyDetail()),
          this._detailColumn("panel_detail_settings",...settingSections.content,!settingSections.cards.length ? this._emptyDetail() : undefined),
        );
        if (seasonal) columns.append(this._detailColumn("panel_seasonal_comfort",seasonal));
        this._detailCards.push(...settingSections.cards);
      }
      if (roomCard) this._detailCards.push(roomCard);
      content = columns;
    } else if (this._activeDetailTab === "activity") {
      const activityEntities = [entityId,...scopedEntries
        .filter(entry => entry.entity_id !== entityId
          && !signalIds.has(entry.entity_id)
          && entry.entity_category !== "diagnostic")
        .map(entry => entry.entity_id)];
      const activity = entityId
        ? await this._nativeCard({type:"logbook", entities:[...new Set(activityEntities)], hours_to_show:24})
        : undefined;
      if (activity) {
        activity.className = "detail-activity";
        content = this._detailColumn("panel_detail_activity",activity);
        this._detailCards.push(activity);
      }
    } else if (this._activeDetailTab === "identification") {
      if (generation !== this._detailGeneration || entityId !== this._detailEntity) return;
      const identification = document.createElement("div");
      identification.className = "detail-identification";
      const identityCards = [];
      const zigbeeCards = [];
      if (climate) {
        for (const device of climate.physicalDevices) {
          const details = this._deviceIdentificationCards(device,climate.signalStates.get(device.id));
          if (details.identity.length) identityCards.push(this._deviceSectionHeading(device),...details.identity);
          if (details.zigbee.length) zigbeeCards.push(this._deviceSectionHeading(device),...details.zigbee);
        }
      } else {
        const details = this._deviceIdentificationCards(context.device,signalState,primaryAttributes);
        identityCards.push(...details.identity);
        zigbeeCards.push(...details.zigbee);
      }
      const identity = this._identificationSection("panel_identification",identityCards);
      const zigbee = this._identificationSection("panel_zigbee",zigbeeCards);
      if (identity.count) identification.append(identity.section);
      if (zigbee.count) identification.append(zigbee.section);
      target.append(identification);
      if (!identity.count && !zigbee.count) {
        content = this._emptyDetail();
      }
    }

    if (generation !== this._detailGeneration || entityId !== this._detailEntity) return;
    if (!content && this._activeDetailTab !== "identification") content = this._emptyDetail();
    if (content) {
      target.append(content);
      if (content.localName === "wiser-controls-card" || content.config) this._detailCards.push(content);
    }
  }

  _hubId(hub) {
    return this._config.hub_ids?.[hub] || hub;
  }

  _storedCardConfig(hub) {
    const {
      room_type: _unusedRoomType,
      default_view: _unusedDefaultView,
      device_view_configs: _unusedDeviceViewConfigs,
      ...stored
    } =
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
      _panel_card_click: true,
    }) || normalized;
  }

  _storedDeviceCardConfig(hub, type) {
    const stored = this._config.card_configs?.[hub]?.device_view_configs?.[type];
    const base = stored && typeof stored === "object"
      ? stored
      : this._storedCardConfig(hub);
    const Card = customElements.get("wiser-controls-card");
    const normalized = Card?.orderConfig?.({...base, device_types:[type]}) || {...base, device_types:[type]};
    return Card?.orderConfig?.({
      ...normalized,
      title: this._t(type),
      mobile_device_columns: normalized.mobile_device_columns ?? 1,
      type: "custom:wiser-controls-card",
      hubs: [this._hubId(hub)],
      device_types: [type],
      _panel_hide_title: true,
      _panel_card_click: true,
    }) || normalized;
  }

  _effectiveCardConfig(config) {
    const {default_view: _unusedDefaultView, mobile_device_columns, ...effective} = config;
    effective.device_columns = this._mobileMedia?.matches
      ? mobile_device_columns ?? 1
      : effective.device_columns ?? 1;
    return effective;
  }

  _cardConfig(hub) {
    return this._effectiveCardConfig(this._storedCardConfig(hub));
  }

  _deviceCardConfig(hub, type = this._activeDeviceType) {
    return this._effectiveCardConfig(this._storedDeviceCardConfig(hub, type));
  }

  _refreshResponsiveColumns() {
    this._cards.forEach((card, index) => {
      const hub = this._config?.hubs?.[index];
      if (hub) card.setConfig(this._cardConfig(hub));
    });
    this._deviceCards?.forEach((card, index) => {
      const hub = this._config?.hubs?.[index];
      if (hub) card.setConfig(this._deviceCardConfig(hub));
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
    rememberPanelHub(this._config?.panel_id, hub);

    this._cards.forEach((card, index) => {
      const selected = this._config.hubs[index] === hub;
      card.hidden = !selected;
      if (selected) {
        card.hass = this._hass;
      }

      this._tabs[index].setAttribute("aria-selected", String(selected));
      this._tabs[index].tabIndex = selected ? 0 : -1;
    });
    this._deviceCards?.forEach((card, index) => {
      const selected = this._config.hubs[index] === hub;
      card.hidden = !selected;
      if (selected && this._activeView === "devices") card.hass = this._hass;
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

  _createEditorHubTabs(ownerIndex) {
    const tabs = document.createElement("nav");
    tabs.className = "editor-hub-tabs";
    tabs.hidden = this._config.hubs.length <= 1;
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", this._t("panel_hubs"));
    const buttons = this._config.hubs.map((hub, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "editor-hub-tab";
      button.textContent = hub;
      button.id = `editor-hub-tab-${ownerIndex}-${index}`;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", `editor-hub-panel-${index}`);
      button.addEventListener("click", () => this._selectEditorHub(hub, true));
      button.addEventListener("keydown", (event) => {
        let next;
        if (event.key === "ArrowRight") next = (index + 1) % this._config.hubs.length;
        else if (event.key === "ArrowLeft") next = (index + this._config.hubs.length - 1) % this._config.hubs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = this._config.hubs.length - 1;
        else return;
        event.preventDefault();
        this._selectEditorHub(this._config.hubs[next], true);
      });
      return button;
    });
    tabs.replaceChildren(...buttons);
    return {tabs, buttons};
  }

  _selectEditorHub(hub, focus = false) {
    if (!this._config?.hubs?.includes(hub)) return;
    this._activeEditorHub = hub;
    const selectedIndex = this._config.hubs.indexOf(hub);
    for (const entry of this._editorEntries) {
      const selected = entry.hub === hub;
      entry.section.hidden = !selected;
      entry.hubButtons.forEach((button, index) => {
        const active = index === selectedIndex;
        button.setAttribute("aria-selected", String(active));
        button.tabIndex = active ? 0 : -1;
      });
      if (selected) {
        entry.preview.hass = this._hass;
        if (focus) entry.hubButtons[selectedIndex]?.focus?.();
      }
    }
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
    const cards = this._activeView === "devices" ? this._deviceCards : this._cards;
    for (const card of cards || []) {
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
    const {_panel_card_click: _unusedPanelCardClick, ...editableConfig} = config;
    const normalized = {
      ...editableConfig,
      default_view: editableConfig.default_view === "devices" ? "devices" : "overview",
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

  _createDefaultViewSelector(hub) {
    const field = document.createElement("div");
    const label = document.createElement("span");
    const selector = document.createElement("ha-selector");
    field.className = "panel-default-view";
    label.textContent = this._t("panel_default_view");
    selector.hass = this._hass;
    selector.selector = {
      button_toggle: {
        options: [
          {value:"overview", label:this._t("panel_overview")},
          {value:"devices", label:this._t("panel_devices")},
        ],
      },
    };
    selector.value = this._drafts[hub].default_view || "overview";
    selector.addEventListener("value-changed", (event) => {
      event.stopPropagation();
      const view = event.detail.value;
      if (view !== "overview" && view !== "devices") return;
      this._drafts[hub] = this._normaliseDraft(hub, {
        ...this._drafts[hub],
        default_view: view,
      });
      selector.value = view;
    });
    field.append(label, selector);
    return {field, selector};
  }

  _closeFeatureEditor(entry) {
    if (entry.featureState?.yamlInvalid) {
      this.shadowRoot.getElementById("editor-error").textContent = "";
      this.shadowRoot.getElementById("save").disabled = this._yamlErrors.size > 0;
    }
    entry.featureState = undefined;
    entry.featureDetail.hidden = true;
    entry.featureDetail.replaceChildren();
    entry.settings.hidden = false;
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
    entry.settings.hidden = true;
    entry.editor.hidden = true;
    entry.featureDetail.replaceChildren(header, visual, code);
    entry.featureDetail.hidden = false;
  }

  _yamlConfig(hub) {
    const {_panel_hide_title, _panel_card_click, ...config} = this._drafts[hub];
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
          entry.columns.hidden = true;
          entry.settings.hidden = true;
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
          entry.columns.hidden = false;
          entry.settings.hidden = false;
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
    this._editingView = this._activeView === "devices" ? "devices" : "overview";
    this._editingDeviceType = this._activeDeviceType;
    errorMessage.textContent = "";
    container.replaceChildren();
    save.disabled = true;
    mode.disabled = true;
    mode.textContent = this._editorModeLabel();
    const hub = this._config.hubs.includes(this._activeHub)
      ? this._activeHub
      : this._config.hubs[0];
    this._updateEditorHeading();

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
      const hubIndex = this._config.hubs.indexOf(hub);
      if (hub) {
        const editor = await Card.getConfigElement();
        if (!dialog.open) {
          return;
        }

        const config = this._normaliseDraft(
          hub,
          {
            ...(this._editingView === "devices"
              ? this._storedDeviceCardConfig(hub, this._editingDeviceType)
              : this._storedCardConfig(hub)),
            default_view: this._defaultView(hub),
          },
        );
        this._drafts[hub] = config;
        editor.hideHubSelector = true;
        editor.hideTitle = true;
        editor.hideRoomColumns = true;
        editor.hideDeviceTypes = true;
        editor.hideVisibilityControl = this._editingView === "devices";
        editor.hass = this._hass;
        let preview;
        editor.addEventListener("config-changed", (event) => {
          event.stopPropagation();
          this._drafts[hub] = this._normaliseDraft(
            hub,
            {
              ...event.detail.config,
              device_columns: this._drafts[hub].device_columns ?? 1,
              mobile_device_columns:
                this._drafts[hub].mobile_device_columns ?? 1,
              default_view: this._drafts[hub].default_view,
            },
          );
          if (preview) this._schedulePreview(preview, this._drafts[hub]);
        });
        editor.setConfig({...config});

        preview = document.createElement("wiser-controls-card");
        preview.className = "editor-preview";
        preview.hass = this._hass;
        preview.setAttribute("editor-preview", "");
        preview.setAttribute("aria-label", this._t("panel_preview_label", {hub}));
        preview.setConfig(this._effectiveCardConfig(this._drafts[hub]));

        const columns = this._createColumnForm(hub, preview);
        const defaultView = this._createDefaultViewSelector(hub);

        const section = document.createElement("section");
        const layout = document.createElement("div");
        const form = document.createElement("div");
        const settings = document.createElement("div");
        const visual = document.createElement("div");
        const yaml = document.createElement("div");
        const featureDetail = document.createElement("div");
        section.id = `editor-hub-panel-${hubIndex}`;
        section.setAttribute("role", "tabpanel");
        section.setAttribute("aria-labelledby", `editor-hub-tab-${hubIndex}-${hubIndex}`);
        layout.className = "editor-layout";
        form.className = "editor-form";
        settings.className = "panel-settings";
        visual.className = "visual-editor";
        yaml.className = "yaml-editor";
        featureDetail.className = "feature-detail";
        yaml.hidden = true;
        featureDetail.hidden = true;
        visual.append(editor, featureDetail);
        settings.append(defaultView.field, columns);
        form.append(settings, visual);
        form.append(yaml);
        layout.replaceChildren(form, preview);
        section.replaceChildren(layout);
        container.append(section);
        this._editors.push(editor);
        const entry = {
          hub,
          editor,
          preview,
          columns,
          defaultView: defaultView.selector,
          settings,
          visual,
          yaml,
          featureDetail,
          section,
        };
        editor.addEventListener("edit-sub-element", (event) => {
          this._openFeatureEditor(entry, event);
        });
        this._editorEntries.push(entry);
        this._previews.push(preview);
      }

      this._activeEditorHub = hub;

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
      const configs = Object.fromEntries(Object.entries(this._drafts).map(([hub, draft]) => {
        const existing = this._config.card_configs?.[hub] || {};
        const {
          default_view,
          _panel_hide_title: _unusedPanelHideTitle,
          _panel_card_click: _unusedPanelCardClick,
          ...cardConfig
        } = draft;
        if (this._editingView !== "devices") {
          const merged = {...cardConfig, default_view};
          if (existing.device_view_configs) {
            merged.device_view_configs = existing.device_view_configs;
          }
          return [hub, merged];
        }
        return [hub, {
          ...existing,
          default_view,
          device_view_configs: {
            ...existing.device_view_configs,
            [this._editingDeviceType]: cardConfig,
          },
        }];
      }));
      await this._hass.callWS({
        type: "wiser/panel/configure",
        panel_id: this._config.panel_id,
        configs,
      });
      this._config = {
        ...this._config,
        card_configs: {
          ...this._config.card_configs,
          ...configs,
        },
      };
      this._closeEditor();
      await this._loadCards();
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
    const main = this.shadowRoot.getElementById("overview-view");
    const devices = this.shadowRoot.getElementById("devices-view");

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
      const deviceCards = this._config.hubs.map((hub) => {
        const card = document.createElement("wiser-controls-card");
        card.hass = this._hass;
        card.setConfig(this._deviceCardConfig(hub));
        return card;
      });

      this._cards = cards;
      this._deviceCards = deviceCards;
      main.replaceChildren(...cards);
      devices.replaceChildren(...deviceCards);
      this._renderHubTabs();
      this._renderDeviceTabs();
      this.shadowRoot.getElementById("settings").disabled = false;
    } catch (error) {
      if (generation !== this._generation) {
        return;
      }

      this._cards = [];
      this._deviceCards = [];
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
