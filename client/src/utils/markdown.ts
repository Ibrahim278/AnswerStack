/**
 * Strip <think>...</think> blocks from LLM output.
 * Some reasoning models (GLM-4, DeepSeek, etc.) wrap chain-of-thought
 * in <think> tags that should never be shown to the user.
 */
export function stripThinkBlocks(text: string): string {
  // Handle complete <think>...</think> blocks (case-insensitive, across newlines)
  let result = text.replace(/<think>[\s\S]*?<\/think>\s*/gi, '');
  // Handle unclosed <think> at the end (streaming: model is still thinking)
  result = result.replace(/<think>[\s\S]*$/gi, '');
  // Handle stray closing tags
  result = result.replace(/<\/think>\s*/gi, '');
  // Handle partial opening tag at end of stream (e.g. "<thi", "<think")
  result = result.replace(/<t(?:h(?:i(?:n(?:k)?)?)?)?$/i, '');
  return result.trim();
}

/**
 * Strip markdown formatting and [Source N] citations for clean clipboard copy.
 */
export function stripMarkdownAndCitations(markdown: string): string {
  return stripThinkBlocks(markdown)
    // Remove [Source N] and [Source N, Source M, ...] citations
    .replace(/\[Source \d+(?:,\s*Source \d+)*\]/g, '')
    // Remove markdown bold/italic
    .replace(/\*{1,3}(.*?)\*{1,3}/g, '$1')
    .replace(/_{1,3}(.*?)_{1,3}/g, '$1')
    // Remove inline code
    .replace(/`([^`]+)`/g, '$1')
    // Remove code blocks (fenced)
    .replace(/```[\s\S]*?```/g, (match) => {
      // Keep the code content, remove the fences
      return match.replace(/```\w*\n?/g, '').trim();
    })
    // Remove headers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove links but keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove images
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // Remove blockquote markers
    .replace(/^>\s?/gm, '')
    // Remove horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Clean up extra whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Process citations in text, replacing with a marker that react-markdown
 * can render as a custom link. Uses a special URL scheme: citation://N
 *
 * Supports multiple citation formats from different LLMs:
 * - [Source N] (standard format)
 * - <sup>N</sup> (HTML superscript from some models)
 * - ^N^ (plain caret citations emitted by some models)
 *
 * Also strips <think> blocks from reasoning models.
 *
 * Applied to full accumulated text on every render, not incrementally.
 */
export function processCitations(text: string): string {
  const cleaned = stripThinkBlocks(text);
  return cleaned
    // [Source N, Source M, ...] -> multiple citation links
    .replace(
      /\[Source (\d+(?:,\s*Source \d+)*)\]/g,
      (_match, inner: string) => {
        const nums = inner.match(/\d+/g) ?? [];
        return nums.map((n: string) => `[${n}](citation://${n})`).join('');
      },
    )
    // <sup>N</sup> -> citation link (LLMs outputting HTML superscripts)
    .replace(
      /<sup>(\d+)<\/sup>/gi,
      '[$1](citation://$1)',
    )
    // ^N^ -> citation link (raw caret syntax from model output)
    .replace(
      /\^(\d+)\^/g,
      '[$1](citation://$1)',
    );
}
