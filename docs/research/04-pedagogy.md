# 04 — Quiet pedagogy for a 4-year-old's album-cover player

**Research date:** 2026-09-18. Every claim carries a primary-source URL. Anything I could not verify against a fetched source is marked **UNVERIFIED**.

**The question.** The device is a locked-down album-cover music player for a 4-year-old Norwegian pre-reader, playing to a Sonos speaker. The parent wants quietly pedagogic features, and has proposed a **track list emphasising learning to read track numbers**. This document answers whether that is a good idea, and what else is worth doing.

**The constraints any suggestion must respect** (established in [`02-prior-art-kiosk-ui.md`](./02-prior-art-kiosk-ui.md) §5):

- No text the child must read to operate the device.
- Minimum 76 px (2 cm) touch targets ([NN/g](https://www.nngroup.com/articles/children-ux-physical-development/)).
- Tap-and-hold succeeds ~20% of the time at this age; a tap on a static intended target ~57%.
- The verb list stays at three: browse, play/pause, volume.
- Nothing gates music behind a task.
- It is a record player that happens to teach. It is never a learning app.

---

## 0. The short answer

**Build the track list. It is the best-supported pedagogic feature available to this device — but the evidence says the numerals are only half of it, and the half the parent was not thinking about is the one carrying the causal result.**

Siegler & Ramani ran an identical numbered game on a **linear** versus a **circular** board with children aged 4;0–5;5. Number-line linearity rose 14% → 39% on the linear board and 15% → 21% on the circular one, and the linear-board children subsequently learned more from arithmetic instruction ([doi](https://doi.org/10.1037/a0014239)). Same numerals, same content, different geometry — and the geometry was the active ingredient. A related study got numeral-identification gains of **between-group *d* = 0.80 at nine-week follow-up from about one hour of play** ([doi](https://doi.org/10.1111/j.1467-8624.2007.01131.x)).

So: **do not build "a track list with numbers on it". Build a number line that happens to play music** — one straight, evenly spaced column, true numerals, big and plain, tap a row to play from there. Rendering details in §6.1.

**Two corrections to obvious instincts.** Do *not* add dots beside the numerals past three: the mean subitizing range at 42–57 months is **2.8** ([doi](https://doi.org/10.1371/journal.pone.0094428)), and the linear position already supplies the non-symbolic magnitude cue. And do *not* build it as a circular or carousel scroller because it looks like a record — that is precisely the condition that did not work.

**The device must never ask the child a question. Not once.** Not a quiz, not a prompt, not an optional mode behind the parent gate. The value here is ambient, self-chosen, high-repetition exposure inside an activity the child already wants. The moment the device evaluates the child, a joy object becomes a task, and expected tangible rewards undermine children's intrinsic motivation at ***d* = −0.28 to −0.40**, with "tangible rewards… more detrimental for children than college students" ([Deci, Koestner & Ryan](https://doi.org/10.1037/0033-2909.125.6.627)).

**On literacy, the honest answer is no.** Band names under covers will not teach reading. That is the exact condition Masonheimer, Drum & Ehri tested and found null, and NELP scores environmental print at ***r* = 0.28** for predicting later decoding — bottom of the table, below its own "weak" cutoff, statistically indistinguishable from visual perception (§2). One cheap change is worth making anyway: set the band name **once, in plain large capitals**, on the now-playing view, alongside the stylised logo on the cover. It buys print motivation and a conversational opening, not decoding.

**Ranked features are in §5.** Five worth building, one maybe, four to refuse. **On Norwegian norms (§2.7): the Rammeplan does not merely permit this — it describes it**, asking staff to use *"bøker, spill, musikk, digitale verktøy"* to inspire mathematical thinking. What Norwegian practice *does* forbid is drilling, and Lesesenteret says so in as many words.

---
## 1. Numerals at four

### 1.1 Four different skills, four different timetables

The parent's phrase "learning to read track numbers" bundles four dissociable abilities that a 4-year-old holds at four very different levels. Getting these apart is the whole design decision.

| Skill | What it is | Where a typical 4-year-old is |
|---|---|---|
| **Rote count sequence** | Reciting "en, to, tre…" | Ahead of everything else — ~8–10 items |
| **Cardinality** | Knowing "five" means *this many* | Cardinal principle acquired ~4;4, but magnitude above 4 still unreliable |
| **Subitizing** | Seeing *how many* without counting | **Mean range 2.8** |
| **Numeral identification** | Seeing "7" and saying "sju" | ~55–70% of digits 1–10; huge variance |

**Rote counting runs far ahead of meaning.** In Le Corre & Carey's sample, children who understood the cardinal meaning of only "one" already recited a count list averaging 9.8 items (range 8–12); "three"-knowers averaged 10.8. Children recite *ten* number words while knowing what *three* of them mean ([Le Corre & Carey, Table 1, PMC3880652](https://pmc.ncbi.nlm.nih.gov/articles/PMC3880652/)). Ramani & Siegler's Head Start 4-year-olds (M = 4;5) counted to 8.4 before their first error ([*Child Development*](https://doi.org/10.1111/j.1467-8624.2007.01131.x); [full text](https://drum.lib.umd.edu/bitstreams/ec1575d7-a706-44c2-afc2-ed6ae4b7c53c/download)).

**Cardinality arrives right about now, but incompletely.** Cardinal-principle knowers in Le Corre & Carey averaged **4;4** (n = 71, range 3;2–5;7). But CP-knowers split into "mappers" and "non-mappers": for roughly **six months after** acquiring the cardinal principle, children still cannot estimate set sizes above 4 without counting. So your child probably "has" cardinality, and still has no magnitude intuition for eight.

**Subitizing is the number that most constrains your UI.** Gray & Reeve tested 78 children aged **42–57 months** — your child's exact band — and found a **mean subitizing range of 2.8** ([*PLOS ONE*](https://doi.org/10.1371/journal.pone.0094428); [PMC3979837](https://pmc.ncbi.nlm.nih.gov/articles/PMC3979837/)). The popular "3–4 items" figure is, for four-year-olds specifically, closer to **3**. England's EYFS asks for subitising to 5 at the *end of Reception*, a year later ([EYFS, p. 15](https://assets.publishing.service.gov.uk/media/6a5f8e4fb00f3323bf1a23a1/EYFS_group_and_school_based_from_September_2026.pdf)).

**This kills the obvious "show dots instead of numbers" idea for anything past track 3.** Eleven dots is not a quantity to a 4-year-old; it is texture. See §5.1 for what to do instead.

### 1.2 What a 4-year-old can actually do with a written digit

Two studies give usable numbers.

**Knudsen, Fischer, Henning & Aschersleben** tested German 4-to-7-year-olds on digits **1–6 only**:

- **4-year-olds named M = 3.4 of 6 digits.** Only **30.4% named all six**; **17.4% named none.**
- 5-year-olds: M = 5.5; **82.6% named all six.**
- All 6- and 7-year-olds named all six.

([*Journal of Numerical Cognition* 1(1)](https://doi.org/10.5964/jnc.v1i1.4); [free PDF](https://jnc.psychopen.eu/index.php/jnc/article/download/5675/5675.pdf))

**Ramani & Siegler**, digits **1–10**, US Head Start: the younger group (M = 4;5) identified **6.6 of 10**; the older group (M = 5;1) **7.7 of 10** ([doi](https://doi.org/10.1111/j.1467-8624.2007.01131.x)).

Converging estimate: **a typical 4-year-old names roughly 55–70% of the digits 1–10, and the variance is enormous** — the bottom third of Knudsen's 4-year-olds knew two digits or fewer. **There is no basis for assuming this particular Norwegian 4-year-old knows 1–9.** Build for a child who might know three digits.

**One finding is directly encouraging for your design.** Knudsen found a strict ordering *within* digit knowledge: children could **name** more digits than they could give cardinal values for, and could give cardinal values for number *words* more readily than for *digits* (mean gap 1.92 digits at age 4, narrowing to 0.86 at 5). **Naming the symbol comes first; knowing what it means comes later.** Recognition and matching are the cheap skills — and recognition and matching are exactly what a track list affords.

And numeral knowledge is worth having: Göbel, Watson, Lervåg & Hulme's 11-month longitudinal study found **knowledge of Arabic numerals was a powerful predictor of growth in arithmetic, while magnitude-comparison ability added nothing** ([*Psychological Science*](https://doi.org/10.1177/0956797613516471)). Note the Norwegian connection — Lervåg is at Universitetet i Oslo.

### 1.3 Is 1–12 the right range? Is 1–20 too much?

**1–12 is well-chosen. 1–20 is past a cliff — but the cliff is about *meaning*, not *recognition*, which is why it does not matter for you.**

Mix, Prather, Smith & Stockton (n = 207, ages 3–7) give item-level data for **4½-year-olds** (M = 56 months) that lands squarely on your question ([*Child Development*](https://doi.org/10.1111/cdev.12197); [PMC4460578](https://pmc.ncbi.nlm.nih.gov/articles/PMC4460578/)):

| Task at 4;8 | Accuracy |
|---|---|
| "Which is 12?" (12 vs 22) | **1.00** |
| "Which is 2?" (2 vs 8) | **1.00** |
| "Which is 15?" (15 vs 5) | **0.97** |
| "Which is 11?" (11 vs 24) | **0.81** |
| "Which is more, 11 or 19?" | **0.66** |
| "Which is more, 14 or 41?" | **0.59** |
| "Which is more, 16 or 62?" | **0.66** |

Read that table carefully. A 4½-year-old can reliably **find and identify** the numeral "12", and has **essentially no idea that 19 > 11** — the comparison rows are barely off the 0.50 chance floor.

**This is exactly the right shape for a track list.** A track list asks the child to *recognise and match* a numeral to a song. It never asks him to compare two numerals. The one thing he cannot do is the one thing you are not asking.

The verbal side is the genuine bottleneck, and **Norwegian is unhelpful precisely in the 11–12 band you are proposing as the working ceiling**: *elleve* and *tolv* are etymologically opaque and morphologically unrelated to *ti* + *en/to*, whereas *tretten…nitten* are transparently unit + *-ten*. Cross-linguistically, 4–5-year-old Chinese children counted to ~40 while US children of the same age "could barely get to 15", attributed to opaque English teen words (Miller, Smith, Zhu & Zhang, reported in [*PLOS ONE*](https://doi.org/10.1371/journal.pone.0243472); [PMC7721146](https://pmc.ncbi.nlm.nih.gov/articles/PMC7721146/)). The important caveat from that same paper: transparency bought an advantage **only on counting**, not on Give-N, comparison, enumeration or addition. Number-word transparency buys rote sequence length and nothing else.

**Recommendation: display the true track numbers, 1 to *n*, whatever *n* is.** Treat 1–12 as the working range and 13–20 as graceful degradation — the child will read them as shapes-with-two-parts and use the leading digit. Do not truncate, do not renumber, do not "simplify". Never require comparing two numerals.

### 1.4 What the official frameworks expect, and why they all sit *above* your child

Four frameworks, ordered by how much they ask. Note that every one of them describes a child **older** than four.

| Framework | Age it describes | What it asks for numerals |
|---|---|---|
| Rammeplan (NO) | 3–6, whole barnehage | **Nothing.** "Play and experiment with numbers, quantities and counting" |
| EYFS ELG (England) | End of Reception, ~5;0 | Nothing about numerals. "Deep understanding of numbers to 10"; "subitise up to 5" |
| CCSS Kindergarten (US) | ~5;0–6;0 | "Write numbers from 0 to 20"; compare two written numerals 1–10 |
| LK20 etter 2. trinn (NO) | ~7;0 | "Bruke tallsymboler… til å representere posisjonssystemet" |

**England's EYFS** early learning goals, which a child is expected to meet at the *end of the Reception year* — roughly a full year older than your child — are:

> **ELG: Number.** "Have a deep understanding of numbers to 10, including the composition of each number. **Subitise (recognise quantities without counting) up to 5.** Automatically recall… number bonds up to 5…"
>
> **ELG: Numerical Patterns.** "Verbally count beyond 20, recognising the pattern of the counting system."

([EYFS statutory framework, group and school-based providers, from September 2026, p. 15](https://assets.publishing.service.gov.uk/media/6a5f8e4fb00f3323bf1a23a1/EYFS_group_and_school_based_from_September_2026.pdf))

Two things to notice. First, **EYFS never asks a five-year-old to read or write a numeral.** Its number goal is entirely about quantity and composition. Second, **it caps subitising at 5** — for a child a year older than yours. That is the single most important number in this document for the design, and §5.1 turns it into a rendering rule.

**The US Common Core** is the most numeral-forward of the four, and it puts numeral writing to 20 in Kindergarten:

> **K.CC.3.** "Write numbers from 0 to 20. Represent a number of objects with a written numeral 0-20 (with 0 representing a count of no objects)."
> **K.CC.7.** "Compare two numbers between 1 and 10 presented as written numerals."

([Common Core State Standards for Mathematics, p. 11](https://www.thecorestandards.org/wp-content/uploads/Math_Standards1.pdf); [K.CC online](http://www.corestandards.org/Math/Content/K/CC/))

Even here, note K.CC.7: *comparing written numerals* is restricted to **1–10**, while *writing* extends to 20. The teen numerals are treated as a separate, harder problem — CCSS gives them their own domain heading ("Work with numbers 11–19 to gain foundations for place value").

**The NAEYC/NCTM joint position statement on early childhood mathematics** is the one that speaks most directly to your design question, because it is explicitly about 3-to-6-year-olds and explicitly about everyday contexts:

> "**Children's everyday activities and routines can be used to introduce and develop important mathematical ideas.**"
>
> Recommendation 1: "**Enhance children's natural interest in mathematics and their disposition to use it to make sense of their physical and social worlds.**"
>
> Recommendation 2: "Build on children's experience and knowledge, including their family, linguistic, cultural, and community backgrounds; their individual approaches to learning; and their **informal knowledge**."

It also carries the warning that governs everything in §4 of this document: prescriptive skill targets "often lead to superficial teaching and **rote learning at the expense of real understanding.**"

([NAEYC/NCTM, *Early Childhood Mathematics: Promoting Good Beginnings*, 2002](https://www.naeyc.org/resources/position-statements/mathematics); full PDF via [Internet Archive](https://web.archive.org/web/2020/https://www.naeyc.org/sites/default/files/globally-shared/downloads/PDFs/resources/position-statements/psmath.pdf) — naeyc.org blocks automated fetches)

**Verdict on the range.** A 1–12 track list is **above** your child's symbolic ceiling and that is fine, because nothing depends on him reading it. But the *useful* portion of that range — the part he can actually attach meaning to — is **1 to 5**, with 1–3 doing most of the work. Albums with 14 or 20 tracks are not a problem to be solved; the numerals past 10 are simply wallpaper for another two years. Do not truncate the list, do not renumber, do not "simplify to 1–5". **Accuracy is the whole point** (§4.4).

### 1.5 Ordinality is harder than cardinality — and a track list is inherently ordinal

The parent's instinct is right to worry about this. **Ordinality lags cardinality at four, and the evidence is unusually clean.**

Colomé & Noël tested 3-, 4- and 5-year-olds on matched cardinal and ordinal tasks and concluded that children "performed cardinal tasks significantly better than ordinal ones… **cardinality precedes the development of ordinality**" ([*JECP*](https://doi.org/10.1016/j.jecp.2012.03.005)). Within ordinal tasks, *producing* the number for a given position was easier than *selecting* the object in the *n*th position.

Knudsen's Digit Sequence Task quantifies it brutally. Asked to lay out cards 1–6 in order:

- **Only 26% of 4-year-olds succeeded on both trials** (65% of 5-year-olds, 100% of 6-year-olds).
- **56.5% of 4-year-olds could not place a single digit in the correct ordinal position.**

([*Journal of Numerical Cognition*](https://doi.org/10.5964/jnc.v1i1.4))

Longer term, ordinality becomes the *dominant* predictor: Lyons, Price, Vaessen, Blomert & Ansari (N = 1,391, grades 1–6) found the unique contribution of symbolic ordinality rose steadily and **overtook every other predictor by grade 6** ([*Developmental Science*](https://doi.org/10.1111/desc.12152)); in adults, symbolic number-ordering fully mediates the link between approximate number sense and arithmetic ([Lyons & Beilock, *Cognition*](https://doi.org/10.1016/j.cognition.2011.07.009)).

**So should the ordinal framing worry you? No — because of what else is true at four.**

Opfer, Thompson & Furlong found **preschoolers already expect numbers to run left-to-right** — when searching numbered containers, when counting, and weakly when adding — *before* any reading instruction. Preschoolers lacking this bias had more immature, logarithmic magnitude representations ([*Developmental Science*](https://doi.org/10.1111/j.1467-7687.2009.00934.x)). Knudsen corroborates: of the 4-year-olds who *did* order the digits correctly, **83% laid them out left-to-right**, and 100% were internally consistent.

The spatial intuition is there. What is missing is automaticity — a SNARC effect when magnitude is *irrelevant* only emerges around **age 9** ([van Galen & Reitsma, *JECP*](https://doi.org/10.1016/j.jecp.2008.05.001)).

**The design consequence is concrete and non-obvious: the track list's *layout* is doing more pedagogic work than its numerals.** An evenly spaced straight line gives the child a spatial magnitude cue he can already use, on top of a symbol he mostly cannot read yet. See §1.6 — this is not a hunch, it is a controlled result.

**And the corresponding prohibition: never require an ordinal judgement.** No "play the track after this one" as a *labelled* concept, no "which is track 5", no ordering task. Only 26% of this age can order 1–6 at all. Next/previous as unlabelled physical buttons is fine; it is a direction, not a number.

### 1.6 Incidental exposure to numerals: the board-game evidence, which is nearly your device

The parent asked whether seeing numbers in a meaningful, self-chosen context actually teaches. **For numerals, yes, and the closest analogue in the literature is remarkably close to a track list.**

**Ramani & Siegler (2008).** Head Start preschoolers played a linear, 1–10 numbered board game — four sessions of 15–20 minutes, roughly **one hour in total**. Against a colour-board control:

| Outcome | Numbered board | Control | Effect |
|---|---|---|---|
| Numeral identification (of 10) | 7.0 → 8.2 → **8.7** at 9 weeks | 6.1 → 6.3 → 6.6 | within *d* = 0.44 → 0.63; **between-group *d* = 0.80 at follow-up** |
| Magnitude comparison | 73% → 85% | — | *d* = 0.79; between-group *d* = 0.99 |
| Counting (errorless) | 8.7 → 9.9 | — | *d* = 0.65 |

**Gains persisted nine weeks.** Correlationally, children who reported playing *Chutes and Ladders* at home scored higher on numeral identification (*r*b = .24), counting (.19) and number-line linearity (.20) ([*Child Development*](https://doi.org/10.1111/j.1467-8624.2007.01131.x)).

**The spatial format is causally load-bearing — and this is the single most actionable finding in this document.** Siegler & Ramani (2009) ran the *identical* game on a **linear versus circular** board with 88 preschoolers (M = **4;8**, range 4;0–5;5):

- Number-line linearity (mean R²) rose **14% → 39%** with the linear board.
- With the circular board: 15% → 21%.
- Linear-board children subsequently **learned more from arithmetic instruction** (45% vs 30% correct) — a learning-to-learn effect.

([*Journal of Educational Psychology*](https://doi.org/10.1037/a0014239))

**Translated: an evenly spaced vertical or horizontal track list will teach; a carousel, wheel, arc or ring will not.** Same numerals, same content, different geometry, and the geometry is what carried the effect. If you build the track list as a circular scroller because it looks like a record, you throw away the mechanism.

**Supporting evidence that numerals need something to be *about*.** Mix et al. attribute 3½–5-year-olds' above-chance multidigit performance explicitly to "**exposure to multidigit numerals without formal instruction**… children infer the meanings of these numbers using whatever experiences they can access" ([PMC4460578](https://pmc.ncbi.nlm.nih.gov/articles/PMC4460578/)). An RCT of counting books (N = 71, age 3) found that **identical numeric content embedded in a goal-based narrative beat sparse counting books**, which did not differ from a colour-control book ([*Developmental Psychology*](https://doi.org/10.1037/dev0001826); [PMC11867842](https://pmc.ncbi.nlm.nih.gov/articles/PMC11867842/)). A favourite song is exactly such a context.

**And what kind of ambient number input counts.** Levine et al. found parent number talk between 14 and 30 months predicted cardinal-number knowledge at 46 months (**r = .47**, SES held constant), with observed family variation extrapolating to **28 versus 1,799 number words per week** ([*Developmental Psychology*](https://doi.org/10.1037/a0019671); [PMC2998540](https://pmc.ncbi.nlm.nih.gov/articles/PMC2998540/)). Gunderson & Levine showed *which* talk counts: **counting or labelling sets of visible, present objects**, especially sets of 4–10 — not abstract number talk ([*Developmental Science*](https://doi.org/10.1111/j.1467-7687.2011.01050.x)).

**Two honest deflations.** First, the broader home-numeracy literature is much weaker than its reputation: Daucourt et al.'s preregistered meta-analysis (631 effect sizes, 64 studies) found **r = .13** ([*Psychological Bulletin*](https://doi.org/10.1037/bul0000330); [PMC8634776](https://pmc.ncbi.nlm.nih.gov/articles/PMC8634776/)). Second, and importantly for calibration: one hour of *concentrated, adult-scaffolded* linear-numeral play moved Head Start 4–5-year-olds by about **1.2 numerals out of 10**. That is a real effect and a modest one. **Expect one to three digits learned over some weeks, not a child who reads numbers.**

**UNVERIFIED:** there is **no research literature** on numerals encountered on elevator buttons, clocks, remote controls, page numbers or track listings. The numeracy equivalent of the "print-rich environment" literature does not exist. The board-game studies are the nearest evidence, and the analogy — ordered numerals, linear spatial layout, self-chosen repeated play — is good but it is an analogy.

**Also weak, and worth stating because it is tempting:** I could not verify that a numeral attached to a *self-chosen*, repeatedly revisited item is learned better than one passively viewed. Markant, Ruggeri, Gureckis & Xu argue active sampling enhances memory ([*Mind, Brain, and Education*](https://doi.org/10.1111/mbe.12117)), but a recent infant study found **no curiosity-driven selection advantage** in novel word learning ([*Developmental Science*](https://doi.org/10.1111/desc.70101)). **Do not build the case on agency.** The defensible claim is narrower and quite sufficient: repeated self-selection generates *many labelled exposures to the same digit–referent pair*, and repetition in a meaningful context is the verified mechanism.

## 2. Literacy: the band names will not teach him to read, and here is exactly why

The parent hopes reading comes along too. **It will not come along for free, and the metal wordmark is close to the worst possible case.** This is the section where the evidence contradicts the intuition most sharply, so it is worth reading in full before dismissing.

### 2.1 The foundational study is almost exactly your design, and it is a null

**Masonheimer, Drum & Ehri (1984), "Does Environmental Print Identification Lead Children into Word Reading?"** ([*Journal of Reading Behavior*](https://doi.org/10.1080/10862968409547520)). They selected 102 preschoolers aged 3–5 who were environmental-print **experts** — able to identify at least 8 of 10 items, such as a McDonald's sign in a photo of the restaurant — and then stripped the context away in stages. Verbatim from the abstract:

> "subjects' ability to read print declined somewhat when full contexts were removed and only logos remained. **Performance dropped dramatically when logos were removed and only stylized print remained.** Color cues made no contribution to identification. **Letter alterations were not detected, even when subjects were prompted to look for errors**"

Their stimulus example was *OcDonald's* for *McDonald's* — and the children, explicitly told to look for mistakes, did not see it. Scores were bimodal: 96 children could read few if any words; the 6 who could read "identified print correctly regardless of context, and they detected letter errors easily." The conclusion: "environmental print experience does not by itself lead subjects into word reading."

**A child who confidently picks out the SABATON cover is not reading "SABATON."** He is recognising a shape, and the letters inside it are not being processed at all.

**UNVERIFIED:** the widely repeated "XEPSI" example from this literature could not be confirmed against a fetched source. The letter-alteration finding and *OcDonald's* are verified; do not quote "XEPSI".

**The adult replication makes the point unavoidable.** Cardoso-Martins, Rodrigues & Ehri (2003) tested 20 nonliterate Brazilian adults aged 20–74. They "did not use letter knowledge to read or remember words in environmental signs. They read the signs only when presented in their full context, not when printed in isolation, and **they failed to notice altered letters.**" The authors' verdict: "These results argue strongly against the hypothesis that environmental print reading provides an important foundation for learning about the alphabetic system. More likely, reading signs and labels alphabetically emerges **as a result of** learning to read." ([*Scientific Studies of Reading*](https://doi.org/10.1207/S1532799XSSR0704_2))

**The counter-evidence is real but thin.** Cronin, Farrell & Delaney (1999) ran two training studies with non-reading preschoolers. Words taken from **known** logos were learned more readily than matched control words in both studies — but known-logo words beat *unknown*-logo words only in Study 1, which makes at least part of the effect a familiarity effect rather than a print effect ([*Journal of Research in Reading*](https://doi.org/10.1111/1467-9817.00090)).

**And drilling logos is worse than doing nothing.** Kuby & Aldridge found "the control group and the indirect instruction groups scored **significantly higher than the direct instruction group**" ([*Reading Psychology*](https://doi.org/10.1080/0270271970180201)), with a 2004 replication reaching the same conclusion on logo-to-manuscript transition.

### 2.2 How weakly does it transfer? The NELP table settles it

The National Early Literacy Panel's *Developing Early Literacy* (2008) meta-analysed what predicts later **decoding** from skills measured in kindergarten or earlier (Table 2.1, p. 58). Note the official lincs.ed.gov URL is dead; the live copy is at [nichd.nih.gov](https://www.nichd.nih.gov/sites/default/files/publications/pubs/documents/NELPReport09.pdf).

| Predictor | avg *r* | 95% CI | k | N |
|---|---|---|---|---|
| **Alphabet knowledge** | **0.50** | 0.48–0.52 | 52 | 7,570 |
| Writing / writing name | 0.49 | 0.45–0.53 | 10 | 1,650 |
| **Phonological awareness** | **0.40** | 0.39–0.42 | 69 | 8,443 |
| RAN letters/digits | 0.40 | 0.36–0.43 | 12 | 2,081 |
| Concepts about print | 0.34 | 0.31–0.37 | 12 | 2,604 |
| Print awareness | 0.29 | 0.22–0.35 | 6 | 683 |
| **Environmental print** | **0.28** | **0.22–0.34** | **6** | **1,042** |
| Visual perception | 0.22 | 0.18–0.26 | 16 | 2,551 |

**Environmental print sits at the bottom of the table**, below NELP's own 0.30 threshold for "weak", and statistically indistinguishable from *visual perception*. The report's own summary (p. 121): "variables reflecting measures of environmental print (e.g., the ability to decode or read common signs and logos) are **only weakly related to later reading and writing**."

Worse, NELP's intervention search for environmental print returned **one record in ERIC and zero in PsycINFO**. **There is no meta-analysis of environmental-print interventions** — I searched Crossref, ERIC and Europe PMC and none exists. The nearest thing is a narrative, advocacy-flavoured review ([Neumann, Hood, Ford & Neumann, *J. Early Childhood Literacy*](https://doi.org/10.1177/1468798411417080)).

### 2.3 Adult mediation flips the null — but it buys motivation, not letters

This is the most important study for your design, because it has the right control group.

**Neumann, Hood & Ford (2013)**, RCT, N = 73, ages 3–4, 8 weeks × 30 minutes, **three arms**: environmental print, **standard print (the same labels in plain manuscript)**, and no intervention ([*Reading and Writing*](https://doi.org/10.1007/s11145-012-9390-7)).

- Against the **no-intervention control**, environmental print won on letter-sound knowledge, letter writing, print concepts, print motivation and both print-reading measures.
- Against **plain standard print**, environmental print won **only on print motivation and environmental-print reading.**

Read that second line twice. **The branding bought motivation. The letter gains came from the mediated activity, not from the logo.** Plain type did just as well on everything alphabetic.

The rigorous version of "mediated activity" is **print referencing**, and its dose is sobering: Justice et al. ran an RCT with 59 teachers over **120 read-aloud sessions across 30 weeks** to obtain significant print-knowledge gains ([*LSHSS* 2009](https://doi.org/10.1044/0161-1461(2008/07-0098)); [2010](https://doi.org/10.1044/0161-1461(2010/09-0056))); in special education the effect was **d = 0.21** ([*Exceptional Children*](https://doi.org/10.1177/0014402914563693)). Real, modest, and expensive in adult attention.

And mediation does not happen by itself: in a joint-writing task, **only 4 of 35 mothers spontaneously used environmental print to scaffold** ([*Early Child Development and Care*](https://doi.org/10.1080/03004430.2011.615928)).

**A final deflation, so you calibrate correctly:** Piasta & Wagner's meta-analysis of alphabet instruction found "**minimal evidence of transfer of alphabet instruction** to early phonological, reading, or spelling skills" ([*Reading Research Quarterly*](https://doi.org/10.1598/RRQ.45.1.2)). Even teaching letters directly and deliberately does not automatically buy reading.

### 2.4 First letters are the gentle, evidence-backed target

Whole words are the wrong unit. The initial letter is the right one.

**Treiman & Broderick (1998)** — note the correct second author, often miscited — tested Australian Grade 1, US kindergarten and **US preschoolers (mean ages 4;10 and 4;11)** and found "a significant superiority for the **initial letter** of their own first name in tests of **letter-name, but not letter-sound**, knowledge," plus better printing of that letter ([*JECP*](https://doi.org/10.1006/jecp.1998.2448)). Their conclusion is the one that matters here: "children use **letter-based strategies with their own names at a time when they are often considered to be 'logographic' readers**." Replicated in French ([doi](https://doi.org/10.1080/10409289.2023.2252706)) and Portuguese/English ([doi](https://doi.org/10.1017/S0142716406060255)).

Two practical calibrations:

- **Benchmark at age 5** is **18 uppercase and 15 lowercase** letter names; benchmarks of ≥10 letters had high negative predictive power for later difficulty ([Piasta, Petscher & Justice, *JEP*](https://doi.org/10.1037/a0027757)). A 4-year-old is below this by design.
- **Uppercase first, and it is not close.** Children were "**more than 16 times more likely to know a lowercase letter if they knew the corresponding uppercase letter**", and uppercase familiarity was the strongest predictor of lowercase knowledge ([Turnbull, Bowles, Skibbe, Justice & Wiggins, *JSLHR*, N = 461](https://doi.org/10.1044/1092-4388(2010/09-0093)); also [Worden & Boettcher](https://doi.org/10.1080/10862969009547711)).

Metal band names are overwhelmingly set in uppercase. That is the one genuinely lucky property of this genre.

**At four, aim at letter *names*, not letter *sounds*** — the own-name advantage appears for names and not sounds, and letter-sound work is school's job (§2.6).

### 2.5 The metal wordmark is the worst case — and the fix is nearly free

**Salient-cue overshadowing** is the mechanism. When a cheap, highly salient cue predicts the answer, learners stop processing the expensive one. Samuels (1967) ([*JEP*](https://doi.org/10.1037/h0020045)) and Saunders & Solman (1984) found "**the children who did not view pictures out-performed those who did**", and neither telling children the picture matched the word nor pre-exposing the word rescued it ([*BJEP*](https://doi.org/10.1111/j.2044-8279.1984.tb02590.x)). Didden, Prinsen & Sigafoos found "acquisition was achieved fastest during the **word-alone** conditions" for 5 of 6 students ([*JABA*](https://doi.org/10.1901/jaba.2000.33-317)).

Relatedly, Ehri & Wilce (1985) showed prereaders learned visually distinctive but letter-arbitrary spellings *more easily* than phonetic ones — and that novices and veterans showed the **reverse** ([*RRQ*](https://doi.org/10.2307/747753)). The visual route is real, and it reverses the moment alphabetic knowledge comes online.

**A Sabaton or Metallica wordmark is exactly such a cheap cue**: a distinctive silhouette that predicts the answer without a single letter being processed. Sitting on top of maximally picture-salient album art, it is the overshadowing paradigm made real.

**But eye-tracking gives you a knob to turn, and it is free.** Neumann et al. (2014) tracked 39 children aged 3–5 and found children *did* attend to words in environmental print, "although they showed **more and longer fixations for standard print words without contextual cues**", concluding that "print learning may be facilitated by using environmental print with **larger and more centralized fonts**" ([*RRQ*](https://doi.org/10.1002/rrq.66)). And Neumann et al. (2015) found **pre-readers attended more to words in *print-salient* than *picture-salient*** environmental print, while beginning readers showed no difference ([*Reading and Writing*](https://doi.org/10.1007/s11145-014-9531-2)).

**So: set the band name in plain, large, centred capitals somewhere in the UI, in addition to the logo on the cover.** The cover keeps the logo. The now-playing view gets the plain word. This costs one text node and is the only literacy change in this document with direct empirical support.

**UNVERIFIED / genuine gap:** no experiment tests whether *stylised branded typography specifically* impairs letter learning; ERIC returns nothing for logo × letter-knowledge in preschool. The overshadowing inference is strong but indirect. Also do not cite the Gough "thumbprint" study — it could not be retrieved as a primary source.

**On typeface, the evidence is mostly null, and it says pick a big ordinary one:**

- Serif vs sans vs purpose-built "infant" characters: **no measured difference.** 6-year-olds "could read text set in Gill and Century equally well" ([Walker & Reynolds, *Information Design Journal*](https://doi.org/10.1075/idj.11.2.04wal)).
- **Size beats face.** Reading was 9% faster at larger x-height, and **Verdana beat Sassoon Primary** — a general screen face outperformed one designed for children ([Wilkins et al., *J. Research in Reading*](https://doi.org/10.1111/j.1467-9817.2009.01402.x)).
- Extra letter spacing is a crowding/dyslexia remedy ([Zorzi et al., *PNAS*](https://doi.org/10.1073/pnas.1205566109)), not a general beginner aid; 6-year-olds did not benefit from looser or tighter than default ([Reynolds & Walker](https://doi.org/10.1111/j.1467-9817.2004.00216.x)).
- "Dyslexia fonts" do not work; children preferred Arial ([Kuster et al., *Annals of Dyslexia*](https://doi.org/10.1007/s11881-017-0154-6)).
- **UNVERIFIED:** any experimental support for Sassoon Primary, Gill Sans Infant, Century Gothic or Comic Sans for beginners, and any evidence that typeface choice mitigates b/d/p/q confusion. That is professional opinion, not evidence.

**Use a large, plain, high-contrast sans in capitals. Do not buy a children's typeface.**

### 2.6 Norwegian orthography, and why the English band names are a poor bet

Norwegian is a shallow orthography and English is not. Seymour, Aro & Erskine measured end-of-Grade-1 accuracy at Norwegian **91.8%** familiar words / **90.8%** nonwords versus Scottish English **33.9% / 29.3%**, concluding "the rate of development in English is **more than twice as slow**" ([*British Journal of Psychology*](https://doi.org/10.1348/000712603321661859)). Norwegian is at the low end of the shallow group — Hofslundsengen, Hagtvet & Gustafsson call it "**semi-consistent**" and note the Norwegian "preschool tradition that does not encourage the learning of written language skills" ([*Reading and Writing*](https://doi.org/10.1007/s11145-016-9646-8)).

**The band names are in the wrong language for letter–sound learning.** SABATON and METALLICA use Norwegian-native letterforms but not Norwegian mappings: ⟨th⟩, ⟨a⟩ = /æ/ and ⟨c⟩ = /k~s/ have no Norwegian counterpart, and Norwegian letter *names* are "em", "kå", not "em", "kay". Norwegian has 29 letters, of which c, q, w, x and z are loan-letters ([SNL, *det norske alfabetet*](https://snl.no/det_norske_alfabetet)). English arrives formally in 1. trinn ([Udir, ENG01-04](https://www.udir.no/lk20/eng01-04/kompetansemaal-og-vurdering/kv1)).

This is another argument for **letter names over letter sounds**: "S" as a shape with a name works in both languages. "SABATON" as a sound-out target works in neither.

Norwegian preschoolers do already treat English as a **play language**, which makes the English band names culturally unremarkable rather than a problem ([Lund, UiS, in *Utdanningsnytt*](https://www.utdanningsnytt.no/forste-steg-lek-min-doktorgrad/barn-har-engelsk-som-lekesprak/356574)).

**UNVERIFIED / genuine gap:** there is no research at all on L2 or cross-linguistic environmental print; ERIC returns zero relevant hits.

### 2.7 Norway: what the Rammeplan actually says, and the norm you are cutting against

This matters more than the parent may expect, so here it is precisely.

**Norwegian children start school the year they turn six.** *Opplæringslova* § 2-1: *"Barn har rett til offentleg grunnskoleopplæring frå det året dei fyller seks år"*; § 2-2 imposes the corresponding *plikt* ([Lovdata](https://lovdata.no/dokument/NL/lov/2023-06-09-30)). Your child has two years to go.

**The barnehage is legally a pedagogical institution, but an explicitly non-academic one.** *Barnehageloven* § 1 requires the barnehage to *"møte barna med tillit og respekt, og anerkjenne barndommens egenverdi"* — to recognise **the intrinsic value of childhood**, not its value as preparation ([Lovdata, bhl § 1](https://lovdata.no/dokument/NL/lov/2005-06-17-64/%C2%A71)). That single clause is the Nordic social-pedagogy tradition in statute.

**§ 2 is, however, remarkably favourable to exactly what you are building:**

> *"Barnehagen skal støtte barns nysgjerrighet, kreativitet og vitebegjær og gi utfordringer med utgangspunkt i barnets interesser, kunnskaper og ferdigheter."*
> ([Lovdata, bhl § 2](https://lovdata.no/dokument/NL/lov/2005-06-17-64/%C2%A71))

Challenges *taking the child's own interests as the starting point*. A device built around the albums this particular child loves is the statutory ideal, not a deviation from it.

**The Rammeplan's mathematics area (`Antall, rom og form`) sets no numeral-recognition target at all.** What it asks is that children:

> *"leker og eksperimenterer med tall, mengde og telling og får erfaring med ulike måter å uttrykke dette på"*

and that staff:

> *"bruke bøker, spill, **musikk**, digitale verktøy, naturmaterialer, leker og utstyr for å inspirere barna til matematisk tenkning"*

([Udir, Antall, rom og form](https://www.udir.no/laring-og-trivsel/rammeplan-for-barnehagen/fagomrader/antall-rom-form/); official English: *"play and experiment with numbers, quantities and counting and gain experience of different ways of expressing these"* / *"use books, games, **music**, digital tools… to inspire the children's mathematical thinking"*, [Framework Plan for Kindergartens, p. 53–54](https://www.udir.no/contentassets/7c4387bb50314f33b828789ed767329e/framework-plan-for-kindergartens--rammeplan-engelsk-pdf.pdf)).

Read those two lines together: **"different ways of expressing" quantity, using music and digital tools, is a near-verbatim description of an ordered, numbered track list on a music player.** The Rammeplan does not merely permit this feature; it describes it.

**The language area is equally permissive and equally non-academic.** Children shall *"utforsker og gjør seg erfaringer med ulike skriftspråksuttrykk, som lekeskrift, tegning og bokstaver"* and staff shall *"støtte barnas lek med og utforsking av skriftspråket"* — support children's **play with** written language ([Udir, Kommunikasjon, språk og tekst](https://www.udir.no/laring-og-trivsel/rammeplan-for-barnehagen/fagomrader/kommunikasjon-sprak-tekst/)). There is no letter-knowledge goal, no phonics, no target alphabet.

**Lesesenteret — Norway's national reading centre — describes your child's situation almost exactly, and endorses the first-letter move.** From their page on *bokstavkjennskap*:

> *"Dette betyr **ikke** at barna skal **drilles** i alfabetet, men at de blant annet skal utforske og erfare bokstavers form, lyd og navn."*
>
> *"De første bokstavene barn viser interesse for er gjerne **egen bokstav** og bokstavene til andre personer, dyr og figurer de er opptatt av"*
>
> *"i sine første møter med bokstaver ser barna **bare** på formen."*

([Lesesenteret, UiS](https://www.uis.no/nb/nasjonalt-lesesenter/bokstavkjennskap-bokstavnavn-og-bokstavlyd)) — with a 4-year-old quoted on the same page saying *"P er Pippi sin bokstav, D er Donald sin bokstav… T er min bokstav."*

That last line — children at first see **only the shape** — is the Masonheimer finding (§2.1) restated in Norwegian by the national authority. And the middle line hands you the sanctioned move: **"S er Sabaton sin bokstav"** is the *Lesesenteret* pattern with a metal band substituted for Pippi. It is a **letter**, not a word, and it is exactly what §2.4 recommends on independent grounds.

**Progresjon is defined as following the child's existing obsession, not introducing new syllabus.** Staff shall *"oppdage, følge opp og utvide det barna allerede er opptatt av"* and *"legge til rette for fordypning, gjenkjennelse og gjentakelse"* — depth, recognition and **repetition** ([Udir, Progresjon](https://www.udir.no/laring-og-trivsel/rammeplan-for-barnehagen/arbeidsmater/progresjon/)). A child playing the same album for the fiftieth time is doing *fordypning*, and the Rammeplan regards that as a feature.

**The school-transition chapter asks for nothing academic.** It asks only that the oldest children *"få mulighet til å glede seg til å begynne på skolen"* — look forward to school ([Udir, Overgangen mellom barnehage og skole](https://www.udir.no/laring-og-trivsel/rammeplan-for-barnehagen/overganger/overgang-skole/)). No letters, no numerals, no prerequisites.

**On digital tools, there is a real caution.** The Rammeplan states that digital tools *"brukes med omhu og ikke dominere som arbeidsmåte"* and that *"personalet være aktive sammen med barna"* ([Udir, Barnehagens digitale praksis](https://www.udir.no/laring-og-trivsel/rammeplan-for-barnehagen/arbeidsmater/digital-praksis/)). The Norwegian norm is adult co-presence, not solo screen use. Your device is audio-first with an incidental screen, which is about as defensible as this gets — but the norm is worth knowing.

**Where the numeral symbol actually lands in Norwegian schooling: age 7.** In LK20, using numeral symbols is a competence aim *after Year 2*: *"bruke tallsymboler, tallord, tegning og konkreter til å representere posisjonssystemet"*. And — usefully for you — the same aim set contains:

> *"utforske tall, mengder og telling i lek, natur, billedkunst, **musikk** og barnelitteratur"*

([Udir LK20, MAT01-06, kompetansemål etter 2. trinn](https://www.udir.no/lk20/mat01-06/kompetansemaal-og-vurdering/kv6); machine-readable at [data.udir.no](https://data.udir.no/kl06/v201906/kompetansemaalsett-lk20/KV1021)). The Norwegian national curriculum names **music** as a legitimate context for exploring number — three years after your child's current age.

**So: is the parent cutting against local norms?** Partly, and it is worth being honest about which part.

- **Ambient numerals in a self-chosen music context: fully aligned.** The Rammeplan's language ("different ways of expressing", "music, digital tools", "play and experiment") covers it.
- **Any form of drilling, testing, tracking or "teaching him his numbers" before six: against the norm, and against the Rammeplan's whole posture.** Norwegian ECEC has an active, documented professional anxiety about exactly this. Otterstad & Braathe studied Norwegian practitioners' talk about the barnehage–school transition and found that *"readiness for schooling seems to become a standard for performing professionalism in daycare-centres"*, framing the Nordic social tradition as in tension with an imported school-readiness tradition ([Procedia — Social and Behavioral Sciences 2 (2010) 3023–3030](https://doi.org/10.1016/j.sbspro.2010.03.458)).

If the barnehage staff ever ask about the device, the sentence that will land is: *"det er en platespiller, tallene står bare der"* — it is a record player, the numbers are just there. That happens to be both the design and the pedagogy.

## 3. What music itself teaches, and how little of it belongs on the screen

### 3.1 The rhythm–reading link is real as *prediction* and near-null as *causation*

This is the most-oversold finding in children's-music marketing, so here it is with both halves.

**The prediction half is strong, and it was measured on children exactly your child's age.** Woodruff Carr, White-Schwoch, Tierney, Strait & Kraus (2014, *PNAS*) tested 35 children aged 3–4 (mean 4.37 years). Children drummed along to a beat and were split by Rayleigh's test into Synchronizers (n = 22) and Non-synchronizers (n = 13). The groups did **not** differ on age, verbal IQ, nonverbal IQ or receptive vocabulary. Synchronizers nonetheless outperformed Non-synchronizers on:

- **phonological awareness: Cohen's *d* = 1.33** (F(1,26) = 13.378, p = .001, in the 4-year-olds)
- auditory short-term memory: *d* = 0.74
- rapid naming: *d* = 0.77 (objects), 0.52 (colours)
- rhythm discrimination: *d* = 0.82; melody: *d* = 0.57
- precision of subcortical encoding of the speech envelope: *d* = 0.89

([PNAS 111(40):14559–14564](https://doi.org/10.1073/pnas.1406219111); [full text, PMC4210020](https://pmc.ncbi.nlm.nih.gov/articles/PMC4210020/)). A *d* of 1.33 on a group split by drumming ability, with IQ and vocabulary equated, is a genuinely large effect.

The mechanism is Goswami's temporal sampling account: sensitivity to **amplitude rise time**, the slow envelope onsets that mark syllables. Corriveau & Goswami found 70–80% of children with specific language impairment fall below the 5th percentile on rise-time sensitivity ([JSLHR](https://doi.org/10.1044/1092-4388(2007/046))) and are impaired at *paced* but not unpaced tapping ([Cortex](https://doi.org/10.1016/j.cortex.2007.09.008)). Rise-time sensitivity at **10 months** predicts rapid naming and letter knowledge at 60 months ([Brain Sciences 15(9):1012](https://doi.org/10.3390/brainsci15091012)). Tierney & Kraus formalise this as the precise auditory timing hypothesis ([Front. Hum. Neurosci.](https://doi.org/10.3389/fnhum.2014.00949)).

**The causation half collapses.** Gordon et al. (2015) meta-analysed 13 music-training studies (n = 901) meeting direct-transfer criteria: phonological awareness gain **d ≈ 0.2**, which the authors themselves call small relative to the variance in these skills, and **no significant aggregate transfer to reading fluency** ([Front. Psychol. 6:1777](https://doi.org/10.3389/fpsyg.2015.01777)). Sala & Gobet (2020), N = 6,984, k = 254: once design quality is controlled, the effect of music training on cognitive and academic outcomes is **ḡ ≈ 0 with τ² ≈ 0** — no true between-study variability. A small ḡ ≈ 0.20 appears *only* in studies lacking random allocation and active controls ([Memory & Cognition](https://doi.org/10.3758/s13421-020-01060-2)). A 2025 quasi-experiment with 164 third-graders makes it vivid: a 10-week rhythm-enriched class improved rhythm skills (d = 0.57) and rhythm correlated with literacy at both timepoints (ρ = .20–.35), but **rhythm growth did not correlate with literacy growth and there were no between-group literacy differences** ([Front. Hum. Neurosci.](https://doi.org/10.3389/fnhum.2025.1636278)).

**What this means for you, stated bluntly.** Beat-keeping is an excellent *marker* of the auditory-timing machinery that reading will later use. It is not a *lever* on reading. Build beat features because a 4-year-old drumming along is good in itself. **Never tell yourself, your partner, or the barnehage that the device improves reading.** The causal literature will not carry that sentence, and the nulls are unusually stable.

Also worth knowing: "rhythm" is not one skill. Beat tapping and rhythm memory/sequencing dissociate ([PLOS ONE](https://doi.org/10.1371/journal.pone.0136645)), with sequencing tied to verbal memory and reading while synchronisation is tied only to nonverbal temporal processing ([J. Cogn. Neurosci.](https://doi.org/10.1162/jocn_a_01092)). They are not interchangeable affordances.

### 3.2 Repetition is the mechanism, and your player already maximises it

Melody scaffolds verbal material. Infants learn lyrics more easily when melody and lyrics are correlated than from either alone ([Thiessen & Saffran, *Ann. NY Acad. Sci.*](https://doi.org/10.1111/j.1749-6632.2009.04547.x)); consistent pitch–syllable mapping in sung sequences aids speech-stream segmentation ([Schön et al., *Cognition* 2008, "Songs as an aid for language acquisition"](https://doi.org/10.1016/j.cognition.2007.03.005) — adults, artificial language); infants' phonetic recognition is facilitated in song ([Lebedeva & Kuhl](https://doi.org/10.1016/j.infbeh.2010.04.006)); a repeated simple melody improves verbatim text recall ([Wallace, *JEP:LMC* 1994](https://doi.org/10.1037/0278-7393.20.6.1471) — adults); televised songs beat spoken presentation for memory of educational content ([Calvert, *Media Psychology*](https://doi.org/10.1207/s1532785xmep0304_02)).

The through-line is **repetition of the same material**, not variety. A player that makes replaying the same album for the fiftieth time completely frictionless — no menus, no "discover", no shuffle-by-default — is doing the pedagogic work already, and it happens to be exactly what the Rammeplan calls *fordypning, gjenkjennelse og gjentakelse*. **Do not add a recommender. Do not add novelty pressure.** The single most pedagogically valuable property of this device is that it lets a child wear a groove in one record.

### 3.3 Which musical concepts a 4-year-old can hold — and the one to avoid

Safe at four: **loud/quiet (dynamics), fast/slow (tempo), which instrument (timbre), same/different**. Trehub's review notes musical enculturation proceeds **faster for temporal than for pitch processing** ([Psihologijske teme](https://doi.org/10.31820/pt.32.1.1); [Nat. Neurosci.](https://doi.org/10.1038/nn1084)).

**Pitch height is the trap, and the evidence is specific.** Webster & Schlentrich tested 107 four- and five-year-olds on pitch-*direction* discrimination across verbal, gestural and performance response modes: **34% responded at or below chance regardless of response mode** ([*JRME*](https://doi.org/10.2307/3345082)). Worse, the vertical metaphor itself is partly linguistic. A proto-mapping may be present in infancy ([Dolscheid et al., *Psych. Science* 2014](https://doi.org/10.1177/0956797614528521); [Walker et al. 2010](https://doi.org/10.1177/0956797609354734) — though [Lewkowicz & Minar](https://doi.org/10.1177/0956797613516011) directly dispute it), but Farsi speakers, whose language codes pitch as thin/thick, are interfered with by *thickness* rather than *height*, and Dutch speakers trained on a thickness metaphor shift accordingly ([Dolscheid, Shayan, Majid & Casasanto, "The Thickness of Musical Pitch", *Psych. Science* 2013](https://doi.org/10.1177/0956797612457374)).

So: **do not build a high/low pitch visualisation.** A third of the target age responds at chance, and the "up/down" label you would be teaching is a language-specific convention, not a fact about sound. Loud/quiet and fast/slow carry no such baggage.

### 3.4 Visual beat displays: the evidence says don't

Auditory sequences support far more stable synchronisation than visual flashes ([Repp](https://doi.org/10.3758/bf03206433); [Repp & Su](https://doi.org/10.3758/s13423-012-0371-2)). Adults recover much of the gap with a *smoothly moving* stimulus such as a bouncing ball ([Hove & Keller](https://doi.org/10.1525/mp.2010.28.1.15); [Iversen, Patel & Nicodemus](https://doi.org/10.1016/j.cognition.2014.10.018)).

**Children do not get that recovery.** Mu, Huang, Ji, Gu & Wu (2018, *JEP:HPP*) found that in 6–7-year-olds, synchronisation to a **bouncing ball was less stable than to tones**; the gap closed only by 12–15 years. Flashes were worst for every age group ([doi:10.1037/xhp0000500](https://doi.org/10.1037/xhp0000500)). A flashing on-screen metronome for a 4-year-old is close to useless as an entrainment aid — and your child is two years below the youngest group tested.

**What does work at this age is a person.** Kirschner & Tomasello (2009) had 36 children aged 2.5, 3.5 and 4.5 drum with a human partner, a drum machine, or a speaker. With a social partner, even 2.5-year-olds adjusted tempo away from their spontaneous motor tempo, and **children at every age synchronised more accurately in the social condition** ([*JECP*](https://doi.org/10.1016/j.jecp.2008.07.005)).

Your screen is the machine condition. A parent clapping in the kitchen is the partner condition. **The beat feature you want is not a feature.** It is the speaker being loud enough and the parent being in the room.
## 4. How to embed learning without wrecking the thing

This is the section that matters. Everything above says *what* a 4-year-old can learn. This says what will happen to the device if you try to teach him.

### 4.1 Extrinsic rewards: the effect is real, and children are the worst-affected group

The founding study was run on children your child's age, on an activity they already enjoyed.

**Lepper, Greene & Nisbett (1973), "Undermining children's intrinsic interest with extrinsic reward: A test of the 'overjustification' hypothesis."** Nursery-school children drawing with magic markers. Children who were **promised a "Good Player" award in advance** later spent **less** free-choice time drawing than children who received an unexpected reward or no reward at all ([*JPSP* 28(1):129–137](https://doi.org/10.1037/h0035519)). **UNVERIFIED:** I confirmed title, authorship, journal and year via Crossref but could not obtain the full text through open channels; exact sample size and age band are not verified here.

**Deci, Koestner & Ryan (1999)**, meta-analysis of 128 studies in *Psychological Bulletin*. Free-choice intrinsic motivation was significantly undermined by:

| Reward type | Effect on free-choice behaviour |
|---|---|
| Engagement-contingent | ***d* = −0.40** |
| Completion-contingent | ***d* = −0.36** |
| Performance-contingent | ***d* = −0.28** |

Self-reported interest fell too (engagement-contingent *d* = −0.15; completion-contingent *d* = −0.17). And the crucial sentence for you:

> **"Tangible rewards tended to be more detrimental for children than college students."**

([doi:10.1037/0033-2909.125.6.627](https://doi.org/10.1037/0033-2909.125.6.627))

**But the same meta-analysis hands you the escape hatch.** Positive feedback **enhanced** free-choice behaviour (***d* = +0.33**) and self-reported interest (***d* = +0.31**).

That asymmetry is the entire design rule: **informational feedback is good; contingent tangible reward is bad.** A quiet acknowledgement that something happened is a different category from a star you earned.

**The counter-position and how it resolved.** Cameron & Pierce argued the undermining effect was minimal ([*RER* 1994](https://doi.org/10.3102/00346543064003363); [*Am. Psych.* 1996](https://doi.org/10.1037/0003-066x.51.11.1153)), with an exchange in *Psychological Bulletin* ([Eisenberger, Pierce & Cameron](https://doi.org/10.1037/0033-2909.125.6.677)) and a rebuttal in *RER* 2001 in which Deci, Koestner & Ryan called the opposing meta-analysis "seriously flawed" ([doi](https://doi.org/10.3102/00346543071001001)). As the field now reads it: **both sides agree that verbal praise and positive feedback enhance intrinsic motivation, and that unexpected and non-contingent rewards are harmless.** The dispute was over *expected tangible* rewards, where Deci et al.'s position is mainstream.

Note where your design sits in the risk space: **a young child, on an activity he already loves, with expected salient rewards** — the worst cell in the table on every dimension.

The underlying framework is Self-Determination Theory's three needs: autonomy, competence, relatedness ([Ryan & Deci, *American Psychologist* 2000](https://doi.org/10.1037/0003-066x.55.1.68); [primary PDF](https://selfdeterminationtheory.org/SDT/documents/2000_RyanDeci_SDT.pdf)). A record player a child operates entirely by himself is an autonomy-support machine. A sticker chart bolted to it is not.

### 4.2 Gamification for this age: no evidence base, documented downside

Sailer & Homner's meta-analysis is the strongest pro-gamification citation and it is weaker than it is usually quoted as: cognitive *g* = .49 (k = 19), motivational *g* = .36 (k = 16), behavioural *g* = .25 (k = 9) — but **only the cognitive effect was stable under high methodological rigour**, and the moderators that mattered were *game fiction* and *social interaction*, **not points or badges** ([*Educational Psychology Review*](https://doi.org/10.1007/s10648-019-09498-w)).

Against it: Hanus & Fox ran a longitudinal classroom study with leaderboards and badges and found gamified students showed **less motivation, satisfaction and empowerment over time** ([*Computers & Education*](https://doi.org/10.1016/j.compedu.2014.08.019); [corrigendum](https://doi.org/10.1016/j.compedu.2018.09.019)). The fairest counterweight is Filsecker & Hickey, who found no undermining with external rewards in an educational game with elementary students ([doi](https://doi.org/10.1016/j.compedu.2014.02.008)).

**Net: badges, stars, streaks and progress-toward-a-goal bars have no credible evidence base for preschoolers, and a documented downside risk in older learners. Streaks are a nag mechanism by construction** — the whole point of a streak is that breaking it costs you something, which is precisely the pressure you have designed this device to not apply.

### 4.3 Chocolate-dipped broccoli: the primary source, and it is about your exact mistake

The phrase everyone half-quotes comes from Amy Bruckman, "Can Educational Be Fun?", Game Developers Conference, San Jose, 17 March 1999 ([publication list](https://faculty.cc.gatech.edu/~asb/papers.html); [PDF](https://faculty.cc.gatech.edu/~asb/papers/conference/bruckman-gdc99.pdf)). Verbatim:

> "Most attempts at making software both educational and fun end up being neither. Fun is often treated like a sugar coating to be added to an educational core. Which makes about as much sense as **chocolate-dipped broccoli**."

(Note: the original is "chocolate-**dipped**", not the folk-quoted "chocolate-covered".)

She then dissects Math Blaster — correct answers earn bullets, enough answers unlock a shooting minigame — and writes:

> "kids tend to internalize the implicit message that math isn't actually interesting. Ever wonder how kids come to decide that learning is awful? This is how."

**Your device inverts the failure mode, which is why it can work.** Math Blaster wraps a task in a reward. You have a genuinely loved object and are considering adding accurate information to it. The danger is the *reverse* direction: that a numeral becomes a thing the child is expected to perform, at which point the album becomes the reward and the number becomes the broccoli. The single rule that prevents this: **the device never evaluates the child.**

Mizuko Ito's *Engineering Play: A Cultural History of Children's Software* (MIT Press, 2009) gives the historical anatomy, organised around three genres — Academics, Entertainment, Construction — with the academic/drill genre being exactly the edutainment lineage Bruckman attacks ([doi:10.7551/mitpress/7939.001.0001](https://doi.org/10.7551/mitpress/7939.001.0001)).

### 4.4 Seductive details: decoration actively harms

Harp & Mayer, "How seductive details do their damage: A theory of cognitive interest in science learning" — interesting-but-irrelevant added material **reduces** learning of the core content ([*J. Educational Psychology* 90(3):414](https://doi.org/10.1037/0022-0663.90.3.414)). Rey's meta-analysis confirms the effect is reliable ([*Educational Research Review*](https://doi.org/10.1016/j.edurev.2012.05.003)); Mayer's re-appraisal ([*Applied Cognitive Psychology*](https://doi.org/10.1002/acp.3503)) and Korbach et al. ([*Learning and Individual Differences*](https://doi.org/10.1016/j.lindif.2016.08.030)) show it is moderated by working-memory capacity — which cuts *against* decorating an interface for the youngest, lowest-working-memory users you could possibly have.

**Concretely: no confetti, no celebratory particles, no wiggling mascot, no animated number that bounces when the track starts.** Every one of those is a seductive detail sitting next to the thing you wanted noticed. NN/g's own finding is consistent — a Starfall counting game "failed to teach counting skills" because the connections between elements were never made plain amid the activity ([NN/g, *Designing for Kids: Cognitive Considerations*](https://www.nngroup.com/articles/kids-cognition/)).

The corollary is the strongest argument for the parent's idea: **an accurate, plain, undecorated numeral is not a seductive detail. It is the content.**

### 4.5 Should the device ever ask the child anything? No. Not once.

This is the parent's real question, so here is a direct answer with the mechanism.

**What makes on-screen prompting work in the cases where it works is *contingency*, not the question.** Roseberry, Hirsh-Pasek & Golinkoff ("Skype Me! Socially Contingent Interactions Help Toddlers Learn Language", *Child Development* 2014) found toddlers learned verbs from live video chat and from in-person interaction, **but not from yoked, non-contingent video** ([doi](https://doi.org/10.1111/cdev.12166)); replicated for grammar by Buckle et al. ([doi](https://doi.org/10.1080/15475441.2024.2313221)). Background on the video deficit: [Anderson & Pempek](https://doi.org/10.1177/0002764204271506).

The *Blue's Clues* / *Dora* pseudo-interaction tradition ([Crawley, Anderson, Wilder et al., *JEP* 1999](https://doi.org/10.1037//0022-0663.91.4.630); [Calvert, Strong, Jacobs & Conger, *Media Psychology* 2007](https://doi.org/10.1080/15213260701291379)) does show learning benefits from participation structures — but the working parts are **a scripted pause, a trusted character the child has a parasocial relationship with, and the correct answer supplied immediately afterwards** ([parasocial relationships and toddler maths learning](https://doi.org/10.1080/15213269.2013.783774)).

**Your device has none of those parts.** A question it cannot judge ("Hvilket tall er dette?") offers no contingency, no feedback and no parasocial partner. It is a prompt with the mechanism removed. **UNVERIFIED as a direct empirical claim** — I found no study isolating unjudgeable on-screen questions in a non-narrative app — but the inference from the contingency literature is strong.

And the cost is not zero. A question the child ignores teaches him the device nags. A question he answers wrong, to a machine that cannot tell him, teaches him nothing and may teach him the wrong thing. A question he answers right, to a machine that does not notice, is worse than silence.

> **Recommendation, unambiguous: numbers are decorative-but-accurate. The device never asks, never tests, never congratulates, never tracks, never reports progress. There is no quiz mode, not even an optional one, not even behind the parent gate.**

The one thing it may do, sparingly, is what Deci et al. found actually helps: give **informational feedback about the world, not about the child**. "Track 3 is now playing" rendered as the numeral 3 lighting up is information about the music. "Well done, you found track 3!" is an evaluation of the child. The first is free; the second costs you *d* ≈ −0.3.

### 4.6 The positive design rule: ambient, never blocking

The design pattern that satisfies all of the above is straightforward:

1. **The pedagogic content is always visible and never required.** The child reaches music without ever attending to it.
2. **It is accurate.** Track 7 says 7. Duration is the real duration. Accuracy is what makes it learnable at all — a decorative-but-wrong numeral is worse than none.
3. **It is stable.** The same album shows the same numerals in the same places every time. Repetition of an identical display is the mechanism (§1.6, §3.2).
4. **It never moves, animates or interrupts** to attract attention (§4.4).
5. **It never gates.** No task stands between the child and the play button.
6. **It never records.** No progress, no history shown to the child, no report to the parent. A progress metric will eventually make someone want to move it, and then the device has an agenda.

Hirsh-Pasek, Zosh, Golinkoff, Gray, Robb & Kaufman's four pillars of genuinely educational apps are **active (minds-on, not finger-on), engaged (without distraction), meaningful, and socially interactive**, "within the context of a supported learning goal" ([*Psychological Science in the Public Interest* 16(1):3–34](https://doi.org/10.1177/1529100615569721)). Your device scores well on *meaningful* and, because a parent is usually in the room with a loud speaker, decently on *socially interactive*. The phrase to hold onto is **"engaged without distraction"**. (**UNVERIFIED** at quote level beyond the pillar definitions — I could not access the full text.)

Norway's own framework says the same thing in its own idiom: the NAEYC DAP position statement notes that "students who are taught math primarily through memorization and rote learning are **more than a year behind** those who have been taught by relating math concepts to their existing knowledge", and that "**giving children autonomy and agency**… promotes deeper learning and improves executive functioning" ([NAEYC, *Developmentally Appropriate Practice*, 2020](https://www.naeyc.org/resources/position-statements/dap/contents); [PDF via Internet Archive](https://web.archive.org/web/2022/https://www.naeyc.org/sites/default/files/globally-shared/downloads/PDFs/resources/position-statements/dap-statement_0.pdf)).

## 5. Ten candidate features, ranked

Ranked by **evidence strength × fit with a record player**. The verdict column is the whole point: four of these are worse than doing nothing.

| # | Feature | Evidence | Fit | Verdict |
|---|---|---|---|---|
| 1 | Numbered linear track list | Strong | Perfect | **Build** |
| 2 | Frictionless repetition; no recommender; stable grid order | Strong | Perfect | **Build (by not building)** |
| 3 | Band name in plain capitals on the now-playing view | Moderate | Good | **Build** |
| 4 | Volume as a linear stack of bars | Moderate | Good | **Build** |
| 5 | Album art large, uncropped, high fidelity | Weak but free | Perfect | **Build** |
| 6 | Album-duration ribbon | Weak | Good | **Maybe, carefully** |
| 7 | Genre or colour grouping of the grid | Weak | Poor | **Don't** |
| 8 | Visual beat / pulsing animation | Contrary | Poor | **Don't** |
| 9 | Pitch high/low visualisation | Contrary | Poor | **Don't** |
| 10 | Geography — where the bands are from | Contrary | Poor | **Don't** |
| — | Quiz, question, reward, sticker, streak, progress tracking | Strongly contrary | Fatal | **Never** |

---

### 5.1 Numbered linear track list — **build this**

**What it teaches.** Numeral identification (the earliest-acquired and most predictive numeral skill), ordinal position via spatial layout, and one-to-one correspondence between a symbol and a thing the child loves.

**Evidence.** This is the best-supported feature in the document. Ramani & Siegler's linear numbered board game produced numeral-identification gains of **between-group *d* = 0.80 at nine-week follow-up** from about one hour of play ([doi](https://doi.org/10.1111/j.1467-8624.2007.01131.x)); Siegler & Ramani showed the **linear** layout was causally responsible (number-line linearity 14% → 39% linear vs 15% → 21% circular, in children aged 4;0–5;5) ([doi](https://doi.org/10.1037/a0014239)). Knudsen shows naming a digit precedes knowing its value, so recognition is the cheap skill ([doi](https://doi.org/10.5964/jnc.v1i1.4)). Mix et al. show 4½-year-olds identify "12" at ceiling ([doi](https://doi.org/10.1111/cdev.12197)). Göbel et al. show numeral knowledge — not magnitude comparison — predicts arithmetic growth ([doi](https://doi.org/10.1177/0956797613516471)). And the counting-book RCT shows numerals need something to be *about* ([doi](https://doi.org/10.1037/dev0001826)).

**How it renders with no required reading and huge targets.**

- One **vertical column**, evenly spaced, top to bottom. Never a wheel, arc, ring or carousel — §1.6 says the geometry carries the effect.
- Each row is a **full-width touch target, ≥ 96 px tall** (above the 76 px floor, because rows are adjacent and a missed tap lands on a neighbour).
- The numeral sits **left**, large (≥ 64 px), plain sans, high contrast. Equal optical width for 1–9 and 10+ so the column stays straight (tabular figures).
- The rest of the row is the **track title in small, dim type** — present for the parent, ignorable by the child, carrying no function.
- **Tapping a row plays from that track.** This is not a new verb; it is *play*, aimed at a smaller object. It is what makes "3" mean *the good one* rather than decoration.
- The **currently playing row is highlighted** by a solid block of colour, not an animation.

**Risk.** It puts a list on a screen that previously had none, and a missed tap plays the wrong song. Both are acceptable: every outcome is music, and recovery is one more tap. The real risk is scope creep into a queue editor — **do not add one**.

---

### 5.2 Frictionless repetition, no recommender, stable grid — **build this by not building things**

**What it teaches.** Everything else in this document. Repetition of identical material is the verified mechanism behind both the numeral gains (§1.6) and the musical/verbal memory findings (§3.2), and stable spatial position is how a pre-reader navigates at all.

**Evidence.** Melody-scaffolded memory depends on repeated exposure to the *same* material ([Wallace](https://doi.org/10.1037/0278-7393.20.6.1471); [Thiessen & Saffran](https://doi.org/10.1111/j.1749-6632.2009.04547.x)). Ramani & Siegler's effect came from four repetitions of one game. The Rammeplan asks staff to enable *"fordypning, gjenkjennelse og gjentakelse"* ([Udir](https://www.udir.no/laring-og-trivsel/rammeplan-for-barnehagen/arbeidsmater/progresjon/)).

**How it renders.** As absences. **No shuffle-by-default. No "discover". No recommendations. No "recently played" reordering. No badge on new albums.** The grid is in a fixed order and stays there forever, so that the third cover in the second row is *always* the same album. A child who has memorised a position has built a spatial index; reordering the grid destroys it.

**Risk.** The parent will be tempted by novelty features. Resist. The single most pedagogically valuable property of this device is that it lets a child wear a groove in one record.

---

### 5.3 Band name in plain capitals on the now-playing view — **build this**

**What it teaches.** Print concepts, print motivation, and — with a parent in the room — initial-letter knowledge.

**Evidence.** Eye-tracking shows pre-readers produce "**more and longer fixations for standard print words without contextual cues**" and that "print learning may be facilitated by using environmental print with **larger and more centralized fonts**" ([Neumann et al., *RRQ*](https://doi.org/10.1002/rrq.66)); pre-readers attend more to **print-salient** than picture-salient items ([doi](https://doi.org/10.1007/s11145-014-9531-2)). Initial letters are the gentle target ([Treiman & Broderick](https://doi.org/10.1006/jecp.1998.2448)), uppercase comes first by a factor of 16 ([Turnbull et al.](https://doi.org/10.1044/1092-4388(2010/09-0093))), and Lesesenteret's own guidance is *"S er Sabaton sin bokstav"* in all but name ([UiS](https://www.uis.no/nb/nasjonalt-lesesenter/bokstavkjennskap-bokstavnavn-og-bokstavlyd)).

**How it renders.** The **cover keeps its logo, untouched** — it is the album's identity and the child's primary cue. Separately, on the now-playing view, set the band name **once, large, centred, in plain high-contrast sans capitals**. Not a children's typeface: size beats face, and Verdana beat Sassoon Primary in the one head-to-head ([Wilkins et al.](https://doi.org/10.1111/j.1467-9817.2009.01402.x)). It is never a control and never required.

**Risk.** Low, but be honest about the ceiling: NELP puts environmental print at ***r* = 0.28**, below its own "weak" cutoff ([NELP, Table 2.1](https://www.nichd.nih.gov/sites/default/files/publications/pubs/documents/NELPReport09.pdf)), and the one RCT with a plain-print control found the logo bought **motivation only** ([Neumann, Hood & Ford](https://doi.org/10.1007/s11145-012-9390-7)). **This feature buys the parent an opening line, not literacy.** That is still worth one text node.

---

### 5.4 Volume as a linear stack of bars — **build this**

**What it teaches.** Ordinal magnitude in a second, non-numeric modality, plus the loud/quiet contrast, which is one of the few musical concepts safe at four.

**Evidence.** Dynamics and tempo are reliably discriminable at four, unlike pitch direction ([Webster & Schlentrich](https://doi.org/10.2307/3345082) found **34% at or below chance** on pitch direction); musical enculturation runs faster for temporal than pitch processing ([Trehub](https://doi.org/10.31820/pt.32.1.1)). The linear-array magnitude mechanism is the same one as §1.6.

**How it renders.** You already have two large volume buttons (never a slider — doc 02 §5.3). Render the current level as a **row of discrete filled blocks**, evenly spaced, growing left to right. Five to seven steps, hard ceiling. The child sees quantity change as a straight line, which is the Siegler & Ramani geometry for free.

**Risk.** Essentially none — it is a better rendering of a control that must exist anyway. Do **not** put a number on it.

---

### 5.5 Album art large, uncropped, high fidelity — **build this**

**What it teaches.** Aesthetic and cultural exposure, and — more practically — it is the child's entire navigation system.

**Evidence.** The Rammeplan's *Kunst, kultur og kreativitet* asks that children "møter et mangfold av kunstneriske og kulturelle uttrykksformer" ([Udir](https://www.udir.no/laring-og-trivsel/rammeplan-for-barnehagen/fagomrader/kunst-kultur-kreativitet/)). NN/g found 3-year-olds already read standard transport iconography, so pictures are the working channel ([NN/g](https://www.nngroup.com/articles/childrens-websites-usability-issues/)). This is the weakest evidence base in the "build" tier, and it costs nothing.

**How it renders.** Square, uncropped, as large as the grid allows; the now-playing view shows it near-fullscreen. Do not overlay text on it. Do not letterbox.

**Risk.** None, beyond the decode-performance work already covered in doc 02 §4.3.

---

### 5.6 Album-duration ribbon — **maybe, carefully**

**What it teaches.** Duration as linear extent; "this is a long one".

**Evidence.** **Weak, and I will not oversell it.** The linear-magnitude mechanism is well supported in the numeral domain (§1.6), but **UNVERIFIED:** I found no research on children's comprehension of progress bars, and clock reading is a Norwegian *after-Year-2* aim, i.e. age 7 ([Udir LK20](https://data.udir.no/kl06/v201906/kompetansemaalsett-lk20/KV1021)).

**How it renders.** A single plain horizontal ribbon that fills left to right across the album. Not a countdown. Not a number. Not draggable — scrubbing is a precise drag, which doc 02 §5 rules out.

**Risk.** A visible depleting bar can read as time pressure, and it invites the parent to add "5 minutes left" nagging. If in doubt, skip it. It is the only "maybe" on the list for a reason.

---

### 5.7 Genre or colour grouping of the grid — **don't**

**What it would teach.** Categorisation.

**Why not.** It requires **reordering the grid**, which destroys the spatial index that is the child's actual navigation method. The categorisation payoff is speculative; the navigation cost is certain. If you want categories, express them as *fixed neighbourhoods in the permanent layout* — thrash metal always lives in the top-left — and never as a filter the child can toggle. A filter is also a fourth verb.

---

### 5.8 Visual beat or pulsing animation — **don't**

**Why not.** The evidence points the wrong way. In 6–7-year-olds — two years older than your child — synchronisation to a **bouncing ball was less stable than to tones**, and flashes were worst for every age group ([Mu et al., *JEP:HPP*](https://doi.org/10.1037/xhp0000500)). Meanwhile, pulsing decoration is a textbook seductive detail, and seductive details reduce learning of the core content, most in low-working-memory learners ([Harp & Mayer](https://doi.org/10.1037/0022-0663.90.3.414); [Rey](https://doi.org/10.1016/j.edurev.2012.05.003)).

**What works instead is not a feature.** Children synchronise markedly better with a **human partner** than with a machine at 2.5, 3.5 and 4.5 years ([Kirschner & Tomasello](https://doi.org/10.1016/j.jecp.2008.07.005)). The beat feature is the speaker being loud and a parent clapping in the kitchen.

---

### 5.9 Pitch high/low visualisation — **don't**

**Why not.** **34% of 4- and 5-year-olds respond at or below chance** on pitch direction regardless of response mode ([Webster & Schlentrich](https://doi.org/10.2307/3345082)). And the vertical metaphor is partly linguistic convention, not a fact about sound — Farsi speakers are interfered with by *thickness* rather than height, and Dutch speakers trained on a thickness metaphor shift accordingly ([Dolscheid et al., *Psych. Science*](https://doi.org/10.1177/0956797612457374)). You would be teaching a third of the target age nothing, and the rest an arbitrary convention.

---

### 5.10 Geography — where the bands are from — **don't**

**Why not.** Preschoolers have documented difficulty with plan (overhead) maps — the representational correspondence is the problem, not the geography ([Liben & Yekel, *Child Development*](https://doi.org/10.2307/1131752); [Liben & Downs](https://doi.org/10.1016/s0065-2407(08)60414-0)). A flag next to a cover is a decorative sticker with no referent a 4-year-old can access: "Sverige" is not a place to him, it is a word. This is a seductive detail with a geography rationale bolted on.

---

### Never: quizzes, questions, rewards, stickers, streaks, progress tracking

Covered in §4.1 and §4.5. Briefly: expected tangible rewards undermine free-choice intrinsic motivation at ***d* = −0.28 to −0.40**, and "**tangible rewards tended to be more detrimental for children than college students**" ([Deci, Koestner & Ryan](https://doi.org/10.1037/0033-2909.125.6.627)). A question the device cannot judge has no contingency, and contingency is the active ingredient ([Roseberry et al.](https://doi.org/10.1111/cdev.12166)). And direct drilling of environmental print **underperformed doing nothing** ([Kuby & Aldridge](https://doi.org/10.1080/0270271970180201)), a result echoed by Lesesenteret's *"barna skal ikke drilles i alfabetet"* ([UiS](https://www.uis.no/nb/nasjonalt-lesesenter/bokstavkjennskap-bokstavnavn-og-bokstavlyd)).

This is the one place to be absolute. **No quiz mode, not even optional, not even behind the parent gate.** An optional quiz mode is a quiz mode that gets switched on during a bad week.

## 6. The verdict on the track-number idea

**Good idea. Build it. It is the best-supported pedagogic feature available to this device, and it is better supported than the parent probably realises — but for a different reason than the one they had in mind.**

The parent framed it as "learning to read track numbers". The evidence says the numerals are only half of it. **The other half — and the half with the causal evidence behind it — is the linear, evenly spaced layout.** Siegler & Ramani ran the identical numbered game on a linear versus a circular board with children aged 4;0–5;5 and got 14% → 39% versus 15% → 21% on number-line linearity, plus better subsequent learning from arithmetic instruction ([doi](https://doi.org/10.1037/a0014239)). Same numerals, same content; the geometry carried the effect.

So the thing to build is not "a track list with numbers on it". It is **a number line that happens to play music.**

### 6.1 Exactly how to render it

1. **A single vertical column, evenly spaced, top to bottom.** Equal row heights regardless of song length. **Never** a wheel, ring, arc, carousel or circular scroller — that is the condition that did not work.
2. **Rows ≥ 96 px tall, full screen width.** Above the 76 px floor because rows are adjacent, and roughly half of taps miss at this age ([NN/g](https://www.nngroup.com/articles/children-ux-physical-development/)).
3. **The numeral on the left, ≥ 64 px, plain high-contrast sans, tabular figures** so 1–9 and 10+ stay optically aligned and the column reads as a straight line.
4. **True track numbers, 1 to *n*.** No truncation, no renumbering, no "simplified to 1–5". Accuracy is what makes it learnable; a decorative-but-wrong numeral is worse than none.
5. **Tapping a row plays from that track.** This is *play* aimed at a smaller object, not a fourth verb. It is also what gives the numeral a referent — and numerals need something to be *about* ([counting-book RCT](https://doi.org/10.1037/dev0001826)).
6. **The playing row is marked by a solid block of colour.** Not a pulse, not a glow, not an animation ([Harp & Mayer](https://doi.org/10.1037/0022-0663.90.3.414)).
7. **The track title sits in small, dim type to the right** — legible to a parent, ignorable by the child, carrying no function. The child operates the row, not the text.
8. **It lives on the now-playing view, not on the cover grid.** The grid stays pure covers.
9. **Nothing else.** No duration per track, no play counts, no favourites, no stars.

### 6.2 What not to do, specifically

- **No dots or pips alongside the numeral for anything above 3.** This is the one correction to the obvious "show the quantity too" instinct: the mean subitizing range at 42–57 months is **2.8** ([Gray & Reeve](https://doi.org/10.1371/journal.pone.0094428)). Eleven dots is texture, not a quantity. **The linear position in the column already *is* the non-symbolic magnitude cue** — that is precisely the board-game mechanism — so you get the benefit without the clutter.
- **Never require an ordinal comparison.** Only 26% of 4-year-olds can order the digits 1–6 at all, and 56.5% cannot place a single digit correctly ([Knudsen et al.](https://doi.org/10.5964/jnc.v1i1.4)). Next/previous buttons are fine — they are a direction, not a number.
- **Never ask about a number.** §4.5. No quiz, no prompt, no "can you find track 4?", not even from a friendly voice.
- **Never reward engaging with it.** §4.1.
- **Do not put a number on the volume control.** It would collide with the track numerals as a competing referent for the same symbols.

### 6.3 What to expect, honestly

Do not expect much, and expect it slowly. One hour of *concentrated, adult-scaffolded* linear-numeral play moved Head Start 4-to-5-year-olds by about **1.2 numerals out of 10** ([Ramani & Siegler](https://doi.org/10.1111/j.1467-8624.2007.01131.x)), and your device offers far weaker scaffolding than a researcher sitting opposite a child. The home-numeracy literature as a whole sits at ***r* = .13*** ([Daucourt et al.](https://doi.org/10.1037/bul0000330)).

**Expect one to three digits recognised over some weeks, with enormous individual variance, and be pleased if "3" comes to mean *the good one*.** That is a real outcome. It is also not why you should build it.

**The reason to build it is that it is the honest, accurate depiction of what an album is** — an ordered sequence of songs — and a record player should tell the truth about its records. The learning is a side effect of accuracy, which is the only form of pedagogy this device should ever contain.

### 6.4 The one-line summary

**Ship the track list as a number line. Make the numerals true, big, plain and left-aligned in a straight evenly spaced column. Let tapping a row play that song. Then never mention the numbers again — not in the UI, not to the child, and not to yourself as a goal.** If in two years he can find track 7 without help, that will be because he wanted to hear track 7 four hundred times, which was the point all along.

---

## Sources

Every URL in this document was fetched and checked on 2026-09-18 unless marked otherwise. Items marked **UNVERIFIED** in the text are: the Lepper, Greene & Nisbett (1973) sample details; the "XEPSI" environmental-print example; quote-level content of Hirsh-Pasek et al. (2015) beyond the four pillars; the claim that unjudgeable on-screen questions are inert; children's comprehension of progress bars; experimental support for children's typefaces and for typeface mitigation of b/d confusion; and the existence of any research on numerals in everyday objects (elevator buttons, clocks, page numbers, track listings) or on L2/cross-linguistic environmental print — the last two are genuine, confirmed gaps in the literature rather than gaps in this search.

Two corrections to commonly miscited sources, both relevant here: the NELP report's `lincs.ed.gov` URL is dead — use the [NICHD copy](https://www.nichd.nih.gov/sites/default/files/publications/pubs/documents/NELPReport09.pdf) — and the own-name letter study is **Treiman & Broderick** (1998), not "Treiman & Broda". Bruckman's phrase is "chocolate-**dipped** broccoli", not "chocolate-covered".
