/**
 * TikZ Figure Generation
 *
 * Rubric: "Figure or visual explanation" = 7 points.
 * This is the second highest-weighted criterion after novelty.
 *
 * Design philosophy (Socratic):
 *   - Agent SUGGESTS what figures are needed (based on proposal content)
 *   - Student DESCRIBES what the figure should show (in words)
 *   - Agent GENERATES the TikZ/LaTeX code from the description
 *   - Student reviews and accepts/edits
 *
 * This way the student learns to think visually and communicate
 * their system architecture — not just accept generated images.
 *
 * Supported figure types:
 *   - pipeline: Input → Stage 1 → Stage 2 → Output flowchart
 *   - comparison_table: Prior work vs This work comparison
 *   - architecture: System component diagram
 *   - evaluation_design: Experimental setup / data flow
 *   - timeline: Milestones Gantt-style chart
 */

import { callLLMJson as callMentorJson } from '../tools/llm.js';
import { getAllSections, getHypothesis, getIntake, saveMessage } from '../learnerMemory.js';

const FIGURE_SUGGEST_PROMPT = `You are a research mentor reviewing a proposal draft to identify which figures would most strengthen it.

NSF reviewers give 7 points for "Figure or visual explanation." A strong proposal includes 1-2 figures that:
1. Clarify the method's pipeline or architecture (readers should not need to re-read the text to understand the flow)
2. Distinguish the approach from prior work (a comparison table or diagram showing the gap)

For each figure you suggest, explain:
- WHY this figure is needed (what does it clarify that text cannot?)
- WHAT the student should include in it (the information, not the visual design)
- WHAT TYPE of figure is most appropriate

Figure types available: pipeline, comparison_table, architecture, evaluation_design, timeline

Return JSON:
{
  "suggestions": [
    {
      "type": "pipeline | comparison_table | architecture | evaluation_design | timeline",
      "title": "Suggested figure title",
      "why_needed": "What this figure clarifies that the text alone does not",
      "what_to_include": "Specific elements: nodes, labels, arrows, columns — not design details",
      "placement": "Which section this figure belongs in (method, novelty, evaluation, etc.)"
    }
  ],
  "priority": "Which one figure would have the highest rubric impact"
}`;

const TIKZ_GENERATE_PROMPT = `You are an expert LaTeX and TikZ author. Generate compilable TikZ code for the figure described.

RULES — the generated code must:
1. Be wrapped in \\begin{figure}[h!] ... \\end{figure} with a \\caption{} and \\label{}
2. Use only standard TikZ libraries: tikz, arrows.meta, positioning, shapes.geometric, fit, calc
3. Include \\usepackage declarations as comments so the student knows what to add to the preamble
4. Be self-contained — no external files, no custom fonts
5. Use descriptive node labels, not placeholder text
6. Scale to fit a single column (\\textwidth or 0.9\\textwidth)
7. For pipeline diagrams: left-to-right flow with labeled arrows
8. For comparison tables: use tabular inside figure, NOT a TikZ matrix
9. For architecture diagrams: boxes with labels, arrows showing data flow

Return JSON:
{
  "tikz_code": "The complete LaTeX figure environment code",
  "preamble_packages": ["list of \\\\usepackage commands needed"],
  "description": "One sentence describing what the figure shows",
  "placement_note": "Where in the proposal to place this figure"
}`;

export async function suggestFigures(learnerId) {
  const sections = getAllSections(learnerId);
  const hypothesis = getHypothesis(learnerId);
  const intake = getIntake(learnerId);

  if (sections.length === 0 && !hypothesis?.gap) {
    throw new Error('No proposal content to analyze. Draft at least one section first.');
  }

  const sectionSummary = sections.map(s =>
    `${s.section_name}: ${s.content?.slice(0, 300)}...`
  ).join('\n\n');

  const result = await callMentorJson({
    systemPrompt: FIGURE_SUGGEST_PROMPT,
    history: [],
    userMessage: `Suggest figures for this proposal.

DOMAIN: ${intake.domain || 'not specified'}
GAP: ${hypothesis?.gap || 'not stated'}

PROPOSAL SECTIONS (abbreviated):
${sectionSummary}`,
    temperature: 0.4,
    requiredKeys: ['suggestions']
  });

  const mentorMessage = formatSuggestMessage(result);
  saveMessage(learnerId, 'draft', 'mentor', mentorMessage);

  return {
    suggestions: result.suggestions || [],
    priority: result.priority || '',
    message: mentorMessage
  };
}

export async function generateTikzFigure(learnerId, { figureType, description, title, sectionContext }) {
  if (!description?.trim()) {
    throw new Error('Please describe what the figure should show before generating TikZ code.');
  }

  const result = await callMentorJson({
    systemPrompt: TIKZ_GENERATE_PROMPT,
    history: [],
    userMessage: `Generate TikZ LaTeX code for this figure.

Figure type: ${figureType || 'pipeline'}
Title: ${title || 'Figure'}
Section: ${sectionContext || 'method'}

Student's description of what the figure should show:
${description}

Generate compilable TikZ that exactly represents what the student described.`,
    temperature: 0.3,
    requiredKeys: ['tikz_code']
  });

  // Save figure to conversation and also to sections table as a special entry
  const figureRecord = {
    tikz_code: result.tikz_code || '',
    preamble_packages: result.preamble_packages || [],
    description: result.description || description,
    placement_note: result.placement_note || sectionContext || 'method',
    title: title || 'Figure'
  };

  saveMessage(learnerId, 'draft', 'mentor',
    `**Generated TikZ figure: ${figureRecord.title}**\n\nPlacement: ${figureRecord.placement_note}\n\n\`\`\`latex\n${figureRecord.tikz_code}\n\`\`\``
  );

  return figureRecord;
}

function formatSuggestMessage(result) {
  const sug = result.suggestions || [];

  const sugText = sug.map((s, i) => `
**Figure ${i+1}: ${s.title || s.type}** (${s.placement || 'method section'})
Type: ${s.type}
Why needed: ${s.why_needed}
What to include: ${s.what_to_include}`
  ).join('\n\n---\n');

  return `**Figure suggestions (7 rubric points at stake):**

${sugText}

${result.priority ? `\n**Highest impact:** ${result.priority}` : ''}

To generate a figure: describe what you want to show in plain words and I'll produce compilable TikZ LaTeX code.`;
}
