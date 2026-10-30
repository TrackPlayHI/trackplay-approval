// Approval : valider d'un geste les paires « image + résultat » proposées par un modèle.
// Boutons de jugement, les mêmes dans les deux modes : ✓ juste, ✗ faux (ouvre l'édition),
// ? je ne sais pas, ⊘ écarter (image à ne pas apprendre), ↺ remet la paire à « non jugée ».
// Glissés (écran partagé, hors édition) : haut = suivante, bas = précédente, gauche = liste ;
// en liste, une carte glissée à droite s'ouvre dans l'écran partagé.
"use strict";

const $ = (id) => document.getElementById(id);
const VERDICTS = [
  ["ok", "✓", "Juste"], ["wrong", "✗", "Faux"], ["unknown", "?", "Je ne sais pas"],
  ["discard", "⊘", "Écarter"], ["reset", "↺", "Non jugée"],
];
const SWIPE = 60; // px avant qu'un glissé compte
const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible */ }
  },
};

const state = {
  settings: store.get("approval:settings", { repo: "trackplayhi/trackplay-models", token: "" }),
  device: store.get("approval:device", null) || Math.random().toString(36).slice(2, 8),
  queue: null, // { name, pairs: [{ id, image, text, boxes, confidence, reason }] }
  demo: false,
  judgments: {}, // id -> { id, text, verdict, at } de la famille de la file (« reset » : non jugée)
  index: 0, // paire de l'écran partagé, dans l'ordre de la file
  current: null,
  mode: store.get("approval:mode", "split"),
};
store.set("approval:device", state.device);

// ---- GitHub ----

async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${state.settings.repo}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${state.settings.token}`,
      Accept: options.raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`GitHub ${response.status} : ${(await response.text()).slice(0, 120)}`);
  if (options.blob) return response.blob();
  return options.raw ? response.text() : response.json();
}

async function listQueues() {
  const files = await github("contents/queues");
  return files.filter((f) => f.name.endsWith(".json")).map((f) => f.name.replace(/\.json$/, ""))
    .sort().reverse();
}

function base64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

// ---- Jugements dans le dépôt : un fichier par famille (judgments/<famille>.json) ----
// Partagé par toutes les versions des files de la famille ; à chaque envoi, l'app relit le
// fichier, fusionne (pour une même image, le plus récent selon `at` l'emporte, « reset » compris),
// le réécrit trié par identifiant et recommence si quelqu'un l'a changé entre-temps.

function judgmentsPath() { return `judgments/${familyOf(state.queue)}.json`; }

function decodeBase64(text) {
  const binary = atob(text.replace(/\n/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

// Fichier de la famille dans le dépôt : { list, sha } (vide s'il n'existe pas encore).
async function readRemote() {
  const url = `https://api.github.com/repos/${state.settings.repo}/contents/${judgmentsPath()}`;
  const headers = { Authorization: `Bearer ${state.settings.token}`, Accept: "application/vnd.github+json" };
  const response = await fetch(url, { headers, cache: "no-store" });
  if (response.status === 404) return { list: [], sha: null };
  if (!response.ok) throw new Error(`GitHub ${response.status}`);
  const file = await response.json();
  const text = file.content
    ? decodeBase64(file.content)
    : await github(`contents/${judgmentsPath()}`, { raw: true }); // gros fichier : sans contenu
  return { list: JSON.parse(text), sha: file.sha };
}

// Fusion : pour chaque image, le jugement le plus récent.
function mergeJudgments(target, list) {
  for (const j of list) {
    const mine = target[j.id];
    if (!mine || (j.at || "") > (mine.at || "")) target[j.id] = j;
  }
  return target;
}

// À l'ouverture d'une file : les jugements déjà dans le dépôt (autres versions, autres appareils).
async function pullJudgments() {
  if (state.demo || !state.settings.token) return;
  try {
    const { list } = await readRemote();
    mergeJudgments(state.judgments, list);
    store.set(judgmentsKey(), state.judgments);
    render();
  } catch (error) {
    toast(`Jugements du dépôt non lus : ${error.message}`);
  }
}

