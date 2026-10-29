// Approval : valider d'un geste les paires « image + résultat » proposées par un modèle.
// Gestes, les mêmes dans les deux modes : haut = juste, gauche = faux, droite = je ne sais pas.
"use strict";

const $ = (id) => document.getElementById(id);
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
  judgments: {}, // id -> { id, text, verdict, at }
  history: [], // ids, pour annuler
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

async function send() {
  const list = Object.values(state.judgments);
  if (!list.length) return toast("Aucun jugement à envoyer");
  if (state.demo) return toast(`Exemple : ${list.length} jugements, rien n'est envoyé`);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `judgments/${state.queue.name}/${state.device}-${stamp}.json`;
  try {
    await github(`contents/${path}`, {
      method: "PUT",
      body: JSON.stringify({
        message: `Jugements de ${state.queue.name} (${list.length} paires)`,
        content: base64(JSON.stringify(list, null, 1) + "\n"),
      }),
    });
    toast(`${list.length} jugements envoyés`);
  } catch (error) {
    toast(`Envoi impossible : ${error.message}`);
  }
}

// ---- File et jugements ----

function judgmentsKey() { return `approval:${state.queue.name}:judgments`; }

function useQueue(queue, demo) {
  state.queue = queue;
  state.demo = demo;
  state.judgments = store.get(judgmentsKey(), {});
  state.history = [];
  render();
}

function pending() { return state.queue.pairs.filter((p) => !state.judgments[p.id]); }

function judge(pair, verdict, extra = {}) {
  // Juste : les boîtes proposées sont validées avec le texte.
  const boxes = verdict === "ok" && pair.boxes ? { boxes: roundBoxes(pair.boxes) } : {};
  state.judgments[pair.id] = {
    id: pair.id, text: pair.text, verdict, ...boxes, ...extra, at: new Date().toISOString(),
  };
  state.history.push(pair.id);
  store.set(judgmentsKey(), state.judgments);
  updateProgress();
}

function undo() {
  const id = state.history.pop();
  if (!id) return;
  delete state.judgments[id];
  store.set(judgmentsKey(), state.judgments);
  closeFix();
  if (state.mode === "split") show(state.queue.pairs.find((p) => p.id === id));
  else renderList();
  updateProgress();
}

function updateProgress() {
  if (!state.queue) return;
  const total = state.queue.pairs.length;
  const done = total - pending().length;
  $("progress").textContent = `${done} / ${total}${state.demo ? " (exemple)" : ""}`;
  const counts = { ok: 0, wrong: 0, unknown: 0 };
  for (const j of Object.values(state.judgments)) counts[j.verdict]++;
  $("doneText").textContent =
    `${state.queue.name} terminée : ${counts.ok} justes, ${counts.wrong} fausses, ${counts.unknown} sans avis.`;
  $("done").hidden = done < total;
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
  return `${w.hall} · ${FIELDS[w.field] || w.field} · ${time}`;
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
  state.current = pair || null;
  $("panel").className = "";
  $("answer").textContent = "";
  $("overlay").innerHTML = "";
  if (!pair) {
    $("image").removeAttribute("src");
    $("reason").textContent = "Plus rien à valider";
    return;
  }
  $("image").src = pair.image;
  $("reason").textContent = [pair.reason, `confiance ${Math.round(pair.confidence * 100)} %`, whereText(pair)]
    .filter(Boolean).join(" · ");
  $("context").hidden = !pair.clip;
}

function next() { show(pending()[0]); }

function reveal() {
  const pair = state.current;
  if (!pair) return;
  $("answer").textContent = pair.text;
  const image = $("image");
  const overlay = $("overlay");
  const scale = image.clientWidth / image.naturalWidth;
  overlay.style.width = `${image.clientWidth}px`;
  overlay.style.height = `${image.clientHeight}px`;
  drawBoxes(boxesOf(pair), pair.text, false);
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
  const scale = image.clientWidth / image.naturalWidth;
  overlay.style.width = `${image.clientWidth}px`;
  overlay.style.height = `${image.clientHeight}px`;
  overlay.classList.toggle("editable", editable);
  overlay.innerHTML = editable ? "" : '<div class="middle"></div>';
  boxes.forEach(([x0, y0, x1, y1], i) => {
    const box = document.createElement("div");
    box.className = "box" + (i === marks.selected ? " selected" : "") + (i === marks.current ? " current" : "");
    box.style.left = `${x0 * scale}px`;
    box.style.top = `${y0 * scale}px`;
    box.style.width = `${(x1 - x0) * scale}px`;
    box.style.height = `${(y1 - y0) * scale}px`;
    const c = text[i] ?? "";
    box.innerHTML = `<span class="${c === "?" ? "unknown" : ""}"></span>`
      + (editable ? '<i class="corner tl"></i><i class="corner br"></i>' : "");
    box.firstChild.textContent = c;
    overlay.appendChild(box);
  });
}

