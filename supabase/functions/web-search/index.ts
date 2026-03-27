import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function searchDuckDuckGo(query: string): Promise<{ title: string; snippet: string; url: string }[]> {
  const encoded = encodeURIComponent(query);
  
  // Use DuckDuckGo HTML lite endpoint
  const response = await fetch(`https://html.duckduckgo.com/html/?q=${encoded}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  const html = await response.text();
  const results: { title: string; snippet: string; url: string }[] = [];

  // Parse results from DuckDuckGo HTML lite
  const resultBlocks = html.split('class="result__body"');
  
  for (let i = 1; i < resultBlocks.length && results.length < 6; i++) {
    const block = resultBlocks[i];
    
    // Extract title
    const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : '';
    
    // Extract URL
    const urlMatch = block.match(/href="([^"]*)"/) || block.match(/class="result__url"[^>]*>([\s\S]*?)<\/a>/);
    let url = '';
    if (urlMatch) {
      url = urlMatch[1] || urlMatch[2] || '';
      url = url.replace(/<[^>]*>/g, '').trim();
      // DuckDuckGo wraps URLs in redirects
      if (url.includes('uddg=')) {
        try {
          const decoded = decodeURIComponent(url.split('uddg=')[1]?.split('&')[0] || '');
          url = decoded;
        } catch { /* keep original */ }
      }
      if (!url.startsWith('http')) url = 'https://' + url;
    }
    
    // Extract snippet
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|span|div)/);
    const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').trim() : '';
    
    if (title && snippet) {
      results.push({ title, snippet, url });
    }
  }

  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "Query is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Web search query:", query);
    const results = await searchDuckDuckGo(query);
    console.log(`Found ${results.length} results`);

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Web search error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Search failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
