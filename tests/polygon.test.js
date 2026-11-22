// Règles de polygon.js : node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { orderCourt, ring, footOnSide } = require("../polygon.js");
// Copie de testdata/court-order.json de GameAI (cas de parité de CourtOrder).
const doc = require("./court-order.json");

function permutations(items) {
  if (items.length <= 1) return [items];
  return items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((p) => [x, ...p]));
}

test("les cas de GameAI sont numérotés comme attendu", () => {
  assert.strictEqual(doc.cases.length, 6);
  for (const c of doc.cases) assert.deepStrictEqual(orderCourt(c.points, doc.aspect), c.expected, c.name);
});

test("l'ordre des points posés ne change rien", () => {
  for (const c of doc.cases) {
    for (const p of permutations(c.expected)) assert.deepStrictEqual(orderCourt(p, doc.aspect), c.expected, c.name);
  }
});

test("un autre nombre de points est gardé", () => {
  const square = [[0.6, 0.4], [0.4, 0.4], [0.4, 0.6], [0.6, 0.6]];
  assert.deepStrictEqual(orderCourt(square), square);
  assert.deepStrictEqual(orderCourt([]), []);
});

test("les points sont rangés dans l'ordre du tour", () => {
  // Comme ConfigWriter.orderCorners de GameAI : haut gauche, haut droit, bas droit, bas gauche.
  const r = ring([[0.6, 0.6], [0.4, 0.4], [0.4, 0.6], [0.6, 0.4]], 1);
  assert.deepStrictEqual(r, [[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6]]);
  assert.deepStrictEqual(ring([[0.5, 0.5], [0.1, 0.1]]), [[0.5, 0.5], [0.1, 0.1]]);
});

test("un point ajouté sur un côté est le pied de la perpendiculaire", () => {
  const r = [[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6]];
  // Image 1000 x 1000 : appui à 10 px sous le côté du haut.
  const foot = footOnSide(r, [0.45, 0.41], 20, 1000, 1000);
  assert.strictEqual(foot.index, 0);
  assert.ok(Math.abs(foot.point[0] - 0.45) < 1e-9 && Math.abs(foot.point[1] - 0.4) < 1e-9);
  // Trop loin de tout côté, ou moins de 3 points : rien.
  assert.strictEqual(footOnSide(r, [0.5, 0.5], 20, 1000, 1000), null);
  assert.strictEqual(footOnSide(r.slice(0, 2), [0.45, 0.41], 20, 1000, 1000), null);
  // Le pied reste sur le côté (bout du segment).
  assert.deepStrictEqual(footOnSide(r, [0.39, 0.39], 20, 1000, 1000).point, [0.4, 0.4]);
});
