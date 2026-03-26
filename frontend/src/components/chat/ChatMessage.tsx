import type { ChatMessageResponse } from '../../types';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';

interface ChatMessageProps {
  message: ChatMessageResponse;
  isLastAssistant: boolean;
  onRetry?: () => void;
}

function formatMessageTimestamp(dateString: string): { label: string; title: string } {
  const date = new Date(dateString);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const sameYear = date.getFullYear() === now.getFullYear();

  const label = sameDay
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], sameYear
      ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
      : { year: 'numeric', month: 'short', day: 'numeric' });

  return {
    label,
    title: date.toLocaleString(),
  };
}

/**
 * Router component that renders UserMessage or AssistantMessage based on role (D-14).
 */
export function ChatMessage({ message, isLastAssistant, onRetry }: ChatMessageProps) {
  const timestamp = formatMessageTimestamp(message.created_at);

  if (message.role === 'user') {
    return <UserMessage message={message} timestamp={timestamp} />;
  }
  return (
    <AssistantMessage
      message={message}
      isLastAssistant={isLastAssistant}
      onRetry={onRetry}
      timestamp={timestamp}
    />
  );
}
