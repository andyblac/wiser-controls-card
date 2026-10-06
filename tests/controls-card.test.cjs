const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function setup() {
  let Card, Editor;
  const elements = {};
  const context = {Intl, setTimeout, clearTimeout, window: {},
    document: {createElement() { return {style:{}, listeners:{}, append(){}, addEventListener(name, listener) { this.listeners[name] = listener; }}; }},
    CustomEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
    HTMLElement: class {
    attachShadow() { this.shadowRoot = {addEventListener() {}, append() {}, innerHTML: ''}; }
    dispatchEvent(event) { this.lastEvent = event; }
  }, customElements: {get() {}, define(name, cls) { elements[name] = cls; if (name === "wiser-controls-card") Card = cls; else if (name === "wiser-controls-card-editor") Editor = cls; }}};
  const languages = Object.fromEntries(['en-US','en-GB','de','fr'].map(language => [language,
    JSON.parse(fs.readFileSync(path.join(__dirname, `../src/localize/languages/${language}.json`), 'utf8'))]));
  const localize = fs.readFileSync(path.join(__dirname, '../src/localize/localize.js'), 'utf8')
    .replace('__WISER_ROOMS_TRANSLATIONS__', JSON.stringify(languages));
  const cardSource = fs.readFileSync(path.join(__dirname, '../src/wiser-controls-card.js'), 'utf8');
  vm.runInNewContext(`${localize}\n${cardSource}`, context);
  const calls = [];
  const state = (id, extra = {}, mode = 'auto') => ({entity_id: id, state: mode, attributes: {name:id, heating_type:'Radiator', current_temperature:20, temperature:21, hvac_modes:['auto','heat','off'], ...extra}});
  const states = {
    'climate.bedroom': state('climate.bedroom', {hvac_action:'heating'}),
    'climate.lounge': state('climate.lounge'),
    'climate.offline': state('climate.offline', {}, 'unavailable'),
    'climate.other': state('climate.other'),
    'climate.hot_water': {entity_id:'climate.hot_water',state:'auto',attributes:{temperature:55,hvac_modes:['auto','off']}},
  };
  const nativeText = {
    'ui.components.selectors.automation_behavior.trigger.options.all.label':'All',
    'ui.common.show':'Show', 'ui.common.name':'Name', 'ui.common.next':'Next', 'ui.common.state':'State', 'ui.card.climate.currently':'Current',
    'state.default.unavailable':'Unavailable',
    'component.switch.entity_component._.state.on':'On', 'component.switch.entity_component._.state.off':'Off',
    'ui.card.climate.target':'Target',
    'ui.panel.lovelace.editor.card.generic.title':'Title', 'ui.panel.lovelace.editor.card.generic.entity':'Entity',
    'ui.panel.lovelace.editor.card.generic.features':'Features', 'ui.panel.lovelace.editor.card.tile.features_position':'Features position',
    'ui.panel.lovelace.editor.card.tile.features_position_options.bottom':'Bottom',
    'ui.panel.lovelace.editor.card.tile.features_position_options.inline':'Inline',
    'ui.panel.lovelace.editor.card.tile.state_content':'State content',
    'ui.panel.lovelace.editor.card.generic.icon':'Icon', 'ui.panel.lovelace.editor.card.tile.color':'Colour',
    'ui.panel.lovelace.editor.card.tile.hide_state':'Hide state', 'ui.panel.lovelace.editor.card.generic.content':'Content',
    'ui.panel.lovelace.editor.card.generic.interactions':'Interactions',
    'component.climate.entity_component._.state_attributes.hvac_action.state.heating':'Heating',
    'component.climate.entity_component._.state_attributes.hvac_action.state.cooling':'Cooling',
    'component.climate.entity_component._.state_attributes.hvac_action.state.idle':'Idle',
    'component.climate.entity_component._.state_attributes.hvac_action.name':'Current action',
    'component.climate.entity_component._.state_attributes.percentage_demand.name':'Percentage demand',
    'component.climate.entity_component._.state_attributes.current_temperature.name':'Current temperature',
    'component.climate.entity_component._.state_attributes.temperature.name':'Target temperature',
    'panel.light':'Lights',
    'component.cover.entity_component._.state.open':'Open', 'component.cover.entity_component._.state.closed':'Closed',
    'component.cover.entity_component._.state.opening':'Opening', 'component.cover.entity_component._.state.closing':'Closing',
  };
  const card = new Card();
  card._updateDOM = function(markup) {
    if (!this.shadowRoot.activeElement) this.shadowRoot.innerHTML = markup;
  };
  card.setConfig({});
  card._hass = {states, language:'en', config:{unit_system:{temperature:'°C'}}, localize:key => nativeText[key] || key, callService:async (...args) => calls.push(args)};
  card._entries = Object.keys(states).map(entity_id => ({entity_id, platform:entity_id === 'climate.other' ? 'other' : 'wiser', config_entry_id:entity_id === 'climate.lounge' ? 'hub-b' : 'hub-a'}));
  return {card, calls, states, Editor, elements, window:context.window};
}
test('master off excludes hot water, other integrations, unavailable and already off rooms', async () => {
  const {card,calls,states} = setup();
  states['climate.lounge'].state = 'off';
  await card._allOff();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], 'set_hvac_mode');
  assert.equal(calls[0][2].entity_id, 'climate.bedroom');
  assert.equal(calls[0][2].hvac_mode, 'off');
});
test('master off attempts every eligible room and reports partial failure', async () => {
  const {card,calls} = setup();
  card._hass.callService = async (...args) => { calls.push(args); if(args[2].entity_id === 'climate.bedroom') throw Error('offline'); };
  await card._allOff();
  assert.equal(calls.length, 2);
  assert.match(card._error, /bedroom/);
  assert.equal(card._busy, false);
});
test('cancel overrides action targets only eligible overridden heating rooms', async () => {
  const {card,calls,states} = setup();
  Object.assign(states['climate.bedroom'].attributes, {is_override:true,preset_modes:['Cancel Overrides']});
  Object.assign(states['climate.lounge'].attributes, {is_override:true,next_schedule_datetime:new Date(Date.now() + 25 * 60000).toISOString(),preset_modes:['Cancel Overrides']});
  Object.assign(states['climate.offline'].attributes, {is_override:true,preset_modes:['Cancel Overrides']});
  card.setConfig({device_types:['heating']});
  assert.match(card.shadowRoot.innerHTML, /2 overrides · next ends in 25m/);
  assert.match(card.shadowRoot.innerHTML, /data-action="boost-all"[^]*data-action="follow-schedule"[^]*?data-action="cancel-overrides"[^>]*appearance="filled"[^>]*>[^]*<span class="action-label">Cancel overrides \(2\)<\/span><\/ha-button>[^]*data-action="all-off"[^>]*appearance="filled"/);
  await card._cancelAllOverrides();
  assert.equal(calls.length, 2);
  assert.equal(calls.every(call => call[0] === 'climate' && call[1] === 'set_preset_mode'), true);
  assert.equal(calls.every(call => call[2].preset_mode === 'Cancel Overrides'), true);
  assert.equal(calls.map(call => call[2].entity_id).sort().join(','), 'climate.bedroom,climate.lounge');
  assert.match(card.shadowRoot.innerHTML, /--ha-color-on-disabled-normal:var\(--secondary-text-color\)/);
});
test('follow schedule returns every eligible heating room to auto', async () => {
  const {card,calls,states} = setup();
  Object.assign(states['climate.bedroom'], {state:'heat'});
  Object.assign(states['climate.bedroom'].attributes, {schedule_id:1});
  Object.assign(states['climate.lounge'].attributes, {schedule_id:2,is_override:true});
  Object.assign(states['climate.offline'].attributes, {schedule_id:3,is_override:true});
  card.setConfig({device_types:['heating']});
  assert.match(card.shadowRoot.innerHTML, /data-action="follow-schedule"[^>]*appearance="filled"(?![^>]*disabled)/);
  await card._followHeatingSchedule();
  assert.equal(calls.length, 2);
  assert.equal(calls.every(call => call[0] === 'climate' && call[1] === 'set_hvac_mode'), true);
  assert.equal(calls.every(call => call[2].hvac_mode === 'auto'), true);
  assert.equal(calls.map(call => call[2].entity_id).sort().join(','), 'climate.bedroom,climate.lounge');
});
test('boost all offers supported durations and becomes cancel all while rooms are boosted', async () => {
  const {card,calls,states} = setup();
  const presetModes = ['Boost 30m','Boost 1h','Boost 2h','Boost 3h','Cancel Overrides'];
  Object.assign(states['climate.bedroom'].attributes, {preset_modes:presetModes});
  Object.assign(states['climate.lounge'].attributes, {preset_modes:presetModes});
  Object.assign(states['climate.offline'].attributes, {preset_modes:presetModes});
  card.setConfig({device_types:['heating']});
  assert.match(card.shadowRoot.innerHTML, /class="off boost-all[^>]*variant="danger"/);
  card._click({target:{closest:() => ({dataset:{action:'boost-menu'},disabled:false})}});
  assert.match(card.shadowRoot.innerHTML, /data-action="boost-all"[^]*data-boost-mode="Boost 30m"[^]*30 minutes[^]*data-boost-mode="Boost 3h"[^]*3 hours[^]*data-action="all-off"/);
  await card._boostAll('Boost 2h');
  assert.equal(calls.length, 2);
  assert.equal(calls.every(call => call[0] === 'climate' && call[1] === 'set_preset_mode' && call[2].preset_mode === 'Boost 2h'), true);
  assert.equal(calls.map(call => call[2].entity_id).sort().join(','), 'climate.bedroom,climate.lounge');

  Object.assign(states['climate.bedroom'].attributes, {is_boosted:true,boost_time_remaining:125});
  Object.assign(states['climate.lounge'].attributes, {is_boosted:true,boost_time_remaining:90});
  card._render();
  assert.match(card.shadowRoot.innerHTML, /data-action="cancel-all-boosts"[^>]*variant="brand"[^]*<span class="action-label"><span>Cancel all<\/span><small>90 min<\/small><\/span>/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /data-action="boost-all"|data-action="cancel-overrides"/);
  await card._cancelAllBoosts();
  assert.equal(calls.length, 4);
  assert.equal(calls.slice(2).every(call => call[2].preset_mode === 'Cancel Overrides'), true);
});
test('boost duration menu dispatches the selected preset', () => {
  const {card} = setup();
  let selected;
  card._boostAll = mode => { selected = mode; };
  const item = {dataset:{action:'boost-duration',boostMode:'Boost 2h'},disabled:false};
  card._click({target:{closest:() => item}});
  assert.equal(selected, 'Boost 2h');
});
test('explicit room selection limits master control and rejects unrelated climates', async () => {
  const {card,calls} = setup();
  card.setConfig({entities:['climate.lounge','climate.other','climate.hot_water']});
  await card._allOff();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2].entity_id, 'climate.lounge');
});
test('clearing the visual room selection restores automatic heating room discovery', async () => {
  const {card,calls} = setup();
  card.setConfig({entities:['climate.lounge']});
  card.setConfig({entities:[]});
  await card._allOff();
  assert.deepEqual(calls.map(call => call[2].entity_id).sort(), ['climate.bedroom','climate.lounge']);
});
test('hub selection filters detected rooms and master control', async () => {
  const {card,calls,Editor} = setup();
  card.setConfig({hubs:['hub-b']});
  assert.deepEqual(Array.from(card._rooms(), room => room.entity_id), ['climate.lounge']);
  await card._allOff();
  assert.deepEqual(calls.map(call => call[2].entity_id), ['climate.lounge']);

  const editor = new Editor();
  editor._hass = card._hass;
  editor._entries = card._entries;
  editor._hubs = [{entry_id:'hub-a',title:'Downstairs hub'},{entry_id:'hub-b',title:'Upstairs hub'}];
  editor.setConfig({});
  assert.equal(editor._hubForm.hidden, false);
  assert.deepEqual(Array.from(editor._hubForm.schema[0].selector.select.options, option => option.label), ['Downstairs hub','Upstairs hub']);
  assert.deepEqual(Array.from(editor._hubForm.data.hubs), ['hub-a','hub-b']);
  editor._hubForm.listeners['value-changed']({stopPropagation(){},detail:{value:{hubs:['hub-a']}}});
  assert.deepEqual(Array.from(editor._rooms(), room => room.entity_id), ['climate.bedroom','climate.offline']);
  assert.deepEqual(Array.from(editor.lastEvent.detail.config.hubs), ['hub-a']);
  editor._hubForm.listeners['value-changed']({stopPropagation(){},detail:{value:{hubs:['hub-a','hub-b']}}});
  assert.equal(editor.lastEvent.detail.config.hubs, undefined);
  assert.throws(() => card.setConfig({hubs:'hub-a'}));
});
test('temperature and mode edits call the room services', async () => {
  const {card,calls,states} = setup();
  await card._service(states['climate.bedroom'], 'set_temperature', {temperature:22});
  assert.equal(calls[0][1], 'set_temperature');
  assert.equal(calls[0][2].temperature, 22);
  await card._service(states['climate.other'], 'set_temperature', {temperature:25});
  assert.equal(calls.length, 1);
});
test('render escapes names, shows temperatures and preserves a focused edit', () => {
  const {card,states} = setup();
  states['climate.bedroom'].attributes.name = '<img src=x onerror=alert(1)>';
  card._render();
  assert.match(card.shadowRoot.innerHTML, /&lt;img/);
  assert.match(card.shadowRoot.innerHTML, /Target 21°C/);
  const before = card.shadowRoot.innerHTML;
  card.shadowRoot.activeElement = {};
  states['climate.bedroom'].attributes.temperature = 24;
  card._render();
  assert.equal(card.shadowRoot.innerHTML, before);
});
test('passive range opens full controls instead of writing a single setpoint', () => {
  const {card,states} = setup();
  card.setConfig({entities:['climate.bedroom']});
  Object.assign(states['climate.bedroom'].attributes, {target_temp_low:15,target_temp_high:22});
  card._render();
  assert.match(card.shadowRoot.innerHTML, /15°C – 22°C/);
  assert.match(card.shadowRoot.innerHTML, /Adjust temperature range/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /data-field="temperature"/);
});
test('resuming schedule enables auto then cancels an active override', async () => {
  const {card,calls,states} = setup();
  const room = states['climate.bedroom'];
  Object.assign(room.attributes, {schedule_id:1,is_override:true,preset_modes:['Cancel Overrides','Advance Schedule']});
  await card._service(room, 'set_hvac_mode', {hvac_mode:'auto'}, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0][2].hvac_mode, 'auto');
  assert.equal(calls[1][2].preset_mode, 'Cancel Overrides');
});
test('failed mode change does not cancel the override', async () => {
  const {card,calls,states} = setup();
  const room = states['climate.bedroom'];
  Object.assign(room.attributes, {is_override:true,preset_modes:['Cancel Overrides']});
  card._hass.callService = async (...args) => { calls.push(args); throw Error('failed'); };
  await card._service(room, 'set_hvac_mode', {hvac_mode:'auto'}, true);
  assert.equal(calls.length, 1);
  assert.match(card._error, /failed/);
});
test('advance button uses the supported preset only with a schedule in auto mode', () => {
  const {card,states} = setup();
  const room = states['climate.bedroom'];
  let request;
  card._service = (...args) => { request=args; };
  const event = {target:{closest:()=>({dataset:{action:'advance',entity:room.entity_id}})}};
  card._click(event);
  assert.equal(request, undefined);
  Object.assign(room.attributes, {schedule_id:1,preset_modes:['Advance Schedule']});
  card._click(event);
  assert.equal(request[1], 'set_preset_mode');
  assert.equal(request[2].preset_mode, 'Advance Schedule');
});
test('mode segments select manual or off and reject unsupported modes', () => {
  const {card,states} = setup();
  const room = states['climate.bedroom'];
  const requests = [];
  card._service = (...args) => requests.push(args);
  const click = mode => card._click({target:{closest:()=>({dataset:{action:'mode',entity:room.entity_id,mode}})}});
  click('heat'); click('off'); click('cool'); click('auto');
  assert.equal(requests.length, 2);
  assert.equal(requests[0][2].hvac_mode, 'heat');
  assert.equal(requests[1][2].hvac_mode, 'off');
  room.attributes.schedule_id = 1;
  click('auto');
  assert.equal(requests[2][3], true);
  card._render();
  assert.doesNotMatch(card.shadowRoot.innerHTML, /<select/);
  assert.match(card.shadowRoot.innerHTML, /aria-pressed="true"/);
});
test('temperature service lifecycle preserves the focused editor and retains the latest queued edit', async () => {
  const {card,calls,states} = setup();
  card._render();
  const markup = card.shadowRoot.innerHTML;
  const input = {dataset:{field:'temperature'}, value:'22'};
  card.shadowRoot.activeElement = input;
  let complete;
  card._hass.callService = (...args) => {
    calls.push(args);
    if (calls.length === 1) return new Promise(resolve => { complete=resolve; });
    return Promise.resolve();
  };
  const room = states['climate.bedroom'];
  const first = card._service(room, 'set_temperature', {temperature:22});
  await card._service(room, 'set_temperature', {temperature:22.5});
  await card._service(room, 'set_temperature', {temperature:23});
  assert.equal(card.shadowRoot.innerHTML, markup);
  complete(); await first;
  assert.equal(calls.length, 2);
  assert.equal(calls[1][2].temperature, 23);
  assert.equal(card.shadowRoot.activeElement, input);
  assert.equal(card.shadowRoot.innerHTML, markup);
  card.shadowRoot.activeElement = null;
  card._render();
  // The hub may still report the old target until its next poll.
  assert.match(card.shadowRoot.innerHTML, /value="23"/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /data-action="schedule"/);
  assert.match(card.shadowRoot.innerHTML, /data-mode="auto"/);
  room.attributes.temperature = 23;
  card._render();
  assert.equal(card._targets.size, 0);
});
test('failed temperature command clears optimistic target and reports failure', async () => {
  const {card,states} = setup();
  card._hass.callService = async () => { throw Error('hub unavailable'); };
  await card._service(states['climate.bedroom'], 'set_temperature', {temperature:23});
  assert.equal(card._targets.size, 0);
  assert.equal(card._busy, false);
  assert.match(card._error, /hub unavailable/);
});

