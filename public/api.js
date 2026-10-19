const config = window.DOIN_CONFIG || {};
const configured = Boolean(config.supabaseUrl && config.supabaseKey);
const base = new URL("./", location.href);
export const appUrl = base.href;
export async function api(path, data, token) {
  if (!configured && location.hostname.endsWith("github.io")) {
    throw new Error(
      "Shared plans are not connected yet. Set up the Supabase database and website settings first.",
    );
  }
  let url, options;
  if (configured) {
    const names = {
      groups: "doin_create_group",
      group: "doin_update_group",
      join: "doin_join",
      state: "doin_state",
      events: "doin_add_event",
      deleteEvent: "doin_delete_event",
      respond: "doin_respond",
      pushStatus: "doin_push_status",
      pushSubscribe: "doin_push_subscribe",
      pushUnsubscribe: "doin_push_unsubscribe",
    };
    url = config.supabaseUrl.replace(/\/$/, "") + "/rest/v1/rpc/" + names[path];
    options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.supabaseKey,
      },
      body: JSON.stringify({ p_token: token || "", p_data: data || {} }),
    };
  } else {
    url = "/api/" + path;
    options = {
      method: data ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    };
  }
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error(
      "Can’t connect to your plans. Check your connection and try again.",
    );
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      "The shared database is not configured for this website yet.",
    );
  }
  if (!response.ok) {
    if (result.code === "PGRST202" && path === "deleteEvent")
      throw new Error(
        "Event deletion needs a one-time database update. Ask the group organizer to run the event deletion update.",
      );
    if (result.code === "PGRST202" && path === "group")
      throw new Error(
        "Group editing needs a one-time database update. Run supabase/group-settings.sql in the Supabase SQL Editor.",
      );
    if (result.code === "PGRST202" && path.startsWith("push"))
      throw new Error("Notifications need the one-time server setup first.");
    if (result.code === "PGRST202")
      throw new Error(
        "The database setup is not installed yet. Run supabase/schema.sql in the Supabase SQL Editor.",
      );
    if (response.status === 401 && configured)
      throw new Error(
        "The Supabase public key was not accepted. Check the website settings.",
      );
    throw new Error(
      result.error ||
        result.message ||
        "Could not save your changes. Please try again.",
    );
  }
  return result;
}
