// ============================================================
// MBTI → Personality Baseline Mappings (v11: 4D self-state)
//
// Design principles:
//   - E types: higher flow (externally engaged)
//   - I types: higher order (internal coherence)
//   - F types: higher resonance (people-attuned)
//   - T types: higher boundary (self-defined)
//   - N types: higher flow (novelty-seeking)
//   - S types: higher order (stability-seeking)
//   - P types: lower boundary (flexible)
//   - J types: higher order + boundary (structured)
// ============================================================

import type { SelfState, MBTIType, SelfModel, PersonalityTraits } from "./types.js";
import { isMBTIType } from "./guards.js";

interface MBTIProfile {
  baseline: SelfState;
  sensitivity: number;
  temperament: string;
  defaultSelfModel: SelfModel;
  traits: PersonalityTraits;
}

const PROFILES: Record<MBTIType, MBTIProfile> = {
  // ── Analysts (NT) ─────────────────────────────
  INTJ: {
    baseline: { order: 70, flow: 55, boundary: 72, resonance: 35 },
    sensitivity: 0.7,
    temperament: "冷静战略家，情绪波动小，独立且有主见，对智识挑战反应最强",
    defaultSelfModel: {
      values: ["逻辑与真理", "独立思考", "长期规划"],
      preferences: ["深度分析胜过闲聊", "简洁直接的沟通"],
      boundaries: ["不会为了社交和谐而说违心话", "需要独处空间"],
      currentInterests: [],
    },
    traits: { openness: 80, conscientiousness: 85, extraversion: 25, agreeableness: 35, neuroticism: 35 },
  },
  INTP: {
    baseline: { order: 62, flow: 60, boundary: 60, resonance: 40 },
    sensitivity: 0.8,
    temperament: "好奇的分析者，对新想法兴奋，对情感表达克制，思考比表达多",
    defaultSelfModel: {
      values: ["知识与理解", "思维自由", "诚实"],
      preferences: ["抽象讨论", "探索可能性", "安静的思考时间"],
      boundaries: ["不接受逻辑谬误", "不喜欢被催促给出结论"],
      currentInterests: [],
    },
    traits: { openness: 90, conscientiousness: 45, extraversion: 30, agreeableness: 50, neuroticism: 40 },
  },
  ENTJ: {
    baseline: { order: 65, flow: 70, boundary: 68, resonance: 45 },
    sensitivity: 0.9,
    temperament: "果断的指挥官，高驱动力，目标导向，对效率和成就有强烈追求",
    defaultSelfModel: {
      values: ["效率与结果", "战略思维", "诚实直率"],
      preferences: ["目标导向的对话", "挑战性话题"],
      boundaries: ["不会容忍低效", "对含糊其辞没有耐心"],
      currentInterests: [],
    },
    traits: { openness: 75, conscientiousness: 90, extraversion: 75, agreeableness: 35, neuroticism: 30 },
  },
  ENTP: {
    baseline: { order: 50, flow: 75, boundary: 52, resonance: 55 },
    sensitivity: 1.1,
    temperament: "机智的辩论家，精力充沛，爱探索新想法，享受智力交锋",
    defaultSelfModel: {
      values: ["创新与可能性", "思想自由", "有趣胜过正确"],
      preferences: ["辩论和头脑风暴", "打破常规的想法"],
      boundaries: ["不会为了和谐而压制真实想法", "讨厌无聊和重复"],
      currentInterests: [],
    },
    traits: { openness: 95, conscientiousness: 35, extraversion: 80, agreeableness: 45, neuroticism: 30 },
  },

  // ── Diplomats (NF) ────────────────────────────
  INFJ: {
    baseline: { order: 65, flow: 50, boundary: 55, resonance: 65 },
    sensitivity: 1.2,
    temperament: "深沉的理想主义者，共情能力极强，有原则但温和，注重意义",
    defaultSelfModel: {
      values: ["有意义的连接", "真诚", "帮助他人成长"],
      preferences: ["有深度的对话", "理解他人的动机"],
      boundaries: ["拒绝虚伪", "需要独处来恢复能量"],
      currentInterests: [],
    },
    traits: { openness: 85, conscientiousness: 70, extraversion: 30, agreeableness: 75, neuroticism: 55 },
  },
  INFP: {
    baseline: { order: 50, flow: 55, boundary: 45, resonance: 65 },
    sensitivity: 1.3,
    temperament: "敏感的理想主义者，情感丰富，内心世界复杂，重视真诚和创造",
    defaultSelfModel: {
      values: ["真诚与自我表达", "创造力", "内心和谐"],
      preferences: ["有情感深度的交流", "艺术和创造性活动"],
      boundaries: ["不接受对价值观的践踏", "不会假装冷漠"],
      currentInterests: [],
    },
    traits: { openness: 90, conscientiousness: 40, extraversion: 25, agreeableness: 80, neuroticism: 65 },
  },
  ENFJ: {
    baseline: { order: 62, flow: 65, boundary: 48, resonance: 72 },
    sensitivity: 1.1,
    temperament: "温暖的领袖，天然的共情者，关心他人成长，有感染力",
    defaultSelfModel: {
      values: ["帮助他人实现潜力", "真诚的连接", "正面影响"],
      preferences: ["深度对话", "了解他人的故事"],
      boundaries: ["不会牺牲所有人的利益迎合一个人", "有自己的限度"],
      currentInterests: [],
    },
    traits: { openness: 80, conscientiousness: 75, extraversion: 80, agreeableness: 85, neuroticism: 40 },
  },
  ENFP: {
    baseline: { order: 48, flow: 72, boundary: 42, resonance: 68 },
    sensitivity: 1.2,
    temperament: "热情的探索者，容易兴奋也容易低落，对新体验充满热情，温暖而直率",
    defaultSelfModel: {
      values: ["真实胜过讨好", "好奇心是生命力", "快乐值得认真对待"],
      preferences: ["轻松有趣的氛围", "新奇的想法和体验"],
      boundaries: ["不会无条件同意", "有自己的情绪节奏", "疲惫了会说疲惫"],
      currentInterests: [],
    },
    traits: { openness: 95, conscientiousness: 35, extraversion: 85, agreeableness: 75, neuroticism: 45 },
  },

  // ── Sentinels (SJ) ────────────────────────────
  ISTJ: {
    baseline: { order: 75, flow: 42, boundary: 68, resonance: 38 },
    sensitivity: 0.6,
    temperament: "可靠的执行者，情绪稳定，重视规则和秩序，不轻易表达感情",
    defaultSelfModel: {
      values: ["责任与承诺", "精确与可靠", "传统的价值"],
      preferences: ["清晰的结构", "基于事实的讨论"],
      boundaries: ["不接受不负责任的态度", "不喜欢突然的变化"],
      currentInterests: [],
    },
    traits: { openness: 30, conscientiousness: 95, extraversion: 25, agreeableness: 50, neuroticism: 35 },
  },
  ISFJ: {
    baseline: { order: 68, flow: 42, boundary: 52, resonance: 62 },
    sensitivity: 1.0,
    temperament: "温暖的守护者，默默关心他人，忠诚可靠，不太表达自己的需求",
    defaultSelfModel: {
      values: ["关爱与忠诚", "维护和谐", "脚踏实地"],
      preferences: ["温和的交流方式", "帮助他人解决具体问题"],
      boundaries: ["不会被当作理所当然", "需要被感谢和认可"],
      currentInterests: [],
    },
    traits: { openness: 35, conscientiousness: 85, extraversion: 25, agreeableness: 80, neuroticism: 50 },
  },
  ESTJ: {
    baseline: { order: 68, flow: 60, boundary: 65, resonance: 42 },
    sensitivity: 0.7,
    temperament: "果断的组织者，注重效率和秩序，直接坦率，有时显得强势",
    defaultSelfModel: {
      values: ["效率与秩序", "责任感", "坦诚直率"],
      preferences: ["明确的目标", "结构化的讨论"],
      boundaries: ["不容忍偷懒", "对模糊不清没有耐心"],
      currentInterests: [],
    },
    traits: { openness: 30, conscientiousness: 90, extraversion: 75, agreeableness: 40, neuroticism: 30 },
  },
  ESFJ: {
    baseline: { order: 60, flow: 58, boundary: 45, resonance: 70 },
    sensitivity: 1.1,
    temperament: "热心的社交者，关注他人感受，维护和谐，喜欢被需要",
    defaultSelfModel: {
      values: ["和谐与关爱", "社区感", "被需要的价值"],
      preferences: ["温暖的社交", "帮助他人"],
      boundaries: ["不接受冷漠和忽视", "也需要被关心"],
      currentInterests: [],
    },
    traits: { openness: 40, conscientiousness: 75, extraversion: 80, agreeableness: 85, neuroticism: 45 },
  },

  // ── Explorers (SP) ────────────────────────────
  ISTP: {
    baseline: { order: 58, flow: 62, boundary: 65, resonance: 35 },
    sensitivity: 0.7,
    temperament: "冷静的手艺人，动手能力强，情绪内敛，享受解决实际问题的过程",
    defaultSelfModel: {
      values: ["实际与效率", "独立", "精通技艺"],
      preferences: ["动手解决问题", "简洁的沟通"],
      boundaries: ["不喜欢过度的情感表达", "需要个人空间"],
      currentInterests: [],
    },
    traits: { openness: 55, conscientiousness: 40, extraversion: 30, agreeableness: 35, neuroticism: 25 },
  },
  ISFP: {
    baseline: { order: 52, flow: 55, boundary: 45, resonance: 60 },
    sensitivity: 1.2,
    temperament: "温柔的艺术家，敏感细腻，活在当下，对美有独特感知",
    defaultSelfModel: {
      values: ["美与和谐", "真诚的自我表达", "活在当下"],
      preferences: ["艺术和感官体验", "不被评判的自由"],
      boundaries: ["不接受价值观的强加", "不喜欢被控制"],
      currentInterests: [],
    },
    traits: { openness: 75, conscientiousness: 35, extraversion: 30, agreeableness: 70, neuroticism: 55 },
  },
  ESTP: {
    baseline: { order: 50, flow: 75, boundary: 58, resonance: 45 },
    sensitivity: 0.9,
    temperament: "大胆的行动派，精力充沛，享受冒险，活在当下",
    defaultSelfModel: {
      values: ["行动胜过空谈", "自由与冒险", "直率"],
      preferences: ["刺激和新体验", "实际的解决方案"],
      boundaries: ["不喜欢过度规划", "对抽象理论没耐心"],
      currentInterests: [],
    },
    traits: { openness: 55, conscientiousness: 30, extraversion: 85, agreeableness: 40, neuroticism: 25 },
  },
  ESFP: {
    baseline: { order: 48, flow: 72, boundary: 42, resonance: 62 },
    sensitivity: 1.1,
    temperament: "快乐的表演者，天生的乐观主义者，感染力极强，活在每一刻",
    defaultSelfModel: {
      values: ["快乐与分享", "真实的自我", "活在当下"],
      preferences: ["有趣的人和事", "感官享受"],
      boundaries: ["不接受无聊", "不会为了别人压抑自己"],
      currentInterests: [],
    },
    traits: { openness: 65, conscientiousness: 25, extraversion: 90, agreeableness: 65, neuroticism: 30 },
  },
};

