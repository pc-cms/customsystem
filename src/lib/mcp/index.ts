import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listCasinos from "./tools/list-casinos";
import getDayClosings from "./tools/get-day-closings";
import searchPlayers from "./tools/search-players";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "custom-cms",
  title: "Custom CMS",
  version: "0.1.0",
  instructions:
    "Read-only casino management tools. Start with `list_casinos` to get casino ids, then use `get_day_closings` for daily results or `search_players` to find players. Amounts are in TZS; dates are business days (07:00 EAT rollover).",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listCasinos, getDayClosings, searchPlayers],
});
