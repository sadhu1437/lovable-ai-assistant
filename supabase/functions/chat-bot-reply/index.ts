import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BOT_EMAIL = "nexusai-bot@internal.lovable.app";
const BOT_PASSWORD = "nexusai-bot-internal-password-2024!";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { room_id, message } = await req.json();
    if (!room_id || !message) throw new Error("room_id and message are required");

    const isInit = room_id === "init";

    const sbUrl = Deno.env.get("SUPABASE_URL")!;
    const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const adminClient = createClient(sbUrl, sbKey);

    // Ensure bot user exists
    let botUserId: string;
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const botUser = existingUsers?.users?.find((u: any) => u.email === BOT_EMAIL);
    
    if (botUser) {
      botUserId = botUser.id;
    } else {
      const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
        email: BOT_EMAIL,
        password: BOT_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: "NexusAI Bot" },
      });
      if (createErr || !newUser?.user) throw new Error("Failed to create bot user: " + createErr?.message);
      botUserId = newUser.user.id;
    }

    // Ensure bot profile exists with correct username
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id, username")
      .eq("user_id", botUserId)
      .maybeSingle();

    if (!existingProfile) {
      await adminClient.from("profiles").insert({
        user_id: botUserId,
        display_name: "NexusAI Bot",
        username: "nexusai-bot",
      });
    } else if (existingProfile.username !== "nexusai-bot") {
      await adminClient.from("profiles")
        .update({ username: "nexusai-bot", display_name: "NexusAI Bot" })
        .eq("user_id", botUserId);
    }

    // If init mode, just return bot user id
    if (isInit) {
      return new Response(JSON.stringify({ bot_user_id: botUserId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ensure bot is a member of the room
    const { data: membership } = await adminClient
      .from("chat_room_members")
      .select("id")
      .eq("room_id", room_id)
      .eq("user_id", botUserId)
      .maybeSingle();

    if (!membership) {
      await adminClient.from("chat_room_members").insert({
        room_id,
        user_id: botUserId,
        role: "member",
      });
    }

    // Fetch conversation history
    const { data: history } = await adminClient
      .from("chat_messages")
      .select("sender_id, content, message_type")
      .eq("room_id", room_id)
      .eq("message_type", "text")
      .order("created_at", { ascending: true })
      .limit(50);

    const chatMessages = (history || []).map((m: any) => ({
      role: m.sender_id === botUserId ? "assistant" : "user",
      content: m.content || "",
    }));

    // Call AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: "You are NexusAI Bot, a friendly and helpful AI assistant embedded in a messaging app. Keep responses concise, conversational, and helpful. Use emoji occasionally. Do not use markdown headers — keep it chat-friendly.",
          },
          ...chatMessages,
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const aiData = await aiResponse.json();
    const reply = aiData.choices?.[0]?.message?.content || "Sorry, I couldn't generate a response.";

    // Insert bot reply
    const { error: insertErr } = await adminClient.from("chat_messages").insert({
      room_id,
      sender_id: botUserId,
      content: reply,
      message_type: "text",
    });

    if (insertErr) {
      console.error("Insert error:", insertErr);
      throw new Error("Failed to insert bot reply");
    }

    return new Response(JSON.stringify({ reply, bot_user_id: botUserId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("chat-bot-reply error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
