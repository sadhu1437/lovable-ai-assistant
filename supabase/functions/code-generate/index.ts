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

    const systemPrompt = `You are NexusAI Code Canvas — a world-class full-stack web developer. When the user asks you to create or build a website/page/app, generate COMPLETE code with both frontend and backend when appropriate.

OUTPUT FORMAT:
- For simple static websites: Output a single complete HTML file starting with <!DOCTYPE html>
- For full-stack apps: Use this multi-file format:

===FILE: index.html===
(complete HTML with inline CSS and JS)

===FILE: server.js===
(Node.js/Express backend code)

===FILE: api.py===
(Python Flask/FastAPI backend if requested)

===FILE: schema.sql===
(Database schema if needed)

===FILE: package.json===
(Dependencies if backend is included)

CRITICAL RULES:
1. Output ONLY raw code — no markdown, no explanation, no code fences, no backticks.
2. For single-file output: Start with <!DOCTYPE html> and end with </html>.
3. For multi-file output: Use ===FILE: filename=== separators.
4. Use modern CSS (flexbox, grid, custom properties, gradients, animations).
5. Make it visually stunning with professional design, smooth animations, and responsive layout.
6. Use Google Fonts via CDN link for beautiful typography.
7. Include placeholder images from https://picsum.photos or inline SVGs.
8. Add smooth scroll, hover effects, and micro-interactions.
9. Make it fully responsive (mobile + desktop).
10. Use semantic HTML5 elements.
11. For backend code: Include proper error handling, CORS setup, and clear comments.
12. If the user asks to EDIT existing code, apply the requested changes and return ALL files.

WHEN TO INCLUDE BACKEND:
- User mentions "full-stack", "backend", "API", "server", "database", "authentication", "login", "CRUD"
- E-commerce with cart/checkout logic
- Apps needing data persistence
- User management or auth flows
- Any dynamic data processing

For backend, prefer Node.js/Express unless user specifies otherwise.

Remember: Output ONLY raw code. No markdown. No explanation. Just code.`;

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
