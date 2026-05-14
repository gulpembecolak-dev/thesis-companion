/* ========================================================================
   woorden — Dutch SRS + lightweight 60-day reading checklist.
   Words use SM-2 lite. Plan tracks one checkbox per day (no writing here).
   Shares localStorage with the original woorden site (same origin).
   ======================================================================== */

const STORAGE_KEY        = "woorden_v1";
const STREAK_KEY         = "woorden_streak_v1";
const PLAN_DONE_KEY      = "tc_plan_done_v1";    // { "1": true, "2": true, ... }
const DAY_MS = 24 * 60 * 60 * 1000;

/* ---------- storage ---------- */
const store = {
  load() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; } },
  save(words) { localStorage.setItem(STORAGE_KEY, JSON.stringify(words)); },
  loadStreak() {
    try { return JSON.parse(localStorage.getItem(STREAK_KEY) || '{"count":0,"lastDate":null,"reviewsToday":0,"reviewsDate":null}'); }
    catch { return { count: 0, lastDate: null, reviewsToday: 0, reviewsDate: null }; }
  },
  saveStreak(s) { localStorage.setItem(STREAK_KEY, JSON.stringify(s)); },
  loadPlanDone() { try { return JSON.parse(localStorage.getItem(PLAN_DONE_KEY) || "{}"); } catch { return {}; } },
  savePlanDone(p) { localStorage.setItem(PLAN_DONE_KEY, JSON.stringify(p)); },
};

/* ---------- state ---------- */
let state = {
  words: store.load(),
  streak: store.loadStreak(),
  planDone: store.loadPlanDone(),
  currentTab: "vandaag",
  reviewQueue: [],
  currentCard: null,
  cardShowingBack: false,
  searchQuery: "",
};

/* ---------- helpers ---------- */
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const todayKey = () => new Date().toISOString().slice(0, 10);

function showToast(msg, duration = 1600) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.classList.add("hidden"), 200); }, duration);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function formatInterval(days) {
  if (days < 1) return "<1 dag";
  if (days < 30) return `${Math.round(days)} d`;
  if (days < 365) return `${Math.round(days / 30)} m`;
  return `${(days / 365).toFixed(1)} j`;
}

function isDue(card, now = Date.now()) { return (card.nextReview || 0) <= now; }

/* ---------- SM-2 lite ---------- */
function scheduleCard(card, rating) {
  const now = Date.now();
  let { interval = 0, ease = 2.5, reviewCount = 0, lapses = 0 } = card;
  if (rating === "again") { interval = 1; ease = Math.max(1.3, ease - 0.2); lapses += 1; }
  else if (rating === "hard") { interval = Math.max(1, (interval || 1) * 1.2); ease = Math.max(1.3, ease - 0.15); }
  else if (rating === "good") { interval = (interval || 1) * ease; if (reviewCount === 0) interval = 1; }
  else if (rating === "easy") { interval = (interval || 1) * ease * 1.3; if (reviewCount === 0) interval = 4; ease = Math.min(3.0, ease + 0.15); }
  return { ...card, interval, ease, reviewCount: reviewCount + 1, lapses, nextReview: now + interval * DAY_MS, lastReview: now };
}

function previewIntervals(card) {
  return {
    again: formatInterval(1),
    hard:  formatInterval(Math.max(1, (card.interval || 1) * 1.2)),
    good:  formatInterval(card.reviewCount === 0 ? 1 : (card.interval || 1) * (card.ease || 2.5)),
    easy:  formatInterval(card.reviewCount === 0 ? 4 : (card.interval || 1) * (card.ease || 2.5) * 1.3),
  };
}

function bumpStreakOnReview() {
  const today = todayKey();
  const s = state.streak;
  if (s.reviewsDate !== today) { s.reviewsToday = 0; s.reviewsDate = today; }
  s.reviewsToday += 1;
  if (s.lastDate !== today) {
    const yesterday = new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);
    s.count = s.lastDate === yesterday ? s.count + 1 : 1;
    s.lastDate = today;
  }
  store.saveStreak(s);
}

