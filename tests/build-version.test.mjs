import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import buildVersion from "../scripts/build-version.mjs";

test("successful builds advance package versions through stable and beta development cycles", () => {
  const root = mkdtempSync(join(tmpdir(), "wiser-rooms-version-"));
  const output = join(root, "dist");
  mkdirSync(output);
  const setRelease = version => writeFileSync(join(root, "package.json"), JSON.stringify({version}));
  const run = (dev, complete = true) => {
    const result = buildVersion({dev, root});
    if (complete) result.complete(output);
    return result;
  };
  try {
    setRelease("1.2.3");
    assert.equal(run(true, false).version, "1.2.4-dev.1");
    assert.equal(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version, "1.2.3");
    assert.equal(run(true).version, "1.2.4-dev.1");
    assert.equal(run(true).version, "1.2.4-dev.2");
    const release = run(false);
    assert.equal(release.version, "1.2.4");
    assert.equal(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version, "1.2.4");
    assert.equal(run(true).version, "1.2.5-dev.1");
    assert.deepEqual(JSON.parse(readFileSync(join(output, "build-info.json"), "utf8")), {
      version:"1.2.5-dev.1",
      resourceUrl:"/wiser/wiser-rooms-card.js?v=1.2.5-dev.1",
    });
    setRelease("1.3.1-beta.1");
    assert.equal(run(true).version, "1.3.1-beta.2-dev.1");
    assert.equal(run(true).version, "1.3.1-beta.2-dev.2");
    assert.equal(buildVersion({final:true, root}).version, "1.3.1");
    assert.equal(run(false).version, "1.3.1-beta.2");
    assert.equal(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version, "1.3.1-beta.2");
  } finally {
    rmSync(root, {recursive:true, force:true});
  }
});

test("release tags must match the semantic package version", () => {
  const root = mkdtempSync(join(tmpdir(), "wiser-rooms-release-"));
  try {
    writeFileSync(join(root, "package.json"), JSON.stringify({version:"1.2.3"}));
    assert.equal(buildVersion({root, releaseTag:"v1.2.3"}).version, "1.2.3");
    assert.throws(() => buildVersion({root, releaseTag:"v1.2.4"}), /does not match/);
    writeFileSync(join(root, "package.json"), JSON.stringify({version:"1.2.4-beta.1"}));
    assert.equal(buildVersion({root, releaseTag:"v1.2.4-beta.1"}).version, "1.2.4-beta.1");
    assert.equal(buildVersion({final:true, root, releaseTag:"v1.2.4"}).version, "1.2.4");
    writeFileSync(join(root, "package.json"), JSON.stringify({version:"1.2.4-beta.2-dev.7"}));
    assert.equal(buildVersion({root, releaseTag:"v1.2.4-beta.2"}).version, "1.2.4-beta.2");
    assert.throws(() => buildVersion({root, releaseTag:"v1.2.4-beta.3"}), /does not match/);
    writeFileSync(join(root, "package.json"), JSON.stringify({version:"not-semver"}));
    assert.throws(() => buildVersion({root}), /semantic package version/);
  } finally {
    rmSync(root, {recursive:true, force:true});
  }
});
