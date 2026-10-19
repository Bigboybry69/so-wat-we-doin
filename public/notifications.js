export function notificationSupport() {
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (
    ios &&
    !matchMedia("(display-mode: standalone)").matches &&
    !navigator.standalone
  )
    return "install";
  if (
    !isSecureContext ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  )
    return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return "supported";
}
const registration = () =>
  navigator.serviceWorker
    .register(new URL("./sw.js", import.meta.url), { scope: "./" })
    .then(() => navigator.serviceWorker.ready);
export async function notificationStatus(api) {
  const support = notificationSupport();
  if (support !== "supported") return { support };
  const worker = await registration();
  const subscription = await worker.pushManager.getSubscription();
  const server = await api("pushStatus", {
    endpoint: subscription?.endpoint || "",
  });
  return {
    ...server,
    support,
    subscribed: Boolean(
      subscription &&
      server.subscribed &&
      Notification.permission === "granted",
    ),
  };
}
export async function enableNotifications(api, publicKey) {
  // Must be called directly from a tap/click for iPhone permission prompts.
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error(
      "Notifications weren’t allowed. You can change this in your device settings.",
    );
  const worker = await registration();
  const key = Uint8Array.from(
    atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
  let sub = await worker.pushManager.getSubscription(),
    created = false;
  if (
    sub &&
    sub.options.applicationServerKey &&
    String(new Uint8Array(sub.options.applicationServerKey)) !== String(key)
  ) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) {
    sub = await worker.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });
    created = true;
  }
  try {
    await api("pushSubscribe", { subscription: sub.toJSON() });
  } catch (error) {
    if (created) await sub.unsubscribe();
    throw error;
  }
}
export async function disableNotifications(api) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const worker = await registration(),
    sub = await worker.pushManager.getSubscription();
  if (!sub) return;
  await api("pushUnsubscribe", { endpoint: sub.endpoint });
  await sub.unsubscribe();
}

// Move an already-enabled device subscription after an explicit identity switch.
// Never request notification permission or create a subscription automatically.
export async function syncDeviceNotifications(api) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window) || Notification.permission !== 'granted') return;
  const worker = await navigator.serviceWorker.getRegistration(new URL('./', import.meta.url));
  const sub = await worker?.pushManager.getSubscription();
  if (sub) await api('pushSubscribe', { subscription: sub.toJSON() });
}