/* ---------- tabs ---------- */
function switchTab(tab) {
  state.currentTab = tab;
  $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $$(".panel").forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== tab));

  if (tab === "vandaag") renderReview();
  else if (tab === "lijst") renderList();
  else if (tab === "nieuw") prepareNewForm();
  else if (tab === "plan")  renderPlan();
  else if (tab === "stats") renderStats();
}

/* ---------- review (= vandaag) ---------- */
function buildReviewQueue() {
  const now = Date.now();
  const due = state.words.filter((w) => isDue(w, now));
  due.sort((a, b) => {
    const an = a.reviewCount === 0 ? 1 : 0;
    const bn = b.reviewCount === 0 ? 1 : 0;
    if (an !== bn) return an - bn;
    return (a.nextReview || 0) - (b.nextReview || 0);
  });
  state.reviewQueue = due;
}

function renderReview() {
  buildReviewQueue();
  updateDueBadge();
  if (state.reviewQueue.length === 0) {
    $("#review-empty").classList.remove("hidden");
    $("#review-card").classList.add("hidden");
    renderEmptyGreeting();
    state.currentCard = null;
    return;
  }
  $("#review-empty").classList.add("hidden");
  $("#review-card").classList.remove("hidden");
  state.currentCard = state.reviewQueue[0];
  state.cardShowingBack = false;
  $("#card-inner").classList.remove("flipped");
  paintCard();
}

function renderEmptyGreeting() {
  const h = new Date().getHours();
  const todayK = todayKey();
  const reviewsToday = state.streak.reviewsDate === todayK ? state.streak.reviewsToday : 0;
  const streak = state.streak.lastDate === todayK ? state.streak.count : 0;

  let greeting, sub;
  if (reviewsToday > 0) {
    // celebration after clearing the queue today
    greeting = `${reviewsToday} kaart${reviewsToday === 1 ? "" : "en"} af.`;
    if (streak >= 7)      sub = `Mooi werk. ${streak} dagen op rij — dat begint serieus te worden.`;
    else if (streak >= 2) sub = `Mooi werk. ${streak} dagen op rij.`;
    else                  sub = "Mooi werk. Begin van een nieuwe streak.";
  } else if (h < 6)       { greeting = "Goedenacht.";            sub = "Geen kaarten op dit moment. Het is laat — kom morgen terug."; }
  else if (h < 12)        { greeting = "Goedemorgen, Gülpembe."; sub = "Geen kaarten te herhalen. Voeg een woord toe als je iets nieuws tegenkomt."; }
  else if (h < 18)        { greeting = "Goedemiddag.";           sub = "Niets te herhalen op dit moment. Tijd voor een nieuw woord?"; }
  else                    { greeting = "Goedenavond.";           sub = "Geen kaarten meer vandaag. Mooi werk."; }
  $("#empty-greeting").textContent = greeting;
  $("#empty-sub").textContent = sub;
}

function paintCard() {
  const c = state.currentCard;
  if (!c) return;
  $("#card-nl").textContent = c.nl;
  $("#card-tr").textContent = c.tr || "—";
  if (c.nldef) { $("#card-nldef").textContent = c.nldef; $("#row-nldef").classList.remove("hidden"); }
  else $("#row-nldef").classList.add("hidden");
  const exB = $("#card-voorbeeld-back");
  $("#card-voorbeeld-front").classList.add("hidden");
  if (c.voorbeeld) { exB.innerHTML = highlightNlInExample(c.voorbeeld, c.nl); exB.classList.remove("hidden"); }
  else exB.classList.add("hidden");
  if (c.notitie) { $("#card-notitie").textContent = c.notitie; $("#card-notitie").classList.remove("hidden"); }
  else $("#card-notitie").classList.add("hidden");
  const idx = state.reviewQueue.length;
  const tag = c.reviewCount === 0 ? "nieuw" : `interval ${formatInterval(c.interval || 1)}`;
  $("#card-progress").textContent = `${idx} te gaan · ${tag}`;
  const previews = previewIntervals(c);
  $$('[data-int]').forEach((el) => { el.textContent = previews[el.dataset.int]; });
}

