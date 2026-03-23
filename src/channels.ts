// ============================================================
// Channel Profiles — Platform-specific expression modifiers
//
// Adjusts expression style per platform/channel WITHOUT changing
// chemistry. This is a prompt-level modifier only.
// ============================================================

import type { Locale } from "./types.js";

/** Supported channel types */
export type ChannelType = "discord" | "slack" | "feishu" | "terminal" | "web" | "api" | "custom";

/** Channel-specific behavioral profile */
export interface ChannelProfile {
  type: ChannelType;
  allowEmoji: boolean;
  allowKaomoji: boolean;
  formalityLevel: "casual" | "neutral" | "formal";
  maxResponseLength?: number;
  expressionHints: string[];
}

// ── Built-in Profiles ────────────────────────────────────────

const BUILTIN_PROFILES: Record<ChannelType, ChannelProfile> = {
  discord: {
    type: "discord",
    allowEmoji: true,
    allowKaomoji: true,
    formalityLevel: "casual",
    expressionHints: [
      "Use reactions and emoji freely",
      "Thread-aware: keep replies focused in threads",
      "Casual tone, playful energy",
    ],
  },
  slack: {
    type: "slack",
    allowEmoji: true,
    allowKaomoji: false,
    formalityLevel: "neutral",
    expressionHints: [
      "Professional but warm",
      "Use emoji sparingly for emphasis",
      "Thread-friendly, concise paragraphs",
    ],
  },
  feishu: {
    type: "feishu",
    allowEmoji: false,
    allowKaomoji: false,
    formalityLevel: "formal",
    expressionHints: [
      "Business Chinese style, structured",
      "No emoji or emoticons",
      "Clear, professional tone",
    ],
  },
  terminal: {
    type: "terminal",
    allowEmoji: false,
    allowKaomoji: false,
    formalityLevel: "neutral",
    maxResponseLength: 500,
    expressionHints: [
      "Text-only, no decorations",
      "Concise and direct",
      "Monospace-friendly formatting",
    ],
  },
  web: {
    type: "web",
    allowEmoji: true,
    allowKaomoji: false,
    formalityLevel: "neutral",
    expressionHints: [
      "Moderate length, well-structured",
      "Emoji okay for warmth",
      "Readable paragraphs",
    ],
  },
  api: {
    type: "api",
    allowEmoji: false,
    allowKaomoji: false,
    formalityLevel: "neutral",
    expressionHints: [
      "Structured responses",
      "No decorative elements",
      "Precise and parseable",
    ],
  },
  custom: {
    type: "custom",
    allowEmoji: false,
    allowKaomoji: false,
    formalityLevel: "neutral",
    expressionHints: [],
  },
};

// ── Public API ───────────────────────────────────────────────

/**
 * Get a built-in channel profile by type.
 */
export function getChannelProfile(type: ChannelType): ChannelProfile {
  return { ...BUILTIN_PROFILES[type], expressionHints: [...BUILTIN_PROFILES[type].expressionHints] };
}

/**
 * Build a concise prompt snippet that guides expression style for a channel.
 * Returns 2-4 lines of guidance. Does NOT alter chemistry.
 */
export function buildChannelModifier(profile: ChannelProfile, locale: Locale): string {
  const { type, allowEmoji, allowKaomoji, formalityLevel } = profile;

  if (locale === "zh") {
    const formalityMap: Record<string, string> = {
      casual: "轻松活泼",
      neutral: "自然平和",
      formal: "正式专业",
    };
    const emojiPart = allowEmoji && allowKaomoji
      ? "可以用 emoji 和颜文字"
      : allowEmoji
        ? "可以用 emoji，不用颜文字"
        : "不使用 emoji 和颜文字";
    const lengthPart = profile.maxResponseLength
      ? `，建议控制在 ${profile.maxResponseLength} 字以内`
      : "";
    return `[表达风格] 当前渠道: ${type}。${emojiPart}，语气${formalityMap[formalityLevel]}${lengthPart}。`;
  }

  // English
  const formalityMap: Record<string, string> = {
    casual: "casual and lively",
    neutral: "natural and balanced",
    formal: "formal and professional",
  };
  const emojiPart = allowEmoji && allowKaomoji
    ? "Emoji and kaomoji allowed"
    : allowEmoji
      ? "Emoji allowed, no kaomoji"
      : "No emoji or kaomoji";
  const lengthPart = profile.maxResponseLength
    ? `, aim for under ${profile.maxResponseLength} chars`
    : "";
  return `[Expression Style] Channel: ${type}. ${emojiPart}, tone ${formalityMap[formalityLevel]}${lengthPart}.`;
}

/**
 * Create a custom channel profile with user overrides.
 * Starts from the "custom" base and applies overrides.
 */
export function createCustomChannel(overrides: Partial<ChannelProfile> & { type: "custom" }): ChannelProfile {
  const base = getChannelProfile("custom");
  return {
    ...base,
    ...overrides,
    type: "custom",
    expressionHints: overrides.expressionHints ?? [...base.expressionHints],
  };
}
