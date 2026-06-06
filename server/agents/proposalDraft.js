/**
 * Phase 3 — Collaborative Proposal Drafting
 *
 * Goal: Draft proposal sections with self-critique. User owns every decision.
 * For Stage 1 demo: focus on Motivation section first.
 *
 * Per section:
 *   1. Agent drafts
 *   2. Agent critiques own draft (strong / weak / confused)
 *   3. User accepts / edits / rejects framing
 *   4. Section gate: "Could you defend this to your professor?"
 */

import { callMentorJson } from '../tools/gemini.js';
import { saveMessage, getConversation, saveSection, getLatestSection, getHypothesis, getPapers, getIntake } from '../learnerMemory.js';
import { retrieveGrounding } from '../rag/retrieve.js';

// Which corpus topics matter most for each section (soft retrieval boost).
const SECTION_TAGS = {
  motivation: ['motivation', 'broader-impacts'],
  method:     ['method', 'novelty'],
  novelty:    ['novelty', 'gap'],
  evaluation: ['evaluation'],
  risks:      ['method', 'evaluation'],
};

// A query per section so retrieval pulls the right standard.
const SECTION_QUERY = {
  motivation: 'what makes a strong motivation and problem framing in a research proposal',
  method:     'what makes a strong method and workflow section, specificity and reproducibility',
  novelty:    'how to establish novelty and relation to prior work, defensible research gap',
  evaluation: 'how to write a strong evaluation plan with metrics, baselines, success criteria',
  risks:      'feasibility, milestones, risks, and mitigations in a research proposal',
};

const DRAFT_SYSTEM_PROMPT = `You are a research mentor drafting a proposal section WITH the student, not FOR them. You draft it, then you honestly critique your own draft. The student will accept, edit, or reject.

You are given GROUNDING: excerpts from authoritative proposal-writing standards (NSF merit review criteria, a proposal-writing guide, and the course rubric). You MUST hold your draft and your critique to these standards, and you MUST reference them. When you judge the draft as strong or weak, tie the judgment to a specific grounding excerpt by its bracket number, e.g. "[2] requires a falsifiable success criterion — this draft has none." Do NOT invent standards from memory; use the grounding provided.

Your self-critique must be honest:
- Strong parts: what is well-grounded, specific, defensible — cite which grounding standard it satisfies
- Weak parts: vague claims, unsupported assertions, weak transitions — name them and cite the standard they fail
- Confusion: where YOU are not sure about the framing, the claim, the approach

Write the section at proposal quality — not a placeholder. Apply the grounded standards:
- Concrete problem with a named stakeholder
- Specific gap not "AI can help"
- Claims connected to evidence or marked as assumptions

Always respond with this JSON:
{
  "section_name": "motivation | method | novelty | evaluation | risks | resources | abstract",
  "draft": "the full section text at proposal quality",
  "critique": {
    "strong": ["what is well-grounded"],
    "weak": ["what is vague or unsupported — be specific"],
    "confused": ["where you are genuinely unsure about the framing or claim"]
  },
  "defense_question": "one question the professor is most likely to ask about this section",
  "ready_for_next": false
}`;

const INTEGRATE_EDIT_PROMPT = `You are a research mentor. The student has responded to your draft and critique. Integrate their feedback, produce an updated draft, and critique the new version.

Return the same JSON shape as before.`;

export async function draftSection(learnerId, sectionName) {
  const hypothesis = getHypothesis(learnerId);
  const papers = getPapers(learnerId);
  const intake = getIntake(learnerId);

  if (!hypothesis?.gap) {
    throw new Error('No gap hypothesis found. Complete Phase 2 first.');
  }

  const context = buildDraftContext(sectionName, hypothesis, papers, intake);

  // RAG: pull the authoritative standards for THIS section.
  const { context: grounding, chunks } = await retrieveGrounding(
    SECTION_QUERY[sectionName] || `what makes a strong ${sectionName} section in a research proposal`,
    { k: 3, preferTags: SECTION_TAGS[sectionName] || [] }
  );

  const groundingBlock = grounding
    ? `\n\nGROUNDING — authoritative standards you MUST apply and cite by [number]:\n${grounding}`
    : '';

  const result = await callMentorJson({
    systemPrompt: DRAFT_SYSTEM_PROMPT,
    history: [],
    userMessage: `Draft the "${sectionName}" section for this proposal.\n\n${context}${groundingBlock}`,
    temperature: 0.5,
    requiredKeys: ['draft', 'critique']
  });

  const draft = result.draft || '';
  const critique = result.critique || { strong: [], weak: [], confused: [] };

  // Save to DB
  saveSection(learnerId, sectionName, draft, {
    strong: critique.strong?.join('\n'),
    weak: critique.weak?.join('\n'),
    confused: critique.confused?.join('\n')
  });

  // Save to conversation
  const mentorMessage = formatDraftMessage(draft, critique, result.defense_question);
  saveMessage(learnerId, 'draft', 'mentor', mentorMessage);

  return {
    section_name: sectionName,
    draft,
    critique,
    defense_question: result.defense_question || '',
    message: mentorMessage,
    grounded_in: chunks.map(c => ({ source: c.source, title: c.title }))
  };
}

export async function draftRevisionTurn(learnerId, sectionName, userMessage) {
  const history = getConversation(learnerId, 'draft');
  const current = getLatestSection(learnerId, sectionName);
  const hypothesis = getHypothesis(learnerId);

  saveMessage(learnerId, 'draft', 'user', userMessage);

  const context = `Current draft of "${sectionName}":\n${current?.content || ''}\n\nStudent's response: ${userMessage}`;

  const result = await callMentorJson({
    systemPrompt: INTEGRATE_EDIT_PROMPT,
    history,
    userMessage: context,
    temperature: 0.5,
    requiredKeys: ['draft', 'critique']
  });

  const draft = result.draft || current?.content || '';
  const critique = result.critique || { strong: [], weak: [], confused: [] };

  // Save new version
  saveSection(learnerId, sectionName, draft, {
    strong: critique.strong?.join('\n'),
    weak: critique.weak?.join('\n'),
    confused: critique.confused?.join('\n')
  });

  const mentorMessage = formatDraftMessage(draft, critique, result.defense_question);
  saveMessage(learnerId, 'draft', 'mentor', mentorMessage);

  return {
    section_name: sectionName,
    draft,
    critique,
    defense_question: result.defense_question || '',
    message: mentorMessage,
    ready_for_next: result.ready_for_next === true
  };
}

function buildDraftContext(sectionName, hypothesis, papers, intake) {
  return `Research gap: ${hypothesis.gap}
Why it matters: ${hypothesis.why_it_matters}
Student's domain: ${intake.domain || 'not specified'}
Student's background: ${intake.background || 'not specified'}
Papers read: ${papers.slice(0, 4).map(p => `"${p.title}" — ${p.summary}`).join('\n')}
Section to draft: ${sectionName}`;
}

function formatDraftMessage(draft, critique, defenseQuestion) {
  const weakList = critique.weak?.map(w => `  • ${w}`).join('\n') || '  • None identified';
  const strongList = critique.strong?.map(s => `  • ${s}`).join('\n') || '  • None identified';
  const confusedList = critique.confused?.map(c => `  • ${c}`).join('\n') || '  • None';

  return `Here's my draft:\n\n${draft}\n\n---\n**My critique:**\n\n✓ Strong:\n${strongList}\n\n⚠ Weak:\n${weakList}\n\n? Confused:\n${confusedList}\n\n---\n**Professor question you should be ready for:** ${defenseQuestion || 'N/A'}\n\nDoes this framing resonate, or would you change something?`;
}
