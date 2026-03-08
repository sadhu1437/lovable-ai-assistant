import { useState } from "react";
import { ArrowLeft, Download, X, Image as ImageIcon } from "lucide-react";
import type { Conversation } from "@/lib/chat";

interface GalleryImage {
  src: string;
  conversationTitle: string;
  messageContent: string;
}

interface ImageGalleryProps {
  conversations: Conversation[];
  onBack: () => void;
}

export function ImageGallery({ conversations, onBack }: ImageGalleryProps) {
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);

  // Collect all images from all conversations
  const allImages: GalleryImage[] = conversations.flatMap((conv) =>
    conv.messages
      .filter((msg) => msg.images && msg.images.length > 0)
      .flatMap((msg) =>
        (msg.images || []).map((src) => ({
          src,
          conversationTitle: conv.title,
          messageContent: msg.content,
        }))
      )
  );

  return (
    <div className="flex-1 flex flex-col min-w-0 h-screen">
      {/* Header */}
      <div className="border-b border-border bg-background/80 backdrop-blur-xl px-6 py-4 flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-foreground font-mono">Image Gallery</h1>
          <p className="text-xs text-muted-foreground">
            {allImages.length} image{allImages.length !== 1 ? "s" : ""} generated
          </p>
        </div>
      </div>

      {/* Gallery Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {allImages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
              <ImageIcon className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground font-mono mb-2">No images yet</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              Generate images by asking NexusAI to "create an image", "draw", or "imagine" something.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {allImages.map((img, idx) => (
              <div
                key={idx}
                onClick={() => setSelectedImage(img)}
                className="group relative rounded-xl overflow-hidden border border-border bg-card cursor-pointer hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/5"
              >
                <div className="aspect-square">
                  <img
                    src={img.src}
                    alt={img.messageContent}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                  <p className="text-xs font-mono text-foreground truncate">{img.conversationTitle}</p>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">{img.messageContent}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-background/90 backdrop-blur-xl flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={selectedImage.src}
              alt={selectedImage.messageContent}
              className="max-w-full max-h-[80vh] rounded-xl border border-border object-contain"
            />
            <div className="flex items-center justify-between mt-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-mono text-foreground truncate">{selectedImage.conversationTitle}</p>
                <p className="text-xs text-muted-foreground truncate">{selectedImage.messageContent}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <a
                  href={selectedImage.src}
                  download="nexusai-image.png"
                  className="p-2 rounded-lg bg-secondary hover:bg-muted text-foreground transition-colors"
                  title="Download"
                >
                  <Download className="w-4 h-4" />
                </a>
                <button
                  onClick={() => setSelectedImage(null)}
                  className="p-2 rounded-lg bg-secondary hover:bg-muted text-foreground transition-colors"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
