import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { proposalLatexToPdf } from './pdfExport.js';
import { answerAgentQuestion, generateProposal, startAgentSession } from './proposalGenerator.js';
import { createLearner, getLearnerState } from './learnerMemory.js';
import { identifyConcepts, domainReadinessTurn } from './agents/domainReadiness.js';
import { fetchAndSummarizePapers, literatureDiscoveryTurn } from './agents/literatureDiscovery.js';
import { draftSection, draftRevisionTurn } from './agents/proposalDraft.js';
import { runRubricCheck } from './agents/rubricCheck.js';
import { validateGap } from './agents/gapValidation.js';

const app = express();
const port = Number(process.env.PORT || 8787);

app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: '2mb' }));

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: process.env.LLM_API_KEY ? 'api-ready' : 'no-key' });
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
    const { learnerId, message, turn = 0, concepts = [] } = req.body || {};
    if (!learnerId) return res.status(400).json({ error: 'learnerId is required.' });
    if (!message) return res.status(400).json({ error: 'message is required.' });
    res.json(await domainReadinessTurn(learnerId, message, turn, concepts));
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

// ─── Phase 3: Proposal Drafting ───────────────────────────────────────────────

// POST /api/mentor/phase3/draft — draft a section
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

// ─────────────────────────────────────────────────────────────────────────────

app.listen(port, () => {
  console.log(`[server] listening on http://127.0.0.1:${port}`);
});
