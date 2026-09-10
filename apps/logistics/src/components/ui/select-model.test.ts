import assert from "node:assert/strict";
import test from "node:test";

import {
  initialSelectIndex,
  moveSelectIndex,
  selectedOptionLabel,
  selectValueAt,
} from "./select-model.ts";

const options = [
  { value: "a", label: "A" },
  { value: "b", label: "B", disabled: true },
  { value: "c", label: "C" },
];

test("abre en el valor seleccionado o en la primera opción habilitada", () => {
  assert.equal(initialSelectIndex(options, "c"), 2);
  assert.equal(initialSelectIndex(options, ""), 0);
});

test("flechas recorren opciones habilitadas y envuelven los extremos", () => {
  assert.equal(moveSelectIndex(options, 0, 1), 2);
  assert.equal(moveSelectIndex(options, 2, 1), 0);
  assert.equal(moveSelectIndex(options, 0, -1), 2);
});

test("selección conserva el valor exacto y rechaza opciones deshabilitadas", () => {
  assert.equal(selectValueAt(options, 2), "c");
  assert.equal(selectValueAt(options, 1), null);
});

test("placeholder sólo se muestra cuando no existe selección válida", () => {
  assert.equal(selectedOptionLabel(options, "", "Selecciona"), "Selecciona");
  assert.equal(selectedOptionLabel(options, "a", "Selecciona"), "A");
});