test('temperatures use the configured Celsius or Fahrenheit unit', () => {
  const {card} = setup();
  assert.equal(card._temperature(21.6), '21.6°C');
  card._hass.config.unit_system.temperature = '°F';
  assert.equal(card._temperature(70.9), '70.9°F');
  assert.equal(card._temperature(null), '—');
});

test('cooling climate rooms use cooling status, icon, colour and fallback mode', () => {
  const {card, states} = setup();
  const room = states['climate.bedroom'];
  room.state = 'auto';
  room.attributes.hvac_action = 'cooling';
  room.attributes.hvac_modes.push('cool');
  card.setConfig({device_types:['heating']});
  const html = card.shadowRoot.innerHTML;
  assert.match(html, /class="room cooling/);
  assert.match(html, /icon="mdi:snowflake"/);
  assert.match(html, /--room-state-color:var\(--state-climate-cool-color/);
  assert.match(html, /data-mode="cool"[^>]*aria-label="Cool"/);
  assert.match(html, /1 of 3 rooms cooling · 1 unavailable/);
});

test('heating room icons distinguish active heating from idle', () => {
  const {card} = setup();
  card.setConfig({device_types:['heating']});
  const html = card.shadowRoot.innerHTML;
  assert.match(html, /data-room-icon="climate\.bedroom" icon="mdi:radiator"/);
  assert.match(html, /data-room-icon="climate\.lounge" icon="mdi:radiator-disabled"/);
});

test('card editors share entity discovery and hidden hub selectors skip config entry discovery', async () => {
  const {card, Editor} = setup();
  let entityRegistryCalls = 0;
  let configEntryCalls = 0;
  const hass = {
    ...card._hass,
    connection: {},
    callWS: async message => {
      if (message.type === 'config/entity_registry/list') {
        entityRegistryCalls += 1;
        return card._entries;
      }
      configEntryCalls += 1;
      return [];
    },
  };
  const editors = [new Editor(), new Editor()];
  for (const editor of editors) {
    editor.hideHubSelector = true;
    editor.setConfig({});
    editor.hass = hass;
  }

  await new Promise(resolve => setImmediate(resolve));

  assert.equal(entityRegistryCalls, 1);
  assert.equal(configEntryCalls, 0);
  assert.equal(editors.every(editor => editor._entries === card._entries), true);
});

test('card editor waits for hub titles before exposing discovered hubs', async () => {
  const {card, Editor} = setup();
  let resolveHubs;
  const hubs = new Promise(resolve => { resolveHubs = resolve; });
  const hass = {
    ...card._hass,
    connection: {},
    callWS: async message => message.type === 'config/entity_registry/list' ? card._entries : hubs,
  };
  const editor = new Editor();
  editor.setConfig({});
  editor.hass = hass;

  await new Promise(resolve => setImmediate(resolve));
  assert.equal(editor._entries, undefined);

  resolveHubs([{entry_id:'hub-a',title:'Downstairs hub'},{entry_id:'hub-b',title:'Upstairs hub'}]);
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(Array.from(editor._hubForm.schema[0].selector.select.options, option => option.label), ['Downstairs hub','Upstairs hub']);
});

test('room tabs include all detected heating rooms and hide/show without losing tabs', async () => {
  const {card, Editor, states} = setup();
  states['climate.bedroom'].attributes.name = 'Bedroom';
  states['climate.lounge'].attributes.name = 'Lounge';
  states['climate.offline'].attributes.name = 'Spare bedroom';
  const editor = new Editor();
  editor.setConfig({});
  editor.hass = {...card._hass, callWS: async () => card._entries};
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(editor._form.data.title, 'Wiser controls');
  assert.equal(editor._rooms().length, 3);
  assert.match(editor._tabs.innerHTML, /<ha-icon-button[^>]*data-action="hide"/);
  assert.match(editor._tabs.innerHTML, />Bedroom<\/button>/);
  assert.match(editor._tabs.innerHTML, />Lounge<\/button>/);
  assert.match(editor._tabs.innerHTML, />Spare bedroom<\/button>/);
  assert.doesNotMatch(editor._tabs.innerHTML, /<button[^>]*data-action="(?:hide|left|right)"/);
  for (const room of editor._rooms()) {
    assert.equal(editor._shown(room.entity_id), true);
    editor._selectedRoom = room.entity_id;
    editor._roomAction('hide');
  }
  card.setConfig(editor.lastEvent.detail.config);
  assert.equal(card._rooms().length, 0);
  assert.equal(editor._rooms().length, 3);
  assert.match(editor._tabs.innerHTML, /hidden-room/);
  editor._selectedRoom = 'climate.lounge';
  editor._roomAction('hide');
  card.setConfig(editor.lastEvent.detail.config);
  assert.deepEqual(Array.from(card._rooms(), room => room.entity_id), ['climate.lounge']);
});

test('initial editor selection previews the first device even when it is hidden', async () => {
  const {card, Editor} = setup();
  const editor = new Editor();
  editor.setConfig({excluded_entities:['climate.bedroom']});
  editor.hass = {...card._hass, callWS: async () => card._entries};
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(editor._selectedRoom, 'climate.bedroom');
  assert.equal(editor.lastEvent.detail.config[Symbol.for('wiser-rooms-card-preview-room')], 'climate.bedroom');
  card.hasAttribute = name => name === 'editor-preview';
  card.setConfig(editor.lastEvent.detail.config);
  assert.match(card.shadowRoot.innerHTML, /<section data-key="climate.bedroom"/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /<section data-key="climate.lounge"/);
});

test('individual editor separates named device tabs into one row per type', () => {
  const {card, Editor} = setup();
  addLight(card);
  addPlug(card);
  addPlug(card, {name:'Coffee machine'}, 'switch.coffee_machine');
  const editor = new Editor();
  editor.setConfig({});
  editor._hass = card._hass;
  editor._entries = card._entries;
  editor._render();
  const html = editor._tabs.innerHTML;
  assert.equal((html.match(/class="room-tab-bar"/g) || []).length, 3);
  assert.equal((html.match(/class="room-tabs named-tabs"/g) || []).length, 3);
  assert.equal((html.match(/class="tab-overflow-indicator (?:left|right)"/g) || []).length, 6);
  assert.match(html, /class="room-type-label"[^>]*>Heating<\/span>/);
  assert.match(html, /class="room-type-label"[^>]*>Lights<\/span>/);
  assert.match(html, /class="room-type-label"[^>]*>Appliances<\/span>/);
  assert.match(html, />Kitchen light<\/button>/);
  assert.match(html, />Lamp plug<\/button>/);
  assert.match(html, />Coffee machine<\/button>/);
  assert.doesNotMatch(html, />Lounge<\/button>/);
  assert.equal((html.match(/class="room-tools"/g) || []).length, 1);
  assert.doesNotMatch(html, />[1-9]<\/button>/);
});

test('tab overflow indicators reflect remaining scroll in each direction', () => {
  const {Editor} = setup();
  const editor = new Editor();
  const classes = new Set();
  const strip = {
    scrollLeft:0,
    clientWidth:300,
    scrollWidth:700,
    parentElement:{classList:{toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); }}},
  };
  editor._updateTabOverflow(strip);
  assert.equal(classes.has('can-scroll-left'), false);
  assert.equal(classes.has('can-scroll-right'), true);
  strip.scrollLeft = 200;
  editor._updateTabOverflow(strip);
  assert.equal(classes.has('can-scroll-left'), true);
  assert.equal(classes.has('can-scroll-right'), true);
  strip.scrollLeft = 400;
  editor._updateTabOverflow(strip);
  assert.equal(classes.has('can-scroll-left'), true);
  assert.equal(classes.has('can-scroll-right'), false);
});

test('tab overflow chevrons smoothly scroll their own row', () => {
  const {Editor} = setup();
  const editor = new Editor();
  let options;
  const strip = {clientWidth:400,scrollBy(value) { options = value; }};
  const control = {parentElement:{querySelector() { return strip; }}};
  editor._scrollTabs(control, 'right');
  assert.equal(options.left, 300);
  assert.equal(options.behavior, 'smooth');
  editor._scrollTabs(control, 'left');
  assert.equal(options.left, -300);
  assert.equal(options.behavior, 'smooth');
});

test('device selection preserves each tab row scroll position', () => {
  const {Editor} = setup();
  const editor = new Editor();
  const oldStrips = {heating:{scrollLeft:420},plugs:{scrollLeft:75}};
  editor._tabs.querySelectorAll = () => Object.entries(oldStrips).map(([deviceType, strip]) => ({
    dataset:{deviceType},querySelector() { return strip; },
  }));
  const positions = editor._tabScrollPositions();
  const newStrips = {heating:{scrollLeft:0},plugs:{scrollLeft:0}};
  editor._tabs.querySelectorAll = () => Object.entries(newStrips).map(([deviceType, strip]) => ({
    dataset:{deviceType},querySelector() { return strip; },
  }));
  editor._restoreTabScrollPositions(positions);
  assert.equal(newStrips.heating.scrollLeft, 420);
  assert.equal(newStrips.plugs.scrollLeft, 75);
});

