import {
  notificationStatus,
  enableNotifications,
  disableNotifications,
} from "./notifications.js";
import { api as requestApi, appUrl } from "./api.js";

const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const storageKey =
  "doin-token:" + appUrl + ":" + (window.DOIN_CONFIG?.supabaseUrl || "local");
let token = localStorage.getItem(storageKey);
let state,
  view = ["home", "events", "calendar"].includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : "home",
  month = new Date(),
  selectedDay = null,
  eventFilter = "all",
  eventPage = 0,
  busy = false,
  connected = false;
let refreshNumber = 0;
const paths = {
  home: "m3 10 9-7 9 7v11h-6v-7H9v7H3Z",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  plus: "M12 5v14M5 12h14",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12M6 18 18 6",
  calendar: "M8 3v4M16 3v4M4 10h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  left: "m14 6-6 6 6 6",
  right: "m10 6 6 6-6 6",
  vote: "m6 10 6-6 6 6M12 4v16",
  link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2",
  car: "m5 7 2-4h10l2 4M3 11l2-4h14l2 4v7H3zM5 18v3M19 18v3M6 12h2M16 12h2",
  clock: "M12 7v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  music:
    "M9 18V5l11-2v13M9 8l11-2M9 18c0 2-2 3-4 3s-3-1-3-2 2-3 4-3 3 1 3 2ZM20 16c0 2-2 3-4 3s-3-1-3-2 2-3 4-3 3 1 3 2Z",
  outdoors: "m2 20 7-13 4 7 3-5 6 11ZM7 11l2 2 2-2",
  food: "M4 3v7a3 3 0 0 0 6 0V3M7 3v18M20 21V3c-5 0-6 10 0 10",
  arts: "m12 3 2.6 5.4 6 .8-4.3 4.2 1 6-5.3-2.8-5.3 2.8 1-6L2.4 9.2l6-.8Z",
};
const icon = (name, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.users}"/></svg>`;
const categories = ["Music", "Food", "Outdoors", "Arts", "Hangout"];
const date = (value) =>
  new Date(value).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
const time = (value) =>
  new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
const dayKey = (value) => new Date(value).toDateString();
const api = (path, data) => requestApi(path, data, token);

function demo() {
  const saturday = new Date();
  saturday.setDate(saturday.getDate() + ((6 - saturday.getDay() + 7) % 7 || 7));
  const samples = [
    ["Sunset sounds", "Music", "Riverside Park", 17, 0],
    ["Dinner with the crew", "Food", "Little Italy · Downtown", 18, 0],
    ["Take the scenic route", "Outdoors", "South Mountain trailhead", 8, 1],
  ];
  return {
    group: { name: "Your next adventure", id: "" },
    me: { name: "You" },
    members: [{ name: "You" }, { name: "Alex" }, { name: "Sam" }],
    events: samples.map(([title, category, place, hour, offset], i) => {
      const start = new Date(saturday);
      start.setDate(start.getDate() + offset);
      start.setHours(hour, 0, 0, 0);
      return {
        id: "demo" + i,
        title,
        category,
        place,
        starts: start.toISOString(),
        ends: new Date(+start + 7200000).toISOString(),
        author: "Alex",
        url: "",
        responses:
          i === 0
            ? [
                { name: "Alex", vote: 1, status: "going", seats: 3 },
                { name: "Sam", vote: 1, status: "going", seats: 0 },
              ]
            : [{ name: "Sam", vote: 1, status: "maybe", seats: 0 }],
      };
    }),
  };
}
let toastTimer;
function toast(message) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 4000);
}
async function refresh(force = false) {
  const number = ++refreshNumber;
  if (token) {
    try {
      const next = await api("state");
      if (number !== refreshNumber) return;
      const changed =
        JSON.stringify(next) !== JSON.stringify(state) || !connected;
      state = next;
      connected = true;
      if (changed || force) render();
      return;
    } catch (error) {
      if (number !== refreshNumber) return;
      if (/join or create/.test(error.message)) {
        localStorage.removeItem(storageKey);
        token = null;
      } else {
        connected = false;
        toast(error.message);
        if (state) {
          render();
          return;
        }
        $("#app").innerHTML =
          `<main class="connection-error panel"><p class="eyebrow">CONNECTION LOST</p><h1>Your plans are still there.</h1><p>Check your connection and try again.</p><button class="primary" id="retry">Reconnect ${icon("arrow")}</button></main>`;
        $("#retry").onclick = () => refresh(true);
        return;
      }
    }
  }
  connected = false;
  state = demo();
  render();
}
const overlaps = (event) =>
  state.events.filter(
    (other) =>
      other.id !== event.id &&
      new Date(other.starts) < new Date(event.ends) &&
      new Date(other.ends) > new Date(event.starts),
  );
