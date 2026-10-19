import webpush from "npm:web-push@3.6.7";
import { timingSafeEqual } from "node:crypto";

const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error("Missing worker configuration: " + name);
  return value;
};
Deno.serve(async (request: Request) => {
  const secret = Deno.env.get("DOIN_DISPATCH_SECRET") || "";
  const supplied = request.headers.get("x-grid-dispatch") || "";
  if (
    !secret ||
    !/^[a-f0-9]{64}$/.test(supplied) ||
    secret.length !== supplied.length ||
    !timingSafeEqual(
      new TextEncoder().encode(secret),
      new TextEncoder().encode(supplied),
    )
  ) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  try {
    const rpc = async (name: string, body: unknown = {}) => {
      const response = await fetch(
        required("SUPABASE_URL") + "/rest/v1/rpc/" + name,
        {
          method: "POST",
          headers: {
            apikey: required("SUPABASE_SERVICE_ROLE_KEY"),
            Authorization: "Bearer " + required("SUPABASE_SERVICE_ROLE_KEY"),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) throw new Error("Notification queue operation failed.");
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    };
    webpush.setVapidDetails(
      "https://bigboybry69.github.io/so-wat-we-doin/",
      required("DOIN_VAPID_PUBLIC_KEY"),
      required("DOIN_VAPID_PRIVATE_KEY"),
    );
    const jobs = await rpc("doin_push_claim");
    await Promise.all(
      jobs.map(async (job: any) => {
        let result = "sent";
        try {
          await webpush.sendNotification(
            job.subscription,
            JSON.stringify({
              title: job.title,
              body: job.body,
              event: job.event,
              group: job.group,
            }),
            { TTL: 86400, urgency: "normal", timeout: 12000 },
          );
        } catch (error: any) {
          const status = Number(error.statusCode || 0);
          result = [404, 410].includes(status)
            ? "expired"
            : [400, 413].includes(status)
              ? "permanent"
              : "retry";
        }
        await rpc("doin_push_finish", {
          p_id: job.id,
          p_attempt: job.attempt,
          p_result: result,
        });
      }),
    );
    return Response.json({ processed: jobs.length });
  } catch {
    // Do not log subscription endpoints, keys, credentials, or event payloads.
    return new Response(
      "Notification worker unavailable; queued jobs will retry.",
      { status: 503 },
    );
  }
});
