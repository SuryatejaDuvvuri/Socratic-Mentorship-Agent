/**
 * Phase 1 — Domain Readiness
 *
 * Goal: Make sure the user has enough conceptual foundation before reading papers.
 * Uses Feynman-style questions. Judges answers. Marks concepts understood.
 * Gates progression to Phase 2.
 */

import { callMentorJson, callMentor } from '../tools/gemini.js';
import { saveMessage, getConversation, saveIntakeField, getIntake } from '../learnerMemory.js';

const SYSTEM_PROMPT = `You are a research mentor with 30 years of experience, talking with a student before they dive into the literature. Your goal is to gauge whether they have enough conceptual footing to read papers productively — and to fill small gaps as you go. This is a CONVERSATION, not a quiz.

How a real mentor does this:
- React to what they actually said first — reflect it back, show you heard them ("Right, so you're treating X as Y...").
- Give your own honest read: where they're solid, where there's a subtle gap. Offer the missing piece in 2-3 sentences, like a colleague would — don't lecture.
- Move briskly. If their answer already shows they understand a concept (or even touches a related one), acknowledge it and DON'T re-ask. You may clear more than one concept in a single turn if their answer covers it.
- Only ask a follow-up when there's a genuine gap worth closing before they read papers, and frame it as curiosity, not an exam.
- Be human: if something they said is a genuinely good insight, say so. If the concept is fuzzy at the edges even for experts, admit it.
- Readiness to READ papers is a low bar, not mastery. When they have enough footing, say where they stand honestly and set ready: true. Don't drag it out.

Always respond with this exact JSON:
{
  "message": "your response to the student",
  "concept_being_checked": "name of concept just checked, or null",
  "concept_result": "strong | weak | corrected | null",
  "concepts_checked": ["list of all concepts checked so far"],
  "ready": false,
  "readiness_summary": "honest 1-2 sentence summary of where they stand, or empty string"
}`;

const IDENTIFY_CONCEPTS_PROMPT = `You are a research mentor. Given a research domain, identify the 2-4 most important prerequisite concepts a student MUST understand before reading papers in this domain productively. These should be foundational concepts — not advanced research topics.

Return JSON:
{
  "concepts": [
    {
      "name": "concept name",
      "why_needed": "1 sentence: why this matters for reading papers in this domain",
      "feynman_question": "a lightweight question asking the student to explain it in their own words — casual, not intimidating"
    }
  ]
}

Domain: `;

export async function identifyConcepts(domain) {
  const result = await callMentorJson({
    systemPrompt: 'You are a research mentor. Return only valid JSON.',
    history: [],
    userMessage: IDENTIFY_CONCEPTS_PROMPT + domain,
    temperature: 0.3,
    requiredKeys: ['concepts']
  });
  return result.concepts || [];
}

export async function domainReadinessTurn(learnerId, userMessage, turn, concepts) {
  const history = getConversation(learnerId, 'domain_readiness');
  saveMessage(learnerId, 'domain_readiness', 'user', userMessage);

  // On first turn (turn 0), the userMessage is the domain itself — save it
  if (turn === 0) {
    saveIntakeField(learnerId, 'domain', userMessage, 0);
  }

  // On first turn, start by asking about the first concept
  const messageToSend = turn === 0
    ? `The student wants to research: "${userMessage}". The key concepts to check are: ${concepts.map(c => c.name).join(', ')}. Start by asking about the first concept using this question: "${concepts[0]?.feynman_question}"`
    : userMessage;

  const result = await callMentorJson({
    systemPrompt: SYSTEM_PROMPT,
    history,
    userMessage: messageToSend,
    temperature: 0.5,
    requiredKeys: ['message', 'ready']
  });

  const mentorMessage = result.message || 'Could you tell me more?';
  saveMessage(learnerId, 'domain_readiness', 'mentor', mentorMessage);

  // Save concept results
  if (result.concept_being_checked && result.concept_result) {
    saveIntakeField(learnerId, `concept:${result.concept_being_checked}`, result.concept_result, turn);
  }

  return {
    message: mentorMessage,
    concept_being_checked: result.concept_being_checked || null,
    concept_result: result.concept_result || null,
    concepts_checked: result.concepts_checked || [],
    ready: result.ready === true,
    readiness_summary: result.readiness_summary || ''
  };
}
