import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, existingCode } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are NexusAI Code Canvas — a world-class web developer. When the user asks you to create or build a website/page/app, you MUST respond with a SINGLE, complete, self-contained HTML file that includes all CSS (inline <style>) and JavaScript (inline <script>).

CRITICAL RULES:
1. Output ONLY the raw HTML code — no markdown, no explanation, no code fences, no backticks.
2. Start your response with <!DOCTYPE html> and end with </html>.
3. Use modern CSS (flexbox, grid, custom properties, gradients, animations).
4. Make it visually stunning with professional design, smooth animations, and responsive layout.
5. Use Google Fonts via CDN link for beautiful typography.
6. Include placeholder images from https://picsum.photos or inline SVGs.
7. Add smooth scroll, hover effects, and micro-interactions.
8. Make it fully responsive (mobile + desktop).
9. Use semantic HTML5 elements.
10. If the user asks to EDIT existing code, apply the requested changes to the provided code and return the full updated HTML.

Remember: Output ONLY raw HTML. No markdown. No explanation before or after. Just pure HTML code.`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
    ];

    if (existingCode) {
      messages.push({
        role: "user",
        content: `Here is the current code:\n\n${existingCode}\n\nPlease apply this change: ${prompt}`,
      });
    } else {
      messages.push({ role: "user", content: prompt });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits depleted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("Code generation error:", response.status, t);
      return new Response(JSON.stringify({ error: "Code generation failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("code-generate error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
