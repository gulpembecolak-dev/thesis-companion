/* ========================================================================
   thesis-companion — Dutch vocab (SRS) + 60-day reading routine.
   Words use SM-2 lite. Reading plan tracks read/write done + saved response.
   Storage keys reused from woorden so data crosses subpaths on same origin.
   ======================================================================== */

const STORAGE_KEY        = "woorden_v1";          // reused — words list
const STREAK_KEY         = "woorden_streak_v1";   // reused — streak
const PLAN_PROGRESS_KEY  = "tc_plan_progress_v1"; // new — { day: { read: bool, write: bool } }
const PLAN_WRITING_KEY   = "tc_plan_writing_v1";  // new — { day: "user's text" }
const DAY_MS = 24 * 60 * 60 * 1000;

const NL_WEEKDAYS = ["zondag","maandag","dinsdag","woensdag","donderdag","vrijdag","zaterdag"];
const NL_MONTHS   = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];

/* ---------- storage ---------- */
const store = {
  load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
  },
  save(words) { localStorage.setItem(STORAGE_KEY, JSON.stringify(words)); },
  loadStreak() {
    try { return JSON.parse(localStorage.getItem(STREAK_KEY) || '{"count":0,"lastDate":null,"reviewsToday":0,"reviewsDate":null}'); }
    catch { return { count: 0, lastDate: null, reviewsToday: 0, reviewsDate: null }; }
  },
  saveStreak(s) { localStorage.setItem(STREAK_KEY, JSON.stringify(s)); },
  loadPlanProgress() {
    try { return JSON.parse(localStorage.getItem(PLAN_PROGRESS_KEY) || "{}"); } catch { return {}; }
  },
  savePlanProgress(p) { localStorage.setItem(PLAN_PROGRESS_KEY, JSON.stringify(p)); },
  loadPlanWriting() {
    try { return JSON.parse(localStorage.getItem(PLAN_WRITING_KEY) || "{}"); } catch { return {}; }
  },
  savePlanWriting(w) { localStorage.setItem(PLAN_WRITING_KEY, JSON.stringify(w)); },
};

/* ---------- state ---------- */
let state = {
  words: store.load(),
  streak: store.loadStreak(),
  planProgress: store.loadPlanProgress(),
  planWriting: store.loadPlanWriting(),
  currentTab: "vandaag",
  reviewQueue: [],
  currentCard: null,
  cardShowingBack: false,
  searchQuery: "",
  expandedWeeks: new Set(),  // for plan view
  expandedDays: new Set(),   // for plan view
};

/* ---------- helpers ---------- */
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const todayKey = () => new Date().toISOString().slice(0, 10);

function showToast(msg, duration = 1800) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.classList.add("hidden"), 200);
  }, duration);
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

function formatNlDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return `${NL_WEEKDAYS[d.getDay()]} ${d.getDate()} ${NL_MONTHS[d.getMonth()]}`;
}

function isDue(card, now = Date.now()) { return (card.nextReview || 0) <= now; }

/* ---------- SM-2 lite (unchanged from woorden) ---------- */
function scheduleCard(card, rating) {
  const now = Date.now();
  let { interval = 0, ease = 2.5, reviewCount = 0, lapses = 0 } = card;
  if (rating === "again") {
    interval = 1; ease = Math.max(1.3, ease - 0.2); lapses += 1;
  } else if (rating === "hard") {
    interval = Math.max(1, (interval || 1) * 1.2); ease = Math.max(1.3, ease - 0.15);
  } else if (rating === "good") {
    interval = (interval || 1) * ease; if (reviewCount === 0) interval = 1;
  } else if (rating === "easy") {
    interval = (interval || 1) * ease * 1.3; if (reviewCount === 0) interval = 4;
    ease = Math.min(3.0, ease + 0.15);
  }
  return { ...card, interval, ease, reviewCount: reviewCount + 1, lapses,
           nextReview: now + interval * DAY_MS, lastReview: now };
}

