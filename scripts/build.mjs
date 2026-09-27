import {readFileSync, mkdirSync, writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import buildVersion from "./build-version.mjs";
const root = new URL("../", import.meta.url);
const source = readFileSync(new URL("src/wiser-rooms-card.js", root), "utf8");
const localizeSource = readFileSync(new URL("src/localize/localize.js", root), "utf8");
const translations = Object.fromEntries(["en-US", "en-GB", "de", "fr"].map(language => [
  language,
  JSON.parse(readFileSync(new URL(`src/localize/languages/${language}.json`, root), "utf8")),
]));
const dev = process.argv.includes("--dev");
const build = buildVersion({dev, root:fileURLToPath(root), releaseTag:process.env.RELEASE_TAG});
const versionToken = "__WISER_CARD_VERSION__";
const translationsToken = "__WISER_ROOMS_TRANSLATIONS__";
if (!source.includes(versionToken)) throw new Error(`Missing ${versionToken} source token`);
if (!localizeSource.includes(translationsToken)) throw new Error(`Missing ${translationsToken} source token`);
const output = new URL("dist/", root);
mkdirSync(output, {recursive:true});
const localize = localizeSource.replace(translationsToken, JSON.stringify(translations));
writeFileSync(new URL("wiser-rooms-card.js", output), `/*! WISER-CARD-VERSION wiser-rooms-card ${build.version} */\n${localize}\n${source.replaceAll(versionToken, build.version)}`);
build.complete(fileURLToPath(output));
console.log(`Built wiser-rooms-card ${build.version}`);
console.log(`Dashboard resource: ${build.resourceUrl}`);
