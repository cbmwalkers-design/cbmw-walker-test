// cbmw-common.js
// Formatting, master-walk lookup and popup markup shared by the Walk Planner (CBMW-Walk-Scheduler.js)
// and the Walker App (/cbmw/walker-app/).
//
// Everything here is pure: no Firebase, no globals, no DOM lookups. Callers pass in the data they hold
// (bookings, master walks, leader details) and receive HTML strings or plain values back.

/* ========================================================= ESCAPING ========================================================= */

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* ========================================================= DATES AND TIMES =========================================================
   Walk dates are stored as DD-MM-YYYY (the calendar key format). Start times are HH:MM. */

// "14-10-2026" -> Date (local midnight), or null
export function convertDate(dateString) {
  if (!dateString) return null;
  const parts = String(dateString).split("-");
  if (parts.length !== 3) return null;
  return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
}

export function isPastDate(dateString) {
  const d = convertDate(dateString);
  if (!d) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

// "14-10-2026" -> "Wed 14 Oct 26"
export function tableDate(dateString) {
  const d = convertDate(dateString);
  if (!d) return dateString || "-";
  const wd = d.toLocaleDateString("en-GB", { weekday: "short" });
  const rest = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
  return `${wd} ${rest}`;
}

// "14-10-2026" -> "Wednesday 14 Oct 2026"
export function formatWalkDate(dateString) {
  const d = convertDate(dateString);
  if (!d) return dateString || "";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
}

// "14-10-2026" -> { wd: "Wed", day: "14 Oct" } for the list badge
export function walkerBadgeDate(dateString) {
  const d = convertDate(dateString);
  if (!d) return { wd: "", day: dateString || "-" };
  return {
    wd: d.toLocaleDateString("en-GB", { weekday: "short" }),
    day: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
  };
}

// "14:30" -> "2:30 pm"
export function formatTime12(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || "").trim());
  if (!m) return String(t || "");
  const h = Number(m[1]);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${h < 12 ? "am" : "pm"}`;
}

// "9:05" -> "09:05"
export function formatStartTime(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || "").trim());
  if (!m) return String(t || "");
  return `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
}

/* ========================================================= POPUP STAT FORMATTING ========================================================= */

// "7" -> "7 km"; values that already carry a unit are kept as they are
export function statUnit(v, unit) {
  const t = String(v ?? "").trim();
  if (!t) return "–";
  return escapeHtml(/[a-z]/i.test(t) ? t : `${t} ${unit}`);
}

// "03:00" -> "3h", "02:30" -> "2h 30m"
export function statDuration(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? "").trim());
  if (!m) return String(v ?? "").trim() ? escapeHtml(String(v).trim()) : "–";
  const h = Number(m[1]), mi = Number(m[2]);
  return escapeHtml([h ? `${h}h` : "", mi ? `${mi}m` : ""].filter(Boolean).join(" ") || String(v).trim());
}

// Experienced-walkers attribute, shown as a bare "X" when recorded
export function xFlag(route) {
  return String(route?.X ?? "").trim() ? "X" : "";
}

/* ========================================================= MASTER WALKS =========================================================
   The master walks database is passed in as `masterWalks` (an object keyed by walk id, e.g. "walk_610"). */

// Walk numbers are typed without the prefix: "610" means "walk_610". Other values are returned unchanged.
export function normaliseWalkNumber(value, masterWalks) {
  const s = String(value ?? "").trim();
  if (!/^\d+$/.test(s)) return s;
  const prefixed = `walk_${s}`;
  if (Object.prototype.hasOwnProperty.call(masterWalks || {}, s) && !Object.prototype.hasOwnProperty.call(masterWalks || {}, prefixed)) return s;
  return prefixed;
}