function previewIntervals(card) {
  return {
    again: formatInterval(1),
    hard:  formatInterval(Math.max(1, (card.interval || 1) * 1.2)),
    good:  formatInterval(card.reviewCount === 0 ? 1 : (card.interval || 1) * (card.ease || 2.5)),
    easy:  formatInterval(card.reviewCount === 0 ? 4 : (card.interval || 1) * (card.ease || 2.5) * 1.3),
  };
}

/* ---------- streak ---------- */
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

  if (tab === "vandaag")  renderVandaag();
  else if (tab === "herhalen") renderReview();
  else if (tab === "lijst")    renderList();
  else if (tab === "nieuw")    prepareNewForm();
  else if (tab === "plan")     renderPlan();
  else if (tab === "stats")    renderStats();
}

/* ---------- vandaag (today dashboard) ---------- */
function getTodayPlanDay() {
  const today = todayKey();
  return planData.find((d) => d.date === today) || null;
}

function renderVandaag() {
  const today = new Date();
  const todayIso = todayKey();
  $("#vandaag-datum").textContent = `vandaag — ${formatNlDate(todayIso)}`;

  const day = getTodayPlanDay();

  if (!day) {
    // before, between, or after the plan period
    $("#vandaag-actief").classList.add("hidden");
    $("#vandaag-buiten-periode").classList.remove("hidden");

    const startDate = new Date(PLAN_START_ISO + "T00:00:00");
    const endDate   = new Date(PLAN_END_ISO   + "T00:00:00");

    if (today < startDate) {
      const daysToStart = Math.ceil((startDate - today) / DAY_MS);
      $("#vbp-titel").textContent = "Routine start binnenkort";
      $("#vbp-uitleg").textContent = `De 60-daagse leesroutine begint op ${formatNlDate(PLAN_START_ISO)} (over ${daysToStart} dagen).`;
      $("#vandaag-titel").textContent = "Klaar om te beginnen";
      $("#vandaag-thema").textContent = "—";
    } else if (today > endDate) {
      $("#vbp-titel").textContent = "Routine voltooid";
      $("#vbp-uitleg").textContent = `De routine eindigde op ${formatNlDate(PLAN_END_ISO)}. Tijd om je notities te synthetiseren.`;
      $("#vandaag-titel").textContent = "Routine voltooid";
      $("#vandaag-thema").textContent = "—";
    } else {
      // somewhere in period but day not found — shouldn't happen, but graceful fallback
      $("#vbp-titel").textContent = "Geen dag-opdracht vandaag";
      $("#vbp-uitleg").textContent = "Er is geen plan-dag voor vandaag. Kijk in het plan voor je volgende leesopdracht.";
      $("#vandaag-titel").textContent = "Vrije dag";
      $("#vandaag-thema").textContent = "—";
    }
    renderVandaagWoordenSummary();
    return;
  }

  // active plan day
  $("#vandaag-buiten-periode").classList.add("hidden");
  $("#vandaag-actief").classList.remove("hidden");

  $("#vandaag-titel").textContent = `Dag ${day.day} / 60`;
  $("#vandaag-thema").textContent = day.theme;

  $("#vandaag-read").textContent  = day.read;
  $("#vandaag-write").textContent = day.write;

  const progress = state.planProgress[day.day] || { read: false, write: false };
  $("#vandaag-read-done").checked  = !!progress.read;
  $("#vandaag-write-done").checked = !!progress.write;

  const textarea = $("#vandaag-textarea");
  textarea.value = state.planWriting[day.day] || "";
  updateVandaagWordcount();

  renderVandaagWoordenSummary();
}

function renderVandaagWoordenSummary() {
  const now = Date.now();
  const dueCount = state.words.filter((w) => isDue(w, now)).length;
  const todayIso = todayKey();
  const addedToday = state.words.filter((w) => {
    if (!w.createdAt) return false;
    return new Date(w.createdAt).toISOString().slice(0, 10) === todayIso;
  }).length;

  let msg;
  if (dueCount === 0 && addedToday === 0) {
    msg = "Geen kaarten te herhalen op dit moment. Voeg een woord toe als je iets nieuws tegenkomt.";
  } else if (dueCount === 0) {
    msg = `Geen kaarten meer vandaag. ${addedToday} nieuw${addedToday === 1 ? "" : "e"} woord${addedToday === 1 ? "" : "en"} toegevoegd vandaag.`;
  } else {
    msg = `${dueCount} kaart${dueCount === 1 ? "" : "en"} te herhalen.`;
    if (addedToday > 0) msg += ` (${addedToday} vandaag toegevoegd)`;
  }
  $("#vandaag-woorden-summary").textContent = msg;
}

