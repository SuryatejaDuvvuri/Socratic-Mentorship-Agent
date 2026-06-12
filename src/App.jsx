import { useEffect, useRef, useState } from 'react';
import {
  BookOpen, ChevronRight, Download, FileText, History, Image,
  Loader2, Play, RefreshCw, Send, Sparkles, CheckCircle2, AlertCircle, HelpCircle, Search, Upload, Shield
} from 'lucide-react';
import Markdown from './Markdown.jsx';

// ─── Constants ─────────────────────────────────────────────────────────────────

const SESSION_KEY = 'mentor-session-id-v1';

const PHASES = [
  { id: 'entry',  label: 'Start'       },
  { id: 'phase1', label: 'Foundation'  },
  { id: 'phase2', label: 'Literature'  },
  { id: 'stage2', label: 'Hypotheses'  },   // Stage 2: H1/H2/H3 + Specificity Gate
  { id: 'phase3', label: 'Draft'       },
  { id: 'phase4', label: 'Evaluate'    },
];

// Stage 2: IM and BI come first per NSF reviewer expectation
const SECTIONS = ['intellectual_merit', 'broader_impacts', 'motivation', 'method', 'novelty', 'evaluation', 'risks'];

// Pretty labels for sections (IM/BI can't use Title-case of the snake_case key)
const SECTION_LABELS = {
  intellectual_merit: 'Intellectual Merit',
  broader_impacts:    'Broader Impacts',
  motivation:         'Motivation',
  method:             'Method',
  novelty:            'Novelty',
  evaluation:         'Evaluation',
  risks:              'Risks',
};

