const {test} = require("node:test");
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {resolve} = require("node:path");
const vm = require("node:vm");
const configuredEntityIds = card => Array.from(card.config.entities,item => typeof item === "string" ? item : item.entity);

function setup() {
  const translations={
    heating:"Heating",hot_water:"Hot water",plugs:"Appliances",lights:"Lights",shutters:"Shutters",
    panel_title:"Controls",panel_menu:"Toggle sidebar",panel_hubs:"Wiser hubs",
    panel_view:"Controls view",panel_device_types:"Device types",panel_device_details:"Device details",panel_overview:"Overview",panel_devices:"Devices",panel_default_view:"Default view",
    panel_back_to_devices:"Back to devices",panel_detail_control:"Control",panel_detail_heating:"Heating",panel_detail_hot_water:"Hot water",panel_detail_appliance:"Appliance",panel_detail_light:"Light",panel_detail_shutter:"Shutter",panel_detail_states:"States",panel_detail_settings:"Settings",panel_detail_identification:"Identification",panel_detail_activity:"Activity",
    panel_detail_empty:"No information is available for this device.",panel_device_manufacturer:"Manufacturer",panel_device_model:"Model",panel_device_serial:"Serial number",panel_device_software:"Software version",panel_device_hardware:"Hardware version",
    panel_identification:"Identification",panel_zigbee:"Zigbee",panel_positions:"Positions",panel_power:"Power",panel_schedule:"Schedule",panel_parameters:"Parameters",panel_modes:"Modes",panel_room_settings:"Room settings",panel_seasonal_comfort:"Seasonal comfort",
    panel_device_equipment:"Equipment",panel_device_reference:"Reference",panel_device_firmware:"Firmware",panel_product_type:"Product type",panel_hub_route:"Hub route",panel_zigbee_channel:"Zigbee channel",panel_signal_quality:"Signal quality",panel_device_reception:"Device reception",panel_device_reception_details:"Device reception",panel_controller_reception:"Controller reception",panel_controller_reception_details:"Controller reception",panel_zigbee_route:"Route",panel_zigbee_node:"Node ID",panel_zigbee_uuid:"UUID",
    panel_settings:"Panel settings",panel_settings_for_hub:"{hub} - Panel settings",panel_edit_settings:"Edit controls card settings",
    panel_loading:"Loading Wiser controls…",panel_cancel:"Cancel",panel_save:"Save",
    panel_retry:"Retry",panel_editor_error:"Unable to open the editor. Close this dialog and try again.",
    panel_save_error:"Unable to save settings to Home Assistant. Please try again.",
    panel_load_error:"Unable to load Wiser controls. Please try again.",
    panel_version_error:"Wiser Controls needs its matching controls card build. Update the card resource and refresh the browser.",
    panel_yaml_fix:"Fix the YAML errors before saving.",
    panel_feature_yaml_fix:"Fix the feature YAML errors before saving.",
    panel_yaml_load_error:"Unable to load the YAML editor.",
    panel_feature_yaml_load_error:"Unable to load the feature YAML editor.",
    panel_feature_editor_error:"Unable to load the feature editor.",
    panel_yaml_label:"YAML configuration for {hub}",panel_preview_label:"Preview for {hub}",
  };
  const localize=(_hass,key,values={})=>(translations[key]||key)
    .replace(/\{(\w+)\}/g,(token,name)=>String(values[name]??token));
  class Element {
    constructor() { this.listeners={}; this.attributes={}; this.children=[]; this.hidden=false; this.dataset={}; }
    addEventListener(name,listener){this.listeners[name]=listener}
    setAttribute(name,value=""){this.attributes[name]=String(value)}
    removeAttribute(name){delete this.attributes[name]}
    toggleAttribute(name,force){if(force)this.setAttribute(name,"");else this.removeAttribute(name)}
    append(...children){this.children.push(...children)}
    replaceChildren(...children){this.children=children}
    setConfig(config){this.config=config;this.hassWhenConfigured=this.hass}
    focus(){}
    attachShadow(){
      const main=new Element(),elements=new Map();
      elements.set("overview-view",main);
      const viewButtons=["overview","devices"].map(view=>{const button=new Element();button.dataset={view};return button});
      this.shadowRoot={
        innerHTML:"",
        querySelector:selector=>selector==="main"?main:null,
        querySelectorAll:selector=>selector===".view-button"?viewButtons:[],
        getElementById:id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)},
      };
    }
  }
  class Card extends Element {
    static panelApiVersion=1;
    static orderConfig(config){
      const legacy={room_columns:"device_columns",mobile_room_columns:"mobile_device_columns",room_types:"device_types",room_order:"device_order",room_configuration:"device_configuration",room_options:"device_options"};
      config={...config};
      for(const [oldKey,newKey] of Object.entries(legacy)){if(!Object.hasOwn(config,newKey)&&Object.hasOwn(config,oldKey))config[newKey]=config[oldKey];delete config[oldKey]}
      if(config.type==="custom:wiser-rooms-card")config.type="custom:wiser-controls-card";
      const order=["type","title","device_columns","mobile_device_columns","hubs","device_types"];
      return Object.fromEntries([
        ...order.filter(key=>Object.hasOwn(config,key)).map(key=>[key,config[key]]),
        ...Object.keys(config).filter(key=>!order.includes(key)).map(key=>[key,config[key]]),
      ]);
    }
    static async getConfigElement(){return new Element()}
  }
  class Feature extends Element {
    static async getConfigElement(){return new Element()}
  }
  const registry=new Map([["wiser-controls-card",Card],["ha-yaml-editor",Element],["wiser-test-feature",Feature]]);
  const media={matches:false,listeners:{},addEventListener(name,listener){this.listeners[name]=listener},removeEventListener(name,listener){if(this.listeners[name]===listener)delete this.listeners[name]}};
  const sessionValues=new Map();
  const sessionStorage={getItem:key=>sessionValues.get(key),setItem:(key,value)=>sessionValues.set(key,String(value))};
  const frames=[];
  const createElement=name=>{const element=name==="wiser-controls-card"?new Card():new Element();element.localName=name;return element};
  const context=vm.createContext({HTMLElement:Element,window:{WiserRoomsLocalize:{localize},loadCardHelpers:async()=>({createCardElement:config=>{const card=createElement("hui-card");card.setConfig(config);return card}}),matchMedia:()=>media,requestAnimationFrame:callback=>{frames.push(callback);return frames.length},cancelAnimationFrame(){},sessionStorage},setTimeout,clearTimeout,CustomEvent:class{constructor(type,options){Object.assign(this,{type},options)}},customElements:{get:key=>registry.get(key),define:(key,value)=>registry.set(key,value)},document:{createElement},console:{error(){}}});
  vm.runInContext(readFileSync(resolve(__dirname,"../src/wiser-controls-panel.js"),"utf8"),context);
  const panel=new (registry.get("wiser-controls-panel"))();
  panel._testWindow=context.window;
  panel._testMedia=media;
  panel._testFrames=frames;
  panel._testCreatePanel=()=>{
    const replacement=new (registry.get("wiser-controls-panel"))();
    replacement._testMedia=media;
    replacement._testFrames=frames;
    replacement._testWindow=context.window;
    replacement.connectedCallback();
    return replacement;
  };
  panel.connectedCallback();
  return panel;
}