export function getMasterWalk(walkId, masterWalks) {
  if (walkId === undefined || walkId === null) return null;
  const key = normaliseWalkNumber(walkId, masterWalks);
  if (!key) return null;
  if (masterWalks && Object.prototype.hasOwnProperty.call(masterWalks, key)) return masterWalks[key];
  const hit = Object.entries(masterWalks || {}).find(([id, walk]) =>
    String(id).trim() === key ||
    String(walk?.Walk_ID ?? walk?.walkid ?? walk?.Walk_Number ?? "").trim() === key);
  return hit ? hit[1] : null;
}

// The database key of the master walk for a walk id, or "" when there is none
export function masterWalkKey(walkId, masterWalks) {
  const key = normaliseWalkNumber(walkId, masterWalks);
  if (!key) return "";
  if (masterWalks && Object.prototype.hasOwnProperty.call(masterWalks, key)) return key;
  const hit = Object.entries(masterWalks || {}).find(([id, walk]) =>
    String(id).trim() === key ||
    String(walk?.Walk_ID ?? walk?.walkid ?? walk?.Walk_Number ?? "").trim() === key);
  return hit ? hit[0] : "";
}

export function getMasterRouteName(walk) {
  return String(walk?.Route_Name ?? walk?.Walk_Name ?? walk?.Name ?? walk?.name ?? "").trim();
}

export function getMasterRouteGrade(walk) {
  return String(walk?.Grade ?? walk?.Walk_Grade ?? walk?.WalkGrade ?? walk?.grade ?? walk?.walk_grade ?? "").trim().toUpperCase();
}

export function getMasterRoutePueblo(walk) {
  return String(walk?.Pueblo ?? walk?.pueblo ?? walk?.Town ?? walk?.town ?? walk?.Village ?? walk?.village ?? "").trim();
}

// Meeting point coordinates, or null when they are missing or not numbers
export function getMasterCoordinates(walk) {
  const latitude = walk?.Latitude ?? walk?.latitude ?? walk?.Lat ?? walk?.lat ?? walk?.GPS_Latitude ?? walk?.GPS_Lat ?? walk?.Meeting_Point_Latitude ?? walk?.Meeting_Point_Lat ?? walk?.MeetingPointLatitude;
  const longitude = walk?.Longitude ?? walk?.longitude ?? walk?.Lon ?? walk?.lon ?? walk?.Lng ?? walk?.lng ?? walk?.GPS_Longitude ?? walk?.GPS_Lon ?? walk?.Meeting_Point_Longitude ?? walk?.Meeting_Point_Lon ?? walk?.MeetingPointLongitude;
  const lat = latitude === undefined || latitude === null ? "" : String(latitude).trim();
  const lon = longitude === undefined || longitude === null ? "" : String(longitude).trim();
  if (lat === "" || lon === "" || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) return null;
  return { latitude: lat, longitude: lon, url: `https://www.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lon)}` };
}

