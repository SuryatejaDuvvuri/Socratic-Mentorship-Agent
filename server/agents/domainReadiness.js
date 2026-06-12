/**
 * Phase 1 — Domain Readiness
 *
 * Goal: Make sure the user has enough conceptual foundation before reading papers.
 * Uses Feynman-style questions. Judges answers. Marks concepts understood.
 * Gates progression to Phase 2.
 */

import { callLLMJson as callMentorJson, callLLM as callMentor } from '../tools/llm.js';
import { saveMessage, getConversation, saveIntakeField, getIntake } from '../learnerMemory.js';
import { withMentorContext, detectAndRecordMoments, recordMoment } from '../mentorPersona.js';

function buildEvaluatePrompt(question, answer, nextConcept, isLast) {
  let nextMsg;
  if (isLast) {
    nextMsg = "I think you're ready. Your foundation is solid — let's go find some papers together.";
  } else {
    nextMsg = `**${nextConcept.name}**\n\n${nextConcept.feynman_question}`;
  }

  return `Evaluate this student's answer. Warm, honest, concise — 2 sentences max.

Question asked: "${question}"
Their answer: "${answer}"

Verdicts:
- **strong**: Name the specific thing they got right. Be concrete, not generic ("You nailed it" is useless).
- **weak**: Name the one thing that's fuzzy. One sentence of encouragement.
- **confused**: Be kind but direct. One sentence on what went wrong.

FORMAT your feedback like this (use **bold** for the key insight or gap):
- Strong: "**[specific thing they got right]** — that's the key distinction. [one more sentence if needed]"
- Weak: "Close — **[what's missing]**. [encouragement]"
- Confused: "**[what they got wrong]** — that's a common mix-up. [redirect]"

Return JSON:
{
  "verdict": "strong | weak | confused",
  "feedback": "2 sentences max, uses bold for the key point",
  "next_message": "${nextMsg}"
}`;
}

const IDENTIFY_CONCEPTS_PROMPT = `Given a research domain, identify the 2-4 foundational concepts a student should understand before diving into papers. Not advanced topics — the bedrock.

For each concept, write a Feynman-style question — casual, curious, the way you'd ask someone over coffee. Not "Define X" but "How would you explain X to someone who's never heard of it?"

Return JSON:
{
  "concepts": [
    {
      "name": "concept name",
      "why_needed": "1 sentence: why this matters for reading papers in this domain",
      "feynman_question": "a warm, curious question — not a test, more like 'I'm curious how you think about...'"
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

export async function domainReadinessTurn(learnerId, userMessage, turn, concepts, conceptIndex) {
  const history = getConversation(learnerId, 'domain_readiness');
  saveMessage(learnerId, 'domain_readiness', 'user', userMessage);

  // On first turn (turn 0), the userMessage is the domain itself — save it
  if (turn === 0) {
    saveIntakeField(learnerId, 'domain', userMessage, 0);
    // Ask the first concept question
    const firstConcept = concepts[0];
    const mentorMessage = firstConcept.feynman_question;
    saveMessage(learnerId, 'domain_readiness', 'mentor', mentorMessage);
    return {
      message: mentorMessage,
      concept_being_checked: null, // Not evaluated yet
      concept_result: null,
      concepts_checked: [],
      ready: false,
      readiness_summary: ''
    };
  }

  // Subsequent turns: evaluate the answer and move to next concept
  // If conceptIndex is out of bounds, we've already evaluated all concepts
  if (conceptIndex >= concepts.length) {
    const allChecked = concepts.map(c => c.name);
    return {
      message: "You've already demonstrated understanding of all foundational concepts. Ready for Phase 2!",
      concept_being_checked: null,
      concept_result: null,
      concepts_checked: allChecked,
      ready: true,
      readiness_summary: 'All concepts checked. Ready to proceed.'
    };
  }

  const currentConcept = concepts[conceptIndex];
  if (!currentConcept) {
    throw new Error('Invalid concept index');
  }

  const isLastConcept = conceptIndex === concepts.length - 1;
  const nextConcept = isLastConcept ? null : concepts[conceptIndex + 1];

  // Evaluate answer using a deterministic prompt
  const evaluatePrompt = buildEvaluatePrompt(
    currentConcept.feynman_question,
    userMessage,
    nextConcept || {},
    isLastConcept
  );

  const evaluation = await callMentorJson({
    systemPrompt: withMentorContext(learnerId, 'Evaluate the student\'s concept answer. Return only valid JSON.'),
    history: [],
    userMessage: evaluatePrompt,
    temperature: 0.2,
    requiredKeys: ['verdict', 'feedback', 'next_message']
  });

  // Record story moments
  if (evaluation.verdict === 'strong') {
    recordMoment(learnerId, 'breakthrough', `Demonstrated solid understanding of "${currentConcept.name}"`, 'domain_readiness');
  } else if (evaluation.verdict === 'confused') {
    recordMoment(learnerId, 'struggle', `Struggled with "${currentConcept.name}" — this is where the learning happens`, 'domain_readiness');
  }
  await detectAndRecordMoments(learnerId, 'domain_readiness', userMessage, evaluation.feedback);

  // Save concept result
  saveIntakeField(learnerId, `concept:${currentConcept.name}`, evaluation.verdict, turn);

  // Build mentor message
  const mentorMessage = `${evaluation.feedback}\n\n${evaluation.next_message}`;
  saveMessage(learnerId, 'domain_readiness', 'mentor', mentorMessage);

  // Check if we're done with all concepts
  const ready = isLastConcept && evaluation.verdict !== 'confused';

  return {
    message: mentorMessage,
    concept_being_checked: currentConcept.name,
    concept_result: evaluation.verdict,
    concepts_checked: concepts.slice(0, conceptIndex + 1).map(c => c.name),
    ready,
    readiness_summary: ready ? 'Ready to read papers.' : `Checking concepts: ${conceptIndex + 1}/${concepts.length}`
  };
}
