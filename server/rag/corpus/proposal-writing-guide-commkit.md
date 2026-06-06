# Research Proposal Writing Guide — MIT CommKit + Grammarly Academic Writing
SOURCE: MIT Communication Lab CommKit (mitcommlab.mit.edu), Grammarly Academic Writing Guide (grammarly.com/blog/academic-writing/how-to-write-a-research-proposal)
TAGS: motivation, novelty, method, evaluation, writing, gap, structure

## The Core Structure Every Research Proposal Must Have
Every credible research proposal follows this arc regardless of length:
1. PROBLEM: What problem exists in the world? Who has it? What does it cost them?
2. GAP: What has been tried? What does existing work not do?
3. APPROACH: What will you do differently and why will it work?
4. HYPOTHESIS: What specific testable prediction does your approach imply?
5. EVALUATION: How will you know if it worked? What counts as success?
6. BROADER IMPACT: Who benefits beyond the immediate research community?
A proposal missing any of these six elements is incomplete. The most commonly missing element is #4 (hypothesis) — researchers describe what they will do but not what they predict will happen.

## Writing the Problem Statement — MIT CommKit Guidance
The problem statement must answer three questions before the reader reaches the second paragraph:
(a) What is wrong or missing in the world? (The problem must be externally real, not just intellectually interesting.)
(b) Who suffers from this problem? (Name a stakeholder — a developer, a patient, a student — not an abstract community.)
(c) Why is this problem consequential? (State a cost, a frequency, or a downstream harm.)
CommKit annotation on common failure: "Students often write 'This is an interesting open question' when they should write 'This limitation causes X, which costs Y.' The first is a research motivation; the second is a problem worth funding."

## Writing the Literature Review and Gap — MIT CommKit Guidance
The purpose of the literature review is NOT to summarize what others have done. It is to BUILD THE CASE that a specific gap exists. Structure:
- "Paper A does X, which established Y."
- "Paper B extends A by doing Z."
- "However, neither A nor B addresses [specific scenario / assumption violation / population]."
- "This gap matters because [consequence]."
CommKit annotation: "The gap statement should feel inevitable after the literature review — the reader should think 'of course, nobody has done that.' If the gap feels arbitrary or disconnected from the papers you reviewed, the literature review is doing the wrong job."
Every claim in the literature review must be cited. Do not paraphrase paper titles into vague descriptions. Name the paper by title or author+year.

## The Difference Between a Method and a Research Plan
A METHOD describes what you will do technically. A RESEARCH PLAN describes what you will do technically AND what question each step answers AND how you will know if each step succeeded.
METHOD only (weak): "We will fine-tune BERT on code review data."
RESEARCH PLAN (strong): "We will fine-tune BERT-base on the CodeReview dataset (n=45,000 annotated reviews, Shi et al. 2022). This step tests whether domain-specific pre-training improves classification accuracy over general BERT. Success criterion: ≥5% F1 improvement over general BERT baseline. If fine-tuning does not improve performance, we will investigate whether the dataset is too small (< 50K samples) and pivot to prompt engineering as an alternative."
The distinction matters because reviewers need to see that you understand what could fail and have thought through alternatives.

## Writing Broader Impacts That Actually Satisfy Reviewers
CommKit annotation: "The biggest mistake applicants make on Broader Impacts is treating it as an afterthought — one paragraph of vague aspirations at the end. NSF reviewers are explicitly trained to look for BI 'right out of the gate' — it should not feel bolted on."
A strong BI section:
1. Opens with the research-level impact: "This work will produce an open-source [tool/dataset/framework] available to the research community, enabling [concrete follow-on work]."
2. States who at the applicant's institution will benefit and how: "At [University], this project will support [specific program / named group] through [specific activity]. Approximately [N] students per year will be reached."
3. Names at least one underrepresented group explicitly: "The project will prioritize mentorship of first-generation college students through [named program]."
4. Connects to education or workforce: "Results will be integrated into [course name/number] to give students hands-on experience with [skill]."
A BI section that only lists conference papers and journal publications will receive a Poor rating on Broader Impacts regardless of the quality of the research.

## Grammarly Guide: Clarity Principles for Academic Proposals
Four clarity rules that separate readable proposals from unreadable ones:
RULE 1 — One claim per sentence: Do not stack multiple claims into a single long sentence with "and," "while," and "moreover." Each sentence should make exactly one point.
RULE 2 — Active voice for contributions, passive for descriptions: "We propose X" (active, strong). "X has been proposed by Smith et al." (passive, appropriate for summarizing others). Avoid passive voice for your own contributions — it makes claims sound uncertain.
RULE 3 — Define acronyms on first use, then use consistently: Never define an acronym in the abstract and forget it by page 2. Inconsistent terminology (switching between "code review" and "patch review" and "diff review") forces the reader to work. Pick one term and use it throughout.
RULE 4 — Every paragraph ends with either a claim or a transition: The last sentence of each paragraph should either state the conclusion the paragraph establishes, or explicitly bridge to the next point. Paragraphs that end mid-thought lose the reviewer.

## The Revision Checklist — What to Check Before Submitting
From MIT CommKit's research proposal checklist, adapted for NSF GRFP:
□ Does the first paragraph name a concrete problem, a stakeholder, and a cost/consequence?
□ Does the gap statement cite specific papers by name and explain what they do NOT do?
□ Is there at least one hypothesis statement with a measurable threshold and a named baseline?
□ Does the method section name a specific dataset (n=X), specific metric, and specific baseline?
□ Does the Intellectual Merit section explicitly state what type of contribution this is?
□ Does the Broader Impacts section have BOTH a global tier and a local tier with a named institution?
□ Does the local BI tier name specific groups and estimate the number of people reached?
□ Are all risks named with specific mitigations — not general reassurances?
□ Is every claim either cited or labeled as the proposal's own hypothesis?
□ Does the proposal stay within the page limit with no font or margin tricks?
