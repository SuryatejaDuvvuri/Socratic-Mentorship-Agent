import { getDb } from './db.js';
import { randomUUID } from 'crypto';

// ─── Learner ─────────────────────────────────────────────────────────────────

export function getOrCreateLearner(learnerId) {
  const db = getDb();
  let learner = db.prepare('SELECT * FROM learners WHERE id = ?').get(learnerId);

  if (!learner) {
    const id = learnerId || randomUUID();
    db.prepare('INSERT INTO learners (id) VALUES (?)').run(id);
    learner = db.prepare('SELECT * FROM learners WHERE id = ?').get(id);
  }

  return learner;
}

export function createLearner() {
  const id = randomUUID();
  getOrCreateLearner(id);
  return id;
}

// ─── Intake ──────────────────────────────────────────────────────────────────

export function saveIntakeField(learnerId, field, value, turn = 0) {
  getDb()
    .prepare(
      'INSERT INTO learner_intake (learner_id, field, value, turn) VALUES (?, ?, ?, ?)'
    )
    .run(learnerId, field, value, turn);
}

export function getIntake(learnerId) {
  const rows = getDb()
    .prepare('SELECT field, value, turn FROM learner_intake WHERE learner_id = ? ORDER BY id')
    .all(learnerId);

  // Collapse into an object, last value wins per field
  const intake = {};
  for (const row of rows) {
    intake[row.field] = row.value;
  }
  return intake;
}

export function getAllIntakeRows(learnerId) {
  return getDb()
    .prepare('SELECT * FROM learner_intake WHERE learner_id = ? ORDER BY id')
    .all(learnerId);
}

// ─── Conversation ─────────────────────────────────────────────────────────────

export function saveMessage(learnerId, phase, role, content) {
  getDb()
    .prepare(
      'INSERT INTO conversation (learner_id, phase, role, content) VALUES (?, ?, ?, ?)'
    )
    .run(learnerId, phase, role, content);
}

export function getConversation(learnerId, phase = null) {
  if (phase) {
    return getDb()
      .prepare(
        'SELECT role, content, timestamp FROM conversation WHERE learner_id = ? AND phase = ? ORDER BY id'
      )
      .all(learnerId, phase);
  }
  return getDb()
    .prepare('SELECT phase, role, content, timestamp FROM conversation WHERE learner_id = ? ORDER BY id')
    .all(learnerId);
}

// ─── Papers ───────────────────────────────────────────────────────────────────

export function savePaper(learnerId, paper) {
  getDb()
    .prepare(
      `INSERT INTO learner_papers
        (learner_id, arxiv_id, title, authors, summary, key_insight, gap_identified)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      learnerId,
      paper.arxiv_id || null,
      paper.title,
      paper.authors || null,
      paper.summary || null,
      paper.key_insight || null,
      paper.gap_identified || null
    );
}

export function getPapers(learnerId) {
  return getDb()
    .prepare('SELECT * FROM learner_papers WHERE learner_id = ? ORDER BY id')
    .all(learnerId);
}

export function updatePaperInsight(paperId, keyInsight, gapIdentified) {
  getDb()
    .prepare('UPDATE learner_papers SET key_insight = ?, gap_identified = ? WHERE id = ?')
    .run(keyInsight, gapIdentified, paperId);
}

// ─── Hypothesis ───────────────────────────────────────────────────────────────

export function saveHypothesis(learnerId, { gap, why_it_matters, proposed_approach, confidence_note }) {
  getDb()
    .prepare(
      `INSERT INTO research_hypothesis (learner_id, gap, why_it_matters, proposed_approach, confidence_note)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(learner_id) DO UPDATE SET
         gap = excluded.gap,
         why_it_matters = excluded.why_it_matters,
         proposed_approach = excluded.proposed_approach,
         confidence_note = excluded.confidence_note,
         updated_at = datetime('now')`
    )
    .run(learnerId, gap, why_it_matters, proposed_approach, confidence_note);
}

export function getHypothesis(learnerId) {
  return getDb()
    .prepare('SELECT * FROM research_hypothesis WHERE learner_id = ?')
    .get(learnerId) || null;
}

// ─── Proposal Sections ────────────────────────────────────────────────────────

export function saveSection(learnerId, sectionName, content, critique = {}) {
  const db = getDb();
  const existing = db
    .prepare('SELECT id, version FROM proposal_sections WHERE learner_id = ? AND section_name = ? ORDER BY version DESC LIMIT 1')
    .get(learnerId, sectionName);

  const version = existing ? existing.version + 1 : 1;

  db.prepare(
    `INSERT INTO proposal_sections
      (learner_id, section_name, content, version, agent_strong, agent_weak, agent_confused)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    learnerId,
    sectionName,
    content,
    version,
    critique.strong || null,
    critique.weak || null,
    critique.confused || null
  );
}

