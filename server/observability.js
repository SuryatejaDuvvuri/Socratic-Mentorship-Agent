/**
 * Observability Layer — Agent Traces
 *
 * Inspired by Pratik Verma's talk: "Deploy → Observe → Evaluate → Fix"
 * and Adit Abraham: "Evaluate at every pipeline stage, not just end-to-end."
 *
 * Tracks what the agent actually did at each step:
 *   - RAG chunks retrieved per draft (what context shaped the output)
 *   - arxiv searches performed (what literature was found)
 *   - deepening loop iterations (how many times gap needed sharpening)
 *   - specificity gate rejections (what was vague, what was fixed)
 *   - rubric score trajectory (did revisions actually improve the score?)
 *   - figures generated (what visuals were produced)
 *   - adversarial questions (what reviewer challenges were raised)
 *
 * This is NOT for the student's UI (initially). It's for the flywheel:
 * over many sessions, this data reveals which prompts need tuning,
 * which corpus sections are never retrieved, and which student inputs
 * consistently produce vague outputs.
 */

import { getDb } from './db.js';

function trace(learnerId, phase, eventType, payload) {
  try {
    getDb()
      .prepare('INSERT INTO agent_traces (learner_id, phase, event_type, payload) VALUES (?, ?, ?, ?)')
      .run(learnerId, phase, eventType, JSON.stringify(payload));
  } catch (e) {
    // Tracing must never break the main flow
    console.warn('[trace] failed to write trace:', e.message);
  }
}

// ── Specific trace helpers ────────────────────────────────────────────────────

export function traceRagRetrieval(learnerId, phase, { query, chunksRetrieved, topSources }) {
  trace(learnerId, phase, 'rag_retrieval', { query, chunksRetrieved, topSources });
}

export function traceArxivSearch(learnerId, { query, resultsFound, rateLimited }) {
  trace(learnerId, 'literature', 'arxiv_search', { query, resultsFound, rateLimited });
}

export function traceDeepeningIteration(learnerId, { iteration, claimsProcessed, statuses, finalGap }) {
  trace(learnerId, 'deepening', 'deepening_iteration', { iteration, claimsProcessed, statuses, finalGap });
}

export function traceSpecificityGateRejection(learnerId, { fields, failedFields, feedback }) {
  trace(learnerId, 'specificity', 'gate_rejection', { fields, failedFields, feedback });
}

export function traceRubricScore(learnerId, { totalProjected, totalMax, weakCriteria, missingCriteria }) {
  trace(learnerId, 'rubric', 'rubric_score', { totalProjected, totalMax, weakCriteria, missingCriteria });
}

export function traceFigureGenerated(learnerId, { figureType, title, sectionPlacement }) {
  trace(learnerId, 'draft', 'figure_generated', { figureType, title, sectionPlacement });
}

export function traceAdversarialReview(learnerId, { questionCount, questionTypes, hardestQuestion }) {
  trace(learnerId, 'adversarial_review', 'adversarial_questions', { questionCount, questionTypes, hardestQuestion });
}

export function tracePaperImport(learnerId, { title, chunks, pages }) {
  trace(learnerId, 'literature', 'paper_imported', { title, chunks, pages });
}

export function traceAssistantRun(learnerId, { question, steps, toolsUsed, cacheHits, durationMs }) {
  trace(learnerId || 'anonymous', 'assistant', 'assistant_run', { question, steps, toolsUsed, cacheHits, durationMs });
}

// ── Query helpers ─────────────────────────────────────────────────────────────

export function getTraces(learnerId, { eventType = null, limit = 50 } = {}) {
  const db = getDb();
  if (eventType) {
    return db
      .prepare('SELECT * FROM agent_traces WHERE learner_id = ? AND event_type = ? ORDER BY id DESC LIMIT ?')
      .all(learnerId, eventType, limit)
      .map(r => ({ ...r, payload: JSON.parse(r.payload || '{}') }));
  }
  return db
    .prepare('SELECT * FROM agent_traces WHERE learner_id = ? ORDER BY id DESC LIMIT ?')
    .all(learnerId, limit)
    .map(r => ({ ...r, payload: JSON.parse(r.payload || '{}') }));
}

export function getSessionSummary(learnerId) {
  const db = getDb();
  const traces = db
    .prepare('SELECT event_type, payload FROM agent_traces WHERE learner_id = ? ORDER BY id')
    .all(learnerId)
    .map(r => ({ type: r.event_type, data: JSON.parse(r.payload || '{}') }));

  const deepeningIterations = traces.filter(t => t.type === 'deepening_iteration').length;
  const gateRejections = traces.filter(t => t.type === 'gate_rejection').length;
  const rubricScores = traces.filter(t => t.type === 'rubric_score').map(t => t.data.totalProjected);
  const papersImported = traces.filter(t => t.type === 'paper_imported').length;
  const figuresGenerated = traces.filter(t => t.type === 'figure_generated').length;
  const arxivSearches = traces.filter(t => t.type === 'arxiv_search');
  const rateLimitedSearches = arxivSearches.filter(t => t.data.rateLimited).length;

  // Assistant (ReAct) workflow metrics: how good/bad is the agentic layer?
  const assistantRuns = traces.filter(t => t.type === 'assistant_run');
  const assistantMetrics = assistantRuns.length
    ? {
        runs: assistantRuns.length,
        avgSteps: +(assistantRuns.reduce((s, t) => s + (t.data.steps || 0), 0) / assistantRuns.length).toFixed(1),
        avgDurationMs: Math.round(assistantRuns.reduce((s, t) => s + (t.data.durationMs || 0), 0) / assistantRuns.length),
        toolUsage: assistantRuns.flatMap(t => t.data.toolsUsed || []).reduce((acc, tool) => {
          acc[tool] = (acc[tool] || 0) + 1;
          return acc;
        }, {}),
        definitionCacheHits: assistantRuns.reduce((s, t) => s + (t.data.cacheHits || 0), 0)
      }
    : null;

  return {
    assistant: assistantMetrics,
    deepeningIterations,
    gateRejections,
    rubricScoreTrajectory: rubricScores,
    rubricImprovement: rubricScores.length > 1
      ? rubricScores[rubricScores.length - 1] - rubricScores[0]
      : null,
    papersImported,
    figuresGenerated,
    totalArxivSearches: arxivSearches.length,
    rateLimitedSearches,
    ragRetrievals: traces.filter(t => t.type === 'rag_retrieval').length
  };
}
