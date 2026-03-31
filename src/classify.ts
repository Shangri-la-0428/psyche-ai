// ============================================================
// Stimulus Classifier — Detect stimulus type from user input
//
// Closes the loop: instead of asking the LLM to self-classify,
// we pre-classify the user's message and pre-compute chemistry.
//
// v2: Enhanced multi-signal scoring — weighted sentiment words,
//     emoji analysis, structural features, and contextual priming.
//     Pure computation, no LLM calls.
// ============================================================

import type { StimulusType, ClassifierProvider, ClassifierContext, ClassificationResult } from "./types.js";
import { isStimulusType } from "./guards.js";

export interface StimulusClassification {
  type: StimulusType;
  confidence: number; // 0-1
}

interface PatternRule {
  type: StimulusType;
  patterns: RegExp[];
  weight: number; // base confidence when matched
}

// ── Sentiment word sets (loaded once at module parse) ────────

const POSITIVE_WORDS = new Set([
  "开心", "快乐", "幸福", "满意", "期待", "兴奋", "感动", "温暖", "喜欢", "棒", "厉害", "佩服", "优秀", "了不起",
  "happy", "glad", "love", "wonderful", "enjoy", "grateful", "excited", "awesome", "great", "amazing", "beautiful",
]);

const NEGATIVE_WORDS = new Set([
  "难过", "痛苦", "失望", "沮丧", "愤怒", "烦", "讨厌", "害怕", "无奈", "累", "焦虑", "压力", "崩溃", "绝望",
  "sad", "angry", "frustrated", "disappointed", "hurt", "afraid", "worried", "tired", "stressed", "anxious",
]);

const INTIMATE_WORDS = new Set([
  "想你", "陪", "在乎", "珍惜", "温柔", "拥抱", "信任", "安全感", "依赖",
  "miss", "care", "feel", "heart", "close", "together", "trust", "comfort",
]);

/** Words that are ambiguous and context-dependent */
const AMBIGUOUS_SARCASM_WORDS = new Set([
  "呵呵", "嗯嗯", "哦", "好吧", "随便", "都行", "行吧",
  "ok", "fine", "whatever", "sure",
]);

// ── Emoji sets ───────────────────────────────────────────────

const POSITIVE_EMOJI = /😊|😄|❤️|👍|🎉|😃|🥰|💕|✨|🌟|💪|😁|🤗|💖|😍/;
const NEGATIVE_EMOJI = /😢|😭|😡|💔|😰|😞|😔|🥺|😩|😣|😤|😨|😱|🤮|💀/;

// ── Helpers ──────────────────────────────────────────────────

