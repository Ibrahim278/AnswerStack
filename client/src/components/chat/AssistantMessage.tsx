import { memo, useState } from 'react';
import { BookOpen, Copy, Check, RefreshCw } from 'lucide-react';
import type { ChatMessageResponse } from '@/types';
import { useChatStore } from '@/stores/chatStore';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { stripMarkdownAndCitations } from '@/utils/markdown';

interface AssistantMessageProps {
  message: ChatMessageResponse;
  isLastAssistant: boolean;
  onRetry?: () => void;
}

/**
 * Left-aligned assistant message with full markdown rendering, citations,
 * code highlighting, and inline copy/retry actions.
 */
function AssistantMessageInner({ message, isLastAssistant, onRetry }: AssistantMessageProps) {
  const [copied, setCopied] = useState(false);
  const openSourcePanel = useChatStore((s) => s.openSourcePanel);
  const rawSources = message.sources_json;
  const sources = Array.isArray(rawSources)
    ? rawSources.filter((s) => s && typeof s === 'object' && s.chunk_text)
    : [];

  const handleCopy = () => {
    const plainText = stripMarkdownAndCitations(message.content);
    // Fallback for non-secure contexts (e.g. LAN IP access)
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(plainText).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => fallbackCopy(plainText));
    } else {
      fallbackCopy(plainText);
    }
  };

  const fallbackCopy = (text: string) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-xl px-4 py-3 bg-card border border-border">
        {/* Markdown content */}
        <MarkdownRenderer content={message.content} messageId={message.id} />

        {/* Footer: sources + copy + retry */}
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
          {sources.length > 0 && (
            <button
              onClick={() => openSourcePanel(message.id)}
              className="flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <BookOpen className="w-3 h-3" />
              {sources.length} source{sources.length !== 1 ? 's' : ''}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Copy to clipboard"
          >
            {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
          </button>
          {isLastAssistant && onRetry && (
            <button
              onClick={onRetry}
              className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Retry response"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// React.memo for completed messages -- only streaming message re-renders
export const AssistantMessage = memo(AssistantMessageInner);