test('mouse tab selection does not focus and scroll the rebuilt tab row', () => {
  const {Editor} = setup();
  const editor = new Editor();
  let focused = 0;
  editor._render = () => {};
  editor._dispatchConfig = () => {};
  editor._tabs.querySelector = () => ({focus() { focused += 1; }});
  editor._selectRoom('climate.lounge');
  assert.equal(focused, 0);
  editor._selectRoom('climate.bedroom', true);
  assert.equal(focused, 1);
});

test('duplicate device tab names remain distinct', () => {
  const {card, Editor} = setup();
  addPlug(card, {name:'Smart plug',room:'Kitchen'}, 'switch.kitchen_one');
  addPlug(card, {name:'Smart plug',room:'Kitchen'}, 'switch.kitchen_two');
  const editor = new Editor();
  editor.setConfig({device_types:['plugs']});
  editor._hass = card._hass;
  editor._entries = card._entries;
  editor._render();
  assert.match(editor._tabs.innerHTML, />Kitchen · Smart plug 1<\/button>/);
  assert.match(editor._tabs.innerHTML, />Kitchen · Smart plug 2<\/button>/);
});

test('room move controls retain selection, persist order and respect boundaries', () => {
  const {card, Editor} = setup();
  const editor = new Editor();
  editor.setConfig({});
  editor._entries = card._entries;
  editor._hass = card._hass;
  editor._render();
  editor._selectedRoom = 'climate.lounge';
  editor._roomAction('left');
  card.setConfig(editor.lastEvent.detail.config);
  assert.equal(card._rooms()[0].entity_id, 'climate.lounge');
  assert.equal(editor._selectedRoom, 'climate.lounge');
  editor._roomAction('left');
  assert.equal(editor._rooms()[0].entity_id, 'climate.lounge');
  editor._roomAction('right');
  assert.equal(editor._rooms()[1].entity_id, 'climate.lounge');
  const config = editor.lastEvent.detail.config;
  editor.setConfig(config);
  assert.equal(editor._rooms()[1].entity_id, 'climate.lounge');
});
test('master editor mode uses one shared room configuration and one preview card', () => {
  const {card, Editor} = setup();
  const editor = new Editor();
  editor.setConfig({device_types:['heating'],device_options:{
    'climate.bedroom':{name:'Bedroom custom',icon:'mdi:bed',color:'red',show_next_schedule:false,features:[
      {type:'custom:wiser-secondary-status-feature',entity:'climate.bedroom_itrv',state_content:['current_temperature','temperature']},
      {type:'target-temperature'},
    ]},
    'climate.lounge':{color:'blue',hide_state:false,features:[
      {type:'custom:wiser-secondary-status-feature',entity:'climate.lounge_itrv',state_content:['current_temperature','temperature']},
    ]},
  }});
  editor._entries = card._entries;
  editor._hass = card._hass;
  editor._render();
  assert.equal(editor._modeForm.hidden, false);
  editor._modeForm.listeners['value-changed']({stopPropagation(){},detail:{value:{device_configuration:'master'}}});
  let config = editor.lastEvent.detail.config;
  assert.equal(config.device_configuration, 'master');
  assert.equal(config.master_options_by_type.heating.name, 'Bedroom custom');
  assert.equal(config.master_options_by_type.heating.icon, 'mdi:bed');
  assert.equal(config.master_options_by_type.heating.color, 'red');
  assert.equal(JSON.stringify(config.master_options_by_type.heating.features), '[{"type":"target-temperature"}]');
  assert.equal(JSON.stringify(config.master_options_by_type.heating.secondary_status), '{"entities":{"climate.bedroom":"climate.bedroom_itrv","climate.lounge":"climate.lounge_itrv"},"state_content":["current_temperature","temperature"]}');
  assert.equal(card._headerItems.call({...card,_config:config}, card._hass.states['climate.bedroom'])[0].entity, 'climate.bedroom_itrv');
  assert.equal(card._headerItems.call({...card,_config:config}, card._hass.states['climate.lounge'])[0].entity, 'climate.lounge_itrv');
  assert.equal(card._headerItems.call({...card,_config:config}, card._hass.states['climate.offline'])[0].entity, undefined);
  assert.equal(editor._nativeEditor.features.some(feature => feature.type === 'custom:wiser-secondary-status-feature'), false);
  assert.equal(editor._roomForm.data.secondary_status_content.join(','), 'current_temperature,temperature');
  assert.equal(editor._roomForm.data.secondary_status_room_0, 'climate.bedroom_itrv');
  assert.equal(editor._roomForm.data.secondary_status_room_1, 'climate.lounge_itrv');
  assert.equal(config.device_options, undefined);
  assert.equal(editor._tabs.hidden, true);
  assert.equal(editor._tabs.innerHTML, '');
  editor._setRoomOptions({color:'green',hide_state:true});
  editor._setRoomOptions({secondary_status:{entities:{
    'climate.bedroom':'climate.bedroom_itrv_new','climate.lounge':'climate.lounge_itrv',
  },state_content:['current_temperature']}});
  editor._saveNativeFeatures(editor._selectedRoom, [{type:'climate-hvac-modes'}]);
  config = editor.lastEvent.detail.config;
  assert.equal(config.master_options_by_type.heating.color, 'green');
  assert.equal(config.master_options_by_type.heating.hide_state, true);
  assert.equal(config.device_options, undefined);
  assert.equal(JSON.stringify(config.master_options_by_type.heating.features), '[{"type":"climate-hvac-modes"}]');
  assert.equal(JSON.stringify(config.master_options_by_type.heating.secondary_status), '{"entities":{"climate.bedroom":"climate.bedroom_itrv_new","climate.lounge":"climate.lounge_itrv"},"state_content":["current_temperature"]}');
  card.parentElement = {localName:'hui-dialog-edit-card'};
  card.setConfig(config);
  assert.equal((card.shadowRoot.innerHTML.match(/class="room-content(?: [^"]*)?"/g) || []).length, 1);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /<section[^>]*preview-placeholder/);
  assert.match(card.shadowRoot.innerHTML, /style="--room-columns:1"/);
  const savedMasterConfig = JSON.parse(JSON.stringify(config));
  card.setConfig(savedMasterConfig);
  assert.equal((card.shadowRoot.innerHTML.match(/class="room-content(?: [^"]*)?"/g) || []).length, 1);
  assert.match(card.shadowRoot.innerHTML, /class="room [^"]*preview-selected/);
  card.setConfig({...savedMasterConfig,excluded_entities:['climate.bedroom'],[Symbol.for('wiser-rooms-card-preview-room')]:'climate.bedroom'});
  assert.equal((card.shadowRoot.innerHTML.match(/class="room-content(?: [^"]*)?"/g) || []).length, 1);
  assert.match(card.shadowRoot.innerHTML, /data-key="climate\.bedroom"/);
  card.parentElement = null;
  card.setConfig(savedMasterConfig);
  const dashboardRooms = card._rooms().length;
  assert.equal((card.shadowRoot.innerHTML.match(/class="room-content(?: [^"]*)?"/g) || []).length, dashboardRooms);
  assert.equal((card.shadowRoot.innerHTML.match(/class="top[^"]*hide-status/g) || []).length, dashboardRooms);
  editor._modeForm.listeners['value-changed']({stopPropagation(){},detail:{value:{device_configuration:'individual'}}});
  config = editor.lastEvent.detail.config;
  assert.equal(config.device_configuration, undefined);
  assert.equal(config.master_options_by_type, undefined);
  assert.equal(config.device_options['climate.bedroom'].color, 'green');
  assert.equal(config.device_options['climate.lounge'].color, 'green');
  assert.equal(config.device_options['climate.bedroom'].secondary_status.entity, 'climate.bedroom_itrv_new');
  assert.equal(config.device_options['climate.lounge'].secondary_status.entity, 'climate.lounge_itrv');
  assert.equal(config.device_options['climate.offline'].secondary_status.entity, undefined);
  assert.equal(config.device_options['climate.offline'].secondary_status.entities, undefined);
  assert.equal(editor._tabs.hidden, false);
});
test('master mode gives each newly added room type clean defaults', () => {
  const {card, Editor} = setup();
  const plug = addPlug(card);
  const editor = new Editor();
  editor._entries = card._entries;
  editor._hass = card._hass;
  editor.setConfig({device_types:['heating'],device_options:{
    'climate.bedroom':{features:[
      {type:'custom:wiser-secondary-status-feature',state_content:['current_temperature']},
      {type:'climate-hvac-modes'},
      {type:'target-temperature'},
    ]},
  }});
  editor._modeForm.listeners['value-changed']({stopPropagation(){},detail:{value:{device_configuration:'master'}}});
  editor._typeForm.listeners.click({target:{closest:()=>({dataset:{roomType:'plugs'}})}});
  let config = editor.lastEvent.detail.config;
  assert.equal(config.device_configuration, 'master');
  assert.deepEqual(Array.from(config.device_types), ['heating','plugs']);
  assert.equal(editor._modeForm.hidden, false);
  assert.equal(config.master_options_by_type.heating.features[0].type, 'climate-hvac-modes');
  assert.equal(config.master_options_by_type.heating.secondary_status.state_content.join(','), 'current_temperature');
  assert.equal(config.master_options_by_type.plugs, undefined);
  assert.match(editor._tabs.innerHTML, />Heating<\/button>/);
  assert.match(editor._tabs.innerHTML, />Appliances<\/button>/);
  assert.match(editor._tabs.innerHTML, />Heating<\/button>[^]*>Appliances<\/button>/);
  editor._tabs.listeners.click({target:{closest:()=>({dataset:{room:'switch.lamp'}})},stopPropagation(){}});
  assert.equal(editor._selectedRoom, 'switch.lamp');
  assert.equal(editor._nativeEditor.features.map(feature => feature.type).join(','), 'toggle');
  assert.equal(editor._roomForm.data.hide_state, false);
  assert.equal(editor._roomForm.data.state_content.join(','), 'state');
  editor._setRoomOptions({secondary_status:{entities:{'switch.lamp':'sensor.lamp_power'},state_content:['state']}});
  editor._saveNativeFeatures('switch.lamp', [{type:'toggle'}]);
  config = editor.lastEvent.detail.config;
  assert.equal(JSON.stringify(config.master_options_by_type.plugs.secondary_status.entities),
    '{"switch.lamp":"sensor.lamp_power"}');
  editor._typeForm.listeners.click({target:{closest:()=>({dataset:{roomType:'plugs'}})}});
  assert.equal(editor.lastEvent.detail.config.master_options_by_type.plugs, undefined);
  editor._typeForm.listeners.click({target:{closest:()=>({dataset:{roomType:'plugs'}})}});
  config = editor.lastEvent.detail.config;
  assert.equal(config.master_options_by_type.plugs, undefined);
  card._config = config;
  assert.equal(card._headerItems(plug).length, 0);
  editor._modeForm.listeners['value-changed']({stopPropagation(){},detail:{value:{device_configuration:'individual'}}});
  config = editor.lastEvent.detail.config;
  assert.equal(config.device_options['climate.bedroom'].features.map(feature => feature.type).join(','),
    'climate-hvac-modes,target-temperature');
  assert.equal(config.device_options['climate.bedroom'].secondary_status.state_content.join(','), 'current_temperature');
});
test('master type tabs select a visible representative when the first room is hidden', () => {
  const {card, Editor} = setup();
  addPlug(card);
  const editor = new Editor();
  editor._entries = card._entries;
  editor._hass = card._hass;
  editor.setConfig({
    device_types:['heating','plugs'],
    device_configuration:'master',
    excluded_entities:['climate.bedroom'],
    master_options_by_type:{heating:{},plugs:{}},
  });
  assert.match(editor._tabs.innerHTML, /title="Heating" data-room="climate\.lounge"/);
  editor._tabs.listeners.click({target:{closest:()=>({dataset:{room:'climate.lounge'}})}});
  assert.equal(editor._selectedRoom, 'climate.lounge');
  assert.match(editor._tabs.innerHTML, /data-room="climate\.lounge" aria-selected="true"/);
});
test('editor preserves explicit selections and layout when updating title', () => {
  const {card, Editor} = setup();
  const editor = new Editor();
  editor.setConfig({entities:['climate.lounge'], grid_options:{columns:9}});
  editor._entries = card._entries;
  editor._hass = card._hass;
  editor._render();
  editor._changed({stopPropagation() {}, detail:{value:{...editor._form.data,title:'Upstairs'}}});
  card.setConfig(editor.lastEvent.detail.config);
  assert.equal(card._rooms().length, 1);
  assert.equal(card._config.title, 'Upstairs');
  assert.equal(card._config.grid_options.columns, 9);
  editor._selectedRoom = 'climate.bedroom';
  editor._roomAction('hide');
  card.setConfig(editor.lastEvent.detail.config);
  assert.equal(card._rooms().length, 2);
});

test('editor emits card and room YAML settings in a stable logical order', () => {
  const {Editor, elements} = setup();
  const Card = elements['wiser-controls-card'];
  assert.deepEqual(Object.keys(Card.orderConfig({hubs:['entry-a'],mobile_device_columns:1,device_columns:3,type:'custom:wiser-controls-card'})), [
    'type','device_columns','mobile_device_columns','hubs',
  ]);
  const editor = new Editor();
  editor.setConfig({
    grid_options:{columns:'full'},
    device_options:{'climate.bedroom':{
      icon_tap_action:{action:'more-info'},
      features:[{state_content:['state'],entity:'sensor.bedroom',type:'custom:wiser-secondary-status-feature'}],
      show_next_schedule:true,
      color:'state',
      name:[{type:'area'}],
    }},
    device_configuration:'individual',
    device_order:['climate.bedroom'],
    excluded_entities:['climate.lounge'],
    device_types:['heating'],
    device_columns:3,
    title:'Heating',
    type:'custom:wiser-controls-card',
  });
  editor._dispatchConfig();
  const config = editor.lastEvent.detail.config;
  assert.deepEqual(Object.keys(config), [
    'type','title','device_columns','device_types','excluded_entities','device_order','device_configuration','device_options','grid_options',
  ]);
  assert.deepEqual(Object.keys(config.device_options['climate.bedroom']), [
    'secondary_status','features','icon_tap_action',
  ]);
  assert.deepEqual(Object.keys(config.device_options['climate.bedroom'].secondary_status), [
    'entity','state_content',
  ]);
});

test('legacy room configuration migrates to the controls card device schema', () => {
  const {card, Editor, elements} = setup();
  const legacy = {
    type:'custom:wiser-rooms-card',
    room_columns:3,
    mobile_room_columns:1,
    room_types:['heating'],
    room_order:['climate.bedroom'],
    room_configuration:'individual',
    room_options:{'climate.bedroom':{color:'state'}},
  };
  card.setConfig(legacy);
  assert.equal(card._config.type, 'custom:wiser-controls-card');
  assert.equal(card._config.device_columns, 3);
  assert.equal(card._config.room_columns, undefined);
  const ordered = elements['wiser-controls-card'].orderConfig(legacy);
  assert.deepEqual(Object.keys(ordered), [
    'type','device_columns','mobile_device_columns','device_types','device_order','device_configuration',
  ]);
  const editor = new Editor();
  editor.setConfig(legacy);
  assert.equal(editor.lastEvent.detail.config.type, 'custom:wiser-controls-card');
  assert.equal(editor.lastEvent.detail.config.device_options, undefined);
  assert.equal(editor.lastEvent.detail.config.room_options, undefined);
});

test('clearing Title in the UI editor removes it from the card', () => {
  const {card, Editor} = setup();
  const editor = new Editor();
  editor.setConfig({});
  editor._entries = card._entries;
  editor._hass = card._hass;
  editor._render();
  editor._changed({stopPropagation() {},detail:{value:{...editor._form.data,title:null}}});
  const config = editor.lastEvent.detail.config;
  assert.equal(config.title, '');
  assert.equal(editor._form.data.title, '');
  card.setConfig(config);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /<h2>|data-key="header"/);
  card.setConfig({device_types:['heating'],title:''});
  assert.match(card.shadowRoot.innerHTML, /<header data-key="header" class=""><div><h2>Heating<\/h2>/);
  assert.match(card.shadowRoot.innerHTML, /data-action="follow-schedule"/);
  card.setConfig({device_types:['plugs'],title:''});
  assert.match(card.shadowRoot.innerHTML, /<h2>Appliances<\/h2>/);
  card.setConfig({device_types:['heating'],title:'Wiser rooms',_panel_hide_title:true});
  assert.doesNotMatch(card.shadowRoot.innerHTML, /<h2>/);
  assert.match(card.shadowRoot.innerHTML, /data-action="follow-schedule"/);
});

test('editor preview shows only the selected room and never saves the selection', () => {
  const {card, Editor} = setup();
  const editor = new Editor();
  editor.setConfig({device_columns:5});
  editor._hass = card._hass;
  editor._entries = card._entries;
  editor._selectRoom('climate.lounge');
  const config = editor.lastEvent.detail.config;
  card.hasAttribute = name => name === 'editor-preview';
  card.setConfig(config);
  assert.match(card.shadowRoot.innerHTML, /data-key="climate.lounge" class="room  preview-selected"/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /<section data-key="climate.bedroom"/);
  assert.match(card.shadowRoot.innerHTML, /style="--room-columns:1"/);
  assert.equal((card.shadowRoot.innerHTML.match(/class="room-content(?: [^"]*)?"/g) || []).length, 1);
  card.hasAttribute = () => false;
  card._render();
  assert.doesNotMatch(card.shadowRoot.innerHTML, /class="room  preview-selected"/);
  assert.match(card.shadowRoot.innerHTML, /<section data-key="climate.bedroom"/);
  assert.equal(Object.getOwnPropertySymbols(JSON.parse(JSON.stringify(config))).length, 0);
});

function addShutter(card, extra = {}, entity_id = 'cover.office') {
  const shutter = {entity_id,state:'open',attributes:{name:'Office shutter',room:'Office',shutter_id:7,current_position:50,supported_features:15,...extra}};
  card._hass.states[shutter.entity_id] = shutter;
  card._entries.push({entity_id:shutter.entity_id,platform:'wiser'});
  return shutter;
}
function addLight(card, extra = {}, entity_id = 'light.kitchen') {
  const light = {entity_id,state:'on',attributes:{name:'Kitchen light',product_type:'Dimmer',room:'Kitchen',brightness:128,schedule_id:3,next_schedule_change:'18:00',next_schedule_state:'On',...extra}};
  card._hass.states[entity_id] = light;
  card._entries.push({entity_id,platform:'wiser',config_entry_id:'hub-a'});
  return light;
}
function addPlug(card, extra = {}, entity_id = 'switch.lamp') {
  const plug = {entity_id,state:'on',attributes:{name:'Lamp plug',room:'Lounge',output_state:'On',schedule_id:4,next_schedule_change:'22:00',next_schedule_state:'Off',...extra}};
  card._hass.states[entity_id] = plug;
  card._entries.push({entity_id,platform:'wiser',config_entry_id:'hub-a'});
  return plug;
}
test('appliances show related power usage as their primary reading', () => {
  const {card} = setup();
  addPlug(card);
  const plugEntry = card._entries.find(entry => entry.entity_id === 'switch.lamp');
  plugEntry.device_id = 'device-lamp';
  card._hass.states['sensor.lamp_power'] = {entity_id:'sensor.lamp_power',state:'1360',attributes:{device_class:'power',unit_of_measurement:'W'}};
  card._entries.push({entity_id:'sensor.lamp_power',platform:'wiser',config_entry_id:'hub-a',device_id:'device-lamp'});
  card.setConfig({device_types:['plugs']});
  assert.match(card.shadowRoot.innerHTML, /class="temps">1\.36kW<\/div>/);

  card._hass.states['sensor.lamp_power'].state = '42.567';
  card.setConfig({device_types:['plugs']});
  assert.match(card.shadowRoot.innerHTML, /class="temps">42\.57W<\/div>/);

  card._hass.states['sensor.lamp_power'].state = 'unavailable';
  card.setConfig({device_types:['plugs']});
  assert.match(card.shadowRoot.innerHTML, /class="temps">On<\/div>/);

  card._hass.states['switch.lamp'].state = 'off';
  card._hass.states['sensor.lamp_power'].state = '0';
  card.setConfig({device_types:['plugs']});
  assert.match(card.shadowRoot.innerHTML, /class="temps">Off<\/div>/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /class="temps">0W<\/div>/);
});
test('card suggestions are offered only for supported Wiser entities', () => {
  const {card, window} = setup();
  addShutter(card);
  addLight(card);
  addPlug(card);
  card._hass.states['sensor.outside'] = {entity_id:'sensor.outside',state:'12',attributes:{}};
  card._hass.states['climate.generic'] = {entity_id:'climate.generic',state:'heat',attributes:{hvac_modes:['heat']}};
  const registration = window.customCards.find(item => item.type === 'wiser-controls-card');
  assert.equal(typeof registration.getEntitySuggestion, 'function');
  assert.equal(registration.documentationURL, 'https://github.com/andyblac/wiser-controls-card/wiki');
  for (const entityId of ['climate.bedroom','cover.office','light.kitchen','switch.lamp']) {
    assert.deepEqual(JSON.parse(JSON.stringify(registration.getEntitySuggestion(card._hass, entityId))), {
      config:{type:'custom:wiser-controls-card',entities:[entityId]},
    });
  }
  assert.equal(registration.getEntitySuggestion(card._hass, 'sensor.outside'), null);
  assert.equal(registration.getEntitySuggestion(card._hass, 'climate.generic'), null);
  assert.equal(registration.getEntitySuggestion(card._hass, 'climate.missing'), null);
});
function addModeSelect(card, device, state = 'Manual') {
  const entry = card._entries.find(item => item.entity_id === device.entity_id);
  entry.device_id = `device-${device.entity_id}`;
  const entity_id = `select.${device.entity_id.replace('.', '_')}_mode`;
  const select = {entity_id,state,attributes:{friendly_name:`${device.attributes.name} Mode`,options:['Auto','Manual']}};
  card._hass.states[entity_id] = select;
  card._entries.push({entity_id,platform:'wiser',config_entry_id:entry.config_entry_id,device_id:entry.device_id});
  return select;
}
test('All Heating Shutters filters include only detected Wiser entities', () => {
  const {card, Editor} = setup();
  addShutter(card);
  card._hass.states['cover.other'] = {entity_id:'cover.other',state:'open',attributes:{}};
  card._entries.push({entity_id:'cover.other',platform:'wiser'});
  assert.equal(card._rooms().length, 4);
  card.setConfig({device_types:['heating']});
  assert.equal(card._rooms().length, 3);
  card.setConfig({device_types:['shutters']});
  assert.deepEqual(Array.from(card._rooms(), r => r.entity_id), ['cover.office']);
  assert.match(card.shadowRoot.innerHTML, /data-service="open_cover"/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /data-field="temperature"/);
  const editor = new Editor();
  editor._hass = card._hass; editor._entries = card._entries;
  editor.setConfig({device_types:['shutters']});
  assert.equal(editor._rooms().length, 1);
  assert.equal(Array.from(editor._typeForm.data.device_types).join(','), 'shutters');
  assert.throws(() => card.setConfig({device_types:['invalid']}));
  assert.throws(() => card.setConfig({device_types:[]}));
});

test('Show uses compact native buttons and supports multiple device types', () => {
  const {card,Editor} = setup(); addShutter(card); addLight(card); addPlug(card);
  const editor = new Editor(); editor._hass = card._hass; editor._entries = card._entries; editor.setConfig({});
  assert.match(editor._typeForm.innerHTML, /data-room-type="all"[^]*data-room-type="plugs"[^]*data-room-type="heating"[^]*data-room-type="lights"[^]*data-room-type="shutters"/);
  assert.match(editor._typeForm.innerHTML, /<ha-button[^>]*data-room-type="all"/);
  assert.match(editor._typeForm.innerHTML, /<ha-button[^>]*variant="brand"[^>]*appearance="filled"[^>]*data-room-type="heating"/);
  assert.match(fs.readFileSync(path.join(__dirname, '../src/wiser-controls-card.js'), 'utf8'), /\.show-options ha-button\[appearance="filled"\]::part\(base\)[^{]*\{[^}]*border-color:currentColor/);
  assert.match(fs.readFileSync(path.join(__dirname, '../src/wiser-controls-card.js'), 'utf8'), /\.show-options ha-button\[appearance="outlined"\]::part\(base\)[^{]*\{[^}]*color:var\(--state-inactive-color\);border-color:var\(--state-inactive-color\)/);
  const choose = roomType => editor._typeForm.listeners.click({target:{closest:()=>({dataset:{roomType}})}});
  choose('heating');
  assert.equal(Array.from(editor.lastEvent.detail.config.device_types).join(','), 'heating');
  assert.match(editor._typeForm.innerHTML, /<ha-button[^>]*variant="neutral"[^>]*appearance="outlined"[^>]*data-room-type="all"/);
  choose('shutters');
  assert.equal(Array.from(editor.lastEvent.detail.config.device_types).join(','), 'heating,shutters');
  assert.deepEqual(Array.from(editor._rooms(), room => room.entity_id), ['climate.bedroom','climate.lounge','climate.offline','cover.office']);
  card.setConfig({device_types:['heating','shutters']});
  assert.match(card.shadowRoot.innerHTML, /data-key="section-heating"/);
  assert.match(card.shadowRoot.innerHTML, /data-key="section-shutters"/);
  choose('heating');
  assert.equal(Array.from(editor.lastEvent.detail.config.device_types).join(','), 'shutters');
  choose('all');
  assert.equal(editor.lastEvent.detail.config.device_types, undefined);
});

test('multi-channel heating exposes an optional visual split into channel sections', () => {
  const {card, Editor, states} = setup();
  states['climate.bedroom'].attributes.hydronic_channel_selection = 1;
  states['climate.lounge'].attributes.hydronic_channel_selection = 2;
  delete states['climate.offline'].attributes.hydronic_channel_selection;
  const editor = new Editor();
  editor._hass = card._hass;
  editor._entries = card._entries;
  editor.setConfig({device_types:['heating']});
  assert.equal(editor._form.schema.some(field => field.name === 'split_heating_channels'), true);
  assert.equal(editor._form.data.split_heating_channels, false);
  editor._changed({stopPropagation(){},detail:{value:{...editor._form.data,split_heating_channels:true}}});
  assert.equal(editor.lastEvent.detail.config.split_heating_channels, true);
  card.setConfig(editor.lastEvent.detail.config);
  const html = card.shadowRoot.innerHTML;
  assert.match(html, /data-key="section-heating-channel-1"[^]*<h3>Heating channel 1<\/h3>/);
  assert.match(html, /data-key="section-heating-channel-2"[^]*<h3>Heating channel 2<\/h3>/);
  assert.match(html, /data-key="section-heating-channel-3"[^]*<h3>Heating — No channel<\/h3>/);
  assert.match(html, /data-key="rooms-heating-channel-1"[^]*data-key="climate\.bedroom"/);
  assert.match(html, /data-key="rooms-heating-channel-2"[^]*data-key="climate\.lounge"/);
  assert.match(html, /data-key="rooms-heating-channel-3"[^]*data-key="climate\.offline"/);
  assert.equal((html.match(/data-action="boost-menu"/g) || []).length, 1);
  assert.throws(() => card.setConfig({split_heating_channels:'yes'}));
});

test('dashboard cards migrate entity settings into one configuration per hub', () => {
  const {card, Editor} = setup();
  addPlug(card);
  const hubs = [{entry_id:'hub-a',title:'Downstairs hub'},{entry_id:'hub-b',title:'Upstairs hub'}];
  const editor = new Editor();
  editor._hass = card._hass;
  editor._entries = card._entries;
  editor._hubs = hubs;
  editor.setConfig({
    type:'custom:wiser-controls-card',
    device_order:['climate.bedroom','climate.offline','switch.lamp','climate.lounge'],
    excluded_entities:['climate.offline'],
    device_options:{
      'climate.bedroom':{color:'red'},
      'climate.lounge':{color:'blue'},
    },
  });
  assert.equal(editor._form.schema.some(field => field.name === 'split_hubs'), true);
  assert.equal(editor._form.data.split_hubs, true);
  assert.equal(editor._hubTabs.hidden, false);
  assert.match(editor._hubTabs.innerHTML, /Downstairs hub/);
  assert.match(editor._hubTabs.innerHTML, /Upstairs hub/);
  assert.deepEqual(Array.from(editor._editorRooms(), room => room.entity_id), ['climate.bedroom','climate.offline','switch.lamp']);
  editor._selectEditorHub('hub-b');
  assert.deepEqual(Array.from(editor._editorRooms(), room => room.entity_id), ['climate.lounge']);
  assert.equal(editor.lastEvent.detail.config.split_hubs, true);
  assert.deepEqual(Array.from(editor.lastEvent.detail.config.hubs), ['hub-a','hub-b']);
  assert.deepEqual(Array.from(editor.lastEvent.detail.config.hub_configs, config => config.hub), ['hub-a','hub-b']);
  assert.equal(editor._hubConfigEditor._version.hidden, true);
  assert.equal(editor.lastEvent.detail.config.hub_configs[0].device_columns, undefined);
  assert.equal(editor.lastEvent.detail.config.hub_configs[1].device_columns, undefined);
  assert.deepEqual(Array.from(editor.lastEvent.detail.config.hub_configs[0].device_order), ['climate.bedroom','climate.offline','switch.lamp']);
  assert.deepEqual(Array.from(editor.lastEvent.detail.config.hub_configs[1].device_order), ['climate.lounge']);
  assert.deepEqual(Object.keys(editor.lastEvent.detail.config.hub_configs[0].device_options), ['climate.bedroom']);
  assert.deepEqual(Object.keys(editor.lastEvent.detail.config.hub_configs[1].device_options), ['climate.lounge']);
  assert.equal(editor.lastEvent.detail.config.device_order, undefined);
  assert.equal(editor.lastEvent.detail.config.device_options, undefined);

  card._hubs = hubs;
  card.setConfig(editor.lastEvent.detail.config);
  const html = card.shadowRoot.innerHTML;
  assert.match(html, /class="hub-cards"/);
  card.hasAttribute = name => name === 'editor-preview';
  card._config[Symbol.for('wiser-rooms-card-preview-room')] = 'climate.offline';
  const hubPreviewConfig = card._effectiveHubConfig(card._hubConfigEntries()[0]);
  const hubPreview = new card.constructor();
  hubPreview._updateDOM = function(markup) { this.shadowRoot.innerHTML = markup; };
  hubPreview.hasAttribute = name => name === 'editor-preview';
  hubPreview._entries = card._entries;
  hubPreview._hubs = hubs;
  hubPreview.setConfig(hubPreviewConfig);
  hubPreview.hass = card._hass;
  assert.match(hubPreview.shadowRoot.innerHTML, /<section data-key="climate.offline"/);
  assert.match(hubPreview.shadowRoot.innerHTML, /<section data-key="switch.lamp"/);
  assert.doesNotMatch(hubPreview.shadowRoot.innerHTML, /<section data-key="climate.bedroom"/);
  assert.equal((hubPreview.shadowRoot.innerHTML.match(/class="room-content(?: [^"]*)?"/g) || []).length, 2);
  card.hasAttribute = () => false;
  card.setConfig({...editor.lastEvent.detail.config,split_hubs:false});
  assert.doesNotMatch(card.shadowRoot.innerHTML, /class="hub-cards"/);
  assert.match(card.shadowRoot.innerHTML, /data-key="climate\.bedroom"/);
  assert.match(card.shadowRoot.innerHTML, /data-key="climate\.lounge"/);
  assert.match(card.shadowRoot.innerHTML, /data-key="switch\.lamp"/);

  editor._config = {
    ...editor._config,
    split_hubs:false,
    hub_configs:editor._config.hub_configs.map(config => config.hub === editor._editingHub
      ? {...config,device_configuration:'master'} : config),
  };
  editor._dispatchConfig();
  card.hasAttribute = name => name === 'editor-preview';
  card.setConfig(editor.lastEvent.detail.config);
  assert.equal((card.shadowRoot.innerHTML.match(/class="room [^"]*preview-selected/g) || []).length, 1);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /<section[^>]*preview-placeholder/);
  assert.throws(() => card.setConfig({split_hubs:'yes'}));

  const panelEditor = new Editor();
  panelEditor.hideHubSelector = true;
  panelEditor._hass = card._hass;
  panelEditor._entries = card._entries;
  panelEditor._hubs = hubs;
  panelEditor.setConfig({});
  assert.equal(panelEditor._form.schema.some(field => field.name === 'split_hubs'), false);
  assert.equal(panelEditor._hubTabs.hidden, true);
});

test('combined hub configuration preserves its explicit device order', () => {
  const {card} = setup();
  card.setConfig({
    hubs:['hub-a'],
    split_hubs:false,
    hub_configs:[{
      hub:'hub-a',
      device_order:['climate.offline','climate.bedroom'],
    }],
  });
  assert.deepEqual(Array.from(card._rooms(), room => room.entity_id), [
    'climate.offline',
    'climate.bedroom',
  ]);
});

test('shutter controls call cover services and respect feature and position limits', async () => {
  const {card,calls} = setup(); const shutter = addShutter(card);
  for (const service of ['open_cover','stop_cover','close_cover']) await card._shutterService(shutter, service);
  await card._shutterService(shutter,'set_cover_position',75);
  assert.deepEqual(calls.map(call => call[1]), ['open_cover','stop_cover','close_cover','set_cover_position']);
  assert.ok(calls.every(call => call[0] === 'cover'));
  assert.equal(calls[3][2].position,75);
  await card._shutterService(shutter,'set_cover_position',101);
  shutter.attributes.supported_features = 1;
  await card._shutterService(shutter,'close_cover');
  shutter.state = 'unavailable';
  await card._shutterService(shutter,'open_cover');
  assert.equal(calls.length,4);
});
test('All off never operates shutters and filtered shutters reject heating calls', async () => {
  const {card,calls} = setup(); const shutter = addShutter(card);
  await card._allOff();
  assert.equal(calls.length,2);
  assert.ok(calls.every(call => call[0] === 'climate'));
  await card._service(shutter,'set_temperature',{temperature:22});
  card.setConfig({device_types:['shutters']});
  await card._allOff();
  assert.equal(calls.length,2);
  card.setConfig({device_types:['heating']});
  await card._shutterService(shutter,'open_cover');
  assert.equal(calls.length,2);
});
test('Shutters filter replaces All off with Close all and closes eligible shutters', async () => {
  const {card,calls} = setup();
  addShutter(card);
  addShutter(card, {name:'Closed shutter'}, 'cover.closed').state = 'closed';
  addShutter(card, {name:'Unsupported shutter',supported_features:1}, 'cover.unsupported');
  card.setConfig({device_types:['shutters']});
  assert.match(card.shadowRoot.innerHTML, /data-action="all-close"/);
  assert.match(card.shadowRoot.innerHTML, /mdi:window-shutter/);
  assert.match(card.shadowRoot.innerHTML, /<ha-button[^>]*data-action="all-close"[^>]*>.*<span class="action-label">Close all<\/span><\/ha-button>/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /data-action="all-off"/);
  await card._closeAll();
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],'cover');
  assert.equal(calls[0][1],'close_cover');
  assert.equal(calls[0][2].entity_id,'cover.office');
});
test('Close all reports individual shutter failures and releases busy state', async () => {
  const {card,calls} = setup(); const shutter = addShutter(card);
  card.setConfig({device_types:['shutters']});
  card._hass.callService = async (...args) => { calls.push(args); throw Error('jammed'); };
  await card._closeAll();
  assert.equal(calls.length,1);
  assert.match(card._error,/Could not close: Office shutter/);
  assert.equal(card._busy,false);
  shutter.state = 'closed'; card._render();
  assert.match(card.shadowRoot.innerHTML, /<ha-button[^>]*data-action="all-close"[^>]*disabled/);
});
test('shutter failures are reported and release the busy state', async () => {
  const {card} = setup(); const shutter = addShutter(card);
  card._hass.callService = async () => { throw Error('offline'); };
  await card._shutterService(shutter,'open_cover');
  assert.match(card._error,/Office shutter.*offline/);
  assert.equal(card._busy,false);
});

test('All renders separate heating and shutter grids while single filters omit headings', () => {
  const {card} = setup(); addShutter(card);
  card.setConfig({device_columns:2});
  const markup = card.shadowRoot.innerHTML;
  assert.match(markup,/data-key="section-heating"/);
  assert.match(markup,/data-key="section-shutters"/);
  assert.match(markup,/heading-heating/);
  assert.match(markup,/heading-shutters/);
  assert.match(markup,/heading-heating[^]*?1 of 3 rooms heating · 1 unavailable/);
  assert.match(markup,/heading-shutters[^]*?1 of 1 shutter open/);
  assert.match(markup,/heading-heating[^]*?data-action="all-off"/);
  assert.match(markup,/heading-shutters[^]*?data-action="all-close"/);
  const header = markup.slice(markup.indexOf('<header'), markup.indexOf('</header>'));
  assert.doesNotMatch(header,/data-action="all-(?:off|close)"/);
  assert.doesNotMatch(header,/rooms heating|shutters/);
  assert.ok(markup.indexOf('rooms-heating') < markup.indexOf('climate.bedroom'));
  assert.ok(markup.indexOf('heading-shutters') > markup.indexOf('climate.lounge'));
  assert.ok(markup.indexOf('rooms-shutters') < markup.indexOf('data-key="cover.office"'));
  card.setConfig({device_types:['shutters']});
  assert.doesNotMatch(card.shadowRoot.innerHTML,/data-key="heading-/);
  assert.match(card.shadowRoot.innerHTML,/<header[^]*?1 of 1 shutter open[^]*?<\/header>/);
});

test('lights and smart plugs are detected, sectioned, filtered and controlled', async () => {
  const {card,calls,Editor} = setup();
  const light = addLight(card); const plug = addPlug(card);
  card.setConfig({});
  assert.match(card.shadowRoot.innerHTML,/section-lights[^]*?all-lights-off/);
  assert.match(card.shadowRoot.innerHTML,/section-plugs[^]*?all-plugs-off/);
  assert.match(card.shadowRoot.innerHTML,/Kitchen light/);
  assert.match(card.shadowRoot.innerHTML,/Lamp plug/);
  assert.match(card.shadowRoot.innerHTML,/class="room device-plug powered/);
  await card._deviceService(light,'turn_on',{brightness_pct:75});
  await card._deviceService(plug,'turn_off');
  assert.equal(calls[0][0],'light'); assert.equal(calls[0][1],'turn_on'); assert.equal(calls[0][2].brightness_pct,75);
  assert.equal(calls[1][0],'switch'); assert.equal(calls[1][1],'turn_off');
  await card._allDevicesOff('lights');
  await card._allDevicesOff('plugs');
  assert.equal(calls[2][0],'light'); assert.equal(calls[2][1],'turn_off');
  assert.equal(calls[3][0],'switch'); assert.equal(calls[3][1],'turn_off');
  card.setConfig({device_types:['lights']});
  assert.deepEqual(Array.from(card._rooms(), state => state.entity_id), ['light.kitchen']);
  assert.match(card.shadowRoot.innerHTML,/data-action="all-lights-off"/);
  card.setConfig({device_types:['plugs']});
  assert.deepEqual(Array.from(card._rooms(), state => state.entity_id), ['switch.lamp']);
  assert.match(card.shadowRoot.innerHTML,/data-action="all-plugs-off"/);
  const editor = new Editor(); editor._hass = card._hass; editor._entries = card._entries;
  editor.setConfig({device_types:['lights']});
  assert.equal(editor._rooms()[0].entity_id,'light.kitchen');
  assert.equal(editor._typeForm.schema[0].selector.select.options.length,5);
  editor._selectRoom('light.kitchen');
  assert.equal(editor._nativeEditor.features.map(feature => feature.type).join(','),'toggle,light-brightness');
  editor.setConfig({device_types:['plugs']}); editor._selectRoom('switch.lamp');
  assert.equal(editor._nativeEditor.features.map(feature => feature.type).join(','),'toggle');
  card._nativeReady = true;
  card.setConfig({device_types:['plugs'],device_options:{'switch.lamp':{features:[]}}});
  assert.doesNotMatch(card.shadowRoot.innerHTML,/data-action="device"/);
  card.setConfig({device_types:['plugs']});
  assert.match(card.shadowRoot.innerHTML,/data-room-features="switch.lamp"/);
});

test('scheduled shutters lights and plugs can all resume Auto mode', async () => {
  const {card,calls} = setup();
  const shutter = addShutter(card, {schedule_id:2}); const light = addLight(card); const plug = addPlug(card);
  const selects = [addModeSelect(card, shutter), addModeSelect(card, light), addModeSelect(card, plug)];
  card.setConfig({});
  for (const type of ['shutters','lights','plugs']) assert.match(card.shadowRoot.innerHTML, new RegExp(`data-action="resume-${type}"[^>]*[^]*?Resume schedules`));
  await card._resumeSchedules('shutters');
  await card._resumeSchedules('lights');
  await card._resumeSchedules('plugs');
  assert.equal(calls.length,3);
  assert.equal(calls.every(call => call[0] === 'select' && call[1] === 'select_option' && call[2].option === 'Auto'),true);
  assert.deepEqual(calls.map(call => call[2].entity_id).sort(),selects.map(select => select.entity_id).sort());
  selects.forEach(select => { select.state = 'Auto'; });
  card.setConfig({device_types:['lights']});
  assert.match(card.shadowRoot.innerHTML, /data-action="resume-lights"[^>]*disabled/);
  selects[2].state = 'Manual'; delete plug.attributes.schedule_id;
  card.setConfig({device_types:['plugs']});
  assert.match(card.shadowRoot.innerHTML, /data-action="resume-plugs"[^>]*disabled/);
});

test('temperature emphasis changes styling, preserves order and persists from editor', () => {
  const {card, Editor} = setup();
  card.setConfig({entities:['climate.bedroom']});
  assert.match(card.shadowRoot.innerHTML, /20°C<small> 21°C<\/small>/);
  const editor = new Editor();
  editor._hass = card._hass; editor._entries = card._entries;
  editor.setConfig({});
  editor._selectRoom('climate.bedroom');
  editor._setRoomOptions({temperature_focus:'target'});
  card.setConfig(editor.lastEvent.detail.config);
  assert.match(card.shadowRoot.innerHTML, /<small>20°C<\/small> 21°C/);
  assert.equal(editor._roomForm.data.temperature_focus, 'target');
  assert.throws(() => card.setConfig({temperature_focus:'invalid'}));
});

test('features use native objects while omitted features retain defaults', () => {
  const {card, Editor} = setup();
  addShutter(card);
  card.setConfig({});
  assert.match(card.shadowRoot.innerHTML, /data-action="mode"/);
  assert.match(card.shadowRoot.innerHTML, /data-field="temperature"/);
  assert.match(card.shadowRoot.innerHTML, /data-action="advance"/);
  card.setConfig({features:[]});
  assert.doesNotMatch(card.shadowRoot.innerHTML, /class="controls"/);
  const editor = new Editor();
  editor.setConfig({});
  editor._hass = card._hass;
  editor._entries = card._entries;
  editor._selectRoom('climate.bedroom');
  editor._saveNativeFeatures('climate.bedroom', [{type:'climate-hvac-modes'}]);
  const configured = editor.lastEvent.detail.config;
  assert.equal(configured.device_options['climate.bedroom'].features[0].type, 'climate-hvac-modes');
  card._nativeReady = true;
  card.setConfig(configured);
  assert.match(card.shadowRoot.innerHTML, /data-room-features="climate\.bedroom"/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /data-field="temperature"/);
});


test('native features retain per-room config and accept new feature types', () => {
  const {card, Editor} = setup();
  const editor = new Editor();
  editor._hass = card._hass; editor._entries = card._entries;
  editor.setConfig({title:'My rooms'});
  editor._selectRoom('climate.bedroom');
  assert.equal(editor._nativeEditor.context.entity_id, 'climate.bedroom');
  assert.equal(editor._nativeEditor.features.map(f => f.type).join(','), 'climate-hvac-modes,target-temperature,climate-preset-modes');
  const list = [{type:'target-temperature'}, {type:'climate-hvac-modes',hvac_modes:['auto','off']}, {type:'custom:example-feature',custom_option:42}];
  editor._nativeEditor.listeners['features-changed']({stopPropagation(){},detail:{features:list}});
  editor._setRoomOptions({temperature_focus:'target'});
  editor._selectRoom('climate.lounge');
  assert.equal(editor._roomForm.data.temperature_focus, 'current');
  editor._nativeEditor.listeners['features-changed']({stopPropagation(){},detail:{features:[]}});
  editor._selectRoom('climate.bedroom');
  assert.equal(editor._roomForm.data.temperature_focus, 'target');
  assert.equal(JSON.stringify(editor._nativeEditor.features), JSON.stringify(list));
  card.setConfig(editor.lastEvent.detail.config);
  assert.equal(card._config.title, 'My rooms');
  assert.match(card.shadowRoot.innerHTML, /data-room-features="climate.bedroom"/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /data-room-features="climate.lounge"/);
  const host = {dataset:{roomFeatures:'climate.bedroom'}};
  card.shadowRoot.querySelectorAll = selector => selector === "hui-card-features" ? [host] : [];
  card._syncNativeFeatures();
  assert.equal(host.context.entity_id, 'climate.bedroom');
  assert.equal(host.hass, card._hass);
  assert.equal(JSON.stringify(host.features), JSON.stringify(list));
});

test('preset feature exposes supported Wiser actions and preserves explicit selections', () => {
  const {card, Editor} = setup();
  const modes = ['Advance Schedule','Cancel Overrides','Boost 30m','Boost 1h','Boost 2h','Boost 3h'];
  card._hass.states['climate.bedroom'].attributes.preset_modes = [...modes, 'Away'];
  const editor = new Editor();
  editor._hass = card._hass; editor._entries = card._entries;
  editor.setConfig({});
  editor._selectRoom('climate.bedroom');
  assert.equal(editor._nativeEditor.features.at(-1).preset_modes.join(','), modes.join(','));
  editor.setConfig({device_options:{'climate.bedroom':{features:[
    {type:'climate-preset-modes',preset_modes:['Advance Schedule']},
  ]}}});
  assert.equal(editor._nativeEditor.features[0].preset_modes.join(','), 'Advance Schedule');
  editor.setConfig({device_options:{'climate.bedroom':{features:[
    {type:'climate-preset-modes',preset_modes:['Boost 1h']},
  ]}}});
  assert.equal(editor._nativeEditor.features[0].preset_modes.join(','), 'Boost 1h');
});

test('Secondary status has its own editor section and is omitted from native features', () => {
  const {card, Editor} = setup();
  const editor = new Editor();
  editor._hass = card._hass; editor._entries = card._entries;
  const list = [
    {type:'climate-hvac-modes'},
    {type:'custom:wiser-secondary-status-feature',state_content:['state']},
    {type:'target-temperature'},
  ];
  editor.setConfig({device_options:{'climate.bedroom':{features:list}}});
  let migrated = editor.lastEvent.detail.config.device_options['climate.bedroom'];
  assert.equal(migrated.features.map(feature => feature.type).join(','), 'climate-hvac-modes,target-temperature');
  assert.equal(migrated.secondary_status.state_content.join(','), 'state');
  card.setConfig({device_options:{'climate.bedroom':{features:list}}});
  assert.equal(card._config.device_options['climate.bedroom'].features.map(feature => feature.type).join(','), 'climate-hvac-modes,target-temperature');
  assert.equal(card._config.device_options['climate.bedroom'].secondary_status.state_content.join(','), 'state');
  editor._selectRoom('climate.bedroom');
  assert.equal(editor._nativeEditor.features.map(feature => feature.type).join(','), 'climate-hvac-modes,target-temperature');
  assert.equal(editor._roomForm.schema[1].name, 'secondary_status_section');
  assert.equal(editor._roomForm.data.secondary_status_content.join(','), 'state');
  editor._roomForm.listeners['value-changed']({stopPropagation(){},detail:{value:{
    ...editor._roomForm.data,
    secondary_status_entity:'climate.lounge',
    secondary_status_content:['current_temperature'],
    secondary_status_show_labels:true,
  }}});
  const options = editor.lastEvent.detail.config.device_options['climate.bedroom'];
  assert.equal(options.features.map(feature => feature.type).join(','), 'climate-hvac-modes,target-temperature');
  assert.equal(JSON.stringify(options.secondary_status), '{"entity":"climate.lounge","state_content":["current_temperature"],"show_labels":true}');
  card.setConfig(editor.lastEvent.detail.config);
  assert.match(card.shadowRoot.innerHTML, /data-secondary-status="climate\.lounge"/);
  editor._roomForm.listeners['value-changed']({stopPropagation(){},detail:{value:{
    ...editor._roomForm.data,
    secondary_status_content:[],
  }}});
  assert.equal(editor.lastEvent.detail.config.device_options['climate.bedroom'].secondary_status.state_content.length, 0);
  card.setConfig(editor.lastEvent.detail.config);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /data-secondary-status=/);
});

test('every supported device exposes the same default features that the card renders', () => {
  const {card, Editor} = setup();
  addShutter(card); addLight(card); addPlug(card);
  const expected = {
    'climate.bedroom':'climate-hvac-modes,target-temperature,climate-preset-modes',
    'cover.office':'cover-open-close,cover-position',
    'light.kitchen':'toggle,light-brightness',
    'switch.lamp':'toggle',
  };
  const editor = new Editor(); editor._hass = card._hass; editor._entries = card._entries; editor.setConfig({});
  for (const [id, types] of Object.entries(expected)) {
    editor._selectRoom(id);
    assert.equal(editor._nativeEditor.features.map(feature => feature.type).join(','),types);
  }
  card._nativeReady = true;
  card.setConfig({entities:Object.keys(expected)});
  const markup = card.shadowRoot.innerHTML;
  for (const [id, types] of Object.entries(expected)) {
    assert.equal((markup.match(new RegExp(`data-room-features="${id.replace('.', '\\.')}"`,'g')) || []).length,types.split(',').length);
  }
  card.setConfig({entities:Object.keys(expected),device_options:Object.fromEntries(Object.keys(expected).map(id => [id,{features:[]}]))});
  assert.doesNotMatch(card.shadowRoot.innerHTML,/data-room-features=/);
  assert.doesNotMatch(card.shadowRoot.innerHTML,/class="controls"/);
});

test('native feature edit callback saves to original room after changing tabs', () => {
  const {card, Editor} = setup();
  const editor = new Editor();
  editor._hass = card._hass; editor._entries = card._entries;
  editor.setConfig({}); editor._selectRoom('climate.bedroom');
  editor._nativeEditor.listeners['edit-detail-element']({stopPropagation(){}, detail:{subElementConfig:{index:0}}});
  const detail = editor.lastEvent.detail;
  assert.equal(editor.lastEvent.type, 'edit-sub-element');
  assert.equal(detail.context.entity_id, 'climate.bedroom');
  editor._selectRoom('climate.lounge');
  detail.saveConfig({type:'climate-hvac-modes',hvac_modes:['off']});
  assert.equal(editor._config.device_options['climate.bedroom'].features[0].hvac_modes[0], 'off');
  assert.equal(editor._config.device_options['climate.lounge'], undefined);
});

test('feature position is configured per room and renders native features inline', () => {
  const {card, Editor} = setup();
  const editor = new Editor(); editor._hass = card._hass; editor._entries = card._entries;
  editor.setConfig({}); editor._selectRoom('climate.bedroom');
  assert.equal(editor._featurePositionForm.data.features_position, 'bottom');
  editor._featurePositionForm.listeners['value-changed']({stopPropagation(){},detail:{value:{features_position:'inline'}}});
  assert.equal(editor.lastEvent.detail.config.device_options['climate.bedroom'].features_position, 'inline');
  const nativeFeatures = [{type:'target-temperature'},{type:'climate-hvac-modes'},{type:'custom:wiser-next-schedule-feature'}];
  card.setConfig({entities:['climate.bedroom'],device_options:{'climate.bedroom':{features_position:'inline',features:nativeFeatures}}});
  assert.match(card.shadowRoot.innerHTML, /class="room-content"/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /class="room-content features-inline"/);
  assert.match(card.shadowRoot.innerHTML, /class="features-inline-row"/);
  assert.equal((card.shadowRoot.innerHTML.match(/class="features-inline(?: |")/g) || []).length, 3);
  assert.match(card.shadowRoot.innerHTML, /class="features-inline"[^>]*data-room-features="climate.bedroom"/);
  assert.match(card.shadowRoot.innerHTML, /class="features-inline feature-icon-only"/);
  const host = {dataset:{roomFeatures:'climate.bedroom',featureIndex:'1'}};
  card.shadowRoot.querySelectorAll = selector => selector === 'hui-card-features' ? [host] : [];
  card._syncNativeFeatures();
  assert.equal(host.columns, 1);
  assert.equal(host.features.length, 1);
  assert.equal(host.features[0].type, 'climate-hvac-modes');
  assert.throws(() => card.setConfig({device_options:{'climate.bedroom':{features_position:'sideways'}}}));
});

test('bottom feature position attaches Next schedule to its previous feature row', () => {
  const {card} = setup();
  const nativeFeatures = [{type:'climate-hvac-modes'},{type:'custom:wiser-next-schedule-feature'},{type:'target-temperature'}];
  card.setConfig({entities:['climate.bedroom'],device_options:{'climate.bedroom':{features_position:'bottom',features:nativeFeatures}}});
  assert.equal((card.shadowRoot.innerHTML.match(/class="features-bottom(?: |")/g) || []).length, 3);
  assert.equal((card.shadowRoot.innerHTML.match(/class="features-bottom-row"/g) || []).length, 1);
  assert.match(card.shadowRoot.innerHTML, /class="features-bottom-row">.*data-feature-index="0".*data-feature-index="1".*<\/div><hui-card-features[^>]*data-feature-index="2"/);
  const host = {dataset:{roomFeatures:'climate.bedroom',featureIndex:'1'}};
  card.shadowRoot.querySelectorAll = selector => selector === 'hui-card-features' ? [host] : [];
  card._syncNativeFeatures();
  assert.equal(host.columns, 1);
  assert.equal(host.features.length, 1);
  assert.equal(host.features[0].type, 'custom:wiser-next-schedule-feature');
});

