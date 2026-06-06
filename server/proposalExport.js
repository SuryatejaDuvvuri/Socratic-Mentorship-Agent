/**
 * Proposal Export
 *
 * Assembles the current section drafts into:
 *   1. A well-formed LaTeX document (.tex) — always available
 *   2. A print-ready HTML document — for browser Print → Save as PDF
 *
 * No external LaTeX compiler required.
 */

import { getAllSections, getHypothesis, getHypotheses, getSpecificity, getIntake, getPapers } from './learnerMemory.js';

// Stage 2: IM and BI come FIRST per NSF reviewer expectation and the MIT CommKit
// annotation ("IM and BI right out of the gate").
const SECTION_ORDER = [
  'intellectual_merit',
  'broader_impacts',
  'motivation',
  'novelty',
  'method',
  'evaluation',
  'risks'
];

const SECTION_LABEL = {
  intellectual_merit: 'Intellectual Merit',
  broader_impacts:    'Broader Impacts',
  motivation:         'Introduction and Motivation',
  novelty:            'Novelty and Prior Work',
  method:             'Proposed Method',
  evaluation:         'Evaluation Plan',
  risks:              'Feasibility, Risks, and Milestones',
};

// ── LaTeX helpers ──────────────────────────────────────────────────────────────

function escapeLatex(text) {
  if (!text) return '';
  return String(text)
    .replace(/\\/g,  '{\\textbackslash}')
    .replace(/&/g,   '\\&')
    .replace(/%/g,   '\\%')
    .replace(/\$/g,  '\\$')
    .replace(/#/g,   '\\#')
    .replace(/_/g,   '\\_')
    .replace(/\{/g,  '\\{')
    .replace(/\}/g,  '\\}')
    .replace(/~/g,   '{\\textasciitilde}')
    .replace(/\^/g,  '{\\textasciicircum}')
    // Convert markdown bold/italic to LaTeX
    .replace(/\*\*(.+?)\*\*/g, '\\textbf{$1}')
    .replace(/\*(.+?)\*/g,     '\\textit{$1}')
    // Bullet lists (simple)
    .replace(/^[ \t]*[-•]\s+/gm, '  \\item ')
    // Preserve paragraph breaks
    .replace(/\n\n/g, '\n\n');
}

function wrapBullets(text) {
  // If text contains \item, wrap in itemize
  if (!text.includes('\\item')) return text;
  return text.replace(
    /((?:[ \t]*\\item .+\n?)+)/g,
    '\\begin{itemize}\n$1\\end{itemize}\n'
  );
}

function sectionToLatex(name, content) {
  const label  = SECTION_LABEL[name] || name;
  const escaped = wrapBullets(escapeLatex(content));
  return `\\section{${label}}\n\n${escaped}\n\n`;
}

// ── Main export functions ──────────────────────────────────────────────────────

export function generateLatex(learnerId) {
  const intake     = getIntake(learnerId);
  const hypothesis = getHypothesis(learnerId);
  const hypotheses = getHypotheses(learnerId);       // Stage 2: H1/H2/H3
  const specificity = getSpecificity(learnerId);     // Stage 2: dataset/sample/instr/prior
  const papers     = getPapers(learnerId);
  const sections   = getAllSections(learnerId);

  const domain  = intake?.domain  || 'Research Domain';
  const gap     = hypothesis?.gap || '';

  // Build title from domain
  const title = `Research Proposal: ${domain}`;

  // Section map (latest version of each)
  const sectionMap = {};
  for (const s of sections) {
    sectionMap[s.section_name] = s.content || '';
  }

  // References from papers
  const refs = papers.length
    ? papers.map((p, i) => {
        const authors  = escapeLatex(p.authors || 'Unknown');
        const title    = escapeLatex(p.title || 'Untitled');
        const year     = (p.published || '').slice(0, 4);
        const url      = p.url || ('https://arxiv.org/abs/' + p.arxiv_id);
        return `\\bibitem{ref${i+1}} ${authors}. \\textit{${title}} (${year}). \\url{${url}}`;
      }).join('\n\n')
    : '\\bibitem{placeholder} See proposal body for sources.';

  // Abstract from gap if no dedicated abstract section
  const abstract = gap
    ? `\\begin{abstract}\n${escapeLatex(gap)}\n\\end{abstract}\n\n`
    : '';

  // Stage 2: explicit hypotheses block — NSF winners always have these
  const hypothesesBlock = (hypotheses?.h1 || hypotheses?.h2 || hypotheses?.h3)
    ? `\\section*{Testable Hypotheses}
\\begin{itemize}
${hypotheses.h1 ? `  \\item \\textbf{H1 (Outcome):} ${escapeLatex(hypotheses.h1)}\n` : ''}${hypotheses.h2 ? `  \\item \\textbf{H2 (Mechanism):} ${escapeLatex(hypotheses.h2)}\n` : ''}${hypotheses.h3 ? `  \\item \\textbf{H3 (Impact):} ${escapeLatex(hypotheses.h3)}\n` : ''}\\end{itemize}

`
    : '';

  // Stage 2: specificity commitments — surfaces brutal-specificity to reviewer
  const specificityBlock = (specificity?.passed)
    ? `\\section*{Experimental Commitments}
\\begin{itemize}
  \\item \\textbf{Dataset:} ${escapeLatex(specificity.dataset_name)}
  \\item \\textbf{Sample size:} ${escapeLatex(specificity.sample_size)}
  \\item \\textbf{Instruments:} ${escapeLatex(specificity.named_instruments)}
  \\item \\textbf{Prior reference:} ${escapeLatex(specificity.prior_reference)}
\\end{itemize}

`
    : '';

  // Ordered sections
  const bodyParts = SECTION_ORDER
    .filter(name => sectionMap[name])
    .map(name => sectionToLatex(name, sectionMap[name]))
    .join('\n');

  return `\\documentclass[11pt,letterpaper]{article}

% ── Packages ──────────────────────────────────────────────────
\\usepackage[margin=1in]{geometry}
\\usepackage{times}
\\usepackage{hyperref}
\\usepackage{url}
\\usepackage{enumitem}
\\usepackage{parskip}
\\usepackage{titlesec}
\\usepackage{fancyhdr}

% ── Header / Footer ───────────────────────────────────────────
\\pagestyle{fancy}
\\fancyhf{}
\\rhead{\\small Research Proposal}
\\lhead{\\small ${escapeLatex(domain)}}
\\rfoot{\\small Page \\thepage}

% ── Title ─────────────────────────────────────────────────────
\\title{\\textbf{${escapeLatex(title)}}}
\\author{Draft generated by Socratic Research Mentorship Agent}
\\date{${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}}

\\begin{document}

\\maketitle
\\thispagestyle{fancy}

${abstract}${hypothesesBlock}${specificityBlock}${bodyParts}

% ── References ────────────────────────────────────────────────
\\begin{thebibliography}{99}
${refs}
\\end{thebibliography}

\\end{document}
`;
}

// ── Print-ready HTML (browser → Print → Save as PDF) ──────────────────────────

export function generatePrintHtml(learnerId) {
  const intake     = getIntake(learnerId);
  const hypothesis = getHypothesis(learnerId);
  const hypotheses = getHypotheses(learnerId);       // Stage 2
  const specificity = getSpecificity(learnerId);     // Stage 2
  const papers     = getPapers(learnerId);
  const sections   = getAllSections(learnerId);

  const domain = intake?.domain || 'Research Domain';
  const gap    = hypothesis?.gap || '';
  const date   = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const sectionMap = {};
  for (const s of sections) sectionMap[s.section_name] = s.content || '';

  // Render section content: convert markdown-ish text to HTML
  function renderContent(text) {
    if (!text) return '';
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^[ \t]*[-•]\s+(.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/gs, m => `<ul>${m}</ul>`)
      .replace(/\n\n+/g, '</p><p>')
      .replace(/^(.)/s, '<p>$1')
      .replace(/(.)$/s, '$1</p>');
  }

  const sectionHtml = SECTION_ORDER
    .filter(name => sectionMap[name])
    .map(name => `
      <section>
        <h2>${SECTION_LABEL[name] || name}</h2>
        ${renderContent(sectionMap[name])}
      </section>
    `).join('\n');

  const refsHtml = papers.length
    ? papers.map((p, i) => `
        <li>
          [${i+1}] ${p.authors || 'Unknown'}.
          "<a href="${p.url || `https://arxiv.org/abs/${p.arxiv_id}`}">${p.title}</a>"
          (${(p.published || '').slice(0,4)}).
        </li>
      `).join('\n')
    : '<li>See proposal body for sources.</li>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${domain} — Research Proposal</title>
  <style>
    /* Mimics LaTeX article class: Times, 11pt, 1in margins, two-column-style header */
    @import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,700;1,400&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: "EB Garamond", "Times New Roman", Times, serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #000;
      background: #e8e8e8;
    }

    .page {
      max-width: 8.5in;
      margin: 0.4in auto;
      padding: 1in;
      background: #fff;
      box-shadow: 0 2px 12px rgba(0,0,0,0.15);
    }

    /* ── Title block (LaTeX \maketitle style) ── */
    .title-block {
      text-align: center;
      margin-bottom: 1.8em;
    }

    h1 {
      font-size: 14pt;
      font-weight: bold;
      line-height: 1.3;
      margin-bottom: 0.5em;
    }

    .authors {
      font-size: 11pt;
      margin-bottom: 0.2em;
    }

    .date {
      font-size: 10pt;
      color: #444;
    }

    .rule { border: none; border-top: 1px solid #000; margin: 0.4em 0 1.2em; }

    /* ── Abstract ── */
    .abstract {
      margin: 0 0.6in 1.6em;
    }

    .abstract-heading {
      text-align: center;
      font-size: 10pt;
      font-weight: bold;
      font-variant: small-caps;
      letter-spacing: 0.08em;
      margin-bottom: 0.4em;
    }

    .abstract p {
      font-size: 10pt;
      line-height: 1.5;
      text-align: justify;
    }

    /* ── Sections ── */
    section { margin: 1.6em 0; }

    h2 {
      font-size: 11pt;
      font-weight: bold;
      font-variant: small-caps;
      letter-spacing: 0.04em;
      margin-bottom: 0.5em;
      counter-increment: section;
    }

    h2::before {
      content: counter(section) ". ";
    }

    body { counter-reset: section; }

    p {
      text-align: justify;
      margin: 0.5em 0;
      text-indent: 1.2em;
    }

    p:first-of-type { text-indent: 0; }

    ul { margin: 0.4em 0 0.4em 1.8em; }
    li { margin: 0.15em 0; }

    /* ── References ── */
    .references { margin-top: 2em; }

    .references h2 { font-variant: small-caps; }

    .references ol {
      padding-left: 2em;
      font-size: 9.5pt;
      line-height: 1.4;
    }

    .references li { margin: 0.35em 0; }
    .references a { color: #000; text-decoration: underline; }

    /* ── Footer ── */
    .footer {
      margin-top: 2em;
      padding-top: 0.5em;
      border-top: 1px solid #aaa;
      font-size: 8pt;
      color: #777;
      text-align: center;
      font-style: italic;
    }

    /* ── Print banner (hidden when printing) ── */
    .print-banner {
      position: fixed;
      top: 0; left: 0; right: 0;
      background: #1a5e3f;
      color: #fff;
      padding: 10px 16px;
      font-family: sans-serif;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      z-index: 999;
    }

    .print-banner button {
      background: #fff;
      color: #1a5e3f;
      border: none;
      padding: 5px 14px;
      border-radius: 3px;
      cursor: pointer;
      font-weight: bold;
    }

    @media print {
      body { background: white; }
      .page { margin: 0; padding: 1in; box-shadow: none; }
      .print-banner { display: none; }
      @page { margin: 0; size: letter; }
    }
  </style>
</head>
<body>
  <div class="page">

    <div class="print-banner">
      <span>📄 Print-ready — <strong>File → Print → Save as PDF</strong> &nbsp;(uncheck "Headers and footers")</span>
      <button onclick="window.print()">Print / Save PDF</button>
    </div>

    <div class="page">

    <div class="title-block">
      <h1>Research Proposal:<br>${domain}</h1>
      <div class="authors">Draft — Socratic Research Mentorship Agent</div>
      <div class="date">${date}</div>
    </div>
    <hr class="rule">

    ${gap ? `
    <div class="abstract">
      <div class="abstract-heading">Abstract</div>
      <p>${gap}</p>
    </div>
    ` : ''}

    ${(hypotheses?.h1 || hypotheses?.h2 || hypotheses?.h3) ? `
    <section>
      <h2>Testable Hypotheses</h2>
      <ul>
        ${hypotheses.h1 ? `<li><strong>H1 (Outcome):</strong> ${hypotheses.h1}</li>` : ''}
        ${hypotheses.h2 ? `<li><strong>H2 (Mechanism):</strong> ${hypotheses.h2}</li>` : ''}
        ${hypotheses.h3 ? `<li><strong>H3 (Impact):</strong> ${hypotheses.h3}</li>` : ''}
      </ul>
    </section>
    ` : ''}

    ${specificity?.passed ? `
    <section>
      <h2>Experimental Commitments</h2>
      <ul>
        <li><strong>Dataset:</strong> ${specificity.dataset_name}</li>
        <li><strong>Sample size:</strong> ${specificity.sample_size}</li>
        <li><strong>Instruments:</strong> ${specificity.named_instruments}</li>
        <li><strong>Prior reference:</strong> ${specificity.prior_reference}</li>
      </ul>
    </section>
    ` : ''}

    ${sectionHtml}

    ${papers.length ? `
    <div class="references">
      <h2>References</h2>
      <ol>${refsHtml}</ol>
    </div>
    ` : ''}

    <div class="footer">
      Generated by Socratic Research Mentorship Agent &nbsp;·&nbsp; Sources grounded in arxiv literature
    </div>

    </div><!-- .page -->
</body>
</html>`;
}
