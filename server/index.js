import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import multer from 'multer';
import { proposalLatexToPdf } from './pdfExport.js';
import { answerAgentQuestion, generateProposal, startAgentSession } from './proposalGenerator.js';
import { createLearner, getLearnerState } from './learnerMemory.js';
import { identifyConcepts, domainReadinessTurn } from './agents/domainReadiness.js';
import { fetchAndSummarizePapers, literatureDiscoveryTurn } from './agents/literatureDiscovery.js';
import { draftSection, draftAllSections, draftRevisionTurn } from './agents/proposalDraft.js';
import { runRubricCheck } from './agents/rubricCheck.js';
import { validateGap, assessGapQuality } from './agents/gapValidation.js';
import { deepenGap } from './agents/gapDeepening.js';
import { generateHypotheses, saveStudentHypotheses } from './agents/hypothesisGeneration.js';
import { evaluateSpecificity } from './agents/specificityGate.js';
import { runAdversarialReview, saveDefenseAnswer } from './agents/adversarialReview.js';
import { suggestFigures, generateTikzFigure } from './agents/figureGeneration.js';
import { getHypotheses, getSpecificity } from './learnerMemory.js';
import { importPaperFromBuffer, getImportedPaperCount } from './paperImport.js';
import { getTraces, getSessionSummary } from './observability.js';
import { getStory, buildMentorContext } from './mentorPersona.js';
import { generateLatex, generatePrintHtml } from './proposalExport.js';
import { composeProposalLatex, repairProposalLatex } from './agents/proposalCompose.js';
import { runAssistant } from './agents/researchAssistant.js';
import { getDb } from './db.js';

// Multer — memory storage for PDF uploads (no disk writes)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const app = express();
const port = Number(process.env.PORT || 8787);

app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: '2mb' }));

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: process.env.GROQ_API_KEY ? 'api-ready' : 'no-key' });
});

// ─── Legacy starter routes (kept so nothing breaks) ───────────────────────────

