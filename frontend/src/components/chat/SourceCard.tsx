import { useState, useRef, useEffect, useMemo } from 'react';
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SSESourceItem } from '@/types';
import { RelevanceBadge } from './RelevanceBadge';

interface SourceCardProps {
  source: SSESourceItem;
  index: number; // 0-based, displayed as index+1
  highlighted: boolean; // colored left border when scrolled-to
}

export function SourceCard({ source, index, highlighted }: SourceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [highlightActive, setHighlightActive] = useState(highlighted);
  const cardRef = useRef<HTMLDivElement>(null);

  // Highlight fades after 2.5s
  useEffect(() => {
    if (highlighted) {
      setHighlightActive(true);
      const timer = setTimeout(() => setHighlightActive(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [highlighted]);

  const handleCopyExcerpt = () => {
    void navigator.clipboard.writeText(source.chunk_text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const rawText = source.chunk_text;
  const TRUNCATE_LENGTH = 260;
  const needsTruncation = rawText.length > TRUNCATE_LENGTH;
  const displayText = expanded ? rawText : rawText.slice(0, TRUNCATE_LENGTH) + (needsTruncation ? '...' : '');

  const remarkPlugins = useMemo(() => [remarkGfm], []);

  return (
    <Card
      ref={cardRef}
      data-source-index={index + 1}
      className={cn(
        'p-3 transition-all duration-200 border-l-[3px]',
        highlightActive
          ? 'border-l-primary shadow-md'
          : 'border-l-transparent',
      )}
      tabIndex={-1}
      role="article"
      aria-label={`Source ${index + 1}: ${source.document_name}`}
      aria-expanded={expanded}
      onKeyDown={(e) => {
        if (e.key === 'Enter') setExpanded(!expanded);
      }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header: Source number + document name + relevance badge */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <Badge className="shrink-0 text-[10px] px-1.5 py-0">
            Source {index + 1}
          </Badge>
          <span className="text-sm font-semibold truncate text-foreground">
            {source.document_name}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <RelevanceBadge score={source.relevance_score} />
          {source.page_number !== null && (
            <span className="text-[11px] text-muted-foreground">
              p. {source.page_number}
            </span>
          )}
        </div>
      </div>

      {/* Excerpt */}
      <div className="mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 block mb-1.5">
          Evidence excerpt
        </span>
        <div className="text-xs text-muted-foreground leading-relaxed prose prose-xs prose-slate dark:prose-invert max-w-none break-words overflow-hidden [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 [&_pre]:text-[10px] [&_pre]:p-2 [&_pre]:rounded [&_pre]:bg-muted [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:break-all [&_code]:text-[10px] [&_code]:break-all [&_table]:text-[10px] [&_h1]:text-xs [&_h2]:text-xs [&_h3]:text-xs [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-medium [&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-2 [&_blockquote]:text-muted-foreground">
          <Markdown remarkPlugins={remarkPlugins}>{displayText}</Markdown>
        </div>
      </div>

      {/* Bottom actions: expand + copy */}
      <div className="flex items-center justify-between mt-1">
        {needsTruncation ? (
          <button
            className="flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            aria-label={expanded ? 'Collapse excerpt' : 'Expand excerpt'}
          >
            {expanded ? 'Show less' : 'Show more'}
            {expanded ? (
              <ChevronUp className="w-3.5 h-3.5 ml-1" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 ml-1" />
            )}
          </button>
        ) : (
          <div />
        )}
        <button
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            handleCopyExcerpt();
          }}
          aria-label="Copy excerpt"
        >
          {copied ? (
            <Check className="w-3 h-3 text-green-500" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
        </button>
      </div>
    </Card>
  );
}
