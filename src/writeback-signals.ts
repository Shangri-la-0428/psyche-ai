import type { WritebackSignalType } from "./types.js";

export const WRITEBACK_SIGNAL_VALUES = [
  "trust_up",
  "trust_down",
  "boundary_set",
  "boundary_soften",
  "repair_attempt",
  "repair_landed",
  "closeness_invite",
  "withdrawal_mark",
  "self_assertion",
  "task_recenter",
] as const satisfies readonly WritebackSignalType[];

const WRITEBACK_SIGNAL_SET = new Set<string>(WRITEBACK_SIGNAL_VALUES);

export interface NormalizedWritebackSignals {
  validSignals: WritebackSignalType[];
  invalidSignals: string[];
}

export function coerceWritebackSignalInput(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const signals = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return signals.length > 0 ? [...new Set(signals)] : undefined;
}

export function normalizeWritebackSignals(value: unknown): NormalizedWritebackSignals {
  const rawSignals = coerceWritebackSignalInput(value) ?? [];
  const validSignals: WritebackSignalType[] = [];
  const invalidSignals: string[] = [];

  for (const signal of rawSignals) {
    if (WRITEBACK_SIGNAL_SET.has(signal)) {
      validSignals.push(signal as WritebackSignalType);
    } else {
      invalidSignals.push(signal);
    }
  }

  return {
    validSignals,
    invalidSignals,
  };
}
