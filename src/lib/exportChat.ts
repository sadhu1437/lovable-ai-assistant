import type { Message, Conversation } from "@/lib/chat";

function formatTimestamp(date: Date): string {
  return date.toLocaleString();
}

export function exportAsMarkdown(conv: Conversation): void {
  let md = `# ${conv.title}\n\n`;
  md += `_Exported on ${new Date().toLocaleString()}_\n\n---\n\n`;

  for (const msg of conv.messages) {
    const role = msg.role === "user" ? "**You**" : "**NexusAI**";
    md += `### ${role} — ${formatTimestamp(msg.timestamp)}\n\n`;
    md += `${msg.content}\n\n---\n\n`;
  }

  downloadFile(md, `${sanitizeFilename(conv.title)}.md`, "text/markdown");
}

export function exportAsPdf(conv: Conversation): void {
  // Build a printable HTML document and use the browser's print-to-PDF
  const styles = `
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    .meta { color: #666; font-size: 13px; margin-bottom: 24px; }
    .divider { border: none; border-top: 1px solid #e0e0e0; margin: 20px 0; }
    .message { margin-bottom: 24px; }
    .role { font-weight: 700; font-size: 14px; margin-bottom: 6px; }
    .role.user { color: #333; }
    .role.assistant { color: #6d28d9; }
    .timestamp { font-size: 12px; color: #999; margin-left: 8px; font-weight: 400; }
    .content { font-size: 15px; line-height: 1.7; white-space: pre-wrap; word-wrap: break-word; }
    pre { background: #f5f5f5; padding: 12px 16px; border-radius: 8px; overflow-x: auto; font-size: 13px; }
    code { font-family: 'SF Mono', 'Fira Code', monospace; }
  `;

  let body = `<h1>${escapeHtml(conv.title)}</h1>`;
  body += `<p class="meta">Exported on ${new Date().toLocaleString()} · ${conv.messages.length} messages</p>`;
  body += `<hr class="divider">`;

  for (const msg of conv.messages) {
    const roleClass = msg.role === "user" ? "user" : "assistant";
    const roleName = msg.role === "user" ? "You" : "NexusAI";
    body += `<div class="message">`;
    body += `<div class="role ${roleClass}">${roleName}<span class="timestamp">${formatTimestamp(msg.timestamp)}</span></div>`;
    body += `<div class="content">${escapeHtml(msg.content)}</div>`;
    body += `</div><hr class="divider">`;
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(conv.title)}</title><style>${styles}</style></head><body>${body}<script>window.onload=()=>{window.print();}<\/script></body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) {
    // Fallback: download as HTML
    downloadFile(html, `${sanitizeFilename(conv.title)}.html`, "text/html");
  }
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim().replace(/\s+/g, "-") || "chat-export";
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