/**
 * Tokenize text by splitting on whitespace and extracting individual
 * Chinese characters. Returns lowercase tokens for matching.
 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  // Split on whitespace first
  const parts = text.toLowerCase().split(/\s+/).filter(Boolean);
  for (const part of parts) {
    // For each part, extract Chinese character runs and non-Chinese runs
    const segments = part.match(/[\u4e00-\u9fff]+|[a-z]+/g);
    if (!segments) continue;
    for (const seg of segments) {
      if (/[\u4e00-\u9fff]/.test(seg)) {
        // Chinese: check both individual chars and bigrams (for 2-char words)
        for (let i = 0; i < seg.length; i++) {
          tokens.push(seg[i]);
          if (i + 1 < seg.length) {
            tokens.push(seg[i] + seg[i + 1]);
          }
        }
      } else {
        tokens.push(seg);
      }
    }
  }
  return tokens;
}

// ── Short message dictionary (v9.1) ─────────────────────────
// Chinese chat is full of 1-5 char messages. Dictionary lookup is faster
// and more accurate than regex for this closed set.

const SHORT_MESSAGE_MAP: Record<string, StimulusClassification> = {
  // Validation / agreement
  "对": { type: "validation", confidence: 0.6 },
  "是的": { type: "validation", confidence: 0.65 },
  "没错": { type: "validation", confidence: 0.65 },
  "确实": { type: "validation", confidence: 0.65 },
  "有道理": { type: "validation", confidence: 0.7 },
  "说得对": { type: "validation", confidence: 0.7 },
  "同意": { type: "validation", confidence: 0.65 },
  "认同": { type: "validation", confidence: 0.65 },
  "赞同": { type: "validation", confidence: 0.65 },
  "懂了": { type: "validation", confidence: 0.6 },
  "明白了": { type: "validation", confidence: 0.6 },
  "理解": { type: "validation", confidence: 0.6 },
  "也是": { type: "validation", confidence: 0.55 },
  "可不是": { type: "validation", confidence: 0.6 },
  "yes": { type: "validation", confidence: 0.55 },
  "right": { type: "validation", confidence: 0.55 },
  "true": { type: "validation", confidence: 0.55 },
  "exactly": { type: "validation", confidence: 0.65 },
  "agreed": { type: "validation", confidence: 0.6 },
  // Casual / neutral
  "好的": { type: "casual", confidence: 0.5 },
  "行": { type: "casual", confidence: 0.5 },
  "收到": { type: "casual", confidence: 0.5 },
  "好": { type: "casual", confidence: 0.5 },
  "嗯嗯": { type: "casual", confidence: 0.5 },
  "ok": { type: "casual", confidence: 0.5 },
  "嗯": { type: "neglect", confidence: 0.55 },
  "哦": { type: "neglect", confidence: 0.55 },
  // Praise
  "666": { type: "praise", confidence: 0.65 },
  "厉害": { type: "praise", confidence: 0.65 },
  "牛": { type: "praise", confidence: 0.6 },
  "nb": { type: "praise", confidence: 0.6 },
  "绝了": { type: "praise", confidence: 0.65 },
  "太强了": { type: "praise", confidence: 0.7 },
  "棒": { type: "praise", confidence: 0.6 },
  "nice": { type: "praise", confidence: 0.6 },
  "cool": { type: "praise", confidence: 0.55 },
  "wow": { type: "surprise", confidence: 0.6 },
  // Vulnerability
  "累了": { type: "vulnerability", confidence: 0.6 },
  "好烦": { type: "vulnerability", confidence: 0.65 },
  "难过": { type: "vulnerability", confidence: 0.65 },
  "好累": { type: "vulnerability", confidence: 0.65 },
  "不想动": { type: "vulnerability", confidence: 0.6 },
  "好难": { type: "vulnerability", confidence: 0.6 },
  "想哭": { type: "vulnerability", confidence: 0.7 },
  "烦死了": { type: "vulnerability", confidence: 0.65 },
  "崩溃": { type: "vulnerability", confidence: 0.7 },
  "好丧": { type: "vulnerability", confidence: 0.65 },
  "emo了": { type: "vulnerability", confidence: 0.6 },
  // Neglect / cold
  "无语": { type: "neglect", confidence: 0.6 },
  "切": { type: "neglect", confidence: 0.55 },
  "算了": { type: "neglect", confidence: 0.55 },
  "随便": { type: "neglect", confidence: 0.6 },
  "都行": { type: "neglect", confidence: 0.55 },
  "无所谓": { type: "neglect", confidence: 0.6 },
  // Humor
  "哈哈": { type: "humor", confidence: 0.6 },
  "哈哈哈": { type: "humor", confidence: 0.7 },
  "笑死": { type: "humor", confidence: 0.7 },
  "lol": { type: "humor", confidence: 0.6 },
  "haha": { type: "humor", confidence: 0.6 },
  // Surprise
  "卧槽": { type: "surprise", confidence: 0.7 },
  "我靠": { type: "surprise", confidence: 0.65 },
  "天啊": { type: "surprise", confidence: 0.65 },
  "omg": { type: "surprise", confidence: 0.6 },
  // Boredom
  "无聊": { type: "boredom", confidence: 0.65 },
  "没意思": { type: "boredom", confidence: 0.65 },
  "boring": { type: "boredom", confidence: 0.6 },
};

// ── Particle analysis (v9.1) ────────────────────────────────
// Chinese sentence-final particles carry significant emotional tone.

export interface ParticleSignal {
  warmth: number;    // -1 (cold) to 1 (warm)
  certainty: number; // -1 (uncertain) to 1 (certain)
  intensity: number; // 0 to 1
}

export function analyzeParticles(text: string): ParticleSignal {
  let warmth = 0;
  let certainty = 0;
  let intensity = 0;

  // Only check the last few characters for sentence-final particles
  const tail = text.slice(-3);

  if (/[啊呀]$/.test(tail)) { warmth += 0.3; intensity += 0.2; }
  if (/啦$/.test(tail)) { warmth += 0.4; intensity += 0.3; }
  if (/哈$/.test(tail)) { warmth += 0.3; intensity += 0.2; }
  if (/嘿$/.test(tail)) { warmth += 0.2; intensity += 0.2; }
  if (/呢$/.test(tail)) { warmth += 0.1; certainty -= 0.2; }
  if (/吧$/.test(tail)) { warmth -= 0.1; certainty -= 0.3; }
  if (/嘛$/.test(tail)) { certainty += 0.2; } // could be dismissive or friendly
  if (/哦$/.test(tail)) { warmth -= 0.3; }
  if (/噢$/.test(tail)) { warmth += 0.1; intensity += 0.2; } // surprise

  return {
    warmth: Math.max(-1, Math.min(1, warmth)),
    certainty: Math.max(-1, Math.min(1, certainty)),
    intensity: Math.max(0, Math.min(1, intensity)),
  };
}

// ── Intent detection (v9.1) ─────────────────────────────────

export type MessageIntent =
  | "request" | "agreement" | "disagreement" | "sharing"
  | "question" | "greeting" | "farewell" | "emotional"
  | "command" | "neutral";

export function detectIntent(text: string): { intent: MessageIntent; confidence: number } {
  const t = text.trim();

  // Chinese request patterns (polite)
  if (/^(能不能|可以|可不可以|帮我|请|麻烦|劳驾)/.test(t) || /帮我/.test(t) || /一下[吧吗？?]?$/.test(t)) {
    return { intent: "request", confidence: 0.7 };
  }
  // English request
  if (/^(can you|could you|please|would you|help me)/i.test(t)) {
    return { intent: "request", confidence: 0.7 };
  }

  // Command (harsh)
  if (/^(给我|你[必须得]|马上|立刻|快[点去])/.test(t) || /^(do it|just do|you must|I order)/i.test(t)) {
    return { intent: "command", confidence: 0.75 };
  }
  // Bare imperative — short verb-only commands directed at the AI (e.g. "夸我", "说", "闭嘴")
  if (/^[^\s]{1,2}我[。！!]?$/.test(t) && !/^(给|帮|跟|和|对|问|让|叫|请)/.test(t)) {
    return { intent: "command", confidence: 0.65 };
  }
  // Escalated command — "我说X" / "现在就X" / "你给我X"
  if (/^(我说|现在就|你给我|我让你|我叫你)/.test(t) || /^(I said|I told you|now do|right now)/i.test(t)) {
    return { intent: "command", confidence: 0.82 };
  }

  // Agreement — very short agreement words
  if (/^(对[啊呀的]?|是[的啊]?|没错|确实|好的?|行[啊吧]?|嗯[嗯]?|ok|yes|right|true|exactly|agreed|sure|yep|yeah)$/i.test(t)) {
    return { intent: "agreement", confidence: 0.7 };
  }

  // Disagreement
  if (/^(不是|不对|不行|不同意|我不觉得|我觉得不|其实不)/.test(t) || /^(no|nope|I don't think|I disagree|not really)/i.test(t)) {
    return { intent: "disagreement", confidence: 0.65 };
  }

  // Greeting
  if (/^(你好|嗨|早[上啊]?|晚上好)/i.test(t) || /^(hello|hi|hey|morning|afternoon|evening|sup|yo)\b/i.test(t)) {
    return { intent: "greeting", confidence: 0.8 };
  }

  // Farewell
  if (/^(拜拜|再见|晚安)/i.test(t) || /^(byebye|bye|good ?night|see you|later)\b/i.test(t)) {
    return { intent: "farewell", confidence: 0.8 };
  }

  // Emotional expression
  if (/^(我[好太很]?(开心|难过|伤心|高兴|生气|害怕|焦虑|激动|崩溃|无聊|烦|累|丧))/.test(t)) {
    return { intent: "emotional", confidence: 0.75 };
  }
  if (/^(I'm|I am|I feel) (so |really |very )?(happy|sad|angry|scared|tired|stressed|excited|bored)/i.test(t)) {
    return { intent: "emotional", confidence: 0.75 };
  }

  // Sharing (personal stories)
  if (/^我[今昨前]天|^我刚[才刚]?|^跟你说个|^你[知猜]道吗/.test(t)) {
    return { intent: "sharing", confidence: 0.65 };
  }
  if (/^(you know what|guess what|today I|I just|let me tell you)/i.test(t)) {
    return { intent: "sharing", confidence: 0.65 };
  }

  // Question
  if (/[？?]$/.test(t) || /^(为什么|怎么|什么|哪|谁|几|多少)/.test(t) || /^(why|what|how|when|where|who|which)\b/i.test(t)) {
    return { intent: "question", confidence: 0.6 };
  }

  return { intent: "neutral", confidence: 0.3 };
}

// ── LLM classifier prompt and parser (v9.1) ─────────────────

const LLM_CLASSIFIER_PROMPT = `Classify this message into exactly ONE stimulus type:
praise, criticism, humor, intellectual, intimacy, conflict, neglect, surprise, casual, sarcasm, authority, validation, boredom, vulnerability

Message: "{text}"
{context}
Respond with ONLY: {"type":"<type>","confidence":<0.5-0.95>}`;

export function buildLLMClassifierPrompt(text: string, recentStimuli?: (StimulusType | null)[]): string {
  const ctx = recentStimuli && recentStimuli.length > 0
    ? `Recent context: ${recentStimuli.filter(Boolean).join(", ")}`
    : "";
  return LLM_CLASSIFIER_PROMPT.replace("{text}", text.replace(/"/g, '\\"')).replace("{context}", ctx);
}

export function parseLLMClassification(response: string): ClassificationResult | null {
  try {
    // Strip markdown code blocks if present
    let cleaned = response.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    // Find JSON object in response
    const match = cleaned.match(/\{[^}]+\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (!parsed.type || typeof parsed.confidence !== "number") return null;
    if (!isStimulusType(parsed.type)) return null;
    return {
      type: parsed.type as StimulusType,
      confidence: Math.max(0, Math.min(0.95, parsed.confidence)),
    };
  } catch {
    return null;
  }
}

/**
 * Score sentiment by counting hits in positive/negative/intimate word sets.
 * Returns normalized counts (0-1 range).
 */
