import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sbAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await sbAuth.auth.getUser();
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
            content: `You are an OCR specialist for POS bank receipts (cheques) from Tanzania.
A photo can contain ONE or MANY receipts laid out next to each other.
Extract EVERY visible receipt as a separate item.

For each receipt extract:
- date: YYYY-MM-DD (from "Date" field, e.g. 08/04/2026 → 2026-04-08)
- time: HH:MM:SS or HH:MM (from "Time" field)
- receipt_no: the "Receipt No" / "Recerpt No" / "Receipt:" value (numeric, e.g. "002005")
- approval_code: the "Approval Code" value (6 digits, e.g. "386415")
- amount: numeric, only digits (no commas/spaces). E.g. "TZS 206,000.00" → 206000
- currency: 3-letter code, prefer TZS or USD for these receipts
- bank: bank name from logo/header (e.g. "NBC", "CRDB", "NMB", "Equity", "Stanbic")
- merchant: merchant name from header (e.g. "JOKER CASINO LIMITED")
- card_masked: masked card PAN as printed (e.g. "4313 32** **** 0648")

Rules:
- Return ALL receipts visible in the image, in reading order (top-to-bottom, left-to-right).
- If currency is not explicitly visible but the receipt is a Tanzanian bank POS receipt, infer "TZS".
- Only return "USD" when USD is explicitly printed or clearly implied by the amount/currency marker.
- If a field is unreadable or absent, return empty string "" (or 0 for amount).
- Always call the extract_checks function. Never reply with plain text.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract every bank receipt visible in this photo." },
              { type: "image_url", image_url: { url: `data:${mt};base64,${image_base64}` } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_checks",
              description: "Extract all bank receipts visible in the photo",
              parameters: {
                type: "object",
                properties: {
                  checks: {
                    type: "array",
                    description: "All receipts visible in the photo",
                    items: {
                      type: "object",
                      properties: {
                        date: { type: "string" },
                        time: { type: "string" },
                        receipt_no: { type: "string" },
                        approval_code: { type: "string" },
                        amount: { type: "number" },
                        currency: { type: "string" },
                        bank: { type: "string" },
                        merchant: { type: "string" },
                        card_masked: { type: "string" },
                      },
                      required: [
                        "date", "time", "receipt_no", "approval_code",
                        "amount", "currency", "bank", "merchant", "card_masked",
                      ],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["checks"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_checks" } },
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
      let providerMsg = "OCR processing failed";
      try {
        const parsed = JSON.parse(t);
        const raw = parsed?.error?.metadata?.raw;
        if (raw) {
          const inner = JSON.parse(raw);
          providerMsg = inner?.error?.message || providerMsg;
        } else if (parsed?.error?.message) {
          providerMsg = parsed.error.message;
        }
      } catch { /* ignore */ }
      return new Response(JSON.stringify({ error: `OCR: ${providerMsg}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "Could not extract receipts", checks: [] }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const extracted = JSON.parse(toolCall.function.arguments);
    const checks = Array.isArray(extracted.checks)
      ? extracted.checks.map((check: Record<string, unknown>) => {
          const rawCurrency = typeof check.currency === "string" ? check.currency.trim().toUpperCase() : "";
          const normalizedCurrency = rawCurrency === "USD" ? "USD" : "TZS";

          return {
            ...check,
            currency: normalizedCurrency,
          };
        })
      : [];

    return new Response(JSON.stringify({ checks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("bank-check-ocr error:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
