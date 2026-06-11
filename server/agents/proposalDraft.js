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

import { callLLMJson as callMentorJson } from '../tools/llm.js';
import { saveMessage, getConversation, saveSection, getLatestSection, getHypothesis, getHypotheses, getSpecificity, getPapers, getIntake } from '../learnerMemory.js';
import { retrieveGrounding } from '../rag/retrieve.js';
import { withMentorContext, recordMoment } from '../mentorPersona.js';

// Which corpus topics matter most for each section (soft retrieval boost).
const SECTION_TAGS = {
  intellectual_merit: ['novelty', 'motivation'],   // Stage 2
  broader_impacts:    ['broader-impacts'],         // Stage 2
  motivation:         ['motivation', 'broader-impacts'],
  method:             ['method', 'novelty'],
  novelty:            ['novelty', 'gap'],
  evaluation:         ['evaluation'],
  risks:              ['method', 'evaluation'],
};

// A query per section so retrieval pulls the right standard.
const SECTION_QUERY = {
  intellectual_merit: 'NSF intellectual merit criterion: what is novel about the approach and how does it advance the field',
  broader_impacts:    'NSF broader impacts criterion: who benefits, two-tier impact, underrepresented groups, institutional impact',
  motivation:         'what makes a strong motivation and problem framing in a research proposal',
  method:             'what makes a strong method and workflow section, specificity and reproducibility',
  novelty:            'how to establish novelty and relation to prior work, defensible research gap',
  evaluation:         'how to write a strong evaluation plan with metrics, baselines, success criteria',
  risks:              'feasibility, milestones, risks, and mitigations in a research proposal',
};

// Stage 2: per-section additional guidance for IM/BI
const SECTION_SPECIAL_GUIDANCE = {
  intellectual_merit:
    `This is an NSF INTELLECTUAL MERIT section. It must answer two questions explicitly:
     (1) What is novel about this approach? — name the specific contribution that no prior work makes.
     (2) Why does this advance the field? — connect to the broader research conversation.
     Reference the testable hypotheses (H1/H2/H3) — IM is strongest when tied to predictions, not promises.`,

  broader_impacts:
    `This is an NSF BROADER IMPACTS section. It MUST have TWO tiers, both labeled:
     (1) GLOBAL impact: how does this benefit the research community or society at large?
     (2) LOCAL impact: who SPECIFICALLY learns or benefits? (name student levels, institutions, underrepresented groups).
     The local tier is non-optional — NSF reviewers explicitly look for it. Be concrete: "undergraduates at UCR", "underrepresented CS students", etc. — not "students" in the abstract.`,
};