test("rooms panel creates one filtered card per hub",()=>{
  const panel=setup();
  const hass={user:{is_admin:true}};
  panel.hass=hass;
  panel.panel={config:{panel_id: "registry-panel",hubs:["Downstairs","Upstairs"],hub_ids:{Downstairs:"entry-a",Upstairs:"entry-b"},card_configs:{Upstairs:{device_columns:3}}}};
  const cards=panel.shadowRoot.querySelector("main").children;
  assert.equal(cards.length,2);
  assert.deepEqual(Array.from(cards[0].config.hubs),["entry-a"]);
  assert.equal(cards[0].config._panel_hide_title,true);
  assert.equal(cards[0].config._panel_card_click,true);
  assert.deepEqual(Array.from(cards[1].config.hubs),["entry-b"]);
  assert.equal(cards[1].config.device_columns,3);
  assert.equal(cards[0].hass,hass);
  assert.equal(cards[0].hassWhenConfigured,hass);
});

test("controls panel exposes Overview and Devices views with a configurable default",async()=>{
  const panel=setup(),calls=[];
  panel.hass={user:{is_admin:true},callWS:async message=>calls.push(message)};
  panel.panel={config:{panel_id:"registry-panel",hubs:["Home"],hub_ids:{Home:"entry-a"},card_configs:{Home:{default_view:"devices"}}}};

  assert.equal(panel._activeView,"devices");
  assert.equal(panel.shadowRoot.getElementById("view-title").textContent,"Devices");
  assert.equal(panel.shadowRoot.getElementById("overview-view").hidden,true);
  assert.equal(panel.shadowRoot.getElementById("devices-view").hidden,false);
  assert.equal(panel._cards[0].config.default_view,undefined);
  assert.match(readFileSync(resolve(__dirname,"../src/wiser-controls-panel.js"),"utf8"),/\.device-tab\s*\{[^}]*font-size:\s*17px/s);
  assert.match(readFileSync(resolve(__dirname,"../src/wiser-controls-panel.js"),"utf8"),/\.detail-column\s*\{[^}]*min-width:\s*0;[^}]*overflow:\s*hidden/s);

  const buttons=panel.shadowRoot.querySelectorAll(".view-button");
  buttons[0].listeners.click();
  assert.equal(panel._activeView,"overview");
  assert.equal(buttons[0].attributes["aria-pressed"],"true");
  assert.equal(buttons[1].attributes["aria-pressed"],"false");

  await panel._openEditor();
  const entry=panel._editorEntries[0];
  assert.equal(entry.defaultView.value,"devices");
  entry.defaultView.listeners["value-changed"]({stopPropagation(){},detail:{value:"overview"}});
  await panel._saveEditor();
  assert.equal(calls[0].configs.Home.default_view,"overview");
  assert.equal(calls[0].configs.Home._panel_hide_title,undefined);
  assert.equal(calls[0].configs.Home._panel_card_click,undefined);
});

test("Devices tabs render and save independent settings per device type",async()=>{
  const panel=setup(),calls=[];
  panel.hass={user:{is_admin:true},callWS:async message=>calls.push(message)};
  panel.panel={config:{
    panel_id:"registry-panel",
    hubs:["Home"],
    hub_ids:{Home:"entry-a"},
    card_configs:{Home:{
      default_view:"devices",
      device_columns:5,
      device_view_configs:{
        heating:{device_columns:2},
        plugs:{device_columns:3},
      },
    }},
  }};

  assert.deepEqual(Array.from(panel._deviceCards[0].config.device_types),["heating"]);
  assert.equal(panel._deviceCards[0].config.device_columns,2);
  panel._selectDeviceType("plugs");
  assert.deepEqual(Array.from(panel._deviceCards[0].config.device_types),["plugs"]);
  assert.equal(panel._deviceCards[0].config.device_columns,3);

  await panel._openEditor();
  const entry=panel._editorEntries[0];
  assert.equal(entry.editor.hideDeviceTypes,true);
  assert.equal(entry.editor.hideVisibilityControl,true);
  assert.deepEqual(Array.from(panel._drafts.Home.device_types),["plugs"]);
  entry.columns.listeners["value-changed"]({stopPropagation(){},detail:{value:{device_columns:4}}});
  await panel._saveEditor();

  const saved=calls[0].configs.Home;
  assert.equal(saved.device_columns,5);
  assert.equal(saved.device_view_configs.heating.device_columns,2);
  assert.equal(saved.device_view_configs.plugs.device_columns,4);
  assert.deepEqual(Array.from(saved.device_view_configs.plugs.device_types),["plugs"]);
  assert.equal(saved.device_view_configs.plugs._panel_hide_title,undefined);
  assert.equal(saved.device_view_configs.plugs._panel_card_click,undefined);
  assert.equal(panel._activeView,"devices");
  assert.equal(panel._activeDeviceType,"plugs");

  const replacement=panel._testCreatePanel();
  replacement.hass=panel._hass;
  replacement.panel={config:panel._config};
  assert.equal(replacement._activeView,"devices");
  assert.equal(replacement._activeDeviceType,"plugs");
  assert.equal(replacement.shadowRoot.getElementById("overview-view").hidden,true);
  assert.equal(replacement.shadowRoot.getElementById("devices-view").hidden,false);
});

