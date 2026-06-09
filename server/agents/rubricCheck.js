/**
 * Phase 4 — Rubric Alignment Check
 *
 * Goal: Map each rubric criterion to the current proposal state.
 * Show projected score. Identify highest-impact fixes.
 * Be honest about uncertainty in the assessment.
 */

import { callLLMJson as callMentorJson } from '../tools/llm.js';
import { getAllSections, getHypothesis, saveRubricCheck, saveMessage } from '../learnerMemory.js';
import { retrieveGrounding } from '../rag/retrieve.js';

// Actual grading rubric with calibrated scoring bands
const RUBRIC = [
  { criterion: 'Format and submission', max_points: 5,
    full: 'All guidelines met: correct length, sections in order, proper citations, PDF compiles clean',
    partial: 'Minor issues: slightly over/under length, a missing section header, inconsistent citation format',
    minimal: 'Major gaps: wrong format, missing multiple sections, no citations' },
  { criterion: 'Figure or visual explanation', max_points: 7,
    full: 'Clear figure with labeled axes/components, caption explains what viewer should learn, referenced in text',
    partial: 'Figure present but unclear labels, missing caption, or not referenced in text',
    minimal: 'No figure, or figure is decorative with no explanatory value' },
  { criterion: 'Motivation and problem framing', max_points: 6,
    full: 'Names a concrete real-world problem, quantifies its impact, explains why current solutions fail',
    partial: 'Problem stated but vague ("X is important"), no quantification, or weak connection to gap',
    minimal: 'No clear problem statement, or motivation is generic/could apply to any topic' },
  { criterion: 'Novelty and relation to prior work', max_points: 10,
    full: 'Cites 3+ specific papers, explains what each does AND what it misses, gap is the logical residual',
    partial: 'Some citations but gap assertion not grounded ("no one has done X" without evidence)',
    minimal: 'No engagement with prior work, or novelty claim is unsupported' },
  { criterion: 'Method and workflow detail', max_points: 9,
    full: 'Step-by-step approach: named algorithms/tools, data pipeline, specific parameters, reproducible by reader',
    partial: 'General approach described but missing specifics (which model? what hyperparameters? what preprocessing?)',
    minimal: 'Method is hand-wavy ("we will use deep learning") with no actionable detail' },
  { criterion: 'Evaluation plan', max_points: 7,
    full: 'Named metrics, specific baselines to compare against, dataset with size, statistical test mentioned',
    partial: 'Metrics mentioned but no baselines, or baselines but no statistical rigor',
    minimal: 'No evaluation plan, or just "we will evaluate performance"' },
  { criterion: 'Feasibility, milestones, risks', max_points: 4,
    full: 'Timeline with specific milestones, at least one named risk with mitigation strategy',
    partial: 'Timeline exists but vague milestones, or risks mentioned without mitigation',
    minimal: 'No timeline or risk discussion' },
  { criterion: 'Writing coherence and polish', max_points: 2,
    full: 'Flows logically section-to-section, consistent terminology, no major grammar issues',
    partial: 'Some logical jumps or inconsistent terms but readable',
    minimal: 'Disjointed sections, contradictions, or unreadable' },
];

const RUBRIC_SYSTEM_PROMPT = `You are a strict but fair grader evaluating a student's research proposal. You have graded hundreds of these — you calibrate against REAL student work, not perfection.

SCORING RULES — follow these exactly:
1. For each criterion you get a SCORING BAND (full/partial/minimal). Read it carefully.
2. Score = max_points × band_fraction:
   - FULL (90-100%): draft meets ALL requirements in the "full" band
   - GOOD (70-89%): meets most of "full" but missing 1 element
   - PARTIAL (40-69%): matches "partial" band description
   - MINIMAL (10-39%): matches "minimal" band
   - MISSING (0): no attempt at all
3. Quote the EXACT sentence or phrase from the draft that supports your score. If you can't quote anything, score is 0.
4. For each score, state your CONFIDENCE: "high" (clear evidence), "medium" (judgment call), "low" (guessing).
5. Cite the GROUNDING excerpt by [number] that defines what this criterion requires.

ANTI-INFLATION RULES:
- If a section says "we will use X" without specifying HOW, that's partial at best.
- If novelty is asserted ("no one has done X") without citing papers that tried, that's partial.
- Giving benefit of the doubt is fine for 1 point — not for 3.
- A 45+/50 proposal would be publication-ready. Most drafts are 25-38.

Return JSON:
{
  "checks": [
    {
      "criterion": "exact criterion name",
      "max_points": number,
      "band": "full | good | partial | minimal | missing",
      "projected_points": number,
      "confidence": "high | medium | low",
      "quote": "exact text from draft supporting this score (or 'none found')",
      "evidence": "why this band, citing grounding [number]",
      "fix": "specific actionable fix (empty if full)",
      "points_recoverable": number (how many more points the fix would earn)
    }
  ],
  "total_projected": number,
  "total_max": 50,
  "priority_fixes": [
    { "fix": "specific action", "points_gain": number, "criterion": "which criterion" }
  ],
  "honest_summary": "2-3 sentences. State the score range you'd bet on (e.g. '32-38/50'). Name the single biggest weakness."
}`;

