import { useState } from 'react';
import { Copy, Check, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { stripMarkdownAndCitations } from '@/utils/markdown';

interface MessageActionBarProps {
  content: string;
  onRetry?: () => void;
  showRetry: boolean;
}

/**
 * Hover action bar with Copy and Retry icons.
 * Appears on hover at bottom-right of assistant messages.
 */
export function MessageActionBar({ content, onRetry, showRetry }: MessageActionBarProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const plainText = stripMarkdownAndCitations(content);
    void navigator.clipboard.writeText(plainText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="inline-flex items-center gap-1 px-1.5 py-1 rounded-full bg-card/95 border border-border shadow-md backdrop-blur-sm">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleCopy}
              aria-label="Copy to clipboard"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {copied ? 'Copied!' : 'Copy'}
          </TooltipContent>
        </Tooltip>

        {showRetry && onRetry && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onRetry}
                aria-label="Retry response"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              Retry
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