function direction(dx, dy) {
  if (-dy > SWIPE && -dy > Math.abs(dx)) return "ok";
  if (dx < -SWIPE && -dx > Math.abs(dy)) return "wrong";
  if (dx > SWIPE && dx > Math.abs(dy)) return "unknown";
  return null;
}

function panelGestures() {
  const panel = $("panel");
  let start = null;
  panel.addEventListener("pointerdown", (e) => {
    if (!state.current) return;
    start = { x: e.clientX, y: e.clientY };
    panel.setPointerCapture(e.pointerId);
    panel.classList.add("pressed");
    reveal();
  });
  panel.addEventListener("pointermove", (e) => {
    if (!start) return;
    const verdict = direction(e.clientX - start.x, e.clientY - start.y);
    panel.className = "pressed" + (verdict ? ` ${verdict}` : "");
  });
  const release = (e) => {
    if (!start) return;
    const verdict = e.type === "pointerup" ? direction(e.clientX - start.x, e.clientY - start.y) : null;
    start = null;
    if (verdict === "wrong") {
      openFix(state.current);
    } else if (verdict) {
      judge(state.current, verdict);
      next();
    } else {
      show(state.current); // relâché sans geste : on recache le résultat
    }
  };
  panel.addEventListener("pointerup", release);
  panel.addEventListener("pointercancel", release);
}

// ---- Liste ----

function renderList() {
  const list = $("list");
  list.innerHTML = "";
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      // Sortie par le haut sans geste : juste.
      const pair = entry.target.pair;
      const above = entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? 0);
      if (!entry.isIntersecting && above && !state.judgments[pair.id]) {
        judge(pair, "ok");
        fillRow(entry.target);
      }
    }
  }, { root: list });
  for (const pair of state.queue.pairs) {
    const row = document.createElement("div");
    row.pair = pair;
    row.innerHTML = `<div class="shot"><img alt="" draggable="false"></div><span class="text"></span>`
      + '<span class="mark"></span>';
    const img = row.querySelector("img");
    img.onload = () => fillRow(row);
    img.src = pair.image;
    fillRow(row);
    rowGestures(row);
    list.appendChild(row);
    observer.observe(row);
  }
}