function card(event) {
  const mine = event.responses.find((r) => r.mine),
    going = event.responses.filter((r) => r.status === "going");
  const seats = going.reduce((sum, r) => sum + r.seats, 0),
    votes = event.responses.reduce((sum, r) => sum + r.vote, 0),
    start = new Date(event.starts);
  return `<article class="event-card panel"><div class="event-heading"><div class="date-tile"><span>${start.toLocaleDateString(undefined, { month: "short" })}</span><b>${start.getDate()}</b></div><div class="event-copy"><p class="event-time">${date(event.starts)} · ${time(event.starts)}${overlaps(event).length ? '<span class="conflict">Time clash</span>' : ""}</p><h3><button data-open="${event.id}">${esc(event.title)}</button></h3><p class="location">${icon("pin")}${esc(event.place)}</p></div></div><div class="attendance">${icon("users")}<span>${going.length} going</span>${seats ? `<span class="ride-count">${icon("car")}${seats} seats</span>` : ""}</div><div class="card-actions"><button class="vote ${mine?.vote ? "active" : ""}" data-vote="${event.id}" aria-pressed="${Boolean(mine?.vote)}" aria-label="Vote for ${esc(event.title)}">${icon("vote")} Vote <b>${votes}</b></button><button class="going-button ${mine?.status === "going" ? "active" : ""}" data-going="${event.id}" aria-pressed="${mine?.status === "going"}">${icon(mine?.status === "going" ? "check" : "plus")}${mine?.status === "going" ? "Going" : "I’m going"}</button><button class="details-button" data-open="${event.id}">Details & rides ${icon("arrow")}</button></div></article>`;
}
function upcoming() {
  return state.events
    .filter((e) => new Date(e.ends) >= new Date())
    .sort((a, b) => new Date(a.starts) - new Date(b.starts));
}
function dashboard() {
  const events = upcoming(),
    going = events.filter((e) =>
      e.responses.some((r) => r.mine && r.status === "going"),
    );
  const seats = going.reduce(
    (sum, e) =>
      sum +
      e.responses
        .filter((r) => r.status === "going")
        .reduce((n, r) => n + r.seats, 0),
    0,
  );
  const next = going[0] || events[0],
    undecided = events
      .filter(
        (e) =>
          !e.responses.some(
            (r) =>
              r.mine && (r.vote || r.status === "going" || r.status === "out"),
          ),
      )
      .filter((e) => e.id !== next?.id);
  return `<div class="dashboard-stats"><button class="stat panel" data-view="events"><span>Upcoming</span><b>${events.length}</b>${icon("calendar")}</button><button class="stat panel" data-event-filter="going"><span>You’re going</span><b>${going.length}</b>${icon("check")}</button><button class="stat panel" data-event-filter="going"><span>Seats offered${going.length ? " on your plans" : ""}</span><b>${seats}</b>${icon("car")}</button></div><div class="dashboard-grid"><section class="next-panel panel"><div class="section-line"><h2 class="section-heading">${going.length ? "YOUR NEXT EVENT" : "NEXT IN YOUR GROUP"}</h2>${icon("calendar")}</div>${next ? `<p class="next-date">${date(next.starts)} · ${time(next.starts)}</p><h2 class="next-title"><button data-open="${next.id}">${esc(next.title)}</button></h2><p class="location">${icon("pin")}${esc(next.place)}</p><div class="next-bottom"><span>${next.responses.filter((r) => r.status === "going").length} going${next.responses.some((r) => r.mine && r.status === "going") ? " · You’re in" : ""}</span><button class="secondary" data-open="${next.id}">Details & rides ${icon("arrow")}</button></div>` : `<h2 class="next-title">Make your next plan.</h2><p class="hint">Add an event and get your people together.</p><button class="secondary" id="empty-add">Add your first event ${icon("plus")}</button>`}</section><section class="decisions-panel panel"><div class="section-line"><h2 class="section-heading">${undecided.length ? "STILL DECIDING?" : "YOUR GROUP"}</h2><span>${undecided.length ? "Pick a plan" : state.members.length + " people"}</span></div>${
    undecided
      .slice(0, 2)
      .map(
        (e) =>
          `<button class="dashboard-event" data-open="${e.id}"><span class="mini-date">${new Date(e.starts).getDate()}<small>${new Date(e.starts).toLocaleDateString(undefined, { month: "short" })}</small></span><span><strong>${esc(e.title)}</strong><small>${time(e.starts)} · ${e.responses.reduce((sum, r) => sum + r.vote, 0)} votes</small></span>${icon("right")}</button>`,
      )
      .join("") ||
    `<p class="group-summary">${state.members
      .slice(0, 4)
      .map((m) => esc(m.name))
      .join(
        ", ",
      )}${state.members.length > 4 ? " + " + (state.members.length - 4) + " more" : ""}</p><p class="hint">One place for your plans and rides.</p>`
  }<button class="dashboard-link" data-view="events">See all events ${icon("arrow")}</button></section></div>`;
}
function eventsPage() {
  const events = (
    eventFilter === "past"
      ? state.events
          .filter((e) => new Date(e.ends) < new Date())
          .sort((a, b) => new Date(b.starts) - new Date(a.starts))
      : upcoming()
  ).filter(
    (e) =>
      eventFilter !== "going" ||
      e.responses.some((r) => r.mine && r.status === "going"),
  );
  const pages = Math.max(1, Math.ceil(events.length / 5));
  eventPage = Math.min(eventPage, pages - 1);
  return `<div class="events-toolbar"><div class="event-filters" aria-label="Filter events">${[
    ["all", "All group events"],
    ["going", "I’m going"],
    ["past", "Past"],
  ]
    .map(
      ([value, label]) =>
        `<button data-event-filter="${value}" class="${eventFilter === value ? "selected" : ""}" aria-pressed="${eventFilter === value}">${label}</button>`,
    )
    .join(
      "",
    )}</div><span>${events.length} ${events.length === 1 ? "event" : "events"}</span></div><section class="cards event-list" aria-label="Group events">${
    events
      .slice(eventPage * 5, eventPage * 5 + 5)
      .map(card)
      .join("") ||
    `<div class="empty-state panel">${icon("calendar")}<h2>${eventFilter === "going" ? "No plans picked yet." : eventFilter === "past" ? "No past events." : "Your grid is clear."}</h2><p>${eventFilter === "going" ? "Tap I’m going on an event to find it here." : "Add an event to start planning together."}</p>${eventFilter === "all" ? '<button class="primary" id="empty-add">Add your first event</button>' : ""}</div>`
  }</section>${pages > 1 ? `<nav class="pagination" aria-label="Event pages"><button data-page="-1" ${eventPage === 0 ? "disabled" : ""}>${icon("left")} Previous</button><span>${eventPage + 1} / ${pages}</span><button data-page="1" ${eventPage === pages - 1 ? "disabled" : ""}>Next ${icon("right")}</button></nav>` : ""}`;
}
function calendar() {
  const year = month.getFullYear(),
    m = month.getMonth(),
    first = new Date(year, m, 1).getDay(),
    days = new Date(year, m + 1, 0).getDate();
  const events = selectedDay
    ? state.events.filter((e) => dayKey(e.starts) === selectedDay)
    : [];
  return `<section class="calendar panel"><div class="calendar-top"><h2>${month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2><div><button data-month="-1" aria-label="Previous month">${icon("left")}</button><button data-month="1" aria-label="Next month">${icon("right")}</button></div></div><div class="calendar-grid">${["S", "M", "T", "W", "T", "F", "S"].map((d) => `<span class="day-label">${d}</span>`).join("")}${'<div class="blank-day"></div>'.repeat(first)}${Array.from(
    { length: days },
    (_, i) => {
      const key = new Date(year, m, i + 1).toDateString();
      const dayEvents = state.events.filter((e) => dayKey(e.starts) === key);
      return `<button class="day ${key === selectedDay ? "selected" : ""} ${key === dayKey(new Date()) ? "today" : ""}" data-day="${key}" aria-label="${date(new Date(year, m, i + 1))}, ${dayEvents.length} events" aria-pressed="${key === selectedDay}"><span>${i + 1}</span><div class="calendar-event-names">${dayEvents
        .slice(0, 2)
        .map((e) => `<span>${esc(e.title)}</span>`)
        .join(
          "",
        )}${dayEvents.length > 2 ? `<small>+${dayEvents.length - 2} more</small>` : ""}</div><span class="day-dots">${dayEvents
        .slice(0, 3)
        .map(() => "<i></i>")
        .join("")}</span></button>`;
    },
  ).join(
    "",
  )}</div><p class="calendar-hint">Select a day to see its events.</p></section>${selectedDay ? `<section class="day-events"><h2 class="section-heading">${date(selectedDay)}</h2><div class="cards">${events.map(card).join("") || '<p class="empty-day">No plans this day. Room for something good.</p>'}</div></section>` : ""}`;
}
function render() {
  const focus = document.activeElement;
  const focusedAction = focus?.dataset?.vote
    ? ["vote", focus.dataset.vote]
    : focus?.dataset?.going
      ? ["going", focus.dataset.going]
      : null;
  const title = { home: "Home", events: "Your events", calendar: "Calendar" }[
    view
  ];
  $("#app").innerHTML =
    `<main class="shell dashboard-shell"><header class="app-header"><a class="compact-brand" href="#home" data-view="home" aria-label="The Grid home"><img src="./wordmark.svg" alt="The Grid" width="180" height="26"></a><div class="account-controls">${token ? `<button id="notifications" class="notification-button" aria-label="Notification settings" title="Notifications">${icon("bell")}</button>` : ""}<button id="account" class="identity">${icon("users")}${token ? esc(state.me.name) : "Join group"}</button></div></header><div class="dashboard-group"><button id="group-settings" class="group-name" ${!token ? "disabled" : ""}>${icon("users")} ${esc(state.group.name)}<span class="connection-dot ${token && !connected ? "offline" : ""}"></span></button><button id="invite" class="small-invite">${icon("plus")} Invite friends</button></div><nav class="page-nav" aria-label="Main navigation">${[
      ["home", "home", "Home"],
      ["events", "grid", "Your events"],
      ["calendar", "calendar", "Calendar"],
    ]
      .map(
        ([value, symbol, label]) =>
          `<a href="#${value}" data-view="${value}" class="${view === value ? "selected" : ""}" ${view === value ? 'aria-current="page"' : ""}>${icon(symbol)}<span>${label}</span></a>`,
      )
      .join(
        "",
      )}</nav><div class="page-heading"><div><h1>${title}</h1><p>${view === "home" ? "Your plans, at a glance." : view === "events" ? "All the plans shared with your group." : "Find a day. Make a plan."}</p></div><button class="primary" id="add">${icon("plus")} Add event</button></div>${!token ? '<div class="demo-banner"><span>Sample plans. Create your own group.</span><button id="start">Create group →</button></div>' : ""}<div class="page-content" id="page-content">${view === "home" ? dashboard() : view === "calendar" ? calendar() : eventsPage()}</div><footer><span class="footer-mark">THE GRID</span><span>Less planning. More living.</span></footer></main>`;
  bind();
  if (focusedAction)
    document
      .querySelector(`[data-${focusedAction[0]}="${focusedAction[1]}"]`)
      ?.focus({ preventScroll: true });
}
function modal(html) {
  const dialog = $("#modal");
  dialog.innerHTML = `<button class="close" aria-label="Close dialog">${icon("close")}</button>${html}`;
  if (!dialog.open) dialog.showModal();
  $(".close").onclick = () => dialog.close();
}
function groupDialog() {
  const inviteCode = new URLSearchParams(location.search).get("join");
  if (token && !inviteCode) {
    modal(
      `<p class="eyebrow">YOUR GROUP</p><h2>${esc(state.group.name)}</h2><p>You're connected as <strong>${esc(state.me.name)}</strong>.</p><div class="member-list">${state.members.map((m) => `<span>${esc(m.name)}</span>`).join("")}</div><div class="group-actions"><button id="share-group" class="primary">${icon("plus")} Invite friends</button><button id="edit-group" class="secondary">Edit group</button></div><button id="leave" class="text-button">Leave this group on this device</button><p class="hint">Leaving doesn’t delete the group. Keep an invite link if you want to rejoin.</p>`,
    );
    $("#share-group").onclick = invite;
    $("#edit-group").onclick = editGroupDialog;
    $("#leave").onclick = async () => {
      try {
        await disableNotifications(api);
      } catch {
        toast("Couldn’t turn off notifications. Reconnect before leaving.");
        return;
      }
      localStorage.removeItem(storageKey);
      token = null;
      $("#modal").close();
      refresh(true);
    };
    return;
  }
  modal(
    `<p class="eyebrow">WELCOME TO THE GRID</p><h2>${inviteCode ? "Your people are here." : "Start with your people."}</h2><p>${inviteCode ? "Enter your name to join their plans." : "One group for events, votes, and rides."}</p><form id="group-form"><label>Your name<input name="name" autocomplete="given-name" maxlength="40" required placeholder="Your name"></label>${inviteCode ? "" : '<label>Group name<input name="group" maxlength="120" required placeholder="The weekend crew"></label>'}<button class="primary">${inviteCode ? "Join group" : "Create group"} ${icon("arrow")}</button><p class="form-error" role="alert"></p></form>`,
  );
  $("#group-form").onsubmit = async (event) => {
    event.preventDefault();
    const button = event.target.querySelector("button");
    button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(event.target));
      const result = await api(inviteCode ? "join" : "groups", {
        ...data,
        invite: inviteCode,
      });
      token = result.token;
      localStorage.setItem(storageKey, token);
      history.replaceState({}, "", appUrl + "#" + view);
      $("#modal").close();
      await refresh(true);
      toast(inviteCode ? "You’re in." : "Group created. Invite your friends.");
    } catch (error) {
      $(".form-error").textContent = error.message;
      button.disabled = false;
    }
  };
}

