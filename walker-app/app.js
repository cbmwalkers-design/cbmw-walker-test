// CBMW Walker App: read-only view of the Walk Programme.
// Reads the same Firebase database as the planner. Never writes: this file imports only read functions.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, onValue, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { firebaseConfig } from "../apps/firebase-config.js";
import * as C from "../shared/cbmw-common.js";

/* ========================================================= STATE ========================================================= */

const state = {
  db: null,
  bookings: {},          // walk_bookings
  social: {},            // social_events (summer walks and social events)
  masterWalks: {},       // walks (master routes)
  leaders: [],           // leader_names (names only; contact details are read per booking)
  pdfFlags: new Set(),   // walk_pdf_flags
  contacts: new Map(),   // leader_contacts/{key}, cached
  contactPending: new Set(),
  photos: new Map(),     // walk_photos/{key} or the walk's Image_URL, cached
  photoPending: new Set(),
  mode: "list",          // list | month | day
  day: "",               // ISO date for day mode
  month: startOfMonth(new Date()),
  grade: "ALL",
  search: "",
  open: null,            // { kind: "walk" | "social", key }
  live: false,           // true once the database has answered during this visit
  savedAt: null,         // when the offline copy on this device was last written
};

/* ========================================================= HELPERS ========================================================= */

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");
const esc = C.escapeHtml;
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const dmyToIso = (dmy) => { const p = String(dmy || "").split("-"); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : ""; };
const walkIdOf = (r) => String(r?.walk_number || r?.walk_id || "");
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }

function setStatus(message) { $("status").textContent = message || ""; }

/* ========================================================= OFFLINE COPY =========================================================
   The database SDK keeps nothing between visits, so a copy of the programme is kept in localStorage.
   It is written after each live update and read back when the app opens, so it works with no signal.
   Photos and PDF/GPX files are not copied: they need a connection. */

const SNAPSHOT_KEY = "cbmw-walker-snapshot-v1";
let saveTimer = null;

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSnapshot, 500);
}

function saveSnapshot() {
  const snapshot = {
    savedAt: new Date().toISOString(),
    bookings: state.bookings,
    social: state.social,
    masterWalks: state.masterWalks,
    leaders: state.leaders,
    pdfFlags: [...state.pdfFlags],
    contacts: Object.fromEntries(state.contacts),
  };
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
    state.savedAt = snapshot.savedAt;
  } catch (err) {
    console.error("Offline copy not saved:", err);
    setStatus("The offline copy could not be saved: this device's storage is full.");
  }
}

// Returns true when a copy was found and loaded
function loadSnapshot() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    state.bookings = s.bookings || {};
    state.social = s.social || {};
    state.masterWalks = s.masterWalks || {};
    state.leaders = s.leaders || [];
    state.pdfFlags = new Set(s.pdfFlags || []);
    state.contacts = new Map(Object.entries(s.contacts || {}));
    state.savedAt = s.savedAt || null;
    return true;
  } catch (err) {
    console.error("Offline copy could not be read:", err);
    return false;
  }
}

