export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

export type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  category: string;
  createdAt: Date;
};

export type Category = {
  id: string;
  label: string;
  icon: string;
  description: string;
};

export const categories: Category[] = [
  { id: "general", label: "General", icon: "⚡", description: "Any topic, no limits" },
  { id: "coding", label: "Coding", icon: "💻", description: "Code solutions & debugging" },
  { id: "dsa", label: "DSA / FAANG", icon: "🧠", description: "Data structures & algorithms" },
  { id: "social", label: "Social Media", icon: "📱", description: "Content & growth strategy" },
  { id: "education", label: "Education", icon: "📚", description: "Learn anything" },
];

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

export async function streamChat({
  messages,
  category,
  onDelta,
  onDone,
  onError,
}: {
  messages: { role: string; content: string }[];
  category: string;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}) {
  try {
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ messages, category }),
    });

    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      onError(data.error || `Error ${resp.status}`);
      return;
    }

    if (!resp.body) {
      onError("No response body");
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6).trim();
        if (json === "[DONE]") { onDone(); return; }
        try {
          const parsed = JSON.parse(json);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onDelta(content);
        } catch {
          buffer = line + "\n" + buffer;
          break;
        }
      }
    }
    onDone();
  } catch (e) {
    onError(e instanceof Error ? e.message : "Unknown error");
  }
}

export function generateId() {
  return crypto.randomUUID();
}