function editGroupDialog() {
  modal(
    `<p class="eyebrow">GROUP SETTINGS</p><h2>Edit group</h2><form id="edit-group-form"><label>Group name<input name="name" required maxlength="120" value="${esc(state.group.name)}" placeholder="Your group name"></label><p class="hint">This changes the name for everyone. Your events and invite link stay the same.</p><div class="group-actions"><button class="primary" type="submit">Save changes ${icon("check")}</button><button class="secondary" type="button" id="cancel-edit-group">Cancel</button></div><p class="form-error" role="alert"></p></form>`,
  );
  $("#cancel-edit-group").onclick = groupDialog;
  $("#edit-group-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget,
      button = form.querySelector("[type=submit]");
    const name = new FormData(form).get("name").trim();
    if (!name) {
      form.querySelector(".form-error").textContent = "Enter a group name.";
      return;
    }
    button.disabled = true;
    try {
      const group = await api("group", { name });
      state.group = group;
      render();
      groupDialog();
      toast("Group name updated for everyone.");
    } catch (error) {
      form.querySelector(".form-error").textContent = error.message;
      button.disabled = false;
    }
  };
}

async function notificationDialog() {
  modal(
    `<p class="eyebrow">YOUR PHONE</p><h2>New event alerts</h2><p id="notification-message">Checking notification settings…</p><div id="notification-actions"></div><p class="form-error" role="alert"></p>`,
  );
  try {
    const status = await notificationStatus(api);
    if (!$("#modal").open || !$("#notification-message")) return;
    const descriptions = {
      install:
        "On iPhone, open this site in Safari, tap Share → Add to Home Screen, then open that Home Screen app and tap the bell. Requires iOS 16.4 or newer.",
      unsupported:
        "Push notifications aren’t available in this browser. Try the latest Safari, Chrome, or Firefox. On iPhone, use the app from your Home Screen.",
      blocked:
        "Notifications are blocked. Allow notifications for The Grid in your phone or browser settings, then come back here.",
    };
    if (status.support !== "supported") {
      $("#notification-message").textContent = descriptions[status.support];
      return;
    }
    if (!status.ready) {
      $("#notification-message").textContent =
        "Notifications need the one-time server setup first. Your group organizer can run Setup notifications in GitHub.";
      return;
    }
    $("#notification-message").textContent = status.subscribed
      ? "You’ll get an alert on this device when someone else adds an event to this group."
      : "Get an alert when someone else adds an event—even when the app is closed. This is optional and applies to this device.";
    $("#notification-actions").innerHTML =
      `<button class="primary" id="toggle-notifications">${status.subscribed ? "Turn off notifications" : "Enable notifications"}</button>`;
    $("#toggle-notifications").onclick = async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        if (status.subscribed) await disableNotifications(api);
        else await enableNotifications(api, status.publicKey);
        if ($("#modal").open) $("#modal").close();
        toast(
          status.subscribed
            ? "Notifications turned off on this device."
            : "New event notifications are on.",
        );
      } catch (error) {
        if ($(".form-error")) $(".form-error").textContent = error.message;
        button.disabled = false;
      }
    };
  } catch (error) {
    if ($("#notification-message"))
      $("#notification-message").textContent = error.message;
  }
}

