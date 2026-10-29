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

function judge(pair, verdict) {
  state.judgments[pair.id] = { id: pair.id, text: pair.text, verdict, at: new Date().toISOString() };
  state.history.push(pair.id);
  store.set(judgmentsKey(), state.judgments);
  updateProgress();
}

function undo() {
  const id = state.history.pop();
  if (!id) return;
  delete state.judgments[id];
  store.set(judgmentsKey(), state.judgments);
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
  overlay.innerHTML = '<div class="middle"></div>';
  for (const [x0, y0, x1, y1] of pair.boxes || []) {
    const box = document.createElement("div");
    box.className = "box";
    Object.assign(box.style, {
      left: `${x0 * scale}px`, top: `${y0 * scale}px`,
      width: `${(x1 - x0) * scale}px`, height: `${(y1 - y0) * scale}px`,
    });
    overlay.appendChild(box);
  }
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
    if (verdict) {
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
    if (verdict === "wrong" || verdict === "unknown") {
      judge(row.pair, verdict);
      row.className = `row ${verdict}`;
    }
  };
  row.addEventListener("pointerup", release);
  row.addEventListener("pointercancel", release);
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