test('features accept only native objects and retain empty lists', () => {
  const {card, Editor} = setup(); addShutter(card);
  const editor = new Editor(); editor._hass = card._hass; editor._entries = card._entries;
  editor.setConfig({device_options:{'climate.bedroom':{features:[]},'cover.office':{features:[{type:'cover-position'},{type:'cover-open-close'}]}}});
  editor._selectRoom('climate.bedroom'); assert.equal(editor._nativeEditor.features.length, 0);
  editor._selectRoom('cover.office');
  assert.equal(editor._nativeEditor.features.map(f => f.type).join(','), 'cover-position,cover-open-close');
  assert.equal(editor._roomForm.hidden, false);
  assert.throws(() => card.setConfig({features:['bad']}));
  assert.throws(() => card.setConfig({device_options:{'climate.bedroom':{features:[{}]}}}));
});

test('Secondary status renders directly in the card and opens its source entity', () => {
  const {card, states, window} = setup();
  card.setConfig({entities:['climate.bedroom'],device_options:{'climate.bedroom':{secondary_status:{
    entity:'climate.lounge',state_content:['current_temperature','temperature'],show_labels:true,
  }}}});
  const html = card.shadowRoot.innerHTML;
  assert.match(html, /class="secondary-status labelled"[^>]*data-action="secondary-more-info"[^>]*data-entity="climate\.lounge"/);
  assert.match(html, /class="secondary-status-label">Current temperature<\/span><state-display data-secondary-status="climate\.lounge" data-secondary-content="current_temperature">/);
  assert.doesNotMatch(html, /<wiser-secondary-status-feature/);
  assert.equal(window.customCardFeatures.some(feature => feature.type === 'wiser-secondary-status-feature'), false);
  const display = {dataset:{secondaryStatus:'climate.lounge',secondaryContent:'temperature'}};
  card.shadowRoot.querySelectorAll = selector => selector === 'state-display[data-secondary-status]' ? [display] : [];
  card._syncNativeFeatures();
  assert.equal(display.stateObj.entity_id, states['climate.lounge'].entity_id);
  assert.equal(display.content[0], 'temperature');
  card._click({target:{closest:() => ({dataset:{action:'secondary-more-info',entity:'climate.lounge'},disabled:false})}});
  assert.equal(card.lastEvent.detail.entityId, 'climate.lounge');
});

