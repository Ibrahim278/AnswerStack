import { memo } from 'react';
import type { ChatMessageResponse } from '@/types';

interface UserMessageProps {
  message: ChatMessageResponse;
}

/**
 * Right-aligned user message bubble with primary color background.
 */
function UserMessageInner({ message }: UserMessageProps) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%]">
        <div className="rounded-xl px-4 py-3 bg-primary text-primary-foreground">
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
        </div>
      </div>
    </div>
  );
}

export const UserMessage = memo(UserMessageInner);
