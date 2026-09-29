const {test} = require("node:test");
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {resolve} = require("node:path");
const vm = require("node:vm");

function setup() {
  class Element {
    constructor() { this.listeners={}; this.attributes={}; this.children=[]; this.hidden=false; }
    addEventListener(name,listener){this.listeners[name]=listener}
    setAttribute(name,value=""){this.attributes[name]=String(value)}
    removeAttribute(name){delete this.attributes[name]}
    toggleAttribute(name,force){if(force)this.setAttribute(name,"");else this.removeAttribute(name)}
    append(child){this.children.push(child)}
    replaceChildren(...children){this.children=children}
    setConfig(config){this.config=config;this.hassWhenConfigured=this.hass}
    focus(){}
    attachShadow(){const main=new Element(),elements=new Map();this.shadowRoot={innerHTML:"",querySelector:selector=>selector==="main"?main:null,getElementById:id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)}}}
  }
  class Card extends Element {
    static panelApiVersion=1;
    static orderConfig(config){
      const order=["type","title","room_columns","hubs"];
      return Object.fromEntries([
        ...order.filter(key=>Object.hasOwn(config,key)).map(key=>[key,config[key]]),
        ...Object.keys(config).filter(key=>!order.includes(key)).map(key=>[key,config[key]]),
      ]);
    }
    static async getConfigElement(){return new Element()}
  }
  const registry=new Map([["wiser-rooms-card",Card],["ha-yaml-editor",Element]]);
  const context=vm.createContext({HTMLElement:Element,window:{loadCardHelpers:async()=>({})},setTimeout,clearTimeout,CustomEvent:class{constructor(type,options){Object.assign(this,{type},options)}},customElements:{get:key=>registry.get(key),define:(key,value)=>registry.set(key,value)},document:{createElement:name=>name==="wiser-rooms-card"?new Card():new Element()},console:{error(){}}});
  vm.runInContext(readFileSync(resolve(__dirname,"../src/wiser-rooms-panel.js"),"utf8"),context);
  return new (registry.get("wiser-rooms-panel"))();
}

test("rooms panel creates one filtered card per hub",()=>{
  const panel=setup();
  const hass={user:{is_admin:true}};
  panel.hass=hass;
  panel.panel={config:{hubs:["Downstairs","Upstairs"],hub_ids:{Downstairs:"entry-a",Upstairs:"entry-b"},card_configs:{Upstairs:{room_columns:3}}}};
  const cards=panel.shadowRoot.querySelector("main").children;
  assert.equal(cards.length,2);
  assert.deepEqual(Array.from(cards[0].config.hubs),["entry-a"]);
  assert.equal(cards[0].config._panel_hide_title,true);
  assert.deepEqual(Array.from(cards[1].config.hubs),["entry-b"]);
  assert.equal(cards[1].config.room_columns,3);
  assert.equal(cards[0].hass,hass);
  assert.equal(cards[0].hassWhenConfigured,hass);
});

test("rooms panel editor saves settings through the integration",async()=>{
  const panel=setup(),calls=[];
  panel.hass={user:{is_admin:true},callWS:async message=>calls.push(message)};
  panel.panel={config:{hubs:["Home"],hub_ids:{Home:"entry-a"},card_configs:{}}};
  await panel._openEditor();
  assert.equal(panel._editors[0].hideHubSelector,true);
  assert.equal(panel._editors[0].hideTitle,true);
  assert.equal(panel._previews.length,1);
  assert.equal(panel._previews[0].hass,panel._hass);
  assert.equal(panel._previews[0].attributes["editor-preview"],"");
  panel._editors[0].listeners["config-changed"]({stopPropagation(){},detail:{config:{room_columns:4,hubs:["wrong"]}}});
  await new Promise(resolve=>setTimeout(resolve,120));
  assert.equal(panel._previews[0].config.room_columns,4);
  assert.deepEqual(Array.from(panel._previews[0].config.hubs),["entry-a"]);
  await panel._saveEditor();
  assert.equal(calls[0].type,"wiser/rooms_panel/configure");
  assert.deepEqual(Array.from(calls[0].configs.Home.hubs),["entry-a"]);
  assert.equal(calls[0].configs.Home.room_columns,4);
});

test("rooms panel editor switches between visual and YAML modes",async()=>{
  const panel=setup();
  panel.hass={
    user:{is_admin:true},
    localize:key=>key.endsWith("show_code_editor")?"Show code editor":"Show visual editor",
  };
  panel.panel={config:{hubs:["Home"],hub_ids:{Home:"entry-a"},card_configs:{}}};
  await panel._openEditor();

  await panel._toggleEditorMode();
  const entry=panel._editorEntries[0];
  const yaml=entry.yaml.children[0];
  assert.equal(entry.visual.hidden,true);
  assert.equal(entry.yaml.hidden,false);
  assert.equal(yaml.defaultValue.type,"custom:wiser-rooms-card");
  assert.deepEqual(Object.keys(yaml.defaultValue).slice(0,3),["type","title","hubs"]);
  assert.equal(yaml.defaultValue._panel_hide_title,undefined);

  yaml.listeners["value-changed"]({
    stopPropagation(){},
    detail:{isValid:true,value:{room_columns:2,hubs:["wrong"]}},
  });
  await new Promise(resolve=>setTimeout(resolve,120));
  assert.equal(panel._drafts.Home.room_columns,2);
  assert.deepEqual(Array.from(panel._drafts.Home.hubs),["entry-a"]);
  assert.equal(panel._previews[0].config.room_columns,2);

  yaml.listeners["value-changed"]({
    stopPropagation(){},
    detail:{isValid:false},
  });
  assert.equal(panel.shadowRoot.getElementById("save").disabled,true);

  await panel._toggleEditorMode();
  assert.equal(entry.visual.hidden,false);
  assert.equal(entry.yaml.hidden,true);
  assert.equal(entry.editor.config.room_columns,2);
  assert.equal(panel.shadowRoot.getElementById("save").disabled,false);
});
