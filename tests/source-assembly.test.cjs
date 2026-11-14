const {test} = require('node:test');
const assert = require('node:assert/strict');
const {Script} = require('node:vm');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {assembleCardSource, loadCardSource} = require('../scripts/card-source.cjs');

const sourceRoot = join(__dirname, '../src');
const read = name => readFileSync(join(sourceRoot, name), 'utf8');

test('production card assembly includes the editor and CSS in one valid script', () => {
  const source = loadCardSource();
  assert.doesNotThrow(() => new Script(source));
  assert.match(source, /class WiserRoomsCardEditor extends HTMLElement/);
  assert.match(source, /ha-form\.configuration-mode::part\(root\)/);
  assert.doesNotMatch(source, /__WISER_CARD_EDITOR__|__WISER_EDITOR_CSS__/);
  assert.match(source, /customElements.define\("wiser-controls-card-editor"/);
  assert.match(source, /customElements.define\("wiser-rooms-card-editor"/);
});

test('source assembly rejects missing or duplicate fragments and unsafe CSS', () => {
  const card = read('wiser-controls-card.js');
  const editor = read('wiser-controls-card-editor.js');
  const css = read('wiser-controls-card-editor.css');
  assert.throws(() => assembleCardSource('', editor, css), /exactly one source slot/);
  assert.throws(() => assembleCardSource(card + card, editor, css), /exactly one source slot/);
  assert.throws(() => assembleCardSource(card, '', css), /exactly one source slot/);
  assert.throws(() => assembleCardSource(card, editor, '`'), /template expressions/);
  assert.throws(() => assembleCardSource(card, editor, '${runtime}'), /template expressions/);
  assert.ok(assembleCardSource(card, editor, '/* $& $1 */').includes('/* $& $1 */'));
});