test("clicking a device opens registry-backed control, states, settings, identification, and activity tabs",async()=>{
  const panel=setup();
  const states={
    "switch.socket":{entity_id:"switch.socket",state:"on",attributes:{friendly_name:"Wiser Kitchen plug",product_identifier:"NHPB/PLUG/1",product_type:"SmartPlug",product_model:"SmartPlug",serial_number:"ABC123",firmware:"1.2.3"}},
    "sensor.socket_power":{entity_id:"sensor.socket_power",state:"12",attributes:{friendly_name:"Power"}},
    "binary_sensor.socket_controllable":{entity_id:"binary_sensor.socket_controllable",state:"on",attributes:{friendly_name:"Controllable"}},
    "select.socket_mode":{entity_id:"select.socket_mode",state:"auto",attributes:{friendly_name:"Wiser Smart Plug Mode"}},
    "sensor.socket_signal":{entity_id:"sensor.socket_signal",state:"good",attributes:{friendly_name:"Signal",zigbee_channel:20,displayed_signal_strength:"VeryGood",node_id:31,device_reception_percent:90,device_reception_RSSI:-50,device_reception_LQI:100,controller_reception_percent:100,controller_reception_RSSI:-45,controller_reception_LQI:110,hub_route:"direct",uuid:"00ABC"}},
    "sensor.kitchen_temperature":{entity_id:"sensor.kitchen_temperature",state:"20",attributes:{friendly_name:"Kitchen temperature",device_class:"temperature"}},
    "switch.kitchen_seasonal_comfort":{entity_id:"switch.kitchen_seasonal_comfort",state:"on",attributes:{friendly_name:"Seasonal comfort"}},
    "sensor.lounge_temperature":{entity_id:"sensor.lounge_temperature",state:"19",attributes:{friendly_name:"Lounge temperature"}},
    "update.kitchen_light_firmware":{entity_id:"update.kitchen_light_firmware",state:"on",attributes:{friendly_name:"Kitchen light firmware"}},
  };
  panel.hass={
    user:{is_admin:true},
    states,
    entities:{
      "switch.socket":{device_id:"device-a",config_entry_id:"entry-a",platform:"wiser"},
      "sensor.socket_power":{device_id:"device-a",config_entry_id:"entry-a",platform:"wiser"},
      "binary_sensor.socket_controllable":{device_id:"device-a",config_entry_id:"entry-a",platform:"wiser"},
      "select.socket_mode":{device_id:"device-a",config_entry_id:"entry-a",platform:"wiser",entity_category:"config"},
      "sensor.socket_signal":{device_id:"device-a",config_entry_id:"entry-a",platform:"wiser",entity_category:"diagnostic"},
      "sensor.kitchen_temperature":{device_id:"device-b",config_entry_id:"entry-a",platform:"wiser"},
      "switch.kitchen_seasonal_comfort":{device_id:"device-b",config_entry_id:"entry-a",platform:"wiser",entity_category:"config"},
      "sensor.lounge_temperature":{device_id:"device-c",config_entry_id:"entry-a",platform:"wiser"},
      "update.kitchen_light_firmware":{device_id:"device-d",platform:"mqtt",entity_category:"config"},
    },
    devices:{
      "device-a":{area_id:"kitchen",config_entries:["entry-a"],manufacturer:"Drayton Wiser",model:"Smart Plug",name:"Wiser Smart Plug",serial_number:"ABC123",sw_version:"1.2.3"},
      "device-b":{area_id:"kitchen",config_entries:["entry-a"],manufacturer:"Drayton Wiser",model:"Room"},
      "device-c":{area_id:"lounge",config_entries:["entry-a"],manufacturer:"Drayton Wiser",model:"Room Sensor"},
      "device-d":{area_id:"kitchen",config_entries:["mqtt-a"],manufacturer:"Other",model:"Light"},
    },
    formatEntityName:state=>state.attributes.friendly_name,
    callWS:async()=>[],
  };
  panel.panel={config:{panel_id:"registry-panel",hubs:["Home"],hub_ids:{Home:"entry-a"},card_configs:{Home:{default_view:"devices"}}}};

  await panel._openDeviceDetail("switch.socket");
  assert.equal(panel.shadowRoot.getElementById("view-title").textContent,"Kitchen plug");
  assert.equal(panel.shadowRoot.getElementById("devices-view").hidden,true);
  assert.equal(panel.shadowRoot.getElementById("device-detail").hidden,false);
  assert.equal(panel.shadowRoot.getElementById("detail-tabs").hidden,false);
  assert.deepEqual(Array.from(panel._detailTabs).map(tab=>tab.textContent),["Appliance","States","Settings","Identification","Activity"]);
  assert.deepEqual(Array.from(panel._detailCards[0].config.entities),["switch.socket"]);
  assert.equal(panel._deviceCardConfig("Home","plugs")._panel_card_click,true);
  assert.equal(panel._detailCards[0].config._panel_card_click,false);
  const summary=panel.shadowRoot.getElementById("device-detail").children[0].children[0];
  assert.equal(summary.children.length,2);
  assert.equal(summary.children[0].localName,"img");
  assert.equal(summary.children[0].src,"__WISER_DEVICE_IMAGE_SMARTPLUG__");
  assert.equal(summary.children[1].localName,"ha-state-icon");
  assert.equal(summary.children[1].hidden,true);
  summary.children[0].listeners.error();
  assert.equal(summary.children[0].hidden,true);
  assert.equal(summary.children[1].hidden,false);

  states["switch.socket"].attributes.entity_picture="/api/image/serve/custom-plug";
  const configuredSummary=panel._detailSummary("switch.socket",panel._hass.devices["device-a"]);
  assert.equal(configuredSummary.children[0].src,"/api/image/serve/custom-plug");
  delete states["switch.socket"].attributes.entity_picture;
  const imageModels={
    Controller:"CONTROLLER",RoomStat:"ROOMSTAT",SmartPlug:"SMARTPLUG",
    TemperatureHumiditySensor:"TEMPERATUREHUMIDITYSENSOR",iTRV:"ITRV",
    UnderFloorHeating:"UNDERFLOORHEATING",HeatingActuator:"HEATINGACTUATOR",
    DimmableLight:"DIMMABLELIGHT",OnOffLight:"ONOFFLIGHT",LoadControl:"ONOFFLIGHT",
    Shutter:"SHUTTER",SmokeAlarmDevice:"SMOKEALARMDEVICE",
    WaterLeakageSensor:"WATERLEAKAGESENSOR",MotionLightSensor:"MOTIONLIGHTSENSOR",
    WindowDoorSensor:"WINDOWDOORSENSOR",CFMT:"CFMT",PowerTagE:"POWERTAGE",
    ButtonPanel:"BUTTONPANEL",BoilerInterface:"BOILERINTERFACE",
  };
  for (const [model,token] of Object.entries(imageModels)) {
    assert.equal(panel._detailProductImage({attributes:{}},{model}),`__WISER_DEVICE_IMAGE_${token}__`);
  }
  assert.equal(panel._detailProductImage({attributes:{}},{model:"Smart Plug"}),"__WISER_DEVICE_IMAGE_SMARTPLUG__");
  assert.equal(panel._detailProductImage({attributes:{}},{model:"CCTFR6311G2"}),"__WISER_DEVICE_IMAGE_CONTROLLER__");

  await panel._selectDetailTab("states");
  assert.equal(panel._detailCards[0].config.type,"entities");
  assert.deepEqual(configuredEntityIds(panel._detailCards[0]),["binary_sensor.socket_controllable"]);
  assert.deepEqual(configuredEntityIds(panel._detailCards[1]),["sensor.socket_power"]);
  const plugStatus=panel.shadowRoot.getElementById("device-detail");
  assert.equal(plugStatus.children[0].className,"detail-columns three-column status");
  assert.equal(plugStatus.children[0].children[0].children[0].textContent,"States");
  assert.equal(plugStatus.children[0].children[1].children[0].textContent,"Modes");
  assert.equal(plugStatus.children[0].children[2].children[0].textContent,"Schedule");
  assert.equal(plugStatus.children[0].children[2].children[2].textContent,"Power");

  await panel._selectDetailTab("settings");
  assert.deepEqual(configuredEntityIds(panel._detailCards[0]),["select.socket_mode"]);
  assert.equal(panel._detailCards.length,1);
  const plugSettings=panel.shadowRoot.getElementById("device-detail");
  assert.equal(plugSettings.children[0].children[0].children[0].textContent,"Parameters");
  assert.equal(plugSettings.children[0].children[1].children[0].textContent,"Settings");
  assert.equal(plugSettings.children[0].children[1].children[1].textContent,"Smart Plug");
  assert.equal(panel._detailCards[0].config.entities[0].name,"Mode");

  await panel._selectDetailTab("identification");
  const identification=panel.shadowRoot.getElementById("device-detail");
  const identityRows=identification.children[0].children[0].children[1];
  const zigbeeRows=identification.children[0].children[1].children[1];
  assert.equal(identityRows.children[0].children[1].children[0].textContent,"Equipment = NHPB/PLUG/1");
  assert.equal(identityRows.children[0].children[1].children[1].textContent,"Product type = SmartPlug");
  assert.equal(identityRows.children[1].children[1].children[0].textContent,"Reference = SmartPlug");
  assert.equal(zigbeeRows.children[0].children[1].children[0].textContent,"Zigbee channel = 20");
  assert.equal(zigbeeRows.children[2].children[1].children[0].textContent,"Device reception = 90");
  assert.equal(zigbeeRows.children[2].children[1].children[1].textContent,"Device reception = -50 RSSI · 100 LQI");
  assert.equal(panel._detailCards.length,0);

  await panel._selectDetailTab("activity");
  assert.equal(panel._detailCards[0].config.type,"logbook");
  assert.deepEqual(Array.from(panel._detailCards[0].config.entities),["switch.socket","sensor.socket_power","binary_sensor.socket_controllable","select.socket_mode"]);
  assert.equal(panel._detailCards[0].config.hours_to_show,24);

  panel._closeDeviceDetail();
  assert.equal(panel.shadowRoot.getElementById("devices-view").hidden,false);
  assert.equal(panel.shadowRoot.getElementById("device-detail").hidden,true);

  panel._selectView("overview");
  assert.equal(panel.shadowRoot.getElementById("overview-view").listeners["hass-more-info"],undefined);
  assert.equal(panel._activeView,"overview");
  assert.equal(panel.shadowRoot.getElementById("device-detail").hidden,true);
  assert.equal(panel.shadowRoot.getElementById("overview-view").hidden,false);
});

