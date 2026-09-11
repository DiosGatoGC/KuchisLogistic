import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { LOGISTICS_PWA_MANIFEST, networkNotice } from "./pwa-model.ts";

test("manifest preserves installation identity without an OS orientation lock", () => {
  assert.equal(LOGISTICS_PWA_MANIFEST.name, "KUCHI'S Logistics");
  assert.equal(LOGISTICS_PWA_MANIFEST.short_name, "KUCHI'S");
  assert.equal(LOGISTICS_PWA_MANIFEST.start_url, "/home");
  assert.equal(LOGISTICS_PWA_MANIFEST.scope, "/");
  assert.equal(LOGISTICS_PWA_MANIFEST.display, "standalone");
  assert.equal("orientation" in LOGISTICS_PWA_MANIFEST, false);
  assert.equal(
    LOGISTICS_PWA_MANIFEST.icons.some((icon) => icon.purpose === "maskable" && icon.sizes === "512x512"),
    true,
  );
});

test("login has a scrollable short-landscape phone contract", () => {
  const styles = readFileSync(
    new URL("../../app/globals.css", import.meta.url),
    "utf8",
  );
  const baseLoginRule = styles.slice(
    styles.indexOf(".login-page {"),
    styles.indexOf(".login-page__decor"),
  );
  const compactQuery =
    "@media (orientation: landscape) and (pointer: coarse) and (max-height: 520px)";
  const compactLoginStart = styles.indexOf(compactQuery);
  const compactAppRootStart = styles.indexOf("  .app-root {", compactLoginStart);
  const compactLoginRules = styles.slice(compactLoginStart, compactAppRootStart);

  assert.match(baseLoginRule, /height: 100dvh/);
  assert.match(baseLoginRule, /overflow-x: hidden/);
  assert.match(baseLoginRule, /overflow-y: auto/);
  assert.doesNotMatch(baseLoginRule, /overflow: hidden/);
  assert.match(compactLoginRules, /\.login-page \{[\s\S]*position: fixed/);
  assert.match(compactLoginRules, /\.login-layout \{[\s\S]*grid-template-columns/);
  assert.match(compactLoginRules, /\.login-form \.input \{[\s\S]*min-height: 44px/);
  assert.match(compactLoginRules, /\.login-submit \{[\s\S]*min-height: 44px/);
});

test("network state only warns when authority is unavailable", () => {
  assert.deepEqual(networkNotice(true), { visible: false, label: "" });
  assert.deepEqual(networkNotice(false), {
    visible: true,
    label: "Sin conexión. La sincronización está pendiente.",
  });
});

test("service worker stays network-only and has no offline write machinery", () => {
  const worker = readFileSync(
    new URL("../../../public/sw.js", import.meta.url),
    "utf8",
  );
  assert.match(worker, /event\.respondWith\(fetch\(event\.request\)\)/);
  assert.match(worker, /requestUrl\.origin === self\.location\.origin/);
  assert.match(worker, /!requestUrl\.pathname\.startsWith\("\/api\/"\)/);
  assert.doesNotMatch(worker, /caches\.(open|match)/);
  assert.doesNotMatch(worker, /addEventListener\(["']sync["']/);
  assert.doesNotMatch(worker, /skipWaiting|clients\.claim/);
});