export function getLatestSection(learnerId, sectionName) {
  return getDb()
    .prepare(
      'SELECT * FROM proposal_sections WHERE learner_id = ? AND section_name = ? ORDER BY version DESC LIMIT 1'
    )
    .get(learnerId, sectionName) || null;
}

export function getAllSections(learnerId) {
  // Get the latest version of each section
  return getDb()
    .prepare(
      `SELECT * FROM proposal_sections
       WHERE learner_id = ?
       AND (learner_id, section_name, version) IN (
         SELECT learner_id, section_name, MAX(version)
         FROM proposal_sections
         WHERE learner_id = ?
         GROUP BY section_name
       )
       ORDER BY id`
    )
    .all(learnerId, learnerId);
}

// ─── Rubric Checks ────────────────────────────────────────────────────────────

export function saveRubricCheck(learnerId, criterion, maxPoints, projectedPoints, status, evidence, suggestedFix) {
  getDb()
    .prepare(
      `INSERT INTO rubric_checks
        (learner_id, criterion, max_points, projected_points, status, evidence, suggested_fix)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(learnerId, criterion, maxPoints, projectedPoints ?? maxPoints, status, evidence, suggestedFix);
}

export function getLatestRubricChecks(learnerId) {
  return getDb()
    .prepare(
      `SELECT * FROM rubric_checks
       WHERE learner_id = ?
       AND id IN (
         SELECT MAX(id) FROM rubric_checks
         WHERE learner_id = ?
         GROUP BY criterion
       )
       ORDER BY criterion`
    )
    .all(learnerId, learnerId);
}

// ─── Stage 2 — Testable Hypotheses (H1/H2/H3) ────────────────────────────────

export function saveHypotheses(learnerId, { h1, h2, h3, rationale, mentor_note }) {
  getDb()
    .prepare(
      `INSERT INTO research_hypotheses (learner_id, h1, h2, h3, rationale, mentor_note)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(learner_id) DO UPDATE SET
         h1 = excluded.h1,
         h2 = excluded.h2,
         h3 = excluded.h3,
         rationale = excluded.rationale,
         mentor_note = excluded.mentor_note,
         updated_at = datetime('now')`
    )
    .run(learnerId, h1, h2, h3, rationale, mentor_note);
}

export function getHypotheses(learnerId) {
  return getDb()
    .prepare('SELECT * FROM research_hypotheses WHERE learner_id = ?')
    .get(learnerId) || null;
}

// ─── Stage 2 — Specificity Gate ───────────────────────────────────────────────

export function saveSpecificity(learnerId, { dataset_name, sample_size, named_instruments, prior_reference, passed, mentor_feedback }) {
  getDb()
    .prepare(
      `INSERT INTO specificity_gate (learner_id, dataset_name, sample_size, named_instruments, prior_reference, passed, mentor_feedback)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(learner_id) DO UPDATE SET
         dataset_name = excluded.dataset_name,
         sample_size = excluded.sample_size,
         named_instruments = excluded.named_instruments,
         prior_reference = excluded.prior_reference,
         passed = excluded.passed,
         mentor_feedback = excluded.mentor_feedback,
         updated_at = datetime('now')`
    )
    .run(learnerId, dataset_name, sample_size, named_instruments, prior_reference, passed ? 1 : 0, mentor_feedback);
}

export function getSpecificity(learnerId) {
  return getDb()
    .prepare('SELECT * FROM specificity_gate WHERE learner_id = ?')
    .get(learnerId) || null;
}

// ─── Full state snapshot ──────────────────────────────────────────────────────

export function getLearnerState(learnerId) {
  return {
    learner: getOrCreateLearner(learnerId),
    intake: getIntake(learnerId),
    conversation: getConversation(learnerId),
    papers: getPapers(learnerId),
    hypothesis: getHypothesis(learnerId),
    hypotheses: getHypotheses(learnerId),          // Stage 2: H1/H2/H3
    specificity: getSpecificity(learnerId),        // Stage 2: specificity gate
    sections: getAllSections(learnerId),
    rubricChecks: getLatestRubricChecks(learnerId)
  };
}