test("late startup registry data refreshes open states and settings tabs without a state change",async()=>{
  for(const tabName of ["states","settings"]){
    const panel=setup();
    const primary={entity_id:"switch.socket",state:"on",attributes:{friendly_name:"Socket"}};
    const registryEntries=[
      {entity_id:"switch.socket",device_id:"device-a",config_entry_id:"entry-a",platform:"wiser"},
      {entity_id:"binary_sensor.socket_controllable",device_id:"device-a",config_entry_id:"entry-a",platform:"wiser"},
      {entity_id:"select.socket_mode",device_id:"device-a",config_entry_id:"entry-a",platform:"wiser",entity_category:"config"},
    ];
    let entityRegistryCalls=0;
    panel.hass={
      user:{is_admin:true},states:{
        "switch.socket":primary,
        "binary_sensor.socket_controllable":{entity_id:"binary_sensor.socket_controllable",state:"on",attributes:{friendly_name:"Controllable"}},
        "select.socket_mode":{entity_id:"select.socket_mode",state:"auto",attributes:{friendly_name:"Mode"}},
      },entities:{},devices:{},
      formatEntityName:state=>state.attributes.friendly_name,
      callWS:async message=>message.type==="config/entity_registry/list"
        ? (++entityRegistryCalls===1 ? [] : registryEntries)
        : message.type==="config/device_registry/list"
          ? [{id:"device-a",config_entries:["entry-a"],model:"Smart Plug"}]
          : [],
    };
    panel.panel={config:{panel_id:`startup-${tabName}`,hubs:["Home"],hub_ids:{Home:"entry-a"},card_configs:{Home:{default_view:"devices"}}}};

    await panel._openDeviceDetail("switch.socket");
    await panel._selectDetailTab(tabName);
    assert.equal(panel._detailCards.length,0);
    assert.equal(panel._detailNeedsHydration,true);

    await new Promise(resolve=>setTimeout(resolve,350));

    assert.equal(panel._detailNeedsHydration,false);
    assert.equal(entityRegistryCalls,2);
    assert.equal(panel._detailCards.length,1);
    assert.deepEqual(configuredEntityIds(panel._detailCards[0]),[
      tabName === "states" ? "binary_sensor.socket_controllable" : "select.socket_mode",
    ]);
  }
});