async function invite() {
  if (!token) return groupDialog();
  const url = appUrl + "?join=" + state.group.id;
  try {
    if (navigator.share)
      await navigator.share({ title: "Join our plans on The Grid", url });
    else {
      await navigator.clipboard.writeText(url);
      toast("Invite link copied. Send it to your friends.");
    }
  } catch (error) {
    if (error.name === "AbortError") return;
    modal(
      `<p class="eyebrow">BRING YOUR PEOPLE</p><h2>Invite friends</h2><p>Copy this link and send it to your group.</p><input id="invite-link" aria-label="Group invite link" readonly value="${esc(url)}"><p class="hint">Anyone with this link can join. Keep it within your group.</p>`,
    );
    $("#invite-link").onclick = (event) => event.target.select();
  }
}
function addDialog() {
  if (!token) return groupDialog();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(18, 0, 0, 0);
  const local = (value) =>
    new Date(+value - value.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  modal(
    `<p class="eyebrow">NEW EVENT</p><h2>What’s the plan?</h2><form id="event-form"><label>Event link <span class="optional">optional</span><input name="url" type="url" maxlength="2048" placeholder="Paste a social or website link"></label><label>Event name<input name="title" required maxlength="120" placeholder="What are we doing?"></label><label>When<input name="starts" type="datetime-local" value="${local(tomorrow)}" required></label><label>Where<input name="place" required maxlength="120" placeholder="Venue or meeting spot"></label><details class="more-options"><summary>More options</summary><label>Ends <span class="optional">defaults to 2 hours later</span><input name="ends" type="datetime-local"></label><label>Category<select name="category">${["Hangout", ...categories.filter((c) => c !== "Hangout")].map((c) => `<option>${c}</option>`).join("")}</select></label></details><p class="hint">Links are saved with your event. Enter its details above.</p><button class="primary">Add event ${icon("arrow")}</button><p class="form-error" role="alert"></p></form>`,
  );
  $("#event-form").onsubmit = async (event) => {
    event.preventDefault();
    const button = event.target.querySelector("button");
    button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(event.target));
      const start = new Date(data.starts),
        end = data.ends ? new Date(data.ends) : new Date(+start + 7200000);
      if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start)
        throw new Error("End time must be after the start time.");
      await api("events", {
        ...data,
        starts: start.toISOString(),
        ends: end.toISOString(),
      });
      $("#modal").close();
      view = "events";
      history.replaceState({}, "", appUrl + "#events");
      eventFilter = "all";
      eventPage = 0;
      selectedDay = null;
      await refresh(true);
      toast("Event added.");
    } catch (error) {
      $(".form-error").textContent = error.message;
      button.disabled = false;
    }
  };
}
async function respond(event, changes) {
  if (!token) {
    groupDialog();
    return;
  }
  const mine = event.responses.find((r) => r.mine) || {
    vote: 0,
    status: "maybe",
    seats: 0,
  };
  await api("respond", {
    event: event.id,
    vote: mine.vote,
    status: mine.status,
    seats: mine.seats,
    ...changes,
  });
  await refresh(true);
}
function detail(id) {
  const event = state.events.find((e) => e.id === id);
  if (!event) return;
  const mine = event.responses.find((r) => r.mine) || {
    status: "maybe",
    seats: 0,
  };
  const clashes = overlaps(event);
  const drivers = event.responses.filter(
    (r) => r.status === "going" && r.seats > 0,
  );
  const passengers = event.responses.filter(
    (r) => r.status === "going" && !r.seats,
  );
  modal(
    `<p class="eyebrow">EVENT DETAILS</p><h2>${esc(event.title)}</h2><p class="detail-line">${icon("calendar")}${date(event.starts)} · ${time(event.starts)} – ${time(event.ends)}${dayKey(event.starts) !== dayKey(event.ends) ? " (" + date(event.ends) + ")" : ""}</p><p class="detail-line">${icon("pin")}${esc(event.place)}</p>${event.url ? `<a class="source-link" href="${esc(event.url)}" target="_blank" rel="noopener noreferrer">${icon("link")} Open original event ${icon("arrow")}</a>` : ""}${clashes.length ? `<div class="overlap-box"><b>Same time as another plan</b><p>${clashes.map((e) => esc(e.title)).join(", ")}. Vote for your favorite.</p></div>` : ""}<form id="rsvp-form"><label>Are you going?<select name="status"><option value="going" ${mine.status === "going" ? "selected" : ""}>Going</option><option value="maybe" ${mine.status === "maybe" ? "selected" : ""}>Maybe</option><option value="out" ${mine.status === "out" ? "selected" : ""}>Can’t make it</option></select></label><label>Can you offer a ride?<select name="seats">${Array.from({ length: 9 }, (_, n) => `<option value="${n}" ${mine.seats === n ? "selected" : ""}>${n ? n + " passenger seat" + (n > 1 ? "s" : "") : "Not offering a ride"}</option>`).join("")}</select></label><button class="primary">Save ${icon("check")}</button><p class="form-error" role="alert"></p></form><section class="detail-crew"><h3>Who's going</h3>${
      event.responses
        .filter((r) => r.status !== "out")
        .map(
          (r) =>
            `<div class="crew-person"><span>${esc(r.name)}</span><span>${r.status === "going" ? "Going" : "Maybe"}${r.seats ? " · " + r.seats + " seats" : ""}</span></div>`,
        )
        .join("") || '<p class="hint">No responses yet.</p>'
    }</section><details class="ride-details"><summary>${icon("car")} Carpool details</summary>${drivers.length ? drivers.map((r) => `<p><strong>${esc(r.name)}</strong> offers ${r.seats} passenger seats.</p>`).join("") : "<p>No ride offers yet.</p>"}${passengers.length ? `<p>Going without a ride offer: ${passengers.map((r) => esc(r.name)).join(", ")}.</p>` : ""}<p class="hint">Arrange pickups with your group. Seats aren’t reserved here.</p></details>`,
  );
  const statusSelect = $("#rsvp-form [name=status]"),
    seatsSelect = $("#rsvp-form [name=seats]");
  const syncSeats = () => {
    seatsSelect.disabled = statusSelect.value !== "going";
    if (seatsSelect.disabled) seatsSelect.value = "0";
  };
  statusSelect.onchange = syncSeats;
  syncSeats();
  $("#rsvp-form").onsubmit = async (submitted) => {
    submitted.preventDefault();
    if (!token) {
      groupDialog();
      return;
    }
    const button = submitted.target.querySelector("button");
    button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(submitted.target));
      await respond(event, {
        status: data.status,
        seats: data.status === "going" ? Number(data.seats) : 0,
      });
      $("#modal").close();
      toast("Response saved.");
    } catch (error) {
      $(".form-error").textContent = error.message;
      button.disabled = false;
    }
  };
}
async function quickResponse(button, action) {
  if (busy) return;
  if (!token) {
    groupDialog();
    return;
  }
  const event = state.events.find((e) => e.id === button.dataset[action]);
  const mine = event.responses.find((r) => r.mine);
  busy = true;
  button.disabled = true;
  try {
    await respond(
      event,
      action === "vote"
        ? { vote: mine?.vote ? 0 : 1 }
        : { status: mine?.status === "going" ? "maybe" : "going", seats: 0 },
    );
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  } finally {
    busy = false;
  }
}
function bind() {
  document.querySelectorAll("[data-view]").forEach(
    (button) =>
      (button.onclick = (event) => {
        event.preventDefault();
        navigate(button.dataset.view);
      }),
  );
  document.querySelectorAll("[data-event-filter]").forEach(
    (button) =>
      (button.onclick = () => {
        eventFilter = button.dataset.eventFilter;
        eventPage = 0;
        if (view !== "events") navigate("events");
        else render();
      }),
  );
  document.querySelectorAll("[data-page]").forEach(
    (button) =>
      (button.onclick = () => {
        eventPage += Number(button.dataset.page);
        render();
        window.scrollTo({ top: 0, behavior: "instant" });
      }),
  );
  document
    .querySelectorAll("[data-open]")
    .forEach((button) => (button.onclick = () => detail(button.dataset.open)));
  ["vote", "going"].forEach((action) =>
    document
      .querySelectorAll(`[data-${action}]`)
      .forEach(
        (button) => (button.onclick = () => quickResponse(button, action)),
      ),
  );
  document.querySelectorAll("[data-month]").forEach(
    (button) =>
      (button.onclick = () => {
        month = new Date(
          month.getFullYear(),
          month.getMonth() + Number(button.dataset.month),
          1,
        );
        selectedDay = null;
        render();
      }),
  );
  document.querySelectorAll("[data-day]").forEach(
    (button) =>
      (button.onclick = () => {
        selectedDay = button.dataset.day;
        render();
      }),
  );
  ["add", "empty-add"].forEach((id) => {
    if ($("#" + id)) $("#" + id).onclick = addDialog;
  });
  $("#invite").onclick = invite;
  $("#account").onclick = groupDialog;
  if ($("#group-settings")) $("#group-settings").onclick = groupDialog;
  if ($("#notifications")) $("#notifications").onclick = notificationDialog;
  if ($("#start")) $("#start").onclick = groupDialog;
}
function navigate(next) {
  if (!["home", "events", "calendar"].includes(next)) return;
  view = next;
  history.pushState({}, "", appUrl + "#" + next);
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
}
function syncRoute() {
  const next = location.hash.slice(1);
  view = ["home", "events", "calendar"].includes(next) ? next : "home";
  if (state) render();
}
window.addEventListener("popstate", syncRoute);
window.addEventListener("hashchange", syncRoute);
await refresh(true);
if (new URLSearchParams(location.search).has("join")) groupDialog();
setInterval(() => {
  if (token && !$("#modal").open && !document.hidden && !busy) refresh();
}, 15000);

async function openNotificationEvent(id, group) {
  if (!token) return;
  await refresh(true);
  if (group && state?.group.id !== group) {
    toast("This notification is for another group.");
    return;
  }
  if (state?.events.some((event) => event.id === id)) detail(id);
}
if ("serviceWorker" in navigator)
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "grid-open-event")
      openNotificationEvent(event.data.event, event.data.group);
  });
const notifiedEvent = new URLSearchParams(location.search).get("event");
if (notifiedEvent) {
  history.replaceState({}, "", appUrl + "#" + view);
  openNotificationEvent(notifiedEvent);
}
