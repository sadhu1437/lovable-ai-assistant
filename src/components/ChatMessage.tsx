import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check, Zap, User, ThumbsUp, ThumbsDown, Download } from "lucide-react";
import { useState } from "react";
import type { Message } from "@/lib/chat";

export function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<"like" | "dislike" | null>(null);

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className={`animate-fade-in py-8 ${isUser ? "" : ""}`}>
      <div className="max-w-3xl mx-auto px-6 flex gap-5">
        <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-sm ${
          isUser
            ? "bg-secondary text-secondary-foreground"
            : "bg-primary text-primary-foreground glow-primary"
        }`}>
          {isUser ? <User className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="text-xs font-mono text-muted-foreground mb-2">
            {isUser ? "You" : "NexusAI"}
          </p>
          {isUser ? (
            <p className="text-foreground leading-7 text-[15px]">{message.content}</p>
          ) : (
            <>
              <div className="prose prose-invert prose-sm max-w-none text-foreground
                prose-headings:text-foreground prose-strong:text-foreground
                prose-code:text-primary prose-code:bg-secondary prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:text-sm
                prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                prose-pre:bg-transparent prose-pre:p-0
                prose-blockquote:border-primary prose-blockquote:border-l-2 prose-blockquote:pl-4 prose-blockquote:my-4
                prose-li:marker:text-primary prose-li:my-1
                prose-table:border-collapse prose-table:w-full
                prose-th:border prose-th:border-border prose-th:bg-secondary prose-th:px-4 prose-th:py-2.5 prose-th:text-left prose-th:text-foreground prose-th:font-semibold prose-th:text-xs prose-th:font-mono
                prose-td:border prose-td:border-border prose-td:px-4 prose-td:py-2.5 prose-td:text-sm
                prose-p:leading-7 prose-p:text-foreground prose-p:my-3 prose-p:text-[15px]
                prose-ul:space-y-2 prose-ul:my-4 prose-ol:space-y-2 prose-ol:my-4
                prose-h1:text-xl prose-h1:font-bold prose-h1:mt-8 prose-h1:mb-4
                prose-h2:text-lg prose-h2:font-bold prose-h2:mt-7 prose-h2:mb-3
                prose-h3:text-base prose-h3:font-semibold prose-h3:mt-6 prose-h3:mb-3">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || "");
                      const codeStr = String(children).replace(/\n$/, "");
                      const blockId = `block-${codeStr.slice(0, 20)}`;
                      if (match) {
                        return (
                          <div className="relative group rounded-lg overflow-hidden border border-border my-4">
                            <div className="flex items-center justify-between bg-secondary px-4 py-2.5 text-xs font-mono text-muted-foreground">
                              <span>{match[1]}</span>
                              <button
                                onClick={() => copyCode(codeStr, blockId)}
                                className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                              >
                                {copied === blockId ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                {copied === blockId ? "Copied" : "Copy"}
                              </button>
                            </div>
                            <SyntaxHighlighter
                              style={oneDark}
                              language={match[1]}
                              PreTag="div"
                              customStyle={{
                                margin: 0,
                                borderRadius: 0,
                                background: "hsl(220, 18%, 8%)",
                                fontSize: "0.85rem",
                                padding: "1rem",
                              }}
                            >
                              {codeStr}
                            </SyntaxHighlighter>
                          </div>
                        );
                      }
                      return (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    },
                    table({ children }) {
                      return (
                        <div className="overflow-x-auto my-5 rounded-lg border border-border">
                          <table className="w-full border-collapse text-sm">
                            {children}
                          </table>
                        </div>
                      );
                    },
                    thead({ children }) {
                      return <thead className="bg-secondary">{children}</thead>;
                    },
                    th({ children }) {
                      return (
                        <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-foreground border-b border-border">
                          {children}
                        </th>
                      );
                    },
                    td({ children }) {
                      return (
                        <td className="px-4 py-3 text-sm text-foreground border-b border-border">
                          {children}
                        </td>
                      );
                    },
                    tr({ children }) {
                      return (
                        <tr className="hover:bg-secondary/50 transition-colors">
                          {children}
                        </tr>
                      );
                    },
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>

              {/* Generated Images */}
              {message.images && message.images.length > 0 && (
                <div className="mt-4 space-y-3">
                  {message.images.map((imgSrc, idx) => (
                    <div key={idx} className="relative group rounded-xl overflow-hidden border border-border inline-block">
                      <img
                        src={imgSrc}
                        alt={`Generated image ${idx + 1}`}
                        className="max-w-full max-h-[512px] rounded-xl object-contain"
                      />
                      <a
                        href={imgSrc}
                        download={`nexusai-image-${idx + 1}.png`}
                        className="absolute top-2 right-2 p-2 rounded-lg bg-background/80 backdrop-blur-sm text-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background"
                        title="Download image"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    </div>
                  ))}
                </div>
              )}

              {/* Like / Dislike buttons */}
              <div className="flex items-center gap-1 mt-4 pt-2">
                <button
                  onClick={() => setFeedback(feedback === "like" ? null : "like")}
                  className={`p-1.5 rounded-lg transition-all ${
                    feedback === "like"
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                  title="Good response"
                >
                  <ThumbsUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setFeedback(feedback === "dislike" ? null : "dislike")}
                  className={`p-1.5 rounded-lg transition-all ${
                    feedback === "dislike"
                      ? "text-destructive bg-destructive/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                  title="Bad response"
                >
                  <ThumbsDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