test("states and settings render when Home Assistant card helpers are unavailable",async()=>{
  const panel=setup();
  delete panel._testWindow.loadCardHelpers;
  panel.hass={
    user:{is_admin:true},
    states:{
      "switch.socket":{entity_id:"switch.socket",state:"on",attributes:{friendly_name:"Socket"}},
      "sensor.socket_power":{entity_id:"sensor.socket_power",state:"12",attributes:{friendly_name:"Power"}},
      "select.socket_mode":{entity_id:"select.socket_mode",state:"auto",attributes:{friendly_name:"Mode",options:["auto","manual"]}},
    },
    entities:{
      "switch.socket":{device_id:"device-a",config_entry_id:"entry-a",platform:"wiser"},
      "sensor.socket_power":{device_id:"device-a",config_entry_id:"entry-a",platform:"wiser"},
      "select.socket_mode":{device_id:"device-a",config_entry_id:"entry-a",platform:"wiser",entity_category:"config"},
    },
    devices:{"device-a":{id:"device-a",config_entries:["entry-a"],model:"Smart Plug"}},
    formatEntityName:state=>state.attributes.friendly_name,
    callWS:async()=>[],callService:async()=>{},
  };
  panel.panel={config:{panel_id:"no-card-helpers",hubs:["Home"],hub_ids:{Home:"entry-a"},card_configs:{Home:{default_view:"devices"}}}};
  await panel._openDeviceDetail("switch.socket");

  await panel._selectDetailTab("states");
  assert.equal(panel._detailCards.length,1);
  assert.equal(panel._detailCards[0].className,"detail-entity-card");
  assert.deepEqual(configuredEntityIds(panel._detailCards[0]),["sensor.socket_power"]);

  await panel._selectDetailTab("settings");
  assert.equal(panel._detailCards.length,1);
  assert.equal(panel._detailCards[0].className,"detail-entity-card");
  assert.deepEqual(configuredEntityIds(panel._detailCards[0]),["select.socket_mode"]);
  assert.equal(panel._detailCards[0].children[0].children[2].localName,"select");

  await panel._selectDetailTab("activity");
  assert.equal(panel._detailCards.length,0);
  assert.equal(panel.shadowRoot.getElementById("device-detail").children[0].className,"detail-empty");
});

