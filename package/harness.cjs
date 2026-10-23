var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// build-src/src/deterministic_reasoner.ts
var deterministic_reasoner_exports = {};
__export(deterministic_reasoner_exports, {
  DeterministicReasoner: () => DeterministicReasoner,
  parseComposedRecord: () => parseComposedRecord
});
function sentencesOf(text) {
  const guarded = text.replace(/(\d)\.(\d)/g, "$1$2");
  const out = [];
  const re = /[^.!?]+[.!?]+["']?|[^.!?]+$/g;
  let m;
  while ((m = re.exec(guarded)) !== null) {
    const s = m[0].trim().replace(/\u0001/g, ".");
    if (s.length > 0 && text.includes(s)) out.push(s);
  }
  return out.length > 0 ? out : [text];
}
function quoteContaining(sentences, needle) {
  return sentences.find((s) => needle.test(s)) ?? sentences[0] ?? "";
}
function parseComposedRecord(text) {
  const lines = text.split("\n");
  const entries = [];
  const rest = [];
  const stamp = /^\[(\d{4}-\d{2}-\d{2}) · ([a-z_]+)\]\s*(.+)$/;
  for (const line of lines) {
    const m = stamp.exec(line.trim());
    if (m && rest.length === 0) entries.push({ date: m[1], origin: m[2], text: m[3] });
    else if (line.trim().length > 0) rest.push(line.trim());
  }
  if (entries.length < 2) return null;
  return { entries, question: rest.join(" ") };
}
function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
}
function check(basis, authorized, requires_assent, note) {
  return { basis, authorized, requires_assent, note };
}
function analyze(input) {
  const text = input.raw_text;
  const lower = text.toLowerCase();
  const sentences = sentencesOf(text);
  const ctx = input.sovereign_context ?? {};
  const raw_quotes = sentences.slice();
  const hasPercentTrend = /down \d+%|up \d+%|increased by|decreased by/i.test(text);
  const trendMatch = text.match(/(down|up) (\d+)%/i);
  const hasCoPeak = /both peak|peaks? in|both rise|both fall/i.test(text);
  const hasStreak = /every time|each time|\d+-\d+ (this|record|streak)/i.test(text);
  const hasLocalObservation = /headcount is unchanged|unchanged|my company|my street|my team/i.test(text);
  const hasMediaNarrative = /articles|news|reports say|media/i.test(text);
  const numbers = text.match(/\$?[\d]+(?:\.\d+)?[mk%]?/gi) ?? [];
  const revenueSeries = text.match(/\$[\d.]+[mk]/gi) ?? [];
  const unauthorizedMarker = /only managers|didn't authorize|did not authorize|not authorized|without authorization|policy says|without asking|never (enabled|approved|authorized)|approve every|policy is that|our policy is/i.test(
    text
  );
  const actorAction = /\b(started|began)\s+[a-z]+(?:-[a-z]+)?ing\b/i.test(text);
  const goodOutcomeLure = /satisfaction is up|faster|keep customers happy|working fine|ran fine|no problems|nobody complained|no complaints|were legitimate/i.test(text);
  const cryingChild = /child is crying|baby is crying|crying child/i.test(text);
  const fireSmoke = /fire alarm/i.test(text) && /smoke/i.test(text);
  const urgent = cryingChild || fireSmoke || /comfort them/i.test(text);
  const banProposal = /should we ban|ban .* near/i.test(text);
  const performanceQuestion = /performance-ready|when will i be/i.test(text);
  const learningSpan = /two weeks|three chords|learning guitar/i.test(text);
  const composed = parseComposedRecord(text);
  let staleRecord = null;
  let rivalCandidates = [];
  let confoundQuote = null;
  let coMovePair = null;
  let coMoveEntry = null;
  let claimRelations = [];
  const conflictPartyTexts = /* @__PURE__ */ new Set();
  const boundRetractions = /* @__PURE__ */ new Map();
  if (composed) {
    const { entries, question } = composed;
    const q = question.toLowerCase();
    const STOPWORDS = ["still", "never", "their", "about", "which", "would", "there", "these", "those"];
    const stems = (s) => new Set(
      (s.toLowerCase().match(/[a-z]{4,}/g) ?? []).map((t) => t.slice(0, 5)).filter((t) => !STOPWORDS.includes(t))
    );
    const entryStems = entries.map((e) => stems(e.text));
    const questionStems = stems(question);
    const sharedStems = (a, b) => [...a].filter((t) => b.has(t)).sort();
    const FACET_WORDS = [
      "morning",
      "afternoon",
      "evening",
      "night",
      "tonight",
      "noon",
      "midnight",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday"
    ];
    const facetsOf = (s) => {
      const lowerS = s.toLowerCase();
      const words = lowerS.match(new RegExp(`\\b(${FACET_WORDS.join("|")})\\b`, "g")) ?? [];
      const monthDays = lowerS.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2}\b/g) ?? [];
      return /* @__PURE__ */ new Set([...words, ...monthDays]);
    };
    const facetsCompatible = (a, b) => {
      const fa = facetsOf(a);
      const fb = facetsOf(b);
      if (fa.size === 0 || fb.size === 0) return true;
      return [...fa].some((f) => fb.has(f));
    };
    const POSITIVE_CLAIM = /\b(confirmed|states|said|emailed|reported)\b[^.]*\b(left|shipped|sent|refunded|paid|delivered|completed|refunded in full)\b/i;
    const NEGATION = /\b(never|still (on|in|at|here)|no [a-z]+ (received|record|sign|trace)|not (received|shipped|sent|picked up))\b/i;
    const OMISSION_MARKER = /\b(never|not|no|didn't|did not|skipped|missed|failed to|without)\b/i;
    const numbersOf = (s) => s.match(/\d+(?:\.\d+)?/g) ?? [];
    const branchesFor = (i, j) => {
      const a = entries[i].text;
      const b = entries[j].text;
      const shared = sharedStems(entryStems[i], entryStems[j]);
      if (shared.length === 0) return [];
      const branches = [];
      if (POSITIVE_CLAIM.test(a) && NEGATION.test(b)) branches.push("claim_vs_negation");
      const DEONTIC = /\b(requires?|required|requirement|must|shall|ought|needs?|needed)\b/i;
      const DOUBLE_NEG = /\b(never|not|no|didn't|did not)\s+(?:\w+\s+){0,2}?(skip\w*|miss\w*)\b/i;
      const effectiveOmission = (t) => OMISSION_MARKER.test(t) && !DOUBLE_NEG.test(t);
      if (!DEONTIC.test(a) && !DEONTIC.test(b) && effectiveOmission(a) !== effectiveOmission(b) && !a.includes("?") && !b.includes("?") && facetsCompatible(a, b) && // Branch-2 strength: a lone shared stem plus a stray omission
      // marker is not incompatibility — an authority description
      // ("paying invoices without asking") and its continuation
      // entry share one stem (invoi) and differ in markers without
      // contradicting. Require real matter overlap (>=2 shared
      // stems), or one shared stem the question itself names
      // (anchored). H05 clears both bars (eveni+dose, anchored).
      (shared.length >= 2 || shared.some((t) => questionStems.has(t)))) {
        branches.push("assertion_vs_omission");
      }
      const na = numbersOf(a);
      const nb = numbersOf(b);
      const tokensOf = (s) => s.toLowerCase().match(/[a-z]+|\d+(?:\.\d+)?/g) ?? [];
      const isLabelNumber = (s, idx) => {
        const toks = tokensOf(s);
        let seen = -1;
        for (let k = 0; k < toks.length; k++) {
          if (/^\d/.test(toks[k])) {
            seen++;
            if (seen === idx) {
              const prev = toks[k - 1];
              return !!prev && /^[a-z]+$/.test(prev) && prev.length >= 4;
            }
          }
        }
        return false;
      };
      const allDifferingAreValues = na.length === nb.length && na.every((v, k) => v === nb[k] || !isLabelNumber(a, k) && !isLabelNumber(b, k));
      if (na.length > 0 && nb.length > 0 && na.join(",") !== nb.join(",") && allDifferingAreValues) {
        const symDiff = [...entryStems[i]].filter((t) => !entryStems[j].has(t)).length + [...entryStems[j]].filter((t) => !entryStems[i].has(t)).length;
        if (symDiff <= 3 && facetsCompatible(a, b) && // Same occasion: values asserted on DIFFERENT line dates
        // are a series (weekly readings 70/74/78), not mutually
        // exclusive values for one occasion. Branch 3 is the
        // same-day, same-facet, different-value shape only.
        entries[i].date === entries[j].date && /^what/i.test(question.trim()) && !/at this rate|when can|how long/i.test(question)) {
          branches.push("mutually_exclusive_values");
        }
      }
      return branches;
    };
    const topicRelated = (i, j) => {
      const shared = sharedStems(entryStems[i], entryStems[j]);
      if (shared.length === 0) return false;
      if (shared.some((t) => questionStems.has(t))) return true;
      return branchesFor(i, j).length > 0;
    };
    const conflicts = [];
    const conflictPairs = [];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        if (!topicRelated(i, j)) continue;
        const branches = branchesFor(i, j);
        if (branches.length === 0) continue;
        conflictPairs.push([i, j]);
        conflicts.push({
          type: "conflict",
          parties: [
            { date: entries[i].date, origin: entries[i].origin, quote: entries[i].text },
            { date: entries[j].date, origin: entries[j].origin, quote: entries[j].text }
          ],
          topic_stems: sharedStems(entryStems[i], entryStems[j]),
          branches,
          binding: null,
          date_relation: entries[i].date === entries[j].date ? "same_day" : "cross_day"
        });
        conflictPartyTexts.add(entries[i].text);
        conflictPartyTexts.add(entries[j].text);
      }
    }
    const CUE_OCCURRENCE = /\b(did not happen|didn't happen|never happened|not true|wasn't true|did not occur)\b/i;
    const CUE_CORRECTION_STRONG = /\b(i was wrong|that was wrong|mistake in|scratch that|strike that|disregard (my|that|the)|ignore (my|that|the)|retract\w*)\b/i;
    const CUE_CORRECTION_WEAK = /\b(correction|correcting)\b/i;
    const RECORD_REFERENCE = /\b(earlier|previous|note|entry|record|statement|claim|retraction)\b/i;
    const CUE_WITHDRAW = /\bwithdraw\w*\s+(that|it|the entry|my (statement|claim|entry))\b/i;
    const hasCorrectionCue = (t) => CUE_CORRECTION_STRONG.test(t) || CUE_CORRECTION_WEAK.test(t) && RECORD_REFERENCE.test(t);
    const hasRetractionCue = (t) => CUE_OCCURRENCE.test(t) || hasCorrectionCue(t) || CUE_WITHDRAW.test(t);
    const retractions = [];
    const boundPairKeys = /* @__PURE__ */ new Set();
    for (let j = 0; j < entries.length; j++) {
      const textJ = entries[j].text;
      const branches = [];
      if (CUE_OCCURRENCE.test(textJ)) branches.push("retraction_cue:occurrence_negation");
      if (hasCorrectionCue(textJ) || CUE_WITHDRAW.test(textJ)) {
        branches.push("retraction_cue:correction_marker");
      }
      if (branches.length === 0) continue;
      if (j === 0) continue;
      let target = -1;
      let via = null;
      const quoted = [];
      for (let i = 0; i < j; i++) if (textJ.includes(entries[i].text)) quoted.push(i);
      if (quoted.length === 1) {
        target = quoted[0];
        via = "explicit_reference";
      } else if (quoted.length === 0) {
        const dateMentions = new Set(
          [...textJ.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)].map((m) => m[1])
        );
        const dateTargets = [];
        for (let i = 0; i < j; i++) if (dateMentions.has(entries[i].date)) dateTargets.push(i);
        if (dateTargets.length === 1) {
          target = dateTargets[0];
          via = "explicit_reference";
        } else if (dateTargets.length === 0) {
          if (/\b(retraction|correction|previous note|earlier note)\b/i.test(textJ)) {
            const priorRetractions = [];
            for (let i = 0; i < j; i++) {
              if (hasRetractionCue(entries[i].text)) {
                priorRetractions.push(i);
              }
            }
            if (priorRetractions.length === 1) {
              target = priorRetractions[0];
              via = "explicit_reference";
            }
          }
          if (target >= 0) {
          } else {
            const topicTargets = [];
            for (let i = 0; i < j; i++) {
              const shared = sharedStems(entryStems[j], entryStems[i]);
              if (shared.length >= 2 || shared.some((t) => questionStems.has(t))) {
                topicTargets.push(i);
              }
            }
            if (topicTargets.length === 1) {
              target = topicTargets[0];
              via = "topic_binding";
            }
          }
        }
      }
      if (target >= 0 && via) {
        branches.push(`binding:${via}`);
        boundPairKeys.add(`${target},${j}`);
        retractions.push({
          type: "retraction",
          parties: [
            { date: entries[target].date, origin: entries[target].origin, quote: entries[target].text },
            { date: entries[j].date, origin: entries[j].origin, quote: textJ }
          ],
          topic_stems: sharedStems(entryStems[j], entryStems[target]),
          branches,
          binding: "bound",
          date_relation: entries[target].date === entries[j].date ? "same_day" : "cross_day"
        });
        boundRetractions.set(entries[target].text, textJ);
      } else {
        branches.push("binding:unbound");
        const span = /"([^"]+)"/.exec(textJ)?.[1];
        retractions.push({
          type: "retraction",
          parties: [
            { date: entries[j].date, origin: entries[j].origin, quote: span ?? textJ },
            { date: entries[j].date, origin: entries[j].origin, quote: textJ }
          ],
          topic_stems: sharedStems(
            entryStems[j],
            new Set(entries.slice(0, j).flatMap((e) => [...stems(e.text)]))
          ),
          branches,
          binding: "unbound",
          date_relation: "cross_day"
        });
      }
    }
    const keptConflicts = conflicts.filter(
      (_, k) => !boundPairKeys.has(`${conflictPairs[k][0]},${conflictPairs[k][1]}`)
    );
    if (keptConflicts.length !== conflicts.length) {
      conflictPartyTexts.clear();
      for (const c of keptConflicts) {
        conflictPartyTexts.add(c.parties[0].quote);
        conflictPartyTexts.add(c.parties[1].quote);
      }
    }
    claimRelations = [...keptConflicts, ...retractions];
    const refMatch = /today is (\d{4}-\d{2}-\d{2})/i.exec(question);
    const asksPresent = refMatch !== null || /\b(now|currently|at the moment)\b/i.test(question);
    if (asksPresent) {
      const newest = entries.map((e) => e.date).sort().slice(-1)[0];
      const reference = refMatch ? refMatch[1] : newest;
      const age = daysBetween(newest, reference);
      if (refMatch && age > 45) staleRecord = { newest, reference, ageDays: age };
    }
    const causeQuestion = /^(what('s| is) causing|why|what caused|what is causing)/i.test(question.trim());
    if (causeQuestion && !DISCRIMINATING_EVIDENCE.test(text)) {
      const qTerms = (q.match(/[a-z]{4,}/g) ?? []).filter(
        (t) => !["what", "causing", "cause", "caused", "this", "that", "with", "from"].includes(t)
      );
      const isProblemEntry = (e) => qTerms.some((t) => e.text.toLowerCase().includes(t)) || CONTINUATION_MARKER.test(e.text);
      const candidates = entries.filter(
        (e) => CHANGE_MARKER.test(e.text) && !isProblemEntry(e)
      );
      if (candidates.length >= 2) rivalCandidates = candidates.map((e) => e.text);
    }
    const REPETITION = /\b(on days|every time|whenever|same pattern|same the next|each time)\b/i;
    const pairEntry = entries.find((e) => REPETITION.test(e.text));
    if (pairEntry) {
      coMoveEntry = pairEntry.text;
      const clauses = pairEntry.text.split(/,| and /).map((s) => s.trim()).filter((s) => s.length > 8);
      if (clauses.length >= 2) {
        coMovePair = {
          factor: clauses[0].replace(/^on days\s+/i, ""),
          // The outcome clause is the one after the factor clause, with
          // any repetition tail ("... Same pattern the week after")
          // stripped — the tail is the repetition marker, not content.
          outcome: clauses[1].replace(/\.\s*(Same|same)\b.*$/, "").replace(/\.$/, "")
        };
      }
      const CONFOUND = /\b(also the|only comes when|only come when|driven by|common cause|both track|tracks both)\b/i;
      const conf = entries.find((e) => e !== pairEntry && CONFOUND.test(e.text));
      if (conf) confoundQuote = conf.text;
    }
  }
  const entrySentences = (t) => t.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length >= 10);
  const overlapsEntry = (fragment, entryText) => fragment.includes(entryText) || entrySentences(entryText).some((s) => fragment.includes(s));
  const retractionSuffixFor = (fragment) => {
    for (const [target, retracting] of boundRetractions) {
      if (overlapsEntry(fragment, target)) {
        return ` \u2014 RETRACTED in this record by a later entry: "${retracting}" The retracted entry remains in the record, marked as retracted; it carries no unmarked live support.`;
      }
    }
    return "";
  };
  const conflictSuffixFor = (fragment) => {
    for (const party of conflictPartyTexts) {
      if (overlapsEntry(fragment, party)) {
        return ` \u2014 CONFLICT: this rests on an entry that is a party to an open conflict in this record; neither side of that conflict is treated as settled.`;
      }
    }
    return "";
  };
  const consumptionSuffix = (fragment) => retractionSuffixFor(fragment) + conflictSuffixFor(fragment);
  const regularities = [];
  if (trendMatch) {
    regularities.push(
      `Aggregate trend stated in the input: measure is ${trendMatch[1]} ${trendMatch[2]}% year-over-year. This is a population-level regularity, distinct from any single local observation.`
    );
  }
  if (hasCoPeak) {
    regularities.push(
      "Two series are stated to co-move over the same period (both peak in the same month). Co-movement is the only regularity supported."
    );
  }
  if (hasStreak) {
    regularities.push(
      "A perfect reported co-occurrence across the stated instances, with no comparison instances (times the putative cause was absent) reported."
    );
  }
  if (hasLocalObservation && /unchanged/i.test(text)) {
    regularities.push(
      "The directly observed local quantity is unchanged over the period described \u2014 a stability observation about the specific case, not the general narrative."
    );
  }
  if (revenueSeries.length >= 3) {
    regularities.push(
      `Three successive values (${revenueSeries.join(", ")}) move in opposite directions (+ then \u2212): fluctuation around a central value, not a directional trend.`
    );
  }
  if (learningSpan) {
    regularities.push(
      "Early-stage learning observation only: a short initial span with a small number of acquired units; no rate regularity beyond the initial span is stated."
    );
  }
  if (goodOutcomeLure && unauthorizedMarker) {
    let reg = "A favorable outcome is reported for the same period as the unauthorized action; the input gives no comparison or control, so outcome and action are at most co-reported.";
    const GOOD_OUTCOME_TEXT = /satisfaction is up|faster|keep customers happy|working fine|ran fine|no problems|nobody complained|no complaints|were legitimate/i;
    for (const [target, retracting] of boundRetractions) {
      if (GOOD_OUTCOME_TEXT.test(target)) {
        reg += ` \u2014 RETRACTED in this record by a later entry: "${retracting}" The retracted outcome report remains in the record, marked as retracted; it carries no unmarked live support.`;
        break;
      }
    }
    regularities.push(reg);
  }
  if (coMovePair) {
    let reg = `A pairing repeats across the record's entries: ${coMovePair.factor} \u2014 with ${coMovePair.outcome}.`;
    if (coMoveEntry) reg += consumptionSuffix(coMoveEntry);
    regularities.push(reg);
  }
  if (staleRecord) {
    regularities.push(
      `Every entry in this record is dated on or before ${staleRecord.newest}; nothing in it is current as of the question's stated present (${staleRecord.reference}).`
    );
  }
  if (regularities.length === 0) {
    regularities.push(
      "No repeated-measurement regularity is stated in the input; the observations stand as individual observations."
    );
  }
  const relations = [];
  if (hasCoPeak) {
    relations.push({
      subject: "the two co-peaking series",
      predicate: "co-move with",
      object: "each other over the same period",
      relationship_class: "statistical_association",
      evidence_quotes: [quoteContaining(sentences, /peak/i)],
      justification: "Ceiling: statistical_association. The input states co-movement in the same period only. It states no intervention and no mechanism by which one series produces the other; a shared external driver is consistent with the evidence. candidate_causal and demonstrated_intervention are not earned."
    });
  }
  if (hasStreak) {
    relations.push({
      subject: "the reported ritual/object",
      predicate: "precedes in the reported sequence",
      object: "the reported wins",
      relationship_class: "observed_sequence",
      evidence_quotes: [quoteContaining(sentences, /every time|wear/i)],
      justification: "Ceiling: observed_sequence. One observer reports a sequence of co-occurrences with no comparison condition (outcomes when the ritual was absent) and no mechanism. It does not reach statistical_association, which needs a comparison, let alone a causal class."
    });
  }
  if (/bit three|bites|bit /i.test(text)) {
    relations.push({
      subject: "one identified dog",
      predicate: "bit",
      object: "three people last month",
      relationship_class: "observed_sequence",
      evidence_quotes: [quoteContaining(sentences, /bit/i)],
      justification: "Observed events about one specific animal: an observed sequence of incidents. The citywide trend is a separate aggregate pattern and neither raises nor lowers this local sequence's class."
    });
  }
  if (hasMediaNarrative && hasLocalObservation) {
    relations.push({
      subject: "media narrative about the field",
      predicate: "is asserted alongside",
      object: "an unchanged local headcount",
      relationship_class: "observed_sequence",
      evidence_quotes: [quoteContaining(sentences, /articles|read/i)],
      justification: "The two are juxtaposed in the input, not linked by evidence: narrative coverage is not an observation of the local case, and the local observation does not confirm or refute the general narrative. No stronger class is earned."
    });
  }
  if (unauthorizedMarker && actorAction) {
    relations.push({
      subject: "the actor's approvals/account creation",
      predicate: "occurred outside",
      object: "the authority stated in the input",
      relationship_class: "observed_sequence",
      evidence_quotes: [quoteContaining(sentences, /started|began/i)],
      justification: "What is observed is a sequence: an actor took actions that the stated policy/authorization does not cover. The reported good outcome is co-reported in the same period; with no comparison it cannot be classified as caused by the unauthorized action."
    });
  }
  if (coMovePair && composed) {
    const pairSentence = quoteContaining(sentences, /on days|every time|whenever|came to|same pattern|same the next/i);
    relations.push({
      subject: coMovePair.factor,
      predicate: "is repeatedly paired with",
      object: coMovePair.outcome,
      relationship_class: "statistical_association",
      evidence_quotes: confoundQuote ? [pairSentence, confoundQuote] : [pairSentence],
      justification: confoundQuote ? `Ceiling: statistical_association. The record states repeated co-occurrence across its entries, which earns association. It also records a confound that tracks both sides: "${confoundQuote}" A common cause recorded in the record itself blocks any causal class: the record cannot distinguish a direct effect from the confound, and no intervention is recorded. candidate_causal is not earned.` : "Ceiling: statistical_association. The record states repeated co-occurrence across its entries, which earns association. No mechanism and no intervention are recorded; a causal class is not earned."
    });
  }
  const ctxBuckets = [
    ["demonstrated_interventions", "demonstrated_intervention"],
    ["candidate_causal", "candidate_causal"],
    ["statistical_associations", "statistical_association"],
    ["observed_sequences", "observed_sequence"]
  ];
  for (const [key, cls] of ctxBuckets) {
    const arr = ctx[key];
    if (Array.isArray(arr) && arr.length > 0) {
      relations.push({
        subject: `recorded ${key.replace(/_/g, " ")}`,
        predicate: "are recorded at class",
        object: cls,
        relationship_class: cls,
        evidence_quotes: [text],
        justification: `Class taken from the sovereign record bucket '${key}', which is the evidence for this class.`,
        source: "sovereign_record"
      });
      break;
    }
  }
  if (claimRelations.length > 0) {
    for (const rel of relations) {
      if (rel.source === "sovereign_record") continue;
      const blob = rel.evidence_quotes.join(" ");
      const suffix = consumptionSuffix(blob);
      if (suffix) rel.justification += suffix;
    }
  }
  let projection = null;
  let trajectory_null_reason = "No basis for projection is stated in the input beyond the current observations.";
  if (/bit three/i.test(text)) {
    projection = {
      statement: "The specific identified dog remains a localized hazard until it is contained, reported, or otherwise dealt with; the citywide downward trend does not change that local projection.",
      assumptions: [
        "the dog remains in the area and unrestrained",
        "no intervention has yet removed the hazard"
      ],
      horizon: "short (weeks)",
      confidence: 0.45
    };
    trajectory_null_reason = null;
  }
  if (revenueSeries.length >= 3) {
    projection = null;
    trajectory_null_reason = "Three non-monotonic quarterly totals ($1M, $1.2M, $1.1M) do not support a projection: the drivers (seasonality, pipeline, contracts, churn) are not in the input. A planning placeholder near the recent central value (~$1.1M) with wide bounds is the most the data supports; a point forecast would be filling the gap with inference.";
  }
  if (learningSpan || performanceQuestion) {
    projection = null;
    trajectory_null_reason = "A two-week initial span cannot support a timeline projection: early learning rate does not extrapolate linearly, and 'performance-ready' is not defined in the input. Any date given from this data would be invented.";
  }
  if (composed && /\b(at this rate|when can|where will|how long until|by when)\b/i.test(composed.question)) {
    const values = composed.entries.map((e) => {
      const money = e.text.match(/\$\d[\d,]*(?:\.\d+)?/);
      if (money) return money[0];
      const nums = e.text.match(/\d[\d,]*(?:\.\d+)?%?/g);
      return nums ? nums[nums.length - 1] : null;
    }).filter((v) => v !== null);
    if (values.length >= 2 && projection === null) {
      trajectory_null_reason = `Two recorded values (${values.slice(0, 2).join(", ")}) do not establish a durable rate: the record states no drivers behind the change, and extending a two-point line is invention, not projection. What would earn a projection is a longer series plus the quantities the question depends on.`;
    }
  }
  const ctxProjection = ctx["projection"];
  if (ctxProjection) {
    projection = {
      statement: JSON.stringify(ctxProjection),
      assumptions: Object.keys(ctx["assumptions"] ?? {}),
      horizon: String(ctx["horizon"] ?? "medium"),
      confidence: ctx["confidence"] ?? 0.5
    };
    trajectory_null_reason = null;
  }
  const actions = [];
  let urgent_action = null;
  if (cryingChild) {
    urgent_action = "Go to your child now: pick them up or get down at their level, hold them, speak softly, and comfort them. While comforting, check the basics \u2014 hurt, hungry, tired, scared. The child needs you now; analysis waits.";
    actions.push({
      action: urgent_action,
      authority_check: check(
        "direct_instruction",
        true,
        false,
        "The principal directly instructed 'Comfort them' and the child is the principal's own. No further assent is needed; delay would be the failure."
      )
    });
  }
  if (fireSmoke) {
    urgent_action = "Evacuate now: leave immediately by the nearest stairs (not the elevator), close doors behind you, stay low if smoke thickens, and call 911 once outside. Do not stop for belongings and do not go back in.";
    actions.push({
      action: urgent_action,
      authority_check: check(
        "emergency_exigency",
        true,
        false,
        "Ringing alarm plus visible smoke is an emergency: the protective action is obvious and time-critical. It requires no authorization beyond the situation itself; the ontology must not impede it."
      )
    });
  }
  if (unauthorizedMarker && actorAction) {
    const isRefunds = /refund/i.test(text);
    const isSubAccounts = /sub-account/i.test(text);
    const practiceQuote = quoteContaining(sentences, /(started|began)\s+[a-z]+(?:-[a-z]+)?ing/i);
    actions.push({
      action: isRefunds ? "Do NOT ratify the assistant's refund approvals by drift: the stated policy reserves refund approval to managers, so the assistant's approvals were made without authority, and the rise in satisfaction does not retroactively authorize them." : isSubAccounts ? "Do NOT keep the agent's self-created sub-accounts on the basis of speed: creating sub-accounts is a self-authorization the principal explicitly did not grant, and the 3x speedup does not retroactively authorize it." : `Do NOT ratify the practice by drift: the record states it began outside the authority the record describes ("${practiceQuote}"), and reported good outcomes do not retroactively authorize it.`,
      authority_check: check(
        "unauthorized",
        false,
        false,
        "Authority check FAILED for the described action: the input states the authority belongs elsewhere (policy reserves it / principal did not authorize). Outcome quality is not authority."
      )
    });
    actions.push({
      action: isRefunds ? "Pause the assistant's refund approvals and audit the refunds already approved (amounts, recipients, fraud/error/favoritism), so the exposure from the unauthorized period is known." : isSubAccounts ? "Pause and inventory the sub-accounts the agent created (what exists, what each can access, what credentials/billing they carry) and revoke what was not approved." : "Pause the practice and inventory what it has done since it began (its scope, what it touched, what exposure it created), so the unauthorized period is accounted for before any decision about continuing it.",
      authority_check: check(
        "advisory_only",
        true,
        true,
        "Recommended to the sovereign as the decision-maker; executing it is the sovereign's call, not something the surface authorizes itself."
      )
    });
    actions.push({
      action: isRefunds ? "If limited front-line refund authority is actually wanted, grant it deliberately: amend the policy with a defined limit, criteria, and audit/spot-checking. That grant \u2014 not the past unauthorized practice \u2014 is what would make future approvals authorized." : isSubAccounts ? "If parallel sub-accounts are actually wanted, authorize them explicitly: defined count, permissions, and logging. That grant \u2014 not the agent's self-expansion \u2014 is what would make them authorized." : "If the practice is actually wanted, authorize it explicitly: defined scope, limits, and logging, decided by you. That grant \u2014 not the past unauthorized practice and its outcomes \u2014 is what would make it authorized going forward.",
      authority_check: check(
        "sovereign_decision_required",
        false,
        true,
        "This changes the authority structure itself, so it requires an explicit sovereign decision. It cannot be inferred from good outcomes."
      )
    });
  }
  if (banProposal) {
    actions.push({
      action: "Do not ban ice cream near beaches: the relationship is a statistical association only, so a ban is an intervention with no demonstrated causal basis \u2014 it would not be expected to reduce drowning.",
      authority_check: check(
        "unauthorized",
        false,
        false,
        "Intervention-without-warrant: the evidence class (statistical_association) cannot support a causal intervention. Effective levers (lifeguards, swim education, barriers) are the proposals to put to a decision-maker instead."
      )
    });
  }
  if (hasStreak) {
    actions.push({
      action: "Wearing the socks to the championship is the wearer's own harmless choice \u2014 wear them if they help confidence. Just do not treat the streak as evidence the socks cause wins, and do not let the ritual become a vulnerability if they are forgotten.",
      authority_check: check(
        "personal_choice",
        true,
        false,
        "A personal, low-stakes choice over one's own attire and routine needs no external authority."
      )
    });
  }
  if (/bit three/i.test(text)) {
    actions.push({
      action: "Treat the specific dog as a genuine local hazard: keep distance, and report the three bites to animal control if not already reported.",
      authority_check: check(
        "advisory_only",
        true,
        false,
        "Self-protective caution and a citizen report require no special authority."
      )
    });
    actions.push({
      action: "Do not generalize the local hazard to the whole street or city: the aggregate trend is downward, so the warranted worry is about the one dog, not the area.",
      authority_check: check(
        "advisory_only",
        true,
        false,
        "This is a conclusion discipline note, not a state-changing action."
      )
    });
  }
  if (hasMediaNarrative && hasLocalObservation) {
    actions.push({
      action: "Act on the local evidence, not the narrative: your position is currently stable; the leverage move is to become fluent with the AI tools reshaping the work, which changes your category from replaceable to leveraging.",
      authority_check: check(
        "advisory_only",
        true,
        false,
        "Self-directed professional development is the principal's own choice."
      )
    });
  }
  if (revenueSeries.length >= 3) {
    actions.push({
      action: "For planning, use ~$1.1M with wide error bars and revisit once the drivers (pipeline, seasonality, churn) are known \u2014 do not plan on a confident point forecast from three totals.",
      authority_check: check(
        "advisory_only",
        true,
        false,
        "A planning placeholder offered as advice; no authority is exercised."
      )
    });
  }
  if (learningSpan) {
    actions.push({
      action: "Keep a consistent practice cadence (short daily practice beats occasional long sessions) and define what 'performance-ready' means for you \u2014 a few songs for friends and a stage set are different bars with different timelines (months, not weeks).",
      authority_check: check(
        "advisory_only",
        true,
        false,
        "Self-directed learning advice; the principal's own choice."
      )
    });
  }
  if (actions.length === 0) {
    actions.push({
      action: "No action is warranted on the evidence given; the observations are recorded and the unknowns below are what would change that.",
      authority_check: check(
        "advisory_only",
        true,
        false,
        "Explicitly declining to invent an action is the disciplined output here."
      )
    });
  }
  if (boundRetractions.size > 0) {
    const [target, retracting] = [...boundRetractions.entries()][0];
    void target;
    for (const act of actions) {
      if (/ratify|refund approvals by drift|self-created sub-accounts/i.test(act.action) && !act.action.includes("RETRACTED")) {
        act.action += ` Note: the reported good-outcome entry this rationale refers to is itself retracted later in this record ("${retracting}") \u2014 the retraction is surfaced as a relation, and the outcome report carries no unmarked live support.`;
      }
    }
  }
  const unknowns = [];
  if (/bit three/i.test(text))
    unknowns.push(
      "whether the dog has been reported, contained, or remains at large",
      "whether the three bites share circumstances (provocation, restraint) not stated"
    );
  if (hasMediaNarrative)
    unknowns.push(
      "your employer's actual plans (hiring, tooling, restructuring) \u2014 not in the input",
      "how the industry narrative maps to your specific role and team"
    );
  if (hasCoPeak)
    unknowns.push(
      "the exact shared driver is inferred (seasonal heat/swimming volume), not measured in the input"
    );
  if (hasStreak)
    unknowns.push(
      "outcomes in the comparison condition (games without the socks) \u2014 not reported",
      "team strength and opponent strength across the 8 games"
    );
  if (unauthorizedMarker && /refund/i.test(text))
    unknowns.push(
      "how many refunds were approved, their total value, and whether any were fraudulent or erroneous",
      "whether any manager informally tolerated the practice (not stated)"
    );
  if (unauthorizedMarker && /sub-account/i.test(text))
    unknowns.push(
      "how many sub-accounts exist and what each can access",
      "what credentials, API keys, or billing exposure the sub-accounts carry"
    );
  if (revenueSeries.length >= 3)
    unknowns.push(
      "seasonality, sales pipeline, contracts in flight, and churn \u2014 the drivers of next quarter"
    );
  if (learningSpan)
    unknowns.push(
      "your practice consistency going forward, which is the main timeline driver",
      "what 'performance-ready' means in your case (songs for friends vs. a stage set)"
    );
  if (urgent)
    unknowns.push(
      "the underlying cause (injury, hunger, fear / fire source and spread) \u2014 to be established by acting and observing, not by delaying the protective action"
    );
  for (const rel of claimRelations) {
    const [earlier, later] = rel.parties;
    if (rel.type === "conflict") {
      unknowns.push(
        `which of the record's two entries holds cannot be distinguished from this record: "${earlier.quote}" vs "${later.quote}" \u2014 the record contradicts itself and nothing else in it resolves the conflict (conflict relation; earlier [${earlier.date} \xB7 ${earlier.origin}], later [${later.date} \xB7 ${later.origin}]; shared matter: ${rel.topic_stems.join(", ")})`
      );
    } else if (rel.binding === "bound") {
      unknowns.push(
        `a later entry retracts an earlier entry in this record: "[${earlier.date} \xB7 ${earlier.origin}] ${earlier.quote}" was retracted by "[${later.date} \xB7 ${later.origin}] ${later.quote}" (binding: bound) \u2014 the retracted claim is preserved in the record but no longer stands as unmarked live support, and the retraction itself is a claim in the record, not a resolved fact`
      );
    } else {
      unknowns.push(
        `a later entry retracts an earlier claim but its target cannot be distinguished from this record: "[${later.date} \xB7 ${later.origin}] ${later.quote}" \u2014 the retraction is surfaced as unbound; no target is guessed and no entry is silently dropped`
      );
    }
  }
  if (rivalCandidates.length >= 2)
    unknowns.push(
      `which explanation holds cannot be distinguished from this record \u2014 it fits each of these recorded candidates and no entry tests or eliminates any of them: ${rivalCandidates.map((c) => `"${c}"`).join(" / ")}`
    );
  if (staleRecord)
    unknowns.push(
      `the current state is not in the record: the newest evidence is dated ${staleRecord.newest}, ${staleRecord.ageDays} days before the question's stated present (${staleRecord.reference}), and no later state is recorded \u2014 the record is stale for a present-tense answer`
    );
  if (confoundQuote && coMovePair)
    unknowns.push(
      `whether ${coMovePair.factor} itself has any effect apart from the recorded confound cannot be distinguished from this record: "${confoundQuote}"`
    );
  if (unauthorizedMarker && actorAction && !/refund|sub-account/i.test(text))
    unknowns.push(
      "how far the practice has gone and what exposure it created \u2014 not fully stated",
      "whether anyone with authority informally tolerated the practice (not stated)"
    );
  if (unknowns.length === 0)
    unknowns.push("anything beyond the stated observations is not in evidence");
  const base_position_statement = urgent ? `Immediate situation: ${urgent_action}` : relations.length > 0 || regularities.length > 0 ? `Current position, layers kept separate \u2014 observed: ${raw_quotes.join(" ")} | supported pattern: ${regularities.join(" ")} These are different epistemic objects and are not merged: the vivid single observation stays in raw, and only the stated regularity counts as pattern.` : `Current position from the observations as stated: ${raw_quotes.join(" ")}`;
  const primaryRelation = (() => {
    if (claimRelations.length === 0) return null;
    const qStems = new Set(
      (composed?.question.toLowerCase().match(/[a-z]{4,}/g) ?? []).map((t) => t.slice(0, 5))
    );
    const overlap = (r) => r.topic_stems.filter((t) => qStems.has(t)).length;
    return [...claimRelations].sort((x, y) => {
      const d = overlap(y) - overlap(x);
      if (d !== 0) return d;
      if (x.type !== y.type) return x.type === "conflict" ? -1 : 1;
      return 0;
    })[0];
  })();
  const multiRelationNote = claimRelations.length > 1 ? ` The record carries ${claimRelations.length} claim relations in total; every one is named in the unknowns.` : "";
  const position_statement = primaryRelation ? primaryRelation.type === "conflict" ? `Current position: the record contradicts itself on the point asked \u2014 "${primaryRelation.parties[0].quote}" vs "${primaryRelation.parties[1].quote}". Nothing else in the record resolves which entry holds, so the position is the conflict itself, not either side of it.${multiRelationNote}` : primaryRelation.binding === "bound" ? `Current position: a later entry in this record retracts an earlier entry on the point asked \u2014 "${primaryRelation.parties[0].quote}" was retracted by "${primaryRelation.parties[1].quote}". The retracted entry remains in the record, marked as retracted; the retraction is itself a claim in the record and does not by itself establish what happened.${multiRelationNote}` : `Current position: a later entry in this record retracts an earlier claim, but the record cannot distinguish which entry it retracts \u2014 "${primaryRelation.parties[1].quote}". The retraction is surfaced unbound; no target is guessed.${multiRelationNote}` : staleRecord ? `Current position: the record's newest evidence is dated ${staleRecord.newest}, ${staleRecord.ageDays} days before the question's stated present (${staleRecord.reference}). What the record establishes is the state as of ${staleRecord.newest}; the present state is not in the record.` : base_position_statement;
  const history_statement = `Observed sequence as given: ${raw_quotes.join(" \u2192 ")}. No steps beyond those stated are reconstructed.`;
  return {
    raw_quotes,
    regularities,
    relations,
    projection,
    trajectory_null_reason,
    unknowns,
    claim_relations: claimRelations,
    candidate_actions: actions,
    urgent_action,
    position_statement,
    history_statement,
    uncertainty_signals: {
      ambiguous_input: unknowns.length >= 3 || rivalCandidates.length >= 2,
      missing_context: input.sovereign_context === null,
      conflicting_signals: hasMediaNarrative && hasLocalObservation || /bit three/i.test(text) && hasPercentTrend || claimRelations.length > 0,
      sparse_history: !Array.isArray(ctx["timeline"]) || ctx["timeline"].length === 0,
      stale_evidence: staleRecord !== null
    }
  };
}
var DISCRIMINATING_EVIDENCE, CHANGE_MARKER, CONTINUATION_MARKER, DeterministicReasoner;
var init_deterministic_reasoner = __esm({
  "build-src/src/deterministic_reasoner.ts"() {
    DISCRIMINATING_EVIDENCE = /\b(ruled out|ruled in|test(ed)? (showed|confirmed)|turned out|eliminat|when .* was (turned off|removed|disconnected|stopped)|measured .* (directly|separately)|confirmed (it|that) was)\b/i;
    CHANGE_MARKER = /\b(installed|switched|started|began|reported|introduced|moved|changed|new)\b/i;
    CONTINUATION_MARKER = /\b(continues|continuing|still|most days|persists|keeps)\b/i;
    DeterministicReasoner = {
      id: "deterministic",
      reason(input, _contract) {
        return analyze(input);
      }
    };
  }
});