export async function runRubricCheck(learnerId) {
  const sections = getAllSections(learnerId);
  const hypothesis = getHypothesis(learnerId);

  if (sections.length === 0 && !hypothesis?.gap) {
    throw new Error('No proposal content to evaluate. Complete Phase 3 first.');
  }

  const proposalContent = sections.map(s =>
    `## ${s.section_name}\n${s.content}`
  ).join('\n\n');

  const gapContext = hypothesis?.gap
    ? `Research gap: ${hypothesis.gap}\nWhy it matters: ${hypothesis.why_it_matters}`
    : 'No gap hypothesis yet.';

  // RAG: pull the grading standards so the evaluation cites real criteria.
  const { context: grounding } = await retrieveGrounding(
    'grading criteria for a research proposal: novelty, motivation, method, evaluation, feasibility, format',
    { k: 6, preferTags: ['rubric', 'evaluation'] }
  );
  const groundingBlock = grounding
    ? `\n\nGROUNDING — the standards each criterion must be judged against (cite by [number] in your evidence):\n${grounding}`
    : '';

  const result = await callMentorJson({
    systemPrompt: RUBRIC_SYSTEM_PROMPT,
    history: [],
    userMessage: `Evaluate this proposal draft against the rubric.\n\nRubric criteria with scoring bands:\n${RUBRIC.map(r => `- ${r.criterion} (${r.max_points} pts)\n  FULL: ${r.full}\n  PARTIAL: ${r.partial}\n  MINIMAL: ${r.minimal}`).join('\n')}\n\n${gapContext}\n\nProposal content so far:\n${proposalContent || '(No sections drafted yet — evaluate based on gap hypothesis only)'}${groundingBlock}`,
    temperature: 0.2,
    requiredKeys: ['checks', 'total_projected', 'priority_fixes']
  });

  const checks = result.checks || [];

  // Save each check to DB
  for (const check of checks) {
    saveRubricCheck(
      learnerId,
      check.criterion,
      check.max_points,
      check.projected_points,
      check.band || check.status || 'missing',
      check.evidence,
      check.fix
    );
  }

  // Save rubric summary to conversation
  const mentorMessage = formatRubricMessage(result);
  saveMessage(learnerId, 'rubric', 'mentor', mentorMessage);

  return {
    checks,
    total_projected: result.total_projected || 0,
    total_max: 50,
    priority_fixes: result.priority_fixes || [],
    honest_summary: result.honest_summary || '',
    message: mentorMessage
  };
}

function formatRubricMessage(result) {
  const checks = result.checks || [];

  const rows = checks.map(c => {
    const band = c.band || c.status || '?';
    const icon = band === 'full' ? '✓' : band === 'good' ? '◉' : band === 'partial' ? '⚠' : band === 'minimal' ? '△' : '✗';
    const conf = c.confidence ? ` [${c.confidence}]` : '';
    const fixLine = c.fix ? `\n   → **Fix (+${c.points_recoverable || '?'}pts):** ${c.fix}` : '';
    return `${icon} **${c.criterion}** — ${c.projected_points}/${c.max_points}${conf}\n   ${c.evidence || ''}${fixLine}`;
  }).join('\n\n');

  const fixes = (result.priority_fixes || []).map((f, i) => {
    if (typeof f === 'string') return `${i + 1}. ${f}`;
    return `${i + 1}. **+${f.points_gain}pts** — ${f.fix} *(${f.criterion})*`;
  }).join('\n');

  return `**Rubric — ${result.total_projected || '?'}/50**\n\n${rows}\n\n**Highest-impact fixes:**\n${fixes}\n\n${result.honest_summary || ''}\n\nWhich fix do you want to tackle first?`;
}
