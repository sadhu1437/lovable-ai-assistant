/**
 * Export a single message or array of messages as a formatted PDF (via print).
 */

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const PDF_STYLES = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .meta { color: #666; font-size: 13px; margin-bottom: 24px; }
  .divider { border: none; border-top: 1px solid #e0e0e0; margin: 16px 0; }
  .message { margin-bottom: 20px; }
  .role { font-weight: 700; font-size: 13px; margin-bottom: 4px; }
  .role.user { color: #333; }
  .role.assistant { color: #6d28d9; }
  .timestamp { font-size: 11px; color: #999; margin-left: 8px; font-weight: 400; }
  .content { font-size: 14px; line-height: 1.7; white-space: pre-wrap; word-wrap: break-word; }
  pre { background: #f5f5f5; padding: 12px 16px; border-radius: 8px; overflow-x: auto; font-size: 13px; }
  code { font-family: 'SF Mono', 'Fira Code', monospace; }
`;

interface ExportMessage {
  content: string;
  sender: string;
  timestamp?: string;
  role?: "user" | "assistant";
}

export function exportMessageAsPdf(msg: ExportMessage) {
  exportMessagesToPdf([msg], "Message Export");
}

export function exportMessagesToPdf(messages: ExportMessage[], title: string) {
  let body = `<h1>${escapeHtml(title)}</h1>`;
  body += `<p class="meta">Exported on ${new Date().toLocaleString()} · ${messages.length} message${messages.length !== 1 ? "s" : ""}</p>`;
  body += `<hr class="divider">`;

  for (const msg of messages) {
    const roleClass = msg.role === "user" ? "user" : "assistant";
    body += `<div class="message">`;
    body += `<div class="role ${roleClass}">${escapeHtml(msg.sender)}`;
    if (msg.timestamp) body += `<span class="timestamp">${escapeHtml(msg.timestamp)}</span>`;
    body += `</div>`;
    body += `<div class="content">${escapeHtml(msg.content)}</div>`;
    body += `</div><hr class="divider">`;
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${PDF_STYLES}</style></head><body>${body}<script>window.onload=()=>{window.print();}<\/script></body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) {
    // Fallback download
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9-_ ]/g, "").trim().replace(/\s+/g, "-") || "export"}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