test("climate details include the room climate, thermostat and every iTRV",async()=>{
  const panel=setup();
  const states={
    "climate.kitchen":{entity_id:"climate.kitchen",state:"heat",attributes:{name:"Kitchen",schedule_id:2,schedule_name:"Kitchen",is_heating:false,heating_rate:1200,percentage_demand:0,current_humidity:78,heating_type:"Unknown",number_of_heating_actuators:0,target_temperature_origin:"FromSchedule",control_direction:"Heat",heating_supported:true,cooling_supported:false}},
    "sensor.kitchen_temperature":{entity_id:"sensor.kitchen_temperature",state:"20",attributes:{friendly_name:"Kitchen temperature"}},
    "switch.kitchen_passive":{entity_id:"switch.kitchen_passive",state:"off",attributes:{friendly_name:"Kitchen passive mode"}},
    "sensor.thermostat_temperature":{entity_id:"sensor.thermostat_temperature",state:"20.1",attributes:{friendly_name:"Thermostat temperature",device_class:"temperature"}},
    "sensor.thermostat_battery":{entity_id:"sensor.thermostat_battery",state:"90",attributes:{friendly_name:"Thermostat battery",device_class:"battery"}},
    "switch.thermostat_lock":{entity_id:"switch.thermostat_lock",state:"off",attributes:{friendly_name:"Wiser Thermostat lock"}},
    "sensor.thermostat_signal":{entity_id:"sensor.thermostat_signal",state:"VeryGood",attributes:{zigbee_channel:20,displayed_signal_strength:"VeryGood",product_identifier:"NHPB/ROOMSTAT/1",product_type:"RoomStat",product_model:"RoomStat",serial_number:"STAT1",firmware:"1.0",hub_route:"direct"}},
    "sensor.itrv_temperature":{entity_id:"sensor.itrv_temperature",state:"19.8",attributes:{friendly_name:"iTRV temperature",device_class:"temperature"}},
    "sensor.itrv_battery":{entity_id:"sensor.itrv_battery",state:"80",attributes:{friendly_name:"iTRV battery",device_class:"battery"}},
    "switch.itrv_lock":{entity_id:"switch.itrv_lock",state:"off",attributes:{friendly_name:"iTRV lock"}},
    "sensor.itrv_signal":{entity_id:"sensor.itrv_signal",state:"Good",attributes:{zigbee_channel:20,displayed_signal_strength:"Good",product_identifier:"NHPB/ITRV/1",product_type:"iTRV",product_model:"iTRV",serial_number:"TRV1",firmware:"2.0",hub_route:"direct"}},
    "sensor.other_temperature":{entity_id:"sensor.other_temperature",state:"18",attributes:{friendly_name:"Other temperature"}},
  };
  panel.hass={
    user:{is_admin:true},states,
    entities:{
      "climate.kitchen":{device_id:"room",config_entry_id:"entry-a",platform:"wiser"},
      "sensor.kitchen_temperature":{device_id:"room",config_entry_id:"entry-a",platform:"wiser"},
      "switch.kitchen_passive":{device_id:"room",config_entry_id:"entry-a",platform:"wiser",entity_category:"config"},
      "sensor.thermostat_temperature":{device_id:"stat",config_entry_id:"entry-a",platform:"wiser"},
      "sensor.thermostat_battery":{device_id:"stat",config_entry_id:"entry-a",platform:"wiser"},
      "switch.thermostat_lock":{device_id:"stat",config_entry_id:"entry-a",platform:"wiser",entity_category:"config"},
      "sensor.thermostat_signal":{device_id:"stat",config_entry_id:"entry-a",platform:"wiser",entity_category:"diagnostic"},
      "sensor.itrv_temperature":{device_id:"itrv",config_entry_id:"entry-a",platform:"wiser"},
      "sensor.itrv_battery":{device_id:"itrv",config_entry_id:"entry-a",platform:"wiser"},
      "switch.itrv_lock":{device_id:"itrv",config_entry_id:"entry-a",platform:"wiser",entity_category:"config"},
      "sensor.itrv_signal":{device_id:"itrv",config_entry_id:"entry-a",platform:"wiser",entity_category:"diagnostic"},
      "sensor.other_temperature":{device_id:"other",config_entry_id:"mqtt",platform:"mqtt"},
    },
    devices:{
      room:{area_id:"kitchen",config_entries:["entry-a"],model:"Room",name:"Kitchen"},
      stat:{area_id:"kitchen",config_entries:["entry-a"],model:"RoomStat",name:"Wiser Thermostat"},
      itrv:{area_id:"kitchen",config_entries:["entry-a"],model:"iTRV",name:"Wiser iTRV"},
      other:{area_id:"kitchen",config_entries:["mqtt"],model:"Sensor",name:"Other"},
    },
    formatEntityName:state=>state.attributes.friendly_name || state.attributes.name,
    callWS:async()=>[],
  };
  panel.panel={config:{panel_id:"registry-panel",hubs:["Home"],hub_ids:{Home:"entry-a"},card_configs:{Home:{default_view:"devices"}}}};

  await panel._openDeviceDetail("climate.kitchen");
  assert.deepEqual(Array.from(panel._detailCards[0].config.entities),["climate.kitchen"]);
  assert.equal(panel._detailCards.length,1);
  const climateSummary=panel.shadowRoot.getElementById("device-detail").children[0].children[0];
  assert.equal(climateSummary.children[0].src,"__WISER_DEVICE_IMAGE_ROOMSTAT__");
  assert.equal(climateSummary.children[0].alt,"RoomStat");
  assert.equal(panel._climateProductDevice({physicalDevices:[
    {model:"iTRV"},{model:"TemperatureHumiditySensor"},
  ]}).model,"TemperatureHumiditySensor");
  assert.equal(panel._climateProductDevice({physicalDevices:[{model:"iTRV"}]}).model,"iTRV");

  await panel._selectDetailTab("states");
  assert.deepEqual(configuredEntityIds(panel._detailCards[0]),[
    "sensor.kitchen_temperature",
  ]);
  assert.deepEqual(configuredEntityIds(panel._detailCards[1]),[
    "sensor.thermostat_temperature","sensor.thermostat_battery",
  ]);
  assert.deepEqual(configuredEntityIds(panel._detailCards[2]),[
    "sensor.itrv_temperature","sensor.itrv_battery",
  ]);
  const statusDetail=panel.shadowRoot.getElementById("device-detail");
  assert.equal(statusDetail.children[0].className,"detail-columns three-column status");
  assert.equal(statusDetail.children[0].children[0].children[0].textContent,"States");
  assert.equal(statusDetail.children[0].children[1].children[0].textContent,"Devices");
  assert.equal(statusDetail.children[0].children[1].children[1].textContent,"Kitchen");
  assert.equal(statusDetail.children[0].children[1].children[3].textContent,"Thermostat");
  assert.equal(statusDetail.children[0].children[1].children[5].textContent,"iTRV");
  assert.equal(statusDetail.children[0].children[2].children[0].textContent,"Schedule");
  const scheduleRows=statusDetail.children[0].children[2].children[1].children[0];
  assert.equal(scheduleRows.children[0].children[1].textContent,"Schedule id");
  assert.equal(scheduleRows.children[0].children[2].textContent,"2");
  assert.equal(scheduleRows.children[1].children[1].textContent,"Schedule name");
  assert.equal(scheduleRows.children[1].children[2].textContent,"Kitchen");

  await panel._selectDetailTab("settings");
  assert.deepEqual(configuredEntityIds(panel._detailCards[0]),["switch.thermostat_lock"]);
  assert.equal(panel._detailCards[0].config.entities[0].name,"Lock");
  assert.deepEqual(configuredEntityIds(panel._detailCards[1]),["switch.itrv_lock"]);
  assert.equal(panel._detailCards[1].config.entities[0].name,"Lock");
  assert.deepEqual(configuredEntityIds(panel._detailCards[2]),["switch.kitchen_passive"]);
  const settingsDetail=panel.shadowRoot.getElementById("device-detail");
  assert.equal(settingsDetail.children[0].className,"detail-columns three-column settings");
  assert.equal(settingsDetail.children[0].children.length,3);
  assert.equal(settingsDetail.children[0].children[0].children[0].textContent,"Parameters");
  assert.equal(settingsDetail.children[0].children[0].className,"detail-column");
  assert.equal(settingsDetail.children[0].children[1].children[0].textContent,"Settings");
  assert.equal(settingsDetail.children[0].children[1].children[1].textContent,"Thermostat");
  assert.equal(settingsDetail.children[0].children[1].children[3].textContent,"iTRV");
  assert.equal(settingsDetail.children[0].children[2].children[0].textContent,"Seasonal comfort");

  await panel._selectDetailTab("identification");
  const detail=panel.shadowRoot.getElementById("device-detail");
  const identityList=detail.children[0].children[0].children[1];
  const zigbeeList=detail.children[0].children[1].children[1];
  assert.equal(identityList.children[0].textContent,"Thermostat");
  assert.equal(identityList.children[4].textContent,"iTRV");
  assert.equal(zigbeeList.children[0].textContent,"Thermostat");
  assert.equal(zigbeeList.children[3].textContent,"iTRV");

  await panel._selectDetailTab("activity");
  assert.deepEqual(Array.from(panel._detailCards[0].config.entities),[
    "climate.kitchen","sensor.kitchen_temperature","switch.kitchen_passive",
    "sensor.thermostat_temperature","sensor.thermostat_battery","switch.thermostat_lock",
    "sensor.itrv_temperature","sensor.itrv_battery","switch.itrv_lock",
  ]);
});

test("controls panel migrates legacy room settings before rendering",()=>{
  const panel=setup();
  panel.hass={user:{is_admin:true}};
  panel.panel={config:{panel_id:"registry-panel",hubs:["Home"],hub_ids:{Home:"entry-a"},card_configs:{Home:{room_columns:4,mobile_room_columns:2,room_types:["heating"]}}}};
  const config=panel._storedCardConfig("Home");
  assert.equal(config.type,"custom:wiser-controls-card");
  assert.equal(config.device_columns,4);
  assert.equal(config.mobile_device_columns,2);
  assert.deepEqual(Array.from(config.device_types),["heating"]);
  assert.equal(config.room_columns,undefined);
});

test("controls panel ignores stale room options while preserving valid settings",()=>{
  const panel=setup();
  panel.hass={user:{is_admin:true}};
  panel.panel={config:{panel_id:"registry-panel",hubs:["Home"],hub_ids:{Home:"entry-a"},card_configs:{Home:{room_options:{
    "sensor.removed_battery":{color:"red"},
    "light.kitchen":{color:"green"},
    "light.invalid":null,
  }}}}};
  const config=panel._storedCardConfig("Home");
  assert.deepEqual(Object.keys(config.device_options),["light.kitchen"]);
  assert.equal(config.device_options["light.kitchen"].color,"green");
});

test("controls panel ignores malformed options in saved device views",()=>{
  const panel=setup();
  panel.hass={user:{is_admin:true}};
  panel.panel={config:{panel_id:"registry-panel",hubs:["Home"],hub_ids:{Home:"entry-a"},card_configs:{Home:{
    device_view_configs:{lights:{device_options:null}},
  }}}};
  const config=panel._storedDeviceCardConfig("Home","lights");
  assert.equal(config.device_options,undefined);
});

