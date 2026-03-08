import { useState, useRef, useEffect, useCallback } from "react";
import { ChatSidebar } from "@/components/ChatSidebar";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { TypingIndicator } from "@/components/TypingIndicator";
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { ImageGallery } from "@/components/ImageGallery";
import { streamChat, generateId, isImageRequest, generateImage } from "@/lib/chat";
import type { Message, Conversation } from "@/lib/chat";
import { Menu, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  loadConversations,
  loadMessages,
  createConversation as dbCreateConversation,
  saveMessage,
  deleteConversation as dbDeleteConversation,
} from "@/lib/db";

const Index = () => {
  const { user, signOut } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [category, setCategory] = useState("general");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showGallery, setShowGallery] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  const activeConv = conversations.find((c) => c.id === activeId) || null;

  // Load conversations from DB when user is logged in
  useEffect(() => {
    if (!user) return;
    setLoadingConvs(true);
    loadConversations(user.id)
      .then(setConversations)
      .catch(() => toast.error("Failed to load conversations"))
      .finally(() => setLoadingConvs(false));
  }, [user]);

  // Clear conversations when user logs out
  useEffect(() => {
    if (!user) {
      setConversations([]);
      setActiveId(null);
    }
  }, [user]);

  // Load messages when active conversation changes (for DB-backed convos)
  useEffect(() => {
    if (!activeId || !user) return;
    const conv = conversations.find((c) => c.id === activeId);
    if (conv && conv.messages.length === 0) {
      loadMessages(activeId).then((msgs) => {
        if (msgs.length > 0) {
          setConversations((prev) =>
            prev.map((c) => (c.id === activeId ? { ...c, messages: msgs } : c))
          );
        }
      });
    }
  }, [activeId, user]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [activeConv?.messages, scrollToBottom]);

  const sendMessage = async (content: string) => {
    let convId = activeId;
    const isNew = !convId;

    if (isNew) {
      if (user) {
        // Persist to DB
        try {
          convId = await dbCreateConversation(user.id, content.slice(0, 40), category);
        } catch {
          toast.error("Failed to create conversation");
          return;
        }
      } else {
        convId = generateId();
      }
      const conv: Conversation = {
        id: convId,
        title: content.slice(0, 40),
        messages: [],
        category,
        createdAt: new Date(),
      };
      setConversations((prev) => [conv, ...prev]);
      setActiveId(convId);
    }

    const userMsg: Message = {
      id: generateId(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    // Save user message to DB if logged in
    if (user) {
      try {
        const dbId = await saveMessage(convId!, "user", content);
        userMsg.id = dbId;
      } catch {
        // Continue with local-only
      }
    }

    setConversations((prev) =>
      prev.map((c) =>
        c.id === convId
          ? {
              ...c,
              messages: [...c.messages, userMsg],
              title: c.messages.length === 0 ? content.slice(0, 40) : c.title,
            }
          : c
      )
    );

    setIsLoading(true);
    const localAssistantId = generateId();

    // Check if this is an image generation request
    if (isImageRequest(content)) {
      await generateImage({
        prompt: content,
        onResult: async (text, images) => {
          const assistantMsg: Message = {
            id: localAssistantId,
            role: "assistant",
            content: text,
            images,
            timestamp: new Date(),
          };
          setConversations((prev) =>
            prev.map((c) =>
              c.id === convId
                ? { ...c, messages: [...c.messages, assistantMsg] }
                : c
            )
          );
          setIsLoading(false);
          if (user) {
            try {
              const dbId = await saveMessage(convId!, "assistant", text);
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === convId
                    ? { ...c, messages: c.messages.map((m) => m.id === localAssistantId ? { ...m, id: dbId } : m) }
                    : c
                )
              );
            } catch { /* non-critical */ }
          }
        },
        onError: (err) => {
          setIsLoading(false);
          toast.error(err);
        },
      });
      return;
    }

    const existingMessages = conversationsRef.current.find((c) => c.id === convId)?.messages || [];
    const allMessages = [
      ...existingMessages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content },
    ];

    await streamChat({
      messages: allMessages,
      category,
      onDelta: (delta) => {
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== convId) return c;
            const existing = c.messages.find((m) => m.id === localAssistantId);
            if (existing) {
              return {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === localAssistantId ? { ...m, content: m.content + delta } : m
                ),
              };
            }
            return {
              ...c,
              messages: [
                ...c.messages,
                { id: localAssistantId, role: "assistant" as const, content: delta, timestamp: new Date() },
              ],
            };
          })
        );
      },
      onDone: async () => {
        setIsLoading(false);
        if (user) {
          const finalConv = conversationsRef.current.find((c) => c.id === convId);
          const assistantMsg = finalConv?.messages.find((m) => m.id === localAssistantId);
          if (assistantMsg) {
            try {
              const dbId = await saveMessage(convId!, "assistant", assistantMsg.content);
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === convId
                    ? {
                        ...c,
                        messages: c.messages.map((m) =>
                          m.id === localAssistantId ? { ...m, id: dbId } : m
                        ),
                      }
                    : c
                )
              );
            } catch { /* non-critical */ }
          }
        }
      },
      onError: (err) => {
        setIsLoading(false);
        toast.error(err);
      },
    });
  };

  const handleDeleteConversation = async (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(null);
    if (user) {
      try {
        await dbDeleteConversation(id);
      } catch {
        toast.error("Failed to delete conversation");
      }
    }
  };

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      {/* Mobile toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed top-3 left-3 z-50 md:hidden w-9 h-9 rounded-lg bg-card border border-border flex items-center justify-center text-foreground"
      >
        {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </button>

      {/* Sidebar */}
      <div className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0 fixed md:relative z-40 h-full transition-transform duration-200`}>
        <ChatSidebar
          conversations={conversations}
          activeId={activeId}
          onSelect={(id) => { setActiveId(id); setShowGallery(false); setSidebarOpen(false); }}
          onNew={() => { setActiveId(null); setShowGallery(false); setSidebarOpen(false); }}
          onDelete={handleDeleteConversation}
          onGallery={() => { setShowGallery(!showGallery); setActiveId(null); setSidebarOpen(false); }}
          showGallery={showGallery}
          user={user}
          onSignOut={signOut}
        />
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-background/60 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {showGallery ? (
          <ImageGallery
            conversations={conversations}
            onBack={() => setShowGallery(false)}
          />
        ) : !activeConv || activeConv.messages.length === 0 ? (
          <>
            <WelcomeScreen onPrompt={sendMessage} />
            <ChatInput onSend={sendMessage} isLoading={isLoading} category={category} onCategoryChange={setCategory} />
          </>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto">
              {activeConv.messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}
              {isLoading && !activeConv.messages.some((m) => m.role === "assistant") && <TypingIndicator />}
              <div ref={messagesEndRef} />
            </div>
            <ChatInput onSend={sendMessage} isLoading={isLoading} category={category} onCategoryChange={setCategory} />
          </>
        )}
      </div>
    </div>
  );
};

export default Index;