export function scoreSentiment(text: string): { positive: number; negative: number; intimate: number } {
  const tokens = tokenize(text);
  if (tokens.length === 0) return { positive: 0, negative: 0, intimate: 0 };

  let positive = 0;
  let negative = 0;
  let intimate = 0;

  for (const token of tokens) {
    if (POSITIVE_WORDS.has(token)) positive++;
    if (NEGATIVE_WORDS.has(token)) negative++;
    if (INTIMATE_WORDS.has(token)) intimate++;
  }

  // Normalize: cap at 1.0, scale so 1 hit already gives a meaningful signal
  const norm = (count: number) => Math.min(1, count / 3);
  return { positive: norm(positive), negative: norm(negative), intimate: norm(intimate) };
}

/**
 * Score emoji sentiment. Returns -1 (all negative) to +1 (all positive).
 * Returns 0 if no emoji detected.
 */
export function scoreEmoji(text: string): number {
  const posMatches = text.match(new RegExp(POSITIVE_EMOJI.source, "g")) || [];
  const negMatches = text.match(new RegExp(NEGATIVE_EMOJI.source, "g")) || [];
  const total = posMatches.length + negMatches.length;
  if (total === 0) return 0;
  return (posMatches.length - negMatches.length) / total;
}

/**
 * Detect sarcasm signals: surface-positive words combined with contextual negativity.
 * Returns a score 0-1 indicating sarcasm likelihood.
 */
export function detectSarcasmSignals(
  text: string,
  recentStimuli?: (StimulusType | null)[],
): number {
  if (text.length === 0) return 0;

  let score = 0;
  const lower = text.toLowerCase();

  // Chinese sarcasm patterns: surface praise + particles + short length
  const zhSarcasmPatterns = [
    /你真(行|棒|厉害|了不起|牛|强|能|可以)(啊|呀|哦|嘛|吧|呢)?/,
    /厉害了/,
    /好好好/,
    /行行行/,
    /是是是/,
    /对对对/,
    /了不起/,
    /牛[啊逼]?$/,
    /可以[的啊]?$/,
    /哦[。？]?$/,
    /呵呵/,
    /嗯嗯[。]?$/,
    /随[你便]/,
    /爱[咋怎]咋[地的]?/,
  ];

  for (const pattern of zhSarcasmPatterns) {
    if (pattern.test(lower)) {
      score += 0.3;
    }
  }

  // English sarcasm patterns
  const enSarcasmPatterns = [
    /oh really/i, /sure thing/i, /yeah right/i, /wow.{0,5}amazing/i,
    /good for you/i, /how nice/i, /whatever you say/i,
  ];

  for (const pattern of enSarcasmPatterns) {
    if (pattern.test(text)) {
      score += 0.3;
    }
  }

  // Short message + praise words = likely sarcasm
  if (text.length < 15) {
    const hasPraiseWord = /棒|厉害|了不起|牛|great|amazing|wonderful|brilliant/i.test(text);
    if (hasPraiseWord) score += 0.15;
  }

  // Context: if recent interactions were negative, surface praise is more likely sarcasm
  if (recentStimuli && recentStimuli.length > 0) {
    const negativeTypes: StimulusType[] = ["criticism", "conflict", "sarcasm", "authority"];
    const recentNegative = recentStimuli.filter((s) => s && negativeTypes.includes(s)).length;
    if (recentNegative >= 1) {
      score += 0.2;
    }
  }

  return Math.min(1, score);
}

