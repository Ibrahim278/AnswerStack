import { memo, useState } from 'react';
import { BookOpen } from 'lucide-react';
import type { ChatMessageResponse } from '@/types';
import { useChatStore } from '@/stores/chatStore';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { MessageActionBar } from '@/components/chat/MessageActionBar';
import { SpeechInlineNotice } from '@/components/chat/SpeechInlineNotice';

interface AssistantMessageProps {
  message: ChatMessageResponse;
  isLastAssistant: boolean;
  onRetry?: () => void;
  showSpeech: boolean;
  speechDisabled: boolean;
  isSpeaking: boolean;
  isLoadingSpeech: boolean;
  onToggleSpeech?: (messageId: string) => void;
}

/**
 * Left-aligned assistant message with full markdown rendering, citations,
 * code highlighting, and inline copy/retry actions.
 */
function AssistantMessageInner({
  message,
  isLastAssistant,
  onRetry,
  showSpeech,
  speechDisabled,
  isSpeaking,
  isLoadingSpeech,
  onToggleSpeech,
}: AssistantMessageProps) {
  const openSourcePanel = useChatStore((s) => s.openSourcePanel);
  const speechError = useChatStore((s) => s.speechError);
  const speechPlaybackErrorMessageId = useChatStore((s) => s.speechPlaybackErrorMessageId);
  const rawSources = message.sources_json;
  const sources = Array.isArray(rawSources)
    ? rawSources.filter((s) => s && typeof s === 'object' && s.chunk_text)
    : [];
  const playbackNotice =
    speechPlaybackErrorMessageId === message.id &&
    speechError &&
    (speechError.code === 'playback-blocked' || speechError.code === 'playback-interrupted')
      ? speechError
      : null;

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-xl px-4 py-3 bg-card border border-border">
        {/* Markdown content */}
        <MarkdownRenderer content={message.content} messageId={message.id} />

        {/* Footer: sources + copy + retry */}
        <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-2">
          {sources.length > 0 && (
            <button
              onClick={() => openSourcePanel(message.id)}
              className="flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <BookOpen className="w-3 h-3" />
              {sources.length} source{sources.length !== 1 ? 's' : ''}
            </button>
          )}
          <MessageActionBar
            content={message.content}
            messageId={message.id}
            showRetry={isLastAssistant}
            onRetry={onRetry}
            showSpeech={showSpeech}
            speechDisabled={speechDisabled}
            isSpeaking={isSpeaking}
            isLoadingSpeech={isLoadingSpeech}
            onToggleSpeech={onToggleSpeech}
          />
        </div>

        {playbackNotice ? <div className="mt-3"><SpeechInlineNotice notice={playbackNotice} /></div> : null}
      </div>
    </div>
  );
}

// React.memo for completed messages -- only streaming message re-renders
export const AssistantMessage = memo(AssistantMessageInner);
