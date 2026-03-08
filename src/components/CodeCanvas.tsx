import { useState, useRef, useEffect } from "react";
import { Copy, Check, Code, Eye, Columns, Pencil, Download, Loader2, Send, Maximize2, Minimize2, Server, Globe } from "lucide-react";

type FileTab = {
  name: string;
  language: string;
  content: string;
  icon: "frontend" | "backend";
};

interface CodeCanvasProps {
  code: string;
  onEditRequest: (prompt: string, existingCode: string) => void;
  isEditing?: boolean;
}

type ViewMode = "split" | "code" | "preview";

function parseFiles(raw: string): FileTab[] {
  // Try to parse structured output: ===FILE: filename===
  const filePattern = /===FILE:\s*(.+?)===\n([\s\S]*?)(?====FILE:|$)/g;
  const files: FileTab[] = [];
  let match;

  while ((match = filePattern.exec(raw)) !== null) {
    const name = match[1].trim();
    const content = match[2].trim();
    const ext = name.split(".").pop()?.toLowerCase() || "";
    const isBackend = ["js", "ts", "py", "rb", "go", "java", "php"].includes(ext) && !name.includes("index.html");
    const langMap: Record<string, string> = {
      html: "html", css: "css", js: "javascript", ts: "typescript",
      py: "python", rb: "ruby", go: "go", java: "java", php: "php",
      json: "json", sql: "sql", yaml: "yaml", yml: "yaml",
    };
    files.push({
      name,
      language: langMap[ext] || ext,
      content,
      icon: isBackend ? "backend" : "frontend",
    });
  }

  // If no structured files found, treat as single HTML file
  if (files.length === 0) {
    files.push({
      name: "index.html",
      language: "html",
      content: raw,
      icon: "frontend",
    });
  }

  return files;
}

export function CodeCanvas({ code, onEditRequest, isEditing }: CodeCanvasProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [files, setFiles] = useState<FileTab[]>(() => parseFiles(code));
  const [activeFileIdx, setActiveFileIdx] = useState(0);
  const [isCodeEditable, setIsCodeEditable] = useState(false);
  const [editPrompt, setEditPrompt] = useState("");
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const parsed = parseFiles(code);
    setFiles(parsed);
    // Keep activeFileIdx valid
    if (activeFileIdx >= parsed.length) setActiveFileIdx(0);
  }, [code]);

  // Find the HTML file for preview
  const htmlFile = files.find((f) => f.language === "html");
  const activeFile = files[activeFileIdx] || files[0];

  useEffect(() => {
    if (iframeRef.current && htmlFile) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(htmlFile.content);
        doc.close();
      }
    }
  }, [htmlFile?.content]);

  const handleCopy = () => {
    navigator.clipboard.writeText(activeFile?.content || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const file = activeFile;
    if (!file) return;
    const mimeMap: Record<string, string> = {
      html: "text/html", css: "text/css", javascript: "text/javascript",
      typescript: "text/typescript", python: "text/x-python", json: "application/json",
    };
    const blob = new Blob([file.content], { type: mimeMap[file.language] || "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAll = () => {
    files.forEach((file) => {
      const blob = new Blob([file.content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const handleEditSubmit = () => {
    if (!editPrompt.trim()) return;
    onEditRequest(editPrompt.trim(), code);
    setEditPrompt("");
  };

  const handleCodeChange = (newContent: string) => {
    setFiles((prev) =>
      prev.map((f, i) => (i === activeFileIdx ? { ...f, content: newContent } : f))
    );
  };

  const handleManualCodeApply = () => {
    setIsCodeEditable(false);
    if (iframeRef.current && htmlFile) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(htmlFile.content);
        doc.close();
      }
    }
  };

  const containerClass = isFullscreen
    ? "fixed inset-0 z-50 bg-background flex flex-col"
    : "rounded-xl border border-border overflow-hidden bg-card my-4";

  return (
    <div className={containerClass}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-secondary border-b border-border gap-2">
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono text-primary mr-2">⚡ Canvas</span>
          <button
            onClick={() => setViewMode("code")}
            className={`p-1.5 rounded-md text-xs transition-all ${viewMode === "code" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
            title="Code view"
          >
            <Code className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode("preview")}
            className={`p-1.5 rounded-md text-xs transition-all ${viewMode === "preview" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
            title="Preview"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode("split")}
            className={`p-1.5 rounded-md text-xs transition-all ${viewMode === "split" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
            title="Split view"
          >
            <Columns className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsCodeEditable(!isCodeEditable)}
            className={`p-1.5 rounded-md text-xs transition-all ${isCodeEditable ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
            title={isCodeEditable ? "Lock code" : "Edit code"}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            title="Copy current file"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={files.length > 1 ? handleDownloadAll : handleDownload}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            title={files.length > 1 ? "Download all files" : "Download file"}
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className={`flex ${isFullscreen ? "flex-1 min-h-0" : "h-[500px]"} ${viewMode === "split" ? "flex-row" : "flex-col"}`}>
        {/* Code panel */}
        {(viewMode === "code" || viewMode === "split") && (
          <div className={`${viewMode === "split" ? "w-1/2 border-r border-border" : "flex-1"} overflow-hidden flex flex-col`}>
            {/* File tabs */}
            <div className="flex items-center gap-0 bg-muted/50 border-b border-border overflow-x-auto">
              {files.map((file, idx) => (
                <button
                  key={file.name}
                  onClick={() => setActiveFileIdx(idx)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono border-r border-border transition-all whitespace-nowrap ${
                    idx === activeFileIdx
                      ? "bg-card text-foreground border-b-2 border-b-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                  }`}
                >
                  {file.icon === "backend" ? (
                    <Server className="w-3 h-3 text-orange-400" />
                  ) : (
                    <Globe className="w-3 h-3 text-blue-400" />
                  )}
                  {file.name}
                </button>
              ))}
              {isCodeEditable && (
                <button
                  onClick={handleManualCodeApply}
                  className="ml-auto px-2 py-1 text-[10px] font-mono text-primary hover:underline shrink-0"
                >
                  Apply Changes
                </button>
              )}
            </div>
            <textarea
              value={activeFile?.content || ""}
              onChange={(e) => handleCodeChange(e.target.value)}
              readOnly={!isCodeEditable}
              className="flex-1 w-full bg-[hsl(220,18%,8%)] text-foreground font-mono text-xs p-4 resize-none outline-none leading-relaxed"
              spellCheck={false}
            />
          </div>
        )}

        {/* Preview panel */}
        {(viewMode === "preview" || viewMode === "split") && (
          <div className={`${viewMode === "split" ? "w-1/2" : "flex-1"} bg-white overflow-hidden`}>
            {htmlFile ? (
              <iframe
                ref={iframeRef}
                title="Code Preview"
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin"
              />
            ) : (
              <div className="flex items-center justify-center h-full bg-muted/20">
                <div className="text-center">
                  <Server className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground font-mono">Backend code — no preview available</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Switch to Code view to see the code</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* AI Edit bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-secondary border-t border-border">
        <Pencil className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <input
          type="text"
          value={editPrompt}
          onChange={(e) => setEditPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleEditSubmit()}
          placeholder="Ask AI to edit this code... (e.g., 'add a dark mode toggle')"
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none font-mono"
          disabled={isEditing}
        />
        <button
          onClick={handleEditSubmit}
          disabled={!editPrompt.trim() || isEditing}
          className="shrink-0 w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-30 transition-all"
        >
          {isEditing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}
