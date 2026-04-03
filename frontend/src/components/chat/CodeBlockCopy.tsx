import { useState, useRef, isValidElement, type ReactNode } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

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
 * Copy button overlay on code blocks.
 * Icon changes to checkmark for 2 seconds after copying.
 */
export function CodeBlockCopy({ children }: CodeBlockCopyProps) {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
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

  const handleCopy = () => {
    const text = preRef.current?.textContent ?? extractTextContent(children);
    copyToClipboard(text);
  };

  return (
    <div
      className="relative group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={handleCopy}
        aria-label="Copy to clipboard"
        className={cn(
          'absolute top-2 right-2 z-10 p-1.5 rounded-md transition-all',
          'bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground',
          'border border-border/50',
          hovered ? 'opacity-100' : 'opacity-0',
        )}
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      <pre ref={preRef} className="m-0 overflow-x-auto rounded-lg">{children}</pre>
    </div>
  );
}
