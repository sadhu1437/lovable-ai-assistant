export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[];
  videoUrl?: string;
  filePreview?: { name: string; type: string; isImage: boolean; dataUrl?: string };
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

export type AIModel = {
  id: string;
  label: string;
  provider: string;
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

export const aiModels: AIModel[] = [
  { id: "google/gemini-3-flash-preview", label: "Gemini 3 Flash", provider: "Google", icon: "✦", description: "Fast & capable (default)" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "Google", icon: "✦", description: "Top-tier reasoning & multimodal" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "Google", icon: "✦", description: "Balanced speed & quality" },
  { id: "google/gemini-2.5-flash-lite", label: "Gemini Lite", provider: "Google", icon: "✦", description: "Ultra-fast, lightweight tasks" },
  { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", provider: "Google", icon: "✦", description: "Next-gen reasoning" },
  { id: "openai/gpt-5", label: "GPT-5", provider: "OpenAI", icon: "◉", description: "Powerful all-rounder" },
  { id: "openai/gpt-5-mini", label: "GPT-5 Mini", provider: "OpenAI", icon: "◉", description: "Strong & cost-effective" },
  { id: "openai/gpt-5-nano", label: "GPT-5 Nano", provider: "OpenAI", icon: "◉", description: "Speed-optimized" },
  { id: "openai/gpt-5.2", label: "GPT-5.2", provider: "OpenAI", icon: "◉", description: "Latest enhanced reasoning" },
];

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

export async function streamChat({
  messages,
  category,
  model,
  onDelta,
  onDone,
  onError,
}: {
  messages: { role: string; content: string }[];
  category: string;
  model?: string;
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
      body: JSON.stringify({ messages, category, model }),
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

const IMAGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/image-generate`;

const IMAGE_TRIGGERS = [
  /generate\s+(an?\s+)?image/i,
  /create\s+(an?\s+)?image/i,
  /draw\s+(me\s+)?(an?\s+)?/i,
  /make\s+(an?\s+)?image/i,
  /generate\s+(an?\s+)?picture/i,
  /create\s+(an?\s+)?picture/i,
  /imagine\s+/i,
  /show\s+me\s+(an?\s+)?image/i,
  /visualize\s+/i,
  /paint\s+/i,
  /sketch\s+/i,
  /design\s+(an?\s+)?image/i,
  /generate\s+(an?\s+)?photo/i,
  /create\s+(an?\s+)?illustration/i,
];

export function isImageRequest(text: string): boolean {
  return IMAGE_TRIGGERS.some((re) => re.test(text));
}

const VIDEO_TRIGGERS = [
  /generate\s+(an?\s+)?video/i,
  /create\s+(an?\s+)?video/i,
  /make\s+(an?\s+)?video/i,
  /animate\s+/i,
  /create\s+(an?\s+)?animation/i,
  /generate\s+(an?\s+)?animation/i,
  /make\s+(an?\s+)?clip/i,
  /generate\s+(an?\s+)?clip/i,
  /text[\s-]to[\s-]video/i,
];

export function isVideoRequest(text: string): boolean {
  return VIDEO_TRIGGERS.some((re) => re.test(text));
}

const VIDEO_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/video-generate`;

export async function generateVideo({
  prompt,
  onResult,
  onError,
}: {
  prompt: string;
  onResult: (text: string, videoUrl: string) => void;
  onError: (error: string) => void;
}) {
  try {
    const resp = await fetch(VIDEO_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ prompt }),
    });

    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      onError(data.error || `Error ${resp.status}`);
      return;
    }

    const data = await resp.json();
    onResult(data.text || "Here's your generated video:", data.videoUrl || "");
  } catch (e) {
    onError(e instanceof Error ? e.message : "Unknown error");
  }
}

export async function generateImage({
  prompt,
  sourceImage,
  onResult,
  onError,
}: {
  prompt: string;
  sourceImage?: string;
  onResult: (text: string, images: string[]) => void;
  onError: (error: string) => void;
}) {
  try {
    const body: any = { prompt };
    if (sourceImage) body.sourceImage = sourceImage;

    const resp = await fetch(IMAGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      onError(data.error || `Error ${resp.status}`);
      return;
    }

    const data = await resp.json();
    const images = (data.images || []).map((img: any) => img.image_url?.url || "").filter(Boolean);
    onResult(data.text || "Here's your generated image:", images);
  } catch (e) {
    onError(e instanceof Error ? e.message : "Unknown error");
  }
}

const FILE_ANALYZE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/file-analyze`;

export async function analyzeFile({
  fileName,
  fileType,
  fileContent,
  userPrompt,
  onDelta,
  onDone,
  onError,
}: {
  fileName: string;
  fileType: string;
  fileContent: string;
  userPrompt?: string;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}) {
  try {
    const resp = await fetch(FILE_ANALYZE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ fileName, fileType, fileContent, userPrompt }),
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

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export function guessFileType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    txt: "text/plain", md: "text/markdown", json: "application/json",
    csv: "text/csv", js: "text/javascript", ts: "text/typescript",
    tsx: "text/tsx", jsx: "text/jsx", py: "text/x-python",
    html: "text/html", css: "text/css", xml: "text/xml",
    yaml: "text/yaml", yml: "text/yaml", log: "text/plain",
    pdf: "application/pdf", doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  };
  return map[ext] || "application/octet-stream";
}