test('Override end time is a per-room header feature', () => {
  const {card, elements, states, window} = setup();
  Object.assign(states['climate.bedroom'].attributes, {is_override:true,next_schedule_datetime:'2099-09-27T12:30:00+01:00'});
  const Feature = elements['wiser-override-status-feature'];
  const feature = new Feature();
  feature.setConfig({type:'custom:wiser-override-status-feature'});
  feature.context = {entity_id:'climate.bedroom'};
  feature.hass = card._hass;
  assert.equal(feature._icon.icon, 'mdi:timer-outline');
  assert.match(feature._value.textContent, /^Override ends /);
  const entry = window.customCardFeatures.find(f => f.type === 'wiser-override-status-feature');
  assert.equal(entry.name, 'Override end time');
  assert.equal(entry.configurable, false);
  assert.equal(entry.isSupported(card._hass,{entity_id:'climate.bedroom'}), true);
  card.setConfig({entities:['climate.bedroom'],device_options:{'climate.bedroom':{features:[{type:'custom:wiser-override-status-feature'}]}}});
  assert.match(card.shadowRoot.innerHTML, /<wiser-override-status-feature/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /<hui-card-features /);
});

test('Next schedule is an icon feature that advances the schedule', () => {
  const {card, calls, elements, states, window} = setup();
  Object.assign(states['climate.bedroom'].attributes, {schedule_id:1,preset_modes:['Advance Schedule'],next_schedule_change:'Sat 21:30',next_schedule_temp:17.5,schedule_name:'Evening'});
  const Feature = elements['wiser-next-schedule-feature'];
  const feature = new Feature();
  feature.setConfig({type:'custom:wiser-next-schedule-feature'});
  feature.context = {entity_id:'climate.bedroom'};
  feature.hass = card._hass;
  assert.equal(feature._icon.icon, 'mdi:calendar-arrow-right');
  assert.equal(feature._button.disabled, false);
  feature._button.listeners.click({stopPropagation(){}});
  assert.equal(calls[0][1], 'set_preset_mode');
  assert.equal(calls[0][2].preset_mode, 'Advance Schedule');
  const entry = window.customCardFeatures.find(f => f.type === 'wiser-next-schedule-feature');
  assert.equal(entry.name, 'Next schedule');
  assert.equal(entry.configurable, false);
  card.setConfig({entities:['climate.bedroom'],device_options:{'climate.bedroom':{features:[{type:'custom:wiser-next-schedule-feature'}]}}});
  assert.match(card.shadowRoot.innerHTML, /<hui-card-features /);
  assert.match(card.shadowRoot.innerHTML, /Next Sat 21:30 · 17.5°C/);
  states['climate.bedroom'].state = 'heat';
  card.setConfig({entities:['climate.bedroom'],device_options:{'climate.bedroom':{features:[{type:'custom:wiser-next-schedule-feature'}]}}});
  assert.doesNotMatch(card.shadowRoot.innerHTML, /Next Sat 21:30 · 17.5°C/);
});