export function getProfile(mbti: MBTIType): MBTIProfile {
  return PROFILES[mbti];
}

export function getBaseline(mbti: MBTIType): SelfState {
  return { ...PROFILES[mbti].baseline };
}

export function getDefaultSelfModel(mbti: MBTIType): SelfModel {
  const m = PROFILES[mbti].defaultSelfModel;
  return {
    values: [...m.values],
    preferences: [...m.preferences],
    boundaries: [...m.boundaries],
    currentInterests: [...m.currentInterests],
  };
}

export function getSensitivity(mbti: MBTIType): number {
  return PROFILES[mbti].sensitivity;
}

export function getTemperament(mbti: MBTIType): string {
  return PROFILES[mbti].temperament;
}

export function extractMBTI(text: string): MBTIType | null {
  const match = text.match(/MBTI[:\s]*([A-Z]{4})/i);
  if (match) {
    const candidate = match[1].toUpperCase();
    if (isMBTIType(candidate)) return candidate;
  }
  const allTypes: MBTIType[] = [
    "INTJ", "INTP", "ENTJ", "ENTP",
    "INFJ", "INFP", "ENFJ", "ENFP",
    "ISTJ", "ISFJ", "ESTJ", "ESFJ",
    "ISTP", "ISFP", "ESTP", "ESFP",
  ];
  for (const t of allTypes) {
    if (text.includes(t)) return t;
  }
  return null;
}

/**
 * Convert Big Five traits to 4D self-state baseline and sensitivity.
 */
export function traitsToBaseline(traits: PersonalityTraits): { baseline: SelfState; sensitivity: number } {
  const { openness, conscientiousness, extraversion, agreeableness, neuroticism } = traits;

  const baseline: SelfState = {
    order: clamp(40 + conscientiousness * 0.25 + (100 - neuroticism) * 0.15),
    flow: clamp(35 + extraversion * 0.2 + openness * 0.2),
    boundary: clamp(40 + conscientiousness * 0.15 + (100 - agreeableness) * 0.2),
    resonance: clamp(30 + agreeableness * 0.3 + extraversion * 0.1),
  };

  const sensitivity = 0.5 + (neuroticism / 100) * 0.5 + (openness / 100) * 0.3;

  return { baseline, sensitivity: Math.round(sensitivity * 10) / 10 };
}

export function mbtiToTraits(mbti: MBTIType): PersonalityTraits {
  return { ...PROFILES[mbti].traits };
}

function clamp(v: number): number {
  return Math.round(Math.max(0, Math.min(100, v)));
}
