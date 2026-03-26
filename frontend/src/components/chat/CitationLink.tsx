import type { AnchorHTMLAttributes } from 'react';
import { useChatStore } from '../../stores/chatStore';

interface CitationLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  messageId: string;
}

/**
 * Renders [Source N] citations as superscript clickable links (D-31).
 * Clicking opens source panel and triggers scroll-to-card (D-21).
 */
export function CitationLink({ href, children, messageId, ...props }: CitationLinkProps) {
  const openSourcePanel = useChatStore((s) => s.openSourcePanel);

  if (href?.startsWith('citation://')) {
    const sourceNumber = parseInt(href.replace('citation://', ''), 10);
    return (
      <sup className="citation-link-wrap">
        <a
          href="#"
          role="button"
          className="citation-link"
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
          [{sourceNumber}]
        </a>
      </sup>
    );
  }

  // Regular links: open in new tab (D-39)
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  );
}
