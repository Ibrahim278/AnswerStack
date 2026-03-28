import { FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useChatStore } from '@/stores/chatStore';

interface SourceBadgeProps {
  messageId: string;
  sourceCount: number;
}

/**
 * Clickable "N sources" badge below assistant messages.
 * Clicking opens the source panel for that message.
 */
export function SourceBadge({ messageId, sourceCount }: SourceBadgeProps) {
  const openSourcePanel = useChatStore((s) => s.openSourcePanel);

  return (
    <button
      onClick={() => openSourcePanel(messageId)}
      aria-label={`${sourceCount} sources, click to view`}
      className="inline-flex"
    >
      <Badge
        variant="outline"
        className="cursor-pointer gap-1 text-[11px] text-primary border-primary/30 hover:bg-primary/10 transition-colors"
      >
        <FileText className="w-3 h-3" />
        {sourceCount} {sourceCount === 1 ? 'source' : 'sources'}
      </Badge>
    </button>
  );
}
