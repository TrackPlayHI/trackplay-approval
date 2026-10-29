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
  state.judgments[pair.id] = {
    id: pair.id, text: pair.text, verdict, ...extra, at: new Date().toISOString(),
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

function show(pair) {
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
  $("reason").textContent = `${pair.reason || ""} · confiance ${Math.round(pair.confidence * 100)} %`;
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
  drawPoints(positionsOf(pair), pair.text, false);
}

// Position (pixels de l'image) de chaque caractère : celles du modèle, ou le milieu des rectangles
// des anciennes files.
function positionsOf(pair) {
  const width = $("image").naturalWidth || Infinity;
  const points = pair.positions || (pair.boxes || []).map(([x0, , x1]) => (x0 + x1) / 2);
  return points.map((x) => Math.min(width, Math.max(0, x)));
}

function drawPoints(points, text, editable, marks = {}) {
  const image = $("image");
  const overlay = $("overlay");
  const scale = image.clientWidth / image.naturalWidth;
  overlay.style.width = `${image.clientWidth}px`;
  overlay.style.height = `${image.clientHeight}px`;
  overlay.classList.toggle("editable", editable);
  overlay.innerHTML = editable ? "" : '<div class="middle"></div>';
  points.forEach((x, i) => {
    const point = document.createElement("div");
    point.className = "pt" + (i === marks.selected ? " selected" : "") + (i === marks.current ? " current" : "");
    point.style.left = `${x * scale}px`;
    const c = text[i] ?? "";
    point.innerHTML = `<span class="${c === "?" ? "unknown" : ""}"></span>`;
    point.firstChild.textContent = c;
    overlay.appendChild(point);
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
        entry.target.classList.add("ok");
      }
    }
  }, { root: list });
  for (const pair of state.queue.pairs) {
    const row = document.createElement("div");
    row.className = "row " + (state.judgments[pair.id]?.verdict || "");
    row.pair = pair;
    row.innerHTML = `<img alt="" draggable="false"><span class="text"></span>`;
    row.querySelector("img").src = pair.image;
    row.querySelector(".text").textContent = pair.text;
    rowGestures(row);
    list.appendChild(row);
    observer.observe(row);
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
      row.className = `row ${verdict}`;
    } else if (verdict === "wrong") {
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
// Un point avec un trait vertical par caractère : glisser le déplace, un appui dans le vide en
// ajoute un, un double appui l'efface, comme le glisser sur la poubelle qui apparaît quand un point
// est sélectionné. La valeur se corrige au pavé, au curseur ; elle n'est acceptée que si elle a
// autant de caractères qu'il y a de points.

const GRAB = 20; // px d'écran autour d'un point pour le saisir
const DOUBLE_TAP = 350; // ms
const TAP_SLOP = 8; // px : en dessous, un appui qui bouge un peu reste un appui

function openFix(pair) {
  state.fix = {
    pair, value: pair.text, cursor: pair.text.length, points: positionsOf(pair),
    selected: null, lastTap: null,
  };
  $("panel").hidden = true;
  $("fix").hidden = false;
  renderFix();
}

function closeFix() {
  if (!state.fix) return;
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
  const { pair, value, points } = state.fix;
  const before = positionsOf(pair);
  const wrong = [];
  if (value !== pair.text) wrong.push("value");
  if (points.length !== before.length || points.some((x, i) => Math.abs(x - before[i]) > 0.5)) {
    wrong.push("positions");
  }
  return wrong;
}

function renderFix() {
  const { value, points, cursor, selected } = state.fix;
  // Point du caractère juste avant le curseur : en évidence.
  drawPoints(points, value, true, { selected, current: cursor - 1 });
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
  const counts = value.length === points.length;
  $("fixOk").disabled = !counts || wrong.length === 0;
  $("fixHint").textContent = !counts
    ? `${value.length} caractère(s) pour ${points.length} point(s)`
    : wrong.length === 0
      ? "Corrige la valeur ou les points, ou choisis « Sans valeur »"
      : `Corrigé : ${wrong.map((w) => (w === "value" ? "valeur" : "positions")).join(" et ")}`;
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

function deletePoint(index) {
  const fix = state.fix;
  fix.points.splice(index, 1);
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

function overlayGestures() {
  const overlay = $("overlay");
  let drag = null;
  const imageX = (e) => {
    const image = $("image");
    const rect = image.getBoundingClientRect();
    const scale = image.clientWidth / image.naturalWidth;
    return { x: Math.min(image.naturalWidth, Math.max(0, (e.clientX - rect.left) / scale)), scale };
  };
  overlay.addEventListener("pointerdown", (e) => {
    const fix = state.fix;
    if (!fix) return;
    e.stopPropagation(); // pas jusqu'au haut de l'écran, qui désélectionnerait le point
    const { x, scale } = imageX(e);
    const points = fix.points;
    let nearest = -1;
    points.forEach((p, i) => {
      if (Math.abs(p - x) * scale <= GRAB && (nearest < 0 || Math.abs(p - x) < Math.abs(points[nearest] - x))) nearest = i;
    });
    const now = Date.now();
    const last = fix.lastTap;
    // Second appui sur le même point : effacé au relâcher, s'il n'a pas glissé entre-temps.
    const second = nearest >= 0 && last && last.index === nearest && now - last.at < DOUBLE_TAP;
    let added = false;
    if (nearest < 0) {
      points.push(x); // appui dans le vide : ajouté
      points.sort((a, b) => a - b);
      nearest = points.indexOf(x);
      added = true;
    }
    fix.selected = nearest;
    drag = { index: nearest, startX: e.clientX, moved: false, added, second };
    overlay.setPointerCapture(e.pointerId);
    renderFix();
  });
  overlay.addEventListener("pointermove", (e) => {
    const fix = state.fix;
    if (!drag || !fix) return;
    if (!drag.moved && Math.abs(e.clientX - drag.startX) < TAP_SLOP) return; // tremblement du doigt
    drag.moved = true;
    const points = fix.points;
    points[drag.index] = imageX(e).x;
    const moved = points[drag.index];
    points.sort((a, b) => a - b);
    drag.index = points.indexOf(moved);
    fix.selected = drag.index;
    renderFix();
    $("trash").classList.toggle("hot", overTrash(e));
  });
  const release = (e) => {
    const fix = state.fix;
    if (!drag || !fix) return;
    $("trash").classList.remove("hot");
    if (drag.moved && e.type === "pointerup" && overTrash(e)) {
      deletePoint(drag.index); // glissé sur la poubelle : effacé
    } else if (!drag.moved && drag.second && e.type === "pointerup") {
      deletePoint(drag.index); // double appui : effacé
    } else {
      // Un appui (sans glissé) sur un point existant peut être le premier d'un double appui.
      fix.lastTap = drag.moved || drag.added ? null : { index: drag.index, at: Date.now() };
    }
    drag = null;
  };
  overlay.addEventListener("pointerup", release);
  overlay.addEventListener("pointercancel", release);
  // Toucher ailleurs dans le haut de l'écran : plus de point sélectionné.
  $("top").addEventListener("pointerdown", (e) => {
    if (!state.fix || e.target.id === "trash") return;
    state.fix.selected = null;
    renderFix();
  });
  // Poubelle touchée : efface le point sélectionné.
  $("trash").addEventListener("click", () => {
    if (state.fix && state.fix.selected !== null) deletePoint(state.fix.selected);
  });
}

function fixWiring() {
  overlayGestures();
  valueGestures();
  for (const k of ["1", "2", "3", "4", "5", "6", "7", "8", "9", ":", "0", ".", "-", "?", "⌫", "vide"]) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = k;
    if (k === "?") b.className = "unknown";
    b.onclick = () => key(k);
    $("keypad").appendChild(b);
  }
  $("fixOk").onclick = () => {
    const { pair, value, points } = state.fix;
    const wrong = fixChanges();
    judge(pair, "wrong", {
      correct: value, positions: points.map((x) => Math.round(x * 10) / 10), wrong,
    });
    finishFix();
  };
  $("fixNone").onclick = () => {
    judge(state.fix.pair, "wrong", { correct: null, positions: null, wrong: [] });
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
    const left = pending().filter((p) => p.reason !== "sûr");
    left.sort((a, b) => a.confidence - b.confidence);
    show(left[0] || pending()[0]);
  };
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
