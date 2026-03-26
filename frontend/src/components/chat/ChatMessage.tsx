import type { ChatMessageResponse } from '../../types';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';

interface ChatMessageProps {
  message: ChatMessageResponse;
  isLastAssistant: boolean;
  onRetry?: () => void;
}

/**
 * Router component that renders UserMessage or AssistantMessage based on role (D-14).
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
