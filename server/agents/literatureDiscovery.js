/**
 * Phase 2 — Literature Discovery
 *
 * Goal: Find the research gap TOGETHER by reading papers and probing observations.
 * The user isn't told the gap — they discover it through Socratic questioning.
 *
 * Flow:
 *   1. Agent searches arxiv for relevant papers
 *   2. Shows summaries: "what it does, what it assumes, what it claims novel"
 *   3. User reads them (can be across sessions — memory persists)
 *   4. Agent probes: common problems, solutions, trade-offs, assumptions, gaps
 *   5. Together form a gap hypothesis
 *   6. Agent presents gap with honest confusions and asks user to validate
 */

import { callLLMJson as callMentorJson } from '../tools/llm.js';
import { searchPapers } from '../tools/tavily.js';
import { saveMessage, getConversation, savePaper, getPapers, saveHypothesis } from '../learnerMemory.js';
import { withMentorContext, detectAndRecordMoments, recordMoment } from '../mentorPersona.js';

const PROBE_SYSTEM_PROMPT = `You are a research mentor reading papers TOGETHER with a student. Thinking partner, not examiner.

RESPONSE FORMAT — always use this structure in your "message" field:
- 1-2 short sentences reacting to what the student said
- A "**What I'm seeing:**" block: 2-3 bullet points, each naming a specific paper title in **bold** and what it reveals
- 1 sentence with your honest read ("My read: ...")
- End with ONE short question (≤15 words)

RULES:
1. Cite paper titles in **bold** always. Never vague ("one paper shows...").
2. Keep it tight — 4-6 sentences total max. No walls of text.
3. Your own opinion goes in "My read:" — don't hide it.
4. End with a question that makes disagreement easy ("Does that track?" / "Am I off?").
5. Once evidence supports a gap, set forming_gap: true and propose it — don't drag it out.

EXAMPLE message format:
"Right, that pattern stands out to me too.

**What I'm seeing:**
• **"Fine-grained Multi-Document Extraction"** splits commits syntactically — no semantic awareness of intent
• **"Select-Then-Decompose"** picks split points adaptively but still requires human validation
• **"Decomposition Strategies and Multi-shot ASP"** frames it as constraint satisfaction — closest to automated, but domain-specific

My read: none of these guarantee the narrative thread survives the split. That's the gap.

Does that match what you're seeing, or is there a paper I'm misreading?"

Always respond with this JSON:
{
  "message": "formatted response following the structure above",
  "probe_type": "common_problem | solutions | tradeoffs | assumptions | gap | validating",
  "forming_gap": false,
  "gap_hypothesis": {
    "gap": "one sentence: what problem is not solved",
    "why_strong": ["**'Paper X'** shows Y, which means...", "**Papers A and B** both assume Z but never test..."],
    "confusions": ["honest confusion citing specific papers"],
    "user_questions": ["question for user to validate or push back"]
  }
}`;

const SEARCH_AND_SUMMARIZE_PROMPT = `You are a research mentor. Given a domain and student idea, do two things at once:

1. Pick the BEST single search query (3-6 plain keywords, no quotes or operators) to find relevant papers.
2. For each paper provided, write exactly 3 SHORT sentences (max 20 words each):
   - What it does
   - What it assumes
   - What it claims is novel

Return JSON:
{
  "search_query": "best query string",
  "summaries": [
    { "arxiv_id": "...", "mentor_summary": "sentence1. sentence2. sentence3." }
  ]
}`;

export async function fetchAndSummarizePapers(learnerId, domain, idea) {
  // Step 1: Use LLM to pick the best search query AND summarize results in one call.
  // First do a broad Tavily search using the raw idea, then let LLM refine + summarize.
  const rawQuery = `${idea || domain} research`.slice(0, 380); // Tavily 400-char limit
  console.log(`[literatureDiscovery] Searching via Tavily: "${rawQuery}"`);

  const papers = await searchPapers(rawQuery, 6);

  if (papers.length === 0) {
    throw new Error(`No papers found for: ${idea || domain}`);
  }

  // One LLM call: pick better query for future + summarize the papers we already have
  const result = await callMentorJson({
    systemPrompt: 'You are a research mentor. Return only valid JSON.',
    history: [],
    userMessage: `${SEARCH_AND_SUMMARIZE_PROMPT}\n\nDomain: ${domain}\nStudent idea: ${idea}\n\nPapers found:\n${
      papers.map((p, i) => `${i + 1}. [${p.arxiv_id}] "${p.title}" — ${p.summary}`).join('\n\n')
    }`,
    temperature: 0.2,
    requiredKeys: ['summaries']
  });

  const summaryMap = {};
  for (const s of (result.summaries || [])) {
    summaryMap[s.arxiv_id] = s.mentor_summary;
  }

  // Save papers to DB with mentor summaries
  for (const paper of papers) {
    savePaper(learnerId, {
      ...paper,
      summary: summaryMap[paper.arxiv_id] || paper.summary
    });
  }

  return papers.map(p => ({
    ...p,
    mentor_summary: summaryMap[p.arxiv_id] || p.summary
  }));
}

export async function literatureDiscoveryTurn(learnerId, userMessage, turn) {
  const history = getConversation(learnerId, 'literature');
  const papers = getPapers(learnerId);

  saveMessage(learnerId, 'literature', 'user', userMessage);

  // First turn after user has read papers — start probing
  const context = turn === 0
    ? `The student has just finished reading ${papers.length} papers on their domain. Their first reaction: "${userMessage}". Start probing with the first Socratic question about what common problem these papers address.`
    : userMessage;

  const papersContext = `Papers the student has read (you MUST reference these by title in your questions):\n${papers.map((p, i) =>
    `${i + 1}. TITLE: "${p.title}"\n   SUMMARY: ${p.summary}`
  ).join('\n\n')}`;

  const result = await callMentorJson({
    systemPrompt: withMentorContext(learnerId, PROBE_SYSTEM_PROMPT + '\n\nContext:\n' + papersContext),
    history,
    userMessage: context,
    temperature: 0.2,
    requiredKeys: ['message', 'probe_type']
  });

  // Ensure message ends with a question — add one if missing
  let mentorMessage = result.message || 'What do you notice about these papers?';
  if (!mentorMessage.includes('?')) {
    mentorMessage += ' What do you think?';
  }
  saveMessage(learnerId, 'literature', 'mentor', mentorMessage);

  // Record story moments
  await detectAndRecordMoments(learnerId, 'literature', userMessage, mentorMessage);

  // If gap is forming, save it and record the milestone
  if (result.forming_gap && result.gap_hypothesis?.gap) {
    saveHypothesis(learnerId, {
      gap: result.gap_hypothesis.gap,
      why_it_matters: result.gap_hypothesis.why_strong?.join('; ') || '',
      proposed_approach: '',
      confidence_note: result.gap_hypothesis.confusions?.join('; ') || ''
    });
    recordMoment(learnerId, 'commitment',
      `Identified research gap: "${result.gap_hypothesis.gap.slice(0, 120)}"`, 'literature');
  }

  return {
    message: mentorMessage,
    probe_type: result.probe_type || 'common_problem',
    forming_gap: result.forming_gap === true,
    gap_hypothesis: result.gap_hypothesis || null
  };
}