function updateVandaagWordcount() {
  const txt = $("#vandaag-textarea").value.trim();
  const words = txt ? txt.split(/\s+/).length : 0;
  $("#vandaag-wordcount").textContent = `${words} woord${words === 1 ? "" : "en"}`;
}

function saveVandaagWriting() {
  const day = getTodayPlanDay();
  if (!day) return;
  const txt = $("#vandaag-textarea").value;
  state.planWriting[day.day] = txt;
  store.savePlanWriting(state.planWriting);
  const now = new Date();
  $("#vandaag-savedat").textContent = `opgeslagen om ${now.getHours().toString().padStart(2,"0")}:${now.getMinutes().toString().padStart(2,"0")}`;
}

function toggleVandaagDone(kind) {
  const day = getTodayPlanDay();
  if (!day) return;
  if (!state.planProgress[day.day]) state.planProgress[day.day] = { read: false, write: false };
  state.planProgress[day.day][kind] = kind === "read"
    ? $("#vandaag-read-done").checked
    : $("#vandaag-write-done").checked;
  store.savePlanProgress(state.planProgress);
  updatePlanBadge();
}

/* ---------- review ---------- */
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
    state.currentCard = null;
    return;
  }
  $("#review-empty").classList.add("hidden");
  $("#review-card").classList.remove("hidden");
  state.currentCard = state.reviewQueue[0];
  state.cardShowingBack = false;
  paintCard();
}

function paintCard() {
  const c = state.currentCard;
  if (!c) return;
  $("#card-nl").textContent = c.nl;
  $("#card-tr").textContent = c.tr || "—";
  if (c.nldef) {
    $("#card-nldef").textContent = c.nldef;
    $("#row-nldef").classList.remove("hidden");
  } else {
    $("#row-nldef").classList.add("hidden");
  }
  const exF = $("#card-voorbeeld-front");
  const exB = $("#card-voorbeeld-back");
  exF.classList.add("hidden");
  if (c.voorbeeld) { exB.textContent = c.voorbeeld; exB.classList.remove("hidden"); }
  else { exB.classList.add("hidden"); }
  if (c.notitie) { $("#card-notitie").textContent = c.notitie; $("#card-notitie").classList.remove("hidden"); }
  else { $("#card-notitie").classList.add("hidden"); }
  const idx = state.reviewQueue.length;
  const tag = c.reviewCount === 0 ? "nieuw" : `interval ${formatInterval(c.interval || 1)}`;
  $("#card-progress").textContent = `${idx} te gaan · ${tag}`;
  const previews = previewIntervals(c);
  $$('[data-int]').forEach((el) => { el.textContent = previews[el.dataset.int]; });
  $("#card-back").classList.toggle("hidden", !state.cardShowingBack);
  $("#btn-show").classList.toggle("hidden", state.cardShowingBack);
  $("#rate-buttons").classList.toggle("hidden", !state.cardShowingBack);
}

