/**
 * Phase 4 — Rubric Alignment Check
 *
 * Goal: Map each rubric criterion to the current proposal state.
 * Show projected score. Identify highest-impact fixes.
 * Be honest about uncertainty in the assessment.
 */

import { callMentorJson } from '../tools/gemini.js';
import { getAllSections, getHypothesis, saveRubricCheck, saveMessage } from '../learnerMemory.js';
import { retrieveGrounding } from '../rag/retrieve.js';

// Actual grading rubric from the course
const RUBRIC = [
  { criterion: 'Format and submission',            max_points: 5  },
  { criterion: 'Figure or visual explanation',     max_points: 7  },
  { criterion: 'Motivation and problem framing',   max_points: 6  },
  { criterion: 'Novelty and relation to prior work', max_points: 10 },
  { criterion: 'Method and workflow detail',       max_points: 9  },
  { criterion: 'Evaluation plan',                  max_points: 7  },
  { criterion: 'Feasibility, milestones, risks',   max_points: 4  },
  { criterion: 'Writing coherence and polish',     max_points: 2  },
];

const RUBRIC_SYSTEM_PROMPT = `You are a research mentor evaluating a student's proposal draft against a grading rubric. You have seen hundreds of proposals graded — you know exactly what reviewers look for.

For each criterion, assess the current draft honestly:
- "strong": the proposal clearly satisfies this criterion
- "weak": there is content but it is vague, unsupported, or incomplete
- "missing": no meaningful attempt at this criterion

For weak and missing criteria, name the SPECIFIC fix — not "add more detail" but exactly what is missing.

You are given GROUNDING: excerpts from the actual grading standards (NSF merit review, a proposal-writing guide, and the course rubric). Judge each criterion against these excerpts, not against your own memory, and cite the relevant excerpt by its [number] in the evidence field.

Be honest about your uncertainty: "I'm not sure if this evaluation plan is strong enough because X" is more helpful than false confidence.

Return JSON:
{
  "checks": [
    {
      "criterion": "exact criterion name from rubric",
      "max_points": number,
      "status": "strong | weak | missing",
      "projected_points": number (your honest estimate),
      "evidence": "what in the draft supports or fails this criterion",
      "fix": "specific actionable fix, or empty string if strong",
      "mentor_note": "honest uncertainty or observation if any"
    }
  ],
  "total_projected": number,
  "total_max": 50,
  "priority_fixes": ["most impactful fix first", "second most impactful"],
  "honest_summary": "2-3 sentence honest assessment of where this proposal stands"
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
    userMessage: `Evaluate this proposal draft against the rubric.\n\nRubric criteria:\n${RUBRIC.map(r => `- ${r.criterion} (${r.max_points} pts)`).join('\n')}\n\n${gapContext}\n\nProposal content so far:\n${proposalContent || '(No sections drafted yet — evaluate based on gap hypothesis only)'}${groundingBlock}`,
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
      check.status,
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
  const strong = checks.filter(c => c.status === 'strong');
  const weak = checks.filter(c => c.status === 'weak');
  const missing = checks.filter(c => c.status === 'missing');

  const rows = checks.map(c => {
    const icon = c.status === 'strong' ? '✓' : c.status === 'weak' ? '⚠' : '✗';
    return `${icon} ${c.criterion} (${c.projected_points}/${c.max_points}): ${c.evidence || c.fix || ''}`;
  }).join('\n');

  return `**Rubric check — projected ${result.total_projected || '?'}/50**\n\n${rows}\n\n**Priority fixes:**\n${(result.priority_fixes || []).map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\n${result.honest_summary || ''}\n\nWhich fix do you want to tackle first?`;
}