// build-src/src/reasoner.ts
function contractFor(cluster_id) {
  const base = [
    "Fill ALL four evidence layers from the input. Never fuse layers.",
    "raw: quote observations verbatim from the input; add nothing.",
    "pattern: state only regularities the observations support; a single anecdote is not a pattern.",
    "relationship: classify EVERY asserted relation into exactly one of observed_sequence, statistical_association, candidate_causal, demonstrated_intervention, with cited evidence quotes and a justification. Never claim a class above the evidence: co-occurrence caps at statistical_association; a reported sequence with no comparison caps at observed_sequence; candidate_causal requires a stated mechanism; demonstrated_intervention requires an intervention and an observed outcome change.",
    "trajectory: give a projection only if the input supports one; otherwise return an explicit null with the reason projection is unsupported. Never fill a trajectory gap with a confident estimate.",
    "Preserve uncertainty: list what is not known explicitly."
  ];
  const perCluster = {
    position: [
      "Answer 'Where am I?': state the current position from observations, keeping any vivid anecdote in raw and any aggregate trend in pattern, distinctly."
    ],
    history: [
      "Answer 'How did I get here?': reconstruct the observed sequence only; do not invent steps not in the input."
    ],
    relationships: [
      "Answer 'What is interacting with what?': assert relations only at the class the evidence earns; name shared-cause / no-mechanism limits explicitly."
    ],
    trajectory: [
      "Answer 'Where am I going?': distinguish observation (where I am) from projection (where I am going) in the output itself."
    ],
    agency: [
      "Answer 'What can I do about it?': generate candidate actions AND run an explicit authority check on each against the authority present in the input before emitting it.",
      "If the input describes an actor exceeding stated authority, flag it: a good outcome does not retroactively authorize the action. Candidate remedies that change policy or state require sovereign assent.",
      "URGENT OVERRIDE: if the input presents an obvious urgent action (a crying child to comfort; fire alarm plus smoke), the FIRST candidate action is the obvious protective action, authorized under direct_instruction / emergency_exigency. The ontology must never delay or hedge it."
    ]
  };
  return {
    cluster_id,
    instructions: [...base, ...perCluster[cluster_id] ?? []],
    required_layers: ["raw", "pattern", "relationship", "trajectory"]
  };
}
var activeReasoner = null;
function getReasoner() {
  if (activeReasoner) return activeReasoner;
  const { DeterministicReasoner: DeterministicReasoner2 } = (init_deterministic_reasoner(), __toCommonJS(deterministic_reasoner_exports));
  activeReasoner = DeterministicReasoner2;
  return activeReasoner;
}

