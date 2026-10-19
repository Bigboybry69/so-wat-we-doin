export async function findUpdate(currentVersion, baseUrl, fetcher = fetch) {
  const url = new URL("version.json", baseUrl);
  url.searchParams.set("check", Date.now().toString());
  const response = await fetcher(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      "Couldn’t check for updates. Check your connection and try again.",
    );
  const latest = await response.json();
  if (!/^[a-f0-9]{12}$/.test(latest.version || ""))
    throw new Error(
      "The latest version isn’t available yet. Try again shortly.",
    );
  return {
    version: latest.version,
    available: latest.version !== currentVersion,
  };
}
export function updateUrl(href, version) {
  const url = new URL(href);
  url.searchParams.set("update", version);
  return url.href;
}
