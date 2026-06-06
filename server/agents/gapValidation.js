/**
 * Gap Validation — the novelty check.
 *
 * A "gap" is only a gap if the literature hasn't already filled it. This agent
 * takes the formed gap hypothesis and tests it against real papers:
 *   1. Turn the gap into targeted search queries designed to FIND refuting work
 *      ("if someone already solved this, what would the paper be titled?")
 *   2. Search arxiv for that work (real tool call, not memory)
 *   3. Honestly assess: is the gap still open, partially addressed, or closed?
 *      Name the closest prior work and the precise residual gap.
 *
 * This is an evaluator pattern + tool use: the agent's novelty claim is tested
 * against evidence instead of asserted from the model's weights.
 */

import { callMentorJson } from '../tools/gemini.js';
import { searchArxiv } from '../tools/arxiv.js';
import { getHypothesis, getPapers, saveHypothesis, saveMessage } from '../learnerMemory.js';
import { retrieveGrounding } from '../rag/retrieve.js';

const QUERY_PROMPT = `You are a research mentor stress-testing whether a proposed research gap is genuinely open. Generate 3 search queries whose PURPOSE is to find existing work that would REFUTE the gap — i.e. papers that may already solve it. Think: "if someone had already addressed this, what would their paper be titled?"

QUERY FORMAT (important — these go to the arxiv search API):
- Plain keywords only: 3 to 6 words each.
- NO quotation marks, NO boolean operators (AND/OR), NO punctuation.
- Use the field's real terminology. Vary the angle across the 3 queries (technique, problem, application).
- Example good query: code review intent vulnerability detection

Return JSON:
{ "queries": ["query 1", "query 2", "query 3"] }`;

const ASSESS_PROMPT = `You are a research mentor performing a novelty check. You proposed a research gap, then searched the literature for work that might already fill it. Now judge honestly, grounded in the search results.

You are given GROUNDING on what a defensible gap requires. Apply it.

Be rigorous and honest:
- "open": no retrieved paper addresses the gap; cite why each closest paper stops short
- "partial": some work addresses part of it; state the precise RESIDUAL gap that remains
- "closed": a retrieved paper already does this; say which one and recommend narrowing or pivoting

Every claim MUST reference a retrieved paper by title. Do not assert novelty without naming the closest prior work.

IMPORTANT: If the search returned NO papers, you may NOT declare the gap "open" with confidence — absence of results often means the queries missed, not that the work doesn't exist. In that case, say so candidly in honest_note, keep verdict tentative, and recommend trying different search terms before trusting the gap.

Return JSON:
{
  "verdict": "open | partial | closed",
  "closest_prior_work": [
    { "title": "paper title", "why_relevant": "what it does that's close", "stops_short_because": "what it does NOT do (empty if it fully closes the gap)" }
  ],
  "residual_gap": "the refined, defensible gap statement after the check (or empty if closed)",
  "honest_note": "your candid assessment, including uncertainty",
  "recommendation": "proceed | narrow | pivot"
}`;

export async function validateGap(learnerId) {
  const hypothesis = getHypothesis(learnerId);
  if (!hypothesis?.gap) {
    throw new Error('No gap hypothesis to validate. Complete Phase 2 first.');
  }

  const alreadyRead = getPapers(learnerId);
  const readTitles = new Set(alreadyRead.map((p) => (p.title || '').toLowerCase().trim()));

  // 1. Generate refuting queries
  const { queries } = await callMentorJson({
    systemPrompt: QUERY_PROMPT,
    history: [],
    userMessage: `Proposed gap: ${hypothesis.gap}\nWhy it matters: ${hypothesis.why_it_matters || ''}`,
    temperature: 0.4,
    requiredKeys: ['queries']
  });

  // 2. Search arxiv for each query (real tool calls). De-dupe against papers
  //    the student already read so the check surfaces NEW evidence.
  const found = [];
  const seen = new Set();
  for (const q of (queries || []).slice(0, 3)) {
    let results = [];
    try {
      results = await searchArxiv(q, 4);
    } catch {
      results = [];
    }
    for (const r of results) {
      const key = (r.title || '').toLowerCase().trim();
      if (seen.has(key) || readTitles.has(key)) continue;
      seen.add(key);
      found.push(r);
    }
  }

  // 3. Grounding on what a defensible gap requires
  const { context: grounding } = await retrieveGrounding(
    'how to validate a research gap is genuinely open, novelty check against prior work',
    { k: 3, preferTags: ['gap', 'novelty'] }
  );

  const papersBlock = found.length
    ? found.map((p, i) => `${i + 1}. "${p.title}"\n   ${p.summary}`).join('\n\n')
    : '(No additional papers found in the targeted searches.)';

  // 4. Assess
  const assessment = await callMentorJson({
    systemPrompt: ASSESS_PROMPT,
    history: [],
    userMessage:
      `Proposed gap: ${hypothesis.gap}\n\n` +
      `Search queries used: ${(queries || []).join(' | ')}\n\n` +
      `Papers retrieved by the novelty check:\n${papersBlock}\n\n` +
      (grounding ? `GROUNDING (cite by [number]):\n${grounding}` : ''),
    temperature: 0.3,
    requiredKeys: ['verdict', 'closest_prior_work', 'residual_gap']
  });

  // 5. If the gap was refined, persist the stronger version
  if (assessment.residual_gap && assessment.verdict !== 'closed') {
    saveHypothesis(learnerId, {
      gap: assessment.residual_gap,
      why_it_matters: hypothesis.why_it_matters,
      proposed_approach: hypothesis.proposed_approach || '',
      confidence_note: assessment.honest_note || ''
    });
  }

  const msg =
    `**Novelty check — verdict: ${assessment.verdict}**\n\n` +
    `Searched: ${(queries || []).join(' | ')}\n\n` +
    `${assessment.honest_note || ''}` +
    (assessment.residual_gap ? `\n\n**Refined gap:** ${assessment.residual_gap}` : '');
  saveMessage(learnerId, 'literature', 'mentor', msg);

  return {
    verdict: assessment.verdict,
    queries: queries || [],
    searched_count: found.length,
    closest_prior_work: assessment.closest_prior_work || [],
    residual_gap: assessment.residual_gap || '',
    honest_note: assessment.honest_note || '',
    recommendation: assessment.recommendation || 'proceed'
  };
}