function describeSavedAt() {
  if (!state.savedAt) return "";
  return new Date(state.savedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function leaderName(l) {
  if (!l) return "";
  return String(l.display_name || "").trim() || `${l.first_name || ""} ${l.surname || ""}`.trim();
}
function findLeader(id) {
  return state.leaders.find((l) => String(l.leader_id) === String(id)) || null;
}
function leaderIdsOf(record) {
  if (Array.isArray(record.leader_ids) && record.leader_ids.length) return record.leader_ids;
  return record.leader_id ? [record.leader_id] : [];
}
function leaderNamesFor(record) {
  return leaderIdsOf(record).map((id) => leaderName(findLeader(id))).filter(Boolean);
}

function masterOf(record) {
  const key = C.masterWalkKey(walkIdOf(record), state.masterWalks);
  return key ? state.masterWalks[key] : null;
}

function entryName(e) {
  if (e.kind === "social") return e.record.title || (e.record.type === "summer" ? "Summer walk" : "Social event");
  return C.getMasterRouteName(masterOf(e.record)) || e.record.walk_name || (walkIdOf(e.record) ? `Walk ${walkIdOf(e.record)}` : "Untitled walk");
}

// Plain-text stat for list rows: "7 km"
function plainStat(v, unit) {
  const t = String(v ?? "").trim();
  if (!t) return "";
  return /[a-z]/i.test(t) ? t : `${t} ${unit}`;
}

function entryMeta(e) {
  if (e.kind === "social") {
    const place = e.record.type === "summer" ? e.record.meeting_point : e.record.location;
    return [place, e.record.leader].filter(Boolean).join(" · ");
  }
  const route = C.bookingRoute(e.record, state.masterWalks) || {};
  return [leaderNamesFor(e.record).join(", "), plainStat(route.Distance, "km"), plainStat(route.Ascent, "m")]
    .filter(Boolean).join(" · ");
}

/* ========================================================= DATA ========================================================= */

// Live walks and published social events/summer walks, in date and time order.
// Drafts are never shown to walkers. Cancelled walks stay visible, marked as cancelled.
function buildEntries() {
  const walks = Object.entries(state.bookings)
    .filter(([, r]) => r && C.bookingStatus(r) === "live")
    .map(([key, r]) => ({ kind: "walk", key, record: r, iso: dmyToIso(r.date), time: r.start_time || "", grade: r.walk_grade || "" }));
  const socials = Object.entries(state.social)
    .filter(([, r]) => r && !C.socialIsDraft(r))
    .map(([key, r]) => ({ kind: "social", key, record: r, iso: dmyToIso(r.date), time: r.start_time || "", grade: r.type === "summer" ? "SUMMER" : "SOCIAL" }));
  return [...walks, ...socials].sort((a, b) =>
    a.iso.localeCompare(b.iso) || a.time.localeCompare(b.time) || a.key.localeCompare(b.key));
}

// Applies the mode and the search to entries that already passed the grade filter
function visibleEntries(all) {
  const today = isoOf(new Date());
  const q = state.search.trim().toLowerCase();
  return all.filter((e) => {
    if (state.mode === "list" && e.iso < today) return false;
    if (state.mode === "month" && e.iso.slice(0, 7) !== monthKey(state.month)) return false;
    if (state.mode === "day" && e.iso !== state.day) return false;
    if (q) {
      const route = e.kind === "walk" ? C.bookingRoute(e.record, state.masterWalks) : null;
      const hay = [entryName(e), entryMeta(e), route?.Route_Description, e.record.pueblo, e.record.description]
        .join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/* ========================================================= LIST AND MONTH ========================================================= */

// Small inline icons for the row's stats line
const ROW_ICON = {
  grade: '<path d="M3 20l6-10 4 6 3-4 5 8z"/>',
  distance: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  ascent: '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>',
  duration: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
function statChip(icon, textHtml, cls = "") {
  return `<span class="${cls}"><svg viewBox="0 0 24 24" aria-hidden="true">${ROW_ICON[icon]}</svg>${textHtml}</span>`;
}

function rowHtml(e) {
  const cancelled = C.isCancelled(e.record);
  const changed = !cancelled && e.record.modified === true;
  const isWalk = e.kind === "walk";
  const rec = e.record;
  const route = isWalk ? (C.bookingRoute(rec, state.masterWalks) || {}) : {};
  const grade = isWalk ? (C.getMasterRouteGrade(route) || e.grade) : "";
  // Walks: the colour badge carries the grade letter only. Social events and summer walks keep their type badge.
  const slot = isWalk
    ? `<span class="badge grade-${esc(grade)} row-grade">${esc(grade || "–")}</span>`
    : `<span class="badge ${e.grade === "SUMMER" ? "summer" : "social"}">${e.grade === "SUMMER" ? "Summer" : "Social"}</span>`;
  // Stats line: Grade/Terrain/Scr/X (Scr and X only when recorded), distance, ascent, duration
  const gradeLine = isWalk
    ? [grade, String(route.Terrain ?? "").trim(), String(route.Scr ?? "").trim(), C.xFlag(route)].filter(Boolean).join(" / ")
    : "";
  const distance = plainStat(isWalk ? route.Distance : rec.distance, "km");
  const ascent = plainStat(isWalk ? route.Ascent : rec.ascent, "m");
  const durationRaw = isWalk ? route.Total_Time : rec.duration;
  const stats = [
    gradeLine ? statChip("grade", esc(gradeLine), "stat-grade") : "",
    distance ? statChip("distance", esc(distance)) : "",
    ascent ? statChip("ascent", esc(ascent)) : "",
    String(durationRaw ?? "").trim() ? statChip("duration", C.statDuration(durationRaw)) : "",
  ].filter(Boolean).join("");
  const desc = String((isWalk ? route.Route_Description : rec.description) ?? "").trim();
  return `
    <button type="button" class="row${cancelled ? " is-cancelled" : ""}" data-kind="${e.kind}" data-key="${esc(e.key)}">
      <span class="row-when">
        <span class="row-time">${esc(C.formatTime12(e.time) || "–")}</span>
        ${slot}
      </span>
      <span class="row-main">
        <span class="row-name">${esc(entryName(e))}</span>
        ${cancelled ? `<span class="cancelled-badge">Cancelled</span>` : ""}
        ${changed ? `<span class="modified-chip">Changed</span>` : ""}
        ${stats ? `<span class="row-stats">${stats}</span>` : ""}
        ${!isWalk && entryMeta(e) ? `<span class="row-meta">${esc(entryMeta(e))}</span>` : ""}
        ${desc ? `<span class="row-desc">${esc(desc)}</span>` : ""}
      </span>
    </button>`;
}

function renderList(entries) {
  const host = $("list-view");
  if (!entries.length) {
    host.innerHTML = `<p class="empty">${state.mode === "day" ? "No walks on this day." : "No walks match these filters."}</p>`;
    return;
  }
  let lastIso = null;
  let html = "";
  for (const e of entries) {
    if (e.iso !== lastIso) {
      if (lastIso !== null) html += `</section>`;
      lastIso = e.iso;
      html += `<section class="date-group"><h2>${esc(C.formatWalkDate(e.record.date))}</h2>`;
    }
    html += rowHtml(e);
  }
  host.innerHTML = html + `</section>`;
}

function renderMonth(all) {
  const first = state.month;
  const y = first.getFullYear(), m = first.getMonth();
  const todayIso = isoOf(new Date());
  $("month-title").textContent = first.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const grid = $("month-grid");
  let html = "";
  for (let i = 0; i < new Date(y, m, 1).getDay(); i++) html += `<span class="cell empty" aria-hidden="true"></span>`;
  const days = new Date(y, m + 1, 0).getDate();
  for (let d = 1; d <= days; d++) {
    const iso = `${y}-${pad(m + 1)}-${pad(d)}`;
    const items = all.filter((e) => e.iso === iso);
    const dots = items.slice(0, 4).map((e) => {
      const cls = e.kind === "walk" ? `grade-${e.grade}` : (e.grade === "SUMMER" ? "summer" : "social");
      return `<span class="dot ${cls}"></span>`;
    }).join("");
    const label = `${d} ${first.toLocaleDateString("en-GB", { month: "long" })}${items.length ? `, ${items.length} item${items.length === 1 ? "" : "s"}` : ""}`;
    html += `<button type="button" class="cell${iso === todayIso ? " today" : ""}${items.length ? " has-walks" : ""}" data-iso="${iso}" aria-label="${esc(label)}">
      <span class="num">${d}</span><span class="dots">${dots}</span></button>`;
  }
  grid.innerHTML = html;
}

function refresh() {
  const all = buildEntries().filter((e) => state.grade === "ALL" || e.grade === state.grade);
  const visible = visibleEntries(all);
  renderList(visible);
  if (state.mode === "month") renderMonth(all);
  $("count").textContent = `${visible.length} ${visible.length === 1 ? "item" : "items"}`;
}

function setMode(mode, day) {
  state.mode = mode;
  if (day) state.day = day;
  if (mode === "day" && !state.day) state.day = isoOf(new Date());
  document.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  $("day-pick").hidden = mode !== "day";
  $("day-input").value = state.day;
  $("month-view").hidden = mode !== "month";
  refresh();
}

/* ========================================================= DETAIL CARD ========================================================= */

// Leader lines with phone numbers. Contacts are read on demand; the card is redrawn when they arrive.
function requestContact(key) {
  if (!key || state.contacts.has(key) || state.contactPending.has(key)) return;
  state.contactPending.add(key);
  get(ref(state.db, "leader_contacts/" + key))
    .then((snap) => {
      // A failed read is not stored, so the saved contact is never replaced with an empty one
      state.contacts.set(key, snap.exists() ? snap.val() : {});
      scheduleSave();
    })
    .catch(() => {})
    .finally(() => {
      state.contactPending.delete(key);
      if (state.open) renderDetail();
    });
}

function leaderLinesHtml(record) {
  const keys = Array.isArray(record.leader_keys) ? record.leader_keys : [];
  if (keys.length) {
    keys.forEach(requestContact);
    return keys
      .map((k) => state.contacts.get(k))
      .filter((c) => c && Object.keys(c).length)
      .map((c) => `<div class="leader-line leader-entry">${C.leaderContactHtml(c)}</div>`)
      .join("");
  }
  return leaderIdsOf(record)
    .map((id) => findLeader(id))
    .filter(Boolean)
    .map((l) => `<div class="leader-line leader-entry">${C.leaderContactHtml(l)}</div>`)
    .join("");
}

function hydratePhotos() {
  document.querySelectorAll("#detail [data-photo-key]").forEach((el) => {
    const k = el.dataset.photoKey;
    if (state.photos.has(k)) return applyPhoto(el, state.photos.get(k));
    if (state.photoPending.has(k)) return;
    state.photoPending.add(k);
    const linked = state.masterWalks[k]?.Image_URL ? String(state.masterWalks[k].Image_URL) : "";
    get(ref(state.db, "walk_photos/" + k))
      .then((snap) => { const v = snap.val(); return v && v.data ? String(v.data) : linked; })
      .catch(() => linked)
      .then((src) => {
        state.photos.set(k, src);
        document.querySelectorAll(`#detail [data-photo-key="${CSS.escape(k)}"]`).forEach((n) => applyPhoto(n, src));
      })
      .finally(() => state.photoPending.delete(k));
  });
}

function applyPhoto(el, src) {
  if (!src) return;
  const img = new Image();
  img.alt = "";
  img.loading = "lazy";
  img.onerror = () => { el.replaceChildren(); el.style.display = "none"; };
  img.src = src;
  el.replaceChildren(img);
  el.style.display = "";
}

function renderDetail() {
  if (!state.open) return;
  const { kind, key } = state.open;
  const card = $("detail");

  if (kind === "social") {
    const rec = state.social[key];
    if (!rec) return closeDetail();
    card.innerHTML = C.socialCardHtml(rec, key);
    return;
  }

  const rec = state.bookings[key];
  if (!rec) return closeDetail();
  const walkId = walkIdOf(rec);
  const route = C.bookingRoute(rec, state.masterWalks);
  const masterKey = C.masterWalkKey(walkId, state.masterWalks);
  const master = masterKey ? state.masterWalks[masterKey] : null;
  const hasPdf = !!walkId && (state.pdfFlags.has(walkId) || String(route?.PDF_Name ?? "").trim() !== "");

  card.innerHTML =
    C.walkCardHeaderHtml({ name: C.getMasterRouteName(master) || rec.walk_name, date: rec.date, startTime: rec.start_time }) +
    C.walkCardBodyHtml({
      record: rec,
      route,
      walkId,
      leaderHtml: leaderLinesHtml(rec),
      leaderText: leaderNamesFor(rec).join(", "),
      hasPdf,
      pdfName: route?.PDF_Name,
      gpxName: route?.GPX_Name,
      photoKey: masterKey,
      pueblo: rec.pueblo,
      showPueblo: false,
    });
  hydratePhotos();
}

function openEntry(kind, key) {
  state.open = { kind, key };
  renderDetail();
  if (!state.open) return;
  $("overlay").classList.add("active");
  document.body.classList.add("modal-open");
  $("detail").scrollTop = 0;
}

function closeDetail() {
  state.open = null;
  $("overlay").classList.remove("active");
  document.body.classList.remove("modal-open");
}

// Downloads: the files stay in the database and are fetched only when asked for
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadPdf(walkId, fallbackName) {
  const snap = await get(ref(state.db, "walk_pdfs/" + walkId));
  const file = snap.val();
  if (!file || !file.data) return alert("The full walk description could not be found.");
  const a = document.createElement("a");
  a.href = file.data;
  a.download = file.name || fallbackName || "walk-description.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function downloadGpx(walkId, fallbackName) {
  const snap = await get(ref(state.db, "walk_gpx/" + walkId));
  const file = snap.val();
  if (!file || !file.text) return alert("The GPX file could not be found.");
  saveBlob(new Blob([file.text], { type: "application/gpx+xml" }), file.name || fallbackName || "route.gpx");
}

function renderLevelsDialog() {
  // Grade names only; the full grade definitions are in the Walk Programme PDF.
  const dialog = $("levels-dialog");
  if (dialog.open) return;
  dialog.showModal();
}

/* ========================================================= DATA LISTENERS (read only) ========================================================= */

function listen() {
  onValue(ref(state.db, "walk_bookings"), (snap) => {
    state.bookings = snap.val() || {};
    state.live = true;
    setStatus("");
    refresh();
    if (state.open) renderDetail();
    scheduleSave();
  }, () => setStatus(state.savedAt
    ? `Showing the copy saved ${describeSavedAt()}. The live programme could not be reached.`
    : "The walk list could not be loaded. Check your connection and reload."));

  onValue(ref(state.db, "social_events"), (snap) => {
    state.social = snap.val() || {};
    refresh();
    if (state.open) renderDetail();
    scheduleSave();
  }, (err) => console.error("Social events not loaded:", err));

  onValue(ref(state.db, "walks"), (snap) => {
    state.masterWalks = snap.val() || {};
    refresh();
    if (state.open) renderDetail();
    scheduleSave();
  }, (err) => console.error("Master walks not loaded:", err));

  onValue(ref(state.db, "walk_pdf_flags"), (snap) => {
    state.pdfFlags = new Set(Object.keys(snap.val() || {}));
    if (state.open) renderDetail();
    scheduleSave();
  }, (err) => console.error("PDF flags not loaded:", err));

  // Names only, as the planner's walker view reads them
  onValue(ref(state.db, "leader_names"), (snap) => {
    state.leaders = Object.values(snap.val() || {}).filter(Boolean)
      .sort((a, b) => Number(a.leader_id) - Number(b.leader_id));
    refresh();
    if (state.open) renderDetail();
    scheduleSave();
  }, (err) => console.error("Leader names not loaded:", err));
}

/* ========================================================= EVENTS ========================================================= */

function wireEvents() {
  document.querySelectorAll("[data-mode]").forEach((b) =>
    b.addEventListener("click", () => setMode(b.dataset.mode)));

  $("day-input").addEventListener("change", (e) => {
    if (!e.target.value) return;
    state.day = e.target.value;
    refresh();
  });
  $("grade-filter").addEventListener("change", (e) => { state.grade = e.target.value; refresh(); });
  $("search").addEventListener("input", (e) => { state.search = e.target.value; refresh(); });

  $("prev-month").addEventListener("click", () => {
    state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1);
    refresh();
  });
  $("next-month").addEventListener("click", () => {
    state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1);
    refresh();
  });

  $("list-view").addEventListener("click", (e) => {
    const row = e.target.closest("button.row");
    if (row) openEntry(row.dataset.kind, row.dataset.key);
  });
  $("month-grid").addEventListener("click", (e) => {
    const cell = e.target.closest("[data-iso]");
    if (cell) setMode("day", cell.dataset.iso);
  });

  $("overlay").addEventListener("click", (e) => {
    if (e.target === $("overlay") || e.target.closest("[data-action='close']")) closeDetail();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDetail(); });

  // Links inside the cards
  document.addEventListener("click", async (e) => {
    if (e.target.closest("[data-open-levels]")) { e.preventDefault(); renderLevelsDialog(); return; }
    const pdf = e.target.closest("[data-pdf-download]");
    const gpx = e.target.closest("[data-gpx-download]");
    try {
      if (pdf) { e.preventDefault(); await downloadPdf(pdf.dataset.pdfDownload, pdf.dataset.pdfName); }
      if (gpx) { e.preventDefault(); await downloadGpx(gpx.dataset.gpxDownload, gpx.dataset.gpxName); }
    } catch (err) {
      console.error("Download failed:", err);
      alert("The file could not be downloaded. Check your connection and try again.");
    }
  });
  $("levels-dialog").addEventListener("click", (e) => {
    if (e.target.closest("[data-close-levels]") || e.target === $("levels-dialog")) $("levels-dialog").close();
  });

  window.addEventListener("offline", () => setStatus(state.savedAt
    ? `You are offline. Showing the copy saved ${describeSavedAt()}.`
    : "You are offline. No walk programme is saved on this device yet."));
  window.addEventListener("online", () => setStatus(""));
}

/* ========================================================= START ========================================================= */

async function start() {
  const app = initializeApp(firebaseConfig, "cbmw-walker");
  state.db = getDatabase(app);
  // Show the saved copy straight away; live data replaces it when it arrives
  if (loadSnapshot()) {
    refresh();
    setStatus(`Showing the copy saved ${describeSavedAt()}. Connecting to the live programme…`);
  } else if (!navigator.onLine) {
    setStatus("No walk programme is saved on this device yet. Connect once to save it.");
  }
  try {
    await signInAnonymously(getAuth(app));
  } catch (err) {
    // A returning device may still have a cached sign-in; the listeners below report anything that fails
    console.error("Sign-in failed:", err);
  }
  listen();
}

wireEvents();
setMode("list");
start().catch((err) => {
  console.error("Walker app could not start:", err);
  setStatus("The walk programme could not be started. Check your connection and reload.");
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch((err) => console.warn("Offline support not available:", err));
}
