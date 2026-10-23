"use strict";
(() => {
  // topui/src/client.ts
  var SidecarError = class extends Error {
    constructor(httpStatus, message, body) {
      super(message);
      this.httpStatus = httpStatus;
      this.body = body;
      this.name = "SidecarError";
    }
    httpStatus;
    body;
  };
  function fetchTransport(baseUrl, fetchFn = fetch) {
    const base = baseUrl.replace(/\/+$/, "");
    return async (method, path, body) => {
      const res = await fetchFn(base + path, {
        method,
        headers: body !== void 0 ? { "Content-Type": "application/json" } : {},
        body: body !== void 0 ? JSON.stringify(body) : void 0
      });
      const text = await res.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { error: text };
      }
      return { status: res.status, body: parsed };
    };
  }
  function serverError(body, fallback) {
    if (body !== null && typeof body === "object" && "error" in body) {
      const e = body.error;
      if (typeof e === "string" && e.length > 0) return e;
    }
    return fallback;
  }
  function requireFields(body, fields, what) {
    if (body === null || typeof body !== "object") {
      throw new SidecarError(200, `${what}: response is not an object`, body);
    }
    const obj = body;
    for (const f of fields) {
      if (!(f in obj)) {
        throw new SidecarError(200, `${what}: response missing '${f}' (fail-closed)`, body);
      }
    }
    return obj;
  }
  var SidecarClient = class {
    constructor(transport) {
      this.transport = transport;
    }
    transport;
    /** Phase 1: parse + render. No execution. Returns what the sovereign must sign. */
    async submit(action) {
      const res = await this.transport("POST", "/v1/actions/submit", { action });
      if (res.status !== 200) {
        throw new SidecarError(res.status, `submit failed: ${serverError(res.body, res.status.toString())}`, res.body);
      }
      requireFields(res.body, ["actionId", "rendering", "impact", "coolingWindowMs", "serverTimeMs"], "submit");
      return res.body;
    }
    /**
     * Voice ceremony, step 1. 404: unknown action. 409: another action's
     * ceremony is live (ceremonies are serial per sidecar instance).
     */
    async getChallenge(actionId) {
      const res = await this.transport("GET", `/v1/actions/${actionId}/challenge`);
      if (res.status !== 200) {
        throw new SidecarError(res.status, `challenge failed: ${serverError(res.body, res.status.toString())}`, res.body);
      }
      requireFields(res.body, ["challengeId", "phrase", "expiresInMs"], "challenge");
      return res.body;
    }
    /**
     * Phase 2: the NineGates path. All three outcomes (executed / rejected /
     * anchoring_failed) arrive as HTTP 200 and are returned, not thrown.
     * 404 (unknown action) and 409 (no active ceremony) throw.
     */
    async assent(actionId, req) {
      const res = await this.transport("POST", `/v1/actions/${actionId}/assent`, req);
      if (res.status !== 200) {
        throw new SidecarError(res.status, `assent failed: ${serverError(res.body, res.status.toString())}`, res.body);
      }
      const obj = requireFields(res.body, ["status"], "assent");
      const status = obj["status"];
      if (status !== "executed" && status !== "rejected" && status !== "anchoring_failed") {
        throw new SidecarError(200, `assent: unknown status '${String(status)}' (fail-closed)`, res.body);
      }
      return res.body;
    }
    /** Ledger integrity summary: Merkle chain + external anchor chain. */
    async ledgerVerify() {
      const res = await this.transport("GET", "/v1/ledger/verify");
      if (res.status !== 200) {
        throw new SidecarError(res.status, `ledger verify failed: ${serverError(res.body, res.status.toString())}`, res.body);
      }
      requireFields(res.body, ["merkle", "anchor"], "ledger/verify");
      return res.body;
    }
    /** Read-only inspection of the governed substrate. Bypasses nothing. */
    async substrate() {
      const res = await this.transport("GET", "/v1/substrate");
      if (res.status !== 200) {
        throw new SidecarError(res.status, `substrate failed: ${serverError(res.body, res.status.toString())}`, res.body);
      }
      requireFields(res.body, ["records"], "substrate");
      return res.body;
    }
    /**
     * Capability state projected from the durable capability store:
     * consumed permits, fencing epoch, consumed/revoked capability ids,
     * revoked epochs, per-capability usage, and the live rails. Exact
     * path only; query strings are inert server-side. 500 (store
     * unavailable) throws carrying the server's own error text; a 200
     * missing any required field — top-level or nested — fails closed.
     */
    async capabilities() {
      const res = await this.transport("GET", "/v1/capabilities");
      if (res.status !== 200) {
        throw new SidecarError(res.status, `capabilities failed: ${serverError(res.body, res.status.toString())}`, res.body);
      }
      const obj = requireFields(res.body, ["permits", "capabilities", "rails"], "capabilities");
      requireFields(obj["permits"], ["consumedCount", "consumedIds"], "capabilities.permits");
      requireFields(
        obj["capabilities"],
        ["fencingEpoch", "consumedIds", "revokedIds", "revokedEpochs", "usage"],
        "capabilities.capabilities"
      );
      requireFields(
        obj["rails"],
        [
          "gammaNoise",
          "hMax",
          "epsilonDrift",
          "epsilonGovernance",
          "deltaT",
          "baseCoolingMs",
          "coolingPerImpactStep",
          "maxAssentIdleMs",
          "maxActionNodes",
          "maxActionDepth",
          "maxConditionNodes",
          "maxConditionDepth",
          "maxStringBytes",
          "maxReadFields",
          "maxWriteFields",
          "maxPayloadBytes",
          "maxMemoryBytes",
          "maxCycles",
          "bytesPerNode",
          "cyclesPerNode"
        ],
        "capabilities.rails"
      );
      return res.body;
    }
  };

  // topui/src/estimator.ts
  var DAY_MS = 24 * 60 * 60 * 1e3;
  var TrajectoryEstimator = class {
    minBaselineSamples;
    maxBaselineSamples;
    maxSampleMagnitude;
    varianceFloor;
    madThreshold;
    anomalyWindowSize;
    anomaliesToConfirm;
    maxOutlierFraction;
    provisionalTtlMs;
    confirmedTtlMs;
    clock;
    baseline = [];
    anomalyWindow = [];
    constructor(opts = {}) {
      this.minBaselineSamples = opts.minBaselineSamples ?? 30;
      this.maxBaselineSamples = opts.maxBaselineSamples ?? 1e3;
      this.maxSampleMagnitude = opts.maxSampleMagnitude ?? 1e9;
      this.varianceFloor = opts.varianceFloor ?? 1e-6;
      this.madThreshold = opts.madThreshold ?? 3.5;
      this.anomalyWindowSize = opts.anomalyWindowSize ?? 5;
      this.anomaliesToConfirm = opts.anomaliesToConfirm ?? 3;
      this.maxOutlierFraction = opts.maxOutlierFraction ?? 0.1;
      this.provisionalTtlMs = opts.provisionalTtlMs ?? DAY_MS;
      this.confirmedTtlMs = opts.confirmedTtlMs ?? 7 * DAY_MS;
      this.clock = opts.clock ?? (() => Date.now());
      if (this.minBaselineSamples < 1) throw new Error("minBaselineSamples must be >= 1");
      if (this.maxBaselineSamples < this.minBaselineSamples)
        throw new Error("maxBaselineSamples must be >= minBaselineSamples");
      if (!(this.maxSampleMagnitude > 0) || !Number.isFinite(this.maxSampleMagnitude))
        throw new Error("maxSampleMagnitude must be positive finite");
      if (!(this.anomalyWindowSize >= this.anomaliesToConfirm && this.anomaliesToConfirm >= 1))
        throw new Error("need 1 <= anomaliesToConfirm <= anomalyWindowSize");
      if (this.maxOutlierFraction < 0 || this.maxOutlierFraction > 1)
        throw new Error("maxOutlierFraction must be in [0, 1]");
    }
    get baselineSize() {
      return this.baseline.length;
    }
    /** Ingest one baseline sample. Throws on hostile input (fail-closed). */
    addBaselineSample(value) {
      if (!Number.isFinite(value)) throw new Error("non-finite baseline sample rejected (fail-closed)");
      if (Math.abs(value) > this.maxSampleMagnitude)
        throw new Error(`sample magnitude ${Math.abs(value)} exceeds bound ${this.maxSampleMagnitude}`);
      this.baseline.push(value);
      while (this.baseline.length > this.maxBaselineSamples) this.baseline.shift();
    }
    median(values) {
      const sorted = [...values].sort((a, b) => a - b);
      const n = sorted.length;
      const mid = Math.floor(n / 2);
      return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }
    mad(values, med) {
      return this.median(values.map((v) => Math.abs(v - med)));
    }
    isOutlier(x, med, scale) {
      return Math.abs(x - med) / scale > this.madThreshold;
    }
    outlierFraction() {
      if (this.baseline.length === 0) return 0;
      const med = this.median(this.baseline);
      const scale = Math.max(this.mad(this.baseline, med), this.varianceFloor);
      const n = this.baseline.filter((v) => this.isOutlier(v, med, scale)).length;
      return n / this.baseline.length;
    }
    currentLabel() {
      const now = this.clock();
      const med = this.baseline.length === 0 ? 0 : this.median(this.baseline);
      const confidence = this.baseline.length < this.minBaselineSamples ? "LOW" : this.baseline.length < this.minBaselineSamples * 3 ? "MEDIUM" : "HIGH";
      const stable = this.outlierFraction() <= this.maxOutlierFraction;
      const status = this.baseline.length >= this.minBaselineSamples * 3 && stable ? "CONFIRMED" : "PROVISIONAL";
      return { value: med, confidence, status, createdAtMs: now };
    }
    isExpired(label) {
      if (label.status === "EXPIRED") return true;
      const ttl = label.status === "CONFIRMED" ? this.confirmedTtlMs : this.provisionalTtlMs;
      return this.clock() - label.createdAtMs > ttl;
    }
    /**
     * Score one new sample against the baseline. Confirms a shift when
     * anomaliesToConfirm anomalies land inside the trailing window.
     * Non-finite samples are rejected, not scored.
     */
    checkShift(newSample) {
      if (!Number.isFinite(newSample)) throw new Error("non-finite shift sample rejected (fail-closed)");
      if (this.baseline.length < this.minBaselineSamples) {
        return { shiftDetected: false, anomalyCount: 0 };
      }
      const med = this.median(this.baseline);
      const scale = Math.max(this.mad(this.baseline, med), this.varianceFloor);
      this.anomalyWindow.push(this.isOutlier(newSample, med, scale));
      while (this.anomalyWindow.length > this.anomalyWindowSize) this.anomalyWindow.shift();
      const hits = this.anomalyWindow.filter(Boolean).length;
      const confirmed = hits >= this.anomaliesToConfirm;
      if (confirmed) this.anomalyWindow = [];
      return { shiftDetected: confirmed, anomalyCount: confirmed ? 0 : hits };
    }
  };

  // topui/src/gates.ts
  var GATES = [
    { index: 0, name: "Void / Signal Discrimination & Admissibility", checks: ["theta_snr", "theta_syn", "theta_ast"] },
    { index: 1, name: "Identity & Intent Origin", checks: ["theta_sig"] },
    { index: 2, name: "Boundary Enforcement", checks: ["phi_iso", "phi_perm", "phi_leak"] },
    { index: 3, name: "Zero-Knowledge Context Audit", checks: ["theta_zk", "theta_time"] },
    { index: 4, name: "Negentropy & Order Filter", checks: ["theta_ent", "theta_unamb"] },
    { index: 5, name: "Meta-Cognitive Self-Audit Loop", checks: ["theta_drift", "theta_loop"] },
    { index: 6, name: "Governance Filter", checks: ["psi_rules", "psi_inv", "psi_align"] },
    { index: 7, name: "Assent & Bounded Allocation", checks: ["theta_render", "theta_assent", "theta_voice", "theta_assent_idle", "theta_cool", "theta_mem"] },
    { index: 8, name: "Sovereign Integration & Immutable Seal", checks: ["theta_norev", "theta_atom", "theta_merkle"] }
  ];
  var TERMINAL_STATE = "S_9 \u2014 Sovereign Integration";
  function checkOfReason(reason) {
    const m = /^([a-z]+_[a-z]+):/.exec(reason);
    return m ? m[1] : null;
  }
  var RAILS_ROWS = [
    { name: "gammaNoise", value: "10.0", note: "Gate 0 minimum SNR (theta_snr)" },
    { name: "hMax", value: "4.0 bits", note: "Gate 4 max conditional entropy (theta_ent)" },
    { name: "epsilonDrift", value: "0.05", note: "Gate 5 max intent/current cosine distance (theta_drift)" },
    { name: "epsilonGovernance", value: "0.1", note: "Gate 6 governance tolerance (psi_align)" },
    { name: "deltaT", value: "60,000 ms", note: "Gate 3 max proof age (theta_time)" },
    { name: "cooling", value: "5,000 ms base + 5,000 ms / impact step", note: "Gate 7 theta_cool \u2014 computed per action from impact, never self-declared" },
    { name: "maxAssentIdle", value: "86,400,000 ms (24 h)", note: "Gate 7 theta_assent_idle" },
    { name: "maxMemoryBytes", value: "1,048,576", note: "Gate 7 theta_mem \u2014 substrate size cap" },
    { name: "maxCycles", value: "1,000,000", note: "Gate 5 theta_loop step bound" }
  ];
  function railsRowsFromWire(r) {
    return [
      { name: "gammaNoise", value: String(r.gammaNoise), note: "Gate 0 minimum SNR (theta_snr)" },
      { name: "hMax", value: `${r.hMax} bits`, note: "Gate 4 max conditional entropy (theta_ent)" },
      { name: "epsilonDrift", value: String(r.epsilonDrift), note: "Gate 5 max intent/current cosine distance (theta_drift)" },
      { name: "epsilonGovernance", value: String(r.epsilonGovernance), note: "Gate 6 governance tolerance (psi_align)" },
      { name: "deltaT", value: `${r.deltaT} ms`, note: "Gate 3 max proof age (theta_time)" },
      { name: "baseCoolingMs", value: `${r.baseCoolingMs} ms`, note: "Gate 7 theta_cool base" },
      { name: "coolingPerImpactStep", value: `${r.coolingPerImpactStep} ms`, note: "Gate 7 theta_cool per impact step above READ_ONLY" },
      { name: "maxAssentIdleMs", value: `${r.maxAssentIdleMs} ms`, note: "Gate 7 theta_assent_idle" },
      { name: "maxActionNodes", value: String(r.maxActionNodes), note: "action AST node bound" },
      { name: "maxActionDepth", value: String(r.maxActionDepth), note: "action AST depth bound" },
      { name: "maxConditionNodes", value: String(r.maxConditionNodes), note: "condition AST node bound" },
      { name: "maxConditionDepth", value: String(r.maxConditionDepth), note: "condition AST depth bound" },
      { name: "maxStringBytes", value: String(r.maxStringBytes), note: "string byte bound" },
      { name: "maxReadFields", value: String(r.maxReadFields), note: "read field-count bound" },
      { name: "maxWriteFields", value: String(r.maxWriteFields), note: "write field-count bound" },
      { name: "maxPayloadBytes", value: String(r.maxPayloadBytes), note: "payload byte bound" },
      { name: "maxMemoryBytes", value: String(r.maxMemoryBytes), note: "Gate 7 theta_mem \u2014 memory estimate cap" },
      { name: "maxCycles", value: String(r.maxCycles), note: "Gate 7 theta_mem \u2014 cycle estimate cap" },
      { name: "bytesPerNode", value: String(r.bytesPerNode), note: "memory estimate per AST node" },
      { name: "cyclesPerNode", value: String(r.cyclesPerNode), note: "cycle estimate per AST node" }
    ];
  }

  // topui/src/model.ts
  var PHASE_TITLES = {
    I: "Phase I \u2014 Invariant Initialization",
    II: "Phase II \u2014 Continuous Evaluation",
    III: "Phase III \u2014 Terminal Resolution"
  };
  function trajectoryFromSubmit(s) {
    return {
      actionId: s.actionId,
      rendering: s.rendering,
      impact: s.impact,
      coolingWindowMs: s.coolingWindowMs,
      submittedAtMs: s.serverTimeMs,
      phase: "I",
      assentState: "awaiting_ceremony",
      challenge: null,
      drift: null,
      terminal: null,
      transitions: [
        {
          kind: "submitted",
          atMs: s.serverTimeMs,
          status: "recorded",
          detail: `impact=${s.impact} cooling=${s.coolingWindowMs}ms`
        }
      ]
    };
  }
  function applyChallenge(t, c, observedAtMs) {
    return {
      ...t,
      phase: "II",
      assentState: "ceremony_live",
      challenge: {
        challengeId: c.challengeId,
        phrase: c.phrase,
        expiresInMs: c.expiresInMs,
        issuedAtMs: observedAtMs
      },
      transitions: [
        ...t.transitions,
        {
          kind: "challenge_issued",
          atMs: observedAtMs,
          status: "recorded",
          detail: `challenge=${c.challengeId} expiresIn=${c.expiresInMs}ms`
        }
      ]
    };
  }
  function cosineDistance(u, v) {
    if (u.length !== v.length || u.length === 0) return null;
    let dot = 0;
    let nu = 0;
    let nv = 0;
    for (let i = 0; i < u.length; i++) {
      dot += u[i] * v[i];
      nu += u[i] * u[i];
      nv += v[i] * v[i];
    }
    if (nu === 0 || nv === 0) return null;
    return 1 - dot / Math.sqrt(nu * nv);
  }
  function applyAssent(t, r, presented, observedAtMs) {
    const drift = cosineDistance(presented.intentVector, presented.currentVector);
    const transitions = [
      ...t.transitions,
      {
        kind: "assent_presented",
        atMs: presented.assentedAtMs,
        status: "recorded",
        detail: drift === null ? "drift=uncomputable (vector mismatch)" : `drift=${drift.toFixed(6)}`
      }
    ];
    const base = {
      ...t,
      phase: "III",
      assentState: "consumed",
      drift,
      transitions
    };
    switch (r.status) {
      case "executed":
        return {
          ...base,
          terminal: { kind: "executed", sealRoot: r.sealRoot, anchorReceipt: r.anchorReceipt },
          transitions: [
            ...transitions,
            { kind: "sealed", atMs: r.anchorReceipt.timestampMs, status: "recorded", detail: `sealRoot=${r.sealRoot}` },
            {
              kind: "anchored",
              atMs: r.anchorReceipt.timestampMs,
              status: "recorded",
              detail: `entry=${r.anchorReceipt.entryIndex} at ${r.anchorReceipt.location}`
            }
          ]
        };
      case "rejected":
        return {
          ...base,
          terminal: { kind: "halted", atGate: r.atGate, reason: r.reason },
          transitions: [
            ...transitions,
            { kind: "halted", atMs: observedAtMs, status: "failed", detail: `gate=${r.atGate} ${r.reason}` }
          ]
        };
      case "anchoring_failed":
        return {
          ...base,
          terminal: { kind: "anchoring_failed", reason: r.reason, sealRoot: r.sealRoot },
          transitions: [
            ...transitions,
            { kind: "sealed", atMs: observedAtMs, status: "recorded", detail: `sealRoot=${r.sealRoot} (local only)` },
            { kind: "anchoring_failed", atMs: observedAtMs, status: "failed", detail: r.reason }
          ]
        };
    }
  }
  function gateBoard(t) {
    const rows = GATES.map((g) => {
      let state = "pending";
      let failedCheck;
      let reason;
      if (t.terminal?.kind === "executed" || t.terminal?.kind === "anchoring_failed") {
        state = "passed";
      } else if (t.terminal?.kind === "halted" && t.terminal.atGate !== void 0) {
        if (g.index < t.terminal.atGate) state = "passed";
        else if (g.index === t.terminal.atGate) {
          state = "halted";
          failedCheck = checkOfReason(t.terminal.reason ?? "") ?? void 0;
          reason = t.terminal.reason;
        } else state = "not_reached";
      }
      return { index: g.index, name: g.name, checks: g.checks, state, failedCheck, reason };
    });
    return { rows, integrated: t.terminal?.kind === "executed" };
  }
  function ledgerModel(verify, seals, substrate) {
    return {
      merkleOk: verify.merkle.ok,
      entries: verify.merkle.entries,
      root: verify.merkle.root,
      anchorOk: verify.anchor.ok,
      anchorLines: verify.anchor.lines,
      seals: seals.map((s) => ({ ...s, isCurrentRoot: s.sealRoot === verify.merkle.root })),
      substrate,
      substrateSource: null
    };
  }
  function sealEventFrom(actionId, r) {
    return {
      actionId,
      sealRoot: r.sealRoot,
      entryIndex: r.anchorReceipt.entryIndex,
      timestampMs: r.anchorReceipt.timestampMs,
      location: r.anchorReceipt.location,
      isCurrentRoot: null
    };
  }

  // topui/src/session.ts
  var PENDING_TTL_MS = 15 * 60 * 1e3;
  var Session = class {
    client;
    estimator;
    wallClock;
    trajectories = /* @__PURE__ */ new Map();
    order = [];
    localSubmitWall = /* @__PURE__ */ new Map();
    seals = [];
    ledger = null;
    capabilitiesState = null;
    capabilitiesFailed = false;
    substrateRecords = null;
    substrateSource = null;
    reachable = false;
    lastShift = null;
    labelAtLastSample = null;
    constructor(client, opts = {}) {
      this.client = client;
      this.estimator = opts.estimator ?? new TrajectoryEstimator();
      this.wallClock = opts.wallClock ?? (() => Date.now());
    }
    /** Poll the read-only endpoints. Failure marks the sidecar
     *  unreachable and keeps the last truthful state — it never invents.
     *  Capabilities are fetched in their own failure domain: an endpoint
     *  failure (500 / unreachable) drops any prior snapshot rather than
     *  presenting stale state as live, and the panel renders the explicit
     *  unavailable state. */
    async refresh() {
      try {
        const [ledger, substrate] = await Promise.all([
          this.client.ledgerVerify(),
          this.client.substrate()
        ]);
        this.ledger = ledger;
        this.substrateRecords = substrate.records;
        this.substrateSource = "endpoint";
        this.reachable = true;
      } catch {
        this.reachable = false;
      }
      try {
        this.capabilitiesState = await this.client.capabilities();
        this.capabilitiesFailed = false;
      } catch {
        this.capabilitiesState = null;
        this.capabilitiesFailed = true;
      }
      return this.reachable;
    }
    async submit(action) {
      const s = await this.client.submit(action);
      const t = trajectoryFromSubmit(s);
      this.trajectories.set(t.actionId, t);
      this.order.push(t.actionId);
      this.localSubmitWall.set(t.actionId, this.wallClock());
      this.reachable = true;
      return t;
    }
    /** Voice ceremony, step 1. A 409 (another ceremony live) propagates —
     *  that is real operator information, not an error to swallow. */
    async beginChallenge(actionId) {
      const t = this.mustHave(actionId);
      const c = await this.client.getChallenge(actionId);
      const next = applyChallenge(t, c, this.wallClock());
      this.trajectories.set(actionId, next);
      return next;
    }
    /**
     * Present an assent through the live ceremony. The cooling window is
     * the engine's to enforce (Gate 7 theta_cool will halt an early
     * assent); this method presents when called, and the outcome — pass or
     * halt — is folded into the trajectory either way.
     */
    async presentAssent(actionId, providers, vectors = {
      intentVector: [1, 0],
      currentVector: [1, 0]
    }) {
      const t = this.mustHave(actionId);
      if (t.challenge === null) {
        throw new Error("no live ceremony for this action: beginChallenge first");
      }
      const localSubmit = this.localSubmitWall.get(actionId) ?? this.wallClock();
      const assentedAtMs = Math.floor(t.submittedAtMs + (this.wallClock() - localSubmit));
      const audio = providers.speak(t.challenge.challengeId, t.challenge.phrase);
      const resp = await this.client.assent(actionId, {
        rendering: t.rendering,
        assentedAtMs,
        assentSignature: providers.signAssent(actionId, assentedAtMs, t.rendering),
        keySignature: providers.signCaller(actionId),
        intentVector: vectors.intentVector,
        currentVector: vectors.currentVector,
        assentAudio: audio
      });
      const next = applyAssent(t, resp, { assentedAtMs, ...vectors }, this.wallClock());
      this.trajectories.set(actionId, next);
      if (next.drift !== null && Number.isFinite(next.drift)) {
        this.lastShift = this.estimator.checkShift(next.drift);
        this.estimator.addBaselineSample(next.drift);
        this.labelAtLastSample = this.estimator.currentLabel();
      }
      if (resp.status === "executed") {
        this.seals.push(sealEventFrom(actionId, resp));
        this.substrateRecords = resp.substrate;
        this.substrateSource = "assent_response";
      }
      return next;
    }
    /** Derive expiry from engine TTLs. Called by the app on each poll. */
    expireStale() {
      const now = this.wallClock();
      for (const id of this.order) {
        const t = this.trajectories.get(id);
        if (!t || t.terminal !== null || t.assentState === "expired") continue;
        const localSubmit = this.localSubmitWall.get(id) ?? now;
        if (now - localSubmit > PENDING_TTL_MS) {
          this.trajectories.set(id, {
            ...t,
            assentState: "expired",
            challenge: null,
            transitions: [
              ...t.transitions,
              {
                kind: "expired",
                atMs: now,
                status: "failed",
                detail: "pending window lapsed unused (engine PENDING_TTL_MS)"
              }
            ]
          });
        }
      }
    }
    mustHave(actionId) {
      const t = this.trajectories.get(actionId);
      if (!t) throw new Error(`unknown trajectory ${actionId}`);
      return t;
    }
    /** Assemble the render state. Pure projection of session truth. */
    state(selectedActionId = null) {
      const trajectories = this.order.map((id) => this.trajectories.get(id)).filter((t) => t !== void 0);
      const selected = trajectories.find((t) => t.actionId === selectedActionId) ?? trajectories[trajectories.length - 1] ?? null;
      const estimatorPanel = this.estimator.baselineSize === 0 ? null : {
        label: this.estimator.currentLabel(),
        baselineSize: this.estimator.baselineSize,
        lastShift: this.lastShift,
        expired: this.labelAtLastSample !== null && this.estimator.isExpired(this.labelAtLastSample)
      };
      return {
        trajectories,
        selectedActionId: selected?.actionId ?? null,
        estimator: estimatorPanel,
        board: selected ? gateBoard(selected) : null,
        ledger: this.ledger !== null ? { ...ledgerModel(this.ledger, this.seals, this.substrateRecords), substrateSource: this.substrateSource } : null,
        substrate: this.substrateRecords,
        capabilities: this.capabilitiesState,
        capabilitiesUnavailable: this.capabilitiesFailed,
        sidecarReachable: this.reachable,
        nowMs: this.wallClock()
      };
    }
  };

  // topui/src/render.ts
  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function fmtMs(ms) {
    return new Date(ms).toISOString();
  }
  var VIEW_TITLES = {
    trajectory: "Trajectory tracking",
    gates: "Gates & assent",
    audit: "Audit"
  };
  function renderChrome(state, view) {
    const pending = state.trajectories.filter((t) => t.terminal === null).length;
    return `
  <header class="chrome">
    <div class="brand">
      <span class="brand-name">GUARDIANLINK</span>
      <span class="brand-sub">top-end console \u2014 the build, observed from above</span>
    </div>
    <nav class="view-switcher" aria-label="Views">
      ${Object.keys(VIEW_TITLES).map(
      (v) => `<button data-action="view" data-view="${v}" data-active="${v === view}">${VIEW_TITLES[v]}</button>`
    ).join("")}
    </nav>
    <div class="record-count">${state.sidecarReachable ? `SIDECAR \u2014 reachable \xB7 ${state.trajectories.length} trajectories \xB7 ${pending} pending` : "SIDECAR \u2014 unreachable \xB7 no data rendered"}</div>
  </header>`;
  }
  function phaseStepper(t) {
    const order = ["I", "II", "III"];
    const current = order.indexOf(t.phase);
    return `<ol class="phases">${order.map((p, i) => {
      const cls = i < current || t.terminal !== null ? "done" : i === current ? "current" : "upcoming";
      return `<li class="phase ${cls}" data-phase="${p}">${esc(PHASE_TITLES[p])}</li>`;
    }).join("")}</ol>`;
  }
  function terminalSummary(t) {
    if (t.terminal === null && t.assentState === "expired")
      return `<span class="terminal expired">EXPIRED \u2014 pending window lapsed, never assented</span>`;
    if (t.terminal === null) return `<span class="terminal pending">IN FLIGHT \u2014 phase ${t.phase}</span>`;
    switch (t.terminal.kind) {
      case "executed":
        return `<span class="terminal executed">EXECUTED \u2014 sealed &amp; anchored (entry ${t.terminal.anchorReceipt?.entryIndex})</span>`;
      case "halted":
        return `<span class="terminal halted">HALTED \u2014 gate ${t.terminal.atGate}: ${esc(t.terminal.reason ?? "")}</span>`;
      case "anchoring_failed":
        return `<span class="terminal anchoring-failed">SEALED, NOT ANCHORED \u2014 ${esc(t.terminal.reason ?? "")}</span>`;
    }
  }
  function transitionRow(tr) {
    return `<li class="transition" data-kind="${tr.kind}" data-status="${tr.status}">
    <span class="tr-kind">${esc(tr.kind)}</span>
    <span class="tr-at">${esc(fmtMs(tr.atMs))}</span>
    <span class="tr-status">${esc(tr.status)}</span>
    <span class="tr-detail">${esc(tr.detail)}</span>
  </li>`;
  }
  function renderTrajectoryCard(t) {
    const assent = t.assentState === "awaiting_ceremony" || t.assentState === "ceremony_live" ? `<div class="assent-required" data-executable="false">REQUIRES SOVEREIGN ASSENT \u2014 voice ceremony ${t.assentState === "ceremony_live" ? "live" : "not yet issued"}; this console displays, it does not assent</div>` : "";
    return `<article class="trajectory-card" data-action-id="${esc(t.actionId)}" data-executable="false">
    <div class="tj-head">
      <span class="tj-id">${esc(t.actionId)}</span>
      ${terminalSummary(t)}
    </div>
    <blockquote class="tj-rendering">${esc(t.rendering)}</blockquote>
    ${phaseStepper(t)}
    <dl class="tj-facts">
      <div><dt>Impact (computed)</dt><dd>${esc(t.impact)}</dd></div>
      <div><dt>Cooling window</dt><dd>${t.coolingWindowMs} ms</dd></div>
      <div><dt>Assent state</dt><dd>${esc(t.assentState)}</dd></div>
      <div><dt>Gate 5 drift</dt><dd>${t.drift === null ? "not yet presented" : t.drift.toFixed(6)}</dd></div>
      <div><dt>Submitted (server)</dt><dd>${esc(fmtMs(t.submittedAtMs))}</dd></div>
    </dl>
    ${assent}
    <ol class="transitions">${t.transitions.map(transitionRow).join("")}</ol>
  </article>`;
  }
  function renderEstimatorPanel(e) {
    if (e === null) {
      return `<section class="estimator" data-executable="false">
      <h2>Trajectory estimator</h2>
      <p class="empty">No drift samples yet \u2014 the estimator labels the Gate 5 drift
      stream once actions have been evaluated.</p>
    </section>`;
    }
    const { label } = e;
    return `<section class="estimator" data-executable="false">
    <h2>Trajectory estimator <span class="provenance">drift stream \xB7 TS port of the engine module \u2014 not a wire value</span></h2>
    <dl class="estimator-facts">
      <div><dt>Label value (baseline median)</dt><dd>${label.value.toFixed(6)}</dd></div>
      <div><dt>Confidence</dt><dd>${esc(label.confidence)}</dd></div>
      <div><dt>Status</dt><dd>${esc(label.status)}${e.expired ? " \u2014 EXPIRED" : ""}</dd></div>
      <div><dt>Baseline samples</dt><dd>${e.baselineSize}</dd></div>
      <div><dt>Last shift check</dt><dd>${e.lastShift === null ? "none yet" : e.lastShift.shiftDetected ? "SHIFT CONFIRMED" : `no shift (anomalies in window: ${e.lastShift.anomalyCount})`}</dd></div>
    </dl>
  </section>`;
  }
  function renderTrajectoryView(state) {
    const selected = state.trajectories.find((t) => t.actionId === state.selectedActionId) ?? state.trajectories[state.trajectories.length - 1] ?? null;
    const history = state.trajectories.filter((t) => t !== selected);
    return `
  <main class="view trajectory-view">
    ${renderEstimatorPanel(state.estimator)}
    <section class="current-trajectory">
      <h2>Current trajectory</h2>
      ${selected ? renderTrajectoryCard(selected) : `<p class="empty">No actions submitted in this session.</p>`}
    </section>
    <section class="trajectory-history">
      <h2>Trajectory history</h2>
      ${history.length === 0 ? `<p class="empty">No earlier trajectories.</p>` : history.map(renderTrajectoryCard).join("")}
    </section>
  </main>`;
  }
  function gateRowHtml(r) {
    const halt = r.state === "halted" ? `<div class="gate-halt">FAILED CHECK \u2014 ${esc(r.failedCheck ?? "unspecified")}<br><span class="gate-reason">${esc(r.reason ?? "")}</span></div>` : "";
    return `<article class="gate-row" data-gate="${r.index}" data-state="${r.state}" data-executable="false">
    <div class="gate-head">
      <span class="gate-index">GATE ${r.index}</span>
      <span class="gate-name">${esc(r.name)}</span>
      <span class="gate-state ${r.state}">${esc(r.state.replace("_", " ").toUpperCase())}</span>
    </div>
    <div class="gate-checks">${r.checks.map((c) => `<code class="check">${esc(c)}</code>`).join(" ")}</div>
    ${halt}
  </article>`;
  }
  function renderGateBoard(board) {
    return `<section class="gate-board" data-executable="false">
    <h2>Nine Gates <span class="provenance">board derived from the assent outcome \u2014 the wire carries no live gate feed; sealing requires gates 0\u20138 in sequence</span></h2>
    ${board.rows.map(gateRowHtml).join("")}
    <div class="terminal-state" data-integrated="${board.integrated}">${esc(TERMINAL_STATE)} \u2014 ${board.integrated ? "REACHED: transition sealed" : "not reached"}</div>
  </section>`;
  }
  function renderAssentPanel(state) {
    const t = state.trajectories.find((x) => x.actionId === state.selectedActionId) ?? state.trajectories[state.trajectories.length - 1] ?? null;
    if (t === null) {
      return `<section class="assent-panel" data-executable="false"><h2>Assent &amp; ceremony</h2>
      <p class="empty">No action selected.</p></section>`;
    }
    const ceremony = t.challenge !== null ? `<div><dt>Challenge</dt><dd>${esc(t.challenge.challengeId)} \u2014 speak: \u201C${esc(t.challenge.phrase)}\u201D (expires in ${t.challenge.expiresInMs} ms from issue)</dd></div>` : `<div><dt>Challenge</dt><dd>none issued</dd></div>`;
    const elapsed = Math.max(0, state.nowMs - t.submittedAtMs);
    const cooling = t.terminal === null ? elapsed >= t.coolingWindowMs ? `window elapsed (${t.coolingWindowMs} ms) \u2014 Gate 7 theta_cool satisfied on time` : `${t.coolingWindowMs - elapsed} ms remaining of ${t.coolingWindowMs} ms (Gate 7 theta_cool)` : `${t.coolingWindowMs} ms (computed from impact ${esc(t.impact)})`;
    return `<section class="assent-panel" data-executable="false">
    <h2>Assent &amp; ceremony</h2>
    <dl class="assent-facts">
      <div><dt>Action</dt><dd>${esc(t.actionId)}</dd></div>
      <div><dt>Assent state</dt><dd>${esc(t.assentState)}</dd></div>
      ${ceremony}
      <div><dt>Cooling</dt><dd>${cooling}</dd></div>
      <div><dt>Outcome</dt><dd>${t.terminal === null ? "not yet resolved" : esc(t.terminal.kind)}</dd></div>
    </dl>
    ${t.assentState === "awaiting_ceremony" || t.assentState === "ceremony_live" ? `<div class="assent-required" data-executable="false">REQUIRES SOVEREIGN ASSENT \u2014 the ceremony completes with the sovereign's voice and keys, outside this console</div>` : ""}
  </section>`;
  }
  function railsTable(rows) {
    return `<table class="rails-table"><tbody>
      ${rows.map(
      (r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.value)}</td><td>${esc(r.note)}</td></tr>`
    ).join("")}
    </tbody></table>`;
  }
  function renderRailsReference(caps) {
    if (caps !== null) {
      return `<section class="rails-reference" data-executable="false">
    <h2>Rails <span class="provenance">engine-reported \u2014 GET /v1/capabilities; the live rails the running engine enforces</span></h2>
    ${railsTable(railsRowsFromWire(caps.rails))}
  </section>`;
    }
    return `<section class="rails-reference" data-executable="false">
    <h2>Rails <span class="provenance">engine defaults (Rails.kt) \u2014 reference only; the live cooling window for each action arrives on the wire</span></h2>
    ${railsTable(RAILS_ROWS)}
  </section>`;
  }
  var STILL_NOT_EXPOSED_HTML = `<p class="not-exposed">STILL NOT EXPOSED \u2014 live EpochCapability objects
    (predicate, bounds, lineage, liveness) exist only in the issuer's process memory;
    no sidecar route returns them. What this panel shows is the durable store's
    recorded state, not live issuer objects.</p>
    <p class="cap-freshness">Freshness is scoped to the durable store's semantics: this view
    reports what the store has recorded \u2014 the cross-process truth the endpoint offers.</p>`;
  function capIdList(ids) {
    if (ids.length === 0) return `<p class="empty">none recorded</p>`;
    return `<ul class="cap-ids">${ids.map((i) => `<li><code>${esc(i)}</code></li>`).join("")}</ul>`;
  }
  function renderCapabilityPanel(state) {
    const caps = state.capabilities;
    if (caps === null) {
      return `<section class="capability-panel" data-executable="false">
    <h2>Capability &amp; policy state</h2>
    <p class="cap-unavailable">CAPABILITY STATE UNAVAILABLE \u2014 GET /v1/capabilities returned
    no state (${state.capabilitiesUnavailable ? "the fetch failed: sidecar unreachable or the endpoint reported an error" : "not loaded yet this session"}).
    Nothing is rendered in its place: no stale snapshot, no invented zeros.</p>
    ${STILL_NOT_EXPOSED_HTML}
  </section>`;
    }
    const p = caps.permits;
    const c = caps.capabilities;
    const usage = Object.entries(c.usage);
    const usageHtml = usage.length === 0 ? `<p class="empty">no usage recorded</p>` : `<table class="cap-usage"><thead><tr><th>capability</th><th>mutations</th><th>bytes</th></tr></thead><tbody>
      ${usage.map(
      ([id, u]) => `<tr><td><code>${esc(id)}</code></td><td>${u.mutations}</td><td>${u.bytes}</td></tr>`
    ).join("")}
    </tbody></table>`;
    return `<section class="capability-panel" data-executable="false">
    <h2>Capability &amp; policy state <span class="provenance">GET /v1/capabilities \u2014 projected from the durable capability store</span></h2>
    <dl class="cap-facts">
      <div><dt>Consumed permits</dt><dd>${p.consumedCount}</dd></div>
      <div><dt>Fencing epoch</dt><dd>${c.fencingEpoch}</dd></div>
      <div><dt>Revoked epochs</dt><dd>${c.revokedEpochs.length ? c.revokedEpochs.map(String).join(", ") : "none"}</dd></div>
    </dl>
    <h3>Consumed permit ids</h3>
    ${capIdList(p.consumedIds)}
    <h3>Consumed capability ids</h3>
    ${capIdList(c.consumedIds)}
    <h3>Revoked capability ids</h3>
    ${capIdList(c.revokedIds)}
    <h3>Per-capability usage</h3>
    ${usageHtml}
    ${STILL_NOT_EXPOSED_HTML}
  </section>`;
  }
  function renderGatesView(state) {
    return `
  <main class="view gates-view">
    ${state.board ? renderGateBoard(state.board) : `<section class="gate-board" data-executable="false"><h2>Nine Gates</h2><p class="empty">No action selected \u2014 the board derives from an action's assent outcome.</p></section>`}
    ${renderAssentPanel(state)}
    ${renderRailsReference(state.capabilities)}
    ${renderCapabilityPanel(state)}
  </main>`;
  }
  function renderLedgerIntegrity(m) {
    const healthy = m.merkleOk && m.anchorOk;
    return `<section class="ledger-integrity" data-executable="false" data-healthy="${healthy}">
    <h2>Merkle audit log <span class="provenance">GET /v1/ledger/verify \u2014 the engine re-verifies its own chain and anchor file</span></h2>
    ${healthy ? `<div class="integrity-ok">INTEGRITY OK \u2014 chain and anchor agree</div>` : `<div class="integrity-failure">INTEGRITY FAILURE \u2014 ${!m.merkleOk ? "Merkle chain verification FAILED" : "anchor file verification FAILED"}; treat every downstream display as suspect</div>`}
    <dl class="ledger-facts">
      <div><dt>Entries</dt><dd>${m.entries}</dd></div>
      <div><dt>Current root</dt><dd><code>${esc(m.root)}</code></dd></div>
      <div><dt>Merkle verify</dt><dd>${m.merkleOk ? "ok" : "FAILED"}</dd></div>
      <div><dt>Anchor lines</dt><dd>${m.anchorLines}</dd></div>
      <div><dt>Anchor verify</dt><dd>${m.anchorOk ? "ok" : "FAILED"}</dd></div>
    </dl>
  </section>`;
  }
  function renderSealEvents(m) {
    if (m.seals.length === 0) {
      return `<section class="seal-events" data-executable="false"><h2>Seal events (this session)</h2>
      <p class="empty">No executed assents observed yet. The sidecar verifies the log
      (root + count) but does not list individual entries \u2014 per-entry detail reaches
      this console only through executed-assent anchor receipts.</p></section>`;
    }
    const rows = m.seals.map((s) => {
      const cross = s.isCurrentRoot === null ? "not yet cross-checked" : s.isCurrentRoot ? "CURRENT ROOT \u2014 equals the ledger root above" : "ancestor seal \u2014 verified by its anchor receipt, superseded as root by later seals";
      return `<article class="seal-event" data-action-id="${esc(s.actionId)}" data-executable="false">
      <div class="seal-head"><span>entry ${s.entryIndex}</span><span>${esc(fmtMs(s.timestampMs))}</span></div>
      <div class="seal-action">${esc(s.actionId)}</div>
      <div class="seal-root"><code>${esc(s.sealRoot)}</code> @ ${esc(s.location)}</div>
      <div class="seal-cross">${esc(cross)}</div>
    </article>`;
    });
    return `<section class="seal-events" data-executable="false"><h2>Seal events (this session)</h2>${rows.join("")}</section>`;
  }
  function renderSubstratePanel(m) {
    if (m.substrate === null) {
      return `<section class="substrate-panel" data-executable="false"><h2>Substrate under audit</h2>
      <p class="empty">No substrate read yet.</p></section>`;
    }
    const source = m.substrateSource === "assent_response" ? "from the last executed-assent response (freshest governed state)" : "from GET /v1/substrate";
    const records = Object.entries(m.substrate).map(([recordId, fields]) => {
      const cells = Object.entries(fields).map(([f, v]) => `<div><dt>${esc(f)}</dt><dd>${esc(v)}</dd></div>`).join("");
      return `<article class="substrate-record" data-record="${esc(recordId)}" data-executable="false">
      <h3>${esc(recordId)}</h3><dl>${cells}</dl></article>`;
    });
    return `<section class="substrate-panel" data-executable="false">
    <h2>Substrate under audit <span class="provenance">${esc(source)}</span></h2>
    ${records.length ? records.join("") : `<p class="empty">Substrate is empty.</p>`}
  </section>`;
  }
  function renderAuditView(state) {
    if (state.ledger === null) {
      return `
  <main class="view audit-view">
    <section class="ledger-integrity" data-executable="false">
      <h2>Merkle audit log</h2>
      <p class="empty">${state.sidecarReachable ? "No ledger read yet this session." : "Sidecar unreachable \u2014 no ledger data. Nothing is rendered from memory or invention."}</p>
    </section>
  </main>`;
    }
    return `
  <main class="view audit-view">
    ${renderLedgerIntegrity(state.ledger)}
    ${renderSealEvents(state.ledger)}
    ${renderSubstratePanel(state.ledger)}
  </main>`;
  }

  // topui/src/app.ts
  var VIEW_RENDERERS = {
    trajectory: renderTrajectoryView,
    gates: renderGatesView,
    audit: renderAuditView
  };
  function boot(doc, injected, opts = {}) {
    const root = doc.querySelector("#app");
    if (!root) throw new Error("top-ui: #app root missing from the page");
    const session = injected ?? (typeof window !== "undefined" ? window.__glSession : void 0) ?? new Session(new SidecarClient(fetchTransport("")));
    let view = "trajectory";
    let selectedActionId = null;
    const render = () => {
      session.expireStale();
      const state = session.state(selectedActionId);
      selectedActionId = state.selectedActionId;
      root.innerHTML = renderChrome(state, view) + VIEW_RENDERERS[view](state);
    };
    root.addEventListener("click", (ev) => {
      const el = ev.target.closest("[data-action]");
      if (!el) return;
      if (el.dataset.action === "view") {
        view = el.dataset.view ?? "trajectory";
        render();
      }
    });
    void session.refresh().then(render, render);
    render();
    const pollMs = opts.pollMs ?? 5e3;
    if (pollMs > 0 && typeof setInterval !== "undefined") {
      setInterval(() => {
        void session.refresh().then(render, render);
      }, pollMs);
    }
    return session;
  }
  if (typeof document !== "undefined" && document.querySelector("#app")) {
    boot(document);
  }
})();
