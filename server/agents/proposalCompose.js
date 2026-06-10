/**
 * Proposal Composition — starter-code style export
 *
 * The starter app's key insight: don't stitch LaTeX from templates.
 * Ask the LLM to write the COMPLETE compile-ready document in one call,
 * including a LaTeX-native figure (TikZ or minipage — no external images).
 * Then pdfExport.js normalizes the preamble and compiles with tectonic.
 *
 * This produces coherent prose across sections instead of stapled-together
 * drafts, and a real figure instead of a placeholder box.
 *
 * Flow:
 *   composeProposalLatex(learnerId)
 *     → gather all learner state (gap, hypotheses, specificity, papers, sections)
 *     → 1 LLM call returns the full proposal.tex source
 *     → validate it looks like LaTeX, cache it
 *   If tectonic later fails, repairProposalLatex() feeds the compile error
 *   back for a one-shot fix.
 */

import { callLLM } from '../tools/llm.js';
import {
  getAllSections, getHypothesis, getHypotheses,
  getSpecificity, getIntake, getPapers
} from '../learnerMemory.js';

const COMPOSE_SYSTEM_PROMPT = `You are a research proposal writer. You will receive structured project state from a mentorship workflow (research gap, hypotheses, experimental commitments, papers read, and section drafts). Compose a single, coherent, compile-ready LaTeX research proposal.

OUTPUT: Return ONLY raw LaTeX source, starting with \\documentclass. No markdown fences, no JSON, no commentary before or after.

FORMAT REQUIREMENTS (course rubric — follow exactly):
- \\documentclass[11pt]{article} with \\usepackage[margin=1in]{geometry}
- Add these spacing packages immediately after geometry (they are required — do NOT omit them):
  \\usepackage{titlesec}
  \\titleformat{\\section}{\\normalfont\\large\\bfseries}{}{0em}{}
  \\titlespacing*{\\section}{0pt}{0.8ex plus 0.2ex}{0.4ex plus 0.1ex}
  \\titlespacing*{\\subsection}{0pt}{0.6ex plus 0.1ex}{0.3ex plus 0.1ex}
  \\setlength{\\parskip}{0pt}
  \\setlength{\\parsep}{0pt}
- HARD LIMIT: the body (everything before References) must fit in 3 pages. This is graded. Budget strictly:
  * Abstract ≤ 110 words; Introduction ≤ 200 words; Novelty ≤ 180 words (one compact sentence per cited paper)
  * Goal+Hypotheses ≤ 130 words; Methods ≤ 320 words; Milestones ≤ 90 words (one line per milestone)
  * Evaluation ≤ 140 words; Risks ≤ 90 words (3 risks max, one line each); Resources ≤ 50 words
  * Use \\setlist{nosep} and avoid blank-line padding. Prefer compact run-in lists over tall bullet stacks.
  * DO NOT add blank lines between paragraphs or list items. LaTeX inserts spacing automatically.
- Required structure, in order:
  1. Title (specific and descriptive, not "Research Proposal: <domain>")
  2. Abstract (4-6 sentences: problem, gap, approach, expected contribution)
  3. Keywords (one line, 4-6 terms)
  4. Introduction and Motivation (concrete problem, stakeholder, why current solutions fail; weave in intellectual merit and broader impacts)
  5. Novelty and Relation to Prior Work (cite the provided papers by number [1], [2]...; state precisely what each does and what remains open)
  6. Project Goal and Hypotheses (the gap as a goal statement; H1/H2/H3 as a compact list)
  7. Methods: Technical Approach and Agent Workflow (concrete stages, inputs, outputs, named tools/models, revision loop)
  8. Figure (see FIGURE RULES below) — referenced from the Methods text as Figure~\\ref{fig:workflow}
  9. Expected Results and Research Milestones (timeline with week ranges)
  10. Evaluation Plan (named metrics, baselines, test scenarios, success criteria)
  11. Risks and Mitigation (specific risks, each with a mitigation)
  12. Resources (compute, data, tools, budget note)
  13. References (\\begin{thebibliography} — ONLY the provided papers; never invent citations or authors. If authors are unknown, format as: \\bibitem{refN} \\textit{Title} (year). \\url{...} — no "Unknown" placeholder. Clean obviously malformed titles, e.g. strip "[PDF]" prefixes.)

FIGURE RULES (7 rubric points depend on this):
- Include exactly one figure: a workflow/architecture diagram of the proposed method.
- Build it natively in LaTeX with TikZ. Use ONLY: \\usepackage{tikz} with \\usetikzlibrary{arrows.meta, positioning}.
- PAGE WIDTH CONSTRAINT: the text area is 6.5 inches (16.5 cm). The entire tikzpicture MUST fit within this width.
  If you have more than 3 pipeline stages, use TWO ROWS (top row: stages 1-3, bottom row: stages 4-N) with a downward arrow connecting them.
  For a single row, use at most 3-4 nodes with: node distance=0.9cm, text width=2.5cm, font=\\small.
- Rectangle nodes with draw + rounded corners, -{Stealth} arrows. No decorations, no shadows, no custom colors.
- Give it \\caption{} explaining what the reader should learn, and \\label{fig:workflow}.
- The Methods text MUST reference and explain the figure.

WRITING RULES:
- Write as a forward-looking research proposal, NOT a course implementation report. The research timeline is independent of any course deadline.
- Compile-safe LaTeX only: no minted, no shell-escape, no \\includegraphics, no external files, no custom fonts beyond \\usepackage{times}.
- Escape special characters in prose (%, &, _, #, $).
- Mark any claim not supported by the provided papers as an assumption ("We assume...").
- Use the section drafts as raw material but REWRITE for coherence — consistent terminology, smooth transitions, no repetition between sections.
- Unicode math symbols must be written as LaTeX ($\\geq$, $\\rightarrow$, etc.), never as raw characters.`;

