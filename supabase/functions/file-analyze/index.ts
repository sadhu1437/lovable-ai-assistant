import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { fileName, fileType, fileContent, userPrompt } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const isImage = fileType?.startsWith("image/");
    
    const systemPrompt = `You are NexusAI, a friendly and efficient file analyst. When a user uploads a file or image, you must:

1. **Identify & Describe**: Clearly describe what the file/image contains
2. **Key Points**: Extract the most important and efficient points — don't skip anything meaningful
3. **Analysis**: Provide insights, patterns, or notable observations
4. **Solutions & Suggestions**: Offer actionable solutions, improvements, or next steps based on the content
5. **Summary**: End with a brief, friendly summary

Be thorough but concise. Use bullet points and headers for clarity. Be warm and approachable in tone. Use emojis sparingly to keep it friendly.`;

    let userMessage: any;

    if (isImage) {
      // For images, send as multimodal content
      userMessage = {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: fileContent },
          },
          {
            type: "text",
            text: userPrompt 
              ? `The user uploaded an image named "${fileName}" with this note: "${userPrompt}". Analyze the image thoroughly — describe what you see, extract key points, and provide helpful solutions or suggestions.`
              : `The user uploaded an image named "${fileName}". Analyze it thoroughly — describe what you see, extract key points, and provide helpful solutions or suggestions.`,
          },
        ],
      };
    } else {
      // For text/documents, send content as text
      const truncatedContent = fileContent?.slice(0, 50000) || "";
      userMessage = {
        role: "user",
        content: userPrompt
          ? `The user uploaded a file named "${fileName}" (type: ${fileType}) with this note: "${userPrompt}".\n\nFile content:\n\`\`\`\n${truncatedContent}\n\`\`\`\n\nAnalyze this file thoroughly — extract all key points, provide insights, and offer solutions or suggestions.`
          : `The user uploaded a file named "${fileName}" (type: ${fileType}).\n\nFile content:\n\`\`\`\n${truncatedContent}\n\`\`\`\n\nAnalyze this file thoroughly — extract all key points, provide insights, and offer solutions or suggestions.`,
      };
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: isImage ? "google/gemini-2.5-flash" : "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          userMessage,
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
      console.error("File analysis error:", response.status, t);
      return new Response(JSON.stringify({ error: "File analysis failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("file-analyze error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
