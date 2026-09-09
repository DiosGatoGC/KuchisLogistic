import assert from "node:assert/strict";
import test from "node:test";

import {
  LOGISTICS_HISTORY_KEY,
  decideProtectedBack,
  readLogisticsHistoryEntry,
  resolveLogisticsHistoryEntry,
  shouldShowGlobalBack,
} from "./protected-navigation-model.ts";

test("home oculta el control global y las rutas protegidas hijas lo muestran", () => {
  assert.equal(shouldShowGlobalBack("/home", false), false);
  assert.equal(shouldShowGlobalBack("/home/", false), false);
  assert.equal(shouldShowGlobalBack("/mesas", false), true);
  assert.equal(shouldShowGlobalBack("/comandar/session-1", false), true);
  assert.equal(shouldShowGlobalBack("/cobrar/session-1", false), true);
});

test("una navegación previa creada dentro de Logistics usa Back", () => {
  const homeEntry = resolveLogisticsHistoryEntry({
    pathname: "/home",
    storedEntry: null,
    currentEntry: null,
    createId: () => "home-entry",
  });
  const childEntry = resolveLogisticsHistoryEntry({
    pathname: "/mesas",
    storedEntry: null,
    currentEntry: homeEntry,
    createId: () => "tables-entry",
  });

  assert.deepEqual(decideProtectedBack(childEntry), { kind: "history" });
});

test("una entrada directa sin historial útil usa el fallback interno", () => {
  const directEntry = resolveLogisticsHistoryEntry({
    pathname: "/pedidos",
    storedEntry: null,
    currentEntry: null,
    createId: () => "direct-entry",
  });

  assert.deepEqual(decideProtectedBack(directEntry), {
    kind: "fallback",
    href: "/home",
  });
});

test("un historial externo no se interpreta como destino navegable", () => {
  const externalBrowserState = {
    referrer: "https://example.com/previous",
    historyLength: 4,
  };
  const entry = readLogisticsHistoryEntry(externalBrowserState);

  assert.equal(entry, null);
  assert.deepEqual(decideProtectedBack(entry), {
    kind: "fallback",
    href: "/home",
  });
});

test("una entrada Logistics guardada se restaura sin crear un falso predecesor", () => {
  const stored = {
    id: "tables-entry",
    pathname: "/mesas",
    previousAppEntryId: "home-entry",
  };
  const parsed = readLogisticsHistoryEntry({ [LOGISTICS_HISTORY_KEY]: stored });
  const resolved = resolveLogisticsHistoryEntry({
    pathname: "/mesas",
    storedEntry: parsed,
    currentEntry: null,
    createId: () => "unused",
  });

  assert.deepEqual(resolved, stored);
  assert.deepEqual(decideProtectedBack(resolved), { kind: "history" });
});

test("el terminal exitoso de Checkout suprime el Back genérico", () => {
  assert.equal(shouldShowGlobalBack("/cobrar/session-paid", true), false);
});