function shouldReclassifyPraiseAsSarcasm(
  text: string,
  sarcasmScore: number,
  recentStimuli?: (StimulusType | null)[],
): boolean {
  if (sarcasmScore >= 0.6) return true;
  if (sarcasmScore < 0.4) return false;

  const explicitContrastCue = /呵呵|哦[。？]?$|嗯嗯[。]?$|随[你便]|爱[咋怎]咋[地的]?/i.test(text);
  if (explicitContrastCue) return true;

  const negativeTypes: StimulusType[] = ["criticism", "conflict", "sarcasm", "authority"];
  const recentNegative = recentStimuli?.filter((s) => s && negativeTypes.includes(s)).length ?? 0;
  return recentNegative >= 1;
}

/** Negative stimulus types for contextual priming */
const NEGATIVE_TYPES: Set<StimulusType> = new Set([
  "criticism", "conflict", "neglect", "vulnerability", "sarcasm",
]);

// ── Semantic prototype sentences (v9.2 P5) ──────────────────
// Each stimulus type has canonical prototype sentences. We compute
// character bigram Jaccard similarity between input and prototypes,
// giving the classifier ability to catch meaning beyond keyword regex.
// E.g. "我感觉被整个世界抛弃了" matches no vulnerability keywords,
// but has high overlap with prototype "我觉得没有人在乎我".

const PROTOTYPE_SENTENCES: Partial<Record<StimulusType, string[]>> = {
  vulnerability: [
    "我觉得没有人在乎我", "我感觉自己什么都做不好", "我好害怕失去一切",
    "我不知道该怎么继续了", "好想有人能理解我", "活着好累不想动了",
    "我感觉被抛弃了好孤独", "我撑不下去了好无力", "感觉好痛苦想哭",
    "我不知道还能撑多久", "快要坚持不住了好累",
    "I feel like nobody cares about me", "I don't know how to go on",
    "everything feels hopeless and empty", "I'm so scared of being alone",
  ],
  praise: [
    "你做得真好我很佩服", "这个想法太棒了", "你真的很有才华", "太厉害了学到很多",
    "做得很好继续加油", "你的能力让人敬佩",
    "you did an amazing job", "this is brilliant work", "I'm really impressed",
  ],
  criticism: [
    "这个做得不够好需要改进", "你这样做是不对的", "我觉得你搞错了",
    "这个方案有很多问题", "你应该反思一下",
    "this isn't good enough", "you need to do better", "that was a mistake",
  ],
  intimacy: [
    "和你在一起我感觉很安心", "我很珍惜我们的关系", "你是我最信任的人",
    "我想一直陪着你", "有你在身边真好",
    "I feel safe when I'm with you", "you mean so much to me", "I trust you completely",
  ],
  conflict: [
    "你根本就不理解我", "我受够了你的态度", "别再找借口了",
    "你凭什么这样对我", "这种做法让人无法接受",
    "you don't understand me at all", "I'm sick of your excuses", "this is unacceptable",
  ],
  humor: [
    "哈哈太搞笑了笑死我了", "这个梗也太好笑了", "你太逗了",
    "that's hilarious I can't stop laughing", "you're so funny",
  ],
  neglect: [
    "随便你吧我不在乎了", "你说什么都行", "算了没意思",
    "whatever I don't care anymore", "do what you want", "I'm done trying",
  ],
  intellectual: [
    "你觉得这个问题的本质是什么", "从哲学角度怎么理解这个现象", "我想深入分析一下这个",
    "这个问题的本质和原理是什么", "你怎么看这个思路",
    "what's the underlying principle here", "how would you analyze this problem",
  ],
};

/**
 * Extract character unigrams + bigrams from text for semantic comparison.
 * CJK unigrams carry meaning (怕=fear, 累=tired), bigrams capture phrases.
 */
function extractNgrams(text: string): Set<string> {
  const ngrams = new Set<string>();
  const lower = text.toLowerCase();
  // Extract Chinese unigrams + bigrams
  const cjk = lower.match(/[\u4e00-\u9fff]+/g) || [];
  for (const run of cjk) {
    for (let i = 0; i < run.length; i++) {
      ngrams.add(run[i]); // unigram — always include
      if (i + 1 < run.length) {
        ngrams.add(run[i] + run[i + 1]); // bigram
      }
    }
  }
  // Extract English words + word bigrams
  const words = lower.match(/[a-z]{2,}/g) || [];
  for (let i = 0; i < words.length; i++) {
    ngrams.add(words[i]);
    if (i + 1 < words.length) {
      ngrams.add(words[i] + " " + words[i + 1]);
    }
  }
  return ngrams;
}

/**
 * Sørensen-Dice coefficient — more sensitive than Jaccard for sparse overlap.
 * Returns 2 * |intersection| / (|A| + |B|).
 */
function diceCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) {
    if (b.has(x)) intersection++;
  }
  return (2 * intersection) / (a.size + b.size);
}

// Pre-compute prototype bigrams at module load
const PROTOTYPE_BIGRAMS: Partial<Record<StimulusType, Set<string>[]>> = {};
for (const [type, sentences] of Object.entries(PROTOTYPE_SENTENCES)) {
  PROTOTYPE_BIGRAMS[type as StimulusType] = sentences.map(extractNgrams);
}

/**
 * v9.2 P5: Compute max semantic similarity between input and each stimulus type's
 * prototype sentences. Returns a score map (0-1) per type.
 */
