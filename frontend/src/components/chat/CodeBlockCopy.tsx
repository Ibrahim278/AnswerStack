import { useState, useRef, isValidElement, type ReactNode } from 'react';
import { ActionIcon, Tooltip, Box } from '@mantine/core';
import { IconCopy, IconCheck } from '@tabler/icons-react';

interface CodeBlockCopyProps {
  children: ReactNode;
}

/**
 * Extract text content from React children recursively.
 */
function extractTextContent(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (!node) return '';
  if (Array.isArray(node)) return node.map(extractTextContent).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return extractTextContent(node.props.children);
  }
  return '';
}

/**
 * Copy button overlay on code blocks (D-38).
 * Icon changes to checkmark for 2 seconds after copying.
 */
export function CodeBlockCopy({ children }: CodeBlockCopyProps) {
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  const handleCopy = () => {
    // Prefer DOM text content from ref, fall back to recursive child extraction
    const text = preRef.current?.textContent ?? extractTextContent(children);
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Box pos="relative">
      <Tooltip label={copied ? 'Copied!' : 'Copy code'} position="left">
        <ActionIcon
          variant="subtle"
          size="sm"
          pos="absolute"
          top={8}
          right={8}
          onClick={handleCopy}
          aria-label="Copy to clipboard"
          style={{ zIndex: 1 }}
        >
          {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
        </ActionIcon>
      </Tooltip>
      <pre ref={preRef} style={{ margin: 0 }}>{children}</pre>
    </Box>
  );
}
