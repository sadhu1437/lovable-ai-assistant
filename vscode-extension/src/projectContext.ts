import * as vscode from "vscode";
import * as path from "path";

export interface ProjectContext {
  framework: string;
  language: string;
  packageInfo?: any;
  rootFiles: string[];
  openFiles: { path: string; language: string; snippet: string }[];
  workspaceName?: string;
}

async function readJson(uri: vscode.Uri): Promise<any | null> {
  try {
    const buf = await vscode.workspace.fs.readFile(uri);
    return JSON.parse(Buffer.from(buf).toString("utf8"));
  } catch {
    return null;
  }
}

async function detectFramework(root: vscode.Uri, pkg: any | null): Promise<string> {
  const deps = pkg ? { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) } : {};
  if (deps.next) return "Next.js";
  if (deps["@remix-run/react"]) return "Remix";
  if (deps.nuxt) return "Nuxt";
  if (deps["@angular/core"]) return "Angular";
  if (deps.svelte) return "Svelte";
  if (deps.vue) return "Vue";
  if (deps.vite && deps.react) return "React + Vite";
  if (deps.react) return "React";
  if (deps.express || deps.fastify || deps.koa) return "Node.js backend";
  // Non-JS detection
  const checks: [string, string][] = [
    ["pom.xml", "Java / Maven"],
    ["build.gradle", "Java / Gradle"],
    ["build.gradle.kts", "Kotlin / Gradle"],
    ["requirements.txt", "Python"],
    ["pyproject.toml", "Python"],
    ["Cargo.toml", "Rust"],
    ["go.mod", "Go"],
    ["Gemfile", "Ruby"],
    ["composer.json", "PHP"],
    ["pubspec.yaml", "Flutter / Dart"],
    ["*.gs", "Guidewire / Gosu"],
  ];
  for (const [file, label] of checks) {
    try {
      if (file.includes("*")) {
        const matches = await vscode.workspace.findFiles(`**/${file}`, "**/node_modules/**", 1);
        if (matches.length > 0) return label;
      } else {
        await vscode.workspace.fs.stat(vscode.Uri.joinPath(root, file));
        return label;
      }
    } catch {}
  }
  return "Unknown";
}

export async function gatherProjectContext(maxOpenFiles: number): Promise<ProjectContext | null> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return null;
  const root = folders[0].uri;

  const pkg = await readJson(vscode.Uri.joinPath(root, "package.json"));
  const framework = await detectFramework(root, pkg);

  let rootFiles: string[] = [];
  try {
    const entries = await vscode.workspace.fs.readDirectory(root);
    rootFiles = entries
      .map(([n]) => n)
      .filter((n) => !n.startsWith(".") && n !== "node_modules")
      .slice(0, 40);
  } catch {}

  const openFiles: ProjectContext["openFiles"] = [];
  const seen = new Set<string>();
  for (const tab of vscode.window.tabGroups.all.flatMap((g) => g.tabs)) {
    if (openFiles.length >= maxOpenFiles) break;
    const input: any = tab.input;
    if (!input?.uri) continue;
    const uri: vscode.Uri = input.uri;
    if (seen.has(uri.toString())) continue;
    seen.add(uri.toString());
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const text = doc.getText();
      openFiles.push({
        path: vscode.workspace.asRelativePath(uri),
        language: doc.languageId,
        snippet: text.length > 4000 ? text.slice(0, 4000) + "\n/* ...truncated... */" : text,
      });
    } catch {}
  }

  const editor = vscode.window.activeTextEditor;
  return {
    framework,
    language: editor?.document.languageId || pkg?.type || "unknown",
    packageInfo: pkg ? { name: pkg.name, version: pkg.version, scripts: pkg.scripts } : undefined,
    rootFiles,
    openFiles,
    workspaceName: folders[0].name,
  };
}

export function formatContextAsSystemMessage(ctx: ProjectContext | null): string {
  if (!ctx) return "";
  const parts: string[] = [];
  parts.push(`# Workspace Context`);
  parts.push(`Workspace: ${ctx.workspaceName}`);
  parts.push(`Detected framework: ${ctx.framework}`);
  parts.push(`Active language: ${ctx.language}`);
  if (ctx.packageInfo) {
    parts.push(`package.json: ${JSON.stringify(ctx.packageInfo)}`);
  }
  parts.push(`Top-level files: ${ctx.rootFiles.join(", ")}`);
  if (ctx.openFiles.length > 0) {
    parts.push(`\n# Open Files`);
    for (const f of ctx.openFiles) {
      parts.push(`\n## ${f.path} (${f.language})\n\`\`\`${f.language}\n${f.snippet}\n\`\`\``);
    }
  }
  return parts.join("\n");
}

export interface EditorContext {
  file?: { path: string; language: string; content: string };
  selection?: { path: string; language: string; text: string; startLine: number; endLine: number };
  cursor?: { path: string; language: string; line: number; character: number; before: string; after: string };
}

export function getEditorContext(opts: { includeFile: boolean; includeSelection: boolean; includeCursor: boolean }): EditorContext {
  const ed = vscode.window.activeTextEditor;
  const out: EditorContext = {};
  if (!ed) return out;
  const doc = ed.document;
  const rel = vscode.workspace.asRelativePath(doc.uri);
  const lang = doc.languageId;

  if (opts.includeFile) {
    const text = doc.getText();
    out.file = {
      path: rel,
      language: lang,
      content: text.length > 20000 ? text.slice(0, 20000) + "\n/* ...truncated... */" : text,
    };
  }
  if (opts.includeSelection && !ed.selection.isEmpty) {
    const text = doc.getText(ed.selection);
    out.selection = {
      path: rel,
      language: lang,
      text,
      startLine: ed.selection.start.line + 1,
      endLine: ed.selection.end.line + 1,
    };
  }
  if (opts.includeCursor) {
    const pos = ed.selection.active;
    const startLine = Math.max(0, pos.line - 10);
    const endLine = Math.min(doc.lineCount - 1, pos.line + 10);
    const before = doc.getText(new vscode.Range(startLine, 0, pos.line, pos.character));
    const after = doc.getText(new vscode.Range(pos.line, pos.character, endLine, doc.lineAt(endLine).text.length));
    out.cursor = {
      path: rel,
      language: lang,
      line: pos.line + 1,
      character: pos.character + 1,
      before,
      after,
    };
  }
  return out;
}

export function formatEditorContext(ec: EditorContext): string {
  const parts: string[] = [];
  if (ec.file) {
    parts.push(`# Current File: ${ec.file.path} (${ec.file.language})\n\`\`\`${ec.file.language}\n${ec.file.content}\n\`\`\``);
  }
  if (ec.selection) {
    parts.push(`# Selected Text — ${ec.selection.path} L${ec.selection.startLine}-${ec.selection.endLine}\n\`\`\`${ec.selection.language}\n${ec.selection.text}\n\`\`\``);
  }
  if (ec.cursor) {
    parts.push(`# Cursor Context — ${ec.cursor.path} (line ${ec.cursor.line}, col ${ec.cursor.character})\nCode before cursor:\n\`\`\`${ec.cursor.language}\n${ec.cursor.before}\n\`\`\`\nCode after cursor:\n\`\`\`${ec.cursor.language}\n${ec.cursor.after}\n\`\`\``);
  }
  return parts.join("\n\n");
}