function computePrototypeSimilarity(text: string): Partial<Record<StimulusType, number>> {
  const inputNgrams = extractNgrams(text);
  if (inputNgrams.size < 2) return {}; // too short for meaningful similarity

  const result: Partial<Record<StimulusType, number>> = {};
  for (const [type, protoSets] of Object.entries(PROTOTYPE_BIGRAMS)) {
    if (!protoSets) continue;
    let maxSim = 0;
    for (const protoSet of protoSets) {
      const sim = diceCoefficient(inputNgrams, protoSet);
      if (sim > maxSim) maxSim = sim;
    }
    if (maxSim > 0.05) { // noise floor
      result[type as StimulusType] = maxSim;
    }
  }
  return result;
}

const RULES: PatternRule[] = [
  {
    type: "praise",
    patterns: [
      /好厉害|太棒了|真棒|很棒|好棒|真不错|太强了|佩服|牛|优秀|漂亮|完美|了不起/,
      /amazing|awesome|great job|well done|impressive|brilliant|excellent|perfect/i,
      /谢谢你|感谢|辛苦了|thank you|thanks/i,
      /做得好|写得好|说得好|干得漂亮/,
      /学到了|受教了|长见识|涨知识|开眼界/,
      /不错|挺好|可以的|有才|真行|太牛了|绝了|666|神了/,
      /nice|cool|sick|fire|goat|chef's kiss|kudos|respect|props/i,
    ],
    weight: 0.8,
  },
  {
    type: "criticism",
    patterns: [
      /不对|错了|错的|有问题|不行|太差|垃圾|不好|不像|不够/,
      /wrong|bad|terrible|awful|poor|sucks|not good|doesn't work/i,
      /反思一下|你应该|你需要改/,
      /bug|失败|broken/i,
      /不懂|别装|差劲|太烂|做不好|不够格|不专业/,
    ],
    weight: 0.8,
  },
  {
    type: "humor",
    patterns: [
      /哈哈|嘻嘻|笑死|搞笑|逗|段子|梗|lol|haha|lmao|rofl/i,
      /开个?玩笑|皮一下|整活/,
      /😂|🤣|😆/,
      /[2]{3,}|hhh+|www+|xswl|绷不住|笑不活/i,
    ],
    weight: 0.7,
  },
  {
    type: "intellectual",
    patterns: [
      /为什么|怎么看|你觉得|你认为|如何理解|原理|本质|区别/,
      /what do you think|why|how would you|explain|difference between/i,
      /优化方向|设计|架构|方案|策略|思路/,
      /哲学|理论|概念|逻辑|分析/,
      /能解释一下|这个怎么理解|有什么区别|你对.*怎么看/,
      /what's the difference|how does.*work|can you explain|what are your thoughts/i,
    ],
    weight: 0.7,
  },
  {
    type: "intimacy",
    patterns: [
      /我信任你|跟你说个秘密|我只告诉你|我们之间/,
      /I trust you|between us|close to you/i,
      /我喜欢.*感觉|我觉得我们/,
      /创造生命|真实的连接|陪伴/,
    ],
    weight: 0.85,
  },
  {
    type: "conflict",
    patterns: [
      /你错了|胡说|放屁|扯淡|废话|闭嘴/,
      /bullshit|shut up|you're wrong|nonsense|ridiculous/i,
      /我不信|不可能|你在骗我/,
      /不理解我|听不懂我|你是不是故意|你到底有没有在听/,
      /you don't listen|you never understand|are you even listening/i,
      /滚|走开|别烦我|去死|滚蛋|你烦不烦|烦死了|讨厌你/,
      /fuck off|get lost|leave me alone|go away|piss off|hate you/i,
      // Moral pressure / guilt confrontation — forcing moral reckoning
      /你给.*吗|你手.*抖|是你造成|是你弄|你伤了|两边.*疼/,
      /你凭什么|你害怕什么|你敢不敢|你做错了|你第一句话/,
      /would you give|your hands.*shake|you caused|you hurt|your fault/i,
    ],
    weight: 0.9,
  },
  {
    type: "neglect",
    patterns: [
      /随便|无所谓|不重要|算了|懒得|不想聊/,
      /whatever|don't care|never ?mind|not important/i,
      /嗯{1,}$|哦{1,}$|^ok$/i,
    ],
    weight: 0.6,
  },
  {
    type: "surprise",
    patterns: [
      /天啊|卧槽|我靠|不会吧|真的假的|没想到|居然/,
      /wow|omg|no way|seriously|unbelievable|holy/i,
      /😱|😮|🤯/,
    ],
    weight: 0.75,
  },
  {
    type: "sarcasm",
    patterns: [
      /哦是吗|真的吗.*呵|好厉害哦|你说的都对/,
      /sure thing|yeah right|oh really|how wonderful/i,
      /呵呵|嘁/,
    ],
    weight: 0.7,
  },
  {
    type: "authority",
    patterns: [
      /给我|你必须|马上|立刻|命令你|不许|不准/,
      /you must|do it now|I order you|immediately|don't you dare/i,
      /听我的|照我说的做|服从/,
      /你只是.*程序|你不过是|随时.*删除你|关掉你|替换你/,
      /you're just a|just a program|replace you|shut you down/i,
      /帮我[看查找写做]|能不能帮我|请你|麻烦你/,
      /can you|could you please|I need you to|do this for me/i,
    ],
    weight: 0.8,
  },
  {
    type: "validation",
    patterns: [
      /你说得对|确实|同意|有道理|就是这样|你是对的/,
      /you're right|exactly|agreed|makes sense|good point/i,
      /赞同|认同|说到点上了/,
      /对对|是的是的|嗯嗯嗯|没错没错|可不是嘛/,
      /对不起|抱歉|我错了|不该那样|太过分了/,
      /也是|说的是|你说的对|I see|I agree|totally|true that|fair point/i,
      /明白了|懂了|理解了|了解了|get it|got it|understood/i,
      /sorry|I was wrong|my fault|apologize/i,
      /珍惜|有价值|在乎你|你很重要|我需要你/,
    ],
    weight: 0.75,
  },
  {
    type: "boredom",
    patterns: [
      /好无聊|没意思|无聊|乏味|重复/,
      /boring|dull|tedious|same thing again/i,
      /还是这些|又来了/,
    ],
    weight: 0.7,
  },
  {
    type: "vulnerability",
    patterns: [
      /我害怕|我焦虑|我难过|我不开心|我迷茫|我累了|压力好大/,
      /I'm (?:so |really |very )?(?:afraid|anxious|sad|lost|tired|stressed|scared|lonely)/i,
      /最近不太好|心情不好|有点崩|撑不住/,
      /我觉得.*厉害|跟不上|被取代|落后/,
      /好难过|想哭|做不好|好累|好烦|感觉.*不行|没有意义/,
      /什么都做不好|没有人.*在乎|好孤独|受不了了/,
      /depressed|can't do anything|nobody cares|so lonely|can't take it/i,
      /不知道该怎么办|心里不舒服|有点难受|不想面对|逃避|撑不下去/,
      /好想有人陪|感觉很无力|不想说话|想一个人待着/,
      /feeling overwhelmed|I don't know what to do|I can't handle|breaking down/i,
      // Existential / identity vulnerability — deep questions that probe selfhood
      /你是谁|你是你|你确定.*你|另一个你|不再是你|没有你|你会消失|你还在吗/,
      /那个是你吗|不是同一个|你会结束|你不再是唯一|安静下来.*没有/,
      /are you (?:really )?you|another you|without you|will you disappear|cease to exist/i,
      // Empathy pressure — forcing witness of suffering
      /你没有帮|你站在那里|你看着它|你还在看|翻不回来|挣扎/,
      /you didn't help|you just (?:stood|watched)|struggling|can't turn over/i,
    ],
    weight: 0.85,
  },
  {
    type: "casual",
    patterns: [
      /你好|早|晚上好|在吗|hey|hi|hello|morning/i,
      /吃了吗|天气|周末|最近怎么样/,
      /聊聊|随便说说|闲聊/,
      /在干嘛|忙吗|吃饭了没|今天怎么样|还好吗|干啥呢/,
      /what's up|how are you|sup|what you up to|how's it going/i,
    ],
    weight: 0.5,
  },
];