// Walks In Spain link, only when it is a plain http(s) address
export function getMasterWisUrl(walk) {
  const raw = String(walk?.WiS_URL ?? walk?.WIS_URL ?? walk?.Wis_Url ?? walk?.WisUrl ?? walk?.wis_url ?? "").trim();
  if (!raw) return "";
  try {
    const base = typeof location !== "undefined" ? location.href : undefined;
    const url = new URL(raw, base);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch (_) {
    return "";
  }
}

/* ========================================================= BOOKINGS ========================================================= */

// Fields an admin may adjust for one booking. Grade is not one of them.
export const OVERRIDE_FIELDS = ["Distance", "Ascent", "Total_Time", "Terrain", "Scr", "Dogs", "Latitude", "Longitude", "Route_Description", "Directions"];

// The route a booking shows: the master walk with any booking overrides applied. Null when neither exists.
export function bookingRoute(record, masterWalks) {
  const master = getMasterWalk(record?.walk_number || record?.walk_id || "", masterWalks);
  const ov = record?.overrides || {};
  const keys = OVERRIDE_FIELDS.filter((k) => ov[k] !== undefined && ov[k] !== null && String(ov[k]).trim() !== "");
  if (!master && !keys.length) return null;
  const merged = { ...(master || {}) };
  keys.forEach((k) => { merged[k] = ov[k]; });
  return merged;
}

// Bookings saved before statuses existed count as drafts
export function bookingStatus(record) {
  return record && record.status === "live" ? "live" : "draft";
}
export function isDraft(record) { return bookingStatus(record) === "draft"; }
export function isCancelled(record) { return record?.cancelled === true; }

// Social events and summer walks: a missing status counts as published
export function socialIsDraft(record) { return !!record && record.status === "draft"; }

/* ========================================================= POPUP PIECES ========================================================= */

export function walkInfoRow(label, valueHtml) {
  return `<div class="walk-info-row"><span class="walk-info-label">${escapeHtml(label)}</span><span class="walk-info-value">${valueHtml}</span></div>`;
}

// Walks and events say "walk" or "event" in their cancellation wording
export const cancelNoun = (record) => (record?.type === "social" ? "event" : "walk");

export function cancelBanner(record) {
  if (!isCancelled(record)) return "";
  const reason = String(record.cancel_reason ?? "").trim();
  return `<div class="cancel-banner">This ${cancelNoun(record)} has been cancelled${reason ? ` due to ${escapeHtml(reason)}` : ""}</div>`;
}

export function cancelReasonLine(record) {
  const reason = String(record?.cancel_reason ?? "").trim();
  return isCancelled(record) && reason ? `<div class="cancel-reason-line">This ${cancelNoun(record)} has been cancelled due to ${escapeHtml(reason)}</div>` : "";
}

export function modifiedBanner(record) {
  if (record?.modified !== true || isCancelled(record)) return "";
  const note = String(record.modified_note ?? "").trim();
  return `<div class="modified-banner"><strong>This walk has changed since it was published.</strong>${note ? " " + escapeHtml(note) : ""}</div>`;
}

// Hover-card chips and notes
export function cancelledChip(record) {
  return isCancelled(record) ? '<span class="cancelled-chip">Cancelled</span>' : "";
}
export function modifiedChip(record) {
  return record?.modified === true && !isCancelled(record) ? '<span class="modified-chip">Changed</span>' : "";
}
export function cancelHoverNote(record) {
  const reason = String(record?.cancel_reason ?? "").trim();
  return isCancelled(record) && reason ? `<div class="hover-card-cancel-reason">This ${cancelNoun(record)} has been cancelled due to ${escapeHtml(reason)}</div>` : "";
}
export function modifiedHoverNote(record) {
  if (record?.modified !== true || isCancelled(record)) return "";
  const note = String(record.modified_note ?? "").trim();
  return `<div class="hover-card-modified">Changed since publishing${note ? ": " + escapeHtml(note) : ""}</div>`;
}

// One leader's contact block: name, phone links and a WhatsApp badge. `c` is a leader_contacts or leader_names record.
export function leaderContactHtml(c) {
  const name = String(c.display_name || "").trim() || `${c.first_name || ""} ${c.surname || ""}`.trim();
  const phoneLink = (p) => {
    const digits = String(p).replace(/[^\d+]/g, "");
    return `<a href="tel:${escapeHtml(digits)}">${escapeHtml(p)}</a>`;
  };
  const phones = [c.phone_1, c.phone_2].filter((p) => String(p || "").trim()).map(phoneLink);
  const contact = [...phones, c.whats_app === "y" ? `<span class="whatsapp-pref">WhatsApp</span>` : ""].filter(Boolean).join(" · ");
  return `<span class="leader-line-name">${escapeHtml(name)}</span>${contact ? `<span class="leader-contact">${contact}</span>` : ""}`;
}

/* The full walk card body (no header). Used by the Walker App and by the planner.
   Layout: Overview, notes, Links, then Leader and location (leaders, Pueblo, GPX, meeting point), map, directions.
   model: {
     record,            booking record
     route,             bookingRoute() result (may be null)
     walkId,            walk number shown on the card
     leaderHtml,        pre-built leader lines (leaderContactHtml output, one per leader, each wrapped by the caller), may be ""
     leaderText,        plain fallback for the leader line when leaderHtml is empty
     hasPdf, pdfName,   full description PDF, if the walks database has one
     gpxName,           GPX route file name, if there is one
     photoKey,          master walk key, so the photo can be loaded after rendering
     pueblo, showPueblo
   } */
export function walkCardBodyHtml(model) {
  const { record, route: r0, walkId, leaderHtml, leaderText, hasPdf, pdfName, gpxName, photoKey, pueblo, showPueblo } = model;
  const r = r0 || {};
  const grade = getMasterRouteGrade(r0) || record.walk_grade || "";
  const dash = (v) => (v === undefined || v === null || String(v).trim() === "" ? "–" : escapeHtml(v));
  const description = String(r.Route_Description ?? "").trim();
  const comments = String(record.comments ?? "").trim();
  const directions = String(r.Directions ?? "").trim();
  const dogs = String(r.Dogs ?? "").trim();
  const wisUrl = getMasterWisUrl(r0);
  const meeting = getMasterCoordinates(r0);
  const hasMeeting = !!(meeting && meeting.url);

  const stat = (label, value) => `
    <div class="walk-stat">
      <div class="walk-stat-label">${escapeHtml(label)}</div>
      <div class="walk-stat-value">${value}</div>
    </div>`;

  const fullDescriptionRow = hasPdf
    ? walkInfoRow("Full description:", `<a href="#" data-pdf-download="${escapeHtml(walkId)}" data-pdf-name="${escapeHtml(pdfName || "walk-description.pdf")}">Download PDF ↓</a>`)
    : "";
  const gpxRow = gpxName && walkId
    ? walkInfoRow("GPX route:", `<a href="#" data-gpx-download="${escapeHtml(walkId)}" data-gpx-name="${escapeHtml(gpxName)}">Download GPX ↓</a>`)
    : "";
  const wisRow = wisUrl ? walkInfoRow("WiS link:", `<a href="${escapeHtml(wisUrl)}" target="_blank" rel="noopener noreferrer">Walks In Spain ↗</a>`) : "";
  const meetingRow = hasMeeting
    ? walkInfoRow("Meeting point:", `<a href="${escapeHtml(meeting.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(meeting.latitude)}, ${escapeHtml(meeting.longitude)} ↗</a>`)
    : "";
  const puebloRow = showPueblo && pueblo ? walkInfoRow("Pueblo:", escapeHtml(pueblo)) : "";
  const leaderRow = walkInfoRow("Leader(s):", leaderHtml
    ? leaderHtml
    : escapeHtml(leaderText || "–"));

  const meetingMap = hasMeeting
    ? `<iframe class="walk-meeting-map" title="Meeting point map" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=${encodeURIComponent(Number(meeting.latitude))},${encodeURIComponent(Number(meeting.longitude))}&amp;z=14&amp;output=embed"></iframe>`
    : "";

  // Description and programme comments share one quote block
  const quoteParts = [description, comments].filter(Boolean).map((t) => escapeHtml(t));
  const quoteBlock = quoteParts.length
    ? `<blockquote class="walk-quote">${quoteParts.join('<span class="walk-quote-break"></span>')}</blockquote>`
    : "";

  const linksBlock = wisRow || fullDescriptionRow
    ? `<div class="walk-section-title">Links</div><div class="walk-info">${wisRow}${fullDescriptionRow}</div>`
    : "";
  const organiser = `${leaderRow}${puebloRow}${gpxRow}${meetingRow}`;

  const body = r0
    ? `<div class="walk-section-title">Overview</div>
      <div class="walk-stats">
        ${stat("Distance", statUnit(r.Distance, "km"))}
        ${stat("Ascent", statUnit(r.Ascent, "m"))}
        ${stat("Total time", statDuration(r.Total_Time))}
        ${stat("Grade", [grade, r.Terrain, ...[r.Scr, xFlag(r)].filter((v) => String(v ?? "").trim())].map(dash).join(" / "))}
      </div>
      ${quoteBlock}
      <button type="button" class="walk-levels-link" data-open-levels>What do the walk grades mean?</button>
      ${linksBlock}
      <div class="walk-section-title">Leader and location</div>
      <div class="walk-info">${organiser}</div>
      ${meetingMap}
      ${directions ? `<div class="walk-section-title">Driving directions</div><div class="walk-directions">${escapeHtml(directions)}</div>` : ""}
      ${dogs ? `<div class="walk-dogs">🐾 ${escapeHtml(dogs)}</div>` : ""}`
    : `<p class="detail-missing">${walkId
        ? `No master route found for Walk ID ${escapeHtml(walkId)}. Check the Walk Number.`
        : "This booking has no Walk Number linked to the master walks database."}</p>
      ${quoteBlock}`;

  const photoHtml = photoKey
    ? `<div class="walk-card-photo" data-photo-key="${escapeHtml(photoKey)}" style="display:none"></div>`
    : "";
  return cancelBanner(record) + modifiedBanner(record) + photoHtml + `<div class="walk-card-body">${body}</div>`;
}

/* Walk card header (title, date, time, close). `model.name`, `model.dateText`, `model.timeText`. */
export function walkCardHeaderHtml(model) {
  return `
    <div class="walk-card-header">
      <div>
        <h3 id="detail-title">${escapeHtml(model.name || "Untitled walk")}</h3>
        <div class="walk-card-date">📅 ${escapeHtml(formatWalkDate(model.date))} • ${escapeHtml(formatTime12(model.startTime))}</div>
      </div>
      <button class="walk-card-close" type="button" data-action="close" aria-label="Close">×</button>
    </div>`;
}

/* Summer walk and social event card (click). Returns the whole card, header included. */
export function socialCardHtml(record, key = "", { admin = false } = {}) {
  const isSummer = record.type === "summer";
  const isDraftRec = socialIsDraft(record);
  const svg = (paths) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const I = {
    cal: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>'),
    pin: svg('<path d="M21 10c0 7-9 12-9 12S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'),
    phone: svg('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>'),
    doc: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>'),
    ext: svg('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>'),
  };
  const row = (label, glyph, value, end = "") => (String(value ?? "").trim()
    ? `<div class="social-card-row"><div class="social-card-label">${label}</div><div class="social-card-value"><span class="social-card-value-main">${glyph}<span>${escapeHtml(value)}</span></span>${end}</div></div>`
    : "");
  const pdfName = (() => {
    try { return decodeURIComponent((record.pdf_url || "").split("/").pop().split("?")[0]) || "PDF document"; } catch (_) { return "PDF document"; }
  })();
  const hasStats = isSummer && [record.distance, record.ascent, record.duration].some((v) => String(v ?? "").trim());
  return `
    <div class="social-card-head">
      <div>
        <span class="social-kicker${isSummer ? " summer-kicker" : ""}">${isSummer ? "Summer walk" : "Social event"}</span>
        <h3 id="detail-title">${escapeHtml(record.title || (isSummer ? "Summer walk" : "Social event"))}</h3>
      </div>
      <button class="detail-close" type="button" data-action="close" aria-label="Close">×</button>
    </div>
    ${cancelBanner(record)}
    <div class="social-card-meta">
      <span>${I.cal}${escapeHtml(formatWalkDate(record.date))}</span>
      <span>${I.clock}${escapeHtml(formatStartTime(record.start_time))}</span>
    </div>
    ${hasStats ? `
      <div class="walk-stats">
        <div class="walk-stat"><div class="walk-stat-label">Distance</div><div class="walk-stat-value">${statUnit(record.distance, "km")}</div></div>
        <div class="walk-stat"><div class="walk-stat-label">Ascent</div><div class="walk-stat-value">${statUnit(record.ascent, "m")}</div></div>
        <div class="walk-stat"><div class="walk-stat-label">Total time</div><div class="walk-stat-value">${statDuration(record.duration)}</div></div>
      </div>` : ""}
    ${row("Leader(s)", I.user, record.leader)}
    ${isSummer ? `
      ${row("Meeting point", I.pin, record.meeting_point)}
      ${row("Booking / contact", I.phone, record.contact)}
    ` : row("Location", I.pin, record.location)}
    ${/^https?:\/\//i.test(record.pdf_url || "") ? row("Attachment", I.doc, pdfName, `<a href="${escapeHtml(record.pdf_url)}" target="_blank" rel="noopener noreferrer">Open PDF ${I.ext}</a>`) : ""}
    ${record.description ? `<div class="social-card-desc${isSummer ? " summer-desc" : ""}">${escapeHtml(record.description)}</div>` : ""}
    ${admin && isDraftRec ? row("Status", "", "Draft, not yet published to walkers") : ""}
    <div class="detail-actions">
      <button class="btn btn-secondary" type="button" data-action="close">Close</button>
    </div>`;
}

/* Hover card for a walk: a quick summary shown while the pointer is over a calendar slot.
   model: { record, route, name, walkId, leaderText,
            statusHtml,   optional status chip (planner, non-walker views), may be "",
            hint          optional line at the foot, default "Click for full details" } */
export function walkHoverCardHtml(model) {
  const { record, route, name, walkId, leaderText, statusHtml = "", hint = "Click for full details" } = model;
  const r = route || {};
  const grade = getMasterRouteGrade(route) || record.walk_grade || "";
  const dash = (v) => (v === undefined || v === null || String(v).trim() === "" ? "–" : escapeHtml(v));
  const description = String(r.Route_Description ?? "").trim();
  const stats = [
    statUnit(r.Distance, "km"),
    statUnit(r.Ascent, "m"),
    dash(grade),
    dash(r.Terrain),
    ...[r.Scr, xFlag(r)].filter((v) => String(v ?? "").trim()).map(dash),
  ].join(" / ");
  const dateObj = convertDate(record.date);
  const dateLabel = dateObj
    ? dateObj.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    : String(record.date || "");
  const startLabel = String(record.start_time ?? "").trim() ? escapeHtml(formatTime12(record.start_time)) : "Not recorded";
  const totalLabel = String(r.Total_Time ?? "").trim() ? statDuration(r.Total_Time) : "Not recorded";
  return `
    <div class="hover-card-head">
      <span class="grade-chip grade-${escapeHtml(grade)}">${escapeHtml(grade || "-")}</span>
      ${statusHtml}${cancelledChip(record)}${modifiedChip(record)}
      <span>${escapeHtml(dateLabel)}</span>
    </div>
    <div class="hover-card-title">${escapeHtml(name || "Untitled walk")}</div>
    ${cancelHoverNote(record)}${modifiedHoverNote(record)}
    <div class="hover-card-stats">
      <div class="hover-card-stats-label">Walk stats</div>
      <div class="hover-card-stats-labels">Distance / Ascent / Grade</div>
      <div class="hover-card-stats-value">${stats}</div>
    </div>
    <div class="hover-card-row"><span>Start</span>${startLabel}</div>
    <div class="hover-card-row"><span>Total time</span>${totalLabel}</div>
    ${description ? `<div class="hover-card-desc">${escapeHtml(description)}</div>` : ""}
    <div class="hover-card-meta">Walk ${escapeHtml(walkId || "-")} · Leader ${escapeHtml(leaderText || "-")}</div>
    <div class="hover-card-hint">${escapeHtml(hint)}</div>`;
}