// ─── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  // Session
  const [learnerId, setLearnerId]   = useState(() => localStorage.getItem(SESSION_KEY));
  const [phase, setPhase]           = useState('entry');

  // Phase 1
  const [domain, setDomain]         = useState('');
  const [concepts, setConcepts]     = useState([]);
  const [conceptIndex, setConceptIndex] = useState(0); // which concept we're currently evaluating
  const [p1Turn, setP1Turn]         = useState(0);
  const [p1Message, setP1Message]   = useState('');
  const [conceptsDone, setConceptsDone] = useState([]);

  // Phase 2
  const [researchIdea, setResearchIdea] = useState('');
  const [papers, setPapers]         = useState([]);
  const [readingDone, setReadingDone] = useState(false);
  const [p2Turn, setP2Turn]         = useState(0);
  const [p2Message, setP2Message]   = useState('');
  const [gapHypothesis, setGapHypothesis] = useState(null);
  const [noveltyCheck, setNoveltyCheck] = useState(null);
  const [deepenResult, setDeepenResult] = useState(null); // deepening loop result

  // Stage 2: Hypothesis generation (H1/H2/H3) + Specificity Gate
  const [hypothesesData, setHypothesesData] = useState(null);     // { h1, h2, h3, rationale, mentor_note }
  const [hypothesesEdits, setHypothesesEdits] = useState({ h1: '', h2: '', h3: '' });
  const [hypothesesCommitted, setHypothesesCommitted] = useState(false);
  const [specFields, setSpecFields] = useState({
    dataset_name: '', sample_size: '', named_instruments: '', prior_reference: ''
  });
  const [specResult, setSpecResult] = useState(null);             // { passed, *_assessment, overall_feedback }

  // Phase 3
  const [activeSection, setActiveSection] = useState('intellectual_merit');
  const [sectionDrafts, setSectionDrafts] = useState({}); // keyed by section name
  const [p3Turn, setP3Turn]         = useState({}); // keyed by section name

  // Convenience getters
  const sectionDraft = sectionDrafts[activeSection] || null;
  const currentTurn = p3Turn[activeSection] ?? 0;

  // Phase 4
  const [rubric, setRubric]         = useState(null);

  // Adversarial review
  const [adversarialReview, setAdversarialReview] = useState(null);
  const [defenseAnswers, setDefenseAnswers] = useState({});
  const [showRubricAfterDefense, setShowRubricAfterDefense] = useState(false);

  // Figure generation
  const [figureSuggestions, setFigureSuggestions] = useState(null);
  const [figureDesc, setFigureDesc] = useState('');
  const [figureType, setFigureType] = useState('pipeline');
  const [generatedFigure, setGeneratedFigure] = useState(null);

  // Version browsing
  const [versionHistory, setVersionHistory] = useState([]);
  const [showVersions, setShowVersions] = useState(false);

  // Paper import
  const fileInputRef = useRef(null);
  const [importedPapers, setImportedPapers] = useState([]);

  // Learner story / journey
  const [story, setStory] = useState([]);

  // Shared
  const [userInput, setUserInput]   = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [runLog, setRunLog]         = useState([]);

  // On mount: stay on entry — resume button handles the rest
  useEffect(() => { setPhase('entry'); }, []);

  // Load story when we have a learnerId
  useEffect(() => {
    if (!learnerId) return;
    get(`/api/mentor/story/${learnerId}`)
      .then(data => setStory(data.moments || []))
      .catch(() => {});
  }, [learnerId, phase]); // Reload on phase change to catch new moments

  async function resumeSession() {
    if (!learnerId) return;
    setLoading(true); setError('');
    try {
      const state = await get(`/api/mentor/session/${learnerId}`);

      // Restore domain
      const d = state.intake?.domain || '';
      setDomain(d);

      // Restore papers
      if (state.papers?.length) {
        setPapers(state.papers.map(p => ({
          arxiv_id: p.arxiv_id,
          title: p.title,
          authors: p.authors,
          summary: p.summary,
          mentor_summary: p.summary,
          url: `https://arxiv.org/abs/${p.arxiv_id}`
        })));
      }

      // Restore hypothesis
      if (state.hypothesis?.gap) {
        setGapHypothesis({
          gap: state.hypothesis.gap,
          why_strong: state.hypothesis.why_it_matters?.split('; ').filter(Boolean) || [],
          confusions: state.hypothesis.confidence_note?.split('; ').filter(Boolean) || []
        });
      }

      // Restore all section drafts (keyed by section name)
      if (state.sections?.length) {
        const draftsMap = {};
        const turnsMap = {};
        let latestSection = null;

        for (const section of state.sections) {
          const sectionName = section.section_name;
          draftsMap[sectionName] = {
            section_name: sectionName,
            draft: section.content,
            critique: {
              strong:   section.agent_strong?.split('\n').filter(Boolean)   || [],
              weak:     section.agent_weak?.split('\n').filter(Boolean)     || [],
              confused: section.agent_confused?.split('\n').filter(Boolean) || []
            },
            defense_question: ''
          };
          turnsMap[sectionName] = section.version || 0;
          latestSection = sectionName;
        }

        setSectionDrafts(draftsMap);
        setP3Turn(turnsMap);
        if (latestSection) setActiveSection(latestSection);
      }

      // Restore rubric — use actual projected_points saved in DB
      if (state.rubricChecks?.length) {
        const checks = state.rubricChecks.map(c => {
          // projected_points may be null in older DB rows — derive from status
          let projected = c.projected_points;
          if (projected == null) {
            if (c.status === 'strong')  projected = c.max_points;
            else if (c.status === 'missing') projected = 0;
            else projected = Math.round(c.max_points * 0.5); // weak
          }
          return {
            criterion: c.criterion,
            max_points: c.max_points,
            projected_points: projected,
            status: c.status,
            evidence: c.evidence,
            fix: c.suggested_fix
          };
        });
        const totalProjected = checks.reduce((s, c) => s + (c.projected_points || 0), 0);
        setRubric({
          checks,
          total_projected: totalProjected,
          total_max: 50,
          priority_fixes: checks.filter(c => c.status !== 'strong').map(c => c.fix).filter(Boolean),
          honest_summary: 'Restored from previous session. Run rubric check again for a fresh score.'
        });
      }

      // Determine which phase to land on
      const conv = state.conversation || [];
      const phases = [...new Set(conv.map(r => r.phase))];
      const lastPhase = phases[phases.length - 1];

      if (lastPhase === 'rubric' || state.rubricChecks?.length) {
        setPhase('phase4');
        log('Resume', `Restored to Phase 4 — rubric check`);
      } else if (lastPhase === 'draft' || state.sections?.length) {
        setPhase('phase3');
        log('Resume', `Restored to Phase 3 — drafting`);
      } else if (lastPhase === 'literature' || state.papers?.length) {
        setPapers(prev => prev); // already set above
        setReadingDone(conv.some(r => r.phase === 'literature' && r.role === 'user'));
        setPhase('phase2');
        log('Resume', `Restored to Phase 2 — literature discovery`);
      } else {
        // Restore Phase 1 state
        const phase1Conv = conv.filter(r => r.phase === 'domain_readiness');
        if (phase1Conv.length > 0) {
          // Get mentor's last message
          const lastMentorMsg = phase1Conv.reverse().find(r => r.role === 'mentor');
          if (lastMentorMsg) setP1Message(lastMentorMsg.content);

          // Get turn count
          setP1Turn(phase1Conv.filter(r => r.role === 'user').length);
        }

        // Restore concepts from intake
        if (state.intake?.concepts) {
          let parsedConcepts = state.intake.concepts;
          if (typeof parsedConcepts === 'string') {
            try { parsedConcepts = JSON.parse(parsedConcepts); } catch { parsedConcepts = []; }
          }
          setConcepts(parsedConcepts);
          // Extract which concepts were checked and restore conceptIndex
          const checked = [];
          for (const key in state.intake) {
            if (key.startsWith('concept:')) {
              checked.push({ name: key.replace('concept:', ''), result: state.intake[key] });
            }
          }
          setConceptsDone(checked);
          setConceptIndex(checked.length);
        }

        setPhase('phase1');
        log('Resume', `Restored to Phase 1 — domain readiness`);
      }

      log('Resume', `Session restored for domain: ${d || 'unknown'}`);
    } catch (e) { setError(`Could not resume session: ${e.message}`); }
    finally { setLoading(false); }
  }

  function log(stage, msg) {
    setRunLog(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, stage, msg }]);
  }

  function resetSession() {
    localStorage.removeItem(SESSION_KEY);
    setLearnerId(null);
    setPhase('entry');
    setDomain(''); setConcepts([]); setP1Turn(0); setP1Message(''); setConceptsDone([]);
    setPapers([]); setReadingDone(false); setP2Turn(0); setP2Message(''); setGapHypothesis(null);
    setSectionDraft(null); setP3Turn(0); setActiveSection('motivation');
    setRubric(null); setUserInput(''); setError(''); setRunLog([]);
  }

  // ── Phase 0 → 1: Start session ─────────────────────────────────────────────

  async function startSession() {
    if (!domain.trim()) return;
    setLoading(true); setError('');
    try {
      // Create learner
      let id = learnerId;
      if (!id) {
        const s = await post('/api/mentor/session', {});
        id = s.learnerId;
        setLearnerId(id);
        localStorage.setItem(SESSION_KEY, id);
      }

      // Identify prereq concepts
      log('Phase 1', `Identifying concepts for: ${domain}`);
      const { concepts: c } = await post('/api/mentor/phase1/concepts', { learnerId: id, domain });
      setConcepts(c);

      // First Feynman turn
      const result = await post('/api/mentor/phase1/turn', {
        learnerId: id, message: domain, turn: 0, concepts: c
      });
      setP1Message(result.message);
      setP1Turn(1);
      setPhase('phase1');
      log('Phase 1', 'Domain readiness check started');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  // ── Phase 1: Feynman Q&A turn ──────────────────────────────────────────────

  async function submitPhase1() {
    if (!userInput.trim()) return;
    setLoading(true); setError('');
    const msg = userInput; setUserInput('');
    try {
      const result = await post('/api/mentor/phase1/turn', {
        learnerId, message: msg, turn: p1Turn, concepts, conceptIndex
      });
      setP1Message(result.message);
      setP1Turn(t => t + 1);

      // Track which concepts have been checked
      if (result.concept_result) {
        setConceptsDone(prev => [...prev, { name: result.concept_being_checked, result: result.concept_result }]);
        // Move to next concept
        setConceptIndex(prev => prev + 1);
      }

      if (result.ready) {
        log('Phase 1', `Foundation check complete: ${result.readiness_summary}`);
      }
      log('Phase 1', `Concept: ${result.concept_being_checked || '—'} → ${result.concept_result || '—'}`);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function moveToPhase2() {
    if (!researchIdea.trim()) return;
    setLoading(true); setError('');
    try {
      log('Phase 2', `Finding papers for: ${researchIdea}`);
      const { papers: p } = await post('/api/mentor/phase2/papers', {
        learnerId, domain, query: researchIdea
      });
      setPapers(p);
      setPhase('phase2');
      log('Phase 2', `Loaded ${p.length} papers from arxiv`);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  // ── Phase 2: Socratic gap discovery ───────────────────────────────────────

  async function submitPhase2() {
    if (!userInput.trim()) return;
    setLoading(true); setError('');
    const msg = userInput; setUserInput('');
    try {
      const result = await post('/api/mentor/phase2/turn', {
        learnerId, message: msg, turn: p2Turn
      });
      setP2Message(result.message);
      setP2Turn(t => t + 1);
      if (result.forming_gap && result.gap_hypothesis) {
        setGapHypothesis(result.gap_hypothesis);
        log('Phase 2', `Gap forming: ${result.gap_hypothesis.gap}`);
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function runNoveltyCheck() {
    setLoading(true); setError('');
    try {
      log('Phase 2', 'Novelty check — searching literature to test the gap...');
      const result = await post('/api/mentor/phase2/validate', { learnerId });
      setNoveltyCheck(result);
      // If the gap was refined, reflect the stronger version in the UI.
      if (result.residual_gap && result.verdict !== 'closed') {
        setGapHypothesis(prev => ({ ...(prev || {}), gap: result.residual_gap }));
      }
      log('Phase 2', `Novelty verdict: ${result.verdict} — ${result.recommendation}`);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function runDeepeningLoop() {
    setLoading(true); setError('');
    try {
      log('Deepening', 'Testing gap claims against real literature...');
      const result = await post('/api/mentor/gap/deepen', { learnerId });
      setDeepenResult(result);
      // Update the gap hypothesis display with the sharpened gap
      if (result.final_gap) {
        setGapHypothesis(prev => ({ ...prev, gap: result.final_gap }));
      }
      log('Deepening', result.ready
        ? `Gap is concrete. Evidence chain: ${result.evidence_chain?.length || 0} claims verified.`
        : `Gap needs more work after ${result.iterations?.length} iterations.`);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  // ── Stage 2: enter hypothesis + specificity gates ─────────────────────────

  async function moveToStage2() {
    setLoading(true); setError('');
    try {
      log('Stage 2', 'Generating testable hypotheses (H1/H2/H3)...');
      const result = await post('/api/mentor/hypotheses/generate', { learnerId });
      setHypothesesData(result);
      setHypothesesEdits({ h1: result.h1 || '', h2: result.h2 || '', h3: result.h3 || '' });
      setPhase('stage2');
      log('Stage 2', 'Hypotheses drafted — review, edit, commit, then pass specificity gate');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function commitHypotheses() {
    setLoading(true); setError('');
    try {
      await post('/api/mentor/hypotheses/commit', {
        learnerId,
        h1: hypothesesEdits.h1,
        h2: hypothesesEdits.h2,
        h3: hypothesesEdits.h3
      });
      setHypothesesCommitted(true);
      log('Stage 2', `Hypotheses committed. Now: pass the specificity gate.`);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function checkSpecificity() {
    setLoading(true); setError('');
    try {
      log('Stage 2', 'Checking specificity gate...');
      const result = await post('/api/mentor/specificity/check', {
        learnerId, ...specFields
      });
      setSpecResult(result);
      log('Stage 2', result.passed
        ? '✓ Specificity gate PASSED. Drafting unlocked.'
        : '✗ Specificity gate failed — sharpen vague fields.');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function moveToPhase3() {
    setLoading(true); setError('');
    try {
      // Draft all sections in parallel
      log('Phase 3', 'Drafting all sections in parallel...');
      const result = await post('/api/mentor/phase3/draft-all', { learnerId });

      const drafts = {};
      const turns = {};
      for (const [name, section] of Object.entries(result.sections || {})) {
        drafts[name] = section;
        turns[name] = 0;
      }
      setSectionDrafts(drafts);
      setP3Turn(turns);
      setActiveSection('intellectual_merit');
      setPhase('phase3');

      const count = Object.keys(drafts).length;
      log('Phase 3', `${count} sections drafted${result.failed?.length ? `, ${result.failed.length} failed` : ''}`);
      if (result.failed?.length) {
        result.failed.forEach(f => log('Phase 3', `⚠ ${f.section} failed: ${f.error}`));
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  // ── Phase 3: Draft revision turns ─────────────────────────────────────────

  async function submitPhase3() {
    if (!userInput.trim()) return;
    setLoading(true); setError('');
    const msg = userInput; setUserInput('');
    try {
      const result = await post('/api/mentor/phase3/turn', {
        learnerId, section: activeSection, message: msg
      });
      setSectionDrafts(prev => ({ ...prev, [activeSection]: result }));
      setP3Turn(prev => ({ ...prev, [activeSection]: (prev[activeSection] ?? 0) + 1 }));
      log('Phase 3', `Section "${activeSection}" revised (v${(p3Turn[activeSection] ?? 0) + 2})`);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function draftNewSection(section) {
    // If section already drafted, just switch to it
    if (sectionDrafts[section]) {
      setActiveSection(section);
      return;
    }

    // Otherwise, draft it
    setLoading(true); setError('');
    try {
      log('Phase 3', `Drafting section: ${section}`);
      const result = await post('/api/mentor/phase3/draft', { learnerId, section });
      setSectionDrafts(prev => ({ ...prev, [section]: result }));
      setP3Turn(prev => ({ ...prev, [section]: 0 }));
      setActiveSection(section);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function downloadLatex(id) {
    try {
      const res = await fetch(`http://localhost:8787/api/mentor/export/latex/${id}`);
      if (!res.ok) throw new Error('Export failed');
      const text = await res.text();
      const blob = new Blob([text], { type: 'application/x-latex' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'proposal.tex';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError(`LaTeX download failed: ${e.message}`); }
  }

  // ── Phase 4: Adversarial Review first, then rubric ────────────────────────

  async function runAdversarialReview() {
    setLoading(true); setError('');
    try {
      log('Review', 'Running adversarial reviewer (skeptical NSF panel)...');
      const result = await post('/api/mentor/review/adversarial', { learnerId });
      setAdversarialReview(result);
      setPhase('phase4');
      setShowRubricAfterDefense(false);
      log('Review', `${result.questions?.length || 0} reviewer questions generated`);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function submitDefenseAnswer(questionIndex) {
    const answer = defenseAnswers[questionIndex];
    if (!answer?.trim()) return;
    try {
      await post('/api/mentor/review/defend', { learnerId, questionIndex, answer });
      log('Review', `Answered Q${questionIndex + 1}`);
    } catch (e) { setError(e.message); }
  }

  async function moveToPhase4() {
    setLoading(true); setError('');
    try {
      log('Phase 4', 'Running rubric check...');
      const result = await post('/api/mentor/phase4/check', { learnerId });
      setRubric(result);
      setShowRubricAfterDefense(true);
      log('Phase 4', `Projected: ${result.total_projected}/${result.total_max}`);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  // ── Figure generation ──────────────────────────────────────────────────────

  async function getFigureSuggestions() {
    setLoading(true); setError('');
    try {
      log('Figures', 'Analyzing proposal for figure needs...');
      const result = await post('/api/mentor/figures/suggest', { learnerId });
      setFigureSuggestions(result);
      log('Figures', `${result.suggestions?.length || 0} figure suggestions`);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function generateFigure() {
    if (!figureDesc.trim()) return;
    setLoading(true); setError('');
    try {
      log('Figures', `Generating TikZ figure: ${figureType}`);
      const result = await post('/api/mentor/figures/generate', {
        learnerId, figureType, description: figureDesc,
        title: `${figureType.replace('_', ' ')} diagram`, sectionContext: activeSection
      });
      setGeneratedFigure(result);
      log('Figures', `✓ TikZ code generated (${result.tikz_code?.length || 0} chars)`);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  // ── Version history ────────────────────────────────────────────────────────

  async function loadVersionHistory(sectionName) {
    try {
      const data = await get(`/api/mentor/versions/${learnerId}/${sectionName}`);
      setVersionHistory(data.versions || []);
      setShowVersions(true);
    } catch (e) { setError(e.message); }
  }

  async function revertToVersion(targetVersion) {
    setLoading(true); setError('');
    try {
      const result = await post('/api/mentor/versions/revert', {
        learnerId, sectionName: activeSection, targetVersion
      });
      log('VCS', `Reverted ${activeSection} to v${targetVersion} → new v${result.new_version}`);
      setShowVersions(false);
      // Reload the section
      await draftNewSection(activeSection);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  // ── Paper import ───────────────────────────────────────────────────────────

  async function handlePaperUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.pdf')) { setError('Only PDF files are supported.'); return; }

    setLoading(true); setError('');
    const formData = new FormData();
    formData.append('pdf', file);
    formData.append('learnerId', learnerId);

    try {
      const res = await fetch('/api/mentor/papers/import', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setImportedPapers(prev => [...prev, data]);
      log('Papers', `Imported "${data.title}" — ${data.chunks} chunks, ${data.pages} pages`);
    } catch (e) { setError(`Import failed: ${e.message}`); }
    finally { setLoading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  }

  // ── Shared: Enter key submits ──────────────────────────────────────────────

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitCurrent(); }
  }

  function submitCurrent() {
    if (phase === 'phase1') return submitPhase1();
    if (phase === 'phase2') return submitPhase2();
    if (phase === 'phase3') return submitPhase3();
  }

  const phaseIndex = PHASES.findIndex(p => p.id === phase);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="app-shell">
      <header className="topbar">
        <h1>Research Mentorship Agent</h1>
        <span className="status-pill">
          <Sparkles size={16} aria-hidden />
          {loading ? 'thinking…' : PHASES.find(p => p.id === phase)?.label ?? 'ready'}
        </span>
        <button className="secondary icon-button" onClick={resetSession} title="Start over">
          <RefreshCw size={16} />
        </button>
      </header>

      {/* Phase stepper */}
      <nav className="phase-stepper" aria-label="Workflow phases">
        {PHASES.map((p, i) => (
          <div key={p.id} className={`phase-step ${i < phaseIndex ? 'done' : ''} ${p.id === phase ? 'active' : ''}`}>
            <span className="phase-dot">{i < phaseIndex ? <CheckCircle2 size={14} /> : i + 1}</span>
            <span className="phase-label">{p.label}</span>
            {i < PHASES.length - 1 && <ChevronRight size={13} className="phase-arrow" />}
          </div>
        ))}
      </nav>

      {error && <p className="error-banner" style={{ margin: '0 24px' }}>{error}</p>}

      <div className="workflow-artifact">

        {/* ── Entry ── */}
        {phase === 'entry' && (
          <div className="phase-panel">
            <div className="mentor-card">
              <h2>What research area do you want to explore?</h2>
              <p className="mentor-sub">
                The more specific the better. E.g. "semantic bug detection in code review" rather than "AI for software engineering."
              </p>
            </div>

            {learnerId && (
              <div className="info-card resume-card">
                <div>
                  <strong>Returning session found.</strong>
                  <p>You have a session in progress. Pick up where you left off, or start a new one below.</p>
                </div>
                <button className="primary" onClick={resumeSession} disabled={loading}>
                  {loading ? <Loader2 className="spin" size={14} /> : null}
                  Resume Session →
                </button>
              </div>
            )}

            <div className="topic-launch">
              <label htmlFor="domain-input">
                Research Domain
                <input
                  id="domain-input"
                  value={domain}
                  onChange={e => setDomain(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && startSession()}
                  placeholder="e.g. code review / semantic bug detection"
                  autoFocus
                />
              </label>
              <div className="actions framework-actions">
                <button className="primary" disabled={!domain.trim() || loading} onClick={startSession}>
                  {loading ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
                  Start Session
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Phase 1: Domain Readiness ── */}
        {phase === 'phase1' && (
          <div className="phase-panel">
            <div className="phase-layout">
              <div className="phase-main">
                <div className="mentor-card">
                  <div className="mentor-label"><BookOpen size={14} /> Mentor</div>
                  <Markdown text={p1Message} />
                </div>

                <div className="respond-area">
                  <textarea
                    value={userInput}
                    onChange={e => setUserInput(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="Answer in your own words — rough is fine…"
                    rows={3}
                    disabled={loading}
                  />
                  <button className="primary" disabled={!userInput.trim() || loading} onClick={submitPhase1}>
                    {loading ? <Loader2 className="spin" size={16} /> : <Send size={16} />}
                    Respond
                  </button>
                </div>
              </div>

              <aside className="phase-sidebar">
                <div className="sidebar-section">
                  <h3>Domain</h3>
                  <p>{domain}</p>
                </div>

                <div className="sidebar-section">
                  <h3>Prereq Concepts</h3>
                  {concepts.map(c => {
                    const checked = conceptsDone.find(d => d.name === c.name);
                    return (
                      <div key={c.name} className="concept-row">
                        <span className={`concept-badge ${checked ? (checked.result === 'strong' ? 'strong' : 'weak') : 'pending'}`}>
                          {checked ? (checked.result === 'strong' ? '✓' : '~') : '○'}
                        </span>
                        <div>
                          <strong>{c.name}</strong>
                          <p>{c.why_needed}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {(concepts.length > 0 && conceptsDone.length === concepts.length) || p1Turn >= 3 ? (
                  <div className="idea-input-section">
                    <p className="idea-prompt">
                      Before we find papers — what's your specific angle?
                      <br />
                      <small>e.g. "splitting large commits into smaller chunks for better reviewability" not just "code review"</small>
                    </p>
                    <textarea
                      value={researchIdea}
                      onChange={e => setResearchIdea(e.target.value)}
                      placeholder="Describe your specific idea or the problem you want to explore..."
                      rows={3}
                      disabled={loading}
                    />
                    <button
                      className="primary"
                      onClick={moveToPhase2}
                      disabled={!researchIdea.trim() || loading}
                    >
                      {loading ? <Loader2 className="spin" size={14} /> : null}
                      Find Relevant Papers →
                    </button>
                  </div>
                ) : null}
              </aside>
            </div>
          </div>
        )}

        {/* ── Phase 2: Literature Discovery ── */}
        {phase === 'phase2' && (
          <div className="phase-panel">
            {!readingDone ? (
              <>
                <div className="mentor-card">
                  <div className="mentor-label"><BookOpen size={14} /> Mentor</div>
                  <p>Here are {papers.length} papers relevant to your domain. Read them, then come back. Focus on: what each one does, what it assumes, and what gap it leaves open.</p>
                </div>

                <div className="papers-grid">
                  {papers.map(p => (
                    <article key={p.arxiv_id} className="paper-card">
                      <div className="paper-header">
                        <h3>{p.title}</h3>
                        <a href={p.url} target="_blank" rel="noreferrer" className="paper-link">arxiv ↗</a>
                      </div>
                      <p className="paper-authors">{p.authors} · {p.published?.slice(0,4)}</p>
                      <p className="paper-summary">{p.mentor_summary || p.summary}</p>
                    </article>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="primary" onClick={() => setReadingDone(true)}>
                    I've read these → Start discussion
                  </button>
                </div>
              </>
            ) : (
              <div className="phase-layout">
                <div className="phase-main">
                  <div className="mentor-card">
                    <div className="mentor-label"><BookOpen size={14} /> Mentor</div>
                    <Markdown text={p2Message || "You've read the papers. Let's start with: what's the common problem all of these papers are trying to solve?"} />
                  </div>

                  <div className="respond-area">
                    <textarea
                      value={userInput}
                      onChange={e => setUserInput(e.target.value)}
                      onKeyDown={handleKey}
                      placeholder="Your thoughts…"
                      rows={3}
                      disabled={loading}
                    />
                    <button className="primary" disabled={!userInput.trim() || loading} onClick={submitPhase2}>
                      {loading ? <Loader2 className="spin" size={16} /> : <Send size={16} />}
                      Respond
                    </button>
                  </div>
                </div>

                <aside className="phase-sidebar">
                  {/* Paper import */}
                  <div className="sidebar-section">
                    <h3>Import your own papers</h3>
                    <p style={{ fontSize: '0.78rem', color: '#555', marginBottom: 6 }}>
                      Upload PDFs your advisor recommended that didn't appear in arxiv search.
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf"
                      style={{ display: 'none' }}
                      onChange={handlePaperUpload}
                    />
                    <button
                      className="secondary"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={loading || !learnerId}
                      style={{ width: '100%', marginBottom: 6 }}
                    >
                      {loading ? <Loader2 className="spin" size={13} /> : <Upload size={13} />}
                      Upload PDF
                    </button>
                    {importedPapers.map((p, i) => (
                      <p key={i} style={{ fontSize: '0.78rem', color: '#1a5e3f' }}>
                        ✓ {p.title?.slice(0, 40)} ({p.chunks} chunks)
                      </p>
                    ))}
                  </div>

                  <div className="sidebar-section">
                    <h3>Papers read</h3>
                    {papers.map(p => (
                      <p key={p.arxiv_id} className="sidebar-paper">· {p.title}</p>
                    ))}
                  </div>

                  {gapHypothesis && (
                    <div className="gap-card">
                      <h3>Gap forming…</h3>
                      <p className="gap-statement">{gapHypothesis.gap}</p>
                      {gapHypothesis.confusions?.length > 0 && (
                        <>
                          <p className="gap-label">Where I'm confused:</p>
                          <ul>{gapHypothesis.confusions.map((c, i) => <li key={i}>{c}</li>)}</ul>
                        </>
                      )}

                      {/* Novelty check — test the gap against the literature */}
                      {!noveltyCheck ? (
                        <button className="secondary" onClick={runNoveltyCheck} disabled={loading} style={{ marginTop: 8 }}>
                          {loading ? <Loader2 className="spin" size={14} /> : <Search size={14} />}
                          Is this gap actually open? Check the literature
                        </button>
                      ) : (
                        <div className={`novelty-result novelty-${noveltyCheck.verdict}`}>
                          <p className="novelty-verdict">
                            Verdict: <strong>{noveltyCheck.verdict}</strong> · {noveltyCheck.recommendation}
                          </p>
                          <p className="novelty-note">{noveltyCheck.honest_note}</p>
                          {noveltyCheck.closest_prior_work?.length > 0 && (
                            <>
                              <p className="gap-label">Closest prior work found:</p>
                              <ul>
                                {noveltyCheck.closest_prior_work.map((w, i) => (
                                  <li key={i}>
                                    <strong>{w.title}</strong>
                                    {w.stops_short_because ? ` — stops short: ${w.stops_short_because}` : ' — appears to cover this'}
                                  </li>
                                ))}
                              </ul>
                            </>
                          )}
                          <button className="secondary" onClick={runNoveltyCheck} disabled={loading} style={{ marginTop: 6 }}>
                            {loading ? <Loader2 className="spin" size={13} /> : <RefreshCw size={13} />}
                            Re-check
                          </button>
                        </div>
                      )}

                      {/* Deepening loop — sharpen gap before drafting */}
                      {!deepenResult ? (
                        <button className="secondary" onClick={runDeepeningLoop} disabled={loading} style={{ marginTop: 8 }}>
                          {loading ? <Loader2 className="spin" size={14} /> : <Search size={14} />}
                          Deepen gap → test claims against literature
                        </button>
                      ) : (
                        <div className={`novelty-result novelty-${deepenResult.ready ? 'open' : 'partial'}`} style={{ marginTop: 8 }}>
                          <p className="novelty-verdict">
                            <strong>{deepenResult.ready ? '✓ Gap is concrete' : '⚠ Needs more sharpening'}</strong>
                            {' · '}{deepenResult.iterations?.length} iteration(s)
                          </p>
                          <p className="novelty-note">{deepenResult.final_gap}</p>
                          {deepenResult.evidence_chain?.length > 0 && (
                            <ul style={{ marginTop: 4 }}>
                              {deepenResult.evidence_chain.map((e, i) => (
                                <li key={i} style={{ fontSize: '0.78rem' }}>
                                  <strong>{e.status}</strong>: {e.claim} {e.paper ? `— "${e.paper}"` : ''}
                                </li>
                              ))}
                            </ul>
                          )}
                          {deepenResult.warning && <p style={{ fontSize: '0.78rem', color: '#c0392b' }}>{deepenResult.warning}</p>}
                          <button className="secondary" onClick={runDeepeningLoop} disabled={loading} style={{ marginTop: 4 }}>
                            {loading ? <Loader2 className="spin" size={13} /> : <RefreshCw size={13} />}
                            Re-run deepening
                          </button>
                        </div>
                      )}

                      <button className="primary" onClick={moveToStage2} disabled={loading || !deepenResult} style={{ marginTop: 8 }}>
                        {loading ? <Loader2 className="spin" size={14} /> : null}
                        {deepenResult?.ready
                          ? 'Gap verified → Hypotheses & Specificity →'
                          : deepenResult
                            ? 'Proceed anyway →'
                            : 'Deepen gap first'}
                      </button>
                    </div>
                  )}
                </aside>
              </div>
            )}
          </div>
        )}

        {/* ── Stage 2: Hypothesis Generation + Specificity Gate ── */}
        {phase === 'stage2' && (
          <div className="phase-panel">
            <div className="mentor-card">
              <div className="mentor-label"><Sparkles size={14} /> Stage 2 — Before Drafting</div>
              <p>NSF winning proposals always have <strong>explicit testable hypotheses</strong> and <strong>brutal specificity</strong> in their methods. We'll do both now, before drafting unlocks.</p>
            </div>

            {/* ── Refinement 1: Hypotheses (H1/H2/H3) ── */}
            <div className="draft-card" style={{ marginTop: 12 }}>
              <div className="draft-header">
                <h3>1. Testable Hypotheses</h3>
                {hypothesesCommitted && <span className="version-badge">✓ committed</span>}
              </div>
              {hypothesesData ? (
                <>
                  {hypothesesData.rationale && (
                    <p style={{ fontSize: '0.85rem', fontStyle: 'italic', color: '#555' }}>
                      Why these three: {hypothesesData.rationale}
                    </p>
                  )}
                  {hypothesesData.mentor_note && (
                    <p style={{ fontSize: '0.85rem', color: '#a85a00', marginTop: 4 }}>
                      <strong>Mentor note:</strong> {hypothesesData.mentor_note}
                    </p>
                  )}
                  {['h1','h2','h3'].map((k, i) => (
                    <div key={k} style={{ marginTop: 10 }}>
                      <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        H{i+1} ({['Outcome','Mechanism','Impact'][i]}):
                      </label>
                      <textarea
                        value={hypothesesEdits[k]}
                        onChange={e => setHypothesesEdits(prev => ({ ...prev, [k]: e.target.value }))}
                        rows={2}
                        style={{ width: '100%', marginTop: 4 }}
                        disabled={loading || hypothesesCommitted}
                      />
                    </div>
                  ))}
                  {!hypothesesCommitted && (
                    <button
                      className="primary"
                      onClick={commitHypotheses}
                      disabled={loading || !hypothesesEdits.h1.trim() || !hypothesesEdits.h2.trim() || !hypothesesEdits.h3.trim()}
                      style={{ marginTop: 8 }}
                    >
                      {loading ? <Loader2 className="spin" size={14} /> : <CheckCircle2 size={14} />}
                      Commit Hypotheses
                    </button>
                  )}
                </>
              ) : (
                <p>Loading hypotheses…</p>
              )}
            </div>

            {/* ── Refinement 3: Specificity Gate ── */}
            {hypothesesCommitted && (
              <div className="draft-card" style={{ marginTop: 12 }}>
                <div className="draft-header">
                  <h3>2. Specificity Gate</h3>
                  {specResult && (
                    <span className="version-badge" style={{
                      background: specResult.passed ? '#d4edda' : '#f8d7da',
                      color: specResult.passed ? '#155724' : '#721c24'
                    }}>
                      {specResult.passed ? '✓ PASSED' : '✗ FAILED'}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '0.85rem', color: '#555' }}>
                  Fill in concrete commitments. Vague answers ("open-source projects", "many", "metrics") will fail the gate.
                </p>

                {[
                  { key: 'dataset_name',      assessKey: 'dataset',     label: 'Dataset',         placeholder: 'e.g. "Linux kernel commits 2020-2024" (NOT "open-source projects")' },
                  { key: 'sample_size',       assessKey: 'sample_size', label: 'Sample size',     placeholder: 'e.g. "n=10,000 commits" (NOT "many")' },
                  { key: 'named_instruments', assessKey: 'instruments', label: 'Named instruments', placeholder: 'e.g. "Code Review Velocity Metric" (NOT "metrics")' },
                  { key: 'prior_reference',   assessKey: 'prior_ref',   label: 'Prior reference', placeholder: 'e.g. "Building on Schultz et al." (NOT "prior work")' },
                ].map(field => {
                  const assessment = specResult?.[`${field.assessKey}_assessment`];
                  return (
                    <div key={field.key} style={{ marginTop: 10 }}>
                      <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>{field.label}:</label>
                      <input
                        type="text"
                        value={specFields[field.key]}
                        onChange={e => setSpecFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                        style={{ width: '100%', marginTop: 4, padding: 6 }}
                        disabled={loading || specResult?.passed}
                      />
                      {assessment && (
                        <p style={{
                          fontSize: '0.78rem',
                          marginTop: 2,
                          color: assessment.status === 'concrete' ? '#155724' : '#721c24'
                        }}>
                          {assessment.status === 'concrete' ? '✓' : '✗'} {assessment.feedback}
                        </p>
                      )}
                    </div>
                  );
                })}

                {specResult?.overall_feedback && (
                  <p style={{
                    marginTop: 10,
                    padding: 8,
                    background: specResult.passed ? '#d4edda' : '#fff3cd',
                    borderRadius: 4,
                    fontSize: '0.85rem'
                  }}>
                    <strong>Overall:</strong> {specResult.overall_feedback}
                  </p>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  {!specResult?.passed && (
                    <button
                      className="primary"
                      onClick={checkSpecificity}
                      disabled={loading || !specFields.dataset_name.trim()}
                    >
                      {loading ? <Loader2 className="spin" size={14} /> : <Search size={14} />}
                      {specResult ? 'Re-check Gate' : 'Check Specificity Gate'}
                    </button>
                  )}
                  {specResult?.passed && (
                    <button
                      className="primary"
                      onClick={moveToPhase3}
                      disabled={loading}
                    >
                      {loading ? <Loader2 className="spin" size={14} /> : null}
                      Gate Passed → Draft All Sections →
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Phase 3: Proposal Drafting ── */}
        {phase === 'phase3' && (
          <div className="phase-panel">
            {/* Section tabs */}
            <div className="section-tabs">
              {SECTIONS.map(s => (
                <button
                  key={s}
                  className={`tab ${activeSection === s ? 'active' : ''}`}
                  onClick={() => draftNewSection(s)}
                  disabled={loading}
                >
                  {SECTION_LABELS[s] || (s.charAt(0).toUpperCase() + s.slice(1))}
                </button>
              ))}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="secondary" onClick={getFigureSuggestions} disabled={loading} title="Get figure suggestions (7 rubric pts)">
                  {loading ? <Loader2 className="spin" size={14} /> : <Image size={14} />} Figures
                </button>
                <button className="secondary" onClick={() => loadVersionHistory(activeSection)} disabled={loading} title="Browse version history">
                  <History size={14} /> History
                </button>
                <button className="secondary" onClick={() => window.open(`http://localhost:8787/api/mentor/export/pdf/${learnerId}`, '_blank')}>
                  <FileText size={14} /> Export PDF
                </button>
                <button className="secondary" onClick={() => downloadLatex(learnerId)}>
                  <Download size={14} /> Download .tex
                </button>
                <button className="primary" onClick={runAdversarialReview} disabled={loading}>
                  {loading ? <Loader2 className="spin" size={14} /> : <Shield size={14} />}
                  Adversarial Review →
                </button>
              </div>
            </div>

            {/* Figure generation panel */}
            {figureSuggestions && (
              <div className="draft-card" style={{ marginBottom: 12, background: '#f0f9f5' }}>
                <div className="draft-header">
                  <h3><Image size={14} /> Figure Suggestions ({figureSuggestions.suggestions?.length || 0})</h3>
                  <button className="secondary" style={{ fontSize: '0.75rem', padding: '2px 8px' }} onClick={() => setFigureSuggestions(null)}>✕</button>
                </div>
                {figureSuggestions.suggestions?.map((s, i) => (
                  <div key={i} style={{ marginBottom: 8, padding: '6px 10px', background: 'white', borderRadius: 4, border: '1px solid #c8e6d8' }}>
                    <strong style={{ fontSize: '0.85rem' }}>{s.title}</strong>
                    <span style={{ fontSize: '0.75rem', color: '#888', marginLeft: 8 }}>{s.placement}</span>
                    <p style={{ fontSize: '0.8rem', margin: '2px 0' }}>{s.why_needed}</p>
                  </div>
                ))}
                <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <select value={figureType} onChange={e => setFigureType(e.target.value)} style={{ padding: 4, fontSize: '0.85rem' }}>
                    <option value="pipeline">Pipeline / Flowchart</option>
                    <option value="comparison_table">Comparison Table</option>
                    <option value="architecture">System Architecture</option>
                    <option value="evaluation_design">Evaluation Design</option>
                    <option value="timeline">Timeline / Milestones</option>
                  </select>
                  <textarea
                    value={figureDesc}
                    onChange={e => setFigureDesc(e.target.value)}
                    placeholder="Describe what the figure should show (e.g. 'Input commit → tangling detector → split candidates → reviewer interface, showing data flow')"
                    rows={2}
                    style={{ flex: 1, minWidth: 200, fontSize: '0.85rem' }}
                  />
                  <button className="primary" onClick={generateFigure} disabled={loading || !figureDesc.trim()} style={{ whiteSpace: 'nowrap' }}>
                    {loading ? <Loader2 className="spin" size={13} /> : null} Generate TikZ
                  </button>
                </div>
                {generatedFigure && (
                  <div style={{ marginTop: 10, padding: 10, background: '#1e1e1e', borderRadius: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ color: '#a8d8b9', fontSize: '0.78rem', fontFamily: 'monospace' }}>TikZ preview — included automatically in PDF export</span>
                      <button
                        style={{ fontSize: '0.75rem', background: '#333', color: '#eee', border: 'none', borderRadius: 3, padding: '2px 8px', cursor: 'pointer' }}
                        onClick={() => navigator.clipboard.writeText(generatedFigure.tikz_code)}
                      >Copy</button>
                    </div>
                    <pre style={{ color: '#e8e8e8', fontSize: '0.72rem', whiteSpace: 'pre-wrap', margin: 0, maxHeight: 300, overflow: 'auto' }}>
                      {generatedFigure.tikz_code}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Version history panel */}
            {showVersions && (
              <div className="draft-card" style={{ marginBottom: 12, background: '#fafafa' }}>
                <div className="draft-header">
                  <h3><History size={14} /> Version History — {SECTION_LABELS[activeSection] || activeSection}</h3>
                  <button className="secondary" style={{ fontSize: '0.75rem', padding: '2px 8px' }} onClick={() => setShowVersions(false)}>✕</button>
                </div>
                {versionHistory.length === 0
                  ? <p style={{ fontSize: '0.85rem', color: '#888' }}>No versions saved yet.</p>
                  : versionHistory.map((v, i) => (
                    <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #eee' }}>
                      <div>
                        <strong style={{ fontSize: '0.85rem' }}>v{v.version}</strong>
                        <span style={{ fontSize: '0.75rem', color: '#888', marginLeft: 8 }}>{v.updated_at?.slice(0, 16)}</span>
                        <p style={{ fontSize: '0.78rem', color: '#555', margin: '2px 0' }}>{v.content?.slice(0, 80)}…</p>
                      </div>
                      {i < versionHistory.length - 1 && (
                        <button className="secondary" style={{ fontSize: '0.75rem', whiteSpace: 'nowrap', marginLeft: 8 }}
                          onClick={() => revertToVersion(v.version)} disabled={loading}>
                          Revert to v{v.version}
                        </button>
                      )}
                      {i === versionHistory.length - 1 && (
                        <span style={{ fontSize: '0.75rem', color: '#1a5e3f', fontWeight: 600 }}>Current</span>
                      )}
                    </div>
                  ))
                }
              </div>
            )}

            {sectionDraft ? (
              <div className="phase-layout">
                <div className="phase-main">
                  {/* Draft */}
                  <div className="draft-card">
                    <div className="draft-header">
                      <h3>Draft — {SECTION_LABELS[activeSection] || activeSection}</h3>
                      <span className="version-badge">v{currentTurn + 1}</span>
                    </div>
                    <Markdown text={sectionDraft.draft} className="draft-text" />
                    {sectionDraft.grounded_in?.length > 0 && (
                      <p className="grounded-note">
                        Grounded in: {sectionDraft.grounded_in.map(g => g.source).filter((v, i, a) => a.indexOf(v) === i).join(' · ')}
                      </p>
                    )}
                  </div>

                  {/* Self-critique */}
                  <div className="critique-grid">
                    <div className="critique-panel strong">
                      <div className="critique-label"><CheckCircle2 size={13} /> Strong</div>
                      <ul>{(sectionDraft.critique?.strong || []).map((s, i) => <li key={i}>{s}</li>)}</ul>
                    </div>
                    <div className="critique-panel weak">
                      <div className="critique-label"><AlertCircle size={13} /> Weak</div>
                      <ul>{(sectionDraft.critique?.weak || []).map((w, i) => <li key={i}>{w}</li>)}</ul>
                    </div>
                    <div className="critique-panel confused">
                      <div className="critique-label"><HelpCircle size={13} /> Confused</div>
                      <ul>{(sectionDraft.critique?.confused || []).map((c, i) => <li key={i}>{c}</li>)}</ul>
                    </div>
                  </div>

                  {sectionDraft.defense_question && (
                    <div className="defense-card">
                      <strong>Your professor will likely ask:</strong>
                      <p>"{sectionDraft.defense_question}"</p>
                      <p className="defense-sub">Can you answer that? If not, we need to revise.</p>
                    </div>
                  )}

                  <div className="respond-area">
                    <textarea
                      value={userInput}
                      onChange={e => setUserInput(e.target.value)}
                      onKeyDown={handleKey}
                      placeholder="Accept this draft, suggest an edit, or reject the framing…"
                      rows={3}
                      disabled={loading}
                    />
                    <button className="primary" disabled={!userInput.trim() || loading} onClick={submitPhase3}>
                      {loading ? <Loader2 className="spin" size={16} /> : <Send size={16} />}
                      Respond
                    </button>
                  </div>
                </div>

                <aside className="phase-sidebar">
                  <div className="sidebar-section">
                    <h3>Sections</h3>
                    {SECTIONS.map(s => (
                      <div key={s} className={`section-row ${s === activeSection ? 'active' : ''}`}>
                        <span>{s === activeSection ? '→' : '·'}</span>
                        <span>{SECTION_LABELS[s] || (s.charAt(0).toUpperCase() + s.slice(1))}</span>
                      </div>
                    ))}
                  </div>
                </aside>
              </div>
            ) : (
              <div className="mentor-card">
                <div className="mentor-label"><BookOpen size={14} /> Mentor</div>
                <p>Select a section above to start drafting. We'll begin with Motivation.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Phase 4: Adversarial Review + Rubric ── */}
        {phase === 'phase4' && (
          <div className="phase-panel">

            {/* Export bar — always visible on Phase 4 */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              <button className="secondary" onClick={() => window.open(`http://localhost:8787/api/mentor/export/pdf/${learnerId}`, '_blank')}>
                <FileText size={14} /> Export PDF
              </button>
              <button className="secondary" onClick={() => downloadLatex(learnerId)}>
                <Download size={14} /> Download .tex
              </button>
              <button className="secondary" onClick={() => setPhase('phase3')}>
                ← Back to Draft
              </button>
            </div>

            {/* Adversarial Review Panel */}
            {adversarialReview && (
              <div style={{ marginBottom: 20 }}>
                <div className="mentor-card" style={{ background: '#fff8f0', borderLeft: '4px solid #d97706' }}>
                  <div className="mentor-label"><Shield size={14} /> Skeptical NSF Reviewer</div>
                  <p style={{ fontStyle: 'italic', color: '#92400e', marginBottom: 10 }}>
                    "{adversarialReview.reviewer_first_impression}"
                  </p>
                  <p style={{ fontSize: '0.82rem', color: '#555' }}>
                    Answer each question below. If you can't answer one, that gap in your understanding needs to be addressed — not just in the text, but in how you think about the research.
                  </p>
                </div>

                {(adversarialReview.questions || []).map((q, i) => (
                  <div key={i} className="draft-card" style={{
                    marginTop: 10,
                    borderLeft: `4px solid ${i === adversarialReview.hardest_question ? '#dc2626' : '#d1d5db'}`
                  }}>
                    <div className="draft-header">
                      <h3 style={{ fontSize: '0.9rem' }}>
                        Q{i+1} — {q.type?.replace(/_/g, ' ').toUpperCase()}
                        {i === adversarialReview.hardest_question && (
                          <span style={{ marginLeft: 8, fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 }}>⚠ HARDEST</span>
                        )}
                      </h3>
                    </div>
                    <p style={{ fontWeight: 500, marginBottom: 6 }}>{q.question}</p>
                    <p style={{ fontSize: '0.78rem', color: '#888', marginBottom: 8 }}>
                      <em>Why this matters:</em> {q.why_this_matters}
                    </p>
                    <textarea
                      value={defenseAnswers[i] || ''}
                      onChange={e => setDefenseAnswers(prev => ({ ...prev, [i]: e.target.value }))}
                      placeholder="Your answer..."
                      rows={3}
                      style={{ width: '100%', fontSize: '0.85rem' }}
                    />
                    <button
                      className="secondary"
                      style={{ marginTop: 4, fontSize: '0.82rem' }}
                      onClick={() => submitDefenseAnswer(i)}
                      disabled={!defenseAnswers[i]?.trim()}
                    >
                      Save answer
                    </button>
                  </div>
                ))}

                <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                  <button className="primary" onClick={moveToPhase4} disabled={loading}>
                    {loading ? <Loader2 className="spin" size={14} /> : <CheckCircle2 size={14} />}
                    I've answered these → Run Rubric Score →
                  </button>
                  <button className="secondary" onClick={() => setPhase('phase3')}>
                    ← Back to Draft
                  </button>
                </div>
              </div>
            )}

            {/* Rubric Panel — shown after defense */}
            {showRubricAfterDefense && rubric && (
              <div>
                <div className="rubric-header">
                  <div className="rubric-score">
                    <span className="score-number">{rubric.total_projected}</span>
                    <span className="score-max">/ {rubric.total_max}</span>
                    <span className="score-label">projected</span>
                  </div>
                  <div className="rubric-summary">{rubric.honest_summary}</div>
                </div>

                <div className="rubric-table-wrap">
                  <table className="rubric-table">
                    <thead>
                      <tr><th>Criterion</th><th>Score</th><th>Status</th><th>Fix</th></tr>
                    </thead>
                    <tbody>
                      {(rubric.checks || []).map((c, i) => (
                        <tr key={i}>
                          <td>{c.criterion}</td>
                          <td>{c.projected_points}/{c.max_points}</td>
                          <td>
                            <span className={`badge ${c.status === 'strong' ? 'covered' : 'needs-work'}`}>
                              {c.status}
                            </span>
                          </td>
                          <td className="fix-cell">{c.fix || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {rubric.priority_fixes?.length > 0 && (
                  <div className="priority-fixes">
                    <h3>Priority fixes (highest impact first)</h3>
                    <ol>{rubric.priority_fixes.map((f, i) => <li key={i}>{f}</li>)}</ol>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                  <button className="primary" onClick={() => setPhase('phase3')}>← Back to Draft</button>
                  <button className="secondary" onClick={() => window.open(`http://localhost:8787/api/mentor/export/pdf/${learnerId}`, '_blank')}>
                    <FileText size={14} /> Export PDF
                  </button>
                  <button className="secondary" onClick={() => downloadLatex(learnerId)}>
                    <Download size={14} /> Download .tex
                  </button>
                  <button className="secondary" onClick={runAdversarialReview} disabled={loading}>
                    <Shield size={14} /> Re-run Adversarial Review
                  </button>
                </div>
              </div>
            )}

            {/* Empty state — shouldn't normally happen */}
            {!adversarialReview && !rubric && (
              <div className="mentor-card">
                <p>Running review…</p>
              </div>
            )}
          </div>
        )}

        {/* ── Your Journey ── */}
        {story.length > 0 && (
          <section className="workflow-panel" style={{ marginTop: 8, background: '#fefcf3', borderLeft: '3px solid #d97706' }}>
            <h2 style={{ fontSize: '0.95rem', color: '#92400e', marginBottom: 8 }}>Your Journey</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {story.map((m, i) => {
                const icons = {
                  breakthrough: '💡', struggle: '🔧', growth: '📈',
                  commitment: '🎯', question: '❓', pattern: '🔄', milestone: '✅'
                };
                return (
                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: '0.82rem', color: '#555', lineHeight: 1.4 }}>
                    <span style={{ flexShrink: 0 }}>{icons[m.moment_type] || '·'}</span>
                    <span>{m.content}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Run Log ── */}
        {runLog.length > 0 && (
          <section className="workflow-panel" style={{ marginTop: 8 }}>
            <h2>Run Log</h2>
            <ol className="run-log">
              {runLog.map(e => (
                <li key={e.id}>
                  <span>{e.stage}</span>
                  <p>{e.msg}</p>
                </li>
              ))}
            </ol>
          </section>
        )}

      </div>
    </main>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || data.error || 'Request failed');
  return data;
}

async function get(url) {
  const res = await fetch(url);
  const text = await res.text();
  if (!text) throw new Error(`Empty response from ${url} (status ${res.status})`);
  let data;
  try { data = JSON.parse(text); }
  catch (e) { throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 100)}`); }
  if (!res.ok) throw new Error(data.detail || data.error || 'Request failed');
  return data;
}
