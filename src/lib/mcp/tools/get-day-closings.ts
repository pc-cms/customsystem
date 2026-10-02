import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export default defineTool({
  name: "get_day_closings",
  title: "Get day closings",
  description: "Read closed business-day results (tables, slots, cash desk) for one casino in a date range (max 62 days).",
  inputSchema: {
    casino_id: z.string().uuid().describe("Casino id from list_casinos."),
    from: isoDate.describe("First business date, YYYY-MM-DD."),
    to: isoDate.describe("Last business date, YYYY-MM-DD."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ casino_id, from, to }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Not authenticated");
    if (from > to) throw new ToolError("'from' must be on or before 'to'");
    const days = (Date.parse(to) - Date.parse(from)) / 86400000;
    if (days > 62) throw new ToolError("Range too long (max 62 days)");
    const { data, error } = await supabaseForUser(ctx)
      .from("fin_day_closing")
      .select("business_date, tables_result, slots_result, cashdesk_win, players_card_balance, drop_slots, net_win, notes")
      .eq("casino_id", casino_id)
      .gte("business_date", from)
      .lte("business_date", to)
      .order("business_date");
    if (error) throw new ToolError(error.message);
    const closings = (data ?? []).map((d) => ({
      business_date: d.business_date,
      tables_result: d.tables_result == null ? null : Number(d.tables_result),
      slots_result: d.slots_result == null ? null : Number(d.slots_result),
      cashdesk_win: d.cashdesk_win == null ? null : Number(d.cashdesk_win),
      players_card_balance: d.players_card_balance == null ? null : Number(d.players_card_balance),
      drop_slots: d.drop_slots == null ? null : Number(d.drop_slots),
      net_win: d.net_win == null ? null : Number(d.net_win),
      notes: d.notes ?? null,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(closings) }],
      structuredContent: { closings },
    };
  },
});
