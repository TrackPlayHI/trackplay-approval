// Points d'une file `points` (terrain : 6 points du Jeu), sans rien de l'écran : utilisable dans
// l'app et testé avec Node (`node --test tests/`). Règles reprises de GameAI :
// - `orderCourt` : `geometry/CourtOrder` de `:core` (docs/zones-auto.md §4.4), en parité, cas de
//   `testdata/court-order.json` copiés dans `tests/court-order.json` ;
// - `ring` et `footOnSide` : édition de la zone Jeu (`OverlayView.editPoint`,
//   `ConfigWriter.orderCorners`) : les points dans l'ordre du tour, un point ajouté sur un côté est
//   le pied de la perpendiculaire sur le côté le plus proche.
// Points normalisés [x, y] (0 à 1 dans l'image, au-delà dans la marge) ; `aspect` = largeur sur
// hauteur de l'image, pour mesurer angles et distances en pixels.
"use strict";

(function (root) {
  const COURT_POINTS = 6;

  // Points dans l'ordre du tour : angle autour de leur centre (sens des aiguilles d'une montre à
  // l'écran, y vers le bas), comme `ConfigWriter.orderCorners` de GameAI.
  function ring(points, aspect = 16 / 9) {
    if (points.length < 3) return points.slice();
    const cx = points.reduce((a, p) => a + p[0], 0) / points.length;
    const cy = points.reduce((a, p) => a + p[1], 0) / points.length;
    const angle = (p) => Math.atan2(p[1] - cy, (p[0] - cx) * aspect);
    return points.slice().sort((a, b) => angle(a) - angle(b));
  }

  // Angle dont tourne le contour au point i de `r` (0 : aligné avec ses voisins).
  function turn(r, i, aspect) {
    const a = r[(i - 1 + r.length) % r.length];
    const b = r[i];
    const c = r[(i + 1) % r.length];
    const ux = (b[0] - a[0]) * aspect;
    const uy = b[1] - a[1];
    const vx = (c[0] - b[0]) * aspect;
    const vy = c[1] - b[1];
    return Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
  }

  // Les 6 points du Jeu, donnés dans n'importe quel ordre, numérotés (docs/zones-auto.md §4.4) :
  // la médiane est la paire de points opposés où le contour tourne le moins ; verticale, ordre de
  // §4.1 (1 coin haut gauche, 2 bout du haut…) ; horizontale, 2 au bout gauche. Un autre nombre de
  // points est rendu tel quel.
  function orderCourt(points, aspect = 16 / 9) {
    if (points.length !== COURT_POINTS) return points.slice();
    const r = ring(points, aspect);
    const turns = r.map((_, i) => turn(r, i, aspect));
    const half = COURT_POINTS / 2;
    let k = 0;
    for (let i = 1; i < half; i++) if (turns[i] + turns[i + half] < turns[k] + turns[k + half]) k = i;
    const a = r[k];
    const b = r[k + half];
    const vertical = Math.abs(b[1] - a[1]) >= Math.abs(b[0] - a[0]) * aspect;
    const aFirst = vertical ? a[1] <= b[1] : a[0] <= b[0];
    const second = aFirst ? k : k + half;
    const start = (second - 1 + COURT_POINTS) % COURT_POINTS;
    return r.slice(start).concat(r.slice(0, start));
  }

  // Côté de `r` (du point i au suivant) le plus proche de `p`, à moins de `radius` (distance en
  // pixels de l'image, via `width` et `height`) : { index, point } avec le pied de la
  // perpendiculaire, ou null. Moins de 3 points : pas de côté.
  function footOnSide(r, p, radius, width, height) {
    if (r.length < 3) return null;
    let best = null;
    let bestDistance = radius;
    r.forEach((a, i) => {
      const b = r[(i + 1) % r.length];
      const ax = a[0] * width;
      const ay = a[1] * height;
      const bx = b[0] * width;
      const by = b[1] * height;
      const px = p[0] * width;
      const py = p[1] * height;
      const length2 = (bx - ax) ** 2 + (by - ay) ** 2;
      if (length2 === 0) return;
      const t = Math.min(1, Math.max(0, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / length2));
      const distance = Math.hypot(ax + t * (bx - ax) - px, ay + t * (by - ay) - py);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { index: i, point: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])] };
      }
    });
    return best;
  }

  const api = { COURT_POINTS, ring, orderCourt, footOnSide };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Polygon = api;
})(typeof self !== "undefined" ? self : this);
