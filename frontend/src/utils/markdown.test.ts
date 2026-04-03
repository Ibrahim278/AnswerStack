import { describe, expect, it } from 'vitest';
import { latexToSpeech } from './markdown';

describe('latexToSpeech', () => {
  // --- Math delimiters ---
  it('strips inline $ delimiters', () => {
    expect(latexToSpeech('The value is $x$.')).toContain('x');
    expect(latexToSpeech('The value is $x$.')).not.toContain('$');
  });

  it('strips display $$ delimiters', () => {
    expect(latexToSpeech('$$E = mc^{2}$$')).not.toContain('$$');
  });

  it('strips \\[...\\] delimiters', () => {
    expect(latexToSpeech('\\[x + y\\]')).toContain('x + y');
  });

  // --- Fractions ---
  it('converts \\frac to spoken form', () => {
    expect(latexToSpeech('$\\frac{a}{b}$')).toContain('a over b');
  });

  it('handles nested fractions', () => {
    const result = latexToSpeech('$\\frac{\\frac{1}{2}}{3}$');
    expect(result).toContain('1 over 2');
    expect(result).toContain('over 3');
  });

  // --- Roots ---
  it('converts \\sqrt to spoken form', () => {
    expect(latexToSpeech('$\\sqrt{x}$')).toContain('the square root of x');
  });

  it('converts nth root', () => {
    expect(latexToSpeech('$\\sqrt[3]{8}$')).toContain('the 3-th root of 8');
  });

  // --- Superscripts ---
  it('converts ^{2} to squared', () => {
    expect(latexToSpeech('$x^{2}$')).toContain('x squared');
  });

  it('converts ^{3} to cubed', () => {
    expect(latexToSpeech('$x^{3}$')).toContain('x cubed');
  });

  it('converts ^{-1} to inverse', () => {
    expect(latexToSpeech('$f^{-1}$')).toContain('f inverse');
  });

  it('converts general superscript', () => {
    expect(latexToSpeech('$x^{n}$')).toContain('x to the power of n');
  });

  // --- Subscripts ---
  it('converts subscripts', () => {
    expect(latexToSpeech('$x_{i}$')).toContain('x sub i');
  });

  it('converts single-digit subscript without braces', () => {
    expect(latexToSpeech('$x_0$')).toContain('x sub 0');
  });

  // --- Greek letters ---
  it('converts Greek letters', () => {
    expect(latexToSpeech('$\\alpha + \\beta$')).toContain('alpha');
    expect(latexToSpeech('$\\alpha + \\beta$')).toContain('beta');
  });

  it('converts variant Greek letters', () => {
    expect(latexToSpeech('$\\varepsilon$')).toContain('epsilon');
    expect(latexToSpeech('$\\varphi$')).toContain('phi');
  });

  it('converts uppercase Greek letters', () => {
    expect(latexToSpeech('$\\Omega$')).toContain('Omega');
    expect(latexToSpeech('$\\Delta$')).toContain('Delta');
  });

  // --- Relations ---
  it('converts \\propto', () => {
    expect(latexToSpeech('$f(w) \\propto \\frac{1}{r}$')).toContain('is proportional to');
  });

  it('converts \\approx', () => {
    expect(latexToSpeech('$x \\approx y$')).toContain('is approximately');
  });

  it('converts \\neq', () => {
    expect(latexToSpeech('$a \\neq b$')).toContain('is not equal to');
  });

  it('converts \\leq and \\geq', () => {
    expect(latexToSpeech('$a \\leq b$')).toContain('less than or equal to');
    expect(latexToSpeech('$a \\geq b$')).toContain('greater than or equal to');
  });

  // --- Operators ---
  it('converts \\times', () => {
    expect(latexToSpeech('$a \\times b$')).toContain('times');
  });

  it('converts \\pm', () => {
    expect(latexToSpeech('$x \\pm y$')).toContain('plus or minus');
  });

  // --- Functions ---
  it('converts trig functions', () => {
    expect(latexToSpeech('$\\sin(x)$')).toContain('sine');
    expect(latexToSpeech('$\\cos(x)$')).toContain('cosine');
  });

  it('converts \\ln', () => {
    expect(latexToSpeech('$\\ln(x)$')).toContain('natural log');
  });

  // --- Summation / integral ---
  it('converts summation with limits', () => {
    const result = latexToSpeech('$\\sum_{i=1}^{n} x_i$');
    expect(result).toContain('the sum from i=1 to n of');
  });

  it('converts integral', () => {
    const result = latexToSpeech('$\\int_{0}^{1} f(x) dx$');
    expect(result).toContain('the integral from 0 to 1 of');
  });

  // --- Logic / set theory ---
  it('converts \\forall and \\exists', () => {
    expect(latexToSpeech('$\\forall x \\exists y$')).toContain('for all');
    expect(latexToSpeech('$\\forall x \\exists y$')).toContain('there exists');
  });

  it('converts set operations', () => {
    expect(latexToSpeech('$A \\cup B$')).toContain('union');
    expect(latexToSpeech('$A \\cap B$')).toContain('intersection');
    expect(latexToSpeech('$x \\in S$')).toContain('is in');
  });

  // --- Arrows ---
  it('converts \\rightarrow and \\implies', () => {
    expect(latexToSpeech('$x \\rightarrow y$')).toContain('goes to');
    expect(latexToSpeech('$A \\implies B$')).toContain('implies');
  });

  // --- Infinity ---
  it('converts \\infty', () => {
    expect(latexToSpeech('$\\lim_{x \\to \\infty}$')).toContain('infinity');
  });

  // --- Text commands ---
  it('passes through \\text content', () => {
    expect(latexToSpeech('$\\text{hello world}$')).toContain('hello world');
  });

  // --- Number sets ---
  it('converts \\mathbb{R}', () => {
    expect(latexToSpeech('$x \\in \\mathbb{R}$')).toContain('the real numbers');
  });

  // --- Delimiters ---
  it('converts \\left| to absolute value', () => {
    expect(latexToSpeech('$\\left| x \\right|$')).toContain('the absolute value of');
  });

  // --- Catch-all cleanup ---
  it('removes unrecognized LaTeX commands', () => {
    expect(latexToSpeech('$\\unknowncommand{x}$')).not.toContain('\\');
  });

  it('removes stray braces', () => {
    expect(latexToSpeech('${x}$')).not.toContain('{');
    expect(latexToSpeech('${x}$')).not.toContain('}');
  });

  // --- Function application ---
  it('converts f(x) to "f of x"', () => {
    expect(latexToSpeech('$f(x)$')).toContain('f of x');
  });

  it('converts P(A) to "P of A"', () => {
    expect(latexToSpeech('$P(A)$')).toContain('P of A');
  });

  it('converts P(A|B) to "P of A given B"', () => {
    const result = latexToSpeech('$P(A|B)$');
    expect(result).toContain('P of A given B');
  });

  it('converts P(A\\mid B) to "P of A given B"', () => {
    const result = latexToSpeech('$P(A\\mid B)$');
    expect(result).toContain('P of A given B');
  });

  // --- Full expression: the user's original example ---
  it('converts f(w) \\propto 1/r to readable speech', () => {
    const result = latexToSpeech('$f(w) \\propto \\frac{1}{r}$');
    expect(result).toContain('f of w');
    expect(result).toContain('is proportional to');
    expect(result).toContain('1 over r');
    expect(result).not.toContain('\\');
    expect(result).not.toContain('$');
  });

  // --- Edge cases ---
  it('handles text with no LaTeX', () => {
    const input = 'This is plain text with no math.';
    expect(latexToSpeech(input)).toBe(input);
  });

  it('handles empty string', () => {
    expect(latexToSpeech('')).toBe('');
  });

  it('handles mixed text and math', () => {
    const result = latexToSpeech('The energy is $E = mc^{2}$ according to Einstein.');
    expect(result).toContain('E = mc squared');
    expect(result).toContain('according to Einstein');
    expect(result).not.toContain('$');
  });
});
