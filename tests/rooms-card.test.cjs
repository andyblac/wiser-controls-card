const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function setup() {
  let Card, Editor;
  const context = {Intl, setTimeout, window: {},
    document: {createElement() { return {style:{}, addEventListener() {}}; }},
    CustomEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
    HTMLElement: class {
    attachShadow() { this.shadowRoot = {addEventListener() {}, append() {}, innerHTML: ''}; }
    dispatchEvent(event) { this.lastEvent = event; }
  }, customElements: {get() {}, define(name, cls) { if (name === "wiser-rooms-card") Card = cls; else Editor = cls; }}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/wiser-rooms-card.js'), 'utf8'), context);
  const calls = [];
  const state = (id, extra = {}, mode = 'auto') => ({entity_id: id, state: mode, attributes: {name:id, heating_type:'Radiator', current_temperature:20, temperature:21, hvac_modes:['auto','heat','off'], ...extra}});
  const states = {
    'climate.bedroom': state('climate.bedroom', {hvac_action:'heating'}),
    'climate.lounge': state('climate.lounge'),
    'climate.offline': state('climate.offline', {}, 'unavailable'),
    'climate.other': state('climate.other'),
    'climate.hot_water': {entity_id:'climate.hot_water',state:'auto',attributes:{temperature:55,hvac_modes:['auto','off']}},
  };
  const card = new Card();
  card._updateDOM = function(markup) {
    if (!this.shadowRoot.activeElement) this.shadowRoot.innerHTML = markup;
  };
  card.setConfig({});
  card._hass = {states, language:'en', config:{unit_system:{temperature:'°C'}}, callService:async (...args) => calls.push(args)};
  card._entries = Object.keys(states).map(entity_id => ({entity_id, platform:entity_id === 'climate.other' ? 'other' : 'wiser'}));
  return {card, calls, states, Editor};
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


test('room tabs include all detected heating rooms and hide/show without losing tabs', async () => {
  const {card, Editor} = setup();
  const editor = new Editor();
  editor.setConfig({});
  editor.hass = {...card._hass, callWS: async () => card._entries};
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(editor._form.data.title, 'Wiser rooms');
  assert.equal(editor._rooms().length, 3);
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
test('editor preserves legacy selections and layout when updating title', () => {
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

test('selected room sizing is limited to editor preview and never saved', () => {
  const {card, Editor} = setup();
  const editor = new Editor();
  editor.setConfig({room_columns:5});
  editor._hass = card._hass;
  editor._entries = card._entries;
  editor._selectRoom('climate.lounge');
  const config = editor.lastEvent.detail.config;
  card.parentElement = {localName:'hui-dialog-edit-card'};
  card.setConfig(config);
  assert.match(card.shadowRoot.innerHTML, /class="rooms preview-rows"/);
  assert.match(card.shadowRoot.innerHTML, /data-key="climate.lounge" class="room  preview-selected"/);
  assert.match(card.shadowRoot.innerHTML, /data-key="climate.bedroom" class="room preview-placeholder"/);
  assert.equal((card.shadowRoot.innerHTML.match(/class="room-content"/g) || []).length, 1);
  card.parentElement = null;
  card._render();
  assert.doesNotMatch(card.shadowRoot.innerHTML, /class="room preview-placeholder"/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /class="rooms preview-rows"/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /class="room  preview-selected"/);
  assert.equal(Object.getOwnPropertySymbols(JSON.parse(JSON.stringify(config))).length, 0);
});

function addShutter(card, extra = {}) {
  const shutter = {entity_id:'cover.office',state:'open',attributes:{name:'Office shutter',room:'Office',shutter_id:7,current_position:50,supported_features:15,...extra}};
  card._hass.states[shutter.entity_id] = shutter;
  card._entries.push({entity_id:shutter.entity_id,platform:'wiser'});
  return shutter;
}
test('All Heating Shutters filters include only detected Wiser entities', () => {
  const {card, Editor} = setup();
  addShutter(card);
  card._hass.states['cover.other'] = {entity_id:'cover.other',state:'open',attributes:{}};
  card._entries.push({entity_id:'cover.other',platform:'wiser'});
  assert.equal(card._rooms().length, 4);
  card.setConfig({room_type:'heating'});
  assert.equal(card._rooms().length, 3);
  card.setConfig({room_type:'shutters'});
  assert.deepEqual(Array.from(card._rooms(), r => r.entity_id), ['cover.office']);
  assert.match(card.shadowRoot.innerHTML, /data-service="open_cover"/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /data-field="temperature"/);
  const editor = new Editor();
  editor._hass = card._hass; editor._entries = card._entries;
  editor.setConfig({room_type:'shutters'});
  assert.equal(editor._rooms().length, 1);
  assert.equal(editor._typeForm.data.room_type, 'shutters');
  assert.throws(() => card.setConfig({room_type:'invalid'}));
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
  card.setConfig({room_type:'shutters'});
  await card._allOff();
  assert.equal(calls.length,2);
  card.setConfig({room_type:'heating'});
  await card._shutterService(shutter,'open_cover');
  assert.equal(calls.length,2);
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
  card.setConfig({room_type:'all',room_columns:2});
  const markup = card.shadowRoot.innerHTML;
  assert.match(markup,/heading-heating/);
  assert.match(markup,/heading-shutters/);
  assert.ok(markup.indexOf('rooms-heating') < markup.indexOf('climate.bedroom'));
  assert.ok(markup.indexOf('heading-shutters') > markup.indexOf('climate.lounge'));
  assert.ok(markup.indexOf('rooms-shutters') < markup.indexOf('data-key="cover.office"'));
  card.setConfig({room_type:'shutters'});
  assert.doesNotMatch(card.shadowRoot.innerHTML,/data-key="heading-/);
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

test('additional features independently control room rows and retain legacy defaults', () => {
  const {card, Editor} = setup();
  addShutter(card);
  card.setConfig({});
  assert.match(card.shadowRoot.innerHTML, /data-action="mode"/);
  assert.match(card.shadowRoot.innerHTML, /data-field="temperature"/);
  assert.match(card.shadowRoot.innerHTML, /data-action="advance"/);
  for (const feature of ['modes', 'temperature', 'advance']) {
    card.setConfig({features:[feature]});
    const html = card.shadowRoot.innerHTML;
    assert.equal(html.includes('data-action="mode"'), feature === 'modes');
    assert.equal(html.includes('data-action="shutter"'), feature === 'modes');
    assert.equal(html.includes('data-field="temperature"'), feature === 'temperature');
    assert.equal(html.includes('data-field="position"'), feature === 'temperature');
    assert.equal(html.includes('data-action="advance"'), feature === 'advance');
  }
  for (const config of [{features:[]}, {show_controls:false}]) {
    card.setConfig(config);
    assert.doesNotMatch(card.shadowRoot.innerHTML, /class="controls"/);
  }
  const editor = new Editor();
  editor.setConfig({show_controls:false});
  editor._hass = card._hass;
  editor._entries = card._entries;
  editor._selectRoom('climate.bedroom');
  editor._setFeatures(['modes']);
  card.setConfig(editor.lastEvent.detail.config);
  assert.match(card.shadowRoot.innerHTML, /data-action="mode"/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /data-field="temperature"/);
});

 test('feature list reorder and removal persist without resetting other options', () => {
  const {card, Editor} = setup();
  const editor = new Editor();
  editor.setConfig({title:'My rooms', room_columns:3});
  editor._hass = card._hass;
  editor._entries = card._entries;
  editor._selectRoom('climate.bedroom');
  editor._moveFeature(2, 0);
  assert.equal(JSON.stringify(editor.lastEvent.detail.config.room_options['climate.bedroom'].features), JSON.stringify(['advance','modes','temperature']));
  assert.equal(editor.lastEvent.detail.config.title, 'My rooms');
  assert.match(editor._featureList.innerHTML, /ha-sortable/);
  editor._setFeatures(['temperature']);
  assert.equal(JSON.stringify(editor.lastEvent.detail.config.room_options['climate.bedroom'].features), JSON.stringify(['temperature']));
  editor._setFeatures([]);
  assert.equal(editor.lastEvent.detail.config.room_options['climate.bedroom'].features.length, 0);
});

test('room tabs keep feature and emphasis settings independent', () => {
  const {card, Editor} = setup();
  const editor = new Editor();
  editor._hass = card._hass; editor._entries = card._entries;
  editor.setConfig({});
  editor._selectRoom('climate.bedroom');
  editor._setFeatures([]);
  editor._setRoomOptions({temperature_focus:'target'});
  editor._selectRoom('climate.lounge');
  assert.equal(editor._roomForm.data.temperature_focus, 'current');
  editor._setFeatures(['advance','temperature']);
  editor._selectRoom('climate.bedroom');
  assert.equal(editor._roomForm.data.temperature_focus, 'target');
  const config = editor.lastEvent.detail.config;
  assert.equal(config.room_options['climate.bedroom'].features.length, 0);
  assert.equal(config.room_options['climate.lounge'].features.join(','), 'advance,temperature');
  card.setConfig(config);
  const html = card.shadowRoot.innerHTML;
  const section = id => html.split('data-key="' + id + '"')[1].split('</section>')[0];
  assert.doesNotMatch(section('climate.bedroom'), /class="controls"/);
  assert.match(section('climate.bedroom'), /<small>20°C<\/small> 21°C/);
  assert.match(section('climate.lounge'), /data-action="advance"/);
  assert.doesNotMatch(section('climate.lounge'), /data-action="mode"/);
  assert.match(section('climate.lounge'), /--feature-advance:0/);
});

test('feature names and available choices match each room type', () => {
  const {card, Editor} = setup();
  addShutter(card);
  const editor = new Editor();
  editor._hass = card._hass; editor._entries = card._entries;
  editor.setConfig({});
  editor._selectRoom('cover.office');
  assert.match(editor._featureList.innerHTML, /Shutter controls/);
  assert.match(editor._featureList.innerHTML, /Position/);
  assert.doesNotMatch(editor._featureList.innerHTML, /Advance schedule|Climate HVAC modes|Target temperature/);
  editor._moveFeature(1,0);
  assert.equal(editor._config.room_options['cover.office'].features.join(','), 'temperature,modes');
  editor._setFeatures([]);
  editor._addingFeature = true; editor._renderFeatures();
  assert.doesNotMatch(editor._featureList.innerHTML, /Advance schedule/);
  editor._selectRoom('climate.bedroom');
  assert.match(editor._featureList.innerHTML, /Climate HVAC modes/);
  assert.match(editor._featureList.innerHTML, /Target temperature/);
  assert.match(editor._featureList.innerHTML, /Advance schedule/);
});
