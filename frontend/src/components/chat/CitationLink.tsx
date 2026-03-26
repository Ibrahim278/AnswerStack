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
      <sup>
        <a
          href="#"
          role="button"
          aria-label={`View source ${sourceNumber}`}
          onClick={(e) => {
            e.preventDefault();
            openSourcePanel(messageId);
            // Dispatch custom event for scroll-to-card (SourcePanel will listen)
            window.dispatchEvent(
              new CustomEvent('citation-click', { detail: { sourceNumber } }),
            );
          }}
          style={{
            color: 'var(--mantine-color-blue-6)',
            textDecoration: 'none',
            cursor: 'pointer',
            fontSize: '12px',
          }}
          {...props}
        >
          {children}
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
