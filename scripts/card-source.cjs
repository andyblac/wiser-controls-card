const {readFileSync} = require("node:fs");
const {resolve} = require("node:path");

const EDITOR_SLOT = "  /* Editor source is included here by scripts/card-source.cjs. */\n  __WISER_CARD_EDITOR__";
const CSS_SLOT = "__WISER_EDITOR_CSS__";

// Assemble source fragments in the card's existing private scope. This keeps
// shared helpers private and preserves the single-file Home Assistant resource.
function assembleCardSource(card, editor, css) {
  for (const [source, token] of [[card, EDITOR_SLOT], [editor, CSS_SLOT]]) {
    if (source.split(token).length !== 2) {
      throw new Error(`Expected exactly one source slot: ${token}`);
    }
  }
  if (css.includes("`") || css.includes("${")) {
    throw new Error("Editor CSS must not contain JavaScript template expressions");
  }
  const editorSource = editor.trimEnd().replace(CSS_SLOT, () => css.replace(/\n$/, ""));
  return card.replace(EDITOR_SLOT, () => editorSource);
}

function loadCardSource(root = resolve(__dirname, "..")) {
  const read = file => readFileSync(resolve(root, "src", file), "utf8");
  return assembleCardSource(
    read("wiser-controls-card.js"),
    read("wiser-controls-card-editor.js"),
    read("wiser-controls-card-editor.css"),
  );
}

module.exports = {assembleCardSource, loadCardSource};
