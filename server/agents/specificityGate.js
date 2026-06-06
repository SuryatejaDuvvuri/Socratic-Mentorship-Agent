/**
 * Stage 2 — Refinement 3: Specificity Gate
 *
 * Goal: BEFORE Phase 3 drafting unlocks, the student must fill in:
 *   - dataset_name       (e.g. "Linux kernel commits 2020-2024", NOT "open-source projects")
 *   - sample_size        (e.g. "n=10,000 commits",                NOT "many" or "a large set")
 *   - named_instruments  (e.g. "Code Review Velocity Metric",     NOT "metrics")
 *   - prior_reference    (e.g. "Building on Schultz et al.")
 *
 * If any field is too vague, the gate stays CLOSED. The student goes back to
 * deepening their gap.
 *
 * Source: NSF GRFP winners are specific about datasets and methods. MIT CommKit
 * annotation: "brutal specificity in methods" is required.
 *
 * Why a gate (not a suggestion): without these, the drafted method section will
 * read like "we will use open-source projects to evaluate" — which is exactly
 * the vague output our agent currently produces. Forcing concreteness here
 * fixes the root cause.
 */

import { callLLMJson as callMentorJson } from '../tools/llm.js';
import { getHypothesis, getIntake, saveSpecificity, saveMessage, getSpecificity } from '../learnerMemory.js';
import { withMentorContext, recordMoment } from '../mentorPersona.js';

const GATE_SYSTEM_PROMPT = `You are a research mentor enforcing a specificity gate. A graduate student has proposed a research gap and now must commit to concrete experimental details before drafting. Your job is to judge whether each field is concrete enough to support a defensible method section.

The four fields are:
1. dataset_name        — must name a SPECIFIC dataset/corpus/population, not a category.
   PASS: "Linux kernel commits 2020-2024", "Stack Overflow Python answers from 2023", "NHANES 2017-2018 cohort"
   FAIL: "open-source projects", "online data", "a large dataset", "GitHub repositories"

2. sample_size         — must be a number or quantifiable bound.
   PASS: "n=10,000 commits", "≥500 participants", "all 1.2M questions tagged python"
   FAIL: "many", "a significant amount", "enough to be statistically significant"

3. named_instruments   — must name a SPECIFIC metric/instrument/tool.
   PASS: "Code Review Velocity Metric (Schultz 2021)", "PHQ-9 depression scale", "F1 score on the labeled subset"
   FAIL: "metrics", "evaluation tools", "appropriate measures"

4. prior_reference     — must name a specific researcher or paper, not just a field.
   PASS: "Building on Schultz et al.'s code-review framework", "Extending Vaswani's attention mechanism"
   FAIL: "based on prior work in the field", "following machine-learning literature"

Be strict. Specificity is what separates winning NSF proposals from rejected ones.

For each field, assess: "concrete" or "vague". If vague, explain WHY and tell the student exactly what type of answer would pass.

Set passed=true ONLY IF all four fields are concrete.

Return JSON:
{
  "dataset_assessment":    { "status": "concrete" | "vague", "feedback": "specific feedback" },
  "sample_size_assessment":{ "status": "concrete" | "vague", "feedback": "specific feedback" },
  "instruments_assessment":{ "status": "concrete" | "vague", "feedback": "specific feedback" },
  "prior_ref_assessment":  { "status": "concrete" | "vague", "feedback": "specific feedback" },
  "passed": true|false,
  "overall_feedback": "2-3 sentence honest summary — if not passed, what's the highest-priority fix?"
}`;

