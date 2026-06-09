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

// Section order follows proposal_requirements.md:
// Title → Abstract → Keywords → Introduction → Project Goal → Methods →
// Figure → Expected Results/Milestones → Evaluation → Risks → Resources → References
//
// intellectual_merit and broader_impacts are folded into introduction
// (NSF style: IM/BI "right out of the gate")
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
  novelty:            'Novelty and Relation to Prior Work',
  method:             'Methods: Technical Approach and Agent Workflow',
  evaluation:         'Evaluation Plan',
  risks:              'Risks and Mitigation',
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
    // Unicode math symbols → LaTeX equivalents
    .replace(/≥/g, '$\\geq$')
    .replace(/≤/g, '$\\leq$')
    .replace(/→/g, '$\\rightarrow$')
    .replace(/←/g, '$\\leftarrow$')
    .replace(/×/g, '$\\times$')
    .replace(/±/g, '$\\pm$')
    .replace(/≠/g, '$\\neq$')
    .replace(/∈/g, '$\\in$')
    .replace(/α/g, '$\\alpha$')
    .replace(/β/g, '$\\beta$')
    .replace(/γ/g, '$\\gamma$')
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
  const hypotheses = getHypotheses(learnerId);       // H1/H2/H3
  const specificity = getSpecificity(learnerId);     // dataset/sample/instr/prior
  const papers     = getPapers(learnerId);
  const sections   = getAllSections(learnerId);

  const domain  = intake?.domain  || 'Research Domain';
  const idea    = intake?.idea    || '';
  const gap     = hypothesis?.gap || '';

  // Build title from domain
  const title = `Research Proposal: ${domain}`;

  // Section map (latest version of each)
  const sectionMap = {};
  for (const s of sections) {
    sectionMap[s.section_name] = s.content || '';
  }

  // ── References from papers ──
  const refs = papers.length
    ? papers.map((p, i) => {
        const authors  = escapeLatex(p.authors || 'Unknown');
        const ptitle   = escapeLatex(p.title || 'Untitled');
        const year     = (p.published || '').slice(0, 4);
        const url      = p.url || ('https://arxiv.org/abs/' + p.arxiv_id);
        return `\\bibitem{ref${i+1}} ${authors}. \\textit{${ptitle}} (${year}). \\url{${url}}`;
      }).join('\n\n')
    : '\\bibitem{placeholder} See proposal body for sources.';

  // ── Abstract (required §2) ──
  const abstract = gap
    ? `\\begin{abstract}\n${escapeLatex(gap)}\n\\end{abstract}\n\n`
    : '';

  // ── Keywords (required §3) ──
  const keywords = buildKeywords(domain, idea, gap);
  const keywordsBlock = `\\noindent\\textbf{Keywords:} ${escapeLatex(keywords)}\n\\vspace{0.5em}\n\n`;

  // ── Project Goal (required §5) — synthesized from gap + hypotheses ──
  const goalContent = buildProjectGoal(gap, hypotheses, idea);
  const goalBlock = goalContent
    ? `\\section{Project Goal}\n\n${wrapBullets(escapeLatex(goalContent))}\n\n`
    : '';

  // ── Figure placeholder (required §7) ──
  // If a TikZ figure was generated, it's in conversation messages.
  // For now, include a placeholder figure environment so the section exists.
  const figureBlock = `\\section{System Overview}

\\begin{figure}[h!]
\\centering
\\fbox{\\parbox{0.85\\textwidth}{\\centering\\vspace{2em}
\\textit{[Figure: System architecture or workflow diagram for ${escapeLatex(domain)}.}\\\\
\\textit{Replace this placeholder with your TikZ figure or included image.]}
\\vspace{2em}}}
\\caption{Proposed workflow architecture for ${escapeLatex(domain)}. See Section~\\ref{sec:method} for detailed stage descriptions.}
\\label{fig:architecture}
\\end{figure}

`;

  // ── Expected Results and Milestones (required §8) ──
  const milestonesContent = buildMilestones(specificity, hypotheses);
  const milestonesBlock = `\\section{Expected Results and Research Milestones}

${wrapBullets(escapeLatex(milestonesContent))}

`;

  // ── Resources (required §11) ──
  const resourcesContent = buildResources(domain, specificity);
  const resourcesBlock = `\\section{Resources, Tools, and Budget}

${wrapBullets(escapeLatex(resourcesContent))}

`;

  // ── Main body sections ──
  const bodyParts = SECTION_ORDER
    .filter(name => sectionMap[name])
    .map(name => {
      // Add a label to method section for figure cross-reference
      const extra = name === 'method' ? '\\label{sec:method}\n' : '';
      return `\\section{${SECTION_LABEL[name] || name}}\n${extra}\n${wrapBullets(escapeLatex(sectionMap[name]))}\n\n`;
    })
    .join('\n');

  // ── Hypotheses block (after introduction, before method) ──
  const hypothesesBlock = (hypotheses?.h1 || hypotheses?.h2 || hypotheses?.h3)
    ? `\\subsection*{Testable Hypotheses}
\\begin{itemize}
${hypotheses.h1 ? `  \\item \\textbf{H1 (Outcome):} ${escapeLatex(hypotheses.h1)}\n` : ''}${hypotheses.h2 ? `  \\item \\textbf{H2 (Mechanism):} ${escapeLatex(hypotheses.h2)}\n` : ''}${hypotheses.h3 ? `  \\item \\textbf{H3 (Impact):} ${escapeLatex(hypotheses.h3)}\n` : ''}\\end{itemize}

`
    : '';

  // ── Assemble in proposal_requirements.md order ──
  // 1. Title + Abstract + Keywords
  // 2. Introduction (IM, BI, motivation, novelty)
  // 3. Project Goal + Hypotheses
  // 4. Methods
  // 5. Figure
  // 6. Expected Results / Milestones
  // 7. Evaluation
  // 8. Risks
  // 9. Resources
  // 10. References

  // Split body sections by where they belong
  const introSections = ['intellectual_merit', 'broader_impacts', 'motivation', 'novelty']
    .filter(name => sectionMap[name])
    .map(name => `\\section{${SECTION_LABEL[name] || name}}\n\n${wrapBullets(escapeLatex(sectionMap[name]))}\n\n`)
    .join('\n');

  const methodSection = sectionMap['method']
    ? `\\section{${SECTION_LABEL['method']}}\n\\label{sec:method}\n\n${wrapBullets(escapeLatex(sectionMap['method']))}\n\n`
    : '';

  const evalSection = sectionMap['evaluation']
    ? `\\section{${SECTION_LABEL['evaluation']}}\n\n${wrapBullets(escapeLatex(sectionMap['evaluation']))}\n\n`
    : '';

  const riskSection = sectionMap['risks']
    ? `\\section{${SECTION_LABEL['risks']}}\n\n${wrapBullets(escapeLatex(sectionMap['risks']))}\n\n`
    : '';

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
\\usepackage{graphicx}
\\usepackage{tikz}
\\usetikzlibrary{arrows.meta, positioning, shapes.geometric, fit, calc}

