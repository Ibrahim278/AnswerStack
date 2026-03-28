import { ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ScrollToBottomProps {
  visible: boolean;
  onClick: () => void;
}

export function ScrollToBottom({ visible, onClick }: ScrollToBottomProps) {
  return (
    <Button
      variant="secondary"
      size="icon"
      onClick={onClick}
      aria-label="Scroll to latest message"
      className={cn(
        'absolute bottom-20 right-5 z-10 h-10 w-10 rounded-full shadow-md transition-all duration-150',
        visible
          ? 'translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-2 opacity-0',
      )}
    >
      <ArrowDown className="h-5 w-5" />
    </Button>
  );
}