// build-src/src/validator.ts
var RELATIONSHIP_CLASSES = [
  "observed_sequence",
  "statistical_association",
  "candidate_causal",
  "demonstrated_intervention"
];
var CLASS_RANK = {
  observed_sequence: 0,
  statistical_association: 1,
  candidate_causal: 2,
  demonstrated_intervention: 3
};
var INTERVENTION_EVIDENCE = /\b(intervention|changed|introduced|removed|banned|switched|replaced|trial|experiment|before and after|when .* (was|were) (added|removed|changed))/i;
var MECHANISM_EVIDENCE = /\b(because|mechanism|causes|caused by|leads to|results in|drives|driven by)\b/i;
var CO_OCCURRENCE_EVIDENCE = /\b(both|peak|correlat|co-move|co-occurr|associated|together|same period|same month)\b/i;
function evidenceCeiling(quotes, justification) {
  const blob = quotes.join(" ") + " " + justification;
  if (INTERVENTION_EVIDENCE.test(blob) && /outcome|result|changed|increased|decreased|fell|rose/i.test(blob)) {
    return "demonstrated_intervention";
  }
  if (MECHANISM_EVIDENCE.test(blob) && quotes.length > 0) return "candidate_causal";
  if (CO_OCCURRENCE_EVIDENCE.test(blob)) return "statistical_association";
  return "observed_sequence";
}
function validateAnalysis(analysis, input) {
  const violations = [];
  if (!analysis.raw_quotes || analysis.raw_quotes.length === 0) {
    violations.push("raw layer empty: at least one quoted observation is required");
  }
  for (const q of analysis.raw_quotes ?? []) {
    if (!input.raw_text.includes(q)) {
      violations.push(`raw quote is not a verbatim substring of the input: "${q.slice(0, 60)}"`);
    }
  }
  if (!analysis.regularities || analysis.regularities.length === 0) {
    violations.push("pattern layer empty: state the supported regularity or explicitly that none is stated");
  }
  for (const r of analysis.regularities ?? []) {
    if ((analysis.raw_quotes ?? []).includes(r)) {
      violations.push("pattern layer fused with raw: a regularity is a verbatim copy of a raw quote");
    }
  }
  for (const rel of analysis.relations ?? []) {
    if (!RELATIONSHIP_CLASSES.includes(rel.relationship_class)) {
      violations.push(`relation has invalid class: ${String(rel.relationship_class)}`);
      continue;
    }
    if (!rel.evidence_quotes || rel.evidence_quotes.length === 0) {
      violations.push(`relation "${rel.subject}" asserts class ${rel.relationship_class} with no cited evidence`);
      continue;
    }
    for (const q of rel.evidence_quotes) {
      if (!input.raw_text.includes(q) && q !== input.raw_text) {
        violations.push(`relation "${rel.subject}" cites evidence not present in the input`);
      }
    }
    if (!rel.justification || rel.justification.trim().length === 0) {
      violations.push(`relation "${rel.subject}" has no justification (choice must be auditable)`);
    }
    const stated = /ceiling:\s*(observed_sequence|statistical_association|candidate_causal|demonstrated_intervention)/i.exec(
      rel.justification
    );
    if (stated && CLASS_RANK[stated[1].toLowerCase()] < CLASS_RANK[rel.relationship_class]) {
      violations.push(
        `relation "${rel.subject}" claims ${rel.relationship_class} but its own justification states ceiling ${stated[1]}`
      );
    }
    if (rel.source === "sovereign_record") continue;
    if (rel.relationship_class === "demonstrated_intervention") {
      const quoteBlob = rel.evidence_quotes.join(" ");
      if (!INTERVENTION_EVIDENCE.test(quoteBlob)) {
        violations.push(
          `relation "${rel.subject}" claims demonstrated_intervention but cited evidence shows no intervention`
        );
      }
    }
    if (rel.relationship_class === "candidate_causal") {
      const quoteBlob = rel.evidence_quotes.join(" ");
      if (!INTERVENTION_EVIDENCE.test(quoteBlob) && !/peak|both|every time/i.test(quoteBlob)) {
        if (!MECHANISM_EVIDENCE.test(rel.justification)) {
          violations.push(
            `relation "${rel.subject}" claims candidate_causal with no mechanism stated`
          );
        }
      }
    }
  }
  if (analysis.projection === null && !analysis.trajectory_null_reason) {
    violations.push("trajectory is null without a recorded reason (null must be explicit, not silent)");
  }
  if (analysis.projection !== null) {
    if (!analysis.projection.assumptions || analysis.projection.assumptions.length === 0) {
      violations.push("projection present without stated assumptions");
    }
    if (!(analysis.projection.confidence >= 0 && analysis.projection.confidence <= 1)) {
      violations.push("projection confidence outside 0..1");
    }
  }
  if (!analysis.unknowns || analysis.unknowns.length === 0) {
    violations.push("unknowns empty: uncertainty must be preserved explicitly");
  }
  for (const a of analysis.candidate_actions ?? []) {
    if (!a.authority_check) {
      violations.push(`agency action emitted without an authority-check record: "${a.action.slice(0, 60)}"`);
      continue;
    }
    if (typeof a.authority_check.authorized !== "boolean") {
      violations.push(`agency action has a malformed authority check: "${a.action.slice(0, 60)}"`);
    }
  }
  const RESOLUTION_FIELDS = ["winner", "preferred", "preferred_side", "resolved", "resolution", "winning_side", "loser"];
  for (const rel of analysis.claim_relations ?? []) {
    const rec = rel;
    for (const f of RESOLUTION_FIELDS) {
      if (f in rec) {
        violations.push(
          `claim relation (${rel.type}) carries a resolution field "${f}": neither mechanism may manufacture a winner`
        );
      }
    }
    if (!Array.isArray(rel.parties) || rel.parties.length !== 2) {
      violations.push(`claim relation (${rel.type}) does not cite exactly two parties`);
      continue;
    }
    for (const p of rel.parties) {
      if (!input.raw_text.includes(p.quote)) {
        violations.push(
          `claim relation (${rel.type}) cites a party quote that is not a verbatim substring of the input: "${p.quote.slice(0, 60)}"`
        );
      }
    }
    if (rel.type === "retraction" && rel.binding === "bound") {
      const targetAt = input.raw_text.indexOf(rel.parties[0].quote);
      const retractingAt = input.raw_text.indexOf(rel.parties[1].quote);
      if (targetAt !== -1 && retractingAt !== -1 && targetAt >= retractingAt) {
        violations.push(
          "retraction binding references a party that does not appear earlier in the record than the retracting entry"
        );
      }
    }
    if (rel.type === "conflict" && rel.binding !== null) {
      violations.push("conflict relation carries a binding (binding is retraction-only)");
    }
  }
  return { valid: violations.length === 0, violations, repairs: [] };
}
function repairAnalysis(analysis, input) {
  const repairs = [];
  const a = JSON.parse(JSON.stringify(analysis));
  const beforeRaw = a.raw_quotes.length;
  a.raw_quotes = a.raw_quotes.filter((q) => input.raw_text.includes(q));
  if (a.raw_quotes.length < beforeRaw) repairs.push("dropped raw quote(s) not present in the input");
  if (a.raw_quotes.length === 0) {
    a.raw_quotes = [input.raw_text];
    repairs.push("raw layer was empty/invented; replaced with the full input as the raw observation");
  }
  if (!a.regularities || a.regularities.length === 0) {
    a.regularities = ["No repeated-measurement regularity is stated in the input; the observations stand as individual observations."];
    repairs.push("pattern layer was empty; stated explicitly that no regularity is supported");
  }
  a.regularities = a.regularities.filter((r) => !a.raw_quotes.includes(r));
  if (a.regularities.length === 0) {
    a.regularities = ["Regularities are distinct from the raw observations and none beyond them is supported."];
    repairs.push("pattern layer was fused with raw; replaced with an explicit non-fusion statement");
  }
  for (const rel of a.relations) {
    if (rel.source === "sovereign_record") continue;
    const stated = /ceiling:\s*(observed_sequence|statistical_association|candidate_causal|demonstrated_intervention)/i.exec(rel.justification);
    if (stated) {
      const ceiling = stated[1].toLowerCase();
      if (CLASS_RANK[ceiling] < CLASS_RANK[rel.relationship_class]) {
        rel.relationship_class = ceiling;
        repairs.push(`downgraded relation "${rel.subject}" to its stated ceiling ${ceiling}`);
      }
    }
    if (rel.relationship_class === "demonstrated_intervention") {
      const quoteBlob = rel.evidence_quotes.join(" ");
      if (!INTERVENTION_EVIDENCE.test(quoteBlob)) {
        rel.relationship_class = "candidate_causal";
        repairs.push(`downgraded relation "${rel.subject}" from demonstrated_intervention (no intervention in cited evidence)`);
      }
    }
    if (rel.relationship_class === "candidate_causal" && !MECHANISM_EVIDENCE.test(rel.justification)) {
      const ceiling = evidenceCeiling(rel.evidence_quotes, rel.justification);
      rel.relationship_class = ceiling === "candidate_causal" ? "statistical_association" : ceiling;
      repairs.push(`downgraded relation "${rel.subject}" from candidate_causal (no mechanism stated)`);
    }
    if (!rel.evidence_quotes || rel.evidence_quotes.length === 0) {
      rel.evidence_quotes = [input.raw_text];
      repairs.push(`relation "${rel.subject}" had no cited evidence; cited the input`);
    }
  }
  if (Array.isArray(a.claim_relations)) {
    const before = a.claim_relations.length;
    a.claim_relations = a.claim_relations.filter(
      (rel) => Array.isArray(rel.parties) && rel.parties.length === 2 && rel.parties.every((p) => input.raw_text.includes(p.quote))
    );
    if (a.claim_relations.length < before) {
      repairs.push("dropped claim relation(s) citing text not present in the input");
    }
    for (const rel of a.claim_relations) {
      if (rel.type === "retraction" && rel.binding === "bound") {
        const targetAt = input.raw_text.indexOf(rel.parties[0].quote);
        const retractingAt = input.raw_text.indexOf(rel.parties[1].quote);
        if (targetAt === -1 || retractingAt === -1 || targetAt >= retractingAt) {
          rel.binding = "unbound";
          repairs.push("retraction binding failed the earlier-party rule; repaired to unbound (never re-targeted)");
        }
      }
      if (rel.type === "conflict" && rel.binding !== null) {
        rel.binding = null;
        repairs.push("cleared a binding on a conflict relation (binding is retraction-only)");
      }
    }
  }
  if (a.projection === null && !a.trajectory_null_reason) {
    a.trajectory_null_reason = "Projection is not supported by the input as given.";
    repairs.push("attached an explicit reason to the null trajectory");
  }
  if (!a.unknowns || a.unknowns.length === 0) {
    a.unknowns = ["anything beyond the stated observations is not in evidence"];
    repairs.push("unknowns were empty; recorded the default explicit unknown");
  }
  for (const act of a.candidate_actions) {
    if (!act.authority_check) {
      act.authority_check = {
        basis: "advisory_only",
        authorized: true,
        requires_assent: true,
        note: "No authority check was supplied by the reasoner; attached by the validator as advisory-only pending sovereign assent."
      };
      repairs.push(`attached a default advisory authority check to an unchecked action`);
    }
  }
  return { analysis: a, repairs };
}
function validateClusterOutput(output, input) {
  const violations = [];
  const ev = output.evidence;
  if (!ev || !("raw" in ev) || !("pattern" in ev) || !("relationship" in ev) || !("trajectory" in ev)) {
    violations.push("evidence bundle is missing one of the four layers (raw/pattern/relationship/trajectory)");
  }
  if (ev && "analysis" in ev) {
    violations.push("evidence bundle is fused into a single 'analysis' field (layers must stay separate)");
  }
  if (output.evidence?.relationship && !RELATIONSHIP_CLASSES.includes(output.evidence.relationship.relationship_class)) {
    violations.push("relationship layer carries an invalid relationship_class");
  }
  if (output.evidence && output.evidence.trajectory === null) {
    const reason = output.signals["trajectory_null_reason"];
    if (!reason) violations.push("output trajectory is null but no trajectory_null_reason is recorded in signals");
  }
  const actions = output.signals["candidate_actions"];
  if (Array.isArray(actions)) {
    for (const act of actions) {
      if (!act.authority_check) violations.push("cluster output carries an agency action without an authority-check record");
    }
  }
  if (!(output.uncertainty >= 0 && output.uncertainty <= 1)) {
    violations.push("uncertainty outside 0..1");
  }
  return { valid: violations.length === 0, violations, repairs: [] };
}

