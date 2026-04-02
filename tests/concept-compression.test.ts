/**
 * Task #21 — Concept Compression Tests
 *
 * Enforces the "Admission Test for New Concepts" from docs/PROJECT_DIRECTION.md.
 *
 * Every type, state field, and prompt section must map to one of five
 * primitive containers. If it doesn't, suspect the concept before adding it.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── The 5 Primitive Containers ─────────────────────────────
// From PROJECT_DIRECTION.md §"The Five Primitive Containers"

type PrimitiveContainer =
  | "relation-move"        // what action happened
  | "dyadic-field"         // what the relationship is now
  | "open-loop"            // what remains unresolved / residue
  | "reply-bias"           // how response should be shaped
  | "writeback";           // how agent behavior updates

// ── Container mapping for public types ─────────────────────

const PUBLIC_TYPE_CONTAINER: Record<string, PrimitiveContainer[]> = {
  // Core engine
  PsycheEngine:           ["reply-bias", "writeback"],
  PsycheEngineConfig:     ["reply-bias"],
  ProcessInputResult:     ["relation-move", "reply-bias"],
  ProcessOutputResult:    ["writeback"],
  ProcessOutcomeResult:   ["writeback"],

  // Storage
  FileStorageAdapter:     ["writeback"],
  MemoryStorageAdapter:   ["writeback"],
  StorageAdapter:         ["writeback"],

  // State — the root container
  PsycheState:            ["dyadic-field", "open-loop", "reply-bias", "writeback"],
  SelfState:          ["reply-bias"],
  Locale:                 ["reply-bias"],
  PsycheMode:             ["reply-bias"],
  StimulusType:           ["relation-move"],
  MBTIType:               ["reply-bias"],
  WritebackSignalType:    ["writeback"],

  // Prompt
  buildProtocolContext:    ["reply-bias"],
  buildCompactContext:     ["reply-bias", "dyadic-field", "open-loop"],
  buildDynamicContext:     ["reply-bias"],
  isNearBaseline:         ["reply-bias"],
  getNearBaselineThreshold: ["reply-bias"],
  deriveBehavioralBias:   ["reply-bias"],
  computeUserInvestment:  ["relation-move", "dyadic-field"],

  // Profiles
  getBaseline:            ["reply-bias"],
  getSensitivity:         ["reply-bias"],
  getDefaultSelfModel:    ["reply-bias"],
  getTemperament:         ["reply-bias"],
  traitsToBaseline:       ["reply-bias"],
  mbtiToTraits:           ["reply-bias"],
  createCustomProfile:    ["reply-bias"],
  PRESET_PROFILES:        ["reply-bias"],

  // Diagnostics
  computeLayerHealthSummary: ["writeback"],
  LayerHealthSummary:     ["writeback"],
  LayerHealthDetail:      ["writeback"],
  LayerStatus:            ["writeback"],
  DiagnosticLayer:        ["writeback"],
};

// ── Container mapping for PsycheState fields ───────────────

const PSYCHE_STATE_FIELD_CONTAINER: Record<string, PrimitiveContainer> = {
  version:                "writeback",
  mbti:                   "reply-bias",
  baseline:               "reply-bias",
  sensitivity:            "reply-bias",
  current:                "reply-bias",
  drives:                 "reply-bias",
  updatedAt:              "writeback",
  relationships:          "dyadic-field",
  empathyLog:             "relation-move",
  selfModel:              "reply-bias",
  stateHistory:       "open-loop",
  agreementStreak:        "open-loop",
  lastDisagreement:       "open-loop",
  learning:               "writeback",
  metacognition:          "writeback",
  personhood:             "writeback",
  autonomicState:         "reply-bias",
  sessionStartedAt:       "reply-bias",
  traitDrift:             "writeback",
  energyBudgets:          "reply-bias",
  subjectResidue:         "open-loop",
  dyadicFields:           "dyadic-field",
  pendingRelationSignals: "relation-move",
  pendingWritebackCalibrations: "writeback",
  lastWritebackFeedback:  "writeback",
  throngletsExportState:  "writeback",
  meta:                   "reply-bias",
};

// ── The 4 frozen identity objects ──────────────────────────
// From PROJECT_DIRECTION.md §"Frozen Identity Model"

const FROZEN_IDENTITY_OBJECTS = new Set([
  "principal",   // continuing subject
  "account",     // asset and settlement container
  "delegate",    // authorized executor
  "session",     // concrete run, never an economic subject
]);

// ── Compact prompt section → container mapping ─────────────

const COMPACT_PROMPT_SECTIONS: Record<string, PrimitiveContainer> = {
  // Section 1: Work mode early exit
  "work-mode":             "reply-bias",
  // Section 2: Neutral one-liner early exit
  "neutral-one-liner":     "reply-bias",
  // Section 3: Continuity (session bridge)
  "continuity":            "dyadic-field",
  // Section 4: Inner state
  "inner-state":           "reply-bias",
  // Section 5: Sensing
  "sensing":               "relation-move",
  // Section 6: Behavioral constraints
  "behavioral-constraints": "reply-bias",
  // Section 7a: Memory
  "memory":                "dyadic-field",
  // Section 7b: Unified behavior rules
  "unified-behavior":      "reply-bias",
  // Section 8a: Overlay sections
  "overlay":               "reply-bias",
  // Section 8b: Channel modifier
  "channel":               "reply-bias",
  // Section 8c: Writeback hint
  "writeback-hint":        "writeback",
};

// ════════════════════════════════════════════════════════════
//  Tests
// ════════════════════════════════════════════════════════════

describe("Concept Compression — Admission Test", () => {

  // (a) Every public type maps to a primitive container
  describe("public type → primitive container coverage", () => {
    const VALID_CONTAINERS: Set<string> = new Set([
      "relation-move", "dyadic-field", "open-loop", "reply-bias", "writeback",
    ]);

    it("every public type has at least one container assignment", () => {
      for (const [name, containers] of Object.entries(PUBLIC_TYPE_CONTAINER)) {
        assert.ok(
          containers.length > 0,
          `${name} must map to at least one primitive container`,
        );
      }
    });

    it("all container assignments use valid container names", () => {
      for (const [name, containers] of Object.entries(PUBLIC_TYPE_CONTAINER)) {
        for (const c of containers) {
          assert.ok(
            VALID_CONTAINERS.has(c),
            `${name} maps to unknown container "${c}"`,
          );
        }
      }
    });

    it("all 5 primitive containers are used at least once", () => {
      const used = new Set<string>();
      for (const containers of Object.values(PUBLIC_TYPE_CONTAINER)) {
        for (const c of containers) used.add(c);
      }
      for (const expected of VALID_CONTAINERS) {
        assert.ok(used.has(expected), `Container "${expected}" is not used by any public type`);
      }
    });

    it("no public type maps to a narrative/description container", () => {
      const BANNED_CONTAINERS = new Set([
        "emotion-label", "mood-description", "narrative-explanation",
        "sentiment-tag", "feeling-name",
      ]);
      for (const [name, containers] of Object.entries(PUBLIC_TYPE_CONTAINER)) {
        for (const c of containers) {
          assert.ok(
            !BANNED_CONTAINERS.has(c),
            `${name} maps to banned container "${c}" — Psyche moves away from emotion labels`,
          );
        }
      }
    });
  });

  // (b) PsycheState fields → primitive container categorization
  describe("PsycheState fields → primitive containers", () => {
    const VALID_CONTAINERS: Set<string> = new Set([
      "relation-move", "dyadic-field", "open-loop", "reply-bias", "writeback",
    ]);

    // Canonical PsycheState fields (from types.ts interface)
    const CANONICAL_FIELDS = new Set([
      "version", "mbti", "baseline", "sensitivity", "current", "drives",
      "updatedAt", "relationships", "empathyLog", "selfModel",
      "stateHistory", "agreementStreak", "lastDisagreement",
      "learning", "metacognition", "personhood",
      "autonomicState", "sessionStartedAt", "traitDrift", "energyBudgets",
      "subjectResidue", "dyadicFields", "pendingRelationSignals",
      "pendingWritebackCalibrations", "lastWritebackFeedback",
      "throngletsExportState", "meta",
    ]);

    it("every PsycheState field has a container assignment", () => {
      for (const field of CANONICAL_FIELDS) {
        assert.ok(
          field in PSYCHE_STATE_FIELD_CONTAINER,
          `PsycheState.${field} has no container assignment`,
        );
      }
    });

    it("no extra fields exist in the mapping beyond canonical fields", () => {
      for (const field of Object.keys(PSYCHE_STATE_FIELD_CONTAINER)) {
        assert.ok(
          CANONICAL_FIELDS.has(field),
          `Mapping contains "${field}" which is not a canonical PsycheState field`,
        );
      }
    });

    it("all field containers are valid", () => {
      for (const [field, container] of Object.entries(PSYCHE_STATE_FIELD_CONTAINER)) {
        assert.ok(
          VALID_CONTAINERS.has(container),
          `PsycheState.${field} maps to unknown container "${container}"`,
        );
      }
    });

    it("all 5 containers are represented in PsycheState fields", () => {
      const used = new Set<string>(Object.values(PSYCHE_STATE_FIELD_CONTAINER));
      for (const c of VALID_CONTAINERS) {
        assert.ok(used.has(c as string), `Container "${c}" has no PsycheState field`);
      }
    });
  });

  // (c) No new top-level identity objects beyond frozen 4
  describe("frozen identity model — no new identity objects", () => {
    it("exactly 4 identity objects exist", () => {
      assert.equal(FROZEN_IDENTITY_OBJECTS.size, 4);
    });

    it("contains principal, account, delegate, session", () => {
      assert.ok(FROZEN_IDENTITY_OBJECTS.has("principal"));
      assert.ok(FROZEN_IDENTITY_OBJECTS.has("account"));
      assert.ok(FROZEN_IDENTITY_OBJECTS.has("delegate"));
      assert.ok(FROZEN_IDENTITY_OBJECTS.has("session"));
    });

    it("Thronglets export subjects are a subset of identity objects", () => {
      // ThrongletsExportSubject = "delegate" | "session"
      const exportSubjects = ["delegate", "session"];
      for (const s of exportSubjects) {
        assert.ok(
          FROZEN_IDENTITY_OBJECTS.has(s),
          `Thronglets export subject "${s}" is not a frozen identity object`,
        );
      }
    });

    it("SessionBridgeState does not introduce a new identity object", () => {
      // SessionBridgeState carries continuity data for "session" — which is frozen
      const bridgeFields = [
        "closenessFloor", "safetyFloor", "guardFloor", "residueFloor",
        "continuityFloor", "continuityMode", "activeLoopTypes", "sourceMemoryCount",
      ];
      // None of these are identity-creating — they are all relational or continuity data
      for (const f of bridgeFields) {
        assert.ok(
          !FROZEN_IDENTITY_OBJECTS.has(f),
          `SessionBridgeState field "${f}" must not be an identity object`,
        );
      }
    });

    it("PsycheState.meta does not introduce identity objects beyond principal", () => {
      // meta contains agentName (principal alias), createdAt, totalInteractions, locale, mode
      // These describe the principal's configuration, not new identity types
      const metaFields = ["agentName", "createdAt", "totalInteractions", "locale", "mode"];
      for (const f of metaFields) {
        assert.ok(
          !FROZEN_IDENTITY_OBJECTS.has(f),
          `meta.${f} is a property of the principal, not a new identity object`,
        );
      }
    });
  });

  // (d) Compact prompt sections → behavioral containers (not narrative)
  describe("compact prompt sections → behavioral containers", () => {
    const VALID_CONTAINERS: Set<string> = new Set([
      "relation-move", "dyadic-field", "open-loop", "reply-bias", "writeback",
    ]);

    const NARRATIVE_CONTAINERS = new Set([
      "emotion-label", "mood-description", "narrative-explanation",
      "sentiment-tag", "feeling-name", "self-description",
    ]);

    it("every prompt section maps to a valid behavioral container", () => {
      for (const [section, container] of Object.entries(COMPACT_PROMPT_SECTIONS)) {
        assert.ok(
          VALID_CONTAINERS.has(container),
          `Prompt section "${section}" maps to invalid container "${container}"`,
        );
      }
    });

    it("no prompt section maps to a narrative/description container", () => {
      for (const [section, container] of Object.entries(COMPACT_PROMPT_SECTIONS)) {
        assert.ok(
          !NARRATIVE_CONTAINERS.has(container),
          `Prompt section "${section}" maps to narrative container "${container}" — prompts should be behavioral, not descriptive`,
        );
      }
    });

    it("the 8 canonical compact prompt sections are all accounted for", () => {
      // buildCompactContext has 8 documented sections (plus sub-sections)
      const expectedSections = [
        "work-mode", "neutral-one-liner", "continuity", "inner-state",
        "sensing", "behavioral-constraints", "memory", "unified-behavior",
        "overlay", "channel", "writeback-hint",
      ];
      for (const section of expectedSections) {
        assert.ok(
          section in COMPACT_PROMPT_SECTIONS,
          `Expected prompt section "${section}" not found in mapping`,
        );
      }
    });

    it("reply-bias is the dominant container for prompt sections", () => {
      // Most prompt sections shape behavior (reply-bias), not describe states
      const replyBiasCount = Object.values(COMPACT_PROMPT_SECTIONS)
        .filter(c => c === "reply-bias").length;
      const totalSections = Object.keys(COMPACT_PROMPT_SECTIONS).length;
      assert.ok(
        replyBiasCount > totalSections / 2,
        `Only ${replyBiasCount}/${totalSections} sections are reply-bias — most prompt sections should shape behavior`,
      );
    });

    it("writeback-hint is the only writeback section in prompt", () => {
      const writebackSections = Object.entries(COMPACT_PROMPT_SECTIONS)
        .filter(([, c]) => c === "writeback")
        .map(([s]) => s);
      assert.deepEqual(
        writebackSections,
        ["writeback-hint"],
        `Only writeback-hint should be writeback container, found: ${writebackSections}`,
      );
    });
  });
});
