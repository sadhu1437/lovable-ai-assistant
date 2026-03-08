import { useState, useRef, useEffect, useCallback } from "react";
import { Copy, Check, Code, Eye, Columns, Pencil, Download, X, Loader2, Send, Maximize2, Minimize2 } from "lucide-react";

interface CodeCanvasProps {
  code: string;
  onEditRequest: (prompt: string, existingCode: string) => void;
  isEditing?: boolean;
}

type ViewMode = "split" | "code" | "preview";

export function CodeCanvas({ code, onEditRequest, isEditing }: CodeCanvasProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [editableCode, setEditableCode] = useState(code);
  const [isCodeEditable, setIsCodeEditable] = useState(false);
  const [editPrompt, setEditPrompt] = useState("");
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setEditableCode(code);
  }, [code]);

  useEffect(() => {
    if (iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(editableCode);
        doc.close();
      }
    }
  }, [editableCode]);

  const handleCopy = () => {
    navigator.clipboard.writeText(editableCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([editableCode], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nexusai-website.html";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleEditSubmit = () => {
    if (!editPrompt.trim()) return;
    onEditRequest(editPrompt.trim(), editableCode);
    setEditPrompt("");
  };

  const handleManualCodeApply = () => {
    setIsCodeEditable(false);
    // Trigger iframe re-render with edited code
    if (iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(editableCode);
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
            title="Copy code"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleDownload}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            title="Download HTML"
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
            <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b border-border">
              <span className="text-[10px] font-mono text-muted-foreground">index.html</span>
              {isCodeEditable && (
                <button
                  onClick={handleManualCodeApply}
                  className="text-[10px] font-mono text-primary hover:underline"
                >
                  Apply Changes
                </button>
              )}
            </div>
            <textarea
              ref={textareaRef}
              value={editableCode}
              onChange={(e) => setEditableCode(e.target.value)}
              readOnly={!isCodeEditable}
              className="flex-1 w-full bg-[hsl(220,18%,8%)] text-foreground font-mono text-xs p-4 resize-none outline-none leading-relaxed"
              spellCheck={false}
            />
          </div>
        )}

        {/* Preview panel */}
        {(viewMode === "preview" || viewMode === "split") && (
          <div className={`${viewMode === "split" ? "w-1/2" : "flex-1"} bg-white overflow-hidden`}>
            <iframe
              ref={iframeRef}
              title="Code Preview"
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin"
            />
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
          placeholder="Ask AI to edit this code... (e.g., 'change the color scheme to blue')"
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
