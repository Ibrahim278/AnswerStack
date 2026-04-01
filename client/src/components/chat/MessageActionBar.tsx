import { useState } from 'react';
import { Copy, Check, Play, RefreshCw, Square, Loader2 } from 'lucide-react';
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
  messageId: string;
  onRetry?: () => void;
  showRetry: boolean;
  showSpeech: boolean;
  speechDisabled: boolean;
  isSpeaking: boolean;
  isLoadingSpeech: boolean;
  onToggleSpeech?: (messageId: string) => void;
}

/**
 * Hover action bar with Copy and Retry icons.
 * Appears on hover at bottom-right of assistant messages.
 */
export function MessageActionBar({
  content,
  messageId,
  onRetry,
  showRetry,
  showSpeech,
  speechDisabled,
  isSpeaking,
  isLoadingSpeech,
  onToggleSpeech,
}: MessageActionBarProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const plainText = stripMarkdownAndCitations(content);

    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(plainText).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => fallbackCopy(plainText));
      return;
    }

    fallbackCopy(plainText);
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
    <TooltipProvider delayDuration={300}>
      <div className="ml-auto inline-flex items-center gap-1">
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

        {showSpeech && onToggleSpeech && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onToggleSpeech(messageId)}
                disabled={(speechDisabled || isLoadingSpeech) && !isSpeaking}
                aria-label={isSpeaking ? 'Stop reading aloud' : isLoadingSpeech ? 'Loading audio...' : 'Read answer aloud'}
              >
                {isLoadingSpeech ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : isSpeaking ? (
                  <Square className="w-3.5 h-3.5" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {isSpeaking ? 'Stop reading aloud' : 'Read answer aloud'}
            </TooltipContent>
          </Tooltip>
        )}

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