async function send() {
  const mine = Object.values(state.judgments);
  if (!mine.length) return toast("Aucun jugement à envoyer");
  if (state.demo) return toast(`Exemple : ${mine.length} jugements, rien n'est envoyé`);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { list, sha } = await readRemote();
      const merged = mergeJudgments(Object.fromEntries(list.map((j) => [j.id, j])), mine);
      const sorted = Object.values(merged).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const response = await fetch(
        `https://api.github.com/repos/${state.settings.repo}/contents/${judgmentsPath()}`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${state.settings.token}`, Accept: "application/vnd.github+json" },
          body: JSON.stringify({
            message: commitMessage(sorted, new Date()),
            content: base64(JSON.stringify(sorted, null, 1) + "\n"),
            ...(sha ? { sha } : {}),
          }),
        },
      );
      if (response.status === 409 || response.status === 422) continue; // changé entre-temps
      if (!response.ok) throw new Error(`GitHub ${response.status} : ${(await response.text()).slice(0, 120)}`);
      state.judgments = merged;
      store.set(judgmentsKey(), state.judgments);
      render();
      return toast(`${mine.length} jugements envoyés (${familyOf(state.queue)})`);
    } catch (error) {
      return toast(`Envoi impossible : ${error.message}`);
    }
  }
  toast("Envoi impossible : le fichier change sans cesse, réessaie");
}

// Message de commit facile à retrouver (préfixe « Approval · ») :
// « Approval · score-text : 214 jugements (171 ✓, 14 ✗, 10 ?, 5 ⊘), file score-text-v2 ».
function commitMessage(list, now) {
  const count = (v) => list.filter((j) => j.verdict === v).length;
  const judged = list.filter((j) => j.verdict !== "reset").length;
  return `Approval · ${familyOf(state.queue)} : ${judged} jugements `
    + `(${count("ok")} ✓, ${count("wrong")} ✗, ${count("unknown")} ?, ${count("discard")} ⊘), `
    + `file ${state.queue.name}\n\n`
    + `Appareil ${state.device}, ${now.toISOString().slice(0, 16).replace("T", " ")} UTC.\n`
    + `Fichier : ${judgmentsPath()}\n`;
}

// ---- File et jugements ----

// Famille d'une file : `family`, sinon son nom sans la version (« score-text-v3 » → « score-text »).
function familyOf(queue) { return queue.family || queue.name.replace(/-v\d+$/, ""); }

// Jugements gardés sur le téléphone par famille ; ceux d'avant (par file) y sont repris.
function judgmentsKey() { return `approval:judgments:${familyOf(state.queue)}`; }

function isJudged(j) { return Boolean(j) && j.verdict !== "reset"; }
function judgmentOf(pair) { return isJudged(state.judgments[pair.id]) ? state.judgments[pair.id] : null; }

function useQueue(queue, demo) {
  state.queue = queue;
  state.demo = demo;
  state.judgments = store.get(judgmentsKey(), {});
  const old = `approval:${queue.name}:judgments`; // ancien stockage, par file
  const previous = store.get(old, null);
  if (previous) {
    mergeJudgments(state.judgments, Object.values(previous));
    store.set(judgmentsKey(), state.judgments);
    try { localStorage.removeItem(old); } catch { /* stockage indisponible */ }
  }
  // On ouvre sur la première paire non jugée.
  const first = queue.pairs.findIndex((p) => !judgmentOf(p));
  state.index = Math.max(0, first);
  render();
}

// File « boîtes seules » (`kind` : `boxes`, ballon…) : pas de valeur, seulement des boîtes.
function boxesMode() { return state.queue?.kind === "boxes"; }

// Ce que dit une paire en mode boîtes : « aucun ballon », « 1 ballon », « 2 ballons ».
function boxesLabel(boxes) {
  const object = state.queue.object || "objet";
  const n = boxes?.length || 0;
  return n === 0 ? `aucun ${object}` : `${n} ${object}${n > 1 ? "s" : ""}`;
}

// Ce qui est montré pour une image, partout (écran partagé, liste, point de départ de l'édition) :
// **J écrase M**. J, le jugement, porte sa propre valeur (juste : le texte et les boîtes validés ;
// corrigé : la correction ; écarté : rien) ; sans J (ou « ? »), M, la lecture de la file.
// `fromJ` : la valeur vient de J. Un jugement fait sur une autre version de la file est signalé
// (« jugé en v2 »), et si la lecture de cette file diffère (« v3 lit 4:18 »).
function validated(pair) {
  const j = judgmentOf(pair);
  const corrected = j?.verdict === "wrong" && (boxesMode() ? j.boxes != null : j.correct != null);
  const discarded = j?.verdict === "discard" || (j?.verdict === "wrong" && !corrected);
  const other = j?.queue && j.queue !== state.queue.name ? `jugé en ${versionOf(j.queue)}` : "";
  const notes = (...n) => n.filter(Boolean).join(" · ");
  if (discarded) return { text: "—", boxes: [], note: notes("écartée", other), discarded: true, fromJ: false };
  const fromJ = Boolean(j) && (j.verdict === "ok" || corrected);
  const text = !fromJ ? pair.text : corrected && !boxesMode() ? j.correct : (j.text ?? pair.text);
  const boxes = fromJ && j.boxes ? j.boxes : pair.boxes;
  const differs = fromJ && other && !boxesMode() && text !== pair.text
    ? `${versionOf(state.queue.name)} lit ${pair.text || "vide"}` : "";
  return {
    text: boxesMode() ? boxesLabel(boxes) : text, value: text, boxes, fromJ,
    note: notes(corrected && "corrigé", other, differs),
  };
}

// Version d'une file : « score-text-v2 » → « v2 ».
function versionOf(name) { return name.match(/-(v\d+)$/)?.[1] || name; }

// Valeur affichée : « vide » quand il n'y a rien à lire.
function shownText(v) { return v.text === "" ? "vide" : v.text; }

function pending() { return state.queue.pairs.filter((p) => !judgmentOf(p)); }

// Un jugement (J) porte sa valeur et sa file d'origine. Juste : la lecture et les boîtes de M sont
// copiées dans J.
function judge(pair, verdict, extra = {}) {
  const boxes = verdict === "ok" && pair.boxes ? { boxes: roundBoxes(pair.boxes) } : {};
  state.judgments[pair.id] = {
    id: pair.id, text: pair.text, verdict, ...boxes, ...extra, queue: state.queue.name,
    at: new Date().toISOString(),
  };
  store.set(judgmentsKey(), state.judgments);
  updateProgress();
}

// ↺ : la paire redevient « non jugée ».
function clearJudgment(id) {
  // Gardé comme « reset » daté : à l'envoi, il annule aussi un jugement déjà dans le dépôt.
  state.judgments[id] = { id, verdict: "reset", at: new Date().toISOString() };
  store.set(judgmentsKey(), state.judgments);
  updateProgress();
}

// Réglages : effacer les jugements « juste » (corrections et « ? » gardées), ou tous.
function clearJudgments(onlyOk) {
  if (!state.queue) return toast("Aucune file chargée");
  const queueIds = new Set(state.queue.pairs.map((p) => p.id));
  const ids = Object.values(state.judgments)
    .filter((j) => queueIds.has(j.id) && isJudged(j) && (!onlyOk || j.verdict === "ok")).map((j) => j.id);
  const question = onlyOk
    ? `Effacer les ${ids.length} « justes » de ${state.queue.name} ? Tes corrections et tes « ? » restent.`
    : `Effacer les ${ids.length} jugements de ${state.queue.name} ?`;
  if (!ids.length) return toast("Rien à effacer");
  if (!confirm(question)) return;
  for (const id of ids) clearJudgment(id);
  state.doneClosed = false;
  $("settings").close();
  render();
  toast(`${ids.length} jugements effacés`);
}

function updateProgress() {
  if (!state.queue) return;
  const total = state.queue.pairs.length;
  const done = total - pending().length;
  $("progress").textContent = `${done} / ${total}${state.demo ? " (exemple)" : ""}`;
  const counts = { ok: 0, wrong: 0, unknown: 0, discard: 0 }; // jugements de cette file
  for (const p of state.queue.pairs) if (judgmentOf(p)) counts[judgmentOf(p).verdict]++;
  $("doneText").textContent = `${state.queue.name} terminée : ${counts.ok} justes, `
    + `${counts.wrong} fausses, ${counts.unknown} sans avis, ${counts.discard} écartées.`;
  $("done").hidden = done < total || state.doneClosed;
}

// ---- Écran partagé ----

// Noms des champs du tableau, pour dire d'où vient la paire.
const FIELDS = {
  home: "Score loc.", away: "Score vis.", score_home: "Score loc.", score_away: "Score vis.",
  game_clock: "Temps de jeu", period: "Période", fouls_home: "Fautes loc.", fouls_away: "Fautes vis.",
  timeouts_home: "Temps-morts loc.", timeouts_away: "Temps-morts vis.",
};

// « BCNA Geispolsheim · Temps de jeu · 20:55 » : salle, champ, moment dans la vidéo.
function whereText(pair) {
  const w = pair.where;
  if (!w) return "";
  const s = Math.floor(w.time_s);
  const time = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return [w.hall, w.field && (FIELDS[w.field] || w.field), time].filter(Boolean).join(" · ");
}

// Clip de contexte (±3 s autour de l'image, champ encadré) : joué en boucle à la place de l'image,
// un appui le referme.
async function playContext(pair) {
  if (!pair?.clip) return;
  const clip = $("clip");
  try {
    const blob = state.demo
      ? await (await fetch(`sample/${pair.clip}`)).blob()
      : await github(`contents/queues/${pair.clip}`, { raw: true, blob: true });
    resetZoom();
    if (clip.src) URL.revokeObjectURL(clip.src);
    clip.src = URL.createObjectURL(blob);
    clip.hidden = false;
    $("overlay").hidden = true;
    await clip.play();
  } catch (error) {
    closeContext();
    toast(`Contexte indisponible : ${error.message}`);
  }
}

function closeContext() {
  const clip = $("clip");
  if (clip.hidden) return;
  clip.pause();
  clip.hidden = true;
  $("overlay").hidden = false;
}

function show(pair) {
  closeContext();
  if (pair !== state.current) resetZoom(); // nouvelle paire : image entière
  state.current = pair || null;
  $("answer").textContent = "";
  $("overlay").innerHTML = "";
  lightVerdicts($("verdicts"), pair);
  $("verdicts").hidden = !pair;
  if (!pair) {
    $("image").removeAttribute("src");
    $("reason").textContent = "File vide";
    return;
  }
  // Résultat affiché tout de suite, une fois l'image chargée (les boîtes suivent sa taille).
  const image = $("image");
  image.onload = () => {
    if (state.current !== pair) return;
    fitImage();
    if (state.fix) renderFix();
    else reveal();
  };
  image.src = pair.image;
  if (image.complete && image.naturalWidth) reveal();
  const confidence = pair.confidence != null && `confiance ${Math.round(pair.confidence * 100)} %`;
  $("reason").textContent = [pair.reason, confidence, whereText(pair)]
    .filter(Boolean).join(" · ");
  $("context").hidden = !pair.clip;
}

// Paire `index` de la file dans l'écran partagé.
function showIndex(index) {
  state.index = Math.min(Math.max(0, index), state.queue.pairs.length - 1);
  show(state.queue.pairs[state.index]);
}

// Résultat de la paire : la version validée (corrigée en priorité), avec « corrigé » ou « écartée ».
function reveal() {
  const pair = state.current;
  if (!pair) return;
  const v = validated(pair);
  $("answer").textContent = shownText(v);
  $("answer").classList.toggle("label", boxesMode() || v.text === "");
  $("answerNote").textContent = v.note;
  fitImage();
  drawBoxes(boxesOf({ boxes: v.boxes }), boxesMode() ? "" : v.text, false);
}

// Image de l'écran partagé : la plus grande possible dans la place du haut, sans jamais la
// déformer (une image presque carrée, mise à la largeur, était écrasée en hauteur).
function fitImage() {
  const image = $("image");
  if (!image.naturalWidth || $("split").hidden) return;
  const gaps = 36; // marges et espacements de la partie haute
  const free = $("top").clientHeight - $("reason").offsetHeight - $("picks").offsetHeight - gaps;
  const width = Math.min($("frame").clientWidth, 640);
  const scale = Math.min(width / image.naturalWidth, Math.max(60, free) / image.naturalHeight);
  image.style.width = `${image.naturalWidth * scale}px`;
  image.style.height = `${image.naturalHeight * scale}px`;
  $("stage").style.width = image.style.width;
  $("stage").style.height = image.style.height;
  applyZoom();
}

// ---- Zoom de l'image (écran partagé) ----
// Deux doigts : écarter ou rapprocher zoome (jusqu'à ×16) et déplace l'image ; image zoomée, un
// doigt la déplace aussi (hors édition : en édition, un doigt sert aux boîtes). La pastille loupe
// « ×N » remet l'image entière. Changer de paire, de mode ou lancer le contexte la remet aussi.

const ZOOM_MAX = 16;
const zoom = { s: 1, x: 0, y: 0 };

function applyZoom() {
  const stage = $("stage");
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  zoom.s = Math.min(ZOOM_MAX, Math.max(1, zoom.s));
  zoom.x = Math.min(0, Math.max(w - w * zoom.s, zoom.x));
  zoom.y = Math.min(0, Math.max(h - h * zoom.s, zoom.y));
  const z = $("zoom");
  z.style.transform = `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})`;
  z.style.setProperty("--z", zoom.s);
  const lens = $("lens");
  lens.hidden = zoom.s < 1.05;
  const factor = zoom.s < 10 ? Math.round(zoom.s * 10) / 10 : Math.round(zoom.s);
  lens.textContent = `🔍 ×${String(factor).replace(".", ",")}`;
}

function resetZoom() {
  Object.assign(zoom, { s: 1, x: 0, y: 0 });
  applyZoom();
}

function zoomGestures() {
  const stage = $("stage");
  const pointers = new Map(); // pointerId -> { x, y }
  let gesture = null; // départ du geste : zoom, point de l'image sous les doigts
  const center = () => {
    const list = [...pointers.values()];
    const r = stage.getBoundingClientRect();
    const x = list.reduce((a, p) => a + p.x, 0) / list.length - r.left;
    const y = list.reduce((a, p) => a + p.y, 0) / list.length - r.top;
    const d = list.length > 1 ? Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y) : 0;
    return { x, y, d };
  };
  const begin = () => {
    const c = center();
    // Point de l'image (non zoomée) sous les doigts : il y reste pendant le geste.
    gesture = { s: zoom.s, d: c.d, px: (c.x - zoom.x) / zoom.s, py: (c.y - zoom.y) / zoom.s };
  };
  // Phase de capture : avant les boîtes de l'édition et les glissés de navigation.
  stage.addEventListener("pointerdown", (e) => {
    if (e.target.id === "lens") return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const moving = pointers.size > 1 || (zoom.s > 1 && !state.fix);
    if (!moving) return; // un doigt : boîtes en édition, navigation sinon
    if (pointers.size > 1) state.cancelDrag?.(); // le premier doigt ne déplace plus de boîte
    state.cancelSwipe?.();
    stage.setPointerCapture(e.pointerId);
    e.stopPropagation();
    begin();
  }, true);
  stage.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture) return;
    e.stopPropagation();
    const c = center();
    if (pointers.size > 1 && gesture.d > 0) zoom.s = gesture.s * (c.d / gesture.d);
    zoom.x = c.x - gesture.px * zoom.s;
    zoom.y = c.y - gesture.py * zoom.s;
    applyZoom();
  }, true);
  const end = (e) => {
    if (!pointers.delete(e.pointerId)) return;
    if (gesture) e.stopPropagation();
    if (!pointers.size) {
      gesture = null;
    } else if (gesture) {
      begin(); // un doigt levé : on continue avec ceux qui restent
    }
  };
  stage.addEventListener("pointerup", end, true);
  stage.addEventListener("pointercancel", end, true);
  $("lens").addEventListener("pointerdown", (e) => e.stopPropagation());
  $("lens").onclick = (e) => {
    e.stopPropagation();
    resetZoom();
  };
}

// Échelle de chaque axe, de l'image d'origine à l'écran : ce qui est vu est ce qui est enregistré,
// même si l'image était déformée.
function imageScale() {
  const image = $("image");
  return { sx: image.clientWidth / image.naturalWidth, sy: image.clientHeight / image.naturalHeight };
}

// Boîte de chaque caractère, [x0, y0, x1, y1] en pixels de l'image (coins haut-gauche et
// bas-droite) : celles du modèle ; anciennes files avec des positions seules : un trait.
function boxesOf(pair) {
  const image = $("image");
  const w = image.naturalWidth || Infinity;
  const h = image.naturalHeight || Infinity;
  const boxes = pair.boxes || (pair.positions || []).map((x) => [x - 1, 0, x + 1, h]);
  return boxes.map(([x0, y0, x1, y1]) => [
    Math.min(w, Math.max(0, x0)), Math.min(h, Math.max(0, y0)),
    Math.min(w, Math.max(0, x1)), Math.min(h, Math.max(0, y1)),
  ]);
}

function roundBoxes(boxes) {
  return boxes.map((b) => b.map((v) => Math.round(v * 10) / 10));
}

function drawBoxes(boxes, text, editable, marks = {}) {
  const image = $("image");
  const overlay = $("overlay");
  const { sx, sy } = imageScale();
  overlay.style.width = `${image.clientWidth}px`;
  overlay.style.height = `${image.clientHeight}px`;
  overlay.classList.toggle("editable", editable);
  overlay.innerHTML = editable || boxesMode() ? "" : '<div class="middle"></div>';
  boxes.forEach(([x0, y0, x1, y1], i) => {
    const box = document.createElement("div");
    box.className = "box" + (i === marks.selected ? " selected" : "") + (i === marks.current ? " current" : "");
    box.style.left = `${x0 * sx}px`;
    box.style.top = `${y0 * sy}px`;
    box.style.width = `${(x1 - x0) * sx}px`;
    box.style.height = `${(y1 - y0) * sy}px`;
    const c = text[i] ?? "";
    box.innerHTML = `<span class="${c === "?" ? "unknown" : ""}"></span>`
      + (editable ? '<i class="corner tl"></i><i class="corner br"></i>' : "");
    box.firstChild.textContent = c;
    overlay.appendChild(box);
  });
}

// Colonne de boutons de jugement ; `onPick(verdict)` reçoit ok, wrong, unknown ou reset.
function fillVerdicts(column, onPick) {
  column.innerHTML = "";
  for (const [verdict, symbol, label] of VERDICTS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `verdict ${verdict}`;
    b.dataset.verdict = verdict;
    b.textContent = symbol;
    b.setAttribute("aria-label", label);
    b.onclick = (e) => { e.stopPropagation(); onPick(verdict); };
    column.appendChild(b);
  }
}

// Un seul bouton allumé : celui du jugement actuel de la paire.
function lightVerdicts(column, pair) {
  const verdict = pair && judgmentOf(pair)?.verdict;
  for (const b of column.children) b.classList.toggle("on", b.dataset.verdict === verdict);
}

// ✓, ?, ⊘ et ↺ (les deux modes). ✓ dit « ce qui est montré est juste » : montré depuis M, la
// lecture devient J ; montré depuis J (juste ou corrigé), J reste tel quel.
function pick(pair, verdict) {
  if (verdict === "reset") clearJudgment(pair.id);
  else if (verdict !== "ok" || !validated(pair).fromJ) judge(pair, verdict);
}

// Écran partagé : ✓, ?, ⊘ jugent la paire et ↺ l'efface, sans changer de paire ; ✗ ouvre l'édition.
function pickSplit(verdict) {
  const pair = state.current;
  if (!pair || state.fix) return;
  if (verdict === "wrong") return openFix(pair);
  pick(pair, verdict);
  show(pair);
}

// Glissés de l'écran partagé, hors édition : haut = suivante (comme un fil qu'on fait défiler),
// bas = précédente, gauche = liste.
function splitGestures() {
  const split = $("split");
  let start = null;
  split.addEventListener("pointerdown", (e) => {
    if (state.fix || !state.current || !$("clip").hidden) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  // Un geste de zoom commence : ce n'était pas un glissé de navigation.
  state.cancelSwipe = () => { start = null; };
  split.addEventListener("pointerup", (e) => {
    if (!start || start.id !== e.pointerId || state.fix) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    if (-dy > SWIPE && -dy > Math.abs(dx)) {
      if (state.index >= state.queue.pairs.length - 1) toast("Dernière paire");
      else showIndex(state.index + 1);
    } else if (dy > SWIPE && dy > Math.abs(dx)) {
      if (state.index === 0) toast("Première paire");
      else showIndex(state.index - 1);
    } else if (-dx > SWIPE && -dx > Math.abs(dy)) {
      setMode("list");
    }
  });
  split.addEventListener("pointercancel", () => { start = null; });
}

// ---- Liste ----

function renderList() {
  const list = $("list");
  list.innerHTML = "";
  for (const pair of state.queue.pairs) {
    const row = document.createElement("div");
    row.pair = pair;
    row.innerHTML = '<div class="shot"><img alt="" draggable="false"></div>'
      + '<div class="text"><span class="value"></span><span class="note"></span></div>'
      + '<div class="verdicts"></div>';
    fillVerdicts(row.querySelector(".verdicts"), (verdict) => pickRow(row, verdict));
    rowGestures(row);
    const img = row.querySelector("img");
    img.onload = () => fillRow(row);
    img.src = pair.image;
    fillRow(row);
    list.appendChild(row);
  }
}

// Ce que montre une ligne : avant jugement, la lecture du modèle ; jugée, ce qui a été validé
// (juste : la lecture ; corrigée : la correction, « corrigé » ; sans valeur : rien), et le bouton
// du jugement allumé.
function fillRow(row) {
  const pair = row.pair;
  const j = judgmentOf(pair);
  const v = validated(pair);
  const boxes = v.boxes;
  row.className = `row ${j?.verdict || ""}${boxesMode() || v.text === "" ? " boxes" : ""}`;
  row.querySelector(".value").textContent = shownText(v);
  row.querySelector(".note").textContent = v.note;
  lightVerdicts(row.querySelector(".verdicts"), pair);
  const shot = row.querySelector(".shot");
  shot.querySelectorAll(".box").forEach((b) => b.remove());
  rowBoxes(shot, row.querySelector("img"), boxes);
}

// Boîtes des caractères sur l'image d'une ligne (en pourcentage : elles suivent la taille de l'image).
function rowBoxes(shot, img, boxes) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h || !boxes) return;
  for (const [x0, y0, x1, y1] of boxes) {
    const box = document.createElement("div");
    box.className = "box";
    box.style.left = `${(Math.max(0, x0) / w) * 100}%`;
    box.style.top = `${(Math.max(0, y0) / h) * 100}%`;
    box.style.width = `${((Math.min(w, x1) - Math.max(0, x0)) / w) * 100}%`;
    box.style.height = `${((Math.min(h, y1) - Math.max(0, y0)) / h) * 100}%`;
    shot.appendChild(box);
  }
}

// Liste : ✓, ?, ⊘ jugent la ligne et ↺ l'efface ; ✗ ouvre l'écran partagé sur cette paire, en
// édition (version corrigée en priorité).
function pickRow(row, verdict) {
  if (verdict === "wrong") {
    openPair(row.pair);
    openFix(row.pair);
    return;
  }
  pick(row.pair, verdict);
  fillRow(row);
}

// Carte glissée à droite : l'écran partagé sur cette paire.
function rowGestures(row) {
  let start = null;
  row.addEventListener("pointerdown", (e) => { start = { x: e.clientX, y: e.clientY }; });
  row.addEventListener("pointerup", (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    if (dx > SWIPE && dx > 1.5 * Math.abs(dy)) openPair(row.pair);
  });
  row.addEventListener("pointercancel", () => { start = null; });
}

function openPair(pair) {
  state.index = state.queue.pairs.indexOf(pair);
  setMode("split");
}

// ---- Correction (après « faux ») ----
// Une boîte par caractère (coins haut-gauche et bas-droite) : glisser un coin la redimensionne,
// glisser l'intérieur la déplace, un appui dans le vide en ajoute une (taille des autres), un
// double appui l'efface, comme le glisser sur la poubelle qui apparaît quand une boîte est
// sélectionnée. La valeur se corrige au pavé, au curseur ; elle n'est acceptée que si elle a
// autant de caractères qu'il y a de boîtes.

const GRAB = 20; // px d'écran autour d'un coin pour le saisir
const DOUBLE_TAP = 350; // ms
const TAP_SLOP = 8; // px : en dessous, un appui qui bouge un peu reste un appui

// L'édition part de la version corrigée si elle existe, sinon de la lecture du modèle.
function openFix(pair) {
  closeContext();
  $("context").hidden = !pair.clip;
  const v = validated(pair);
  const start = v.fromJ && !v.discarded ? v : { value: pair.text, boxes: pair.boxes };
  const text = boxesMode() ? "" : start.value;
  state.fix = {
    pair, value: text, cursor: text.length, boxes: boxesOf({ boxes: start.boxes }), selected: null,
    lastTap: null,
  };
  // Mode boîtes : ni valeur ni pavé.
  $("value").hidden = boxesMode();
  $("keypad").hidden = boxesMode();
  $("panel").hidden = true;
  $("fix").hidden = false;
  fitImage(); // une seule fois : l'image ne change pas de taille pendant un glissé
  renderFix();
}

function closeFix() {
  if (!state.fix) return;
  closeContext();
  state.fix = null;
  $("fix").hidden = true;
  $("trash").hidden = true;
  $("panel").hidden = false;
  $("overlay").classList.remove("editable");
}

// Retour ou Valider : retour aux boutons, sur la même paire.
function finishFix() {
  const pair = state.fix.pair;
  closeFix();
  show(pair);
}

function fixChanges() {
  const { pair, value, boxes } = state.fix;
  const before = boxesOf(pair);
  const wrong = [];
  if (!boxesMode() && value !== pair.text) wrong.push("value");
  const moved = (b, i) => b.some((v, k) => Math.abs(v - before[i][k]) > 0.5);
  if (boxes.length !== before.length || boxes.some(moved)) wrong.push("boxes");
  return wrong;
}

function renderFix() {
  const { value, boxes, cursor, selected } = state.fix;
  // Boîte du caractère juste avant le curseur : en évidence.
  drawBoxes(boxes, value, true, { selected, current: boxesMode() ? null : cursor - 1 });
  $("trash").hidden = selected === null;
  if (boxesMode()) {
    const changed = fixChanges().length > 0;
    $("fixOk").disabled = !changed;
    $("fixHint").textContent = changed
      ? `Corrigé : ${boxesLabel(boxes)}`
      : `Corrige, ajoute (appui dans le vide) ou efface les boîtes ; aucune : pas de ${state.queue.object || "objet"}. Identique à la proposition : ✓`;
    return;
  }
  const field = $("value");
  field.innerHTML = "";
  const caret = () => {
    const bar = document.createElement("span");
    bar.className = "caret";
    field.appendChild(bar);
  };
  [...value].forEach((c, i) => {
    if (i === cursor) caret();
    const span = document.createElement("span");
    span.textContent = c;
    span.dataset.index = i;
    if (c === "?") span.className = "unknown";
    field.appendChild(span);
  });
  if (cursor === value.length) caret();
  if (!value) field.insertAdjacentHTML("beforeend", '<span class="empty">vide</span>');
  const wrong = fixChanges();
  const counts = value.length === boxes.length;
  $("fixOk").disabled = !counts || wrong.length === 0;
  $("fixHint").textContent = !counts
    ? `${value.length} caractère(s) pour ${boxes.length} boîte(s)`
    : wrong.length === 0
      ? "Identique à la lecture du modèle : c'est ✓. Rien à lire : « vide » et aucune boîte"
      : `Corrigé : ${wrong.map((w) => (w === "value" ? "valeur" : "boîtes")).join(" et ")}`;
}

function key(k) {
  const fix = state.fix;
  if (k === "⌫") {
    if (fix.cursor > 0) {
      fix.value = fix.value.slice(0, fix.cursor - 1) + fix.value.slice(fix.cursor);
      fix.cursor--;
    }
  } else if (k === "vide") {
    fix.value = "";
    fix.cursor = 0;
  } else if (fix.value.length < 8) {
    fix.value = fix.value.slice(0, fix.cursor) + k + fix.value.slice(fix.cursor);
    fix.cursor++;
  }
  renderFix();
}

// Toucher un caractère place le curseur juste après lui ; à gauche du premier : au début.
function valueGestures() {
  $("value").addEventListener("click", (e) => {
    const fix = state.fix;
    if (!fix) return;
    const span = e.target.closest("span[data-index]");
    if (span) {
      const rect = span.getBoundingClientRect();
      const index = Number(span.dataset.index);
      fix.cursor = e.clientX < rect.left + rect.width / 2 ? index : index + 1;
    } else {
      const first = $("value").querySelector("span[data-index]");
      fix.cursor = first && e.clientX < first.getBoundingClientRect().left ? 0 : fix.value.length;
    }
    renderFix();
  });
}

function deleteBox(index) {
  const fix = state.fix;
  fix.boxes.splice(index, 1);
  fix.selected = null;
  fix.lastTap = null;
  renderFix();
}

function overTrash(e) {
  const trash = $("trash");
  if (trash.hidden) return false;
  const r = trash.getBoundingClientRect();
  return e.clientX >= r.left - 10 && e.clientX <= r.right + 10 && e.clientY >= r.top - 10 && e.clientY <= r.bottom + 10;
}

// Boîtes rangées de gauche à droite (ordre des caractères) ; renvoie la nouvelle place de `box`.
function sortBoxes(boxes, box) {
  boxes.sort((a, b) => a[0] + a[2] - (b[0] + b[2]));
  return boxes.indexOf(box);
}

// Nouvelle boîte autour du point touché : taille et hauteur médianes des autres boîtes, sinon
// un caractère étroit sur 80 % de la hauteur.
function newBox(x, y) {
  const image = $("image");
  const h = image.naturalHeight;
  const others = state.fix.boxes;
  const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  if (boxesMode()) {
    // Carré centré sur l'appui : taille médiane des autres boîtes, sinon celle de la file.
    const size = others.length ? median(others.map((b) => b[2] - b[0])) : state.queue.box_size || h * 0.1;
    const x0 = Math.min(image.naturalWidth - size, Math.max(0, x - size / 2));
    const y0 = Math.min(h - size, Math.max(0, y - size / 2));
    return [x0, y0, x0 + size, y0 + size];
  }
  const width = others.length ? median(others.map((b) => b[2] - b[0])) : h * 0.5;
  const top = others.length ? median(others.map((b) => b[1])) : h * 0.1;
  const bottom = others.length ? median(others.map((b) => b[3])) : h * 0.9;
  const x0 = Math.min(image.naturalWidth - width, Math.max(0, x - width / 2));
  return [x0, top, x0 + width, bottom];
}

function overlayGestures() {
  const overlay = $("overlay");
  let drag = null;
  const imagePoint = (e) => {
    const image = $("image");
    const rect = image.getBoundingClientRect(); // à l'écran, zoom compris
    const sx = rect.width / image.naturalWidth;
    const sy = rect.height / image.naturalHeight;
    return {
      x: Math.min(image.naturalWidth, Math.max(0, (e.clientX - rect.left) / sx)),
      y: Math.min(image.naturalHeight, Math.max(0, (e.clientY - rect.top) / sy)),
      sx,
      sy,
    };
  };
  // Deux doigts posés : le geste devient un zoom, la boîte reprend sa place d'avant.
  state.cancelDrag = () => {
    if (!drag || !state.fix) return;
    if (drag.added) state.fix.boxes.splice(state.fix.boxes.indexOf(drag.box), 1);
    else drag.box.splice(0, 4, ...drag.start);
    drag = null;
    renderFix();
  };
  overlay.addEventListener("pointerdown", (e) => {
    const fix = state.fix;
    if (!fix) return;
    e.stopPropagation(); // pas jusqu'au haut de l'écran, qui désélectionnerait la boîte
    const { x, y, sx, sy } = imagePoint(e);
    const boxes = fix.boxes;
    // Le coin le plus proche (haut-gauche ou bas-droite), sinon la boîte touchée.
    let grab = null;
    let best = GRAB;
    boxes.forEach((b, i) => {
      for (const [corner, cx, cy] of [["tl", b[0], b[1]], ["br", b[2], b[3]]]) {
        const d = Math.hypot((cx - x) * sx, (cy - y) * sy);
        if (d <= best) {
          best = d;
          grab = { index: i, corner };
        }
      }
    });
    if (!grab) {
      const inside = boxes.findIndex((b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]);
      if (inside >= 0) grab = { index: inside, corner: "move" };
    }
    const now = Date.now();
    const last = fix.lastTap;
    // Second appui sur la même boîte : effacée au relâcher, si elle n'a pas glissé entre-temps.
    const second = grab && last && last.index === grab.index && now - last.at < DOUBLE_TAP;
    let added = false;
    if (!grab) {
      const box = newBox(x, y); // appui dans le vide : ajoutée
      boxes.push(box);
      grab = { index: sortBoxes(boxes, box), corner: "move" };
      added = true;
    }
    fix.selected = grab.index;
    drag = {
      ...grab, box: boxes[grab.index], start: [...boxes[grab.index]], x, y,
      startX: e.clientX, startY: e.clientY, moved: false, added, second,
    };
    overlay.setPointerCapture(e.pointerId);
    renderFix();
  });
  overlay.addEventListener("pointermove", (e) => {
    const fix = state.fix;
    if (!drag || !fix) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < TAP_SLOP) return;
    drag.moved = true;
    const image = $("image");
    const { x, y } = imagePoint(e);
    const [x0, y0, x1, y1] = drag.start;
    const box = drag.box;
    if (drag.corner === "tl") {
      box.splice(0, 4, Math.min(x, x1 - 1), Math.min(y, y1 - 1), x1, y1);
    } else if (drag.corner === "br") {
      box.splice(0, 4, x0, y0, Math.max(x, x0 + 1), Math.max(y, y0 + 1));
    } else {
      const dx = Math.min(image.naturalWidth - x1, Math.max(-x0, x - drag.x));
      const dy = Math.min(image.naturalHeight - y1, Math.max(-y0, y - drag.y));
      box.splice(0, 4, x0 + dx, y0 + dy, x1 + dx, y1 + dy);
    }
    fix.selected = sortBoxes(fix.boxes, box);
    renderFix();
    $("trash").classList.toggle("hot", overTrash(e));
  });
  const release = (e) => {
    const fix = state.fix;
    if (!drag || !fix) return;
    $("trash").classList.remove("hot");
    const index = fix.boxes.indexOf(drag.box);
    if (drag.moved && e.type === "pointerup" && overTrash(e)) {
      deleteBox(index); // glissée sur la poubelle : effacée
    } else if (!drag.moved && drag.second && e.type === "pointerup") {
      deleteBox(index); // double appui : effacée
    } else {
      // Un appui (sans glissé) sur une boîte existante peut être le premier d'un double appui.
      fix.lastTap = drag.moved || drag.added ? null : { index, at: Date.now() };
    }
    drag = null;
  };
  overlay.addEventListener("pointerup", release);
  overlay.addEventListener("pointercancel", release);
  // Toucher ailleurs dans le haut de l'écran : plus de boîte sélectionnée.
  $("top").addEventListener("pointerdown", (e) => {
    if (!state.fix || e.target.id === "trash") return;
    state.fix.selected = null;
    renderFix();
  });
  // Poubelle touchée : efface la boîte sélectionnée.
  $("trash").addEventListener("click", () => {
    if (state.fix && state.fix.selected !== null) deleteBox(state.fix.selected);
  });
}

function fixWiring() {
  overlayGestures();
  valueGestures();
  // Pavé de calculatrice (7 8 9 en haut), séparateurs à droite.
  for (const k of ["7", "8", "9", "-", "4", "5", "6", ":", "1", "2", "3", ".", "?", "0", "⌫", "vide"]) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = k;
    if (k === "?") b.className = "unknown";
    b.onclick = () => key(k);
    $("keypad").appendChild(b);
  }
  $("fixOk").onclick = () => {
    const { pair, value, boxes } = state.fix;
    const wrong = fixChanges();
    const correct = boxesMode() ? {} : { correct: value };
    judge(pair, "wrong", { ...correct, boxes: roundBoxes(boxes), wrong });
    finishFix();
  };
  $("fixCancel").onclick = finishFix;
}

// ---- Ensemble ----

function render() {
  if (!state.queue) {
    $("split").hidden = true;
    $("list").hidden = true;
    $("settings").showModal();
    return;
  }
  $("title").textContent = state.queue.name;
  document.body.classList.toggle("boxes", boxesMode());
  $("split").hidden = state.mode !== "split";
  $("list").hidden = state.mode !== "list";
  $("mode").textContent = state.mode === "split" ? "≡" : "▣";
  if (state.mode === "split") {
    showIndex(state.index);
  } else {
    renderList();
    // La liste s'ouvre sur la paire de l'écran partagé.
    $("list").children[state.index]?.scrollIntoView({ block: "center" });
  }
  updateProgress();
}

function setMode(mode) {
  closeFix();
  resetZoom();
  state.mode = mode;
  store.set("approval:mode", mode);
  if (state.queue) render();
}

function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 3000);
}

async function refreshQueues() {
  $("repo").value = state.settings.repo;
  $("token").value = state.settings.token;
  if (!state.settings.token) {
    $("status").textContent = "Saisis le jeton, ou essaie l'exemple.";
    return;
  }
  try {
    const names = await listQueues();
    $("queue").innerHTML = names.map((n) => `<option>${n}</option>`).join("");
    $("status").textContent = names.length ? `${names.length} file(s)` : "Aucune file pour l'instant.";
  } catch (error) {
    $("status").textContent = error.message;
  }
}

function saveSettings() {
  state.settings = { repo: $("repo").value.trim(), token: $("token").value.trim() };
  store.set("approval:settings", state.settings);
}

function wire() {
  fillVerdicts($("verdicts"), pickSplit);
  splitGestures();
  zoomGestures();
  fixWiring();
  $("menu").onclick = () => { refreshQueues(); $("settings").showModal(); };
  $("mode").onclick = () => setMode(state.mode === "split" ? "list" : "split");
  $("send").onclick = send;
  $("sendNow").onclick = () => {
    if (!state.queue) return toast("Aucune file chargée");
    $("settings").close();
    send();
  };
  $("doneClose").onclick = () => { state.doneClosed = true; updateProgress(); };
  // La progression rouvre le panneau de fin (pour envoyer).
  $("progress").onclick = () => { state.doneClosed = false; updateProgress(); };
  $("clearOk").onclick = () => clearJudgments(true);
  $("clearAll").onclick = () => clearJudgments(false);
  $("context").onclick = () => playContext(state.fix?.pair || state.current);
  $("clip").onclick = closeContext;
  // Appui long sur l'image ou les boîtes : pas de menu du navigateur (copier, télécharger…).
  for (const id of ["frame", "list"]) $(id).addEventListener("contextmenu", (e) => e.preventDefault());
  $("repo").onchange = () => { saveSettings(); refreshQueues(); };
  $("token").onchange = () => { saveSettings(); refreshQueues(); };
  $("load").onclick = async () => {
    saveSettings();
    const name = $("queue").value;
    if (!name) return;
    try {
      const queue = JSON.parse(await github(`contents/queues/${name}.json`, { raw: true }));
      queue.name = name;
      $("settings").close();
      useQueue(queue, false);
      pullJudgments();
    } catch (error) {
      $("status").textContent = error.message;
    }
  };
  for (const [id, file] of [["demo", "queue.json"], ["demoBall", "ball-queue.json"]]) {
    $(id).onclick = async () => {
      const queue = await (await fetch(`sample/${file}`)).json();
      $("settings").close();
      useQueue(queue, true);
    };
  }
}

// Écran tourné ou redimensionné : image et boîtes recalculées.
window.addEventListener("resize", () => {
  if (state.fix) {
    fitImage();
    renderFix();
  } else if (state.current && !$("split").hidden) {
    reveal();
  }
});

wire();
render();
refreshQueues();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
