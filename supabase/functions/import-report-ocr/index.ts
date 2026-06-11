import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIXED_TABLES = ["AR1", "AR2", "AR3", "BJ", "OP1", "OP2", "OP3", "OP4", "OP5", "Total"];

const formatNumber = (raw: unknown): string => {
  if (raw === null || raw === undefined) return "0";
  const s = String(raw).replace(/[^0-9-]/g, "");
  if (!s || s === "-") return "0";
  // remove leading zeros but keep at least one digit
  const cleaned = s.replace(/^0+(?=\d)/, "") || "0";
  return cleaned.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth: require valid JWT to prevent unauthenticated AI credit abuse
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await sb.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { image_base64, mime_type } = await req.json();
    if (!image_base64 || typeof image_base64 !== "string") {
      return new Response(JSON.stringify({ error: "image_base64 is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const mt = mime_type && typeof mime_type === "string" ? mime_type : "image/jpeg";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an OCR specialist for casino daily report photos titled "Premier Casino Consolidating Cash Desk Report".
Extract ONLY the FIRST/TOP table from the image. Ignore everything below the table.

The table has columns (in order): Table | Open | Fill | Credit | Close | Drop | Result
Rows are: AR1, AR2, AR3, BJ, OP1, OP2, OP3, OP4, OP5, Total

Rules:
- Return rows in this EXACT fixed order: AR1, AR2, AR3, BJ, OP1, OP2, OP3, OP4, OP5, Total.
- If a row is missing from the image, still return it with all numeric fields = "0".
- Numbers: digits only (remove commas, spaces, currency symbols). Empty cells, dashes, or unclear values = "0".
- Negative numbers: prefix with minus sign.
- Date: from the report header. Convert to YYYY-MM-DD. If year unclear assume current year.
- If date is unreadable, return empty string for date.
- Always call the extract_report function. Never reply with plain text.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the top table from this casino daily report image." },
              { type: "image_url", image_url: { url: `data:${mt};base64,${image_base64}` } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_report",
              description: "Extract the top table from the daily cash desk report",
              parameters: {
                type: "object",
                properties: {
                  date: { type: "string", description: "Report date in YYYY-MM-DD format" },
                  rows: {
                    type: "array",
                    description: "Exactly 10 rows in fixed order: AR1, AR2, AR3, BJ, OP1-OP5, Total",
                    items: {
                      type: "object",
                      properties: {
                        table: { type: "string" },
                        open: { type: "string" },
                        fill: { type: "string" },
                        credit: { type: "string" },
                        close: { type: "string" },
                        drop: { type: "string" },
                        result: { type: "string" },
                      },
                      required: ["table", "open", "fill", "credit", "close", "drop", "result"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["date", "rows"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_report" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "OCR processing failed", needs_review: true }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "Could not extract table", needs_review: true }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const extracted = JSON.parse(toolCall.function.arguments);
    const rawRows: any[] = Array.isArray(extracted.rows) ? extracted.rows : [];

    // Build a lookup by table name (case-insensitive, normalize)
    const lookup = new Map<string, any>();
    for (const r of rawRows) {
      const key = String(r.table || "").trim().toUpperCase();
      if (key) lookup.set(key, r);
    }

    // Always emit fixed 10 rows in order
    const rows = FIXED_TABLES.map((tname) => {
      const r = lookup.get(tname.toUpperCase()) || {};
      return {
        table: tname,
        open: formatNumber(r.open),
        fill: formatNumber(r.fill),
        credit: formatNumber(r.credit),
        close: formatNumber(r.close),
        drop: formatNumber(r.drop),
        result: formatNumber(r.result),
      };
    });

    return new Response(
      JSON.stringify({ date: extracted.date || "", rows, needs_review: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("import-report-ocr error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", needs_review: true }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