function flipCard() {
  if (!state.currentCard) return;
  state.cardShowingBack = true;
  paintCard();
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
    const tr = document.createElement("tr");
    const now = Date.now();
    const due = isDue(w, now);
    const daysToNext = w.nextReview ? Math.round(((w.nextReview - now) / DAY_MS) * 10) / 10 : 0;
    const nextLabel = w.reviewCount === 0 ? "nieuw"
                    : due ? "vandaag"
                    : daysToNext < 1 ? "< 1 d"
                    : formatInterval(daysToNext);
    tr.innerHTML = `
      <td class="nl-cell">${escapeHtml(w.nl)}</td>
      <td>${escapeHtml(w.tr || "")}</td>
      <td>${escapeHtml(w.nldef || "")}</td>
      <td class="num">${nextLabel}</td>
      <td class="num">${w.reviewCount || 0}</td>
      <td class="row-actions">
        <button class="icon-btn" data-act="edit" data-id="${w.id}" title="bewerk">✎</button>
        <button class="icon-btn del" data-act="del" data-id="${w.id}" title="verwijder">✕</button>
      </td>`;
    tbody.appendChild(tr);
  }
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
    if (dup) {
      if (!confirm(`"${nl}" bestaat al. Toch toevoegen als duplicaat?`)) return;
    }
    const card = {
      id: uid(), ...data,
      createdAt: Date.now(),
      interval: 0, ease: 2.5,
      nextReview: Date.now(),
      reviewCount: 0, lapses: 0,
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

/* ---------- plan (60-day) ---------- */
function planWeekGroups() {
  const groups = {};
  for (const d of planData) {
    if (!groups[d.week]) groups[d.week] = [];
    groups[d.week].push(d);
  }
  return groups;
}

function planWeekProgress(weekNum) {
  const days = planData.filter((d) => d.week === weekNum);
  let done = 0;
  for (const d of days) {
    const p = state.planProgress[d.day];
    if (p && p.read && p.write) done++;
  }
  return { done, total: days.length };
}

function renderPlan() {
  updatePlanBadge();
  const groups = planWeekGroups();
  const container = $("#plan-weeks");
  container.innerHTML = "";
  const todayIso = todayKey();

  Object.keys(groups).sort((a, b) => +a - +b).forEach((wkStr) => {
    const wk = +wkStr;
    const days = groups[wk];
    const { done, total } = planWeekProgress(wk);
    const pct = total ? Math.round((done / total) * 100) : 0;

    // is current week (contains today)?
    const isCurrentWeek = days.some((d) => d.date === todayIso);
    const shouldOpen = state.expandedWeeks.has(wk) || isCurrentWeek;
    if (isCurrentWeek) state.expandedWeeks.add(wk);

    const wkEl = document.createElement("section");
    wkEl.className = "plan-week" + (shouldOpen ? " open" : "");
    wkEl.dataset.week = wk;

    const dateRange = `${days[0].dateLabel} – ${days[days.length-1].dateLabel}`;
    const theme = (typeof weekThemes !== "undefined" && weekThemes[wk]) ? weekThemes[wk] : "";

    wkEl.innerHTML = `
      <header class="plan-week-header" data-action="toggle-week">
        <div class="plan-week-title">
          <span class="week-num">Week ${wk}</span>
          <span class="week-theme muted">${escapeHtml(theme)}</span>
        </div>
        <div class="plan-week-meta">
          <span>${dateRange}</span>
          <span class="plan-week-progress" title="${done}/${total} voltooid">
            <span class="plan-week-progress-fill" style="width:${pct}%"></span>
          </span>
          <span>${done}/${total}</span>
          <span class="plan-week-chev">▶</span>
        </div>
      </header>
      <div class="plan-week-body">
        ${days.map((d) => renderPlanDayRow(d, todayIso)).join("")}
      </div>
    `;
    container.appendChild(wkEl);
  });

  // update top-level progress
  const totalDone = planData.filter((d) => {
    const p = state.planProgress[d.day];
    return p && p.read && p.write;
  }).length;
  const totalPct = Math.round((totalDone / planData.length) * 100);
  $("#plan-progress-fill").style.width = totalPct + "%";
  $("#plan-progress-text").textContent = `${totalDone} / ${planData.length} dagen voltooid (${totalPct}%)`;
}

function renderPlanDayRow(d, todayIso) {
  const isToday = d.date === todayIso;
  const isOpen = state.expandedDays.has(d.day);
  const p = state.planProgress[d.day] || { read: false, write: false };
  const writing = state.planWriting[d.day] || "";

  return `
    <article class="plan-day ${isOpen ? "open" : ""} ${isToday ? "is-today" : ""}" data-day="${d.day}">
      <div class="plan-day-row" data-action="toggle-day">
        <span class="plan-day-chev">▶</span>
        <span class="plan-day-num">${String(d.day).padStart(2,"0")}</span>
        <span class="plan-day-date">${escapeHtml(d.dateLabel)}</span>
        <span class="plan-day-theme">${escapeHtml(d.theme)}</span>
        <span class="plan-day-checks">
          <span class="plan-day-check ${p.read ? "done" : ""}" title="lezen"></span>
          <span class="plan-day-check ${p.write ? "done" : ""}" title="schrijven"></span>
        </span>
      </div>
      <div class="plan-day-detail">
        <div class="plan-day-section">
          <header class="plan-day-section-h">
            <span class="day-tag">lezen</span>
            <label class="check-inline">
              <input type="checkbox" data-day-check="read" data-day="${d.day}" ${p.read ? "checked" : ""}/>
              <span>voltooid</span>
            </label>
          </header>
          <p>${escapeHtml(d.read)}</p>
        </div>
        <div class="plan-day-section">
          <header class="plan-day-section-h">
            <span class="day-tag">schrijven</span>
            <label class="check-inline">
              <input type="checkbox" data-day-check="write" data-day="${d.day}" ${p.write ? "checked" : ""}/>
              <span>voltooid</span>
            </label>
          </header>
          <p>${escapeHtml(d.write)}</p>
          <textarea
            class="plan-day-textarea"
            data-day-textarea="${d.day}"
            placeholder="Schrijf hier je antwoord. Wordt automatisch opgeslagen."
            spellcheck="true"
          >${escapeHtml(writing)}</textarea>
        </div>
      </div>
    </article>
  `;
}

function togglePlanWeek(wk) {
  if (state.expandedWeeks.has(wk)) state.expandedWeeks.delete(wk);
  else state.expandedWeeks.add(wk);
  // update DOM
  const el = $(`.plan-week[data-week="${wk}"]`);
  if (el) el.classList.toggle("open");
}

function togglePlanDay(dayNum) {
  if (state.expandedDays.has(dayNum)) state.expandedDays.delete(dayNum);
  else state.expandedDays.add(dayNum);
  const el = $(`.plan-day[data-day="${dayNum}"]`);
  if (el) el.classList.toggle("open");
}

function setDayCheck(dayNum, kind, checked) {
  if (!state.planProgress[dayNum]) state.planProgress[dayNum] = { read: false, write: false };
  state.planProgress[dayNum][kind] = checked;
  store.savePlanProgress(state.planProgress);
  // update visual check pill in row + weekly progress bar
  const dayEl = $(`.plan-day[data-day="${dayNum}"]`);
  if (dayEl) {
    const checks = dayEl.querySelectorAll(".plan-day-check");
    const titles = ["lezen","schrijven"];
    checks.forEach((c, i) => {
      const k = titles[i] === "lezen" ? "read" : "write";
      c.classList.toggle("done", !!state.planProgress[dayNum][k]);
    });
  }
  // update week progress
  const d = planData.find((x) => x.day === dayNum);
  if (d) {
    const { done, total } = planWeekProgress(d.week);
    const wkEl = $(`.plan-week[data-week="${d.week}"]`);
    if (wkEl) {
      const fill = wkEl.querySelector(".plan-week-progress-fill");
      const txt  = wkEl.querySelector(".plan-week-meta span:nth-child(3)");
      if (fill) fill.style.width = (total ? Math.round(done/total*100) : 0) + "%";
      if (txt)  txt.textContent = `${done}/${total}`;
    }
  }
  // update top-level
  const totalDone = planData.filter((d) => {
    const p = state.planProgress[d.day];
    return p && p.read && p.write;
  }).length;
  const totalPct = Math.round((totalDone / planData.length) * 100);
  $("#plan-progress-fill").style.width = totalPct + "%";
  $("#plan-progress-text").textContent = `${totalDone} / ${planData.length} dagen voltooid (${totalPct}%)`;
  updatePlanBadge();
}

function savePlanWriting(dayNum, text) {
  state.planWriting[dayNum] = text;
  store.savePlanWriting(state.planWriting);
}

function jumpToToday() {
  const today = getTodayPlanDay();
  if (!today) {
    showToast("Vandaag valt buiten de routine-periode");
    return;
  }
  state.expandedWeeks.add(today.week);
  state.expandedDays.add(today.day);
  renderPlan();
  setTimeout(() => {
    const el = $(`.plan-day[data-day="${today.day}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 60);
}

function expandAllWeeks() {
  for (let w = 1; w <= 10; w++) state.expandedWeeks.add(w);
  renderPlan();
}

function collapseAllWeeks() {
  state.expandedWeeks.clear();
  state.expandedDays.clear();
  renderPlan();
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

  $("#stat-total").textContent = total;
  $("#stat-due").textContent = due;
  $("#stat-new").textContent = newCount;
  $("#stat-mature").textContent = mature;
  $("#stat-streak").textContent = streakCount;
  $("#stat-reviews").textContent = reviewsToday;

  // plan stats
  let planDaysDone = 0, planReadDone = 0, planWriteDone = 0;
  for (const d of planData) {
    const p = state.planProgress[d.day];
    if (p) {
      if (p.read) planReadDone++;
      if (p.write) planWriteDone++;
      if (p.read && p.write) planDaysDone++;
    }
  }
  let totalWords = 0;
  for (const k in state.planWriting) {
    const txt = (state.planWriting[k] || "").trim();
    if (!txt) continue;
    totalWords += txt.split(/\s+/).length;
  }
  $("#stat-plan-days").textContent = planDaysDone;
  $("#stat-plan-read").textContent = planReadDone;
  $("#stat-plan-write").textContent = planWriteDone;
  $("#stat-plan-words").textContent = totalWords;
}

/* ---------- badges ---------- */
function updateDueBadge() {
  const due = state.words.filter((w) => isDue(w)).length;
  const badge = $("#due-badge");
  badge.textContent = due;
  badge.setAttribute("data-count", due);
}

function updatePlanBadge() {
  const done = planData.filter((d) => {
    const p = state.planProgress[d.day];
    return p && p.read && p.write;
  }).length;
  $("#plan-badge").textContent = `${done}/${planData.length}`;
}

/* ---------- export / import ---------- */
function exportJson() {
  const data = {
    version: 2,
    exportedAt: new Date().toISOString(),
    words: state.words,
    streak: state.streak,
    planProgress: state.planProgress,
    planWriting: state.planWriting,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `thesis-companion-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Geëxporteerd");
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      // words (back-compat with v1 woorden export)
      const incoming = Array.isArray(data) ? data : data.words || [];
      const existing = new Set(state.words.map((w) => (w.nl||"").toLowerCase()));
      let added = 0;
      for (const w of incoming) {
        if (!w.nl) continue;
        if (existing.has(w.nl.toLowerCase())) continue;
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

      // optionally merge plan data if present
      if (data.planProgress) {
        Object.assign(state.planProgress, data.planProgress);
        store.savePlanProgress(state.planProgress);
      }
      if (data.planWriting) {
        Object.assign(state.planWriting, data.planWriting);
        store.savePlanWriting(state.planWriting);
      }
      renderStats();
      updateDueBadge();
      updatePlanBadge();
      showToast(`${added} woord${added === 1 ? "" : "en"} geïmporteerd`);
    } catch (err) {
      showToast("Kon bestand niet lezen");
      console.error(err);
    }
  };
  reader.readAsText(file);
}

function resetWords() {
  if (!confirm("Alle woorden wissen? Dit kan niet ongedaan gemaakt worden.")) return;
  if (!confirm("Heel zeker? Maak eerst een export voor de zekerheid.")) return;
  state.words = [];
  state.streak = { count: 0, lastDate: null, reviewsToday: 0, reviewsDate: null };
  store.save(state.words);
  store.saveStreak(state.streak);
  renderStats();
  updateDueBadge();
  showToast("Woorden gewist");
}

function resetPlan() {
  if (!confirm("Plan-voortgang en alle geschreven antwoorden wissen?")) return;
  state.planProgress = {};
  state.planWriting = {};
  store.savePlanProgress(state.planProgress);
  store.savePlanWriting(state.planWriting);
  renderStats();
  updatePlanBadge();
  showToast("Plan-voortgang gewist");
}

/* ---------- events ---------- */
function bindEvents() {
  $$(".tab").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
  $$('[data-go]').forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.go)));

  // review
  $("#btn-show").addEventListener("click", flipCard);
  $$('[data-rate]').forEach((b) => b.addEventListener("click", () => rateCard(b.dataset.rate)));

  // form
  $("#form-new").addEventListener("submit", handleSubmit);
  $("#btn-cancel-edit").addEventListener("click", () => { prepareNewForm(); switchTab("lijst"); });

  // list
  $("#search").addEventListener("input", (e) => { state.searchQuery = e.target.value; renderList(); });
  $("#word-tbody").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    if (btn.dataset.act === "edit") prepareEditForm(btn.dataset.id);
    else if (btn.dataset.act === "del") deleteWord(btn.dataset.id);
  });

  // vandaag
  $("#vandaag-read-done").addEventListener("change", () => toggleVandaagDone("read"));
  $("#vandaag-write-done").addEventListener("change", () => toggleVandaagDone("write"));
  $("#vandaag-textarea").addEventListener("input", updateVandaagWordcount);
  $("#vandaag-textarea").addEventListener("blur", saveVandaagWriting);
  // also save periodically while typing
  let saveTimer = null;
  $("#vandaag-textarea").addEventListener("input", () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveVandaagWriting, 1500);
  });

  // plan: delegated event handling
  $("#plan-weeks").addEventListener("click", (e) => {
    // ignore clicks inside textareas/inputs
    if (e.target.matches("textarea, input")) return;
    const dayRow = e.target.closest("[data-action=toggle-day]");
    if (dayRow) {
      const dayNum = +dayRow.closest(".plan-day").dataset.day;
      togglePlanDay(dayNum);
      return;
    }
    const wkHeader = e.target.closest("[data-action=toggle-week]");
    if (wkHeader) {
      const wk = +wkHeader.closest(".plan-week").dataset.week;
      togglePlanWeek(wk);
      return;
    }
  });
  $("#plan-weeks").addEventListener("change", (e) => {
    const checkbox = e.target.closest("[data-day-check]");
    if (checkbox) {
      const dayNum = +checkbox.dataset.day;
      const kind = checkbox.dataset.dayCheck;
      setDayCheck(dayNum, kind, checkbox.checked);
      // if today, also refresh vandaag panel checkboxes when user revisits
    }
  });
  // textarea autosave inside plan
  let planSaveTimers = {};
  $("#plan-weeks").addEventListener("input", (e) => {
    const ta = e.target.closest("[data-day-textarea]");
    if (!ta) return;
    const dayNum = +ta.dataset.dayTextarea;
    clearTimeout(planSaveTimers[dayNum]);
    planSaveTimers[dayNum] = setTimeout(() => {
      savePlanWriting(dayNum, ta.value);
    }, 800);
  });
  $("#plan-weeks").addEventListener("blur", (e) => {
    const ta = e.target.closest("[data-day-textarea]");
    if (!ta) return;
    savePlanWriting(+ta.dataset.dayTextarea, ta.value);
  }, true);

  $("#plan-jump-today").addEventListener("click", jumpToToday);
  $("#plan-expand-all").addEventListener("click", expandAllWeeks);
  $("#plan-collapse-all").addEventListener("click", collapseAllWeeks);

  // stats / backup
  $("#btn-export").addEventListener("click", exportJson);
  $("#btn-import").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", (e) => {
    if (e.target.files[0]) importJson(e.target.files[0]);
    e.target.value = "";
  });
  $("#btn-reset-words").addEventListener("click", resetWords);
  $("#btn-reset-plan").addEventListener("click", resetPlan);

  // keyboard shortcuts (only when not typing)
  document.addEventListener("keydown", (e) => {
    const t = e.target;
    if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
    if (state.currentTab === "herhalen" && state.currentCard) {
      if (e.code === "Space") {
        e.preventDefault();
        if (!state.cardShowingBack) flipCard();
        return;
      }
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

/* ---------- init ---------- */
function init() {
  bindEvents();
  updateDueBadge();
  updatePlanBadge();
  switchTab("vandaag");
}
init();
