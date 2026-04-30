import { useMemo } from 'react';
import Markdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';
import { processCitations } from '@/utils/markdown';
import { CitationLink } from '@/components/chat/CitationLink';
import { CodeBlockCopy } from '@/components/chat/CodeBlockCopy';

interface MarkdownRendererProps {
  /** Raw markdown content (citations will be processed automatically) */
  content: string;
  /** Message ID used for citation link routing */
  messageId: string;
}

/**
 * Reusable markdown renderer with syntax highlighting, citation links,
 * code block copy buttons, and Tailwind-styled prose.
 *
 * Used by both AssistantMessage (completed) and StreamingMessage (in-flight).
 */
export function MarkdownRenderer({ content, messageId }: MarkdownRendererProps) {
  const processedContent = useMemo(() => processCitations(content), [content]);

  const urlTransform = useMemo(
    () => (url: string) => (url.startsWith('citation://') ? url : defaultUrlTransform(url)),
    [],
  );

  const components = useMemo(() => ({
    a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
      <CitationLink {...props} messageId={messageId} />
    ),
    pre: ({ children }: { children?: React.ReactNode }) => (
      <CodeBlockCopy>{children}</CodeBlockCopy>
    ),
    table: ({ children }: { children?: React.ReactNode }) => (
      <div className="overflow-x-auto my-3">
        <table className="w-full text-sm border-collapse border border-border">
          {children}
        </table>
      </div>
    ),
    th: ({ children }: { children?: React.ReactNode }) => (
      <th className="border border-border bg-muted px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">
        {children}
      </th>
    ),
    td: ({ children }: { children?: React.ReactNode }) => (
      <td className="border border-border px-3 py-1.5">
        {children}
      </td>
    ),
    // No images -- suppress to avoid broken renders
    img: ({ alt }: { alt?: string }) => <span>{alt ?? ''}</span>,
  }), [messageId]);

  return (
    <div className="prose prose-sm prose-slate dark:prose-invert max-w-none text-sm leading-relaxed text-foreground [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_pre]:bg-[#0d1117] [&_pre]:p-3 [&_pre]:rounded-lg [&_code]:text-xs [&_code]:font-mono [&_blockquote]:border-l-2 [&_blockquote]:border-primary/30 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-medium">
      <Markdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeHighlight, rehypeKatex]}
        components={components}
        urlTransform={urlTransform}
      >
        {processedContent}
      </Markdown>
    </div>
  );
}