test("rooms panel defaults mobile layouts to one device per row",()=>{
  const panel=setup();
  panel._testMedia.matches=true;
  panel.hass={user:{is_admin:true}};
  panel.panel={config:{panel_id:"registry-panel",hubs:["Home"],hub_ids:{Home:"entry-a"},card_configs:{Home:{device_columns:5}}}};
  const card=panel.shadowRoot.querySelector("main").children[0];
  assert.equal(card.config.device_columns,1);
  assert.equal(card.config.mobile_device_columns,undefined);
});

test("controls panel preserves mobile scroll across Home Assistant updates",()=>{
  const panel=setup();
  panel.hass={user:{is_admin:true}};
  panel.panel={config:{panel_id:"registry-panel",hubs:["Home"],hub_ids:{Home:"entry-a"},card_configs:{}}};
  const card=panel.shadowRoot.querySelector("main").children[0];
  Object.defineProperty(card,"hass",{set(){panel.scrollTop=0}});
  panel.scrollTop=420;
  panel.hass={user:{is_admin:true},states:{}};
  assert.equal(panel.scrollTop,420);
  panel.scrollTop=0;
  panel._testFrames.at(-1)();
  assert.equal(panel.scrollTop,420);
});

test("rooms panel reapplies the mobile default when startup misses the media change",async()=>{
  const panel=setup();
  panel.hass={user:{is_admin:true}};
  panel.panel={config:{panel_id:"registry-panel",hubs:["Home"],hub_ids:{Home:"entry-a"},card_configs:{Home:{device_columns:5}}}};
  const card=panel.shadowRoot.querySelector("main").children[0];
  assert.equal(card.config.device_columns,5);

  panel._testMedia.matches=true;
  panel.connectedCallback();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(card.config.device_columns,1);
});

test("rooms panel removes obsolete room_type and releases its media listener",async()=>{
  const panel=setup();
  panel.hass={user:{is_admin:true}};
  panel.panel={config:{panel_id:"registry-panel",hubs:["Home"],hub_ids:{Home:"entry-a"},card_configs:{Home:{room_type:"all"}}}};
  assert.equal(panel.shadowRoot.querySelector("main").children[0].config.room_type,undefined);
  await panel._openEditor();
  assert.equal(panel._drafts.Home.room_type,undefined);
  assert.equal(typeof panel._testMedia.listeners.change,"function");
  panel.disconnectedCallback();
  assert.equal(panel._testMedia.listeners.change,undefined);
});

test("rooms panel editor saves settings through the integration",async()=>{
  const panel=setup(),calls=[];
  panel.hass={user:{is_admin:true},callWS:async message=>calls.push(message)};
  panel.panel={config:{panel_id: "registry-panel",hubs:["Home"],hub_ids:{Home:"entry-a"},card_configs:{}}};
  await panel._openEditor();
  assert.equal(panel._editors[0].hideHubSelector,true);
  assert.equal(panel._editors[0].hideTitle,true);
  assert.equal(panel._editors[0].hideRoomColumns,true);
  assert.equal(panel._previews.length,1);
  assert.equal(panel._previews[0].hass,panel._hass);
  assert.equal(panel._previews[0].attributes["editor-preview"],"");
  panel._editorEntries[0].columns.listeners["value-changed"]({stopPropagation(){},detail:{value:{device_columns:4}}});
  await new Promise(resolve=>setTimeout(resolve,120));
  assert.equal(panel._previews[0].config.device_columns,4);
  assert.deepEqual(Array.from(panel._previews[0].config.hubs),["entry-a"]);
  await panel._saveEditor();
  assert.equal(calls[0].type,"wiser/panel/configure");
  assert.equal(calls[0].panel_id, "registry-panel");
  assert.deepEqual(Array.from(calls[0].configs.Home.hubs),["entry-a"]);
  assert.equal(calls[0].configs.Home.device_columns,4);
});

test("panel settings edit only the hub selected by the panel tabs",async()=>{
  const panel=setup();
  panel.hass={user:{is_admin:true}};
  panel.panel={config:{
    panel_id:"registry-panel",
    hubs:["Downstairs","Upstairs"],
    hub_ids:{Downstairs:"entry-a",Upstairs:"entry-b"},
    card_configs:{Downstairs:{device_columns:5},Upstairs:{device_columns:2}},
  }};
  panel._activeHub="Upstairs";
  await panel._openEditor();
  assert.equal(panel._editorEntries.length,1);
  const dialog=panel.shadowRoot.getElementById("editor-dialog");
  assert.equal(dialog.heading,"Upstairs - Panel settings");
  assert.equal(dialog.headerTitle,"Upstairs - Panel settings");
  assert.equal(dialog.attributes["header-title"],"Upstairs - Panel settings");
  panel._localizeControls();
  assert.equal(dialog.heading,"Upstairs - Panel settings");
  assert.equal(dialog.headerTitle,"Upstairs - Panel settings");
  assert.equal(dialog.attributes["header-title"],"Upstairs - Panel settings");
  const [upstairs]=panel._editorEntries;
  assert.equal(upstairs.hub,"Upstairs");
  assert.equal(upstairs.section.hidden,false);
  assert.equal(upstairs.hubTabs,undefined);
  assert.equal(upstairs.columns.data.device_columns,2);
  assert.equal(panel._activeEditorHub,"Upstairs");
});

test("saving panel settings preserves the selected hub tab",async()=>{
  const panel=setup();
  panel.hass={user:{is_admin:true},callWS:async()=>{}};
  panel.panel={config:{
    panel_id:"registry-panel",
    hubs:["Downstairs","Upstairs"],
    hub_ids:{Downstairs:"entry-a",Upstairs:"entry-b"},
    card_configs:{Downstairs:{device_columns:5},Upstairs:{device_columns:2}},
  }};
  panel._selectHub("Upstairs");
  await panel._openEditor();
  panel._editorEntries[0].columns.listeners["value-changed"]({
    stopPropagation(){},detail:{value:{device_columns:3}},
  });
  await panel._saveEditor();
  assert.equal(panel._activeHub,"Upstairs");
  assert.equal(panel._cards[0].hidden,true);
  assert.equal(panel._cards[1].hidden,false);
  assert.equal(panel._tabs[1].attributes["aria-selected"],"true");

  const replacement=panel._testCreatePanel();
  replacement.hass=panel._hass;
  replacement.panel={config:panel._config};
  assert.equal(replacement._activeHub,"Upstairs");
  assert.equal(replacement._cards[0].hidden,true);
  assert.equal(replacement._cards[1].hidden,false);
});

