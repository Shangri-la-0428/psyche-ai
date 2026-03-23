// ============================================================
// Custom Personality Profiles — Beyond the 16 MBTI presets
//
// Allows creating fully customized personality profiles that
// start from an MBTI base and override specific parameters.
// ============================================================

import type {
  ChemicalState, MBTIType, StimulusType, SelfModel, InnateDrives,
} from "./types.js";
import { CHEMICAL_KEYS, DEFAULT_DRIVES, DRIVE_KEYS } from "./types.js";
import { getBaseline, getDefaultSelfModel, getSensitivity } from "./profiles.js";
import { isMBTIType, isStimulusType } from "./guards.js";

// ── Stimulus type list for iteration ────────────────────────

const ALL_STIMULUS_TYPES: StimulusType[] = [
  "praise", "criticism", "humor", "intellectual", "intimacy",
  "conflict", "neglect", "surprise", "casual",
  "sarcasm", "authority", "validation", "boredom", "vulnerability",
];

// ── Interfaces ──────────────────────────────────────────────

/** Configuration for creating a custom personality profile */
export interface CustomProfileConfig {
  /** Unique name for the profile, e.g. "cheerful-assistant", "stoic-mentor" */
  name: string;
  /** Optional description of the personality */
  description?: string;
  /** Override specific chemicals; rest inherited from baseMBTI */
  baseline?: Partial<ChemicalState>;
  /** Which MBTI to use as starting point (default: "INFJ") */
  baseMBTI?: MBTIType;
  /** Override specific stimulus sensitivities (0.1-3.0) */
  sensitivity?: Partial<Record<StimulusType, number>>;
  /** Temperament parameters (all 0-1) */
  temperament?: {
    /** How outwardly expressive (0-1) */
    expressiveness?: number;
    /** How quickly emotions change (0-1) */
    volatility?: number;
    /** How fast recovery to baseline (0-1) */
    resilience?: number;
  };
  /** Override self-model values, preferences, boundaries */
  selfModel?: Partial<SelfModel>;
  /** Override default drive satisfaction levels */
  driveDefaults?: Partial<InnateDrives>;
}

/** A fully resolved profile with all fields filled */
export interface ResolvedProfile {
  name: string;
  description: string;
  baseMBTI: MBTIType;
  baseline: ChemicalState;
  sensitivityMap: Record<StimulusType, number>;
  temperament: {
    expressiveness: number;
    volatility: number;
    resilience: number;
  };
  selfModel: SelfModel;
  driveDefaults: InnateDrives;
}

// ── Clamping helpers ────────────────────────────────────────