export async function evaluateSpecificity(learnerId, fields) {
  const { dataset_name, sample_size, named_instruments, prior_reference } = fields;

  const hypothesis = getHypothesis(learnerId);
  const intake = getIntake(learnerId);

  if (!hypothesis?.gap) {
    throw new Error('No gap hypothesis found. Complete Phase 2 first.');
  }

  // Quick local check: if any field is empty/blank, fail fast
  const emptyFields = [];
  if (!String(dataset_name || '').trim())       emptyFields.push('dataset_name');
  if (!String(sample_size || '').trim())        emptyFields.push('sample_size');
  if (!String(named_instruments || '').trim())  emptyFields.push('named_instruments');
  if (!String(prior_reference || '').trim())    emptyFields.push('prior_reference');

  if (emptyFields.length > 0) {
    const localResult = {
      passed: false,
      overall_feedback: `Missing required fields: ${emptyFields.join(', ')}. The specificity gate cannot pass with empty answers.`,
      dataset_assessment:    { status: dataset_name      ? 'concrete' : 'vague', feedback: dataset_name      ? '' : 'Required — name a specific dataset.'        },
      sample_size_assessment:{ status: sample_size       ? 'concrete' : 'vague', feedback: sample_size       ? '' : 'Required — give a numeric bound (n=X).'     },
      instruments_assessment:{ status: named_instruments ? 'concrete' : 'vague', feedback: named_instruments ? '' : 'Required — name a specific metric/tool.'   },
      prior_ref_assessment:  { status: prior_reference   ? 'concrete' : 'vague', feedback: prior_reference   ? '' : 'Required — name a specific researcher.'    }
    };
    persistAndMessage(learnerId, fields, localResult);
    return localResult;
  }

  const context = `DOMAIN: ${intake.domain || 'not specified'}
RESEARCH GAP: ${hypothesis.gap}

Student's specificity-gate answers:
- Dataset:        "${dataset_name}"
- Sample size:    "${sample_size}"
- Instruments:    "${named_instruments}"
- Prior reference:"${prior_reference}"

Judge each one strictly. If any field is vague, the gate must not pass.`;

  const result = await callMentorJson({
    systemPrompt: withMentorContext(learnerId, GATE_SYSTEM_PROMPT),
    history: [],
    userMessage: context,
    temperature: 0.2,
    requiredKeys: ['passed']
  });

  persistAndMessage(learnerId, fields, result);

  // Record story moment
  if (result.passed) {
    recordMoment(learnerId, 'milestone',
      `Passed specificity gate — committed to dataset: "${fields.dataset_name}", n=${fields.sample_size}`, 'specificity');
  } else {
    recordMoment(learnerId, 'struggle',
      `Specificity gate rejected — needs more concrete commitments`, 'specificity');
  }

  return result;
}

function persistAndMessage(learnerId, fields, result) {
  const feedbackBlock = JSON.stringify({
    dataset:     result.dataset_assessment,
    sample_size: result.sample_size_assessment,
    instruments: result.instruments_assessment,
    prior_ref:   result.prior_ref_assessment,
    overall:     result.overall_feedback
  }, null, 2);

  saveSpecificity(learnerId, {
    dataset_name:      fields.dataset_name      || '',
    sample_size:       fields.sample_size       || '',
    named_instruments: fields.named_instruments || '',
    prior_reference:   fields.prior_reference   || '',
    passed:            !!result.passed,
    mentor_feedback:   feedbackBlock
  });

  const userMessage = `Specificity gate submission:
- Dataset:        ${fields.dataset_name}
- Sample size:    ${fields.sample_size}
- Instruments:    ${fields.named_instruments}
- Prior ref:      ${fields.prior_reference}`;
  saveMessage(learnerId, 'specificity', 'user', userMessage);

  const mentorMessage = formatGateMessage(result);
  saveMessage(learnerId, 'specificity', 'mentor', mentorMessage);
}

function formatGateMessage(result) {
  const icon = (s) => s === 'concrete' ? '✓' : '✗';
  return `**Specificity gate ${result.passed ? '✓ PASSED' : '✗ FAILED'}**

${icon(result.dataset_assessment?.status)} Dataset:        ${result.dataset_assessment?.feedback || ''}
${icon(result.sample_size_assessment?.status)} Sample size:    ${result.sample_size_assessment?.feedback || ''}
${icon(result.instruments_assessment?.status)} Instruments:    ${result.instruments_assessment?.feedback || ''}
${icon(result.prior_ref_assessment?.status)} Prior reference:${result.prior_ref_assessment?.feedback || ''}

**Overall:** ${result.overall_feedback || ''}

${result.passed ? 'Drafting unlocked.' : 'Fix the vague fields above and resubmit.'}`;
}