app.post('/api/agent/start', async (req, res) => {
  try {
    if (!String(req.body?.topic || '').trim()) return res.status(400).json({ error: 'Topic is required.' });
    res.json(await startAgentSession(req.body));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/agent/answer', async (req, res) => {
  try {
    if (!String(req.body?.answer || '').trim()) return res.status(400).json({ error: 'Answer is required.' });
    res.json(await answerAgentQuestion(req.body));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/proposal', async (req, res) => {
  try {
    if (!String(req.body?.topic || '').trim()) return res.status(400).json({ error: 'Topic is required.' });
    res.json(await generateProposal(req.body));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/export/pdf', async (req, res) => {
  try {
    const latex = String(req.body?.proposalLatex || '').trim();
    if (!latex) return res.status(400).json({ error: 'proposalLatex is required.' });
    const pdf = await proposalLatexToPdf(latex, String(req.body?.title || 'proposal'));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="proposal.pdf"');
    res.send(pdf);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Mentorship: Session ──────────────────────────────────────────────────────

// POST /api/mentor/session — create new learner
app.post('/api/mentor/session', (_req, res) => {
  try {
    res.json({ learnerId: createLearner() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/mentor/session/:id — load full state (for resume)
app.get('/api/mentor/session/:learnerId', (req, res) => {
  try {
    res.json(getLearnerState(req.params.learnerId));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Phase 1: Domain Readiness ────────────────────────────────────────────────

// POST /api/mentor/phase1/concepts — identify prereq concepts for a domain
app.post('/api/mentor/phase1/concepts', async (req, res) => {
  try {
    const { domain } = req.body || {};
    if (!domain) return res.status(400).json({ error: 'domain is required.' });
    const concepts = await identifyConcepts(domain);
    res.json({ concepts });
  } catch (e) {
    console.error('[phase1/concepts]', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/mentor/phase1/turn — one turn of Feynman Q&A
app.post('/api/mentor/phase1/turn', async (req, res) => {
  try {
    const { learnerId, message, turn = 0, concepts = [], conceptIndex = 0 } = req.body || {};
    if (!learnerId) return res.status(400).json({ error: 'learnerId is required.' });
    if (!message) return res.status(400).json({ error: 'message is required.' });
    res.json(await domainReadinessTurn(learnerId, message, turn, concepts, conceptIndex));
  } catch (e) {
    console.error('[phase1/turn]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Phase 2: Literature Discovery ───────────────────────────────────────────

// POST /api/mentor/phase2/papers — fetch + summarize arxiv papers
app.post('/api/mentor/phase2/papers', async (req, res) => {
  try {
    const { learnerId, domain, query } = req.body || {};
    if (!learnerId) return res.status(400).json({ error: 'learnerId is required.' });
    if (!domain) return res.status(400).json({ error: 'domain is required.' });
    const papers = await fetchAndSummarizePapers(learnerId, domain, query);
    res.json({ papers });
  } catch (e) {
    console.error('[phase2/papers]', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/mentor/phase2/turn — Socratic gap discovery turn
app.post('/api/mentor/phase2/turn', async (req, res) => {
  try {
    const { learnerId, message, turn = 0 } = req.body || {};
    if (!learnerId) return res.status(400).json({ error: 'learnerId is required.' });
    if (!message) return res.status(400).json({ error: 'message is required.' });
    res.json(await literatureDiscoveryTurn(learnerId, message, turn));
  } catch (e) {
    console.error('[phase2/turn]', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/mentor/phase2/validate — novelty check: is the gap actually open?
app.post('/api/mentor/phase2/validate', async (req, res) => {
  try {
    const { learnerId } = req.body || {};
    if (!learnerId) return res.status(400).json({ error: 'learnerId is required.' });
    res.json(await validateGap(learnerId));
  } catch (e) {
    console.error('[phase2/validate]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Gap deepening loop (between Phase 2 and Phase 3) ─────────────────────────

// POST /api/mentor/gap/deepen — iteratively sharpen gap against real evidence
app.post('/api/mentor/gap/deepen', async (req, res) => {
  try {
    const { learnerId } = req.body || {};
    if (!learnerId) return res.status(400).json({ error: 'learnerId is required.' });
    res.json(await deepenGap(learnerId));
  } catch (e) {
    console.error('[gap/deepen]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Stage 2: Hypothesis Generation (between Phase 2 and Phase 3) ─────────────

// POST /api/mentor/hypotheses/generate — agent proposes H1/H2/H3 for the gap
app.post('/api/mentor/hypotheses/generate', async (req, res) => {
  try {
    const { learnerId } = req.body || {};
    if (!learnerId) return res.status(400).json({ error: 'learnerId is required.' });
    res.json(await generateHypotheses(learnerId));
  } catch (e) {
    console.error('[hypotheses/generate]', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/mentor/hypotheses/commit — student saves their (possibly edited) H1/H2/H3
app.post('/api/mentor/hypotheses/commit', async (req, res) => {
  try {
    const { learnerId, h1, h2, h3 } = req.body || {};
    if (!learnerId) return res.status(400).json({ error: 'learnerId is required.' });
    res.json(await saveStudentHypotheses(learnerId, { h1, h2, h3 }));
  } catch (e) {
    console.error('[hypotheses/commit]', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/mentor/hypotheses/:learnerId — fetch committed hypotheses
app.get('/api/mentor/hypotheses/:learnerId', (req, res) => {
  try {
    res.json(getHypotheses(req.params.learnerId) || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Stage 2: Specificity Gate (must pass before Phase 3 unlocks) ─────────────

// POST /api/mentor/specificity/check — judge the student's four answers
app.post('/api/mentor/specificity/check', async (req, res) => {
  try {
    const { learnerId, dataset_name, sample_size, named_instruments, prior_reference } = req.body || {};
    if (!learnerId) return res.status(400).json({ error: 'learnerId is required.' });
    res.json(await evaluateSpecificity(learnerId, {
      dataset_name, sample_size, named_instruments, prior_reference
    }));
  } catch (e) {
    console.error('[specificity/check]', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/mentor/specificity/:learnerId — fetch current gate state
app.get('/api/mentor/specificity/:learnerId', (req, res) => {
  try {
    res.json(getSpecificity(req.params.learnerId) || { passed: 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Phase 3: Proposal Drafting ───────────────────────────────────────────────

// POST /api/mentor/phase3/draft — draft a single section
app.post('/api/mentor/phase3/draft', async (req, res) => {
  try {
    const { learnerId, section = 'motivation' } = req.body || {};
    if (!learnerId) return res.status(400).json({ error: 'learnerId is required.' });
    res.json(await draftSection(learnerId, section));
  } catch (e) {
    console.error('[phase3/draft]', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/mentor/phase3/draft-all — draft ALL sections in parallel
app.post('/api/mentor/phase3/draft-all', async (req, res) => {
  try {
    const { learnerId } = req.body || {};
    if (!learnerId) return res.status(400).json({ error: 'learnerId is required.' });
    res.json(await draftAllSections(learnerId));
  } catch (e) {
    console.error('[phase3/draft-all]', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/mentor/phase3/turn — revision turn on a section
app.post('/api/mentor/phase3/turn', async (req, res) => {
  try {
    const { learnerId, section = 'motivation', message } = req.body || {};
    if (!learnerId) return res.status(400).json({ error: 'learnerId is required.' });
    if (!message) return res.status(400).json({ error: 'message is required.' });
    res.json(await draftRevisionTurn(learnerId, section, message));
  } catch (e) {
    console.error('[phase3/turn]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Phase 4: Rubric Check ────────────────────────────────────────────────────

// POST /api/mentor/phase4/check — run rubric check on current proposal state
app.post('/api/mentor/phase4/check', async (req, res) => {
  try {
    const { learnerId } = req.body || {};
    if (!learnerId) return res.status(400).json({ error: 'learnerId is required.' });
    res.json(await runRubricCheck(learnerId));
  } catch (e) {
    console.error('[phase4/check]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Paper Import (PDF upload) ────────────────────────────────────────────────

// POST /api/mentor/papers/import — upload a PDF, extract, embed, store
app.post('/api/mentor/papers/import', upload.single('pdf'), async (req, res) => {
  try {
    const { learnerId } = req.body || {};
    if (!learnerId) return res.status(400).json({ error: 'learnerId is required.' });
    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded. Use form-data key "pdf".' });

    const result = await importPaperFromBuffer(learnerId, req.file.buffer, req.file.originalname);
    res.json(result);
  } catch (e) {
    console.error('[papers/import]', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/mentor/papers/imported/:learnerId — how many imported papers
app.get('/api/mentor/papers/imported/:learnerId', (req, res) => {
  try {
    res.json({ count: getImportedPaperCount(req.params.learnerId) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Adversarial Reviewer ─────────────────────────────────────────────────────

// POST /api/mentor/review/adversarial — run skeptical reviewer, get questions
app.post('/api/mentor/review/adversarial', async (req, res) => {
  try {
    const { learnerId } = req.body || {};
    if (!learnerId) return res.status(400).json({ error: 'learnerId is required.' });
    res.json(await runAdversarialReview(learnerId));
  } catch (e) {
    console.error('[review/adversarial]', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/mentor/review/defend — save student's answer to one reviewer question
app.post('/api/mentor/review/defend', async (req, res) => {
  try {
    const { learnerId, questionIndex, answer } = req.body || {};
    if (!learnerId) return res.status(400).json({ error: 'learnerId is required.' });
    if (answer == null) return res.status(400).json({ error: 'answer is required.' });
    res.json(await saveDefenseAnswer(learnerId, questionIndex ?? 0, answer));
  } catch (e) {
    console.error('[review/defend]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Figure Generation ────────────────────────────────────────────────────────

// POST /api/mentor/figures/suggest — agent suggests which figures are needed
app.post('/api/mentor/figures/suggest', async (req, res) => {
  try {
    const { learnerId } = req.body || {};
    if (!learnerId) return res.status(400).json({ error: 'learnerId is required.' });
    res.json(await suggestFigures(learnerId));
  } catch (e) {
    console.error('[figures/suggest]', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/mentor/figures/generate — generate TikZ from student's description
app.post('/api/mentor/figures/generate', async (req, res) => {
  try {
    const { learnerId, figureType, description, title, sectionContext } = req.body || {};
    if (!learnerId) return res.status(400).json({ error: 'learnerId is required.' });
    if (!description?.trim()) return res.status(400).json({ error: 'description is required.' });
    res.json(await generateTikzFigure(learnerId, { figureType, description, title, sectionContext }));
  } catch (e) {
    console.error('[figures/generate]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Version History (VCS for drafts) ────────────────────────────────────────

// GET /api/mentor/versions/:learnerId/:sectionName — all versions of a section
app.get('/api/mentor/versions/:learnerId/:sectionName', (req, res) => {
  try {
    const { learnerId, sectionName } = req.params;
    const versions = getDb()
      .prepare(`SELECT id, version, content, agent_strong, agent_weak, agent_confused, updated_at
                FROM proposal_sections
                WHERE learner_id = ? AND section_name = ?
                ORDER BY version ASC`)
      .all(learnerId, sectionName);
    res.json({ versions });
  } catch (e) {
    console.error('[versions]', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/mentor/versions/revert — revert a section to a specific version
app.post('/api/mentor/versions/revert', async (req, res) => {
  try {
    const { learnerId, sectionName, targetVersion } = req.body || {};
    if (!learnerId || !sectionName || targetVersion == null) {
      return res.status(400).json({ error: 'learnerId, sectionName, targetVersion required.' });
    }

    const target = getDb()
      .prepare('SELECT * FROM proposal_sections WHERE learner_id = ? AND section_name = ? AND version = ?')
      .get(learnerId, sectionName, targetVersion);

    if (!target) return res.status(404).json({ error: `Version ${targetVersion} not found.` });

    // Get current max version and insert as new latest
    const maxV = getDb()
      .prepare('SELECT MAX(version) AS v FROM proposal_sections WHERE learner_id = ? AND section_name = ?')
      .get(learnerId, sectionName)?.v ?? 0;

    getDb()
      .prepare(`INSERT INTO proposal_sections (learner_id, section_name, content, version, agent_strong, agent_weak, agent_confused)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(learnerId, sectionName, target.content, maxV + 1, target.agent_strong, target.agent_weak, target.agent_confused);

    res.json({ reverted_to: targetVersion, new_version: maxV + 1 });
  } catch (e) {
    console.error('[versions/revert]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Mentor Story / Journey ────────────────────────────────────────────────

// GET /api/mentor/story/:learnerId — the student's journey as the mentor remembers it
app.get('/api/mentor/story/:learnerId', (req, res) => {
  try {
    const story = getStory(req.params.learnerId);
    res.json({ moments: story });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Research Assistant (ReAct agent over tools) ────────────────────────────

// POST /api/mentor/assistant — agentic Q&A: the agent decides whether to use
// rag_search (distilled corpus facts), define_term (cached), or paper_search.
app.post('/api/mentor/assistant', async (req, res) => {
  try {
    const { learnerId, question, allowedTools } = req.body || {};
    if (!question || !String(question).trim()) {
      return res.status(400).json({ error: 'question is required.' });
    }
    // Guardrail: question length cap — keeps tool inputs and prompts bounded.
    const q = String(question).slice(0, 1000);
    const result = await runAssistant(q, {
      learnerId,
      ...(Array.isArray(allowedTools) && allowedTools.length ? { allowedTools } : {})
    });
    res.json(result);
  } catch (e) {
    console.error('[assistant]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Observability ────────────────────────────────────────────────────────────

// GET /api/mentor/traces/:learnerId — full trace log
app.get('/api/mentor/traces/:learnerId', (req, res) => {
  try {
    const { eventType } = req.query;
    res.json(getTraces(req.params.learnerId, { eventType, limit: 100 }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/mentor/traces/:learnerId/summary — session flywheel summary
app.get('/api/mentor/traces/:learnerId/summary', (req, res) => {
  try {
    res.json(getSessionSummary(req.params.learnerId));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Export: LaTeX + PDF ─────────────────────────────────────────────────────

// Starter-style export: LLM composes the complete proposal.tex in one call
// (coherent prose + native TikZ figure), falling back to the template
// assembler if the model is unavailable.
async function buildProposalLatex(learnerId, { force = false } = {}) {
  try {
    return await composeProposalLatex(learnerId, { force });
  } catch (e) {
    console.warn('[export] LLM composition failed, using template assembler:', e.message);
    return generateLatex(learnerId);
  }
}

// GET /api/mentor/export/latex — download .tex source (?force=1 to recompose)
app.get('/api/mentor/export/latex/:learnerId', async (req, res) => {
  try {
    const latex = await buildProposalLatex(req.params.learnerId, { force: req.query.force === '1' });
    res.setHeader('Content-Type', 'application/x-latex');
    res.setHeader('Content-Disposition', 'attachment; filename="proposal.tex"');
    res.send(latex);
  } catch (e) {
    console.error('[export/latex]', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/mentor/export/pdf/:learnerId — compile LaTeX to PDF via tectonic
// Chain: compose → compile; compile error → LLM repair → compile;
//        composition unavailable → template assembler → compile; → HTML fallback
app.get('/api/mentor/export/pdf/:learnerId', async (req, res) => {
  try {
    const latex = await buildProposalLatex(req.params.learnerId, { force: req.query.force === '1' });
    let pdf;
    try {
      pdf = await proposalLatexToPdf(latex, 'proposal');
    } catch (compileErr) {
      console.warn('[export/pdf] compile failed, attempting LLM repair:', compileErr.message);
      const repaired = await repairProposalLatex(req.params.learnerId, latex, compileErr.message);
      pdf = await proposalLatexToPdf(repaired, 'proposal');
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="proposal.pdf"');
    res.send(pdf);
  } catch (e) {
    console.error('[export/pdf]', e);
    // Fallback to print-ready HTML if everything else fails
    try {
      console.warn('[export/pdf] falling back to print-ready HTML');
      const html = generatePrintHtml(req.params.learnerId);
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (e2) {
      res.status(500).json({ error: e.message });
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────

app.listen(port, () => {
  console.log(`[server] listening on http://127.0.0.1:${port}`);
});
