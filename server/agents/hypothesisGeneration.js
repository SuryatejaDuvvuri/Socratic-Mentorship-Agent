/**
 * Stage 2 — Refinement 1: Hypothesis Generation Phase
 *
 * Goal: After Phase 2 gap is clear, force the student to commit to
 * 2-3 testable hypotheses BEFORE drafting. This is what separates real
 * NSF winning proposals from vague generated text.
 *
 * Format:
 *   H1: prediction about OUTCOME    ("Method will reduce effort by ≥20%")
 *   H2: prediction about MECHANISM  ("Reduction is driven by X")
 *   H3: prediction about IMPACT     ("Generalizes to broader case Y")
 *
 * Source: NSF GRFP winners ALL have explicit "My hypothesis is that..." sentences.
 * MIT CommKit annotation: testable predictions are non-negotiable.
 */

import { callLLMJson as callMentorJson } from '../tools/llm.js';
import { getHypothesis, getPapers, getIntake, saveHypotheses, saveMessage, getHypotheses } from '../learnerMemory.js';
import { withMentorContext, recordMoment } from '../mentorPersona.js';

const HYPOTHESIS_SYSTEM_PROMPT = `You are a research mentor helping a graduate student turn a research gap into testable hypotheses. NSF GRFP winning proposals always contain explicit hypothesis statements ("My hypothesis is that..."). Vague proposals lose points; testable ones win.

Your job: given the student's gap, the papers they've read, and their domain, propose three hypotheses they could test. Then explain why each is testable.

The three hypotheses must follow this structure:
- H1 (OUTCOME): a concrete, measurable prediction about what the method achieves.
  Example: "The proposed reviewability metric will reduce reviewer effort by ≥20% compared to the baseline."
- H2 (MECHANISM): a prediction about WHY/HOW the method works — the causal claim.
  Example: "The reduction in effort is driven by surfacing architectural dependencies, not by reducing diff size."
- H3 (IMPACT): a prediction about generalization or downstream effect.
  Example: "Reviewability scores correlate with post-merge defect rate (r > 0.4) across ≥3 open-source projects."

🚫 RULES — your hypotheses must:
1. Be FALSIFIABLE. Each one must specify what evidence would disconfirm it.
2. Reference real measurables tied to the gap, NOT vague terms like "improve" or "better".
3. Use thresholds, comparisons, or correlations where possible (≥, <, vs. baseline, r > X).
4. Stay on the student's domain. No drift.
5. NEVER use placeholder syntax like X%, [1], "a study". If you don't have real numbers, propose qualitative-but-testable claims ("at least as good as baseline").

Be honest in your mentor_note: if the gap is too vague to support testable hypotheses, say so and recommend going back to the deepening loop.

Return JSON:
{
  "h1": "outcome hypothesis — concrete and measurable",
  "h2": "mechanism hypothesis — what makes the method work",
  "h3": "impact hypothesis — generalization or downstream effect",
  "rationale": "2-3 sentences on why these three together cover outcome+mechanism+impact for this specific gap",
  "mentor_note": "honest assessment — is the gap concrete enough to support these? Anything you're unsure about?"
}`;

export async function generateHypotheses(learnerId) {
  const hypothesis = getHypothesis(learnerId);
  const papers = getPapers(learnerId);
  const intake = getIntake(learnerId);

  if (!hypothesis?.gap) {
    throw new Error('No gap hypothesis found. Complete Phase 2 first.');
  }

  const paperList = papers.length
    ? papers.map((p, i) => `  ${i + 1}. "${p.title}"`).join('\n')
    : '  (none)';

  const context = `DOMAIN: ${intake.domain || 'not specified'}

RESEARCH GAP: ${hypothesis.gap}
WHY IT MATTERS: ${hypothesis.why_it_matters}

Papers the student has read:
${paperList}

Now propose H1, H2, H3 — outcome, mechanism, impact. Each must be testable.`;

  const result = await callMentorJson({
    systemPrompt: withMentorContext(learnerId, HYPOTHESIS_SYSTEM_PROMPT),
    history: [],
    userMessage: context,
    temperature: 0.4,
    requiredKeys: ['h1', 'h2', 'h3']
  });

  saveHypotheses(learnerId, {
    h1: result.h1 || '',
    h2: result.h2 || '',
    h3: result.h3 || '',
    rationale: result.rationale || '',
    mentor_note: result.mentor_note || ''
  });

  recordMoment(learnerId, 'milestone', `Generated hypotheses — H1: "${(result.h1 || '').slice(0, 80)}"`, 'hypothesis');

  const mentorMessage = formatHypothesisMessage(result);
  saveMessage(learnerId, 'hypothesis', 'mentor', mentorMessage);

  return {
    h1: result.h1,
    h2: result.h2,
    h3: result.h3,
    rationale: result.rationale,
    mentor_note: result.mentor_note,
    message: mentorMessage
  };
}

/**
 * Accept the student's edits to H1/H2/H3 and save the final version.
 */
export async function saveStudentHypotheses(learnerId, { h1, h2, h3 }) {
  const existing = getHypotheses(learnerId) || {};
  saveHypotheses(learnerId, {
    h1: h1 || existing.h1 || '',
    h2: h2 || existing.h2 || '',
    h3: h3 || existing.h3 || '',
    rationale: existing.rationale || '',
    mentor_note: existing.mentor_note || ''
  });
  saveMessage(learnerId, 'hypothesis', 'user', `Committed:\n- H1: ${h1}\n- H2: ${h2}\n- H3: ${h3}`);
  return getHypotheses(learnerId);
}

function formatHypothesisMessage(result) {
  return `**Testable hypotheses for your gap:**

**H1 (OUTCOME):** ${result.h1 || '(missing)'}
**H2 (MECHANISM):** ${result.h2 || '(missing)'}
**H3 (IMPACT):** ${result.h3 || '(missing)'}

**Why these three:** ${result.rationale || ''}

${result.mentor_note ? `**My honest note:** ${result.mentor_note}` : ''}

Edit any of them, then commit. These will anchor your method and evaluation sections.`;
}
