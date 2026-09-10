import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { LOGISTICS_PWA_MANIFEST, networkNotice } from "./pwa-model.ts";

test("manifest preserves the KUCHI'S install and landscape contract", () => {
  assert.equal(LOGISTICS_PWA_MANIFEST.name, "KUCHI'S Logistics");
  assert.equal(LOGISTICS_PWA_MANIFEST.short_name, "KUCHI'S");
  assert.equal(LOGISTICS_PWA_MANIFEST.start_url, "/home");
  assert.equal(LOGISTICS_PWA_MANIFEST.scope, "/");
  assert.equal(LOGISTICS_PWA_MANIFEST.display, "standalone");
  assert.equal(LOGISTICS_PWA_MANIFEST.orientation, "landscape");
  assert.equal(
    LOGISTICS_PWA_MANIFEST.icons.some((icon) => icon.purpose === "maskable" && icon.sizes === "512x512"),
    true,
  );
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
  assert.doesNotMatch(worker, /caches\.(open|match)/);
  assert.doesNotMatch(worker, /addEventListener\(["']sync["']/);
  assert.doesNotMatch(worker, /skipWaiting|clients\.claim/);
});
