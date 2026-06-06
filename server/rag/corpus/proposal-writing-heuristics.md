# Proposal Writing Heuristics: Gap, Novelty, Motivation, Method
SOURCE: Synthesized from NSF "A Guide for Proposal Writing" and standard research-methods guidance
TAGS: motivation, novelty, method, gap, writing

## What a research gap actually is
A research gap is not "nobody has done X." It is a specific, consequential limitation in what current methods can do, demonstrated by the literature. A defensible gap statement has three parts: (1) the concrete problem and who has it, (2) what the best existing approaches do, and (3) the specific thing they cannot do or assume away. A gap that cannot point to specific papers that "stop short" is a guess, not a gap. Before claiming a gap, you must check whether it has already been filled — search for the exact problem and read the closest recent work. If a paper already addresses it, the gap must be narrowed or abandoned.

## Testing whether a gap is genuinely open (novelty check)
To validate novelty, turn the gap into search queries and look for work that would refute it. Ask: "If someone had already solved this, what would the paper be titled?" Search for that. If you find close work, honestly characterize the residual gap: does the existing work make an assumption your setting violates? Does it evaluate on a different population? Does it solve a special case but not the general one? A proposal that names the closest prior work and explains precisely what remains open is far stronger than one that claims uncontested novelty.

## Writing a strong motivation
A strong motivation names a concrete stakeholder and a concrete pain, not an abstract trend. "AI can help software engineering" is not motivation; "Code reviewers miss security-relevant logic changes because diff tools surface syntax, not intent, causing X% of vulnerabilities to ship" is. Motivation connects the pain to evidence (a statistic, a cited study, or a documented failure) and makes the cost of the unsolved problem felt. The reader should finish the motivation believing the problem is real, important, and unsolved.

## Writing a strong method / workflow
The method must be specific enough that a peer could attempt to reproduce the approach. State the inputs, the steps, the model or technique at each step, and the outputs. Tie each design choice to the gap: explain why this approach addresses the specific limitation you identified. Mark assumptions explicitly. Distinguish what is established technique from what is your contribution. Avoid hand-waving verbs ("leverage," "utilize," "intelligently") that hide the absence of a real mechanism.

## Writing a strong evaluation plan
The evaluation must state how you will know the approach worked. Specify: the metric(s), the baseline(s) you compare against, the dataset or participants, and what result would count as success versus failure. A proposal that cannot describe a falsifiable success criterion has no evaluation. Prefer comparisons to existing methods on a shared benchmark; if none exists, justify the chosen measure.

## Feasibility, milestones, and risk
Reviewers discount proposals that ignore feasibility. Provide a realistic timeline with milestones, identify the top risks (data access, participant recruitment, compute, scope), and state mitigations for each. Acknowledging a real risk and planning for it builds credibility; pretending there are no risks destroys it. For human-subjects work, mention ethics/IRB.

## Common failure modes reviewers penalize
Vague novelty claims with no cited contrast; motivation that states a trend instead of a stakeholder pain; methods full of hand-waving verbs; missing or non-falsifiable evaluation; no feasibility or risk discussion; and claims asserted without evidence or without being marked as assumptions. Each of these is a specific, nameable weakness — strong self-critique identifies which of them a draft commits.