test('Passive mode is an icon feature that toggles the related room switch', async () => {
  const {card, calls, elements, states, window} = setup();
  states['climate.bedroom'].attributes.is_passive = false;
  states['switch.bedroom_passive_mode'] = {entity_id:'switch.bedroom_passive_mode',state:'off',attributes:{friendly_name:'Bedroom Passive Mode'}};
  const climateEntry = card._entries.find(entry => entry.entity_id === 'climate.bedroom');
  climateEntry.device_id = 'bedroom-device';
  card._entries.push({entity_id:'switch.bedroom_passive_mode',platform:'wiser',device_id:'bedroom-device',translation_key:'passive_mode'});
  card._hass.callWS = async () => card._entries;
  const Feature = elements['wiser-passive-mode-feature'];
  const feature = new Feature();
  feature.setConfig({type:'custom:wiser-passive-mode-feature'});
  feature.context = {entity_id:'climate.bedroom'};
  feature.hass = card._hass;
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(feature._switchId, 'switch.bedroom_passive_mode');
  assert.equal(feature._icon.icon, 'mdi:thermostat-box');
  assert.equal(feature._button.disabled, false);
  assert.equal(feature._button.title, 'Passive mode: Off');
  feature._button.listeners.click({stopPropagation(){}});
  assert.equal(calls[0][0], 'switch');
  assert.equal(calls[0][1], 'turn_on');
  assert.equal(calls[0][2].entity_id, 'switch.bedroom_passive_mode');
  states['switch.bedroom_passive_mode'].state = 'on';
  feature.hass = card._hass;
  assert.equal(feature._button.active, true);
  assert.equal(feature._button.title, 'Passive mode: On');
  feature._button.listeners.click({stopPropagation(){}});
  assert.equal(calls[1][0], 'switch');
  assert.equal(calls[1][1], 'turn_off');
  assert.equal(calls[1][2].entity_id, 'switch.bedroom_passive_mode');
  states['climate.bedroom'].state = 'off';
  feature.hass = card._hass;
  assert.equal(feature._button.active, false);
  assert.equal(feature._button.mutedActive, true);
  assert.equal(feature._button.title, 'Passive mode: On');
  assert.equal(feature._button.disabled, false);
  const entry = window.customCardFeatures.find(item => item.type === 'wiser-passive-mode-feature');
  assert.equal(entry.name, 'Passive mode');
  assert.equal(entry.configurable, false);
  assert.equal(entry.isSupported(card._hass,{entity_id:'climate.bedroom'}), true);
  assert.equal(entry.isSupported(card._hass,{entity_id:'climate.other'}), false);
});