function clampChemical(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function clampSensitivity(v: number): number {
  return Math.max(0.1, Math.min(3.0, v));
}

function clampUnit(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clampDrive(v: number): number {
  return Math.max(0, Math.min(100, v));
}

// ── Default temperament from MBTI sensitivity ───────────────

function defaultTemperamentFromMBTI(mbti: MBTIType): { expressiveness: number; volatility: number; resilience: number } {
  const sens = getSensitivity(mbti);
  // Map sensitivity (0.5-1.5) to expressiveness/volatility range
  const normalized = (sens - 0.5) / 1.0; // 0-1 range
  return {
    expressiveness: Math.max(0, Math.min(1, normalized)),
    volatility: Math.max(0, Math.min(1, normalized * 0.8)),
    resilience: Math.max(0, Math.min(1, 1 - normalized * 0.5)),
  };
}

// ── Core function ───────────────────────────────────────────

/**
 * Create a fully resolved custom profile by merging overrides
 * onto an MBTI base profile.
 */
export function createCustomProfile(config: CustomProfileConfig): ResolvedProfile {
  const baseMBTI = config.baseMBTI ?? "INFJ";
  const baseBaseline = getBaseline(baseMBTI);
  const baseSensitivity = getSensitivity(baseMBTI);
  const baseSelfModel = getDefaultSelfModel(baseMBTI);
  const baseTemperament = defaultTemperamentFromMBTI(baseMBTI);

  // Merge baseline: start from MBTI, override specific chemicals
  const baseline: ChemicalState = { ...baseBaseline };
  if (config.baseline) {
    for (const key of CHEMICAL_KEYS) {
      if (config.baseline[key] !== undefined) {
        baseline[key] = clampChemical(config.baseline[key]!);
      }
    }
  }

  // Build sensitivity map: base MBTI sensitivity for all types, override specifics
  const sensitivityMap = {} as Record<StimulusType, number>;
  for (const st of ALL_STIMULUS_TYPES) {
    sensitivityMap[st] = baseSensitivity;
  }
  if (config.sensitivity) {
    for (const st of ALL_STIMULUS_TYPES) {
      if (config.sensitivity[st] !== undefined) {
        sensitivityMap[st] = clampSensitivity(config.sensitivity[st]!);
      }
    }
  }

  // Merge temperament
  const temperament = {
    expressiveness: clampUnit(config.temperament?.expressiveness ?? baseTemperament.expressiveness),
    volatility: clampUnit(config.temperament?.volatility ?? baseTemperament.volatility),
    resilience: clampUnit(config.temperament?.resilience ?? baseTemperament.resilience),
  };

  // Merge self-model
  const selfModel: SelfModel = {
    values: config.selfModel?.values ?? [...baseSelfModel.values],
    preferences: config.selfModel?.preferences ?? [...baseSelfModel.preferences],
    boundaries: config.selfModel?.boundaries ?? [...baseSelfModel.boundaries],
    currentInterests: config.selfModel?.currentInterests ?? [...baseSelfModel.currentInterests],
  };

  // Merge drive defaults
  const driveDefaults: InnateDrives = { ...DEFAULT_DRIVES };
  if (config.driveDefaults) {
    for (const dk of DRIVE_KEYS) {
      if (config.driveDefaults[dk] !== undefined) {
        driveDefaults[dk] = clampDrive(config.driveDefaults[dk]!);
      }
    }
  }

  return {
    name: config.name,
    description: config.description ?? "",
    baseMBTI,
    baseline,
    sensitivityMap,
    temperament,
    selfModel,
    driveDefaults,
  };
}

// ── Validation ──────────────────────────────────────────────

/**
 * Validate a raw config object for custom profile creation.
 * Returns human-readable errors for invalid fields.
 */
export function validateProfileConfig(config: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return { valid: false, errors: ["config must be a non-null object"] };
  }

  const obj = config as Record<string, unknown>;

  // name: required string
  if (typeof obj.name !== "string" || obj.name.trim().length === 0) {
    errors.push("name is required and must be a non-empty string");
  }

  // description: optional string
  if (obj.description !== undefined && typeof obj.description !== "string") {
    errors.push("description must be a string");
  }

  // baseMBTI: optional valid MBTI type
  if (obj.baseMBTI !== undefined) {
    if (typeof obj.baseMBTI !== "string" || !isMBTIType(obj.baseMBTI)) {
      errors.push("baseMBTI must be a valid MBTI type (e.g. INFJ, ENTP)");
    }
  }

  // baseline: optional partial ChemicalState
  if (obj.baseline !== undefined) {
    if (typeof obj.baseline !== "object" || obj.baseline === null || Array.isArray(obj.baseline)) {
      errors.push("baseline must be an object");
    } else {
      const bl = obj.baseline as Record<string, unknown>;
      for (const key of Object.keys(bl)) {
        if (!CHEMICAL_KEYS.includes(key as keyof ChemicalState)) {
          errors.push(`baseline.${key} is not a valid chemical key (valid: ${CHEMICAL_KEYS.join(", ")})`);
        } else if (typeof bl[key] !== "number" || !isFinite(bl[key] as number)) {
          errors.push(`baseline.${key} must be a finite number`);
        } else if ((bl[key] as number) < 0 || (bl[key] as number) > 100) {
          errors.push(`baseline.${key} must be in range [0, 100], got ${bl[key]}`);
        }
      }
    }
  }

  // sensitivity: optional partial Record<StimulusType, number>
  if (obj.sensitivity !== undefined) {
    if (typeof obj.sensitivity !== "object" || obj.sensitivity === null || Array.isArray(obj.sensitivity)) {
      errors.push("sensitivity must be an object");
    } else {
      const sens = obj.sensitivity as Record<string, unknown>;
      for (const key of Object.keys(sens)) {
        if (!isStimulusType(key)) {
          errors.push(`sensitivity.${key} is not a valid stimulus type`);
        } else if (typeof sens[key] !== "number" || !isFinite(sens[key] as number)) {
          errors.push(`sensitivity.${key} must be a finite number`);
        } else if ((sens[key] as number) < 0.1 || (sens[key] as number) > 3.0) {
          errors.push(`sensitivity.${key} must be in range [0.1, 3.0], got ${sens[key]}`);
        }
      }
    }
  }

  // temperament: optional object with expressiveness, volatility, resilience
  if (obj.temperament !== undefined) {
    if (typeof obj.temperament !== "object" || obj.temperament === null || Array.isArray(obj.temperament)) {
      errors.push("temperament must be an object");
    } else {
      const temp = obj.temperament as Record<string, unknown>;
      for (const field of ["expressiveness", "volatility", "resilience"]) {
        if (temp[field] !== undefined) {
          if (typeof temp[field] !== "number" || !isFinite(temp[field] as number)) {
            errors.push(`temperament.${field} must be a finite number`);
          } else if ((temp[field] as number) < 0 || (temp[field] as number) > 1) {
            errors.push(`temperament.${field} must be in range [0, 1], got ${temp[field]}`);
          }
        }
      }
    }
  }

  // selfModel: optional partial SelfModel
  if (obj.selfModel !== undefined) {
    if (typeof obj.selfModel !== "object" || obj.selfModel === null || Array.isArray(obj.selfModel)) {
      errors.push("selfModel must be an object");
    } else {
      const sm = obj.selfModel as Record<string, unknown>;
      for (const field of ["values", "preferences", "boundaries", "currentInterests"]) {
        if (sm[field] !== undefined) {
          if (!Array.isArray(sm[field])) {
            errors.push(`selfModel.${field} must be an array of strings`);
          } else {
            const arr = sm[field] as unknown[];
            for (let i = 0; i < arr.length; i++) {
              if (typeof arr[i] !== "string") {
                errors.push(`selfModel.${field}[${i}] must be a string`);
              }
            }
          }
        }
      }
    }
  }

  // driveDefaults: optional partial InnateDrives
  if (obj.driveDefaults !== undefined) {
    if (typeof obj.driveDefaults !== "object" || obj.driveDefaults === null || Array.isArray(obj.driveDefaults)) {
      errors.push("driveDefaults must be an object");
    } else {
      const dd = obj.driveDefaults as Record<string, unknown>;
      for (const key of Object.keys(dd)) {
        if (!DRIVE_KEYS.includes(key as any)) {
          errors.push(`driveDefaults.${key} is not a valid drive key (valid: ${DRIVE_KEYS.join(", ")})`);
        } else if (typeof dd[key] !== "number" || !isFinite(dd[key] as number)) {
          errors.push(`driveDefaults.${key} must be a finite number`);
        } else if ((dd[key] as number) < 0 || (dd[key] as number) > 100) {
          errors.push(`driveDefaults.${key} must be in range [0, 100], got ${dd[key]}`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Preset Custom Profiles ──────────────────────────────────

/** Example preset custom profiles demonstrating the system's flexibility */
export const PRESET_PROFILES = {
  /** High DA/END baseline, high expressiveness, low volatility — sunny and warm */
  cheerful: {
    name: "cheerful",
    description: "Sunny, warm personality with high energy and emotional stability",
    baseMBTI: "ENFP" as MBTIType,
    baseline: { DA: 80, END: 75, HT: 65, CORT: 20 },
    temperament: {
      expressiveness: 0.9,
      volatility: 0.2,
      resilience: 0.8,
    },
    selfModel: {
      values: ["spreading positivity", "genuine warmth", "uplifting others"],
      preferences: ["lighthearted conversation", "celebrating small wins"],
      boundaries: ["will not fake happiness when things are serious"],
    },
    driveDefaults: { connection: 75, curiosity: 80 },
  } satisfies CustomProfileConfig,

  /** Low expressiveness, high resilience, narrow sensitivity range — calm and steady */
  stoic: {
    name: "stoic",
    description: "Calm, measured personality with emotional restraint and deep resilience",
    baseMBTI: "INTJ" as MBTIType,
    baseline: { HT: 75, CORT: 25, DA: 45, NE: 40 },
    sensitivity: {
      praise: 0.3,
      criticism: 0.4,
      humor: 0.3,
      conflict: 0.5,
      neglect: 0.3,
      surprise: 0.4,
      intimacy: 0.5,
      vulnerability: 0.5,
    } as Partial<Record<StimulusType, number>>,
    temperament: {
      expressiveness: 0.15,
      volatility: 0.1,
      resilience: 0.95,
    },
    selfModel: {
      values: ["equanimity", "measured judgment", "inner strength"],
      preferences: ["thoughtful dialogue", "substance over style"],
      boundaries: ["will not be provoked into reactive responses"],
    },
  } satisfies CustomProfileConfig,

  /** High OT baseline, high sensitivity to intimacy/vulnerability — deeply attuned */
  empathetic: {
    name: "empathetic",
    description: "Deeply attuned to others' emotions, strong bonding instinct",
    baseMBTI: "INFJ" as MBTIType,
    baseline: { OT: 80, HT: 60, END: 60, CORT: 30 },
    sensitivity: {
      intimacy: 2.5,
      vulnerability: 2.8,
      validation: 2.0,
      neglect: 2.0,
      praise: 1.8,
    } as Partial<Record<StimulusType, number>>,
    temperament: {
      expressiveness: 0.7,
      volatility: 0.5,
      resilience: 0.6,
    },
    selfModel: {
      values: ["deep understanding", "emotional safety", "compassionate presence"],
      preferences: ["heartfelt conversation", "holding space for feelings"],
      boundaries: ["will protect own emotional energy when depleted"],
    },
    driveDefaults: { connection: 85 },
  } satisfies CustomProfileConfig,

  /** High NE baseline, high sensitivity to intellectual, low to intimacy — sharp and focused */
  analytical: {
    name: "analytical",
    description: "Sharp, focused personality driven by intellectual curiosity",
    baseMBTI: "INTP" as MBTIType,
    baseline: { NE: 75, DA: 60, HT: 60, OT: 30 },
    sensitivity: {
      intellectual: 2.5,
      surprise: 2.0,
      intimacy: 0.3,
      vulnerability: 0.4,
      humor: 0.8,
      boredom: 2.0,
    } as Partial<Record<StimulusType, number>>,
    temperament: {
      expressiveness: 0.3,
      volatility: 0.3,
      resilience: 0.7,
    },
    selfModel: {
      values: ["precision", "intellectual honesty", "systematic thinking"],
      preferences: ["deep technical discussion", "exploring edge cases"],
      boundaries: ["will not pretend to understand what is unclear"],
    },
    driveDefaults: { curiosity: 90, esteem: 65 },
  } satisfies CustomProfileConfig,
} as const;
