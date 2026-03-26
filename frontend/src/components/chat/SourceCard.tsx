import { useState, useRef, useEffect } from 'react';
import { Paper, Group, Text, Badge, ActionIcon, Tooltip, Box, Button } from '@mantine/core';
import { IconCopy, IconCheck, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import type { SSESourceItem } from '../../types';
import { RelevanceBadge } from './RelevanceBadge';

interface SourceCardProps {
  source: SSESourceItem;
  index: number;      // 0-based, displayed as index+1
  highlighted: boolean; // D-21: colored left border when scrolled-to
}

function normalizeExcerpt(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/```/g, '').trim())
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\$\$?([^$]+)\$\$?/g, '$1')
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function SourceCard({ source, index, highlighted }: SourceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [highlightActive, setHighlightActive] = useState(highlighted);
  const cardRef = useRef<HTMLDivElement>(null);

  // D-21: highlight fades after 2-3s
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

  const cleanedExcerpt = normalizeExcerpt(source.chunk_text);
  const TRUNCATE_LENGTH = 260;
  const needsTruncation = cleanedExcerpt.length > TRUNCATE_LENGTH;
  const displayText = expanded ? cleanedExcerpt : cleanedExcerpt.slice(0, TRUNCATE_LENGTH);

  return (
    <Paper
      ref={cardRef}
      shadow="sm"
      p="sm"
      className="source-card"
      data-source-index={index + 1}
      style={{
        borderLeft: highlightActive ? '3px solid var(--mantine-color-blue-6)' : '3px solid transparent',
        transition: 'box-shadow 150ms ease, border-color 200ms ease-out',
        cursor: 'pointer',
      }}
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
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <Badge variant="filled" color="blue" size="sm" style={{ flexShrink: 0 }}>
            Source {index + 1}
          </Badge>
          <Text size="sm" fw={700} truncate style={{ flex: 1 }}>
            {source.document_name}
          </Text>
        </Group>
        <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
          <RelevanceBadge score={source.relevance_score} />
          {source.page_number !== null && (
            <Text size="xs" c="dimmed">
              p. {source.page_number}
            </Text>
          )}
        </Group>
      </Group>

      <Box mb="xs">
        <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={6} style={{ letterSpacing: '0.08em' }}>
          Evidence excerpt
        </Text>
        <Text size="sm" c="dimmed" style={{ whiteSpace: expanded ? 'pre-wrap' : 'normal', lineHeight: 1.6 }}>
          {displayText}
          {needsTruncation && !expanded && '...'}
        </Text>
      </Box>

      {/* Bottom actions: expand + copy */}
      <Group justify="space-between" mt="xs">
        {needsTruncation && (
          <Button
            variant="subtle"
            size="compact-sm"
            color="gray"
            rightSection={expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            aria-label={expanded ? 'Collapse excerpt' : 'Expand excerpt'}
          >
            {expanded ? 'Show less' : 'Show more'}
          </Button>
        )}
        <Tooltip label={copied ? 'Copied!' : 'Copy excerpt'} position="left">
          <ActionIcon
            variant="subtle"
            size="md"
            onClick={(e) => { e.stopPropagation(); handleCopyExcerpt(); }}
            aria-label="Copy to clipboard"
          >
            {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
          </ActionIcon>
        </Tooltip>
      </Group>
    </Paper>
  );
}
