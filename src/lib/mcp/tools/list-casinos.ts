import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_casinos",
  title: "List casinos",
  description: "List the casinos the signed-in user can access (id, name, slug).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Not authenticated");
    const { data, error } = await supabaseForUser(ctx)
      .from("casinos")
      .select("id, name, slug")
      .order("name");
    if (error) throw new ToolError(error.message);
    const casinos = (data ?? []).map((c) => ({ id: c.id, name: c.name, slug: c.slug ?? null }));
    return {
      content: [{ type: "text", text: JSON.stringify(casinos) }],
      structuredContent: { casinos },
    };
  },
});
