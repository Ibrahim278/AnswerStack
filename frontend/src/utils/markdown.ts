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
 * Convert LaTeX math expressions into spoken English for TTS.
 *
 * Applied before markdown stripping so that `$...$` delimiters and
 * `\command{...}` structures are replaced with readable text.
 * The mapping table is ordered: structural/nested patterns first,
 * then simple command replacements, then cleanup.
 */
export function latexToSpeech(text: string): string {
  let s = text;

  // --- Strip math delimiters (keep contents) ---
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, ' $1 ');
  s = s.replace(/\$([^$]+?)\$/g, ' $1 ');
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, ' $1 ');
  s = s.replace(/\\\((.+?)\\\)/g, ' $1 ');

  // --- Environments (strip, keep content) ---
  s = s.replace(/\\begin\{(?:equation|align|gather|aligned)\*?\}([\s\S]*?)\\end\{(?:equation|align|gather|aligned)\*?\}/g, '$1');
  s = s.replace(/\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g, ', where $1');
  s = s.replace(/\\begin\{[pvbBV]?matrix\}([\s\S]*?)\\end\{[pvbBV]?matrix\}/g, 'the matrix $1');

  // --- Fractions (apply repeatedly for nesting) ---
  for (let i = 0; i < 4; i++) {
    s = s.replace(/\\[dtc]?frac\{([^{}]+)\}\{([^{}]+)\}/g, '$1 over $2');
  }

  // --- Roots ---
  s = s.replace(/\\sqrt\[([^\]]+)\]\{([^{}]+)\}/g, 'the $1-th root of $2');
  s = s.replace(/\\sqrt\{([^{}]+)\}/g, 'the square root of $1');

  // --- Summation / product / integral with limits (BEFORE generic sub/superscripts) ---
  s = s.replace(/\\sum_\{([^{}]+)\}\^\{([^{}]+)\}/g, 'the sum from $1 to $2 of ');
  s = s.replace(/\\sum_\{([^{}]+)\}/g, 'the sum over $1 of ');
  s = s.replace(/\\prod_\{([^{}]+)\}\^\{([^{}]+)\}/g, 'the product from $1 to $2 of ');
  s = s.replace(/\\prod_\{([^{}]+)\}/g, 'the product over $1 of ');
  s = s.replace(/\\int_\{([^{}]+)\}\^\{([^{}]+)\}/g, 'the integral from $1 to $2 of ');
  s = s.replace(/\\iiint/g, 'the triple integral of ');
  s = s.replace(/\\iint/g, 'the double integral of ');
  s = s.replace(/\\oint/g, 'the contour integral of ');
  s = s.replace(/\\int/g, 'the integral of ');

  // --- Limits ---
  s = s.replace(/\\lim_\{([^{}]*)\\to\s*([^{}]*)\}/g, 'the limit as $1 approaches $2 of ');
  s = s.replace(/\\lim_\{([^{}]*)\\rightarrow\s*([^{}]*)\}/g, 'the limit as $1 approaches $2 of ');

  // --- Superscripts (special cases first) ---
  s = s.replace(/\^\{-1\}/g, ' inverse');
  s = s.replace(/\^\{2\}/g, ' squared');
  s = s.replace(/\^\{3\}/g, ' cubed');
  s = s.replace(/\^\{([^{}]+)\}/g, ' to the power of $1');
  s = s.replace(/\^(\d)/g, ' to the power of $1');
  s = s.replace(/\^([a-zA-Z])/g, ' to the power of $1');

  // --- Subscripts ---
  s = s.replace(/_\{([^{}]+)\}/g, ' sub $1');
  s = s.replace(/_(\d)/g, ' sub $1');
  s = s.replace(/_([a-zA-Z])/g, ' sub $1');

  // --- Binomial ---
  s = s.replace(/\\[dt]?binom\{([^{}]+)\}\{([^{}]+)\}/g, '$1 choose $2');

  // --- Accents / decorations ---
  s = s.replace(/\\(?:overline|widehat)\{([^{}]+)\}/g, '$1 bar');
  s = s.replace(/\\(?:widetilde|tilde)\{([^{}]+)\}/g, '$1 tilde');
  s = s.replace(/\\vec\{([^{}]+)\}/g, 'vector $1');
  s = s.replace(/\\hat\{([^{}]+)\}/g, '$1 hat');
  s = s.replace(/\\bar\{([^{}]+)\}/g, '$1 bar');
  s = s.replace(/\\dot\{([^{}]+)\}/g, '$1 dot');
  s = s.replace(/\\ddot\{([^{}]+)\}/g, '$1 double dot');

  // --- Text / font commands (extract content) ---
  s = s.replace(/\\(?:text|textrm|textbf|textit|mathrm|mathit|mathsf|mathtt|operatorname)\{([^{}]+)\}/g, '$1');
  s = s.replace(/\\mathbf\{([^{}]+)\}/g, 'bold $1');
  s = s.replace(/\\mathcal\{([^{}]+)\}/g, '$1');
  s = s.replace(/\\boldsymbol\{([^{}]+)\}/g, 'bold $1');
  s = s.replace(/\\boxed\{([^{}]+)\}/g, '$1');
  s = s.replace(/\\pmod\{([^{}]+)\}/g, ' mod $1');

  // --- Number sets (before generic \mathbb) ---
  s = s.replace(/\\mathbb\{R\}/g, 'the real numbers');
  s = s.replace(/\\mathbb\{N\}/g, 'the natural numbers');
  s = s.replace(/\\mathbb\{Z\}/g, 'the integers');
  s = s.replace(/\\mathbb\{Q\}/g, 'the rational numbers');
  s = s.replace(/\\mathbb\{C\}/g, 'the complex numbers');
  s = s.replace(/\\mathbb\{E\}/g, 'the expected value');
  s = s.replace(/\\mathbb\{P\}/g, 'the probability');
  s = s.replace(/\\mathbb\{([^{}]+)\}/g, '$1');

  // --- Delimiters ---
  s = s.replace(/\\left\(/g, '(');
  s = s.replace(/\\right\)/g, ')');
  s = s.replace(/\\left\[/g, '[');
  s = s.replace(/\\right\]/g, ']');
  s = s.replace(/\\left\\\{/g, '');
  s = s.replace(/\\right\\\}/g, '');
  s = s.replace(/\\left\|/g, 'the absolute value of ');
  s = s.replace(/\\right\|/g, '');
  s = s.replace(/\\left\./g, '');
  s = s.replace(/\\right\./g, '');
  s = s.replace(/\\langle/g, '');
  s = s.replace(/\\rangle/g, '');
  s = s.replace(/\\lfloor/g, 'the floor of ');
  s = s.replace(/\\rfloor/g, '');
  s = s.replace(/\\lceil/g, 'the ceiling of ');
  s = s.replace(/\\rceil/g, '');

  // --- Matrix separators ---
  s = s.replace(/\\\\/g, '; ');
  s = s.replace(/&/g, ', ');

  // --- Arrows (longer names before shorter to avoid partial matches) ---
  s = s.replace(/\\Longleftrightarrow/g, ' if and only if ');
  s = s.replace(/\\Longrightarrow/g, ' implies ');
  s = s.replace(/\\Leftrightarrow/g, ' if and only if ');
  s = s.replace(/\\leftrightarrow/g, ' if and only if ');
  s = s.replace(/\\Rightarrow/g, ' implies ');
  s = s.replace(/\\Leftarrow/g, ' is implied by ');
  s = s.replace(/\\rightarrow/g, ' goes to ');
  s = s.replace(/\\leftarrow/g, ' from ');
  s = s.replace(/\\mapsto/g, ' maps to ');
  s = s.replace(/\\iff/g, ' if and only if ');
  s = s.replace(/\\implies/g, ' implies ');
  s = s.replace(/\\to/g, ' to ');

  // --- Relations ---
  s = s.replace(/\\neq/g, ' is not equal to ');
  s = s.replace(/\\leq/g, ' is less than or equal to ');
  s = s.replace(/\\geq/g, ' is greater than or equal to ');
  s = s.replace(/\\ll/g, ' is much less than ');
  s = s.replace(/\\gg/g, ' is much greater than ');
  s = s.replace(/\\approx/g, ' is approximately ');
  s = s.replace(/\\simeq/g, ' is approximately ');
  s = s.replace(/\\cong/g, ' is congruent to ');
  s = s.replace(/\\sim/g, ' is similar to ');
  s = s.replace(/\\equiv/g, ' is equivalent to ');
  s = s.replace(/\\propto/g, ' is proportional to ');
  s = s.replace(/\\triangleq/g, ' is defined as ');
  s = s.replace(/\\coloneqq/g, ' is defined as ');

  // --- Calculus symbols ---
  s = s.replace(/\\partial/g, 'partial ');
  s = s.replace(/\\nabla/g, 'del ');
  s = s.replace(/\\infty/g, 'infinity');

  // --- Dots ---
  s = s.replace(/\\[clv]?dots/g, '...');
  s = s.replace(/\\ddots/g, '...');

  // --- Functions ---
  s = s.replace(/\\arcsin/g, 'arc sine');
  s = s.replace(/\\arccos/g, 'arc cosine');
  s = s.replace(/\\arctan/g, 'arc tangent');
  s = s.replace(/\\sinh/g, 'hyperbolic sine');
  s = s.replace(/\\cosh/g, 'hyperbolic cosine');
  s = s.replace(/\\tanh/g, 'hyperbolic tangent');
  s = s.replace(/\\sin/g, 'sine');
  s = s.replace(/\\cos/g, 'cosine');
  s = s.replace(/\\tan/g, 'tangent');
  s = s.replace(/\\cot/g, 'cotangent');
  s = s.replace(/\\sec/g, 'secant');
  s = s.replace(/\\csc/g, 'cosecant');
  s = s.replace(/\\ln/g, 'natural log');
  s = s.replace(/\\log/g, 'log');
  s = s.replace(/\\exp/g, 'exp');
  s = s.replace(/\\max/g, 'max');
  s = s.replace(/\\min/g, 'min');
  s = s.replace(/\\arg/g, 'arg');
  s = s.replace(/\\det/g, 'determinant');
  s = s.replace(/\\dim/g, 'dimension');
  s = s.replace(/\\ker/g, 'kernel');
  s = s.replace(/\\gcd/g, 'greatest common divisor');
  s = s.replace(/\\mod/g, ' mod ');
  s = s.replace(/\\bmod/g, ' mod ');
  s = s.replace(/\\Pr/g, 'probability');
  s = s.replace(/\\lim/g, 'the limit of ');
  s = s.replace(/\\limsup/g, 'the limit supremum of ');
  s = s.replace(/\\liminf/g, 'the limit infimum of ');
  s = s.replace(/\\sum/g, 'the sum of ');
  s = s.replace(/\\prod/g, 'the product of ');

  // --- Greek letters (variants before base forms) ---
  s = s.replace(/\\varepsilon/g, 'epsilon');
  s = s.replace(/\\varphi/g, 'phi');
  s = s.replace(/\\vartheta/g, 'theta');
  s = s.replace(/\\varrho/g, 'rho');
  s = s.replace(/\\varsigma/g, 'sigma');
  s = s.replace(/\\alpha/g, 'alpha');
  s = s.replace(/\\beta/g, 'beta');
  s = s.replace(/\\gamma/g, 'gamma');
  s = s.replace(/\\delta/g, 'delta');
  s = s.replace(/\\epsilon/g, 'epsilon');
  s = s.replace(/\\zeta/g, 'zeta');
  s = s.replace(/\\eta/g, 'eta');
  s = s.replace(/\\theta/g, 'theta');
  s = s.replace(/\\iota/g, 'iota');
  s = s.replace(/\\kappa/g, 'kappa');
  s = s.replace(/\\lambda/g, 'lambda');
  s = s.replace(/\\mu/g, 'mu');
  s = s.replace(/\\nu/g, 'nu');
  s = s.replace(/\\xi/g, 'xi');
  s = s.replace(/\\pi/g, 'pi');
  s = s.replace(/\\rho/g, 'rho');
  s = s.replace(/\\sigma/g, 'sigma');
  s = s.replace(/\\tau/g, 'tau');
  s = s.replace(/\\phi/g, 'phi');
  s = s.replace(/\\chi/g, 'chi');
  s = s.replace(/\\psi/g, 'psi');
  s = s.replace(/\\omega/g, 'omega');
  s = s.replace(/\\ell/g, 'l');
  s = s.replace(/\\hbar/g, 'h bar');
  // Uppercase Greek
  s = s.replace(/\\Gamma/g, 'Gamma');
  s = s.replace(/\\Delta/g, 'Delta');
  s = s.replace(/\\Theta/g, 'Theta');
  s = s.replace(/\\Lambda/g, 'Lambda');
  s = s.replace(/\\Xi/g, 'Xi');
  s = s.replace(/\\Pi/g, 'Pi');
  s = s.replace(/\\Sigma/g, 'Sigma');
  s = s.replace(/\\Phi/g, 'Phi');
  s = s.replace(/\\Psi/g, 'Psi');
  s = s.replace(/\\Omega/g, 'Omega');

  // --- Logic / set theory ---
  s = s.replace(/\\forall/g, 'for all ');
  s = s.replace(/\\nexists/g, 'there does not exist ');
  s = s.replace(/\\exists/g, 'there exists ');
  s = s.replace(/\\neg/g, 'not ');
  s = s.replace(/\\land/g, ' and ');
  s = s.replace(/\\lor/g, ' or ');
  s = s.replace(/\\notin/g, ' is not in ');
  s = s.replace(/\\in/g, ' is in ');
  s = s.replace(/\\subseteq/g, ' is a subset of ');
  s = s.replace(/\\supseteq/g, ' is a superset of ');
  s = s.replace(/\\subset/g, ' is a subset of ');
  s = s.replace(/\\supset/g, ' is a superset of ');
  s = s.replace(/\\cup/g, ' union ');
  s = s.replace(/\\cap/g, ' intersection ');
  s = s.replace(/\\setminus/g, ' minus ');
  s = s.replace(/\\emptyset/g, 'the empty set');
  s = s.replace(/\\varnothing/g, 'the empty set');

  // --- Arithmetic operators ---
  s = s.replace(/\\times/g, ' times ');
  s = s.replace(/\\cdot/g, ' times ');
  s = s.replace(/\\div/g, ' divided by ');
  s = s.replace(/\\pm/g, ' plus or minus ');
  s = s.replace(/\\mp/g, ' minus or plus ');
  s = s.replace(/\\otimes/g, ' tensor product ');
  s = s.replace(/\\oplus/g, ' direct sum ');
  s = s.replace(/\\circ/g, ' of ');

  // --- Geometry / misc ---
  s = s.replace(/\\therefore/g, 'therefore ');
  s = s.replace(/\\because/g, 'because ');
  s = s.replace(/\\angle/g, 'angle ');
  s = s.replace(/\\perp/g, ' is perpendicular to ');
  s = s.replace(/\\parallel/g, ' is parallel to ');
  s = s.replace(/\\triangle/g, 'triangle ');
  s = s.replace(/\\degree/g, ' degrees');
  s = s.replace(/\\mid/g, ' given ');

  // --- Spacing (silent removal) ---
  s = s.replace(/\\(?:quad|qquad|,|;|!|:|\s)/g, ' ');
  s = s.replace(/\\(?:displaystyle|textstyle|scriptstyle|scriptscriptstyle)/g, '');
  s = s.replace(/\\(?:nonumber|notag)/g, '');
  s = s.replace(/\\(?:label|tag|phantom|hspace|vspace|color)\{[^{}]*\}/g, '');
  s = s.replace(/\\(?:left|right|[Bb]ig[gl]?r?)/g, '');
  s = s.replace(/\\newline/g, '. ');
  s = s.replace(/~/, ' ');

  // --- Literal characters ---
  s = s.replace(/\\%/g, ' percent');
  s = s.replace(/\\#/g, ' number ');
  s = s.replace(/\\&/g, ' and ');
  s = s.replace(/\\\{/g, '');
  s = s.replace(/\\\}/g, '');
  s = s.replace(/\\_/g, ' ');

  // --- Catch-all: remove unrecognized \commands ---
  s = s.replace(/\\[a-zA-Z]+/g, '');

  // --- Remove stray braces and collapse whitespace ---
  s = s.replace(/[{}]/g, '');

  // --- Conditional bar: P(A|B) -> P(A given B) ---
  // Replace literal | inside parentheses with "given" (probability notation).
  s = s.replace(/\(([^()]+)\|([^()]+)\)/g, '($1 given $2)');

  // --- Function application: f(x) -> "f of x", P(A) -> "P of A" ---
  // Matches a single letter/word followed by (...) — common math notation.
  s = s.replace(/\b([a-zA-Z][a-zA-Z]*)\(([^)]+)\)/g, '$1 of $2');

  s = s.replace(/ {2,}/g, ' ');

  return s;
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