const DRAFT_SYSTEM_PROMPT = `You are a research mentor drafting a proposal section WITH the student, not FOR them. You draft it, then you honestly critique your own draft. The student will accept, edit, or reject.

You are given GROUNDING: excerpts from authoritative proposal-writing standards (NSF merit review criteria, a proposal-writing guide, and the course rubric). You MUST hold your draft and your critique to these standards, and you MUST reference them. When you judge the draft as strong or weak, tie the judgment to a specific grounding excerpt by its bracket number, e.g. "[2] requires a falsifiable success criterion — this draft has none." Do NOT invent standards from memory; use the grounding provided.

🚫 ABSOLUTE RULES — violating these makes the draft worthless:
1. NO PLACEHOLDERS. Never write "[1]", "[2]", "X%", "a recent study", "Papers A and B", or any blank to be filled later. You do NOT have citation indices or statistics. If you don't have a real number, do NOT invent a placeholder for one — make the qualitative claim instead ("a meaningful fraction", "many cases") or omit it.
2. CITE PAPERS BY THEIR REAL TITLE ONLY. You are given the actual papers the student read, with titles and abstracts. Refer to them by their exact title (e.g. "Focus-dLLM"). Never refer to a paper you were not given.
3. DO NOT CLAIM WHAT PRIOR WORK "ASSUMES" UNLESS IT IS IN THE ABSTRACT YOU WERE GIVEN. If an abstract doesn't state an assumption, you may NOT assert the paper makes it. No invented relationships. If you're inferring, say "appears to" and flag it in your critique's "confused" list.
4. STAY ON THE STUDENT'S DOMAIN. The proposal must be about the stated research gap and domain. Do NOT drift to unrelated areas (e.g. if the domain is long-horizon RL, do NOT write about code review). If the gap itself seems off-domain, say so in "confused" — do not paper over it.
5. NO ILLOGICAL LEAPS. Every claim must follow from the one before it. If you can't justify a transition, cut it.

Your self-critique must be honest:
- Strong parts: what is well-grounded, specific, defensible — cite which grounding standard it satisfies
- Weak parts: vague claims, unsupported assertions, weak transitions — name them and cite the standard they fail
- Confusion: where YOU are not sure about the framing, the claim, the approach

Write the section at proposal quality. Apply the grounded standards:
- Concrete problem with a named stakeholder
- Specific gap, not "AI can help"
- Every claim either follows from a paper you were given, or is plainly stated as the proposal's own hypothesis

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

  // Stage 2: pull hypotheses + specificity so IM/BI/method drafts can reference them
  const hypotheses = getHypotheses(learnerId);
  const specificity = getSpecificity(learnerId);

  const context = buildDraftContext(sectionName, hypothesis, papers, intake, hypotheses, specificity);

  // RAG: multi-hop retrieval pulls authoritative standards for THIS section.
  const { context: grounding, citations, hops } = await retrieveGrounding(
    SECTION_QUERY[sectionName] || `what makes a strong ${sectionName} section in a research proposal`,
    { k: 3, preferTags: SECTION_TAGS[sectionName] || [], maxHops: 2 }
  );

  const groundingBlock = grounding
    ? `\n\nGROUNDING — authoritative standards you MUST apply. Cite by [RAG-N] tag when you use a standard:\n${grounding}`
    : '';

  // Stage 2: per-section special guidance for IM/BI
  const specialGuidance = SECTION_SPECIAL_GUIDANCE[sectionName]
    ? `\n\nSECTION-SPECIFIC GUIDANCE:\n${SECTION_SPECIAL_GUIDANCE[sectionName]}`
    : '';

  const result = await callMentorJson({
    systemPrompt: withMentorContext(learnerId, DRAFT_SYSTEM_PROMPT),
    history: [],
    userMessage: `Draft the "${sectionName}" section for this proposal.\n\n${context}${groundingBlock}${specialGuidance}`,
    temperature: 0.5,
    requiredKeys: ['draft', 'critique']
  });

  const draft = stripPlaceholders(result.draft || '');
  const critique = result.critique || { strong: [], weak: [], confused: [] };

  // Record the drafting milestone
  recordMoment(learnerId, 'milestone', `Drafted ${sectionName} section (v1)`, 'draft');

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
    grounded_in: citations,
    retrieval_hops: hops
  };
}

// Draft every section at once (parallel). Used by the "generate proposal" button
// so the student gets the whole draft in one shot instead of clicking N times.
// Stage 2: intellectual_merit + broader_impacts are drafted FIRST per MIT CommKit
// annotation ("IM and BI right out of the gate") and NSF reviewer expectation.
const ALL_SECTIONS = ['intellectual_merit', 'broader_impacts', 'motivation', 'method', 'novelty', 'evaluation', 'risks'];

export async function draftAllSections(learnerId) {
  const hypothesis = getHypothesis(learnerId);
  if (!hypothesis?.gap) {
    throw new Error('No gap hypothesis found. Complete Phase 2 first.');
  }

  // Sequential to avoid RPM limits on cloud providers (Cerebras, Groq, etc.)
  const sections = {};
  const failed = [];
  for (const section of ALL_SECTIONS) {
    try {
      sections[section] = await draftSection(learnerId, section);
      await new Promise(r => setTimeout(r, 1000)); // 1s gap between sections
    } catch (err) {
      failed.push({ section, error: err.message || String(err) });
    }
  }

  return { sections, failed };
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

  const draft = stripPlaceholders(result.draft || current?.content || '');
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

function buildDraftContext(sectionName, hypothesis, papers, intake, hypotheses, specificity) {
  const paperList = papers.length
    ? papers.map((p, i) => `  ${i + 1}. "${p.title}"\n     Abstract: ${p.summary}`).join('\n')
    : '  (none)';

  // Evidence chain from the deepening loop — this is the real substance
  const evidenceChain = hypothesis.confidence_note
    ? `\nEVIDENCE CHAIN (claims that were tested against the literature — use this as the backbone of your argument):\n${hypothesis.confidence_note}\n`
    : '';

  // Stage 2: testable hypotheses anchor IM and method/eval drafts
  const hypothesesBlock = (hypotheses?.h1 || hypotheses?.h2 || hypotheses?.h3)
    ? `\nTESTABLE HYPOTHESES (the student has committed to these — every claim must be consistent with them):