// Ce que montre une ligne : avant jugement, la lecture du modèle ; jugée, ce qui a été validé
// (juste : la lecture ; corrigée : la correction ; sans valeur : rien) et une marque en bas à droite :
// ✓ vert (juste, ou « corrigé »), ✗ rouge (sans valeur), ? gris (je ne sais pas).
function fillRow(row) {
  const pair = row.pair;
  const j = state.judgments[pair.id];
  let text = pair.text;
  let boxes = pair.boxes;
  let mark = "";
  let note = "";
  if (j?.verdict === "ok") {
    mark = "✓";
  } else if (j?.verdict === "wrong" && j.correct != null) {
    [text, boxes, mark, note] = [j.correct, j.boxes, "✓", "corrigé"];
  } else if (j?.verdict === "wrong") {
    [text, boxes, mark, note] = ["—", [], "✗", "sans valeur"];
  } else if (j?.verdict === "unknown") {
    mark = "?";
  }
  row.className = `row ${j?.verdict || ""}`;
  row.querySelector(".text").textContent = text;
  const markEl = row.querySelector(".mark");
  markEl.textContent = mark;
  markEl.dataset.note = note;
  markEl.className = `mark ${j?.verdict || ""}`;
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

function rowGestures(row) {
  let start = null;
  row.addEventListener("pointerdown", (e) => {
    start = { x: e.clientX, y: e.clientY };
    row.setPointerCapture(e.pointerId);
  });
  row.addEventListener("pointermove", (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    if (Math.abs(dx) > Math.abs(e.clientY - start.y)) row.style.transform = `translateX(${dx}px)`;
  });
  const release = (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    row.style.transform = "";
    const verdict = e.type === "pointerup" ? direction(dx, dy) : null;
    if (verdict === "unknown") {
      judge(row.pair, verdict);
      fillRow(row);
    } else if (verdict === "wrong") {
      // Faux, même sur une ligne déjà jugée : la correction repart de la lecture d'origine.
      state.listScroll = $("list").scrollTop;
      $("list").hidden = true;
      $("split").hidden = false;
      show(row.pair);
      openFix(row.pair);
    }
  };
  row.addEventListener("pointerup", release);
  row.addEventListener("pointercancel", release);
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

function openFix(pair) {
  closeContext();
  $("context").hidden = !pair.clip;
  state.fix = {
    pair, value: pair.text, cursor: pair.text.length, boxes: boxesOf(pair),
    selected: null, lastTap: null,
  };
  $("panel").hidden = true;
  $("fix").hidden = false;
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

function finishFix() {
  const pair = state.fix.pair;
  closeFix();
  if (state.listScroll !== undefined && state.mode === "list") {
    $("split").hidden = true;
    $("list").hidden = false;
    renderList();
    $("list").scrollTop = state.listScroll;
    state.listScroll = undefined;
  } else {
    next();
  }
  return pair;
}

function fixChanges() {
  const { pair, value, boxes } = state.fix;
  const before = boxesOf(pair);
  const wrong = [];
  if (value !== pair.text) wrong.push("value");
  const moved = (b, i) => b.some((v, k) => Math.abs(v - before[i][k]) > 0.5);
  if (boxes.length !== before.length || boxes.some(moved)) wrong.push("boxes");
  return wrong;
}

function renderFix() {
  const { value, boxes, cursor, selected } = state.fix;
  // Boîte du caractère juste avant le curseur : en évidence.
  drawBoxes(boxes, value, true, { selected, current: cursor - 1 });
  $("trash").hidden = selected === null;
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
      ? "Corrige la valeur ou les boîtes, ou choisis « Sans valeur »"
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
    const rect = image.getBoundingClientRect();
    const scale = image.clientWidth / image.naturalWidth;
    return {
      x: Math.min(image.naturalWidth, Math.max(0, (e.clientX - rect.left) / scale)),
      y: Math.min(image.naturalHeight, Math.max(0, (e.clientY - rect.top) / scale)),
      scale,
    };
  };
  overlay.addEventListener("pointerdown", (e) => {
    const fix = state.fix;
    if (!fix) return;
    e.stopPropagation(); // pas jusqu'au haut de l'écran, qui désélectionnerait la boîte
    const { x, y, scale } = imagePoint(e);
    const boxes = fix.boxes;
    // Le coin le plus proche (haut-gauche ou bas-droite), sinon la boîte touchée.
    let grab = null;
    let best = GRAB;
    boxes.forEach((b, i) => {
      for (const [corner, cx, cy] of [["tl", b[0], b[1]], ["br", b[2], b[3]]]) {
        const d = Math.hypot(cx - x, cy - y) * scale;
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
  // Pavé de téléphone, séparateurs à droite.
  for (const k of ["1", "2", "3", "-", "4", "5", "6", ":", "7", "8", "9", ".", "?", "0", "⌫", "vide"]) {
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
    judge(pair, "wrong", { correct: value, boxes: roundBoxes(boxes), wrong });
    finishFix();
  };
  $("fixNone").onclick = () => {
    judge(state.fix.pair, "wrong", { correct: null, boxes: null, wrong: [] });
    finishFix();
  };
  $("fixCancel").onclick = () => {
    const pair = state.fix.pair;
    closeFix();
    if (state.listScroll !== undefined) {
      state.listScroll = undefined;
      render();
    } else {
      show(pair);
    }
  };
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
  $("split").hidden = state.mode !== "split";
  $("list").hidden = state.mode !== "list";
  $("mode").textContent = state.mode === "split" ? "≡" : "▣";
  if (state.mode === "split") next();
  else renderList();
  updateProgress();
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
  panelGestures();
  fixWiring();
  $("menu").onclick = () => { refreshQueues(); $("settings").showModal(); };
  $("mode").onclick = () => {
    state.mode = state.mode === "split" ? "list" : "split";
    store.set("approval:mode", state.mode);
    if (state.queue) render();
  };
  $("undo").onclick = undo;
  $("send").onclick = send;
  $("random").onclick = () => {
    const left = pending();
    show(left[Math.floor(Math.random() * left.length)]);
  };
  $("doubtful").onclick = () => {
    const left = pending().filter((p) => p.reason !== "sûr" && p.reason !== "échauffement");
    left.sort((a, b) => a.confidence - b.confidence);
    show(left[0] || pending()[0]);
  };
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
    } catch (error) {
      $("status").textContent = error.message;
    }
  };
  $("demo").onclick = async () => {
    const queue = await (await fetch("sample/queue.json")).json();
    $("settings").close();
    useQueue(queue, true);
  };
}

wire();
render();
refreshQueues();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
