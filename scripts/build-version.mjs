import {readFileSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";

const RELEASE = /^(\d+)\.(\d+)\.(\d+)$/;
const DEVELOPMENT = /^(\d+\.\d+\.\d+-dev)\.\d+$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export default function buildVersion({dev = false, root = process.cwd(), releaseTag} = {}) {
  const packagePath = resolve(root, "package.json");
  const counterPath = resolve(root, ".dev-build.json");
  const packageVersion = JSON.parse(readFileSync(packagePath, "utf8")).version;
  let version = packageVersion;
  let baseVersion;
  let build;

  if (dev) {
    const release = RELEASE.exec(packageVersion);
    const development = DEVELOPMENT.exec(packageVersion);
    baseVersion = release
      ? `${release[1]}.${release[2]}.${BigInt(release[3]) + 1n}-dev`
      : development?.[1];
    if (!baseVersion) throw new Error(`Cannot create a dev build from version ${packageVersion}`);

    let previous;
    try {
      previous = JSON.parse(readFileSync(counterPath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (previous && (!Number.isSafeInteger(previous.build) || previous.build < 0)) {
      throw new Error("Invalid dev build counter in .dev-build.json");
    }
    build = previous?.baseVersion === baseVersion ? previous.build + 1 : 1;
    version = `${baseVersion}.${build}`;
  } else if (!SEMVER.test(packageVersion)) {
    throw new Error(`Release builds require a semantic package version, received ${packageVersion}`);
  }

  if (releaseTag && releaseTag !== `v${version}`) {
    throw new Error(`Release tag ${releaseTag} does not match package version v${version}`);
  }

  const resourceUrl = `/wiser/wiser-rooms-card.js?v=${version}`;
  return {
    version,
    resourceUrl,
    complete(outputDirectory) {
      writeFileSync(resolve(outputDirectory, "build-info.json"), `${JSON.stringify({version, resourceUrl}, null, 2)}\n`);
      if (dev) writeFileSync(counterPath, `${JSON.stringify({baseVersion, build}, null, 2)}\n`);
    },
  };
}