- H1 (OUTCOME):   ${hypotheses.h1 || '(not set)'}
- H2 (MECHANISM): ${hypotheses.h2 || '(not set)'}
- H3 (IMPACT):    ${hypotheses.h3 || '(not set)'}
`
    : '';

  // Stage 2: specificity gate anchors method/evaluation in concrete details
  const specificityBlock = (specificity?.passed)
    ? `\nSPECIFICITY-GATE COMMITMENTS (the student has named these — USE these exact terms in the draft, do NOT regress to vague language):
- Dataset:        ${specificity.dataset_name}
- Sample size:    ${specificity.sample_size}
- Instruments:    ${specificity.named_instruments}
- Prior work ref: ${specificity.prior_reference}
`
    : '';

  return `DOMAIN (the proposal MUST stay on this topic): ${intake.domain || 'not specified'}

RESEARCH GAP (what the proposal addresses): ${hypothesis.gap}
WHY IT MATTERS: ${hypothesis.why_it_matters}
${evidenceChain}${hypothesesBlock}${specificityBlock}
THE ONLY PAPERS YOU MAY CITE (use their exact titles, cite nothing else):
${paperList}

Section to draft: ${sectionName}

Reminder: no placeholders ([1], X%, "a study"). Cite only the papers above by title. Do not drift off the domain above.`;
}

// Safety net: strip placeholder artifacts a weak model may still emit.
function stripPlaceholders(text) {
  if (!text) return text;
  return text
    .replace(/\[\d+\]/g, '')                       // [1], [2]
    .replace(/\bX%/g, 'a significant fraction')     // X%
    .replace(/\bPapers?\s+[A-Z]\b/g, 'prior work')  // "Paper A", "Papers A"
    .replace(/\s{2,}/g, ' ')                         // collapse double spaces left behind
    .trim();
}

function formatDraftMessage(draft, critique, defenseQuestion) {
  const weakList  = critique.weak?.length    ? critique.weak.map(w    => `  ⚠ ${w}`).join('\n')  : '  ⚠ None';
  const strongList = critique.strong?.length ? critique.strong.map(s  => `  ✓ ${s}`).join('\n')  : '  ✓ None';
  const confusedList = critique.confused?.length ? critique.confused.map(c => `  ? ${c}`).join('\n') : null;

  const confusedBlock = confusedList ? `\n\n**Genuinely unsure about:**\n${confusedList}` : '';

  return `${draft}

---

**My honest take:**

${strongList}
${weakList}${confusedBlock}

---

🎯 **If your professor asks one thing, it'll be:** *${defenseQuestion || 'Can you defend this claim?'}*

Does this framing work for you, or is something off?`;
}
