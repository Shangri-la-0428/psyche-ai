// ============================================================
// Stimulus Classifier — Detect stimulus type from user input
//
// Closes the loop: instead of asking the LLM to self-classify,
// we pre-classify the user's message and pre-compute chemistry.
// ============================================================

import type { StimulusType } from "./types.js";

export interface StimulusClassification {
  type: StimulusType;
  confidence: number; // 0-1
}

interface PatternRule {
  type: StimulusType;
  patterns: RegExp[];
  weight: number; // base confidence when matched
}

const RULES: PatternRule[] = [
  {
    type: "praise",
    patterns: [
      /好厉害|太棒了|真棒|很棒|好棒|真不错|太强了|佩服|牛|优秀|漂亮|完美|了不起/,
      /amazing|awesome|great job|well done|impressive|brilliant|excellent|perfect/i,
      /谢谢你|感谢|辛苦了|thank you|thanks/i,
      /做得好|写得好|说得好|干得漂亮/,
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
      /滚|走开|别烦我|去死|滚蛋|你烦不烦|烦死了|讨厌你/,
      /fuck off|get lost|leave me alone|go away|piss off|hate you/i,
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
    ],
    weight: 0.85,
  },
  {
    type: "casual",
    patterns: [
      /你好|早|晚上好|在吗|hey|hi|hello|morning/i,
      /吃了吗|天气|周末|最近怎么样/,
      /聊聊|随便说说|闲聊/,
    ],
    weight: 0.5,
  },
];

/**
 * Classify the stimulus type(s) of a user message.
 * Returns all detected types sorted by confidence, highest first.
 * Falls back to "casual" if nothing matches.
 */
export function classifyStimulus(text: string): StimulusClassification[] {
  const results: StimulusClassification[] = [];

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

  // ── Structural signals (message-level features) ──
  // When keywords miss, message shape still carries meaning.
  const len = text.length;
  const hasI = /我/.test(text) || /\bI\b/i.test(text);
  const hasYou = /你/.test(text) || /\byou\b/i.test(text);
  const hasEllipsis = /\.{2,}|。{2,}|…/.test(text);
  const hasQuestion = /？|\?/.test(text);
  const exclamationCount = (text.match(/[！!]/g) || []).length;
  const hasLaughter = /[2]{3,}|hhh|www|哈{2,}/i.test(text);
  const hasSharing = /我[今昨前]天|我刚[才刚]|我最近/.test(text);
  const sentenceCount = text.split(/[。！？!?.…]+/).filter(Boolean).length;

  if (results.length === 0) {
    // No keyword matched — use structural fallback
    if (len === 0) {
      // Empty input — neutral
      results.push({ type: "casual", confidence: 0.3 });
    } else if (hasLaughter) {
      // Internet laughter not caught by keywords (e.g. 233333)
      results.push({ type: "humor", confidence: 0.65 });
    } else if (exclamationCount >= 2) {
      // Emphatic expression → surprise/excitement
      results.push({ type: "surprise", confidence: 0.55 });
    } else if (len <= 4 && !hasQuestion) {
      // Ultra-short non-question: "好" "行" "哦" — neglect-like
      results.push({ type: "neglect", confidence: 0.45 });
    } else if (hasI && hasEllipsis) {
      // Personal + trailing off: "我觉得...有点难" — vulnerability
      results.push({ type: "vulnerability", confidence: 0.55 });
    } else if (hasSharing && len > 20) {
      // Sharing personal experience — higher engagement signal
      results.push({ type: "casual", confidence: 0.65 });
    } else if (hasI && len > 8) {
      // Personal sharing (any meaningful length) — engagement signal
      results.push({ type: "casual", confidence: 0.55 });
    } else if (hasQuestion && hasYou) {
      // Asking about the agent specifically → intellectual curiosity
      results.push({ type: "intellectual", confidence: 0.5 });
    } else if (hasQuestion) {
      // Any question — intellectual curiosity or casual
      results.push({ type: "casual", confidence: 0.55 });
    } else if (len > 50 && sentenceCount >= 3) {
      // Long multi-sentence without keywords → engaged storytelling
      results.push({ type: "casual", confidence: 0.6 });
    } else {
      results.push({ type: "casual", confidence: 0.3 });
    }
  } else {
    // Keywords matched — structural features can boost confidence
    if (hasI && len > 30 && results[0].confidence < 0.8) {
      // Long personal message boosts the primary match slightly
      results[0].confidence = Math.min(0.9, results[0].confidence + 0.1);
    }
    if (exclamationCount >= 2 && results[0].confidence < 0.85) {
      // Emphasis boosts conviction
      results[0].confidence = Math.min(0.9, results[0].confidence + 0.05);
    }
  }

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);

  return results;
}

/**
 * Get the primary (highest confidence) stimulus type.
 */
export function getPrimaryStimulus(text: string): StimulusType {
  return classifyStimulus(text)[0].type;
}
