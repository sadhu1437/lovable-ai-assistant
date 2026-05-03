import * as vscode from "vscode";
import { streamChat, ChatMessage } from "./api";
import { gatherProjectContext, formatContextAsSystemMessage, getEditorContext, formatEditorContext } from "./projectContext";

export class SmartAIChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "smartai.chatView";
  private view?: vscode.WebviewView;
  private history: ChatMessage[] = [];
  private currentAbort?: AbortController;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    view.webview.html = this.getHtml(view.webview);

    view.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case "send":
          await this.handleUserMessage(msg.text, msg.category, {
            includeFile: !!msg.includeFile,
            includeSelection: !!msg.includeSelection,
            includeCursor: !!msg.includeCursor,
            longChat: !!msg.longChat,
          });
          break;
        case "stop":
          this.currentAbort?.abort();
          break;
        case "newChat":
          this.history = [];
          view.webview.postMessage({ type: "cleared" });
          break;
        case "insertCode":
          await this.insertIntoEditor(msg.code);
          break;
      }
    });
  }

  public async sendPrompt(prompt: string, category = "general") {
    if (!this.view) {
      await vscode.commands.executeCommand("smartai.chatView.focus");
      // small delay for view to mount
      await new Promise((r) => setTimeout(r, 200));
    }
    this.view?.show?.(true);
    this.view?.webview.postMessage({ type: "userMessage", text: prompt });
    await this.handleUserMessage(prompt, category, { includeFile: false, includeSelection: false, includeCursor: false, longChat: false });
  }

  private async insertIntoEditor(code: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      await vscode.env.clipboard.writeText(code);
      vscode.window.showInformationMessage("No active editor — code copied to clipboard.");
      return;
    }
    await editor.edit((eb) => eb.replace(editor.selection, code));
  }

  private async handleUserMessage(
    text: string,
    category = "general",
    ctxOpts: { includeFile: boolean; includeSelection: boolean; includeCursor: boolean; longChat: boolean } = {
      includeFile: false,
      includeSelection: false,
      includeCursor: false,
      longChat: false,
    }
  ) {
    if (!this.view) return;
    const cfg = vscode.workspace.getConfiguration("smartai");
    const includeCtx = cfg.get<boolean>("includeProjectContext", true);
    const maxFiles = cfg.get<number>("maxContextFiles", 8);

    const systemMessages: ChatMessage[] = [];
    if (includeCtx) {
      const ctx = await gatherProjectContext(maxFiles);
      const ctxText = formatContextAsSystemMessage(ctx);
      if (ctxText) {
        systemMessages.push({
          role: "system",
          content:
            "You are SmartAI, an expert IDE coding assistant. Be concise, accurate, and use markdown with fenced code blocks. The user is working in this workspace:\n\n" +
            ctxText,
        });
      }
    }

    // Editor context (current file / selection / cursor)
    let userContent = text;
    if (ctxOpts.includeFile || ctxOpts.includeSelection || ctxOpts.includeCursor) {
      const ec = getEditorContext(ctxOpts);
      const ecText = formatEditorContext(ec);
      if (ecText) {
        userContent = `${text}\n\n---\n${ecText}`;
      }
    }

    this.history.push({ role: "user", content: userContent });
    this.view.webview.postMessage({ type: "assistantStart" });

    this.currentAbort = new AbortController();
    let assistantBuf = "";
    // Long-chat mode → high-context Gemini 2.5 Flash (1M tokens)
    const model = ctxOpts.longChat ? "google/gemini-2.5-flash" : undefined;
    await streamChat({
      messages: [...systemMessages, ...this.history],
      category,
      model,
      signal: this.currentAbort.signal,
      onDelta: (d) => {
        assistantBuf += d;
        this.view?.webview.postMessage({ type: "assistantDelta", text: d });
      },
      onDone: () => {
        this.history.push({ role: "assistant", content: assistantBuf });
        this.view?.webview.postMessage({ type: "assistantDone" });
      },
      onError: (err) => {
        this.view?.webview.postMessage({ type: "assistantError", error: err });
      },
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = Math.random().toString(36).slice(2);
    const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;
    return /* html */ `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<style>
  :root { color-scheme: var(--vscode-color-scheme); }
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-sideBar-background); margin: 0; padding: 0; display: flex; flex-direction: column; height: 100vh; }
  #toolbar { display:flex; gap:6px; padding:8px; border-bottom:1px solid var(--vscode-panel-border); align-items:center; }
  #toolbar select, #toolbar button { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; padding: 4px 8px; border-radius: 4px; font-size: 12px; cursor: pointer; }
  #messages { flex:1; overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:12px; }
  .msg { padding:8px 10px; border-radius:8px; white-space:pre-wrap; word-wrap:break-word; font-size:13px; line-height:1.5; }
  .user { background: var(--vscode-textBlockQuote-background); align-self:flex-end; max-width:90%; }
  .assistant { background: var(--vscode-editor-background); border:1px solid var(--vscode-panel-border); }
  .assistant pre { background: var(--vscode-textCodeBlock-background); padding:8px; border-radius:4px; overflow-x:auto; position:relative; }
  .assistant code { font-family: var(--vscode-editor-font-family); font-size: 12px; }
  .codeActions { display:flex; gap:4px; margin-top:4px; }
  .codeActions button { font-size: 11px; padding: 2px 6px; }
  .error { color: var(--vscode-errorForeground); }
  #inputBar { display:flex; gap:6px; padding:8px; border-top:1px solid var(--vscode-panel-border); }
  #input { flex:1; resize:none; min-height:36px; max-height:120px; background:var(--vscode-input-background); color:var(--vscode-input-foreground); border:1px solid var(--vscode-input-border); border-radius:4px; padding:6px; font-family:inherit; font-size:13px; }
  #send { background: var(--vscode-button-background); color:var(--vscode-button-foreground); border:none; padding: 0 12px; border-radius:4px; cursor:pointer; }
  .empty { color: var(--vscode-descriptionForeground); text-align:center; margin-top:30px; font-size:12px; }
</style>
</head>
<body>
  <div id="toolbar">
    <select id="category">
      <option value="general">⚡ General</option>
      <option value="coding">💻 Coding</option>
      <option value="dsa">🧠 DSA</option>
      <option value="guidewire">🛡️ Guidewire QA</option>
      <option value="education">📚 Education</option>
    </select>
    <button id="newChat">+ New</button>
    <button id="stop">Stop</button>
  </div>
  <div id="messages"><div class="empty">Ask SmartAI anything about your code.</div></div>
  <div id="ctxBar" style="display:flex;flex-wrap:wrap;gap:10px;padding:6px 8px;border-top:1px solid var(--vscode-panel-border);font-size:11px;color:var(--vscode-descriptionForeground);">
    <label title="Send the entire active file"><input type="checkbox" id="incFile"/> 📄 File</label>
    <label title="Send currently selected text"><input type="checkbox" id="incSel" checked/> ✂️ Selection</label>
    <label title="Send code around the cursor"><input type="checkbox" id="incCur"/> 📍 Cursor</label>
    <label title="Use high-context model (Gemini 2.5 Flash, 1M tokens) for long chats"><input type="checkbox" id="longChat"/> 🧠 Long chat</label>
  </div>
  <div id="inputBar">
    <textarea id="input" placeholder="Ask about this project... (Ctrl+Enter to send)"></textarea>
    <button id="send">Send</button>
  </div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const messagesEl = document.getElementById('messages');
const input = document.getElementById('input');
const categoryEl = document.getElementById('category');
let currentAssistant = null;
let currentRaw = '';

function clearEmpty() {
  const e = messagesEl.querySelector('.empty');
  if (e) e.remove();
}

function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function renderMarkdown(text) {
  // Minimal markdown: code fences + inline code + bold + line breaks.
  let html = '';
  const parts = text.split(/(\`\`\`[\\s\\S]*?\`\`\`)/g);
  parts.forEach(p => {
    if (p.startsWith('\`\`\`')) {
      const inner = p.slice(3, -3);
      const nl = inner.indexOf('\\n');
      const lang = nl > 0 ? inner.slice(0, nl) : '';
      const code = nl > 0 ? inner.slice(nl + 1) : inner;
      html += '<pre><code data-lang="' + escapeHtml(lang) + '">' + escapeHtml(code) + '</code><div class="codeActions"><button data-action="copy">Copy</button><button data-action="insert">Insert</button></div></pre>';
    } else {
      let t = escapeHtml(p);
      t = t.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
      t = t.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
      t = t.replace(/\\n/g, '<br/>');
      html += t;
    }
  });
  return html;
}

function appendMessage(role, text) {
  clearEmpty();
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

messagesEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const code = btn.parentElement.previousSibling.textContent || btn.parentElement.parentElement.querySelector('code').textContent;
  if (btn.dataset.action === 'copy') {
    navigator.clipboard.writeText(code);
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 1200);
  } else if (btn.dataset.action === 'insert') {
    vscode.postMessage({ type: 'insertCode', code });
  }
});

document.getElementById('send').onclick = send;
document.getElementById('newChat').onclick = () => vscode.postMessage({ type: 'newChat' });
document.getElementById('stop').onclick = () => vscode.postMessage({ type: 'stop' });
input.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); send(); }
});

function send() {
  const text = input.value.trim();
  if (!text) return;
  appendMessage('user', text);
  input.value = '';
  vscode.postMessage({
    type: 'send',
    text,
    category: categoryEl.value,
    includeFile: document.getElementById('incFile').checked,
    includeSelection: document.getElementById('incSel').checked,
    includeCursor: document.getElementById('incCur').checked,
    longChat: document.getElementById('longChat').checked,
  });
}

window.addEventListener('message', (event) => {
  const m = event.data;
  switch (m.type) {
    case 'userMessage':
      appendMessage('user', m.text);
      break;
    case 'assistantStart':
      currentRaw = '';
      currentAssistant = appendMessage('assistant', '');
      currentAssistant.innerHTML = '<em>thinking…</em>';
      break;
    case 'assistantDelta':
      currentRaw += m.text;
      if (currentAssistant) currentAssistant.innerHTML = renderMarkdown(currentRaw);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      break;
    case 'assistantDone':
      currentAssistant = null;
      break;
    case 'assistantError':
      if (currentAssistant) {
        currentAssistant.classList.add('error');
        currentAssistant.textContent = 'Error: ' + m.error;
      }
      currentAssistant = null;
      break;
    case 'cleared':
      messagesEl.innerHTML = '<div class="empty">New chat started.</div>';
      break;
  }
});
</script>
</body>
</html>`;
  }
}