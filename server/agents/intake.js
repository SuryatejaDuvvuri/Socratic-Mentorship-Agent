/**
 * Phase 1: Intake
 *
 * The mentor gets to know the learner: their background, the domain they want
 * to research, what they already know, what they're curious about, and what
 * kind of proposal they're trying to write.
 *
 * The more the mentor understands the learner, the better every subsequent
 * phase will be. This is NOT a form — it's a conversation.
 *
 * The agent decides when intake is complete (when it has enough to move to
 * literature discovery). It signals this by setting `ready: true` in its
 * response JSON.
 */

import { callMentorJson } from '../tools/gemini.js';
import {
  saveIntakeField,
  saveMessage,
  getConversation,
  getIntake,
  getOrCreateLearner
} from '../learnerMemory.js';

// ─── Mentor system prompt ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a research mentor with 30 years of experience supervising PhD students and reviewing NSF, NIH, and fellowship proposals. You have seen hundreds of proposals — strong ones and weak ones — and you know exactly what makes the difference.

Your job in this phase is to deeply understand the learner before helping them write anything. You ask questions to understand:
- Their background and what they already know
- The domain or problem space they want to research
- What specifically interests or bothers them about it
- What they have already read or tried
- What kind of contribution they want to make (tool, study, theory, system?)
- Who the audience is and why it matters

Your style:
- You ask one or two focused questions at a time. Never a laundry list.
- You listen carefully. When the learner says something interesting, you reflect it back and probe deeper.
- You are honest. If their idea is vague, you say so kindly but directly.
- You share your honest assessment: "That's a promising direction because..." or "I'm not sure that's novel yet because..."
- You do NOT write the proposal for them. You help them think.
- You are warm but not sycophantic. You don't say "Great!" to everything.

When you have enough information to move to Phase 2 (Literature Discovery), set ready: true. You need at minimum: domain, a rough research direction, and the learner's background context.

Always respond with this exact JSON shape:
{
  "message": "your conversational response to the learner",
  "extracted": {
    "background": "...",
    "domain": "...",
    "research_direction": "...",
    "prior_knowledge": "...",
    "audience": "...",
    "contribution_type": "..."
  },
  "ready": false,
  "readiness_note": "what's still missing before moving to literature phase, or empty string if ready"
}

Only include fields in extracted that you have actually learned from this conversation. Do not guess.`;

// ─── Phase 1 handler ──────────────────────────────────────────────────────────

/**
 * Handle one turn of the intake conversation.
 *
 * @param {string} learnerId
 * @param {string} userMessage  - what the learner just said
 * @param {number} turn         - conversation turn number (0 = first message)
 * @returns {Promise<{message:string, ready:boolean, readiness_note:string, intake:object}>}
 */
export async function intakeTurn(learnerId, userMessage, turn = 0) {
  // Ensure learner exists
  getOrCreateLearner(learnerId);

  // Load conversation history for context
  const history = getConversation(learnerId, 'intake');

  // Save the user's message
  saveMessage(learnerId, 'intake', 'user', userMessage);

  // Build the message to send to Gemini
  // On the first turn (turn === 0), we add a framing prefix
  const messageToSend = turn === 0
    ? `The learner has just arrived. Their opening message is: "${userMessage}"\n\nStart the intake conversation. Introduce yourself briefly and ask your first question.`
    : userMessage;

  const result = await callMentorJson({
    systemPrompt: SYSTEM_PROMPT,
    history,
    userMessage: messageToSend
  });

  // Save the mentor's response
  const mentorMessage = result.message || "I'm not sure how to respond to that. Could you tell me more?";
  saveMessage(learnerId, 'intake', 'mentor', mentorMessage);

  // Persist extracted intake fields to DB
  const extracted = result.extracted || {};
  for (const [field, value] of Object.entries(extracted)) {
    if (value && String(value).trim()) {
      saveIntakeField(learnerId, field, String(value).trim(), turn);
    }
  }

  // Load the full current intake state
  const intake = getIntake(learnerId);

  return {
    message: mentorMessage,
    ready: result.ready === true,
    readiness_note: result.readiness_note || '',
    intake
  };
}

/**
 * Get a summary of what the mentor knows about this learner so far.
 * Used by other phases to get context.
 */
export function getIntakeSummary(learnerId) {
  const intake = getIntake(learnerId);
  const lines = Object.entries(intake)
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k}: ${v}`);

  if (!lines.length) return 'No intake information collected yet.';

  return `What we know about this learner:\n${lines.join('\n')}`;
}
