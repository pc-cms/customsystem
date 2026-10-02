import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_players",
  title: "Search players",
  description: "Find players by name, nickname or phone (up to 25 results).",
  inputSchema: {
    query: z.string().trim().min(2).max(60).describe("Part of the name, nickname or phone."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Not authenticated");
    const q = query.replace(/[%,()]/g, " ");
    const { data, error } = await supabaseForUser(ctx)
      .from("players")
      .select("id, casino_id, full_name, nickname, phone, category, status, player_type")
      .or(`full_name.ilike.%${q}%,nickname.ilike.%${q}%,phone.ilike.%${q}%`)
      .neq("status", "merged")
      .limit(25);
    if (error) throw new ToolError(error.message);
    const players = (data ?? []).map((p) => ({
      id: p.id,
      casino_id: p.casino_id,
      full_name: p.full_name ?? null,
      nickname: p.nickname ?? null,
      phone: p.phone ?? null,
      category: p.category ?? null,
      status: p.status ?? null,
      player_type: p.player_type ?? null,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(players) }],
      structuredContent: { players },
    };
  },
});