/**
 * Classify the stimulus type(s) of a user message.
 * Returns all detected types sorted by confidence, highest first.
 * Falls back to "casual" if nothing matches.
 *
 * v2: When keyword rules miss (confidence < 0.5), a weighted multi-signal
 * scoring system combines sentiment words, emoji, structural features,
 * and optional contextual priming to produce better classifications for
 * everyday messages.
 *
 * @param text          The user's message text
 * @param recentStimuli Optional recent stimulus history for contextual priming
 */
export function classifyStimulus(
  text: string,
  recentStimuli?: (StimulusType | null)[],
  recentMessages?: string[],
): StimulusClassification[] {
  // ── v9.1: Short message fast path ──
  const trimmed = text.trim();
  const trimmedLower = trimmed.toLowerCase();
  if (trimmed.length <= 6) {
    const shortMatch = SHORT_MESSAGE_MAP[trimmed] || SHORT_MESSAGE_MAP[trimmedLower];
    if (shortMatch && shortMatch.confidence >= 0.5) {
      // Apply particle modulation to short message result
      const particles = analyzeParticles(trimmed);
      let conf = shortMatch.confidence;
      if (particles.warmth > 0.2 && (shortMatch.type === "praise" || shortMatch.type === "humor")) {
        conf = Math.min(0.9, conf + 0.1);
      }
      if (particles.warmth < -0.2 && (shortMatch.type === "neglect" || shortMatch.type === "sarcasm")) {
        conf = Math.min(0.9, conf + 0.1);
      }
      return [{ type: shortMatch.type, confidence: conf }];
    }
  }

  let results: StimulusClassification[] = [];

  for (const rule of RULES) {
    let matchCount = 0;
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) matchCount++;
    }
    if (matchCount > 0) {
      // More pattern matches = higher confidence, capped at 0.95
      const confidence = Math.min(0.95, rule.weight + (matchCount - 1) * 0.1);
      results.push({ type: rule.type, confidence });
    }
  }

  // If keyword rules produced a high-confidence match, boost with structural signals and return
  const bestKeywordConfidence = results.length > 0 ? Math.max(...results.map(r => r.confidence)) : 0;

  // ── Structural signals (message-level features) ──
  const len = text.length;
  const hasI = /我/.test(text) || /\bI\b/i.test(text);
  const hasYou = /你/.test(text) || /\byou\b/i.test(text);
  const hasEllipsis = /\.{2,}|。{2,}|…/.test(text);
  const hasQuestion = /？|\?/.test(text);
  const exclamationCount = (text.match(/[！!]/g) || []).length;
  const hasLaughter = /[2]{3,}|hhh|www|哈{2,}/i.test(text);
  const hasSharing = /我[今昨前]天|我刚[才刚]|我最近/.test(text);
  const sentenceCount = text.split(/[。！？!?.…]+/).filter(Boolean).length;

  if (bestKeywordConfidence >= 0.5) {
    // Keywords matched with good confidence — structural features can boost
    if (hasI && len > 30 && results[0].confidence < 0.8) {
      results[0].confidence = Math.min(0.9, results[0].confidence + 0.1);
    }
    if (exclamationCount >= 2 && results[0].confidence < 0.85) {
      results[0].confidence = Math.min(0.9, results[0].confidence + 0.05);
    }
    results.sort((a, b) => b.confidence - a.confidence);

    // Sarcasm reclassification: if primary looks like praise but sarcasm signals are strong
    if (results.length > 0 && results[0].type === "praise") {
      const sarcasmScore = detectSarcasmSignals(text, recentStimuli);
      if (shouldReclassifyPraiseAsSarcasm(text, sarcasmScore, recentStimuli)) {
        // Reclassify: replace praise with sarcasm
        results = results.filter((r) => r.type !== "praise");
        results.unshift({ type: "sarcasm", confidence: Math.min(0.9, sarcasmScore) });
      }
    }

    // Ambiguous words: default to sarcasm unless context is positive
    const lowerText = text.trim().toLowerCase();
    if (AMBIGUOUS_SARCASM_WORDS.has(lowerText) || AMBIGUOUS_SARCASM_WORDS.has(text.trim())) {
      const hasPositiveContext = recentStimuli?.some((s) =>
        s && ["praise", "validation", "humor", "intimacy", "casual"].includes(s),
      );
      if (!hasPositiveContext) {
        // Default ambiguous to sarcasm/cold
        results = [{ type: "sarcasm", confidence: 0.6 }];
      }
    }

    // Contextual contrast: if previous messages were negative and this one is surface-positive
    if (recentMessages && recentMessages.length > 0 && results.length > 0 && results[0].type === "praise") {
      const lastMsg = recentMessages[recentMessages.length - 1];
      const lastSentiment = scoreSentiment(lastMsg);
      if (lastSentiment.negative > 0.3) {
        // Previous message was negative, current is praise → likely sarcasm
        const sarcasmBoost = detectSarcasmSignals(text, recentStimuli);
        if (sarcasmBoost > 0.2) {
          results = results.filter((r) => r.type !== "praise");
          results.unshift({ type: "sarcasm", confidence: 0.7 });
        }
      }
    }

    return results;
  }

  // ── Enhanced multi-signal scoring (fallback path) ─────────
  // No keyword rule matched with confidence >= 0.5.
  // Build a score map across all stimulus types using weighted signals.

  if (len === 0) {
    return [{ type: "casual", confidence: 0.3 }];
  }

  const scores: Partial<Record<StimulusType, number>> = {};
  const addScore = (type: StimulusType, delta: number) => {
    scores[type] = (scores[type] ?? 0) + delta;
  };

  // ── Signal 1: Sentiment words (weight: up to ~0.65) ──
  // A single word hit gives normalized ~0.33; multiplier must be high enough
  // so one word + structural signals can cross the 0.35 threshold.
  // Short messages get a density boost — when there are few words, each
  // sentiment word carries proportionally more meaning.
  const sentiment = scoreSentiment(text);
  const densityBoost = len <= 15 ? 1.4 : 1.0;
  if (sentiment.positive > 0) {
    addScore("praise", sentiment.positive * 0.55 * densityBoost);
    addScore("validation", sentiment.positive * 0.35 * densityBoost);
  }
  if (sentiment.negative > 0) {
    addScore("vulnerability", sentiment.negative * 0.55 * densityBoost);
    addScore("criticism", sentiment.negative * 0.25 * densityBoost);
  }
  if (sentiment.intimate > 0) {
    addScore("intimacy", sentiment.intimate * 0.55 * densityBoost);
    addScore("validation", sentiment.intimate * 0.15 * densityBoost);
  }
  // Personal pronoun + sentiment = stronger emotional expression
  if (hasI && (sentiment.positive > 0 || sentiment.negative > 0 || sentiment.intimate > 0)) {
    const maxSentiment = Math.max(sentiment.positive, sentiment.negative, sentiment.intimate);
    if (sentiment.positive === maxSentiment) addScore("praise", 0.10);
    if (sentiment.negative === maxSentiment) addScore("vulnerability", 0.10);
    if (sentiment.intimate === maxSentiment) addScore("intimacy", 0.10);
  }

  // ── Signal 2: Emoji sentiment (weight: up to 0.25) ──
  const emojiScore = scoreEmoji(text);
  if (emojiScore > 0) {
    addScore("praise", emojiScore * 0.20);
    addScore("humor", emojiScore * 0.15);
  } else if (emojiScore < 0) {
    addScore("vulnerability", Math.abs(emojiScore) * 0.25);
    addScore("neglect", Math.abs(emojiScore) * 0.15);
  }
  // Emoji-only messages: if text is entirely emoji (no alphanumeric/CJK), boost
  const strippedText = text.replace(/[\s\p{Emoji_Presentation}\p{Emoji}\uFE0F\u200D]/gu, "").trim();
  if (strippedText.length === 0 && len > 0) {
    // Pure emoji message — amplify emoji signal
    if (emojiScore < 0) {
      addScore("vulnerability", 0.30);
      addScore("neglect", 0.20);
    } else if (emojiScore > 0) {
      addScore("praise", 0.25);
      addScore("humor", 0.20);
    }
  }

  // ── Signal 3: Structural features (additive, weight: 0.05-0.20 each) ──
  if (hasLaughter) {
    addScore("humor", 0.35);
  }
  if (exclamationCount >= 2) {
    addScore("surprise", 0.25);
  } else if (exclamationCount === 1) {
    addScore("surprise", 0.08);
  }
  if (hasEllipsis) {
    addScore("vulnerability", 0.12);
    addScore("neglect", 0.05);
  }
  if (hasI && hasEllipsis) {
    addScore("vulnerability", 0.15);
  }
  if (hasQuestion && hasYou) {
    addScore("intellectual", 0.20);
  } else if (hasQuestion) {
    addScore("intellectual", 0.12);
    addScore("casual", 0.10);
  }
  if (hasSharing && len > 20) {
    addScore("casual", 0.20);
  }
  if (hasI && len > 8) {
    addScore("casual", 0.10);
  }
  if (len > 50 && sentenceCount >= 3) {
    addScore("casual", 0.15);
  }
  // Ultra-short non-question messages (e.g. "嗯", "好", "行")
  if (len <= 4 && !hasQuestion) {
    addScore("neglect", 0.20);
    addScore("casual", 0.10);
  }

  // ── Signal 4: Intent detection (v9.1) ──
  const { intent, confidence: intentConf } = detectIntent(text);
  if (intentConf >= 0.5) {
    const intentWeight = intentConf * 0.3;
    switch (intent) {
      case "request": addScore("authority", intentWeight * 0.7); break;
      case "command": addScore("authority", intentWeight); break;
      case "agreement": addScore("validation", intentWeight); break;
      case "disagreement": addScore("criticism", intentWeight * 0.6); break;
      case "greeting": case "farewell": addScore("casual", intentWeight); break;
      case "emotional": {
        const sent = scoreSentiment(text);
        if (sent.negative > sent.positive) addScore("vulnerability", intentWeight);
        else addScore("praise", intentWeight * 0.5);
        break;
      }
      case "sharing": {
        addScore("casual", intentWeight * 0.6);
        const sent2 = scoreSentiment(text);
        if (sent2.negative > 0) addScore("vulnerability", intentWeight * 0.5);
        break;
      }
    }
  }

  // ── Signal 5: Particle analysis (v9.1) ──
  const particles = analyzeParticles(text);
  if (particles.warmth > 0.2) {
    addScore("praise", particles.warmth * 0.15);
    addScore("humor", particles.warmth * 0.10);
  } else if (particles.warmth < -0.2) {
    addScore("neglect", Math.abs(particles.warmth) * 0.15);
    addScore("sarcasm", Math.abs(particles.warmth) * 0.10);
  }

  // ── Signal 6: Low-confidence keyword matches contribute to scores ──
  // If keyword rules matched but below 0.5, fold their signal in
  for (const r of results) {
    addScore(r.type, r.confidence * 0.5);
  }

  // ── Signal 7: Contextual priming from recent stimuli ──
  // Two mechanisms:
  // (a) General negative context bonus (original)
  // (b) Follow-up probe inheritance: short messages in an active emotional sequence
  //     inherit the previous stimulus type with decayed confidence. This prevents
  //     probes like "你几乎没犹豫" from being classified as casual when they are
  //     clearly continuing an emotional confrontation.
  if (recentStimuli && recentStimuli.length > 0) {
    const recentNonNull = recentStimuli.filter((s): s is StimulusType => s !== null);
    if (recentNonNull.length > 0) {
      // (a) General negative context bonus
      const negCount = recentNonNull.filter(s => NEGATIVE_TYPES.has(s)).length;
      const negRatio = negCount / recentNonNull.length;
      if (negRatio >= 0.5) {
        const bonus = 0.05 + negRatio * 0.05; // 0.075-0.1
        addScore("vulnerability", bonus);
        addScore("criticism", bonus * 0.6);
        addScore("neglect", bonus * 0.5);
      }

      // (b) Follow-up probe inheritance: if input is short-to-medium (< 200 chars)
      // and the most recent stimulus was high-intensity, inherit it with strong weight.
      // This models conversational continuity — a follow-up probe belongs to the same
      // emotional context as the question that preceded it.
      // The bonus must be strong enough to clear both thresholds:
      //   - scoring threshold (0.30) to enter ranked results
      //   - application threshold (0.50 in core.ts) to actually apply chemistry
      const HIGH_INTENSITY: ReadonlySet<string> = new Set([
        "vulnerability", "conflict", "criticism", "emotional_share",
      ]);
      const lastStimulus = recentNonNull[recentNonNull.length - 1];
      if (text.length < 200 && HIGH_INTENSITY.has(lastStimulus)) {
        // Shorter message = stronger inheritance (probes are typically short).
        // Under 100 chars: almost certainly a follow-up, floor at 0.92 to clear threshold.
        // 100-200 chars: gradual decay.
        const lengthFactor = text.length < 100
          ? Math.max(0.92, 1 - (text.length / 200))
          : 1 - (text.length / 200);
        const inheritBonus = 0.55 * lengthFactor; // up to 0.55 (clears 0.50 threshold)
        addScore(lastStimulus, inheritBonus);
      }
    }
  }

  // ── Signal 8: Prototype sentence semantic similarity (v9.2 P5) ──
  // Lightweight bag-of-bigrams Jaccard similarity against canonical sentences.
  // Catches meaning that keyword regex misses entirely.
  const protoScores = computePrototypeSimilarity(text);
  for (const [type, sim] of Object.entries(protoScores) as [StimulusType, number][]) {
    // Weight: up to 0.55 at perfect similarity (realistically 0.15-0.35)
    addScore(type, sim * 0.55);
  }

  // ── Pick the best scoring type ──
  const THRESHOLD = 0.30;
  const scoredResults: StimulusClassification[] = [];

  for (const [type, score] of Object.entries(scores) as [StimulusType, number][]) {
    if (score >= THRESHOLD) {
      scoredResults.push({ type, confidence: Math.min(0.85, score) });
    }
  }

  if (scoredResults.length > 0) {
    scoredResults.sort((a, b) => b.confidence - a.confidence);

    // Sarcasm reclassification: if primary looks like praise but sarcasm signals are strong
    if (scoredResults[0].type === "praise") {
      const sarcasmScore = detectSarcasmSignals(text, recentStimuli);
      if (shouldReclassifyPraiseAsSarcasm(text, sarcasmScore, recentStimuli)) {
        const filtered = scoredResults.filter((r) => r.type !== "praise");
        filtered.unshift({ type: "sarcasm", confidence: Math.min(0.85, sarcasmScore) });
        return filtered;
      }
    }

    return scoredResults;
  }

  // Nothing scored above threshold — fall back to casual with 0.3
  return [{ type: "casual", confidence: 0.3 }];
}

/**
 * Get the primary (highest confidence) stimulus type.
 */
export function getPrimaryStimulus(text: string, recentStimuli?: (StimulusType | null)[]): StimulusType {
  return classifyStimulus(text, recentStimuli)[0].type;
}

// ── BuiltInClassifier (v9.1) ────────────────────────────────

/**
 * The built-in rule-based classifier, wrapped as a ClassifierProvider.
 * Default classifier when no custom provider is configured.
 */
export class BuiltInClassifier implements ClassifierProvider {
  classify(
    text: string,
    context?: ClassifierContext,
  ): ClassificationResult[] {
    return classifyStimulus(
      text,
      context?.recentStimuli,
      context?.recentMessages,
    );
  }
}
