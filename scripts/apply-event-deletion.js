// Uses the existing private repository secret; never prints its value or SQL data.
import { readFileSync } from "node:fs";
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token)
  throw new Error(
    "No Supabase setup token is saved. Run supabase/event-deletion.sql in Supabase SQL Editor instead.",
  );
const response = await fetch(
  "https://api.supabase.com/v1/projects/ecxbznnetkifbmpiudqu/database/query",
  {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: readFileSync("supabase/event-deletion.sql", "utf8"),
    }),
    signal: AbortSignal.timeout(45000),
  },
);
if (!response.ok)
  throw new Error(
    "Event deletion database update failed (HTTP " +
      response.status +
      "). Check the saved token or run the SQL update manually.",
  );
console.log(
  "Creator-only event deletion installed. Existing events were preserved.",
);