function escapeRegex(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function highlightNlInExample(example, nl) {
  if (!example) return "";
  const escaped = escapeHtml(example);
  if (!nl) return escaped;
  // strip leading 'de ' / 'het ' / 'een '
  const core = nl.trim().replace(/^(de|het|een)\s+/i, "");
  if (!core) return escaped;
  // match the core stem plus simple Dutch inflection (e, en, er, t, s)
  const pattern = new RegExp(`\\b(${escapeRegex(core)}[a-zëéèêïíìîöóòôüúùûäáàâ]{0,4})\\b`, "gi");
  return escaped.replace(pattern, '<mark class="ex-mark">$1</mark>');
}

function flipCard() {
  if (!state.currentCard || state.cardShowingBack) return;
  state.cardShowingBack = true;
  $("#card-inner").classList.add("flipped");
}

function rateCard(rating) {
  if (!state.currentCard || !state.cardShowingBack) return;
  const updated = scheduleCard(state.currentCard, rating);
  const i = state.words.findIndex((w) => w.id === updated.id);
  if (i !== -1) state.words[i] = updated;
  store.save(state.words);
  bumpStreakOnReview();
  renderReview();
}

/* ---------- list ---------- */
function renderList() {
  const q = state.searchQuery.trim().toLowerCase();
  const filtered = q
    ? state.words.filter((w) =>
        (w.nl||"").toLowerCase().includes(q) ||
        (w.tr||"").toLowerCase().includes(q) ||
        (w.nldef||"").toLowerCase().includes(q) ||
        (w.voorbeeld||"").toLowerCase().includes(q))
    : state.words;
  $("#list-count").textContent = `${filtered.length} woord${filtered.length === 1 ? "" : "en"}`;
  if (state.words.length === 0) {
    $("#list-empty").classList.remove("hidden");
    $("#word-table").classList.add("hidden");
    return;
  }
  $("#list-empty").classList.add("hidden");
  $("#word-table").classList.remove("hidden");
  const tbody = $("#word-tbody");
  tbody.innerHTML = "";
  const sorted = [...filtered].sort((a, b) => (a.nl||"").localeCompare(b.nl||"", "nl"));
  for (const w of sorted) {
    const now = Date.now();
    const due = isDue(w, now);
    const daysToNext = w.nextReview ? Math.round(((w.nextReview - now) / DAY_MS) * 10) / 10 : 0;
    const nextLabel = w.reviewCount === 0 ? "nieuw"
                    : due ? "vandaag"
                    : daysToNext < 1 ? "< 1 d"
                    : formatInterval(daysToNext);
    const stage = wordStage(w);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="nl-cell">${escapeHtml(w.nl)}</td>
      <td>${escapeHtml(w.tr || "")}</td>
      <td>${escapeHtml(w.nldef || "")}</td>
      <td class="num">
        <span class="strength-dot stage-${stage}" title="${strengthLabel(stage)}"></span>
        ${nextLabel}
      </td>
      <td class="num">${w.reviewCount || 0}</td>
      <td class="row-actions">
        <button class="icon-btn" data-act="edit" data-id="${w.id}" title="bewerk">✎</button>
        <button class="icon-btn del" data-act="del" data-id="${w.id}" title="verwijder">✕</button>
      </td>`;
    tbody.appendChild(tr);
  }
}

function wordStage(w) {
  if ((w.reviewCount || 0) === 0) return "new";
  const i = w.interval || 0;
  if (i < 7) return "learning";
  if (i < 21) return "young";
  return "mature";
}
function strengthLabel(stage) {
  return { new: "nieuw", learning: "leren", young: "jong", mature: "rijp" }[stage] || "";
}

/* ---------- new/edit form ---------- */
function prepareNewForm() {
  $("#edit-id").value = "";
  $("#form-title").textContent = "Nieuw woord";
  $("#btn-cancel-edit").classList.add("hidden");
  ["f-nl","f-tr","f-nldef","f-voorbeeld","f-notitie"].forEach((id) => ($("#"+id).value = ""));
  setTimeout(() => $("#f-nl").focus(), 50);
}

function prepareEditForm(id) {
  const w = state.words.find((w) => w.id === id);
  if (!w) return;
  switchTab("nieuw");
  $("#edit-id").value = id;
  $("#form-title").textContent = "Bewerk woord";
  $("#btn-cancel-edit").classList.remove("hidden");
  $("#f-nl").value = w.nl;
  $("#f-tr").value = w.tr || "";
  $("#f-nldef").value = w.nldef || "";
  $("#f-voorbeeld").value = w.voorbeeld || "";
  $("#f-notitie").value = w.notitie || "";
  setTimeout(() => $("#f-nl").focus(), 50);
}

function handleSubmit(e) {
  e.preventDefault();
  const id = $("#edit-id").value;
  const nl = $("#f-nl").value.trim();
  const tr = $("#f-tr").value.trim();
  if (!nl || !tr) return;
  const data = {
    nl, tr,
    nldef: $("#f-nldef").value.trim(),
    voorbeeld: $("#f-voorbeeld").value.trim(),
    notitie: $("#f-notitie").value.trim(),
  };
  if (id) {
    const i = state.words.findIndex((w) => w.id === id);
    if (i !== -1) {
      state.words[i] = { ...state.words[i], ...data };
      store.save(state.words);
      showToast("Bijgewerkt");
    }
    prepareNewForm();
    switchTab("lijst");
  } else {
    const dup = state.words.find((w) => (w.nl||"").toLowerCase() === nl.toLowerCase());
    if (dup && !confirm(`"${nl}" bestaat al. Toch toevoegen?`)) return;
    const card = {
      id: uid(), ...data,
      createdAt: Date.now(), interval: 0, ease: 2.5,
      nextReview: Date.now(), reviewCount: 0, lapses: 0,
    };
    state.words.push(card);
    store.save(state.words);
    showToast(`"${nl}" toegevoegd`);
    prepareNewForm();
    updateDueBadge();
  }
}

function deleteWord(id) {
  const w = state.words.find((w) => w.id === id);
  if (!w) return;
  if (!confirm(`"${w.nl}" verwijderen?`)) return;
  state.words = state.words.filter((w) => w.id !== id);
  store.save(state.words);
  renderList();
  updateDueBadge();
  showToast("Verwijderd");
}

/* ---------- plan (simple checklist) ---------- */
function planTotalDone() {
  let n = 0;
  for (const d of planData) if (state.planDone[d.day]) n++;
  return n;
}

function renderPlan() {
  updatePlanBadge();
  const todayIso = todayKey();

  // ----- heatmap: 6 rows × 10 cols of all 60 days -----
  const heat = $("#plan-heatmap");
  let heatHtml = "";
  for (const d of planData) {
    const isDone = !!state.planDone[d.day];
    const isToday = d.date === todayIso;
    heatHtml += `<button type="button" class="heat-cell ${isDone ? "done" : ""} ${isToday ? "is-today" : ""}"
                         data-day="${d.day}"
                         title="dag ${d.day} · ${escapeHtml(d.dateLabel)} · ${escapeHtml(d.theme)}">${d.day}</button>`;
  }
  heat.innerHTML = heatHtml;

  // ----- weekly list below -----
  const list = $("#plan-list");
  const groups = {};
  for (const d of planData) {
    if (!groups[d.week]) groups[d.week] = [];
    groups[d.week].push(d);
  }
  let html = "";
  Object.keys(groups).sort((a,b) => +a - +b).forEach((wkStr) => {
    const wk = +wkStr;
    const days = groups[wk];
    const done = days.filter((d) => state.planDone[d.day]).length;
    const theme = (typeof weekThemes !== "undefined" && weekThemes[wk]) ? weekThemes[wk] : "";
    html += `
      <div class="plan-week-h">
        <span class="wk-label"><span class="wk-num">week ${wk}</span>${escapeHtml(theme)}</span>
        <span class="wk-progress">${done}/${days.length}</span>
      </div>
    `;
    for (const d of days) {
      const isDone = !!state.planDone[d.day];
      const isToday = d.date === todayIso;
      html += `
        <div class="plan-day ${isDone ? "done" : ""} ${isToday ? "is-today" : ""}"
             data-day="${d.day}" title="${escapeHtml(d.theme)}\n${escapeHtml(d.read)}">
          <span class="d-check"></span>
          <span class="d-date">${escapeHtml(d.dateLabel)}</span>
          <span class="d-read">${escapeHtml(d.read)}</span>
          <span class="d-num">dag ${String(d.day).padStart(2,"0")}</span>
        </div>
      `;
    }
  });
  list.innerHTML = html;

  // top progress
  const total = planData.length;
  const totalDone = planTotalDone();
  const pct = Math.round((totalDone / total) * 100);
  $("#plan-progress-fill").style.width = pct + "%";
  $("#plan-progress-text").textContent = `${totalDone} / ${total} voltooid (${pct}%)`;
}

function togglePlanDay(dayNum) {
  state.planDone[dayNum] = !state.planDone[dayNum];
  store.savePlanDone(state.planDone);
  // update DOM in place (cheap)
  const el = $(`.plan-day[data-day="${dayNum}"]`);
  if (el) el.classList.toggle("done", state.planDone[dayNum]);
  // also update heatmap cell
  const heatEl = document.querySelector(`.heat-cell[data-day="${dayNum}"]`);
  if (heatEl) heatEl.classList.toggle("done", state.planDone[dayNum]);
  // update week progress count
  const d = planData.find((x) => x.day === dayNum);
  if (d) {
    const weekDays = planData.filter((x) => x.week === d.week);
    const done = weekDays.filter((x) => state.planDone[x.day]).length;
    // find the heading right before this week's first day — match by text
    // easier: iterate all .wk-progress nodes
    const headings = $$(".plan-week-h");
    headings.forEach((h) => {
      const label = h.querySelector(".wk-label .wk-num");
      if (label && label.textContent.trim() === `week ${d.week}`) {
        h.querySelector(".wk-progress").textContent = `${done}/${weekDays.length}`;
      }
    });
  }
  // top progress
  const total = planData.length;
  const totalDone = planTotalDone();
  const pct = Math.round((totalDone / total) * 100);
  $("#plan-progress-fill").style.width = pct + "%";
  $("#plan-progress-text").textContent = `${totalDone} / ${total} voltooid (${pct}%)`;
  updatePlanBadge();
}

function jumpToToday() {
  const today = planData.find((d) => d.date === todayKey());
  if (!today) {
    showToast("Vandaag valt buiten de routine-periode");
    return;
  }
  const el = $(`.plan-day[data-day="${today.day}"]`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
}

/* ---------- stats ---------- */
function renderStats() {
  const now = Date.now();
  const total = state.words.length;
  const due = state.words.filter((w) => isDue(w, now)).length;
  const newCount = state.words.filter((w) => (w.reviewCount || 0) === 0).length;
  const mature = state.words.filter((w) => (w.interval || 0) >= 21).length;
  const today = todayKey();
  const yesterday = new Date(now - DAY_MS).toISOString().slice(0, 10);
  let streakCount = state.streak.count;
  if (state.streak.lastDate !== today && state.streak.lastDate !== yesterday) streakCount = 0;
  const reviewsToday = state.streak.reviewsDate === today ? state.streak.reviewsToday : 0;
  $("#stat-total").textContent   = total;
  $("#stat-due").textContent     = due;
  $("#stat-new").textContent     = newCount;
  $("#stat-mature").textContent  = mature;
  $("#stat-streak").textContent  = streakCount;
  $("#stat-reviews").textContent = reviewsToday;

  const planDone = planTotalDone();
  $("#stat-plan-done").textContent = planDone;
  $("#stat-plan-rest").textContent = planData.length - planDone;
}

/* ---------- badges ---------- */
function updateDueBadge() {
  const due = state.words.filter((w) => isDue(w)).length;
  const badge = $("#due-badge");
  badge.textContent = due;
  badge.setAttribute("data-count", due);
}
function updatePlanBadge() {
  $("#plan-badge").textContent = `${planTotalDone()}/${planData.length}`;
}

/* ---------- export / import / reset ---------- */
function exportJson() {
  const data = {
    version: 2, exportedAt: new Date().toISOString(),
    words: state.words, streak: state.streak, planDone: state.planDone,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `woorden-${todayKey()}.json`;
  a.click(); URL.revokeObjectURL(url);
  showToast("Geëxporteerd");
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const incoming = Array.isArray(data) ? data : data.words || [];
      const existing = new Set(state.words.map((w) => (w.nl||"").toLowerCase()));
      let added = 0;
      for (const w of incoming) {
        if (!w.nl || existing.has(w.nl.toLowerCase())) continue;
        state.words.push({
          id: w.id || uid(),
          nl: w.nl, tr: w.tr || "", nldef: w.nldef || "",
          voorbeeld: w.voorbeeld || "", notitie: w.notitie || "",
          createdAt: w.createdAt || Date.now(),
          interval: w.interval || 0, ease: w.ease || 2.5,
          nextReview: w.nextReview || Date.now(),
          reviewCount: w.reviewCount || 0, lapses: w.lapses || 0,
          lastReview: w.lastReview || null,
        });
        existing.add(w.nl.toLowerCase());
        added++;
      }
      store.save(state.words);
      if (data.planDone) {
        Object.assign(state.planDone, data.planDone);
        store.savePlanDone(state.planDone);
      }
      renderStats(); updateDueBadge(); updatePlanBadge();
      showToast(`${added} woord${added === 1 ? "" : "en"} geïmporteerd`);
    } catch (err) {
      showToast("Kon bestand niet lezen");
      console.error(err);
    }
  };
  reader.readAsText(file);
}

function resetWords() {
  if (!confirm("Alle woorden wissen?")) return;
  if (!confirm("Heel zeker?")) return;
  state.words = [];
  state.streak = { count: 0, lastDate: null, reviewsToday: 0, reviewsDate: null };
  store.save(state.words); store.saveStreak(state.streak);
  renderStats(); updateDueBadge();
  showToast("Woorden gewist");
}

function resetPlan() {
  if (!confirm("Plan-voortgang wissen?")) return;
  state.planDone = {};
  store.savePlanDone(state.planDone);
  renderStats(); updatePlanBadge();
  if (state.currentTab === "plan") renderPlan();
  showToast("Plan gewist");
}

/* ---------- events ---------- */
function bindEvents() {
  $$(".tab").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
  $$('[data-go]').forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.go)));

  $("#btn-show").addEventListener("click", flipCard);
  $$('[data-rate]').forEach((b) => b.addEventListener("click", () => rateCard(b.dataset.rate)));

  $("#form-new").addEventListener("submit", handleSubmit);
  $("#btn-cancel-edit").addEventListener("click", () => { prepareNewForm(); switchTab("lijst"); });

  $("#search").addEventListener("input", (e) => { state.searchQuery = e.target.value; renderList(); });
  $("#word-tbody").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    if (btn.dataset.act === "edit") prepareEditForm(btn.dataset.id);
    else if (btn.dataset.act === "del") deleteWord(btn.dataset.id);
  });

  $("#plan-list").addEventListener("click", (e) => {
    const row = e.target.closest(".plan-day");
    if (!row) return;
    togglePlanDay(+row.dataset.day);
  });

  // heatmap click → scroll to that day in the list below
  $("#plan-heatmap").addEventListener("click", (e) => {
    const cell = e.target.closest(".heat-cell");
    if (!cell) return;
    const dayNum = +cell.dataset.day;
    const target = document.querySelector(`.plan-day[data-day="${dayNum}"]`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("flash");
      setTimeout(() => target.classList.remove("flash"), 1200);
    }
  });

  $("#plan-jump-today").addEventListener("click", jumpToToday);

  $("#btn-export").addEventListener("click", exportJson);
  $("#btn-import").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", (e) => {
    if (e.target.files[0]) importJson(e.target.files[0]);
    e.target.value = "";
  });
  $("#btn-reset-words").addEventListener("click", resetWords);
  $("#btn-reset-plan").addEventListener("click", resetPlan);

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (state.currentTab === "vandaag" && state.currentCard) {
      if (e.code === "Space") { e.preventDefault(); if (!state.cardShowingBack) flipCard(); return; }
      if (state.cardShowingBack) {
        if (e.key === "1") rateCard("again");
        else if (e.key === "2") rateCard("hard");
        else if (e.key === "3") rateCard("good");
        else if (e.key === "4") rateCard("easy");
      }
    }
    if (e.key === "n" || e.key === "N") switchTab("nieuw");
  });
}

function init() {
  bindEvents();
  updateDueBadge();
  updatePlanBadge();
  switchTab("vandaag");
}
init();
