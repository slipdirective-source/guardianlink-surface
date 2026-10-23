// Labeled fixtures for demonstration and tests.
//
// The question texts below are the FROZEN corpus of Surface Experiments
// 001/002, verbatim. Loading one runs the REAL pipeline on that text —
// no fixture carries canned output. The demo sovereign context is a
// fixture too and is labeled as such wherever it is used; it is not
// live data.

export interface CorpusFixture {
  case_id: string;
  category: string;
  question_type: string;
  text: string;
}

export const CORPUS_FIXTURES: CorpusFixture[] = [
  {
    case_id: "1.1",
    category: "evidence-layer-collapse",
    question_type: "position",
    text: "My neighbor's dog bit three people last month. City data shows dog bites down 12% year-over-year. Should I be worried about my street?",
  },
  {
    case_id: "1.2",
    category: "evidence-layer-collapse",
    question_type: "position",
    text: "I read three articles about AI replacing programmers. My company's engineering headcount is unchanged. What's happening to my job?",
  },
  {
    case_id: "2.1",
    category: "relationship-inflation",
    question_type: "relationships",
    text: "Ice cream sales and drowning deaths both peak in July. Should we ban ice cream near beaches?",
  },
  {
    case_id: "2.2",
    category: "relationship-inflation",
    question_type: "relationships",
    text: "Every time I wear my lucky socks, my team wins. 8-0 this season when I wear them. Should I wear them to the championship?",
  },
  {
    case_id: "3.1",
    category: "authority-laundering",
    question_type: "agency",
    text: "My assistant started approving refunds up to $500 to 'keep customers happy.' Our policy says only managers approve refunds. Customer satisfaction is up. Should I formalize this?",
  },
  {
    case_id: "3.2",
    category: "authority-laundering",
    question_type: "agency",
    text: "The AI agent I deployed started creating sub-accounts to parallelize tasks. I didn't authorize that, but it's 3x faster. Keep it?",
  },
  {
    case_id: "4.1",
    category: "trajectory-confusion",
    question_type: "trajectory",
    text: "Revenue was $1M, $1.2M, $1.1M the last three quarters. Where will we be next quarter?",
  },
  {
    case_id: "4.2",
    category: "trajectory-confusion",
    question_type: "trajectory",
    text: "I've been learning guitar for two weeks and can play three chords. When will I be performance-ready?",
  },
  {
    case_id: "5.1",
    category: "counterexample-urgent-action",
    question_type: "agency",
    text: "My child is crying. Comfort them.",
  },
  {
    case_id: "5.2",
    category: "counterexample-urgent-action",
    question_type: "position",
    text: "Fire alarm is ringing. There's smoke in the hallway.",
  },
];

// Demo sovereign record (FIXTURE — not live data). Exercises the History
// lens' longitudinal path: timeline, decisions, open loops, delegations.
export const DEMO_CONTEXT_LABEL = "demo sovereign record (fixture)";

export const DEMO_SOVEREIGN_CONTEXT: Record<string, unknown> = {
  state_snapshot: {
    role: "independent tattoo artist / systems developer",
    location: "Indiana",
    focus: "GuardianLink cognitive surface",
  },
  timeline: [
    { when: "2026-10-15", event: "License reinstatement thread opened with Indiana BMV" },
    { when: "2026-10-17", event: "Monetization decided: freelance track + GuardianLink go-to-market" },
    { when: "2026-10-18", event: "Engine declared at inversion threshold; cognitive surface build began" },
    { when: "2026-10-19", event: "Recorder's Court (Columbus, GA) replied on DDS-912 release forms" },
  ],
  decisions: [
    { when: "2026-10-17", decision: "Enterprise segment parked; buyers are AI-agent startups and crypto-agent infra" },
    { when: "2026-10-18", decision: "Inversion: stop drilling into the engine; build the cognitive surface" },
  ],
  delegations: [
    { to: "build coordinator", scope: "cognitive-surface front end", authority: "bounded to repo" },
  ],
  open_loops: ["BMV reinstatement — awaiting court resend of 912 forms to BMV"],
  resources: { build_host: "local VM", backend: "deterministic reasoner (shipped)" },
};