// In-memory cache: learnerId → { key, latex }
const composeCache = new Map();

// Tavily sometimes stores a full URL in arxiv_id, producing doubled
// "arxiv.org/abs/https://..." links. Resolve to a single clean URL.
function paperUrl(p) {
  const candidates = [p.url, p.arxiv_id].map(v => String(v || '').trim()).filter(Boolean);
  for (const c of candidates) {
    if (/^https?:\/\//.test(c)) return c;
  }
  return p.arxiv_id ? `https://arxiv.org/abs/${p.arxiv_id}` : '';
}

function cleanTitle(title) {
  return String(title || 'Untitled')
    .replace(/^\[PDF\]\s*/i, '')
    .replace(/\s*-\s*(arXiv|ACL Anthology)\s*$/i, '')
    .trim();
}

function buildStatePayload(learnerId) {
  const intake      = getIntake(learnerId);
  const hypothesis  = getHypothesis(learnerId);
  const hypotheses  = getHypotheses(learnerId);
  const specificity = getSpecificity(learnerId);
  const papers      = getPapers(learnerId);
  const sections    = getAllSections(learnerId);

  const sectionMap = {};
  for (const s of sections) sectionMap[s.section_name] = s.content || '';

  return {
    domain: intake?.domain || '',
    idea: intake?.idea || '',
    gap: hypothesis?.gap || '',
    why_it_matters: hypothesis?.why_it_matters || '',
    hypotheses: {
      h1: hypotheses?.h1 || '',
      h2: hypotheses?.h2 || '',
      h3: hypotheses?.h3 || ''
    },
    experimental_commitments: specificity?.passed ? {
      dataset: specificity.dataset_name,
      sample_size: specificity.sample_size,
      instruments: specificity.named_instruments,
      prior_reference: specificity.prior_reference
    } : null,
    papers: papers.map((p, i) => ({
      ref_number: i + 1,
      title: cleanTitle(p.title),
      authors: p.authors && p.authors !== 'Unknown' ? p.authors : '',
      year: (p.published || '').slice(0, 4),
      url: paperUrl(p),
      summary: (p.summary || '').slice(0, 300)
    })),
    section_drafts: sectionMap
  };
}

function stripToLatex(text) {
  let candidate = String(text || '').trim();
  const fenced = candidate.match(/```(?:latex|tex)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidate = fenced[1].trim();
  // Drop any preamble chatter before \documentclass
  const docStart = candidate.indexOf('\\documentclass');
  if (docStart > 0) candidate = candidate.slice(docStart);
  return candidate;
}

function looksLikeLatex(value) {
  return /\\documentclass\b[\s\S]*\\begin\{document\}[\s\S]*\\end\{document\}/.test(value);
}

/**
 * Compose the full proposal.tex with one LLM call.
 * Cached per learner until their state changes (or force=true).
 */
export async function composeProposalLatex(learnerId, { force = false } = {}) {
  const state = buildStatePayload(learnerId);

  if (!state.gap && Object.keys(state.section_drafts).length === 0) {
    throw new Error('No proposal content to compose. Complete the drafting phase first.');
  }

  const cacheKey = JSON.stringify(state);
  const cached = composeCache.get(learnerId);
  if (!force && cached && cached.key === cacheKey) {
    return cached.latex;
  }

  const raw = await callLLM({
    systemPrompt: COMPOSE_SYSTEM_PROMPT,
    history: [],
    userMessage: `Compose the complete proposal.tex from this project state:\n\n${JSON.stringify(state, null, 2)}`,
    temperature: 0.3,
    maxTokens: 12000
  });

  const latex = stripToLatex(raw);
  if (!looksLikeLatex(latex)) {
    throw new Error('Model did not return a complete LaTeX document.');
  }

  composeCache.set(learnerId, { key: cacheKey, latex });
  return latex;
}

/**
 * One-shot repair: feed the tectonic compile error back to the model.
 */
export async function repairProposalLatex(learnerId, brokenLatex, compileError) {
  const raw = await callLLM({
    systemPrompt: 'You fix LaTeX compilation errors. Return ONLY the corrected complete LaTeX source, starting with \\documentclass. No commentary, no markdown fences.',
    history: [],
    userMessage: `This LaTeX document failed to compile with tectonic.\n\nCOMPILE ERROR:\n${String(compileError).slice(0, 1500)}\n\nDOCUMENT:\n${brokenLatex}\n\nFix the error with the smallest possible change (simplify the TikZ figure to plain labeled boxes if it is the cause). Keep all prose content.`,
    temperature: 0.1,
    maxTokens: 12000
  });

  const latex = stripToLatex(raw);
  if (!looksLikeLatex(latex)) {
    throw new Error('Repair attempt did not return a complete LaTeX document.');
  }

  composeCache.set(learnerId, { key: 'repaired', latex });
  return latex;
}