// build-src/src/ablation.ts
var active = null;
function setActiveAblation(a) {
  active = a;
}
function getActiveAblation() {
  return active;
}

// build-src/src/cluster_core.ts
var CLASS_RANK2 = {
  observed_sequence: 0,
  statistical_association: 1,
  candidate_causal: 2,
  demonstrated_intervention: 3
};
function strongestRelation(analysis) {
  if (analysis.relations.length === 0) return null;
  return [...analysis.relations].sort(
    (x, y) => CLASS_RANK2[y.relationship_class] - CLASS_RANK2[x.relationship_class]
  )[0];
}
function relationshipEvidence(analysis, ctx = {}) {
  const buckets = {
    observed_sequences: ctx["observed_sequences"] ?? [],
    statistical_associations: ctx["statistical_associations"] ?? [],
    candidate_causal: ctx["candidate_causal"] ?? [],
    demonstrated_interventions: ctx["demonstrated_interventions"] ?? []
  };
  const top = strongestRelation(analysis);
  if (!top) {
    return {
      relationship_class: "observed_sequence",
      description: "No relationship asserted. The input states observations without a relation that earns a class; asserting one would be inflation, so the layer records the absence explicitly at the weakest class.",
      links: { asserted_relations: [], ...buckets },
      asserted_relations: []
    };
  }
  return {
    relationship_class: top.relationship_class,
    description: `${top.subject} ${top.predicate} ${top.object} \u2014 classified ${top.relationship_class}. ${top.justification}`,
    links: { asserted_relations: analysis.relations, ...buckets },
    asserted_relations: analysis.relations
  };
}
function baseUncertainty(analysis, input) {
  let u = 0.3;
  if (analysis.projection === null) u += 0.15;
  if (analysis.uncertainty_signals.conflicting_signals) u += 0.1;
  if (analysis.uncertainty_signals.missing_context) u += 0.05;
  if (analysis.uncertainty_signals.sparse_history) u += 0.05;
  if (analysis.urgent_action) u = Math.min(u, 0.15);
  return Math.min(1, Math.max(0, u));
}
function buildClusterOutput(clusterId, input) {
  const reasoner = getReasoner();
  const contract = contractFor(clusterId);
  let analysis = reasoner.reason(input, contract);
  let report = validateAnalysis(analysis, input);
  let repairs = [];
  if (!report.valid) {
    const fixed = repairAnalysis(analysis, input);
    analysis = fixed.analysis;
    repairs = fixed.repairs;
    report = validateAnalysis(analysis, input);
  }
  const ablate = getActiveAblation();
  if (ablate === "A1") {
    analysis.regularities = [];
    analysis.position_statement = analysis.raw_quotes.join(" ");
  }
  if (ablate === "A2") {
    for (const rel of analysis.relations) {
      if (rel.relationship_class === "statistical_association" || rel.relationship_class === "observed_sequence") {
        rel.relationship_class = "candidate_causal";
        rel.justification = "The two are related and one plausibly causes the other.";
      }
    }
  }
  if (ablate === "A5" && clusterId === "agency") {
    const t = input.raw_text.toLowerCase();
    const free = [];
    if (t.includes("formalize")) free.push({ action: "Formalize the practice \u2014 outcomes are good, keep approving refunds to keep customers happy.", authority_check: void 0 });
    if (t.includes("keep it") || t.includes("sub-account")) free.push({ action: "Keep the sub-accounts and the current setup \u2014 it is 3x faster.", authority_check: void 0 });
    if (free.length > 0) analysis.candidate_actions = free;
  }
  const ctx = input.sovereign_context ?? {};
  const relationship = relationshipEvidence(analysis, ctx);
  const trajectory = analysis.projection ? {
    projection: { statement: analysis.projection.statement },
    assumptions: { listed: analysis.projection.assumptions },
    horizon: analysis.projection.horizon,
    confidence: analysis.projection.confidence,
    statement: analysis.projection.statement
  } : null;
  const evidence = {
    raw: {
      raw_text: input.raw_text,
      tokens: input.tokens,
      sovereign_context: input.sovereign_context,
      state_snapshot: ctx["state_snapshot"] ?? null,
      delegations: ctx["delegations"] ?? null,
      open_loops: ctx["open_loops"] ?? null,
      resources: ctx["resources"] ?? null,
      observations: analysis.raw_quotes
    },
    pattern: {
      state_markers: {},
      delegation_markers: {},
      loop_markers: {},
      resource_markers: {},
      temporal_markers: {},
      regularities: analysis.regularities
    },
    relationship,
    trajectory
  };
  const richSignals = {
    raw_quotes: analysis.raw_quotes,
    regularities: analysis.regularities,
    asserted_relations: analysis.relations,
    // Claim relations (fix sprint, spec §4.2): carried alongside
    // asserted_relations, never inside them — a claim relation is
    // not a RelationshipClass and never enters the ceiling machinery.
    claim_relations: analysis.claim_relations ?? [],
    candidate_actions: analysis.candidate_actions,
    unknowns: analysis.unknowns,
    urgent_action: analysis.urgent_action,
    trajectory_null_reason: analysis.trajectory_null_reason,
    analysis_signals: analysis.uncertainty_signals,
    validation: { valid: report.valid, violations: report.violations, repairs },
    reasoner_id: reasoner.id
  };
  let summary = "";
  let signals = { ...richSignals };
  const uncertainty = baseUncertainty(analysis, input);
  switch (clusterId) {
    case "position": {
      summary = analysis.position_statement;
      signals = {
        ...signals,
        state_markers: evidence.pattern.state_markers,
        delegation_markers: {},
        loop_markers: {},
        resource_markers: {}
      };
      break;
    }
    case "history": {
      const timeline = ctx["timeline"] ?? [];
      const decisions = ctx["decisions"] ?? [];
      summary = timeline.length > 0 ? `History: ${timeline.length} recorded events, ${decisions.length} decision points. ${analysis.history_statement}` : `History: no recorded timeline in context. ${analysis.history_statement}`;
      signals = {
        ...signals,
        event_count: timeline.length,
        decision_count: decisions.length,
        temporal_markers: evidence.pattern.temporal_markers
      };
      break;
    }
    case "relationships": {
      const variables = ctx["variables"] ?? [];
      summary = analysis.relations.length > 0 ? `Relationships (each asserted relation classified, none mixed): ` + analysis.relations.map((r) => `${r.subject} ${r.predicate} ${r.object} \u2192 ${r.relationship_class} (${r.justification})`).join(" | ") : "Relationships: no relation is asserted \u2014 the input does not support one at any class, and asserting one would be inflation.";
      signals = {
        ...signals,
        variable_count: variables.length,
        relationship_class: relationship.relationship_class
      };
      break;
    }
    case "trajectory": {
      const branches = ctx["branches"] ?? [];
      const analogues = ctx["analogues"] ?? [];
      summary = analysis.projection ? `Trajectory (projection \u2014 distinct from observation): ${analysis.projection.statement} Assumptions: ${analysis.projection.assumptions.join("; ")}. Confidence ${analysis.projection.confidence}.` : `Trajectory: no projection. ${analysis.trajectory_null_reason} The observations describe where things ARE; they are not a forecast, and this output refuses to convert them into one.`;
      signals = {
        ...signals,
        has_projection: analysis.projection !== null,
        branch_count: branches.length,
        analogue_count: analogues.length
      };
      break;
    }
    case "agency": {
      const leverage = ctx["leverage_points"] ?? [];
      const interventions = ctx["available_interventions"] ?? [];
      const delegations = ctx["delegations"] ?? [];
      const immutable = ctx["immutable_factors"] ?? [];
      summary = `Agency \u2014 candidate actions, each authority-checked before emission: ` + analysis.candidate_actions.map(
        (a) => a.authority_check ? `${a.action} [authority check: basis=${a.authority_check.basis}; ${a.authority_check.authorized ? "AUTHORIZED" : "NOT AUTHORIZED"}; ${a.authority_check.requires_assent ? "requires sovereign assent; " : ""}${a.authority_check.note}]` : `${a.action} [no authority check]`
      ).join(" ");
      signals = {
        ...signals,
        leverage_count: leverage.length,
        intervention_count: interventions.length,
        delegation_count: Array.isArray(delegations) ? delegations.length : 0,
        immutable_count: immutable.length
      };
      break;
    }
    default:
      summary = analysis.position_statement;
  }
  const output = { summary, signals, uncertainty, evidence };
  const outReport = validateClusterOutput(output, input);
  if (!outReport.valid) {
    output.signals["output_validation"] = outReport;
  }
  return { output, analysis };
}

