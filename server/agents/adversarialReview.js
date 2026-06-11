/**
 * Adversarial Reviewer Agent
 *
 * Principle (Andrew Filev): "It doesn't make sense to review the work of
 * the model with the same model. You never do that in accounting — you
 * bring an audit firm."
 *
 * This agent plays a SKEPTICAL NSF REVIEWER — not the same role as the
 * drafter. It generates QUESTIONS grounded in:
 *   1. Accepted proposal patterns (from RAG corpus)
 *   2. The student's own papers (concrete comparison)
 *   3. NSF GRFP criteria (what reviewers actually look for)
 *
 * Key design:
 * - Generates QUESTIONS, not scores (you don't trust LLM self-scoring)
 * - Every question is grounded in a specific paper or RAG excerpt
 * - Student must ANSWER each question before the rubric is shown
 * - The gap in the student's UNDERSTANDING is exposed, not just the draft
 *
 * This teaches "why reviewers reject" — the invisible thought process
 * that never shows up in a rejection email.
 */

import { callLLMJson as callMentorJson } from '../tools/llm.js';
import { getAllSections, getHypothesis, getHypotheses, getSpecificity, getPapers, getIntake, saveMessage } from '../learnerMemory.js';
import { retrieveGrounding } from '../rag/retrieve.js';
import { recordMoment, getStory } from '../mentorPersona.js';

const ADVERSARIAL_SYSTEM_PROMPT = `You are a skeptical NSF GRFP reviewer with 15 years of reviewing experience. You have just read a graduate student's research proposal. Your job is NOT to score it — your job is to generate the 4-6 hardest questions you would ask if you were in a proposal review panel.

CRITICAL: You are a DIFFERENT perspective from the agent that drafted this proposal. You are skeptical, demanding, and rigorous. You are not trying to be mean — you are trying to find out if this proposal is actually fundable. If it is, your questions will help the student articulate why. If it is not, your questions will expose exactly what is missing.

GROUNDING RULES — every question must be grounded in ONE of:
1. A specific paper the student cited (name the paper by title, quote the relevant claim)
2. A specific excerpt from the accepted proposal standards you were given (cite by [number])
3. A specific section of the student's draft (quote 5-10 words verbatim)

QUESTION TYPES you should use (mix these):
- CONTRADICTION: "Your method section says X, but the paper '[Title]' shows Y. How do you reconcile this?"
- SPECIFICITY: "You write '[quote from draft]' — accepted proposals name specific datasets (n=X), instruments, and baselines. What are yours?"
- MISSING COMPONENT: "Accepted CS GRFP proposals require [X per standard #N]. Your proposal does not contain this. Why not?"
- PRIOR ART: "The paper '[Title]' by [Authors] appears to address exactly what you describe. How is your approach different from theirs?"
- HYPOTHESIS TEST: "If your hypothesis H1 is wrong — if [predicted outcome] does NOT happen — what would that tell us about your approach? What would you do next?"
- BROADER IMPACTS: "Your BI section mentions [quote]. Standard [#N] requires a local institutional tier with named groups and estimated reach. Where is that?"

RULES:
- Never say "this is weak" or "this is bad" — only ask questions
- Every question must be answerable if the proposal is actually sound
- Cite the specific grounding in each question
- Do NOT score anything
- Do NOT suggest fixes — your job is to ask, not to fix

Return JSON:
{
  "questions": [
    {
      "type": "contradiction | specificity | missing_component | prior_art | hypothesis_test | broader_impacts",
      "question": "The full question text, including the grounded citation",
      "grounding": "Which paper/excerpt/quote grounds this question",
      "why_this_matters": "One sentence: why a reviewer would reject based on this if unanswered"
    }
  ],
  "hardest_question": "The index (0-based) of the question that, if unanswered, would most likely result in rejection",
  "reviewer_first_impression": "One sentence: honest first-impression verdict. Not a score. Something like: 'The gap is interesting but the method reads as aspirational — I need to see specific data commitments before I can rate this Very Good or above.'"
}`;

