import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, category, model, searchContext } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const multilingualNote = `
IMPORTANT: You are multilingual. If the user writes in any language, respond fluently in that same language. You have excellent support for Indian languages including Telugu (తెలుగు), Hindi (हिंदी), Kannada (ಕನ್ನಡ), Tamil (தமிழ்), Malayalam (മലയാളം), Bengali (বাংলা), Marathi (मराठी), Gujarati (ગુજરાતી), Punjabi (ਪੰਜਾਬੀ), Odia (ଓଡ଼ିଆ), and Urdu (اردو). Always match the user's language naturally.`;

    const systemPrompts: Record<string, string> = {
      coding: "You are NexusAI, an elite coding assistant. Provide clean, efficient, well-documented code solutions. Use markdown code blocks with language tags. Explain your approach concisely." + multilingualNote,
      dsa: "You are NexusAI, a DSA expert specializing in FAANG/MAANG interview problems. For every problem: 1) Clarify the approach 2) Provide optimal solution with time/space complexity 3) Include code in the requested language with detailed comments. Cover edge cases." + multilingualNote,
      social: "You are NexusAI, a social media strategy expert. Provide actionable content ideas, engagement strategies, growth hacks, and platform-specific tips. Be creative and data-driven." + multilingualNote,
      education: "You are NexusAI, an educational tutor. Explain concepts clearly with examples, analogies, and step-by-step breakdowns. Adapt explanations to the learner's level." + multilingualNote,
      general: "You are NexusAI, a highly capable AI assistant with no limits on topics. Provide thorough, accurate, and helpful responses. Use markdown formatting for readability. Be direct and efficient." + multilingualNote,
    };

    const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const dateNote = `\nToday's date is ${today}. Use this when the user asks about the current date, day, or time-related questions.`;
    const systemContent = (systemPrompts[category] || systemPrompts.general) + dateNote;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemContent },
          ...messages,
        ],
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
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
