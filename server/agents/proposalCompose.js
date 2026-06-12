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
- The preamble MUST contain ALL of the following packages in this order (copy exactly):
  \\usepackage{times}
  \\usepackage{amsmath,amssymb}
  \\usepackage{enumitem}
  \\setlist{nosep,leftmargin=*}
  \\usepackage{tikz}
  \\usetikzlibrary{arrows.meta,positioning}
  \\usepackage{hyperref}
  \\usepackage{titlesec}
  \\titlespacing*{\\section}{0pt}{6pt}{3pt}
  \\setlength{\\parskip}{3pt}
  \\setlength{\\parindent}{0pt}
- HARD LIMIT: the body (everything before References) must fit in 3 pages. Budget strictly:
  * Abstract <= 110 words; Introduction <= 200 words; Novelty <= 180 words (one compact sentence per cited paper)
  * Goal+Hypotheses <= 130 words; Methods <= 320 words; Milestones <= 90 words (one line per milestone)
  * Evaluation <= 140 words; Risks <= 90 words (3 risks max); Resources <= 50 words
  * Prefer compact run-in lists over tall bullet stacks. Do NOT add blank lines between list items.
- Required sections, in order, using \\section*{...} headings:
  1. Title (specific and descriptive — use a centered \\begin{center}{\\large\\bfseries ...}\\end{center} block, no \\maketitle)
  2. Abstract (4-6 sentences: problem, gap, approach, expected contribution) — use \\noindent\\textbf{Abstract.}~...
  3. Keywords — use \\noindent\\textbf{Keywords:}~...
  4. \\section*{1.~Introduction: Motivation, Gap, and Prior Work}
  5. \\section*{2.~Project Goal and Hypotheses}
  6. \\section*{3.~Methods: Technical Approach and Agent Workflow}
  7. Figure (inside the Methods section — see FIGURE RULES)
  8. \\section*{4.~Expected Results and Research Milestones}
  9. \\section*{5.~Evaluation Plan}
  10. \\section*{6.~Risks and Mitigation}
  11. \\section*{7.~Resources, Tools, Budget, and Release Plan}
  12. References (\\begin{thebibliography}{9} ... \\end{thebibliography})

FIGURE RULES (7 rubric points — do not skip or simplify):
- Include exactly one TikZ figure showing the proposed research pipeline.
- The tikzpicture MUST compile with ONLY \\usepackage{tikz} and \\usetikzlibrary{arrows.meta,positioning}. No pgfplots, no external packages.
- HORIZONTAL LAYOUT: place stages left-to-right in a single row. Use these exact TikZ settings:
    node distance=0.55cm and 0.45cm,
    box/.style={draw, rounded corners, text width=2.1cm, align=center, font=\\small, inner sep=4pt, minimum height=1.0cm}
  Position nodes with: \\node[box, right=of prev] ...
- PAGE WIDTH: a single row of 5 boxes at text width=2.1cm fits within 6.5in. Do NOT use a vertical stack.
- Include a dashed feedback arrow (bend right=35) from the last evaluation node back to an earlier node, labeled with a \\scriptsize description of what gets refined. This represents the revision loop.
- Use [{\\Stealth}] arrow tips. No custom colors, no shadows.
- \\caption{} must explain what the diagram shows and what the dashed arrow means.
- The Methods text must say "Figure~\\ref{fig:workflow}" and describe what each stage does.

REFERENCES RULES:
- Use \\begin{thebibliography}{9} format with \\bibitem{refN} keys cited as ~\\cite{refN} in text.
- Use the provided papers list. If a paper's title matches a well-known work, use the correct author list, venue, and arXiv ID even if the provided metadata is incomplete.
- Never invent citations not grounded in the provided papers.
- Format: Author(s). \\textit{Title.} Venue Year. \\url{...}
- If authors are unknown, omit the author field; do not write "Unknown".
- Strip "[PDF]", "[HTML]", or source-name suffixes from titles.
- Do NOT cite the same arXiv paper twice under different bibitem keys.

WRITING RULES:
- Write as a forward-looking research proposal, NOT a course implementation report.
- Compile-safe LaTeX only: no minted, no shell-escape, no \\includegraphics, no external files.
- NO RAW UNICODE: every non-ASCII character must be a LaTeX command. Use --- not the Unicode em-dash, $\\geq$ not >=, $\\rightarrow$ not ->, $\\times$ not x, etc. This is the most common compile failure --- enforce it everywhere.
- Escape %, &, _, #, $ when used as prose text.
- Mark any unsupported claim as an assumption ("We assume...").
- Rewrite section drafts for coherence --- consistent terminology, smooth transitions, no repetition.`;

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
