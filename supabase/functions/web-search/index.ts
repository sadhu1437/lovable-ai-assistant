import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type SearchResult = { title: string; snippet: string; url: string; source: string; date: string };

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/<[^>]*>/g, "");
}

function extractKeywords(query: string): string {
  const stopWords = new Set(["what","is","are","was","were","the","a","an","of","in","on","for","to","and","or","how","much","does","do","did","will","has","have","had","about","me","tell","latest","current","today","please","can","you","find","search","look","up","give","show"]);
  return query
    .replace(/[?!.,;:'"]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopWords.has(w.toLowerCase()))
    .slice(0, 5)
    .join(" ");
}

async function searchGoogleNewsRSS(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  const keywords = extractKeywords(query) || query;
  const encodedQuery = encodeURIComponent(keywords);
  const urls = [
    `https://news.google.com/rss/search?q=${encodedQuery}&hl=en&gl=US&ceid=US:en`,
    `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-IN&gl=IN&ceid=IN:en`,
  ];

  for (const url of urls) {
    if (results.length >= 8) break;
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; NexusAI/1.0)" },
      });
      if (!response.ok) continue;
      const xml = await response.text();

      const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
      for (const item of items) {
        if (results.length >= 8) break;

        const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/);
        const linkMatch = item.match(/<link\s*\/?>\s*(https?:\/\/[^\s<]+)/) || item.match(/<link>([\s\S]*?)<\/link>/);
        const pubDateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
        const sourceMatch = item.match(/<source[^>]*url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/);
        const descMatch = item.match(/<description>([\s\S]*?)<\/description>/);

        const title = titleMatch ? decodeHtml(titleMatch[1]).trim() : "";
        const link = linkMatch ? linkMatch[1].trim() : "";
        const pubDate = pubDateMatch ? pubDateMatch[1].trim() : "";
        const source = sourceMatch ? decodeHtml(sourceMatch[2]).trim() : "";
        const sourceUrl = sourceMatch ? sourceMatch[1].trim() : "";
        const desc = descMatch ? decodeHtml(descMatch[1]).trim() : "";

        if (title) {
          if (results.some((r) => r.title === title)) continue;
          results.push({
            title,
            snippet: desc || title,
            url: sourceUrl || link || `https://news.google.com/search?q=${encodedQuery}`,
            source,
            date: pubDate,
          });
        }
      }
    } catch (e) {
      console.error("RSS fetch error:", e);
    }
  }

  return results;
}

// Fallback: fetch general top news
async function fetchTopNews(): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  try {
    const response = await fetch("https://news.google.com/rss?hl=en&gl=US&ceid=US:en", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NexusAI/1.0)" },
    });
    if (!response.ok) return results;
    const xml = await response.text();

    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
    for (const item of items.slice(0, 8)) {
      const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/);
      const linkMatch = item.match(/<link\/>\s*(https?:\/\/[^\s<]+)/);
      const pubDateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
      const sourceMatch = item.match(/<source[^>]*>([\s\S]*?)<\/source>/);

      results.push({
        title: titleMatch ? decodeHtml(titleMatch[1]).trim() : "",
        snippet: titleMatch ? decodeHtml(titleMatch[1]).trim() : "",
        url: linkMatch ? linkMatch[1].trim() : "",
        source: sourceMatch ? decodeHtml(sourceMatch[1]).trim() : "",
        date: pubDateMatch ? pubDateMatch[1].trim() : "",
      });
    }
  } catch (e) {
    console.error("Top news fetch error:", e);
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

    // Search for relevant news
    let results = await searchGoogleNewsRSS(query);

    // If no specific results, get top headlines
    if (results.length === 0) {
      console.log("No specific results, fetching top news");
      results = await fetchTopNews();
    }

    console.log(`Found ${results.length} results`);

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Web search error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Search failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
