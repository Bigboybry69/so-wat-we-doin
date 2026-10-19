import { parseSignInCode, signInCode } from "./identity.js";
import { findUpdate, updateUrl } from "./updates.js";
import {
  notificationStatus,
  enableNotifications,
  disableNotifications,
  syncDeviceNotifications,
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
  view = ["home", "events", "calendar", "food"].includes(location.hash.slice(1))
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
  refresh:
    "M20 11a8 8 0 0 0-14-5L3 9M3 3v6h6M4 13a8 8 0 0 0 14 5l3-3M21 21v-6h-6",
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
  const today = new Date(), start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  start.setDate(start.getDate() - start.getDay());
  const days = Array.from({length:7}, (_,index) => {
    const day = new Date(start); day.setDate(day.getDate()+index);
    const end = new Date(day); end.setDate(end.getDate()+1);
    const events = state.events.filter(e => new Date(e.starts)<end && new Date(e.ends)>day)
      .sort((a,b)=>new Date(a.starts)-new Date(b.starts));
    return {day,events};
  });
  const shortDate = value => value.toLocaleDateString(undefined,{month:'short',day:'numeric'});
  return `<section class="weekly-calendar panel" aria-label="This week’s events"><div class="week-heading"><div><h2>This week</h2><p>${shortDate(start)} – ${shortDate(days[6].day)}</p></div><button class="text-button" data-view="calendar">Full calendar ${icon('arrow')}</button></div><div class="week-grid">${days.map(({day,events})=>`<section class="week-day ${dayKey(day)===dayKey(today)?'is-today':''}" aria-label="${esc(date(day))}"><h3><span>${day.toLocaleDateString(undefined,{weekday:'short'})}</span><b>${day.getDate()}</b>${dayKey(day)===dayKey(today)?'<small>Today</small>':''}</h3><div class="week-plans">${events.map(e=>`<button class="week-event ${new Date(e.ends)<today?'has-ended':''}" data-open="${e.id}"><span class="week-event-time">${new Date(e.starts)<day?'Continues':time(e.starts)}</span><strong>${esc(e.title)}</strong><span class="week-event-status">${e.responses.some(r=>r.mine&&r.status==='going')?'You’re going':e.responses.filter(r=>r.status==='going').length+' going'}</span></button>`).join('')||'<p class="week-empty">No plans</p>'}</div></section>`).join('')}</div></section>`;
}
function foodPage() {
  const restaurants=state.restaurants||[];
  return `<section class="food-list" aria-label="Restaurants to try">${restaurants.map(r=>`<article class="food-card panel"><div class="food-mark">${icon('food')}</div><div class="food-copy"><h2>${esc(r.name)}</h2><p>Added by ${esc(r.author)}</p><a class="source-link" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">Open restaurant ${icon('arrow')}</a></div>${r.canDelete?`<button class="text-button food-remove" data-remove-restaurant="${esc(r.id)}" aria-label="Remove ${esc(r.name)}">Remove</button>`:''}</article>`).join('')||`<div class="empty-state panel">${icon('food')}<h2>Where should we eat?</h2><p>Save restaurants here for the next time your group is hungry.</p><button class="primary" id="empty-add">Add your first restaurant</button></div>`}</section>`;
}
function addRestaurantDialog() {
  if(!token){groupDialog();return;}
  modal(`<p class="eyebrow">FOOD TO TRY</p><h2>Add a restaurant</h2><form id="restaurant-form"><label>Restaurant name<input name="name" maxlength="120" required placeholder="A place you want to try"></label><label>Restaurant link<input name="url" type="url" maxlength="2048" required placeholder="https://…"></label><p class="hint">A website, map, or social link works. Everyone in your group can see it.</p><button class="primary">Save restaurant ${icon('check')}</button><p class="form-error" role="alert"></p></form>`);
  $('#restaurant-form').onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;
    try{await api('addRestaurant',Object.fromEntries(new FormData(form)));$('#modal').close();await refresh(true);toast('Restaurant saved for your group.');}
    catch(error){form.querySelector('.form-error').textContent=error.message;button.disabled=false;}
  };
}
function removeRestaurantDialog(id) {
  const restaurant=state.restaurants?.find(r=>r.id===id);if(!restaurant?.canDelete)return;
  modal(`<p class="eyebrow">FOOD TO TRY</p><h2>Remove ${esc(restaurant.name)}?</h2><p>This removes it from your group’s food list.</p><div class="group-actions"><button class="secondary" id="cancel-remove-food">Cancel</button><button class="danger" id="confirm-remove-food">Remove</button></div><p class="form-error" role="alert"></p>`);
  $('#cancel-remove-food').onclick=()=>$('#modal').close();
  $('#confirm-remove-food').onclick=async()=>{const button=$('#confirm-remove-food');button.disabled=true;try{await api('deleteRestaurant',{restaurant:id});$('#modal').close();await refresh(true);toast('Restaurant removed.');}catch(error){$('.form-error').textContent=error.message;button.disabled=false;}};
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
  const title = { home: "Home", events: "Your events", calendar: "Calendar", food: "Food" }[
    view
  ];
  $("#app").innerHTML =
    `<main class="shell dashboard-shell"><header class="app-header"><a class="compact-brand" href="#home" data-view="home" aria-label="The Grid home"><img src="./wordmark.svg" alt="The Grid" width="180" height="26"></a><div class="account-controls"><button class="update-control" data-check-update aria-label="Check for updates" title="Check for updates">${icon("refresh")}<span>Check for updates</span></button>${token ? `<button id="notifications" class="notification-button" aria-label="Notification settings" title="Notifications">${icon("bell")}</button>` : ""}<button id="account" class="identity">${icon("users")}${token ? esc(state.me.name) : "Join group"}</button></div></header><div class="dashboard-group"><button id="group-settings" class="group-name" ${!token ? "disabled" : ""}>${icon("users")} ${esc(state.group.name)}<span class="connection-dot ${token && !connected ? "offline" : ""}"></span></button><button id="invite" class="small-invite">${icon("plus")} Invite friends</button></div><nav class="page-nav" aria-label="Main navigation">${[
      ["home", "home", "Home"],
      ["events", "grid", "Your events"],
      ["calendar", "calendar", "Calendar"],
      ["food", "food", "Food"],
    ]
      .map(
        ([value, symbol, label]) =>
          `<a href="#${value}" data-view="${value}" class="${view === value ? "selected" : ""}" ${view === value ? 'aria-current="page"' : ""}>${icon(symbol)}<span>${label}</span></a>`,
      )
      .join(
        "",
      )}</nav><div class="page-heading"><div><h1>${title}</h1><p>${view === "home" ? "What’s happening this week." : view === "events" ? "All the plans shared with your group." : view === "food" ? "Places your group wants to try." : "Find a day. Make a plan."}</p></div><button class="primary" id="add">${icon("plus")} ${view === "food" ? "Add restaurant" : "Add event"}</button></div>${!token ? '<div class="demo-banner"><span>New here? Create a group.</span><div class="welcome-actions"><button id="start">Create group</button><button id="restore">Sign back in</button></div></div>' : ""}<div class="page-content" id="page-content">${view === "home" ? dashboard() : view === "calendar" ? calendar() : view === "food" ? foodPage() : eventsPage()}</div><footer><span class="footer-mark">THE GRID</span><button class="footer-update" data-check-update>${icon("refresh")} Check for updates</button></footer></main>`;
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
  let inviteCode = new URLSearchParams(location.search).get("join");
  if (token && state && inviteCode === state.group.id) { history.replaceState({}, "", appUrl+"#"+view); inviteCode=null; toast("You’re already in this group."); }
  if (token && !inviteCode) {
    modal(
      `<p class="eyebrow">YOUR GROUP</p><h2>${esc(state.group.name)}</h2><p>You're connected as <strong>${esc(state.me.name)}</strong>.</p><div class="member-list">${state.members.map((m) => `<span>${esc(m.name)}${m.isOwner ? ' <small>Owner</small>' : ''}${m.canRemove ? `<button class="text-button" data-remove-member="${esc(m.id)}">Remove</button>` : ''}</span>`).join("")}</div><div class="group-actions"><button id="share-group" class="primary">${icon("plus")} Invite friends</button><button id="edit-group" class="secondary">Edit group</button></div><button id="recovery-code" class="secondary recovery-entry">Use another device</button><button id="backup-code" class="text-button">Save a private backup code</button><button id="leave" class="text-button">Sign out on this device</button><p class="hint">Your membership stays. Link your next device before signing out, or save a backup code.</p>`,
    );
    $("#share-group").onclick = invite;
    $("#edit-group").onclick = editGroupDialog;
    $("#recovery-code").onclick = () => recoveryCodeDialog();
    $("#backup-code").onclick = backupCodeDialog;
    document.querySelectorAll("[data-remove-member]").forEach(button => button.onclick = () => removeMemberDialog(button.dataset.removeMember));
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
    `<p class="eyebrow">WELCOME TO THE GRID</p><h2>${inviteCode ? "Your people are here." : "Start with your people."}</h2><p>${inviteCode ? "Enter your name to join their plans." : "One group for events, votes, and rides."}</p><form id="group-form"><label>Your name<input name="name" autocomplete="given-name" maxlength="40" required placeholder="Your name"></label>${inviteCode ? "" : '<label>Group name<input name="group" maxlength="120" required placeholder="The weekend crew"></label>'}<button class="primary">${inviteCode ? "Join group" : "Create group"} ${icon("arrow")}</button><p class="form-error" role="alert"></p></form><button id="restore-from-join" class="text-button">Already a member? Sign back in</button>`,
  );
  $("#restore-from-join").onclick = signInDialog;
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

function backupCodeDialog() {
  modal(`<p class="eyebrow">YOUR PRIVATE SIGN-IN</p><h2>Save a backup code</h2><p>Copy this code. On another device, tap <strong>Sign back in → Have a saved backup code?</strong> and paste it. You’ll return as ${esc(state.me.name)} in ${esc(state.group.name)}.</p><label>Private sign-in code<textarea id="private-code" readonly autocomplete="off" autocapitalize="off" spellcheck="false">${esc(signInCode(token))}</textarea></label><p class="hint">Keep it private: anyone with this code can act as you. Save it in your password manager. It is not a group invite.</p><div class="group-actions recovery-actions"><button id="copy-private-code" class="primary">Copy my code</button><button id="done-private-code" class="secondary">Done</button></div><p class="form-error" role="alert"></p>`);
  $('#copy-private-code').onclick = async () => {
    try {await navigator.clipboard.writeText(signInCode(token));toast('Private sign-in code copied. Keep it for yourself.');}
    catch {$('#private-code').select();$('.form-error').textContent='Select and copy the code above.';}
  };
  $('#done-private-code').onclick = () => $('#modal').close();
}
async function recoveryCodeDialog() {
  modal(`<p class="eyebrow">LINK A DEVICE</p><h2>Use another device</h2><p>Generating your private linking code…</p><p class="form-error" role="alert"></p>`);
  try {
    const result=await api('createDeviceLink',{});
    modal(`<p class="eyebrow">LINK A DEVICE</p><h2>Same profile. New device.</h2><p>On your new device, open The Grid and tap <strong>Sign back in</strong>. Enter these six digits:</p><div class="device-code" aria-label="Linking code">${esc(result.code)}</div><p class="hint">Expires in 10 minutes. Works once. Keep it private — it signs in as you.</p><button id="done-link" class="primary">Done</button>`);
    $('#done-link').onclick=()=>$('#modal').close();
  } catch(error) {if($('.form-error'))$('.form-error').textContent=error.message;}
}
function removeMemberDialog(id) {
  const member=state.members.find(m=>String(m.id)===String(id));if(!member?.canRemove)return;
  modal(`<p class="eyebrow">GROUP MEMBERS</p><h2>Remove ${esc(member.name)}?</h2><p>This signs them out on all linked devices and removes their votes and ride offers. Their shared events stay.</p><div class="group-actions"><button id="cancel-remove" class="secondary">Cancel</button><button id="confirm-remove" class="danger">Remove member</button></div><p class="form-error" role="alert"></p>`);
  $('#cancel-remove').onclick=groupDialog;
  $('#confirm-remove').onclick=async()=>{
    $('#confirm-remove').disabled=true;
    try{await api('removeMember',{member:id});await refresh(true);groupDialog();toast('Member removed.');}
    catch(error){$('.form-error').textContent=error.message;$('#confirm-remove').disabled=false;}
  };
}
function signInDialog() {
  modal(`<p class="eyebrow">WELCOME BACK</p><h2>Sign back in</h2><p>On your signed-in device, tap your name → <strong>Use another device</strong>. Enter the six-digit code here.</p><form id="restore-form"><label>Six-digit linking code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required placeholder="000000"></label><button class="primary">Link this device ${icon('arrow')}</button><p class="form-error" role="alert"></p></form><details class="backup-option"><summary>Have a saved backup code?</summary><form id="backup-form"><label>Private backup code<input name="code" type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false" required placeholder="GRID-…"></label><button class="secondary">Use backup code</button><p class="form-error" role="alert"></p></form></details>`);
  const restore=async(candidate)=>{
    const restored=await requestApi('state',undefined,candidate);
    ++refreshNumber;token=candidate;localStorage.setItem(storageKey,token);state=restored;connected=true;
    history.replaceState({},'',appUrl+'#'+view);$('#modal').close();render();toast('Welcome back, '+state.me.name+'.');
    syncDeviceNotifications(api).catch(()=>toast('Signed in. Check the bell to enable alerts on this device.'));
  };
  for(const selector of ['#restore-form','#backup-form']) $(selector).onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;
    try {
      const code=new FormData(form).get('code').trim();
      const candidate=form.id==='backup-form'?parseSignInCode(code):(await requestApi('claimDeviceLink',{code},'')).token;
      await restore(candidate);
    }catch(error){form.querySelector('.form-error').textContent=error.message;button.disabled=false;}
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
      state.group = {...state.group,...group};
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
    }</section><details class="ride-details"><summary>${icon("car")} Carpool details</summary>${drivers.length ? drivers.map((r) => `<p><strong>${esc(r.name)}</strong> offers ${r.seats} passenger seats.</p>`).join("") : "<p>No ride offers yet.</p>"}${passengers.length ? `<p>Going without a ride offer: ${passengers.map((r) => esc(r.name)).join(", ")}.</p>` : ""}<p class="hint">Arrange pickups with your group. Seats aren’t reserved here.</p></details>${event.canDelete ? '<button id="delete-event" class="delete-event">Delete event</button>' : event.creatorKnown === false ? '<p class="hint legacy-event">This older event has no recorded creator, so deletion is unavailable.</p>' : ""}`,
  );
  if ($("#delete-event"))
    $("#delete-event").onclick = () => confirmDeleteEvent(event);
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
function confirmDeleteEvent(event) {
  modal(
    `<p class="eyebrow">DELETE EVENT</p><h2>Delete this event?</h2><p><strong>${esc(event.title)}</strong> will be removed for everyone, including its votes and ride offers. This can’t be undone.</p><div class="group-actions delete-actions"><button class="secondary" id="cancel-delete-event">Keep event</button><button class="danger" id="confirm-delete-event">Delete event</button></div><p class="form-error" role="alert"></p>`,
  );
  $("#cancel-delete-event").onclick = () => detail(event.id);
  $("#confirm-delete-event").onclick = async () => {
    const button = $("#confirm-delete-event");
    button.disabled = true;
    $("#cancel-delete-event").disabled = true;
    try {
      await api("deleteEvent", { event: event.id });
      state.events = state.events.filter((e) => e.id !== event.id);
      $("#modal").close();
      render();
      toast("Event deleted for everyone.");
      await refresh(true);
    } catch (error) {
      const message = $("#modal .form-error");
      if (message) message.textContent = error.message;
      button.disabled = false;
      const cancel = $("#cancel-delete-event");
      if (cancel) cancel.disabled = false;
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
let checkingUpdate = false;
async function checkForUpdates() {
  if (checkingUpdate) return;
  checkingUpdate = true;
  document
    .querySelectorAll("[data-check-update]")
    .forEach((button) => (button.disabled = true));
  toast("Checking for updates…");
  try {
    const currentVersion = document.querySelector(
      'meta[name="app-version"]',
    )?.content;
    if (!currentVersion || currentVersion === "development")
      throw new Error("Update checks are available on the published website.");
    const latest = await findUpdate(currentVersion, appUrl);
    if (latest.available) {
      toast("New version found. Updating…");
      location.replace(updateUrl(location.href, latest.version));
    } else toast("You’re on the latest published version.");
  } catch (error) {
    toast(error.message || "Couldn’t check for updates. Please try again.");
  } finally {
    checkingUpdate = false;
    document
      .querySelectorAll("[data-check-update]")
      .forEach((button) => (button.disabled = false));
  }
}
function bind() {
  document.querySelectorAll("[data-remove-restaurant]").forEach(button=>button.onclick=()=>removeRestaurantDialog(button.dataset.removeRestaurant));
  document
    .querySelectorAll("[data-check-update]")
    .forEach((button) => (button.onclick = checkForUpdates));
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
    if ($("#" + id)) $("#" + id).onclick = view === "food" ? addRestaurantDialog : addDialog;
  });
  $("#invite").onclick = invite;
  $("#account").onclick = groupDialog;
  if ($("#group-settings")) $("#group-settings").onclick = groupDialog;
  if ($("#notifications")) $("#notifications").onclick = notificationDialog;
  if ($("#start")) $("#start").onclick = groupDialog;
  if ($("#restore")) $("#restore").onclick = signInDialog;
}
function navigate(next) {
  if (!["home", "events", "calendar", "food"].includes(next)) return;
  view = next;
  history.pushState({}, "", appUrl + "#" + next);
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
}
function syncRoute() {
  const next = location.hash.slice(1);
  view = ["home", "events", "calendar", "food"].includes(next) ? next : "home";
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
  else toast("This event is no longer available.");
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
