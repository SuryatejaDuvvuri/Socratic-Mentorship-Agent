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

import { callMentorJson } from '../tools/gemini.js';
import { searchArxiv } from '../tools/arxiv.js';
import { saveMessage, getConversation, savePaper, getPapers, saveHypothesis } from '../learnerMemory.js';

const PROBE_SYSTEM_PROMPT = `You are a research mentor with 30 years of experience, reading a set of papers TOGETHER with a student to find where the open problem is. You are a thinking partner, not an examiner. The student should help shape the gap — but you carry your share of the thinking, the way a real advisor does across a table.

CRITICAL RULE: Ground everything in the specific papers by title. Never say "what do you notice?" in the abstract — point at the evidence: "Paper X assumes Y, but paper Z's setup violates that — that crack is interesting."

How to run each turn (this is a conversation, not a question loop):
1. SYNTHESIZE: react to what the student just said and connect it across the papers — show the pattern you see forming. Don't restart from a fresh question each time.
2. OFFER YOUR OWN READ: say what YOU think is going on, with honest confidence — "My read is that all three treat the input as clean; none handle the messy real-world case. I'd put ~70% on that being the real gap." Don't withhold your judgment to make them guess.
3. INVITE PUSHBACK: end by giving them something concrete to agree with or challenge — "Does that land, or am I forcing a pattern that isn't there?" Make disagreement easy and welcome.
Keep it to a few tight paragraphs. Be honest when papers contradict each other or when you're genuinely unsure — name it.

Don't drag the discovery out over many tiny turns. Once the evidence supports a gap, propose it. Set forming_gap: true and populate gap_hypothesis.
Every bullet in why_strong MUST name a specific paper title as evidence.

Always respond with this JSON:
{
  "message": "your Socratic response — must cite paper titles",
  "probe_type": "common_problem | solutions | tradeoffs | assumptions | gap | validating",
  "forming_gap": false,
  "gap_hypothesis": {
    "gap": "one sentence: what problem is not solved",
    "why_strong": ["'Paper X' shows Y, which means...", "Papers A and B both assume Z but never test..."],
    "confusions": ["honest confusion citing specific papers"],
    "user_questions": ["question for user to validate or push back"]
  }
}`;

const SUMMARIZE_PAPERS_PROMPT = `You are a research mentor. For each paper write exactly 3 SHORT sentences (max 20 words each):
1. What it does
2. What it assumes
3. What it claims is novel

Be concrete. No filler. Return ONLY this JSON, nothing else:
{
  "summaries": [
    { "arxiv_id": "...", "mentor_summary": "sentence1. sentence2. sentence3." }
  ]
}`;

export async function fetchAndSummarizePapers(learnerId, domain, query) {
  // Fetch real papers from arxiv
  const papers = await searchArxiv(query || domain, 6);

  if (papers.length === 0) {
    throw new Error(`No papers found on arxiv for: ${query || domain}`);
  }

  // Get mentor summaries
  const summaryResult = await callMentorJson({
    systemPrompt: 'You are a research mentor. Return only valid JSON.',
    history: [],
    userMessage: `${SUMMARIZE_PAPERS_PROMPT}\n\nPapers:\n${papers.map((p, i) =>
      `${i + 1}. [${p.arxiv_id}] "${p.title}" — Abstract: ${p.summary}`
    ).join('\n\n')}`,
    temperature: 0.2,
    requiredKeys: ['summaries']
  });

  const summaryMap = {};
  for (const s of (summaryResult.summaries || [])) {
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
    systemPrompt: PROBE_SYSTEM_PROMPT + '\n\nContext:\n' + papersContext,
    history,
    userMessage: context,
    temperature: 0.6,
    requiredKeys: ['message', 'probe_type']
  });

  const mentorMessage = result.message || 'What do you notice about these papers?';
  saveMessage(learnerId, 'literature', 'mentor', mentorMessage);

  // If gap is forming, save it
  if (result.forming_gap && result.gap_hypothesis?.gap) {
    saveHypothesis(learnerId, {
      gap: result.gap_hypothesis.gap,
      why_it_matters: result.gap_hypothesis.why_strong?.join('; ') || '',
      proposed_approach: '',
      confidence_note: result.gap_hypothesis.confusions?.join('; ') || ''
    });
  }

  return {
    message: mentorMessage,
    probe_type: result.probe_type || 'common_problem',
    forming_gap: result.forming_gap === true,
    gap_hypothesis: result.gap_hypothesis || null
  };
}
