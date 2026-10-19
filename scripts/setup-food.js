// Uses the existing private repository secret; never prints its value or SQL data.
import { readFileSync } from "node:fs";
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token)
  throw new Error(
    "No Supabase setup token is saved. Run supabase/food.sql in Supabase SQL Editor instead.",
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
      query: readFileSync("supabase/food.sql", "utf8"),
    }),
    signal: AbortSignal.timeout(45000),
  },
);
if (!response.ok)
  throw new Error(
    "Restaurant list database update failed (HTTP " +
      response.status +
      "). Check the saved token or run the SQL update manually.",
  );
console.log(
  "Shared restaurant list installed. Existing groups and events were preserved.",
);
