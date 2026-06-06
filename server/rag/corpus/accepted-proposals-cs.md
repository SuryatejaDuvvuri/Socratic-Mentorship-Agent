# Accepted NSF GRFP Proposals — Real Text Extracts (CS/Engineering)
SOURCE: NSF GRFP Accepted Proposals — real downloaded PDFs via alexhunterlang.com/nsf-fellowship
TAGS: novelty, motivation, method, evaluation, broader-impacts, gap, example, accepted-proposal

## Katy Felkner (2022) — NLP — Opening and Humanitarian Motivation Pattern
VERBATIM OPENING: "Neural machine translation (NMT) has achieved excellent performance on many language pairs and translation tasks. However, two of the most pressing open problems in NMT are domain adaptation and low-resource scenarios [1] (i.e., language pairs for which large parallel corpora do not exist). This project will address both issues via cross-lingual domain adaptation in an extremely low-resource setting."
VERBATIM MOTIVATION: "The work is motivated by an urgent humanitarian crisis: refugees seeking asylum in the US who speak only Central American indigenous languages like K'iche', Mam, Kanjobal, and Mixtec [2]. The scarcity of interpreters in these languages makes it difficult for speakers to access legal services."
PATTERN: Field state → named open problems (with citation) → specific sub-problem this project addresses → concrete real-world stakeholder. Three sentences. No vague "AI is important" framing.

## Katy Felkner (2022) — NLP — Gap and Specificity of Prior Work
VERBATIM GAP: "Additionally, existing methods for low-resource NMT do not scale down to the extremely low-resource situation for these Central American languages."
VERBATIM PRIOR WORK LIMITATION: "Although various methods to augment parallel corpora have been proposed [4-7], they typically augment corpus size from a few hundred thousand sentences to a few million. They do not adequately address a context in which only thousands or tens of thousands of sentences are available."
PATTERN: The gap is quantified ("hundreds of thousands vs. thousands") and tied to cited papers ([4-7]). It does not say "nobody has solved this" — it says "prior work addresses a different scale." This is the correct gap framing: the existing methods stop short at a specific, measurable threshold.

## Katy Felkner (2022) — NLP — Hypothesis and Objectives Format
VERBATIM SECTION LABEL: "Objectives and Hypothesis:" (explicit label used)
VERBATIM OBJECTIVE: "I will address the domain issue by fine-tuning a pretrained NMT model on synthetic parallel data generated via backtranslation [3] of monolingual in-domain data in the target language. I will first validate my approach in a high-resource setting by fine-tuning a baseline Spanish-English model using backtranslated in-domain English data."
PATTERN: Objective → validation step → extension step. The validation is on a high-resource setting first (Spanish-English, well-understood), then applied to the low-resource case. This two-step validation structure appears in multiple accepted proposals.