test("rooms panel uses separate desktop and mobile column counts",async()=>{
  const panel=setup();
  panel.hass={user:{is_admin:true}};
  panel.panel={config:{panel_id:"registry-panel",hubs:["Home"],hub_ids:{Home:"entry-a"},card_configs:{Home:{device_columns:4,mobile_device_columns:2}}}};
  const card=panel.shadowRoot.querySelector("main").children[0];
  assert.equal(card.config.device_columns,4);
  assert.equal(card.config.mobile_device_columns,undefined);

  panel._testMedia.matches=true;
  panel._testMedia.listeners.change();
  assert.equal(card.config.device_columns,2);
  assert.equal(card.config.mobile_device_columns,undefined);

  panel._testMedia.matches=false;
  panel._testMedia.listeners.change();
  await panel._openEditor();
  const entry=panel._editorEntries[0];
  assert.equal(entry.columns.data.device_columns,4);
  assert.equal(entry.columns.data.mobile_device_columns,undefined);
  assert.equal(entry.columns.schema[0].name,"device_columns");

  panel._testMedia.matches=true;
  panel._testMedia.listeners.change();
  assert.equal(entry.columns.data.device_columns,undefined);
  assert.equal(entry.columns.data.mobile_device_columns,2);
  assert.equal(entry.columns.schema[0].name,"mobile_device_columns");
  entry.columns.listeners["value-changed"]({stopPropagation(){},detail:{value:{mobile_device_columns:1}}});
  await new Promise(resolve=>setTimeout(resolve,120));
  assert.equal(panel._drafts.Home.device_columns,4);
  assert.equal(panel._drafts.Home.mobile_device_columns,1);
  assert.equal(entry.preview.config.device_columns,1);
  assert.equal(entry.preview.config.mobile_device_columns,undefined);
});

test("rooms panel editor switches between visual and YAML modes",async()=>{
  const panel=setup();
  panel.hass={
    user:{is_admin:true},
    localize:key=>key.endsWith("show_code_editor")?"Show code editor":"Show visual editor",
  };
  panel.panel={config:{panel_id: "registry-panel",hubs:["Home"],hub_ids:{Home:"entry-a"},card_configs:{}}};
  await panel._openEditor();

  await panel._toggleEditorMode();
  const entry=panel._editorEntries[0];
  const yaml=entry.yaml.children[0];
  assert.equal(entry.visual.hidden,true);
  assert.equal(entry.yaml.hidden,false);
  assert.equal(yaml.defaultValue.type,"custom:wiser-controls-card");
  assert.deepEqual(Object.keys(yaml.defaultValue).slice(0,4),["type","title","mobile_device_columns","hubs"]);
  assert.equal(yaml.defaultValue._panel_hide_title,undefined);

  yaml.listeners["value-changed"]({
    stopPropagation(){},
    detail:{isValid:true,value:{device_columns:2,hubs:["wrong"]}},
  });
  await new Promise(resolve=>setTimeout(resolve,120));
  assert.equal(panel._drafts.Home.device_columns,2);
  assert.deepEqual(Array.from(panel._drafts.Home.hubs),["entry-a"]);
  assert.equal(panel._previews[0].config.device_columns,2);

  yaml.listeners["value-changed"]({
    stopPropagation(){},
    detail:{isValid:false},
  });
  assert.equal(panel.shadowRoot.getElementById("save").disabled,true);

  await panel._toggleEditorMode();
  assert.equal(entry.visual.hidden,false);
  assert.equal(entry.yaml.hidden,true);
  assert.equal(entry.editor.config.device_columns,2);
  assert.equal(panel.shadowRoot.getElementById("save").disabled,false);
});

test("controls panel opens and saves feature detail editors",async()=>{
  const panel=setup();
  panel.hass={
    user:{is_admin:true},
    localize:key=>key.endsWith(".back")?"Back":key.endsWith(".feature")?"Feature":"",
  };
  panel.panel={config:{panel_id:"registry-panel",hubs:["Home"],hub_ids:{Home:"entry-a"},card_configs:{}}};
  await panel._openEditor();
  const entry=panel._editorEntries[0];
  let saved;
  entry.editor.listeners["edit-sub-element"]({
    stopPropagation(){},
    detail:{
      type:"feature",
      config:{type:"custom:wiser-test-feature",state_content:["state"]},
      context:{entity_id:"climate.lounge"},
      saveConfig:config=>{saved=config},
    },
  });
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(entry.columns.hidden,true);
  assert.equal(entry.editor.hidden,true);
  assert.equal(entry.featureDetail.hidden,false);
  const featureEditor=entry.featureState.featureEditor;
  assert.equal(featureEditor.hass,panel._hass);
  assert.equal(featureEditor.context.entity_id,"climate.lounge");
  assert.equal(featureEditor.config.type,"custom:wiser-test-feature");
  featureEditor.listeners["config-changed"]({
    stopPropagation(){},
    detail:{config:{type:"custom:wiser-test-feature",state_content:["temperature"]}},
  });
  assert.deepEqual(saved.state_content,["temperature"]);
  entry.featureState.mode.listeners.click();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(entry.featureState.visual.hidden,true);
  assert.equal(entry.featureState.code.hidden,false);
  assert.equal(entry.featureState.yaml.defaultValue.type,"custom:wiser-test-feature");
  entry.featureState.yaml.listeners["value-changed"]({
    stopPropagation(){},
    detail:{isValid:true,config:undefined,value:{type:"custom:wiser-test-feature",state_content:["current_temperature"]}},
  });
  assert.deepEqual(saved.state_content,["current_temperature"]);
  entry.featureState.mode.listeners.click();
  assert.equal(entry.featureState.visual.hidden,false);
  assert.equal(entry.featureState.code.hidden,true);
  featureEditor.listeners["config-changed"]({
    stopPropagation(){},
    detail:{config:{type:"custom:wiser-test-feature",state_content:["temperature"]}},
  });
  entry.featureState.mode.listeners.click();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(entry.featureState.yaml.defaultValue.state_content,["temperature"]);
  entry.featureDetail.children[0].children[0].listeners.click();
  assert.equal(entry.featureDetail.hidden,true);
  assert.equal(entry.columns.hidden,false);
  assert.equal(entry.editor.hidden,false);
});