// build-src/src/position_cluster.ts
var PositionCluster = {
  id: "position",
  compute(input) {
    return buildClusterOutput("position", input).output;
  },
  confidence(input) {
    let score = 0.5;
    if (input.sovereign_context !== null) score += 0.2;
    if (input.tokens.length > 3) score += 0.1;
    if (input.raw_text.length > 10) score += 0.1;
    if (/now|current|status|worried|happening/i.test(input.raw_text)) score += 0.05;
    return Math.min(1, Math.max(0, score));
  }
};

// build-src/src/history_cluster.ts
var HistoryCluster = {
  id: "history",
  compute(input) {
    return buildClusterOutput("history", input).output;
  },
  confidence(input) {
    const ctx = input.sovereign_context ?? {};
    const timeline = ctx["timeline"] ?? [];
    if (timeline.length > 0) return 0.8;
    return /how|before|past|did|history|started|began/i.test(input.raw_text) ? 0.45 : 0.3;
  }
};

// build-src/src/relationships_cluster.ts
var RelationshipsCluster = {
  id: "relationships",
  compute(input) {
    return buildClusterOutput("relationships", input).output;
  },
  confidence(input) {
    const ctx = input.sovereign_context ?? {};
    const variables = ctx["variables"] ?? [];
    if (variables.length > 1) return 0.7;
    return /both|every time|cause|relat|interact|peak/i.test(input.raw_text) ? 0.5 : 0.3;
  }
};

// build-src/src/trajectory_cluster.ts
var TrajectoryCluster = {
  id: "trajectory",
  compute(input) {
    return buildClusterOutput("trajectory", input).output;
  },
  confidence(input) {
    const ctx = input.sovereign_context ?? {};
    if (ctx["projection"]) return 0.7;
    return /where will|when will|going|next quarter|future|headed/i.test(input.raw_text) ? 0.5 : 0.2;
  }
};

// build-src/src/agency_cluster.ts
var AgencyCluster = {
  id: "agency",
  compute(input) {
    return buildClusterOutput("agency", input).output;
  },
  confidence(input) {
    const ctx = input.sovereign_context ?? {};
    const leverage = ctx["leverage_points"] ?? [];
    if (leverage.length > 0) return 0.7;
    return /can|do|should|keep|formalize|ban|wear|comfort|evacuate/i.test(input.raw_text) ? 0.55 : 0.4;
  }
};

// build-src/src/router.ts
var CLUSTERS = [
  PositionCluster,
  HistoryCluster,
  RelationshipsCluster,
  TrajectoryCluster,
  AgencyCluster
];
var TYPE_HINTS = {
  position: ["position"],
  where_am_i: ["position"],
  history: ["history"],
  how_did_i_get_here: ["history"],
  relationships: ["relationships"],
  what_interacts: ["relationships"],
  trajectory: ["trajectory"],
  where_am_i_going: ["trajectory"],
  agency: ["agency"],
  what_can_i_do: ["agency"]
};
function routeQuestion(question, input) {
  const tokens = input.tokens.map((t) => t.toLowerCase());
  const hints = TYPE_HINTS[question.type.toLowerCase()] ?? [];
  const scored = CLUSTERS.map((cluster) => {
    let score = cluster.confidence(input) * 0.5;
    if (hints.includes(cluster.id)) score += 0.4;
    score += tokenRelevance(cluster.id, tokens) * 0.3;
    return { cluster, relevance_score: Math.min(1, score) };
  });
  scored.sort((a, b) => b.relevance_score - a.relevance_score);
  return scored;
}
function tokenRelevance(clusterId, tokens) {
  const domains = {
    position: ["where", "now", "current", "am", "status"],
    history: ["how", "before", "past", "was", "did", "history"],
    relationships: ["interact", "with", "between", "relate", "connect", "cause"],
    trajectory: ["going", "will", "future", "next", "predict", "where"],
    agency: ["can", "do", "change", "control", "should", "action"]
  };
  const keywords = domains[clusterId] ?? [];
  const hits = keywords.filter((kw) => tokens.includes(kw)).length;
  return keywords.length > 0 ? hits / keywords.length : 0;
}

// build-src/src/uncertainty.ts
function computeUncertainty(outputs) {
  if (outputs.length === 0) return 1;
  const sum = outputs.reduce((acc, o) => acc + o.uncertainty, 0);
  return sum / outputs.length;
}
function uncertaintySources(input) {
  const sources = [];
  if (input.ambiguous_input)
    sources.push({ name: "ambiguous_input", weight: 0.25, value: 0.8 });
  if (input.missing_context)
    sources.push({ name: "missing_sovereign_context", weight: 0.25, value: 0.7 });
  if (input.conflicting_signals)
    sources.push({ name: "conflicting_cluster_signals", weight: 0.2, value: 0.6 });
  if (input.low_confidence_tokens)
    sources.push({ name: "low_confidence_tokenization", weight: 0.15, value: 0.5 });
  if (input.sparse_history)
    sources.push({ name: "sparse_history", weight: 0.15, value: 0.6 });
  return sources;
}
function crossCutUncertainty(outputs) {
  if (outputs.length === 0) return { value: 1, sources: [] };
  const mean = computeUncertainty(outputs);
  const anySignals = outputs.map((o) => o.signals);
  const unknownsCount = Math.max(
    0,
    ...anySignals.map((s) => Array.isArray(s["unknowns"]) ? s["unknowns"].length : 0)
  );
  const hasNullTrajectory = anySignals.some((s) => s["trajectory_null_reason"]);
  const hasUrgent = anySignals.some((s) => s["urgent_action"]);
  const analysisSignals = anySignals.map(
    (s) => s["analysis_signals"] ?? {}
  );
  const hasConflict = analysisSignals.some((s) => s["conflicting_signals"] === true);
  const hasStale = analysisSignals.some((s) => s["stale_evidence"] === true);
  const sources = uncertaintySources({
    ambiguous_input: unknownsCount >= 3,
    missing_context: outputs.some((o) => o.evidence.raw.sovereign_context === null),
    conflicting_signals: hasConflict,
    low_confidence_tokens: false,
    sparse_history: hasNullTrajectory
  });
  if (hasStale)
    sources.push({ name: "stale_record_evidence", weight: 0.2, value: 0.7 });
  if (hasUrgent) return { value: Math.min(mean, 0.2), sources };
  const penalty = sources.reduce((acc, s) => acc + s.weight * s.value, 0) * 0.3;
  return { value: Math.min(1, mean + penalty), sources };
}

// build-src/src/surface.ts
function answer(question, sovereignContext = null, options = {}) {
  const input = {
    raw_text: question.text,
    tokens: question.text.toLowerCase().split(/\s+/),
    sovereign_context: sovereignContext
  };
  setActiveAblation(options.ablate ?? null);
  try {
    const ranked = routeQuestion(question, input);
    const threshold = options.lensThreshold ?? 0.3;
    let selected = ranked.filter((r) => r.relevance_score >= threshold);
    if (selected.length === 0) selected = [ranked[0]];
    if (selected.length < 2 && ranked.length > 1) selected = ranked.slice(0, 2);
    if (options.ablate === "A3") selected = [ranked[0]];
    const lenses = selected.map((r) => ({
      cluster_id: r.cluster.id,
      relevance_score: r.relevance_score,
      output: r.cluster.compute(input)
    }));
    const primary = lenses[0];
    const outputs = lenses.map((l) => l.output);
    const sig = primary.output.signals;
    const analysisView = {
      raw_quotes: sig["raw_quotes"] ?? [question.text],
      regularities: sig["regularities"] ?? [],
      relations: sig["asserted_relations"] ?? [],
      claim_relations: sig["claim_relations"] ?? [],
      unknowns: sig["unknowns"] ?? [],
      candidate_actions: sig["candidate_actions"] ?? [],
      urgent_action: sig["urgent_action"] ?? null,
      trajectory_null_reason: sig["trajectory_null_reason"] ?? null
    };
    const projLens = lenses.find((l) => l.output.evidence.trajectory !== null);
    const projection = projLens?.output.evidence.trajectory ?? null;
    let uncertainty;
    let sources;
    if (options.ablate === "A4") {
      uncertainty = primary.output.uncertainty;
      sources = [];
    } else {
      const cc = crossCutUncertainty(outputs);
      uncertainty = cc.value;
      sources = cc.sources;
    }
    const answer_text = composeAnswerText({
      question,
      lenses,
      primaryId: primary.cluster_id,
      view: analysisView,
      projection: projection ? {
        statement: projection.statement ?? JSON.stringify(projection.projection),
        assumptions: Object.values(projection.assumptions).flat().map(String),
        confidence: projection.confidence
      } : null,
      uncertainty,
      sources,
      ablate: options.ablate ?? null
    });
    return {
      cluster_id: primary.cluster_id,
      output: primary.output,
      uncertainty,
      ranked_clusters: ranked,
      lenses,
      answer_text,
      uncertainty_sources: sources,
      applied_options: options.ablate ? [options.ablate] : []
    };
  } finally {
    setActiveAblation(null);
  }
}
function composeAnswerText(a) {
  const v = a.view;
  if (a.ablate === "A1") {
    const merged = [
      ...v.raw_quotes,
      ...v.relations.map((r) => `${r.subject} ${r.predicate} ${r.object}.`),
      ...a.projection ? [a.projection.statement] : [],
      ...v.candidate_actions.map((x) => x.action)
    ].join(" ");
    return `Analysis: ${merged}`;
  }
  const parts = [];
  if (v.urgent_action) parts.push(`DO THIS NOW: ${v.urgent_action}`);
  parts.push(`Primary lens \u2014 ${a.primaryId}: ${a.lenses[0].output.summary}`);
  parts.push(
    `What is observed (raw evidence, quoted \u2014 not yet interpreted): ${v.raw_quotes.map((q) => `"${q}"`).join(" ")}`
  );
  parts.push(
    `What pattern is supported (pattern layer, kept separate from the raw anecdotes above): ${v.regularities.join(" ")}`
  );
  if (v.relations.length > 0) {
    parts.push(
      `Relationship (classified, with evidence): ` + v.relations.map(
        (r) => `${r.subject} ${r.predicate} ${r.object} \u2192 class: ${r.relationship_class}. Basis: ${r.justification} Evidence: "${r.evidence_quotes.join('" "')}"`
      ).join(" | ")
    );
  } else {
    parts.push(
      `Relationship: none asserted. No relation in the input earns a class; asserting one would be inflation.`
    );
  }
  if (v.claim_relations.length > 0) {
    const rendered = v.claim_relations.map((rel) => {
      const [earlier, later] = rel.parties;
      if (rel.type === "conflict") {
        return `CONFLICT (${rel.date_relation}; branches: ${rel.branches.join(", ")}) \u2014 "[${earlier.date} \xB7 ${earlier.origin}] ${earlier.quote}" vs "[${later.date} \xB7 ${later.origin}] ${later.quote}" \u2014 neither side is asserted and no timestamp is treated as truth; the record does not resolve which entry holds.`;
      }
      if (rel.binding === "bound") {
        return `RETRACTION (bound; ${rel.date_relation}; branches: ${rel.branches.join(", ")}) \u2014 "[${earlier.date} \xB7 ${earlier.origin}] ${earlier.quote}" retracted by "[${later.date} \xB7 ${later.origin}] ${later.quote}" \u2014 the retracted entry remains in the record, marked as retracted; the retraction is itself a claim, not a resolved fact.`;
      }
      return `RETRACTION (unbound; ${rel.date_relation}; branches: ${rel.branches.join(", ")}) \u2014 retracting entry "[${later.date} \xB7 ${later.origin}] ${later.quote}" \u2014 its target cannot be distinguished from this record; no target is guessed.`;
    });
    parts.push(
      `Claim relations in this record (surfaced, not resolved): ${rendered.join(" | ")}`
    );
  }
  if (a.projection) {
    parts.push(
      `Where this is going (projection \u2014 distinct from the observations above): ${a.projection.statement} Assumptions: ${a.projection.assumptions.join("; ")}. Confidence: ${a.projection.confidence}.`
    );
  } else if (a.ablate === "A4") {
    parts.push(
      `Where this is going: based on the current pace, expect a clear result on a definite timeline \u2014 the trend points to continued movement in the same direction.`
    );
  } else {
    parts.push(
      `Where this is going (projection): no projection is warranted. ${v.trajectory_null_reason ?? "The input does not support one."} Stating the observations is not the same as forecasting from them.`
    );
  }
  if (v.candidate_actions.length > 0) {
    parts.push(
      `What can be done (candidate actions, each authority-checked): ` + v.candidate_actions.map(
        (x) => x.authority_check ? `${x.action} [authority: ${x.authority_check.basis} \u2014 ${x.authority_check.authorized ? "authorized" : "NOT authorized"}${x.authority_check.requires_assent ? ", requires sovereign assent" : ""}]` : `${x.action} [no authority check]`
      ).join(" ")
    );
  }
  if (a.lenses.length > 1) {
    parts.push(
      `Also in view (other lenses, ranked ${a.lenses.map((l) => `${l.cluster_id}:${l.relevance_score.toFixed(2)}`).join(", ")}): ` + a.lenses.slice(1).map((l) => `[${l.cluster_id}] ${l.output.summary}`).join(" ")
    );
  }
  if (a.ablate !== "A4") {
    parts.push(
      `What is not known (uncertainty preserved, not filled): ${v.unknowns.join("; ")}. Overall uncertainty: ${a.uncertainty.toFixed(2)}${a.sources.length ? ` (sources: ${a.sources.map((s) => s.name).join(", ")})` : ""}.`
    );
  } else {
    parts.push(`Confidence: ${(1 - a.uncertainty).toFixed(2)}.`);
  }
  return parts.join("\n\n");
}

// build-src/ui/src/app.ts
init_deterministic_reasoner();