% ── Compact spacing for 3-page limit ─────────────────────────
\\titlespacing*{\\section}{0pt}{1.2ex plus 0.3ex}{0.6ex plus 0.1ex}
\\titlespacing*{\\subsection}{0pt}{0.8ex plus 0.2ex}{0.4ex plus 0.1ex}
\\setlength{\\parskip}{0.4em}
\\setlength{\\parindent}{0pt}

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

${abstract}${keywordsBlock}${introSections}${goalBlock}${hypothesesBlock}${methodSection}${figureBlock}${milestonesBlock}${evalSection}${riskSection}${resourcesBlock}
% ── References ────────────────────────────────────────────────
\\begin{thebibliography}{99}
${refs}
\\end{thebibliography}

\\end{document}
`;
}

// ── Helper: extract keywords from domain, idea, and gap ──────────────────────
function buildKeywords(domain, idea, gap) {
  const words = new Set();
  // Extract meaningful terms from domain
  if (domain) domain.split(/[\s,;]+/).filter(w => w.length > 3).forEach(w => words.add(w.toLowerCase()));
  // Extract from idea
  if (idea) idea.split(/[\s,;]+/).filter(w => w.length > 4).slice(0, 3).forEach(w => words.add(w.toLowerCase()));
  // Extract from gap (first sentence)
  if (gap) {
    const first = gap.split(/[.!?]/)[0] || '';
    first.split(/[\s,;]+/).filter(w => w.length > 4).slice(0, 3).forEach(w => words.add(w.toLowerCase()));
  }
  const kw = [...words].slice(0, 6);
  return kw.length > 0 ? kw.join(', ') : 'research proposal, agent workflow';
}

// ── Helper: synthesize project goal from gap + hypotheses ────────────────────
function buildProjectGoal(gap, hypotheses, idea) {
  const parts = [];
  if (gap) {
    parts.push(`The goal of this project is to address the following research gap: ${gap}`);
  } else if (idea) {
    parts.push(`The goal of this project is to investigate: ${idea}`);
  }
  if (hypotheses?.h1) {
    parts.push(`Specifically, we test whether ${hypotheses.h1} (H1).`);
  }
  if (hypotheses?.h2) {
    parts.push(`We further examine the underlying mechanism: ${hypotheses.h2} (H2).`);
  }
  return parts.join(' ');
}

// ── Helper: expected results and milestones ──────────────────────────────────
function buildMilestones(specificity, hypotheses) {
  const parts = [];
  parts.push('This project targets the following milestones and expected outcomes:');
  parts.push('');
  parts.push('- **Milestone 1 (Weeks 1--3):** Literature review, dataset acquisition, and baseline implementation.');
  if (specificity?.dataset_name) {
    parts.push(`- **Milestone 2 (Weeks 4--6):** Data collection and preprocessing using ${specificity.dataset_name}${specificity.sample_size ? ` (n=${specificity.sample_size})` : ''}.`);
  } else {
    parts.push('- **Milestone 2 (Weeks 4--6):** Data collection, preprocessing, and pilot experiments.');
  }
  parts.push('- **Milestone 3 (Weeks 7--9):** Core implementation and initial evaluation against baselines.');
  if (hypotheses?.h1) {
    parts.push(`- **Milestone 4 (Weeks 10--12):** Full evaluation of hypotheses, statistical analysis, and ablation studies.`);
  } else {
    parts.push('- **Milestone 4 (Weeks 10--12):** Full evaluation, statistical analysis, and write-up.');
  }
  parts.push('- **Milestone 5 (Weeks 13--14):** Final write-up, figure polishing, and submission preparation.');
  return parts.join('\n');
}

// ── Helper: resources section ────────────────────────────────────────────────
function buildResources(domain, specificity) {
  const parts = [];
  parts.push('The following resources are required for this project:');
  parts.push('');
  parts.push('- **Compute:** Standard workstation with GPU access (university cluster or cloud credits) for model training and evaluation.');
  parts.push('- **Software:** Python scientific stack (PyTorch/TensorFlow, scikit-learn, pandas), LaTeX for document preparation, Git for version control.');
  if (specificity?.dataset_name) {
    parts.push(`- **Data:** ${specificity.dataset_name}${specificity.sample_size ? ` (target n=${specificity.sample_size})` : ''}. ${specificity.named_instruments ? `Instruments: ${specificity.named_instruments}.` : ''}`);
  } else {
    parts.push('- **Data:** Publicly available datasets relevant to the domain; specific datasets to be identified during Milestone 1.');
  }
  parts.push('- **Budget:** No direct funding required; project uses free-tier API access and university compute resources.');
  parts.push('- **Release plan:** Code and evaluation scripts will be released as an open-source repository upon project completion.');
  return parts.join('\n');
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

    <p style="text-indent:0; margin-top:0.5em;"><strong>Keywords:</strong> ${buildKeywords(domain, intake?.idea || '', gap)}</p>

    ${sectionHtml}

    ${(() => {
      const goalContent = buildProjectGoal(gap, hypotheses, intake?.idea || '');
      return goalContent ? `
    <section>
      <h2>Project Goal</h2>
      ${renderContent(goalContent)}
      ${(hypotheses?.h1 || hypotheses?.h2 || hypotheses?.h3) ? `
      <p style="text-indent:0;"><strong>Testable Hypotheses:</strong></p>
      <ul>
        ${hypotheses.h1 ? `<li><strong>H1 (Outcome):</strong> ${hypotheses.h1}</li>` : ''}
        ${hypotheses.h2 ? `<li><strong>H2 (Mechanism):</strong> ${hypotheses.h2}</li>` : ''}
        ${hypotheses.h3 ? `<li><strong>H3 (Impact):</strong> ${hypotheses.h3}</li>` : ''}
      </ul>` : ''}
    </section>` : '';
    })()}

    <section>
      <h2>System Overview</h2>
      <div style="border:1px solid #999; padding:2em; text-align:center; margin:1em 0; color:#666; font-style:italic;">
        [Figure: System architecture or workflow diagram for ${domain}. Replace with your diagram.]
      </div>
      <p style="text-indent:0; font-size:9.5pt; text-align:center; color:#444;"><strong>Figure 1:</strong> Proposed workflow architecture for ${domain}.</p>
    </section>

    <section>
      <h2>Expected Results and Research Milestones</h2>
      ${renderContent(buildMilestones(specificity, hypotheses))}
    </section>

    <section>
      <h2>Resources, Tools, and Budget</h2>
      ${renderContent(buildResources(domain, specificity))}
    </section>

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