## Jessica Yin (2020) — Robotics/CV — Intellectual Merit Section Opening
VERBATIM IM OPENING: "Inspired by the adaptability of biological organisms, soft robots have emerged to address some of the technical limitations of conventional rigid robots. Although rigid robots are remarkably capable at high-precision and load-bearing tasks, their stiff material properties, with a Young's modulus in the range of 10^9 – 10^12 Pa, inherently limit their ability to physically interact with their environment."
PATTERN: The IM section opens with the biological/engineering inspiration, then immediately quantifies the limitation of current technology (Young's modulus values). Reviewers see concrete numbers, not vague claims.

## Jessica Yin (2020) — Robotics/CV — Gap Statement with Specific Missing Capability
VERBATIM GAP: "The lack of sensory information has resulted in the absence of sensor-based control and higher-level decision making that would be customary for a rigid robot [2]."
VERBATIM PRIOR WORK BRIDGE: "The Soft Machines Lab at Carnegie Mellon University led by Professor Carmel Majidi made a breakthrough in soft robotic sensing capabilities by demonstrating a hybrid soft sensor skin with orientation, pressure, temperature, and proximity sensing processed on-board [3]. Finally armed with multimodal sensing to determine the soft robot's environmental and internal state, a unique opportunity has arisen for the development of sensor-based control for soft robots."
PATTERN: Prior work established the enabling technology → that technology creates a new opportunity → this proposal seizes that opportunity. Gap is not "nobody has done X" but "prior work [3] created the precondition for X, and X has not been done yet." This is a gap created by prior progress, not by prior neglect.

## Kevin Greenman (2021) — Computationally Intensive Research — Data and Method Specificity
VERBATIM DATA SPECIFICITY: "I have addressed this limitation by collecting all openly accessible UV-Vis data from seven online repositories (29,811 measurements in total) and standardizing it into a consistent format."
VERBATIM MODEL SPECIFICITY: "I then used a combination of a directed message-passing neural network (DMPNN) [3] and a feed-forward neural network to predict a value for λabs given an input molecule-solvent pair."
VERBATIM RESULT: "Using this method, my model has achieved a test-set mean absolute error (MAE) of 8.68 nm (a 17% reduction in error over the previous best model) on the largest dataset for which ML predictions have been published."
PATTERN: Named data source (seven online repositories) + exact count (29,811) + named architecture (DMPNN with citation) + named metric (MAE) + quantified improvement (17% reduction) + named comparison (previous best model). This is what "brutal specificity" looks like: every detail is named and numbered.

## Kevin Greenman (2021) — Computationally Intensive Research — Numbered Objectives Format
VERBATIM OBJECTIVES: "Specifically, I am focusing on the following objectives: (1) developing ML models to predict UV-Vis absorption and emission spectra accurately given a dye molecule and solvent pair, (2) creating a generalizable, automated active machine learning framework to improve the prediction models, and (3) utilizing this framework to design a novel near-infrared (NIR) dye for biomedical sensing and diagnostics."
PATTERN: Three numbered objectives in a single sentence. Each is specific and independently evaluable. Reviewers can check whether each is addressed. This is more effective than prose objectives that blend together.

## Steven Bulfer (2021) — Electrical Engineering — Explicit Hypothesis Label
VERBATIM HYPOTHESIS: "Hypothesis: BMI ASICs implementing computationally, and memory efficient algorithms will be able to efficaciously ascertain patient intent while maintaining robust performance whilst still meeting power and area constraints requisite of fully implantable systems."
VERBATIM OPENING STATISTIC: "The National Spinal Cord Injury Statistical Center reported a total of 19,105 new cases of spinal cord injuries with some amount of paralysis in 2019."
PATTERN: (1) Opening uses a named source + exact statistic. (2) The "Hypothesis:" section is explicitly labeled. Both patterns appear in accepted EE proposals and make reviewer evaluation straightforward.

## Nic Fishman (2020) — Computer Science (AI/Causal Inference) — Related Work and Closest Competitor
VERBATIM OPENING: "Causal inference – an experiment with random or pseudo-random partitioning of units between a treatment and control group – has come to be understood as the gold standard for scientific settings where the end goal is intervening in some process to achieve a desired end."
VERBATIM CLOSEST PRIOR WORK: "Within this literature the closest work to my proposal is [3], which attempts to learn representations to improve the quality of these counterfactual predictions but does not focus either on out-of-distribution predictions for understanding generalization or learning representations for multiple experimental treatments."
PATTERN: Name the single closest competitor → state exactly what it does → state exactly what it does NOT do (two specific missing features). The reviewer now understands the gap precisely.

## Nic Fishman (2020) — Computer Science (AI/Causal Inference) — ACTUAL NSF REVIEWER FEEDBACK
SOURCE: Official NSF Ratings Sheet, Application Year 2021, APPLICANT ID: 1000314123

REVIEWER COMMENT ON INTELLECTUAL MERIT (3 independent reviewers):
- Reviewer 1: "Applicant combines impressive technical strengths in the interdisciplinary fields of sociology, computer science, and machine learning... Applicant is both analytically crisp and unusually creative."
- Reviewer 2: "The applicant proposes to investigate causal inference... As a nitpick, I would have liked to see more details on the datasets and experiments that will be used."
- Reviewer 3: "The applicant's research plan is theoretically rigorous and very well written, describing two potential application domains. The applicant has published or has submitted manuscripts in top venues in diverse (and disparate) domains."

OVERALL ASSESSMENT: All three reviewers rated Intellectual Merit as "Excellent"

REVIEWER COMMENT ON BROADER IMPACTS:
- Reviewer 1: "The applicant has demonstrated a commitment to tackling a diverse array of core societal problems with real impact."
- Reviewer 3: "The applicant has a track record of using computational techniques to increase awareness and mitigate non compliance."

OVERALL ASSESSMENT: All three reviewers rated Broader Impacts as "Excellent"

FINAL RECOMMENDATIONS:
- Reviewer 1: "This is a very strong application and should be funded."
- Reviewer 3: "The applicant has outstanding grades, varied work exprerience, and strong reference letters."

KEY INSIGHT FROM REVIEWER FEEDBACK: The weakness identified was specificity ("I would have liked to see more details on the datasets and experiments"). The strengths were: (1) interdisciplinary depth, (2) demonstrated contributions (first-author publications in top venues), (3) "analytically crisp AND creative", (4) well-written research plan, (5) strong letters of recommendation. The concern about "wide range of projects" was mitigated by the overall strength of the application.

## Cross-Proposal Pattern: What All Four CS/EE Winners Share
Across Katy Felkner (NLP), Jessica Yin (Robotics), Kevin Greenman (Comp. Intensive), and Steven Bulfer (EE):
1. CONCRETE OPENING: A statistic, quantified limitation, or named failure mode. Never "X is an important field."
2. LABELED SECTIONS: "Intellectual Merit:", "Hypothesis:", "Objectives:", or "Research Plan:" — explicit labels appear in all four.
3. NAMED NUMBERS: Sample sizes, error metrics, Young's modulus values, case counts. No vague "large dataset" or "improved performance."
4. CLOSEST COMPETITOR NAMED: Each identifies the single most relevant prior paper and explains exactly what it misses.
5. STAGED PLAN: Aim I/II, Stage I/II/III, or numbered objectives. Early stages validate, later stages extend.
6. BROADER IMPACTS GROUNDED IN REAL POPULATIONS: Refugees (Felkner), people with paralysis (Bulfer), biomedical imaging patients (Greenman). Not abstract "society will benefit."
