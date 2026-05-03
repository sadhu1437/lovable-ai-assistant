import * as vscode from "vscode";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StreamOptions {
  messages: ChatMessage[];
  category?: string;
  model?: string;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
  signal?: AbortSignal;
}

function cfg() {
  const c = vscode.workspace.getConfiguration("smartai");
  return {
    endpoint: c.get<string>("endpoint")!,
    key: c.get<string>("publishableKey")!,
    model: c.get<string>("model")!,
  };
}

export async function streamChat(opts: StreamOptions): Promise<void> {
  const { endpoint, key, model } = cfg();
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: opts.messages,
        category: opts.category || "general",
        model: opts.model || model,
      }),
      signal: opts.signal,
    });

    if (!resp.ok) {
      const data: any = await resp.json().catch(() => ({}));
      opts.onError(data.error || `Request failed: ${resp.status}`);
      return;
    }
    if (!resp.body) {
      opts.onError("No response body");
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
        if (json === "[DONE]") {
          opts.onDone();
          return;
        }
        try {
          const parsed = JSON.parse(json);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) opts.onDelta(content);
        } catch {
          buffer = line + "\n" + buffer;
          break;
        }
      }
    }
    opts.onDone();
  } catch (e: any) {
    if (e?.name === "AbortError") return;
    opts.onError(e?.message || "Network error");
  }
}