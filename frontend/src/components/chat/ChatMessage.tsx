import type { ChatMessageResponse } from '@/types';
import { UserMessage } from '@/components/chat/UserMessage';
import { AssistantMessage } from '@/components/chat/AssistantMessage';

interface ChatMessageProps {
  message: ChatMessageResponse;
  isLastAssistant: boolean;
  onRetry?: () => void;
}

/**
 * Router component that renders UserMessage or AssistantMessage based on role.
 */
export function ChatMessage({ message, isLastAssistant, onRetry }: ChatMessageProps) {
  if (message.role === 'user') {
    return <UserMessage message={message} />;
  }
  return (
    <AssistantMessage
      message={message}
      isLastAssistant={isLastAssistant}
      onRetry={onRetry}
    />
  );
}
