import {readFileSync, mkdirSync, writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import buildVersion from "./build-version.mjs";
const root = new URL("../", import.meta.url);
const source = readFileSync(new URL("src/wiser-controls-card.js", root), "utf8");
const panelSource = readFileSync(new URL("src/wiser-controls-panel.js", root), "utf8");
const localizeSource = readFileSync(new URL("src/localize/localize.js", root), "utf8");
const translations = Object.fromEntries(["en-US", "en-GB", "de", "fr"].map(language => [
  language,
  JSON.parse(readFileSync(new URL(`src/localize/languages/${language}.json`, root), "utf8")),
]));
const dev = process.argv.includes("--dev");
const final = process.argv.includes("--release");
if (dev && final) throw new Error("A build cannot be both development and final release");
const build = buildVersion({dev, final, root:fileURLToPath(root), releaseTag:process.env.RELEASE_TAG});
const versionToken = "__WISER_CARD_VERSION__";
const translationsToken = "__WISER_ROOMS_TRANSLATIONS__";
if (!source.includes(versionToken)) throw new Error(`Missing ${versionToken} source token`);
if (!localizeSource.includes(translationsToken)) throw new Error(`Missing ${translationsToken} source token`);
const output = new URL("dist/", root);
mkdirSync(output, {recursive:true});
const localize = localizeSource.replace(translationsToken, JSON.stringify(translations));
const body = `${localize}\n${source.replaceAll(versionToken, build.version)}\n${panelSource}`;
const bundle = `/*! WISER-CARD-VERSION wiser-controls-card ${build.version} */\n${body}`;
const legacyBundle = `/*! WISER-CARD-VERSION wiser-rooms-card ${build.version} */\n${body}`;
writeFileSync(new URL("wiser-controls-card.js", output), bundle);
writeFileSync(new URL("wiser-rooms-card.js", output), legacyBundle);
build.complete(fileURLToPath(output));
console.log(`Built wiser-controls-card ${build.version}`);
console.log(`Dashboard resource: ${build.resourceUrl}`);
