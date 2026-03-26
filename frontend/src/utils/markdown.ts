/**
 * Strip markdown formatting and [Source N] citations for clean clipboard copy (D-46).
 */
export function stripMarkdownAndCitations(markdown: string): string {
  return markdown
    // Remove [Source N] citations
    .replace(/\[Source \d+\]/g, '')
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
 * Process [Source N] citations in text, replacing with a marker that react-markdown
 * can render as a custom link. Uses a special URL scheme: citation://N
 *
 * Applied to full accumulated text on every render, not incrementally (Pitfall 1).
 */
export function processCitations(text: string): string {
  return text.replace(
    /\[Source (\d+)\]/g,
    '[<sup>$1</sup>](citation://$1)',
  );
}