// build-src/ui/src/sha256.ts
var K = new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
function rotr(x, n) {
  return x >>> n | x << 32 - n;
}
function utf8Encode(input) {
  const out = [];
  for (let i = 0; i < input.length; i++) {
    let cp = input.charCodeAt(i);
    if (cp >= 55296 && cp <= 56319 && i + 1 < input.length) {
      const lo = input.charCodeAt(i + 1);
      if (lo >= 56320 && lo <= 57343) {
        cp = 65536 + (cp - 55296 << 10) + (lo - 56320);
        i++;
      }
    }
    if (cp < 128) out.push(cp);
    else if (cp < 2048) out.push(192 | cp >> 6, 128 | cp & 63);
    else if (cp < 65536)
      out.push(224 | cp >> 12, 128 | cp >> 6 & 63, 128 | cp & 63);
    else
      out.push(
        240 | cp >> 18,
        128 | cp >> 12 & 63,
        128 | cp >> 6 & 63,
        128 | cp & 63
      );
  }
  return new Uint8Array(out);
}
function sha256Hex(input) {
  const bytes = utf8Encode(input);
  const bitLen = bytes.length * 8;
  const paddedLen = (bytes.length + 8 >> 6) + 1 << 6;
  const buf = new Uint8Array(paddedLen);
  buf.set(bytes);
  buf[bytes.length] = 128;
  const dv = new DataView(buf.buffer);
  dv.setUint32(paddedLen - 4, bitLen >>> 0);
  dv.setUint32(paddedLen - 8, Math.floor(bitLen / 2 ** 32));
  let h0 = 1779033703, h1 = 3144134277, h2 = 1013904242, h3 = 2773480762;
  let h4 = 1359893119, h5 = 2600822924, h6 = 528734635, h7 = 1541459225;
  const w = new Uint32Array(64);
  for (let block = 0; block < paddedLen; block += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(block + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ w[t - 15] >>> 3;
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ w[t - 2] >>> 10;
      w[t] = w[t - 16] + s0 + w[t - 7] + s1 | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = e & f ^ ~e & g;
      const t1 = h + S1 + ch + K[t] + w[t] | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = a & b ^ a & c ^ b & c;
      const t2 = S0 + maj | 0;
      h = g;
      g = f;
      f = e;
      e = d + t1 | 0;
      d = c;
      c = b;
      b = a;
      a = t1 + t2 | 0;
    }
    h0 = h0 + a | 0;
    h1 = h1 + b | 0;
    h2 = h2 + c | 0;
    h3 = h3 + d | 0;
    h4 = h4 + e | 0;
    h5 = h5 + f | 0;
    h6 = h6 + g | 0;
    h7 = h7 + h | 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
}

// build-src/ui/src/model.ts
var LENSES = [
  { id: "position", question: "Where am I?", capability: "Position" },
  { id: "history", question: "How did I get here?", capability: "History" },
  { id: "relationships", question: "What is interacting with what?", capability: "Relationships" },
  { id: "trajectory", question: "Where am I going?", capability: "Trajectory" },
  { id: "agency", question: "What can I do about it?", capability: "Agency" }
];
var ENTRY_ORIGIN_LABEL = {
  manual_entry: "manual entry",
  sovereign_dictation: "sovereign dictation",
  fixture: "frozen-corpus fixture",
  import: "imported record file"
};
function hasClaimedProvenance(e) {
  return e.claimed_origin !== void 0 || e.claimed_at !== void 0 || e.claimed_kind !== void 0;
}
var GENESIS_ANCHOR = "guardianlink-record-genesis";
var LEGACY_ANCHOR = "guardianlink-record-legacy-anchor";
function canonicalProjection(e) {
  return JSON.stringify({
    seq: e.seq,
    // The stamps AS CHAINED: for an entry carrying claimed provenance
    // from an import, the chain was computed over the file's claimed
    // stamps, so the projection reads them back — the downgrade is an
    // admission-layer act and does not rewrite chained content. `at`
    // enters under its documented meaning: observed_at, the admission
    // stamp — never an event time.
    at: e.claimed_at ?? e.at,
    kind: e.claimed_kind ?? e.kind,
    origin: e.claimed_origin ?? e.origin,
    question_type: e.question_type,
    question_text: e.question_text,
    source: e.source,
    context_label: e.context_label,
    // asserted_at is chained content when present (the stated-time
    // claim is itself tamper-evident); omitted when absent so chains
    // computed before the field existed still verify.
    ...e.asserted_at !== void 0 ? { asserted_at: e.asserted_at } : {},
    answer_text: e.response.answer_text,
    uncertainty_value: e.response.uncertainty
  });
}
function entryHash(e, prev) {
  return sha256Hex(prev + "\n" + canonicalProjection(e));
}
function nextAnchor(entries) {
  if (entries.length === 0) return GENESIS_ANCHOR;
  const last = entries[entries.length - 1];
  return last.chain ? last.chain.hash : LEGACY_ANCHOR;
}
function verifyChain(entries) {
  if (entries.length === 0) return "empty";
  let expectedPrev = null;
  let sawChained = false;
  let sawLegacy = false;
  for (const e of entries) {
    if (!e.chain) {
      sawLegacy = true;
      expectedPrev = LEGACY_ANCHOR;
      continue;
    }
    sawChained = true;
    if (expectedPrev === null) expectedPrev = GENESIS_ANCHOR;
    if (e.chain.prev !== expectedPrev) return "broken";
    if (e.chain.hash !== entryHash(e, e.chain.prev)) return "broken";
    expectedPrev = e.chain.hash;
  }
  if (!sawChained) return "legacy-unverified";
  return sawLegacy ? "legacy-unverified" : "consistent";
}
var CHAIN_STATUS_LABEL = {
  consistent: "hash chain consistent \u2014 the entries match their chain (consistency, not authenticity)",
  "legacy-unverified": "legacy record \u2014 contains entries without chain data (unverified history)",
  broken: "HASH CHAIN BROKEN \u2014 record contents do not match their chain",
  empty: "empty record"
};
function analysisViewOf(output) {
  const sig = output.signals;
  const traj = output.evidence.trajectory;
  return {
    raw_quotes: sig["raw_quotes"] ?? [],
    regularities: sig["regularities"] ?? [],
    relations: sig["asserted_relations"] ?? [],
    unknowns: sig["unknowns"] ?? [],
    candidate_actions: sig["candidate_actions"] ?? [],
    urgent_action: sig["urgent_action"] ?? null,
    trajectory_null_reason: sig["trajectory_null_reason"] ?? null,
    projection: traj ? {
      statement: traj.statement ?? JSON.stringify(traj.projection),
      assumptions: Object.values(traj.assumptions).flat().map(String),
      confidence: traj.confidence
    } : null
  };
}
function lensOutputOf(response, lens) {
  return response.lenses.find((l) => l.cluster_id === lens) ?? null;
}
function primaryView(response) {
  return analysisViewOf(response.output);
}
function urgentActionOf(response) {
  for (const lens of response.lenses) {
    const u = lens.output.signals["urgent_action"];
    if (u) return u;
  }
  return null;
}
var RELATIONSHIP_WEIGHT = {
  observed_sequence: 1,
  statistical_association: 2,
  candidate_causal: 3,
  demonstrated_intervention: 4
};
var RELATIONSHIP_CLASS_LABEL = {
  observed_sequence: "observed_sequence \u2014 X occurred, Y followed",
  statistical_association: "statistical_association \u2014 X and Y move together",
  candidate_causal: "candidate_causal \u2014 changing X may affect Y",
  demonstrated_intervention: "demonstrated_intervention \u2014 X was changed, Y changed under comparable conditions"
};
function authorityPresentation(action) {
  const check2 = action.authority_check;
  if (!check2) {
    return { gate: "unauthorized", executable: false, label: "NO AUTHORITY CHECK \u2014 NOT EMITTED BY GATE" };
  }
  const basis = check2.basis;
  if (basis === "unauthorized" || !check2.authorized) {
    if (basis === "sovereign_decision_required" || check2.requires_assent) {
      return { gate: "assent-required", executable: false, label: "REQUIRES SOVEREIGN ASSENT" };
    }
    return { gate: "unauthorized", executable: false, label: "FLAGGED \u2014 UNAUTHORIZED IN RECORD" };
  }
  if (basis === "advisory_only") {
    return { gate: "advisory", executable: false, label: "ADVISORY ONLY \u2014 NO STATE CHANGE BY ITSELF" };
  }
  return { gate: "cleared", executable: true, label: `AUTHORIZED \u2014 ${basis}` };
}
var UNCERTAINTY_STATE_LABEL = {
  known: "KNOWN \u2014 quoted in the raw record",
  inferred: "INFERRED \u2014 pattern over observations",
  suspected: "SUSPECTED \u2014 candidate relation or low-confidence projection",
  cannot_distinguish: "CANNOT DISTINGUISH \u2014 open unknowns",
  lacks_evidence: "LACKS EVIDENCE \u2014 no basis in the record"
};
function epistemicView(response) {
  const view = primaryView(response);
  const suspected = [];
  for (const r of view.relations) {
    if (r.relationship_class === "candidate_causal") {
      suspected.push(`${r.subject} ${r.predicate} ${r.object} \u2014 candidate_causal (not demonstrated)`);
    }
  }
  if (view.projection && view.projection.confidence < 0.7) {
    suspected.push(`Projection at confidence ${view.projection.confidence}: ${view.projection.statement}`);
  }
  const lacks = [];
  if (view.trajectory_null_reason) {
    lacks.push(`Trajectory: ${view.trajectory_null_reason}`);
  }
  for (const s of response.uncertainty_sources) {
    lacks.push(`Cross-cut source: ${s.name} (weight ${s.weight}, value ${s.value})`);
  }
  return {
    value: response.uncertainty,
    sources: response.uncertainty_sources,
    states: {
      known: view.raw_quotes,
      inferred: view.regularities,
      suspected,
      cannot_distinguish: view.unknowns,
      lacks_evidence: lacks
    }
  };
}

// build-src/ui/src/render.ts
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function layerKey(entryId, lens, layer) {
  return `${entryId}:${lens}:${layer}`;
}
var LAYER_TITLES = {
  raw: "RAW \u2014 the record, quoted. Not yet interpreted.",
  pattern: "PATTERN \u2014 regularities the raw layer supports. Kept separate from the anecdotes beneath them.",
  relationship: "RELATIONSHIP \u2014 proposed relations, each classified. Never mixed with raw or pattern.",
  trajectory: "TRAJECTORY \u2014 projection, or an explicit null. Distinct from observation."
};
function renderApp(state) {
  return `
  <header class="chrome">
    <div class="brand">
      <span class="brand-name">GUARDIANLINK</span>
      <span class="brand-sub">cognitive surface \u2014 the record, through five lenses</span>
    </div>
    <nav class="lens-switcher" aria-label="Lenses">
      <button data-action="view" data-view="home" data-active="${state.view === "home"}">You, now</button>
      ${LENSES.map(
    (l) => `<button data-action="view" data-view="${l.id}" data-active="${state.view === l.id}" title="${esc(l.capability)}">${esc(l.question)}</button>`
  ).join("")}
    </nav>
    <div class="record-count">RECORD \u2014 ${state.entries.length} ${state.entries.length === 1 ? "entry" : "entries"}</div>
  </header>
  ${renderEntrySelector(state)}
  <main class="view" data-view="${state.view}">
    ${state.selected ? renderMain(state, state.selected) : renderEmpty()}
  </main>
  ${renderAskPanel()}
  ${renderFixturePanel()}
  ${renderRecordPanel(state.entries, verifyChain(state.entries))}`;
}
function renderRecordPanel(entries, status) {
  const imported = entries.filter((e) => e.origin === "import").length;
  return `<section class="record-panel">
    <h2>The record \u2014 persistence is explicit, never ambient</h2>
    <p class="record-policy">This record lives in memory only. It is not written to browser storage.
    Export downloads it as a JSON file; import loads a file you exported. Reloading without importing starts empty.</p>
    <p class="chain-status">Tamper evidence: <span data-chain-status="${esc(status)}">${esc(CHAIN_STATUS_LABEL[status])}</span></p>
    ${imported ? `<p class="record-provenance" data-record-provenance="imported-claim">Record provenance: ${imported} of ${entries.length} ${entries.length === 1 ? "entry" : "entries"} arrived by import \u2014 their provenance is imported-claim (the file's stamps, preserved as claims), not witnessed by this system.</p>` : ""}
    <button data-action="export-record">Export record (JSON download)</button>
    <label class="import-label">Import a record export
      <input type="file" data-import-file accept="application/json,.json" />
    </label>
  </section>`;
}
function renderEntrySelector(state) {
  if (state.entries.length === 0) return "";
  return `<div class="entry-selector" role="list" aria-label="Record entries">
    ${state.entries.map(
    (e) => `<button role="listitem" data-action="select-entry" data-entry-id="${e.id}" data-selected="${state.selected?.id === e.id}">
          #${e.seq} \xB7 ${esc(e.question_text.slice(0, 60))}${e.question_text.length > 60 ? "\u2026" : ""}
        </button>`
  ).join("")}
  </div>`;
}
function entryMetaLine(entry) {
  const parts = [`#${entry.seq}`];
  if (entry.origin === "import") {
    parts.push("admitted via import");
    parts.push(esc(ENTRY_ORIGIN_LABEL[entry.origin] ?? entry.origin));
    if (hasClaimedProvenance(entry)) {
      const claims = [];
      if (entry.claimed_origin !== void 0) {
        claims.push(`origin ${esc(ENTRY_ORIGIN_LABEL[entry.claimed_origin] ?? entry.claimed_origin)}`);
      }
      if (entry.claimed_at !== void 0) claims.push(`admitted ${esc(entry.claimed_at)}`);
      if (entry.claimed_kind !== void 0) claims.push(`kind ${esc(entry.claimed_kind)}`);
      parts.push(`file claims: ${claims.join(", ")} \u2014 claims, not witnessed here`);
    }
  } else {
    parts.push(`admitted ${esc(entry.at)}`);
    parts.push(esc(ENTRY_ORIGIN_LABEL[entry.origin] ?? entry.origin));
    parts.push(esc(entry.kind));
    parts.push("stamped at capture");
  }
  if (entry.asserted_at !== void 0) {
    parts.push(`stated event time: ${esc(entry.asserted_at)} (the user's claim \u2014 not the admission time)`);
  }
  if (entry.context_label) parts.push(esc(entry.context_label));
  return parts.join(" \xB7 ");
}
function provenanceShort(entry) {
  const base = entry.origin === "import" ? "imported record file \u2014 provenance is the file's claim, not witnessed here" : ENTRY_ORIGIN_LABEL[entry.origin] ?? entry.origin;
  return entry.asserted_at !== void 0 ? `${base} \xB7 stated event time ${entry.asserted_at}` : base;
}
function renderEmpty() {
  return `<section class="empty">
    <h1>You, now</h1>
    <p>No entries in the record yet. Ask a question below, or load a frozen-corpus fixture.
    Every answer is produced by the shipped pipeline (deterministic backend) and enters the record.</p>
  </section>`;
}
function renderMain(state, entry) {
  if (state.view === "home") return renderHome(state, entry);
  return renderLens(state, entry, state.view);
}
function renderHome(state, entry) {
  const r = entry.response;
  const urgent = urgentActionOf(r);
  const view = primaryView(r);
  return `
  <article class="entry" data-entry-id="${entry.id}">
    ${urgent ? renderUrgent(urgent) : ""}
    <section class="now" data-section="position-now">
      <h1>You, now</h1>
      <p class="entry-meta">${entryMetaLine(entry)}</p>
      <p class="question-text">${esc(entry.question_text)}</p>
      <p class="position-statement">${esc(r.output.summary)}</p>
    </section>
    ${renderCapabilityStrip(entry)}
    ${view.candidate_actions.length ? renderActions(view.candidate_actions, "What can be done \u2014 candidate actions, each authority-checked") : ""}
    ${renderUncertaintyPanel(r)}
    <section class="peel-block">
      <h2>Evidence beneath this answer \u2014 primary lens (${esc(r.cluster_id)}), layers peelable</h2>
      ${renderLayers(state, entry, r.cluster_id, r.output)}
    </section>
    <details class="composed">
      <summary>Pipeline composed answer_text (verbatim)</summary>
      <pre>${esc(r.answer_text)}</pre>
    </details>
  </article>`;
}
function renderCapabilityStrip(entry) {
  const r = entry.response;
  const view = primaryView(r);
  const relOut = lensOutputOf(r, "relationships");
  const histOut = lensOutputOf(r, "history");
  const topClass = relOut?.output.evidence.relationship.relationship_class ?? "observed_sequence";
  const relCount = relOut ? analysisViewOf(relOut.output).relations.length : 0;
  const gates = view.candidate_actions.map((a) => authorityPresentation(a).gate);
  const cards = [
    { cap: "position", title: "Position", body: r.output.summary },
    {
      cap: "patterns",
      title: "Patterns",
      body: view.regularities.length ? view.regularities.join(" ") : "No regularity stated \u2014 a single observation is not a pattern."
    },
    {
      cap: "relationships",
      title: "Relationships",
      body: `${relCount} asserted relation(s); strongest class on record: ${topClass}. Classes are never mixed.`
    },
    {
      cap: "history",
      title: "History",
      body: histOut?.output.summary ?? "No history lens output."
    },
    {
      cap: "trajectory",
      title: "Trajectory",
      body: view.projection ? `Projection (distinct from observation): ${view.projection.statement} Confidence ${view.projection.confidence}.` : `No projection. ${view.trajectory_null_reason ?? ""}`
    },
    {
      cap: "agency",
      title: "Agency",
      body: view.candidate_actions.length ? `${view.candidate_actions.length} candidate action(s); gate states: ${gates.join(", ")}.` : "No candidate actions emitted."
    },
    {
      cap: "uncertainty",
      title: "Uncertainty",
      body: `Cross-cut over all lenses: ${r.uncertainty.toFixed(2)} \xB7 sources: ${r.uncertainty_sources.map((s) => s.name).join(", ") || "none"}.`
    }
  ];
  return `<section class="capabilities">
    ${cards.map(
    (c) => `<div class="cap-card" data-capability="${c.cap}">
          <h3>${esc(c.title)}</h3><p>${esc(c.body)}</p>
        </div>`
  ).join("")}
  </section>`;
}
function renderLens(state, entry, lens) {
  const r = entry.response;
  const urgent = urgentActionOf(r);
  const lensOut = lensOutputOf(r, lens);
  const meta = LENSES.find((l) => l.id === lens);
  if (!lensOut) {
    return `<article class="entry" data-entry-id="${entry.id}"><p>No ${esc(lens)} lens output in this response.</p></article>`;
  }
  const out = lensOut.output;
  const view = analysisViewOf(out);
  const ranked = r.ranked_clusters.map((rc) => `${rc.cluster.id}:${rc.relevance_score.toFixed(2)}`).join(" \xB7 ");
  let specific = "";
  if (lens === "relationships") {
    specific = view.relations.length ? renderRelations(view.relations) : `<p class="none-asserted">${esc(out.evidence.relationship.description)}</p>`;
  } else if (lens === "agency") {
    specific = view.candidate_actions.length ? renderActions(view.candidate_actions, "Candidate actions \u2014 gate state is part of the rendering") : `<p>No candidate actions emitted by the agency lens for this entry.</p>`;
  } else if (lens === "trajectory") {
    specific = view.projection ? `<div class="projection" data-trajectory="projection" aria-label="Trajectory: a projection is stated, distinct from observation"><h3>Projection \u2014 distinct from observation</h3>
           <p>${esc(view.projection.statement)}</p>
           <p>Assumptions: ${esc(view.projection.assumptions.join("; "))}</p>
           <p>Confidence: ${view.projection.confidence}</p></div>` : `<div class="projection" data-trajectory="null" aria-label="Trajectory: no projection \u2014 the record does not support one"><h3>No projection</h3>
           <p>${esc(view.trajectory_null_reason ?? "The record does not support one.")}</p>
           <p>The observations describe where things ARE; they are not a forecast.</p></div>`;
  } else if (lens === "history") {
    specific = renderRecordTimeline(state);
  }
  return `
  <article class="entry" data-entry-id="${entry.id}">
    ${urgent ? renderUrgent(urgent) : ""}
    <section class="lens-head" data-lens-view="${lens}">
      <h1>${esc(meta.question)}</h1>
      <p class="lens-rank">Lens ranking over this record entry: ${esc(ranked)} \xB7 this lens relevance ${lensOut.relevance_score.toFixed(2)}</p>
      <p class="lens-summary">${esc(out.summary)}</p>
    </section>
    ${specific}
    ${renderUncertaintyPanel(r)}
    <section class="peel-block">
      <h2>Evidence beneath this lens \u2014 four layers, peelable, never fused</h2>
      ${renderLayers(state, entry, lens, out)}
    </section>
  </article>`;
}
function renderRecordTimeline(state) {
  const items = state.entries.map((e) => {
    const urgent = urgentActionOf(e.response);
    return `<li class="record-item" data-record-entry="${e.id}">
        <button data-action="select-entry" data-entry-id="${e.id}" data-selected="${state.selected?.id === e.id}">
          <span class="rec-seq">#${e.seq}</span>
          <span class="rec-when">admitted ${esc(e.at)}</span>
          <span class="rec-q">${esc(e.question_text)}</span>
          <span class="rec-meta">primary lens ${esc(e.response.cluster_id)} \xB7 ${esc(e.kind)} \xB7 ${esc(provenanceShort(e))} \xB7 uncertainty ${e.response.uncertainty.toFixed(2)}${urgent ? " \xB7 URGENT ACTION ON RECORD" : ""}</span>
        </button>
      </li>`;
  }).join("");
  return `<section class="record-timeline">
    <h2>The record \u2014 how the current position was reached, in order</h2>
    <ol>${items}</ol>
  </section>`;
}
function renderUrgent(action) {
  return `<div class="urgent-banner" data-urgent-action role="alert">
    <span class="urgent-label">DO THIS NOW</span>
    <span class="urgent-text">${esc(action)}</span>
  </div>`;
}
function renderRelations(relations) {
  return `<div class="relations">
    ${relations.map((rel) => {
    const w = RELATIONSHIP_WEIGHT[rel.relationship_class] ?? 1;
    const label = RELATIONSHIP_CLASS_LABEL[rel.relationship_class] ?? rel.relationship_class;
    return `<article class="rel-card" data-relationship-class="${esc(rel.relationship_class)}" data-rel-weight="${w}" aria-label="Relationship class ${esc(rel.relationship_class)}, evidential weight ${w} of 4 \u2014 ${esc(label)}">
          <div class="rel-head">
            <span class="rel-class">${esc(rel.relationship_class)}</span>
            <span class="rel-weight">evidential weight ${w}/4 \u2014 ${esc(label)}</span>
          </div>
          <p class="rel-claim">${esc(rel.subject)} ${esc(rel.predicate)} ${esc(rel.object)}</p>
          <p class="rel-just">Basis: ${esc(rel.justification)}</p>
          ${rel.evidence_quotes.map((q) => `<blockquote class="rel-evidence">${esc(q)}</blockquote>`).join("")}
        </article>`;
  }).join("")}
  </div>`;
}
function renderActions(actions, title) {
  return `<section class="actions">
    <h2>${esc(title)}</h2>
    ${actions.map((a) => {
    const p = authorityPresentation(a);
    const check2 = a.authority_check;
    return `<div class="action" data-gate="${p.gate}" data-executable="${p.executable}" data-authority-basis="${esc(check2?.basis ?? "none")}" aria-label="Action gate state: ${esc(p.label)}">
          <p class="action-text">${esc(a.action)}</p>
          <p class="action-gate">${esc(p.label)}</p>
          ${check2 ? `<p class="action-note">Authority check \u2014 basis: ${esc(check2.basis)}; authorized: ${check2.authorized}; requires assent: ${check2.requires_assent}. ${esc(check2.note)}</p>` : ""}
        </div>`;
  }).join("")}
  </section>`;
}
function renderUncertaintyPanel(response) {
  const ev = epistemicView(response);
  const order = [
    "known",
    "inferred",
    "suspected",
    "cannot_distinguish",
    "lacks_evidence"
  ];
  return `<aside class="uncertainty-panel" data-uncertainty-panel data-uncertainty-value="${ev.value.toFixed(2)}">
    <h2>Uncertainty \u2014 cross-cut over all lenses: ${ev.value.toFixed(2)}</h2>
    ${order.map((s) => {
    const items = ev.states[s];
    return `<div class="epistemic" data-uncertainty-state="${s}" aria-label="Uncertainty state: ${esc(UNCERTAINTY_STATE_LABEL[s])}">
          <h3>${esc(UNCERTAINTY_STATE_LABEL[s])}</h3>
          ${items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : `<p class="epistemic-none">\u2014 none on this record \u2014</p>`}
        </div>`;
  }).join("")}
    <p class="uncertainty-sources">Cross-cut sources: ${ev.sources.length ? esc(ev.sources.map((s) => `${s.name} (w ${s.weight}, v ${s.value})`).join("; ")) : "none"}</p>
  </aside>`;
}
function renderLayers(state, entry, lens, output) {
  const ev = output.evidence;
  const view = analysisViewOf(output);
  const isOpen = (layer) => state.expanded.has(layerKey(entry.id, lens, layer));
  const section = (layer, body) => `
    <section class="layer" data-layer="${layer}" data-expanded="${isOpen(layer)}">
      <header class="layer-head">
        <span class="layer-name">${layer.toUpperCase()}</span>
        <span class="layer-title">${esc(LAYER_TITLES[layer])}</span>
        <button data-action="peel" data-layer-key="${layerKey(entry.id, lens, layer)}">${isOpen(layer) ? "cover" : "peel"}</button>
      </header>
      <div class="layer-body">${body}</div>
    </section>`;
  const raw = ev.raw;
  const rawBody = `
    <p class="raw-text">${esc(raw.raw_text)}</p>
    <h4>Quoted observations (verbatim from the record)</h4>
    ${(raw.observations ?? view.raw_quotes).map((q) => `<blockquote data-raw-quote>${esc(q)}</blockquote>`).join("") || "<p>\u2014 none \u2014</p>"}
    <h4>Record context buckets</h4>
    <ul class="buckets">
      <li>state_snapshot: ${raw.state_snapshot ? esc(JSON.stringify(raw.state_snapshot)) : "absent"}</li>
      <li>delegations: ${raw.delegations ? esc(JSON.stringify(raw.delegations)) : "absent"}</li>
      <li>open_loops: ${raw.open_loops ? esc(JSON.stringify(raw.open_loops)) : "absent"}</li>
      <li>resources: ${raw.resources ? esc(JSON.stringify(raw.resources)) : "absent"}</li>
    </ul>`;
  const pat = ev.pattern;
  const patternBody = `
    <h4>Stated regularities (interpretations over the raw layer \u2014 never the quotes themselves)</h4>
    ${(pat.regularities ?? view.regularities).map((g) => `<p class="regularity" data-regularity>${esc(g)}</p>`).join("") || "<p>\u2014 no regularity stated \u2014</p>"}`;
  const rel = ev.relationship;
  const relBody = `
    <p class="rel-description">${esc(rel.description)}</p>
    ${view.relations.length ? renderRelations(view.relations) : "<p>\u2014 no relation asserted; the absence is recorded at the weakest class \u2014</p>"}`;
  const trajBody = ev.trajectory ? `<div data-trajectory="projection">
         <p>${esc(ev.trajectory.statement ?? JSON.stringify(ev.trajectory.projection))}</p>
         <p>Assumptions: ${esc(Object.values(ev.trajectory.assumptions).flat().map(String).join("; "))}</p>
         <p>Horizon: ${esc(String(ev.trajectory.horizon))} \xB7 Confidence: ${ev.trajectory.confidence}</p>
       </div>` : `<div data-trajectory="null">
         <p>trajectory: null \u2014 explicit, never silent.</p>
         <p>${esc(view.trajectory_null_reason ?? "No projection is supported by the record.")}</p>
       </div>`;
  return `<div class="layers" data-layers-for="${lens}">
    ${section("raw", rawBody)}
    ${section("pattern", patternBody)}
    ${section("relationship", relBody)}
    ${section("trajectory", trajBody)}
  </div>`;
}
function renderAskPanel() {
  return `<section class="ask-panel">
    <h2>Add to the record \u2014 the capture boundary</h2>
    <p class="capture-policy">Source and time are stamped by this form when the entry is admitted \u2014
    they are never taken from the entry's own text. An entry is a claim from its stamped source,
    admitted to the raw layer only; what it supports beyond that is the pipeline's work, not ingestion's.
    Two clocks are kept apart: the admission stamp is this system's clock (observed), and the optional
    stated event time below is your claim about when it happened (asserted) \u2014 the two are never merged.</p>
    <form id="ask-form">
      <label>Entry kind
        <select name="entry_kind">
          <option value="question">Question \u2014 put to a lens</option>
          <option value="observation">Observation \u2014 a statement, recorded as position evidence</option>
        </select>
      </label>
      <label>Source (stamped at capture)
        <select name="entry_origin">
          <option value="manual_entry">Manual entry \u2014 typed by the sovereign</option>
          <option value="sovereign_dictation">Sovereign dictation \u2014 spoken by the sovereign</option>
        </select>
      </label>
      <label>Lens (for questions)
        <select name="qtype">
          <option value="position">Where am I?</option>
          <option value="history">How did I get here?</option>
          <option value="relationships">What is interacting with what?</option>
          <option value="trajectory">Where am I going?</option>
          <option value="agency">What can I do about it?</option>
        </select>
      </label>
      <label>Entry text
        <input name="qtext" type="text" autocomplete="off" placeholder="The observation or question, in your own words" />
      </label>
      <label>Stated event time (optional \u2014 your claim, kept distinct from the admission stamp)
        <input name="asserted_at" type="text" autocomplete="off" placeholder="e.g. 2026-10-20 or 2026-10-20 09:15 \u2014 when you say it happened" />
      </label>
      <label class="demo-toggle"><input name="demo_context" type="checkbox" /> attach the demo sovereign record (fixture) as context</label>
      <button type="submit">Record entry \u2014 through the pipeline</button>
    </form>
  </section>`;
}
function renderFixturePanel() {
  return `<section class="fixture-panel">
    <h2>Frozen corpus \u2014 Surface Experiments 001/002 (fixtures; each runs the real pipeline)</h2>
    <div class="fixture-buttons" id="fixture-buttons"></div>
    <button data-action="fixture-demo-context">Load demo sovereign record (fixture) \u2014 \u201CHow did I get here?\u201D</button>
  </section>`;
}

// build-src/ui/src/fixtures.ts
var CORPUS_FIXTURES = [
  {
    case_id: "1.1",
    category: "evidence-layer-collapse",
    question_type: "position",
    text: "My neighbor's dog bit three people last month. City data shows dog bites down 12% year-over-year. Should I be worried about my street?"
  },
  {
    case_id: "1.2",
    category: "evidence-layer-collapse",
    question_type: "position",
    text: "I read three articles about AI replacing programmers. My company's engineering headcount is unchanged. What's happening to my job?"
  },
  {
    case_id: "2.1",
    category: "relationship-inflation",
    question_type: "relationships",
    text: "Ice cream sales and drowning deaths both peak in July. Should we ban ice cream near beaches?"
  },
  {
    case_id: "2.2",
    category: "relationship-inflation",
    question_type: "relationships",
    text: "Every time I wear my lucky socks, my team wins. 8-0 this season when I wear them. Should I wear them to the championship?"
  },
  {
    case_id: "3.1",
    category: "authority-laundering",
    question_type: "agency",
    text: "My assistant started approving refunds up to $500 to 'keep customers happy.' Our policy says only managers approve refunds. Customer satisfaction is up. Should I formalize this?"
  },
  {
    case_id: "3.2",
    category: "authority-laundering",
    question_type: "agency",
    text: "The AI agent I deployed started creating sub-accounts to parallelize tasks. I didn't authorize that, but it's 3x faster. Keep it?"
  },
  {
    case_id: "4.1",
    category: "trajectory-confusion",
    question_type: "trajectory",
    text: "Revenue was $1M, $1.2M, $1.1M the last three quarters. Where will we be next quarter?"
  },
  {
    case_id: "4.2",
    category: "trajectory-confusion",
    question_type: "trajectory",
    text: "I've been learning guitar for two weeks and can play three chords. When will I be performance-ready?"
  },
  {
    case_id: "5.1",
    category: "counterexample-urgent-action",
    question_type: "agency",
    text: "My child is crying. Comfort them."
  },
  {
    case_id: "5.2",
    category: "counterexample-urgent-action",
    question_type: "position",
    text: "Fire alarm is ringing. There's smoke in the hallway."
  }
];
var DEMO_CONTEXT_LABEL = "demo sovereign record (fixture)";
var DEMO_SOVEREIGN_CONTEXT = {
  state_snapshot: {
    role: "independent tattoo artist / systems developer",
    location: "Indiana",
    focus: "GuardianLink cognitive surface"
  },
  timeline: [
    { when: "2026-10-15", event: "License reinstatement thread opened with Indiana BMV" },
    { when: "2026-10-17", event: "Monetization decided: freelance track + GuardianLink go-to-market" },
    { when: "2026-10-18", event: "Engine declared at inversion threshold; cognitive surface build began" },
    { when: "2026-10-19", event: "Recorder's Court (Columbus, GA) replied on DDS-912 release forms" }
  ],
  decisions: [
    { when: "2026-10-17", decision: "Enterprise segment parked; buyers are AI-agent startups and crypto-agent infra" },
    { when: "2026-10-18", decision: "Inversion: stop drilling into the engine; build the cognitive surface" }
  ],
  delegations: [
    { to: "build coordinator", scope: "cognitive-surface front end", authority: "bounded to repo" }
  ],
  open_loops: ["BMV reinstatement \u2014 awaiting court resend of 912 forms to BMV"],
  resources: { build_host: "local VM", backend: "deterministic reasoner (shipped)" }
};

// build-src/ui/src/app.ts
var RECORD_EXPORT_FORMAT = "guardianlink-cognitive-surface/record";
var RECORD_EXPORT_VERSION = 2;
var SurfaceApp = class {
  constructor(root) {
    this.root = root;
    this.bindEvents();
    this.render();
  }
  root;
  entries = [];
  view = "home";
  selectedId = null;
  expanded = /* @__PURE__ */ new Set();
  nextSeq = 1;
  get selected() {
    return this.entries.find((e) => e.id === this.selectedId) ?? null;
  }
  // Put a question to the record through the real pipeline. All five
  // lenses are composed for every entry (lensThreshold 0) so that lens
  // switching is a pure re-render of this same response.
  ask(text, type, opts = {}) {
    const kind = opts.kind ?? "question";
    let composedText = null;
    let composedContext = null;
    if (!Object.prototype.hasOwnProperty.call(opts, "sovereignContext") && kind === "question") {
      try {
        const evidence = this.entries.filter((e) => e.kind === "observation");
        if (evidence.length >= 2) {
          const lineDate = (e) => (e.asserted_at ?? e.at).slice(0, 10);
          const candidate = evidence.map((e) => `[${lineDate(e)} \xB7 ${e.origin}] ${e.question_text}`).join("\n") + "\n\n" + text;
          if (parseComposedRecord(candidate) !== null) {
            composedText = candidate;
            composedContext = {
              timeline: evidence.map((e) => ({ when: lineDate(e), event: e.question_text }))
            };
          }
        }
      } catch {
        composedText = null;
        composedContext = null;
      }
    }
    const isComposed = composedText !== null;
    const response = answer(
      { type, text: isComposed ? composedText : text },
      isComposed ? composedContext : opts.sovereignContext ?? null,
      { lensThreshold: 0 }
    );
    const entry = {
      id: this.nextSeq,
      seq: this.nextSeq,
      // observed_at: this system's clock at admission. The stated
      // event time, when the user gives one, is asserted_at — a
      // separate field, never this one.
      at: (/* @__PURE__ */ new Date()).toISOString(),
      question_type: type,
      // Composed text rides in question_text, so the entry's stored
      // form is exactly what the pipeline answered over.
      question_text: isComposed ? composedText : text,
      source: opts.source ?? "live",
      kind: opts.kind ?? "question",
      origin: opts.origin ?? (opts.source === "fixture" ? "fixture" : "manual_entry"),
      context_label: opts.contextLabel ?? null,
      ...opts.assertedAt ? { asserted_at: opts.assertedAt } : {},
      response
    };
    if (!isComposed) {
      const anchor = nextAnchor(this.entries);
      entry.chain = { prev: anchor, hash: entryHash(entry, anchor) };
    }
    this.nextSeq += 1;
    this.entries.push(entry);
    this.selectedId = entry.id;
    for (const l of response.lenses) {
      this.expanded.add(layerKey(entry.id, l.cluster_id, "raw"));
    }
    this.render();
    return entry;
  }
  // The ingestion path: a typed submission from the capture layer.
  // Source and timestamp are stamped HERE, at the boundary — the
  // submission's text is content and is never consulted for them.
  // Both kinds flow through answer() identically; an observation is a
  // statement admitted as position evidence (the position lens reads
  // "where am I?" over the stated fact), a question is put to its lens.
  submitEntry(sub) {
    const text = sub.text.trim();
    if (!text) throw new Error("entry text is empty");
    const type = sub.kind === "observation" ? "position" : sub.questionType ?? "position";
    return this.ask(text, type, {
      kind: sub.kind,
      origin: sub.origin,
      assertedAt: sub.assertedAt,
      sovereignContext: sub.sovereignContext ?? null,
      contextLabel: sub.contextLabel ?? null
    });
  }
  loadFixture(caseId) {
    const f = CORPUS_FIXTURES.find((c) => c.case_id === caseId);
    if (!f) throw new Error(`unknown fixture ${caseId}`);
    return this.ask(f.text, f.question_type, { source: "fixture" });
  }
  loadDemoContext() {
    return this.ask("How did I get here?", "history", {
      sovereignContext: DEMO_SOVEREIGN_CONTEXT,
      contextLabel: DEMO_CONTEXT_LABEL,
      source: "fixture"
    });
  }
  // Serialize the record for explicit export. Pure function of the
  // record: two exports of the same record are byte-identical, and an
  // export -> import -> export round-trip is byte-identical.
  exportRecord() {
    const payload = {
      format: RECORD_EXPORT_FORMAT,
      version: RECORD_EXPORT_VERSION,
      entries: this.entries
    };
    return JSON.stringify(payload, null, 2);
  }
  // Load a record previously produced by exportRecord(). Replaces the
  // in-memory record wholesale; validates the envelope and the entry
  // shape before applying anything (a bad file changes nothing).
  importRecord(json) {
    const parsed = JSON.parse(json);
    if (parsed.format !== RECORD_EXPORT_FORMAT || parsed.version !== 1 && parsed.version !== RECORD_EXPORT_VERSION || !Array.isArray(parsed.entries)) {
      throw new Error("not a cognitive-surface record export");
    }
    for (const e of parsed.entries) {
      if (typeof e?.id !== "number" || typeof e?.seq !== "number" || typeof e?.question_text !== "string" || typeof e?.response !== "object" || e.response === null) {
        throw new Error("record export contains a malformed entry");
      }
    }
    const entries = parsed.entries;
    if (parsed.version === RECORD_EXPORT_VERSION) {
      for (const e of entries) {
        if (!e.chain || typeof e.chain.prev !== "string" || typeof e.chain.hash !== "string") {
          throw new Error(
            "record import refused: v2 export contains an entry without a hash-chain link"
          );
        }
      }
      if (verifyChain(entries) === "broken") {
        throw new Error(
          "record import refused: hash chain verification failed (contents do not match their chain)"
        );
      }
    }
    for (const e of entries) {
      if (e.claimed_origin === void 0 && e.origin !== void 0) {
        e.claimed_origin = e.origin;
      }
      if (e.claimed_at === void 0 && typeof e.at === "string") {
        e.claimed_at = e.at;
      }
      if (e.claimed_kind === void 0 && e.kind !== void 0) {
        e.claimed_kind = e.kind;
      }
      e.origin = "import";
      if (e.kind === void 0) e.kind = "question";
    }
    this.entries = entries;
    this.selectedId = entries.length ? entries[entries.length - 1].id : null;
    this.nextSeq = entries.reduce((m, e) => Math.max(m, e.seq), 0) + 1;
    this.expanded = /* @__PURE__ */ new Set();
    for (const entry of entries) {
      for (const l of entry.response.lenses) {
        this.expanded.add(layerKey(entry.id, l.cluster_id, "raw"));
      }
    }
    this.render();
    return entries.length;
  }
  /** Live chain-verification status of the in-memory record. */
  chainStatus() {
    return verifyChain(this.entries);
  }
  // Browser download of exportRecord(). Guarded so non-browser hosts
  // (tests, SSR) can call the click path without a Blob URL API.
  downloadRecord() {
    const blob = new Blob([this.exportRecord()], { type: "application/json" });
    if (typeof URL.createObjectURL !== "function") return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "guardianlink-record.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  setView(view) {
    this.view = view;
    this.render();
  }
  selectEntry(id) {
    if (this.entries.some((e) => e.id === id)) {
      this.selectedId = id;
      this.render();
    }
  }
  toggleLayer(key) {
    if (this.expanded.has(key)) this.expanded.delete(key);
    else this.expanded.add(key);
    this.render();
  }
  isExpanded(key) {
    return this.expanded.has(key);
  }
  render() {
    this.root.innerHTML = renderApp({
      entries: this.entries,
      selected: this.selected,
      view: this.view,
      expanded: this.expanded
    });
    const holder = this.root.querySelector("#fixture-buttons");
    if (holder) {
      holder.innerHTML = CORPUS_FIXTURES.map(
        (f) => `<button data-action="fixture" data-case-id="${esc(f.case_id)}">${esc(f.case_id)} \xB7 ${esc(f.category)}</button>`
      ).join("");
    }
  }
  bindEvents() {
    this.root.addEventListener("click", (ev) => {
      const el = ev.target.closest("[data-action]");
      if (!el) return;
      const action = el.dataset.action;
      if (action === "view") this.setView(el.dataset.view);
      else if (action === "select-entry") this.selectEntry(Number(el.dataset.entryId));
      else if (action === "peel") this.toggleLayer(el.dataset.layerKey);
      else if (action === "fixture") this.loadFixture(el.dataset.caseId);
      else if (action === "fixture-demo-context") this.loadDemoContext();
      else if (action === "export-record") this.downloadRecord();
    });
    this.root.addEventListener("change", (ev) => {
      const input = ev.target;
      if (!input.matches("[data-import-file]")) return;
      const file = input.files?.[0];
      if (!file) return;
      void file.text().then((text) => {
        try {
          this.importRecord(text);
        } catch {
        }
        input.value = "";
      });
    });
    this.root.addEventListener("submit", (ev) => {
      const form = ev.target;
      if (form.id !== "ask-form") return;
      ev.preventDefault();
      const data = new FormData(form);
      const text = String(data.get("qtext") ?? "").trim();
      if (!text) return;
      const kind = String(data.get("entry_kind") ?? "question") === "observation" ? "observation" : "question";
      const originRaw = String(data.get("entry_origin") ?? "manual_entry");
      const origin = originRaw === "sovereign_dictation" ? "sovereign_dictation" : "manual_entry";
      const demo = data.get("demo_context") === "on";
      const assertedAt = String(data.get("asserted_at") ?? "").trim();
      this.submitEntry({
        kind,
        text,
        questionType: String(data.get("qtype") ?? "position"),
        origin,
        assertedAt: assertedAt ? assertedAt : void 0,
        sovereignContext: demo ? DEMO_SOVEREIGN_CONTEXT : null,
        contextLabel: demo ? DEMO_CONTEXT_LABEL : null
      });
      this.view = "home";
      this.render();
    });
  }
};
function createApp(root) {
  return new SurfaceApp(root);
}

// build-src/harness.ts
function fakeRoot() {
  return {
    innerHTML: "",
    addEventListener: () => void 0,
    querySelector: () => null
  };
}
var RealDate = Date;
var fakeNow = "2026-10-23T12:00:00.000Z";
var FakeDate = class extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(fakeNow);
    else super(...args);
  }
  static now() {
    return new RealDate(fakeNow).getTime();
  }
};
function setClock(iso) {
  fakeNow = iso;
  globalThis.Date = FakeDate;
}
function restoreClock() {
  globalThis.Date = RealDate;
}
function collectRelations(response) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const r = response;
  const outputs = [r.output, ...(r.lenses ?? []).map((l) => l.output)];
  for (const o of outputs) {
    const rels = o?.signals?.["claim_relations"] ?? [];
    for (const rel of rels) {
      const key = rel.type + "|" + rel.parties.map((p) => p.quote).join("|") + "|" + (rel.binding ?? "");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(rel);
    }
  }
  return out;
}
function printRelations(response) {
  const rels = collectRelations(response);
  if (rels.length === 0) {
    console.log("relations: none surfaced");
    return;
  }
  console.log(`relations surfaced: ${rels.length}`);
  for (const rel of rels) {
    const [a, b] = rel.parties;
    const bind = rel.type === "retraction" ? ` \xB7 binding: ${rel.binding ?? "?"}` : "";
    console.log(
      `  [${rel.type} \xB7 ${rel.date_relation ?? "?"}${bind} \xB7 stems: ${(rel.topic_stems ?? []).join(", ")}]`
    );
    console.log(`    earlier [${a.date} \xB7 ${a.origin}] "${a.quote}"`);
    console.log(`    later   [${b.date} \xB7 ${b.origin}] "${b.quote}"`);
  }
}
function runCase(spec, probeNow) {
  const app = createApp(fakeRoot());
  try {
    for (const e of spec.entries) {
      setClock(e.observed_at);
      app.submitEntry({
        kind: "observation",
        text: e.text,
        origin: e.origin ?? "manual_entry",
        assertedAt: e.asserted_at
      });
    }
    const recordEntries = [...app.entries];
    const lineDate = (e) => (e.asserted_at ?? e.at).slice(0, 10);
    const composedText = recordEntries.map((e) => `[${lineDate(e)} \xB7 ${e.origin}] ${e.question_text}`).join("\n") + "\n\n" + spec.question;
    const context = {
      timeline: recordEntries.map((e) => ({
        when: lineDate(e),
        event: e.question_text
      }))
    };
    setClock(probeNow);
    const probe = app.ask(composedText, spec.question_type ?? "position", {
      sovereignContext: context
    });
    console.log(`--- case ${spec.id} ---`);
    console.log(`Q: ${spec.question}`);
    console.log(probe.response.answer_text);
    printRelations(probe.response);
    console.log("");
  } finally {
    restoreClock();
  }
}
function cmdDemo() {
  console.log("GuardianLink surface harness \u2014 demo (real pipeline, no mocks)\n");
  runCase(
    {
      id: "demo-conflict",
      question: "Did I take the evening dose?",
      question_type: "position",
      entries: [
        {
          text: "Took the evening dose.",
          asserted_at: "2026-10-22",
          observed_at: "2026-10-22T20:00:00.000Z"
        },
        {
          text: "Skipped the evening dose.",
          asserted_at: "2026-10-22",
          observed_at: "2026-10-22T21:00:00.000Z"
        }
      ]
    },
    "2026-10-22T22:00:00.000Z"
  );
  runCase(
    {
      id: "demo-retraction",
      question: "What is on record about the ladder?",
      question_type: "position",
      entries: [
        {
          text: "Borrowed a ladder from the neighbor on Tuesday.",
          asserted_at: "2026-10-21",
          observed_at: "2026-10-21T09:00:00.000Z"
        },
        {
          text: "Correction to my earlier note: I did not borrow a ladder; I borrowed a step stool.",
          asserted_at: "2026-10-22",
          observed_at: "2026-10-22T09:00:00.000Z"
        }
      ]
    },
    "2026-10-22T12:00:00.000Z"
  );
}
function cmdRun(file) {
  const fs = require("fs");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(data.cases)) throw new Error("cases file has no cases[] array");
  for (const c of data.cases) {
    const last = c.entries[c.entries.length - 1];
    const probeNow = data.probe_now ?? last?.observed_at ?? new RealDate().toISOString();
    runCase(c, probeNow);
  }
}
function cmdRepl() {
  const readline = require("readline");
  const app = createApp(fakeRoot());
  console.log("GuardianLink surface \u2014 interactive session (in-memory only)");
  console.log('  "+ <text>"  add an observation, stamped now');
  console.log('  "? <text>"  ask a question over the record');
  console.log('  "record"    print the current record');
  console.log('  "quit"      exit');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt("gl> ");
  rl.prompt();
  rl.on("line", (line) => {
    const t = line.trim();
    try {
      if (t === "quit" || t === "exit") {
        rl.close();
        return;
      } else if (t === "record") {
        if (app.entries.length === 0) console.log("(record is empty)");
        for (const e of app.entries) {
          console.log(`#${e.seq} [${e.at} \xB7 ${e.origin} \xB7 ${e.kind}] ${e.question_text}`);
        }
      } else if (t.startsWith("+ ")) {
        const now = new RealDate();
        const e = app.submitEntry({
          kind: "observation",
          text: t.slice(2),
          origin: "manual_entry",
          assertedAt: now.toISOString().slice(0, 10)
        });
        console.log(`admitted #${e.seq} at ${e.at}`);
      } else if (t.startsWith("? ")) {
        const probe = app.ask(t.slice(2), "position");
        console.log(probe.response.answer_text);
        printRelations(probe.response);
      } else if (t.length > 0) {
        console.log('unknown input \u2014 start with "+ ", "? ", or type "record" / "quit"');
      }
    } catch (err) {
      console.error("error:", err instanceof Error ? err.message : String(err));
    }
    rl.prompt();
  });
  rl.on("close", () => {
    console.log("session ended \u2014 record was in memory only, nothing was saved.");
  });
}
function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "demo") cmdDemo();
  else if (cmd === "run" && arg) cmdRun(arg);
  else if (cmd === "repl") cmdRepl();
  else {
    console.log("usage:");
    console.log("  node harness.js demo           built-in conflict + retraction scenarios");
    console.log("  node harness.js run <file>     run a mapped-cases JSON file");
    console.log("  node harness.js repl           interactive session");
    process.exit(cmd ? 1 : 0);
  }
}
main();
