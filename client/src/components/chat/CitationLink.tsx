import type { AnchorHTMLAttributes } from 'react';
import { useChatStore } from '@/stores/chatStore';

interface CitationLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  messageId: string;
}

/**
 * Renders [Source N] citations as superscript clickable links.
 * Clicking opens source panel and triggers scroll-to-card.
 */
export function CitationLink({ href, children, messageId, ...props }: CitationLinkProps) {
  const openSourcePanel = useChatStore((s) => s.openSourcePanel);

  if (href?.startsWith('citation://')) {
    const sourceNumber = parseInt(href.replace('citation://', ''), 10);
    return (
      <sup>
        <a
          href="#"
          role="button"
          className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[11px] font-medium rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors no-underline"
          aria-label={`Open source ${sourceNumber}`}
          onClick={(e) => {
            e.preventDefault();
            openSourcePanel(messageId);
            window.dispatchEvent(
              new CustomEvent('citation-click', {
                detail: { messageId, sourceNumber },
              }),
            );
          }}
          title={`Source ${sourceNumber}`}
          data-source-number={sourceNumber}
          {...props}
        >
          {sourceNumber}
        </a>
      </sup>
    );
  }

  // Regular links: open in new tab
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" {...props}>
      {children}
    </a>
  );
}