test('Secondary status renders under identity only when configured and not as bottom feature', () => {
  const {card} = setup();
  card.setConfig({entities:['climate.bedroom'], device_options:{'climate.bedroom':{secondary_status:{state_content:['state']}}}});
  let html = card.shadowRoot.innerHTML;
  assert.match(html, /class="top has-secondary[^"]*"/);
  assert.match(html, /class="secondary-primary-line"><span class="status"><span class="status-item"[^>]*><state-display[^>]*><\/state-display><\/span><\/span><div class="next"[^>]*>[^<]*<\/div><\/div><button[^>]*class="secondary-status/);
  assert.doesNotMatch(html, /<hui-card-features /);
  const display = {dataset:{secondaryStatus:'climate.bedroom',secondaryContent:'state'}};
  card.shadowRoot.querySelectorAll = selector => selector === 'state-display[data-secondary-status]' ? [display] : [];
  card._syncNativeFeatures();
  assert.equal(display.stateObj.entity_id, 'climate.bedroom');
  assert.equal(display.content[0], 'state');
  card.shadowRoot.querySelectorAll = () => [];
  card.setConfig({entities:['climate.bedroom'],features:[]});
  html = card.shadowRoot.innerHTML;
  assert.doesNotMatch(html, /class="top has-secondary"|class="secondary-status/);
  assert.match(html, /class="top aligned-header[^]*?class="secondary-heading-line"[^]*?class="temps"[^]*?class="secondary-primary-line"[^]*?class="next"/);
  const compact = fs.readFileSync(path.join(__dirname, '../src/wiser-controls-card.js'), 'utf8').replace(/\s+/g, '');
  assert.match(compact, /\.top\.has-secondary,\.top\.aligned-header\{grid-template-columns:38pxminmax\(0,1fr\);align-items:start;min-height:61px\}/);
});

test('Secondary status keeps next schedule beside the primary status', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/wiser-controls-card.js'), 'utf8');
  const compact = source.replace(/\s+/g, '');
  assert.match(source, /class="secondary-primary-line"><span class="status">.*<div class="next"/);
  assert.match(compact, /\.secondary-heading-line,\.secondary-primary-line\{display:flex;align-items:baseline;justify-content:space-between;gap:10px;min-width:0\}/);
  assert.match(compact, /\.secondary-primary-line\.next\{flex:11auto;min-width:0;max-width:none;margin:0;line-height:18px;white-space:normal;overflow:visible;text-overflow:clip;text-align:right\}/);
  assert.match(compact, /\.secondary-layout\.secondary-status\{min-width:0;line-height:16px\}/);
});

test('Secondary status uses the aligned header layout for every device type', () => {
  const {card} = setup();
  addShutter(card); addLight(card); addPlug(card);
  for (const id of ['cover.office','light.kitchen','switch.lamp']) {
    card.setConfig({entities:[id],device_options:{[id]:{secondary_status:{state_content:['state']}}}});
    const html = card.shadowRoot.innerHTML;
    assert.match(html, /class="top has-secondary[^]*?class="secondary-layout"[^]*?class="secondary-primary-line"[^]*?class="secondary-status/);
    assert.doesNotMatch(html, /class="identity"[^]*?class="secondary-status/);
  }
});

test('Secondary status moves onto the primary line when the primary state is hidden', () => {
  const {card} = setup();
  addPlug(card);
  card.setConfig({entities:['switch.lamp'],device_options:{'switch.lamp':{
    hide_state:true,
    secondary_status:{state_content:['power']},
  }}});
  const html = card.shadowRoot.innerHTML;
  assert.match(html, /class="top has-secondary hide-status[^]*?class="secondary-primary-line"><span class="status">[^]*?<\/span><button[^>]*class="secondary-status[^]*?<div class="next">/);
  assert.doesNotMatch(html, /<\/div><button[^>]*class="secondary-status/);
});

test('Content options persist per room and change header rendering', () => {
  const {card, Editor} = setup();
  const editor = new Editor(); editor._hass = card._hass; editor._entries = card._entries;
  editor.setConfig({}); editor._selectRoom('climate.bedroom');
  editor._roomForm.listeners['value-changed']({stopPropagation(){}, detail:{value:{...editor._roomForm.data,name:'Bedroom custom',icon:'mdi:bed',color:'blue',hide_state:true,show_temperatures:false,show_next_schedule:false,state_content:['current_temperature']}}});
  const config = editor.lastEvent.detail.config;
  card.setConfig(config);
  assert.match(card.shadowRoot.innerHTML, /Bedroom custom/);
  assert.match(card.shadowRoot.innerHTML, /icon="mdi:bed"/);
  assert.match(card.shadowRoot.innerHTML, /hide-status hide-temps hide-next/);
  assert.match(card.shadowRoot.innerHTML, /--room-state-color:var\(--blue-color\)/);
  editor._selectRoom('climate.lounge');
  assert.equal(editor._roomForm.data.hide_state, false);
  assert.equal(editor._roomForm.data.show_temperatures, true);
  assert.equal(JSON.stringify(editor._roomForm.data.name), JSON.stringify([{type:'area'}]));
  editor._selectRoom('climate.bedroom');
  assert.equal(editor._roomForm.data.name, 'Bedroom custom');
  assert.equal(editor._roomForm.data.show_next_schedule, false);
  const display = {dataset:{roomStatus:'climate.bedroom',statusContent:'current_temperature'}};
  card.shadowRoot.querySelectorAll = selector => selector === 'state-display[data-room-status]' ? [display] : [];
  card._syncNativeFeatures();
  assert.equal(display.stateObj.entity_id, 'climate.bedroom');
  assert.equal(display.content[0], 'current_temperature');
});

test('Interactions persist per device and execute configured actions', () => {
  const {card, calls, states, Editor} = setup();
  const actions = {
    tap_action:{action:'perform-action',perform_action:'light.turn_on',data:{brightness_pct:40}},
    hold_action:{action:'toggle'},
    double_tap_action:{action:'more-info',entity:'climate.lounge'},
  };
  card.setConfig({device_options:{'climate.bedroom':{tap_action:actions.tap_action}}});
  const button = {dataset:{entity:'climate.bedroom'}};
  card._click({target:{closest:()=>button}});
  assert.equal(calls[0][0],'light'); assert.equal(calls[0][1],'turn_on'); assert.equal(calls[0][2].brightness_pct,40);
  card.setConfig({device_options:{'climate.bedroom':actions}});
  card._runAction(states['climate.bedroom'],actions.hold_action);
  assert.equal(calls[1][0],'climate'); assert.equal(calls[1][1],'toggle');
  card._doubleClick({target:{closest:()=>button},preventDefault(){}});
  assert.equal(card.lastEvent.type,'hass-more-info'); assert.equal(card.lastEvent.detail.entityId,'climate.lounge');

  const editor = new Editor(); editor._hass = card._hass; editor._entries = card._entries;
  editor.setConfig({}); editor._selectRoom('climate.bedroom');
  const interactionSchema = editor._roomForm.schema[2].schema;
  assert.equal(interactionSchema[0].name,'tap_action');
  assert.equal(interactionSchema[1].type,'divider');
  assert.equal(interactionSchema[2].name,'icon_tap_action');
  assert.equal(interactionSchema[3].type,'optional_actions');
  assert.equal(interactionSchema[3].schema.map(field => field.name).join(','),'hold_action,icon_hold_action,double_tap_action,icon_double_tap_action');
  assert.equal(editor._roomForm.data.hold_action,undefined);
  editor._roomForm.listeners['value-changed']({stopPropagation(){},detail:{value:{...editor._roomForm.data,...actions}}});
  assert.equal(editor.lastEvent.detail.config.device_options['climate.bedroom'].hold_action.action,'toggle');
  assert.throws(() => card.setConfig({tap_action:'toggle'}));
});

test('icon interaction uses the native per-domain default action', () => {
  const {card, calls} = setup();
  addLight(card); addPlug(card);
  for (const entity of ['light.kitchen','switch.lamp']) {
    card._click({target:{closest:()=>({dataset:{entity,interaction:'icon'}})}});
  }
  assert.deepEqual(calls.map(call => `${call[0]}.${call[1]}`),['light.toggle','switch.toggle']);
});

test('Content supports native composed names and omits the entity-picture option', () => {
  const {card, Editor} = setup();
  card._hass.formatEntityName = (state, name) => name[0].type === 'area' ? 'Bedroom area' : state.entity_id;
  card.setConfig({device_options:{'climate.bedroom':{name:[{type:'area'}]}}});
  assert.match(card.shadowRoot.innerHTML, /Bedroom area/);
  const editor = new Editor(); editor._hass = card._hass; editor._entries = card._entries;
  editor.setConfig({}); editor._selectRoom('climate.bedroom');
  assert.doesNotMatch(JSON.stringify(editor._roomForm.schema), /show_entity_picture|Show entity picture/);
  const contentSchema = editor._roomForm.schema[0].schema;
  const iconColorIndex = contentSchema.findIndex(item => item.type === 'grid' && item.schema?.some(field => field.name === 'icon'));
  const displayGroupIndex = contentSchema.findIndex(item => item.column_min_width === '180px');
  const displayGroup = contentSchema[displayGroupIndex];
  assert.equal(displayGroupIndex, iconColorIndex + 1);
  assert.equal(displayGroup.schema.map(item => item.name).join(','), 'show_temperatures,temperature_focus,show_next_schedule,hide_state');
  const temperatureFocus = displayGroup.schema[1];
  assert.equal(Object.keys(temperatureFocus.selector)[0], 'button_toggle');
  assert.equal(temperatureFocus.label, '');
  assert.equal(temperatureFocus.visible, undefined);
  assert.equal(temperatureFocus.selector.button_toggle.options.map(option => option.label).join(','), 'Current,Target');
  assert.equal(contentSchema[displayGroupIndex + 1].name, 'state_content');
  assert.match(fs.readFileSync(path.join(__dirname, '../src/wiser-controls-card.js'), 'utf8'), /ha-form\.room-options\{[^}]*--ha-space-6:var\(--ha-space-1,4px\)/);
});

test('default entity names use the native Home Assistant formatter', () => {
  const {card, Editor, states} = setup();
  card._hass.formatEntityName = (state, name) => name === undefined
    ? `Native ${state.entity_id}`
    : name?.[0]?.type === 'area' ? 'Native area' : String(name);
  card.setConfig({});
  assert.equal(card._name(states['climate.bedroom']), 'Native area');

  const editor = new Editor();
  editor._hass = card._hass;
  assert.equal(editor._name(states['climate.bedroom']), 'Native climate.bedroom');
});

test('empty composed names fall back to the entity name', () => {
  const {card, states} = setup();
  states['climate.bedroom'].attributes.name = 'Bedroom thermostat';
  card._hass.formatEntityName = () => '';
  card.setConfig({device_options:{'climate.bedroom':{name:[{type:'area'}]}}});
  assert.equal(card._name(states['climate.bedroom']), 'Bedroom thermostat');
  assert.match(card.shadowRoot.innerHTML, />Bedroom thermostat<\/strong>/);
});

test('Wiser name composed item resolves the dynamic name attribute', () => {
  const {card, states} = setup();
  states['climate.bedroom'].attributes.name = 'Lounge';
  card._hass.formatEntityName = (_state, name) => Array.isArray(name)
    ? name.map(item => item.text || item.type).join(' ')
    : name?.text || '';
  card.setConfig({device_options:{'climate.bedroom':{name:[{type:'wiser_name'}]}}});
  assert.equal(card._name(states['climate.bedroom']), 'Lounge');
  assert.match(card.shadowRoot.innerHTML, />Lounge<\/strong>/);
  states['climate.bedroom'].attributes.name = 'Living room';
  assert.equal(card._name(states['climate.bedroom']), 'Living room');
});

test('Content, Secondary status, Interactions and Features sections start collapsed', () => {
  const {card,Editor} = setup();
  const editor = new Editor();
  editor._hass = card._hass; editor._entries = card._entries; editor.setConfig({});
  assert.equal(editor._roomForm.schema.map(section => `${section.name}:${section.type}:${section.expanded}`).join(','),
    'content:expandable:undefined,secondary_status_section:expandable:undefined,interactions:expandable:undefined');
  assert.equal(editor._roomForm.schema.map(section => section.icon).join(','), 'mdi:text-short,mdi:list-status,mdi:gesture-tap');
  assert.match(editor._featureList.innerHTML, /<ha-icon[^>]*icon="mdi:list-box"/);
  assert.doesNotMatch(editor._featureList.innerHTML, /<ha-expansion-panel[^>]*\sexpanded(?:\s|>)/);
});

test('Content name defaults to the room area', () => {
  const {card, Editor} = setup();
  const editor = new Editor();
  editor._hass = card._hass;
  editor._entries = card._entries;
  editor.setConfig({});
  editor._selectRoom('climate.bedroom');
  assert.equal(JSON.stringify(editor._roomForm.data.name), JSON.stringify([{type:'area'}]));
  assert.equal(editor._roomForm.data.state_content.join(','), 'hvac_action');
  assert.equal(editor._roomForm.data.secondary_status_content.length, 0);
  assert.equal(editor._roomForm.hass.states['climate.bedroom'].attributes.override_end_time, 'No override');
});

test('partial editor section updates preserve unrelated Content settings', () => {
  const {card, Editor} = setup();
  const editor = new Editor();
  editor._hass = card._hass;
  editor._entries = card._entries;
  editor.setConfig({device_options:{'climate.bedroom':{name:[{type:'area'}],icon:'mdi:bed'}}});
  editor._selectRoom('climate.bedroom');
  editor._roomForm.listeners['value-changed']({stopPropagation(){},detail:{value:{secondary_status_content:[]}}});
  const options = editor.lastEvent.detail.config.device_options['climate.bedroom'];
  assert.equal(options.name, undefined);
  assert.equal(options.icon, 'mdi:bed');
});

test('status renders exactly the configured state content with useful defaults', () => {
  const {card} = setup();
  card.setConfig({entities:['climate.bedroom']});
  assert.match(card.shadowRoot.innerHTML, /title="Current action"><state-display data-room-status="climate.bedroom" data-status-content="hvac_action"><\/state-display>/);
  const display = {dataset:{roomStatus:'climate.bedroom',statusContent:'hvac_action'}};
  card.shadowRoot.querySelectorAll = selector => selector === 'state-display[data-room-status]' ? [display] : [];
  card._syncNativeFeatures();
  assert.equal(display.content.join(','), 'hvac_action');
  card.setConfig({entities:['climate.bedroom'],device_options:{'climate.bedroom':{state_content:['hvac_action','state']}}});
  card._syncNativeFeatures();
  assert.equal(display.content.join(','), 'hvac_action');
  assert.match(card.shadowRoot.innerHTML, /title="Current action"[^]*title="State"/);
  assert.equal(display.stateObj.attributes.override_end_time, 'No override');
  const source = fs.readFileSync(path.join(__dirname, '../src/wiser-controls-card.js'), 'utf8');
  assert.match(source, /current\.localName !== "state-display"/);
});

test('card uses native Home Assistant entity icons and action buttons', () => {
  const {card} = setup();
  card.setConfig({entities:['climate.bedroom']});
  assert.match(card.shadowRoot.innerHTML, /<ha-state-icon data-room-icon="climate\.bedroom" icon="mdi:[^"]+"><\/ha-state-icon>/);
  assert.match(card.shadowRoot.innerHTML, /<ha-button[^>]*data-action="all-off"[^>]*variant="danger"/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /<button[^>]*data-action="all-off"/);
  const icon = {dataset:{roomIcon:'climate.bedroom'}};
  card.shadowRoot.querySelectorAll = selector => selector === 'ha-state-icon[data-room-icon]' ? [icon] : [];
  card._syncNativeFeatures();
  assert.equal(icon.stateObj.entity_id, 'climate.bedroom');
});

test('mobile headers use compact icon-only native bulk actions', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/wiser-controls-card.js'), 'utf8');
  assert.match(source, /@container \(max-width: 480px\)[\s\S]*?header \{[\s\S]*?display:grid;[\s\S]*?grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(source, /header \.bulk-actions \{[\s\S]*?width:auto;[\s\S]*?justify-content:flex-end/);
  assert.match(source, /header \.bulk-actions \.off \{[\s\S]*?--ha-button-height:40px;[\s\S]*?flex:0 0 44px;[\s\S]*?position:relative/);
  assert.match(source, /\.bulk-actions \.action-label \{[\s\S]*?display:none/);
  assert.match(source, /data-action="follow-schedule"[\s\S]*?aria-label="\$\{followScheduleTitle\}"[\s\S]*?<span class="action-label">/);
  assert.match(source, /header \.bulk-actions \.off ha-icon \{[\s\S]*?position:absolute;[\s\S]*?inset:50% auto auto 50%;[\s\S]*?transform:translate\(-50%,-50%\)/);
  assert.match(source, /\.section-title \{[\s\S]*?display:grid;[\s\S]*?grid-template-columns:minmax\(0,1fr\) auto;[\s\S]*?align-items:flex-start/);
  assert.match(source, /\.section-title \.bulk-actions \{[\s\S]*?width:auto;[\s\S]*?justify-content:flex-end/);
});

test('localization follows the other Wiser cards and prefers Home Assistant text', () => {
  const {window} = setup();
  const {localize,languageFor} = window.WiserRoomsLocalize;
  assert.equal(languageFor({locale:{language:'fr-FR'}}), 'fr');
  assert.equal(languageFor({locale:{language:'en-GB'}}), 'en-GB');
  assert.equal(localize({language:'fr'}, 'resume_schedules'), 'Reprendre les programmes');
  assert.equal(localize({language:'de'}, 'no_schedule'), 'Kein Zeitplan zugewiesen');
  assert.equal(localize({language:'en-GB'}, 'cancel_overrides'), 'Cancel overrides');
  assert.equal(localize({language:'en-GB'}, 'panel_description'), 'Customise this panel. Dashboard cards keep their own settings.');
  const hass = {language:'en',localize:key => key === 'ui.components.selectors.automation_behavior.trigger.options.all.label' ? 'Everything' : key};
  assert.equal(localize(hass, 'all'), 'Everything');
  assert.equal(localize(hass, 'cancel_overrides'), 'Cancel overrides');
  const integrationHass = {language:'de',localize:key => key === 'component.wiser.entity.switch.passive_mode.name' ? 'Passivmodus' : key};
  assert.equal(localize(integrationHass, 'passive_mode'), 'Passivmodus');
  assert.equal(localize({language:'de',localize:key => key}, 'passive_mode'), 'Passive mode');
});

test('language files contain no Home Assistant-owned labels or states', () => {
  const nativeOwned = ['all','show','name','unavailable','on','off','current','target','title','entity','features',
    'features_position','bottom','inline','state_content','icon','color','hide_state','content','interactions',
    'heating','cooling','idle','lights','open','closed','opening','closing','next'];
  for (const language of ['en-US','en-GB','de','fr']) {
    const translations = JSON.parse(fs.readFileSync(path.join(__dirname, `../src/localize/languages/${language}.json`), 'utf8'));
    assert.deepEqual(nativeOwned.filter(key => Object.hasOwn(translations,key)), [], language);
  }
});

test('British English contains overrides only', () => {
  const us = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/localize/languages/en-US.json'), 'utf8'));
  const gb = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/localize/languages/en-GB.json'), 'utf8'));
  assert.deepEqual(Object.keys(gb).filter(key => gb[key] === us[key]), []);
});
