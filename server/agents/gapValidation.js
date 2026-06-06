/**
 * Gap Validation — Single-call architecture
 *
 * Previous: 3 LLM calls (generateQueries + assess + quality check)
 * New: 1 LLM call that validates novelty AND assesses quality together.
 * Evidence is retrieved with Tavily (no LLM needed for search).
 */

import { callLLMJson as callMentorJson } from '../tools/llm.js';
import { searchPapers } from '../tools/tavily.js';
import { getHypothesis, getPapers, getIntake, saveHypothesis, saveMessage } from '../learnerMemory.js';
import { retrieveGrounding } from '../rag/retrieve.js';

const VALIDATE_AND_ASSESS_PROMPT = `You are a senior research advisor doing two things at once:

1. **NOVELTY CHECK** — Does this gap already exist in the literature? Use the retrieved papers.
2. **QUALITY GATE** — Is this gap ready to become a proposal?

NOVELTY verdicts:
- "open": no retrieved paper addresses the gap — cite why each close paper stops short
- "partial": some work addresses part of it — state the precise RESIDUAL gap that remains
- "closed": a paper already does this — say which one

QUALITY checks (a gap is READY only if ALL pass):
- CONCRETE: names a specific problem, not a vague theme
- SCOPED: tackable in a single project
- TESTABLE: you can imagine an experiment to verify it
- ON-DOMAIN: stays within the stated domain
- GROUNDED: builds on the papers read, not speculation

If no papers were retrieved, do NOT declare the gap "open" with confidence — say so honestly.

Return JSON:
{
  "novelty_verdict": "open | partial | closed",
  "closest_prior_work": [
    { "title": "paper title", "why_relevant": "what it does", "stops_short_because": "what it misses" }
  ],
  "residual_gap": "refined defensible gap after novelty check (empty if closed)",
  "quality_ready": true | false,
  "failed_checks": ["concrete | scoped | testable | on-domain | grounded — each with a one-line reason"],
  "diagnosis": "2-3 sentences honest assessment",
  "sharper_gap": "concrete restatement if not ready, else empty",
  "recommendation": "proceed | narrow | pivot",
  "honest_note": "candid overall assessment including uncertainty"
}`;

export async function validateGap(learnerId) {
  const hypothesis = getHypothesis(learnerId);
  if (!hypothesis?.gap) throw new Error('No gap hypothesis to validate. Complete Phase 2 first.');

  const alreadyRead = getPapers(learnerId);
  const intake = getIntake(learnerId);
  const readTitles = new Set(alreadyRead.map(p => (p.title || '').toLowerCase().trim()));

  // Retrieve evidence with Tavily — no LLM call needed for search
  let found = [];
  try {
    // Tavily has a 400-char query limit. If gap is long, extract key terms instead of truncating.
    let searchQuery = hypothesis.gap;
    if (hypothesis.gap.length > 200) {
      const sentences = hypothesis.gap.split(/[.!?]+/);
      const mainClaim = sentences[0].slice(0, 120).trim();
      searchQuery = `${mainClaim} ${intake.domain || ''}`;
    }
    searchQuery = searchQuery.slice(0, 380);
    const results = await searchPapers(searchQuery, 6);
    found = results.filter(p => p.title && !readTitles.has(p.title.toLowerCase().trim()));
  } catch (err) {
    console.warn('[gapValidation] Search failed:', err.message);
  }

  const { context: grounding } = await retrieveGrounding(
    'how to validate a research gap is genuinely open, novelty check against prior work',
    { k: 3, preferTags: ['gap', 'novelty'] }
  );

  const papersBlock = found.length
    ? found.map((p, i) => `${i + 1}. "${p.title}"\n   ${(p.summary || '').slice(0, 200)}`).join('\n\n')
    : '(No additional papers found.)';

  // One LLM call does novelty check + quality gate
  const result = await callMentorJson({
    systemPrompt: VALIDATE_AND_ASSESS_PROMPT,
    history: [],
    userMessage:
      `Domain: ${intake.domain || 'not specified'}\n` +
      `Gap: ${hypothesis.gap}\n` +
      `Why it matters: ${hypothesis.why_it_matters || ''}\n\n` +
      `Papers student already read:\n${alreadyRead.map((p, i) => `${i + 1}. "${p.title}"`).join('\n') || '(none)'}\n\n` +
      `Additional papers retrieved for novelty check:\n${papersBlock}\n\n` +
      (grounding ? `Standards for a defensible gap:\n${grounding}` : ''),
    temperature: 0.2,
    requiredKeys: ['novelty_verdict', 'quality_ready', 'recommendation']
  });

  // Persist the refined gap
  const finalGap = result.residual_gap || result.sharper_gap || hypothesis.gap;
  if (finalGap !== hypothesis.gap && result.novelty_verdict !== 'closed') {
    saveHypothesis(learnerId, {
      gap: finalGap,
      why_it_matters: hypothesis.why_it_matters,
      proposed_approach: hypothesis.proposed_approach || '',
      confidence_note: result.honest_note || ''
    });
  }

  const msg =
    `**Novelty check — ${result.novelty_verdict}** · Quality: ${result.quality_ready ? '✓ ready' : '⚠ needs work'}\n\n` +
    `${result.honest_note || ''}\n\n` +
    (finalGap !== hypothesis.gap ? `**Refined gap:** ${finalGap}` : '');
  saveMessage(learnerId, 'literature', 'mentor', msg);

  return {
    verdict: result.novelty_verdict,
    searched_count: found.length,
    closest_prior_work: result.closest_prior_work || [],
    residual_gap: result.residual_gap || '',
    quality_ready: result.quality_ready === true,
    failed_checks: result.failed_checks || [],
    diagnosis: result.diagnosis || '',
    sharper_gap: result.sharper_gap || '',
    honest_note: result.honest_note || '',
    recommendation: result.recommendation || 'proceed'
  };
}

// assessGapQuality is now folded into validateGap above.
// Keeping this export for backward compatibility with any direct callers.
export async function assessGapQuality(learnerId) {
  const result = await validateGap(learnerId);
  return {
    ready: result.quality_ready,
    verdict: result.quality_ready ? 'ready' : 'needs_sharpening',
    failed_checks: result.failed_checks,
    diagnosis: result.diagnosis,
    sharper_gap: result.sharper_gap
  };
}
