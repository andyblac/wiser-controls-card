import {readFileSync, mkdirSync, writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import buildVersion from "./build-version.mjs";
const root = new URL("../", import.meta.url);
const source = readFileSync(new URL("src/wiser-controls-card.js", root), "utf8");
const panelSource = readFileSync(new URL("src/wiser-controls-panel.js", root), "utf8");
const deviceImages = {
  Controller:"src/images/devices/controller.png",
  RoomStat:"src/images/devices/room-thermostat.png",
  SmartPlug:"src/images/devices/smart-plug.png",
  TemperatureHumiditySensor:"src/images/devices/temperature-humidity.png",
  iTRV:"src/images/devices/radiator-thermostat.png",
  UnderFloorHeating:"src/images/devices/underfloor-heating.png",
  HeatingActuator:"src/images/devices/heating-actuator.png",
  DimmableLight:"src/images/devices/dimmer.png",
  OnOffLight:"src/images/devices/power.png",
  Shutter:"src/images/devices/shutter.png",
  SmokeAlarmDevice:"src/images/devices/smoke.png",
  WaterLeakageSensor:"src/images/devices/leak.png",
  MotionLightSensor:"src/images/devices/motion.png",
  WindowDoorSensor:"src/images/devices/window.png",
  CFMT:"src/images/devices/cfmt.png",
  PowerTagE:"src/images/devices/powertag.png",
  ButtonPanel:"src/images/devices/button.png",
  BoilerInterface:"src/images/devices/boiler.png",
};
const localizeSource = readFileSync(new URL("src/localize/localize.js", root), "utf8");
const translations = Object.fromEntries(["en-US", "en-GB", "de", "fr", "hu"].map(language => [
  language,
  JSON.parse(readFileSync(new URL(`src/localize/languages/${language}.json`, root), "utf8")),
]));
const dev = process.argv.includes("--dev");
const final = process.argv.includes("--release");
if (dev && final) throw new Error("A build cannot be both development and final release");
const build = buildVersion({dev, final, root:fileURLToPath(root), releaseTag:process.env.RELEASE_TAG});
const versionToken = "__WISER_CARD_VERSION__";
const translationsToken = "__WISER_ROOMS_TRANSLATIONS__";
const deviceImageToken = model => `__WISER_DEVICE_IMAGE_${model.replaceAll(/[^A-Za-z0-9]/g,"_").toUpperCase()}__`;
if (!source.includes(versionToken)) throw new Error(`Missing ${versionToken} source token`);
if (!localizeSource.includes(translationsToken)) throw new Error(`Missing ${translationsToken} source token`);
for (const model of Object.keys(deviceImages)) {
  const token = deviceImageToken(model);
  if (!panelSource.includes(token)) throw new Error(`Missing ${token} source token`);
}
const output = new URL("dist/", root);
mkdirSync(output, {recursive:true});
const localize = localizeSource.replace(translationsToken, JSON.stringify(translations));
const embeddedPanelSource = Object.entries(deviceImages).reduce((embedded,[model,path]) => {
  const image = readFileSync(new URL(path, root)).toString("base64");
  return embedded.replaceAll(deviceImageToken(model),`data:image/png;base64,${image}`);
},panelSource);
const body = `${localize}\n${source.replaceAll(versionToken, build.version)}\n${embeddedPanelSource}`;
const bundle = `/*! WISER-CARD-VERSION wiser-controls-card ${build.version} */\n${body}`;
const legacyBundle = `/*! WISER-CARD-VERSION wiser-rooms-card ${build.version} */\n${body}`;
writeFileSync(new URL("wiser-controls-card.js", output), bundle);
writeFileSync(new URL("wiser-rooms-card.js", output), legacyBundle);
build.complete(fileURLToPath(output));
console.log(`Built wiser-controls-card ${build.version}`);
console.log(`Dashboard resource: ${build.resourceUrl}`);