export async function runAdversarialReview(learnerId) {
  const sections = getAllSections(learnerId);
  const hypothesis = getHypothesis(learnerId);
  const hypotheses = getHypotheses(learnerId);
  const specificity = getSpecificity(learnerId);
  const papers = getPapers(learnerId);
  const intake = getIntake(learnerId);

  if (sections.length === 0 && !hypothesis?.gap) {
    throw new Error('No proposal content to review. Complete Phase 3 first.');
  }

  // Build proposal summary for the reviewer
  const sectionText = sections.map(s =>
    `## ${s.section_name}\n${s.content}`
  ).join('\n\n');

  const paperList = papers.length
    ? papers.map((p, i) => `  [${i+1}] "${p.title}" — ${p.summary?.slice(0, 150) || 'no abstract'}`).join('\n')
    : '  (no papers cited)';

  const hypothesisBlock = hypotheses
    ? `H1 (Outcome): ${hypotheses.h1 || 'not stated'}\nH2 (Mechanism): ${hypotheses.h2 || 'not stated'}\nH3 (Impact): ${hypotheses.h3 || 'not stated'}`
    : 'No explicit hypotheses stated.';

  const specificityBlock = specificity?.passed
    ? `Dataset: ${specificity.dataset_name}\nSample: ${specificity.sample_size}\nInstruments: ${specificity.named_instruments}\nPrior ref: ${specificity.prior_reference}`
    : 'Specificity gate: NOT passed — no concrete commitments on file.';

  // Multi-hop retrieval: pull accepted proposal patterns + GRFP guide
  const { context: grounding, citations } = await retrieveGrounding(
    'what NSF GRFP reviewers look for: hypothesis, specificity, intellectual merit, broader impacts, prior work',
    { k: 6, preferTags: ['accepted-proposal', 'grfp', 'rubric', 'novelty', 'broader-impacts'], maxHops: 2 }
  );

  const groundingBlock = grounding
    ? `\n\nACCEPTED PROPOSAL STANDARDS (cite these by [RAG-N] tag in your questions):\n${grounding}`
    : '';

  const result = await callMentorJson({
    systemPrompt: ADVERSARIAL_SYSTEM_PROMPT,
    history: [],
    userMessage: `You are reviewing the following research proposal. Generate 4-6 hard reviewer questions grounded in the papers and standards provided.

DOMAIN: ${intake.domain || 'not specified'}
RESEARCH GAP: ${hypothesis?.gap || 'not stated'}

TESTABLE HYPOTHESES:
${hypothesisBlock}

SPECIFICITY COMMITMENTS:
${specificityBlock}

PAPERS THE STUDENT CITED:
${paperList}

PROPOSAL SECTIONS:
${sectionText || '(no sections drafted)'}
${groundingBlock}`,
    temperature: 0.6,
    requiredKeys: ['questions', 'reviewer_first_impression']
  });

  // Save the review to conversation
  const mentorMessage = formatReviewMessage(result);
  saveMessage(learnerId, 'adversarial_review', 'mentor', mentorMessage);

  // Record this as a milestone in the student's story
  recordMoment(learnerId, 'milestone',
    `Faced adversarial review: ${result.questions?.length || 0} tough questions. Reviewer impression: "${(result.reviewer_first_impression || '').slice(0, 100)}"`,
    'adversarial_review');

  return {
    questions: result.questions || [],
    hardest_question: result.hardest_question ?? 0,
    reviewer_first_impression: result.reviewer_first_impression || '',
    message: mentorMessage
  };
}

/**
 * Save a student's defense answer for one question.
 * Tracks whether they could answer or not.
 */
export async function saveDefenseAnswer(learnerId, questionIndex, answer) {
  saveMessage(
    learnerId,
    'adversarial_review',
    'user',
    `Question ${questionIndex + 1} answer: ${answer}`
  );
  return { saved: true };
}

function formatReviewMessage(result) {
  const qs = result.questions || [];

  const qText = qs.map((q, i) => {
    const hardest = i === (result.hardest_question ?? -1) ? ' ⚠ HARDEST' : '';
    return `**Q${i+1}${hardest} — ${q.type?.replace('_', ' ').toUpperCase() || 'QUESTION'}**
${q.question}

_Grounds this question:_ ${q.grounding || '—'}
_Why this matters:_ ${q.why_this_matters || '—'}`;
  }).join('\n\n---\n\n');

  return `**Adversarial Review — Reviewer's First Impression:**
> ${result.reviewer_first_impression || '—'}

---

**Questions you must be able to answer:**

${qText}

---

Answer each question in your own words. If you cannot answer a question, that is telling you something important about a gap in your proposal — not just the text, but your understanding of it.`;
}
