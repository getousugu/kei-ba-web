import type { HorseData, Bet } from './odds_calculator';

export interface NPCPersonality {
  description: string;
  bet_types: string[];
  amount_range: [number, number];
  popularity_range: [number, number];
}

export const BOT_PERSONALITIES: Record<string, NPCPersonality> = {
  "堅実派": {
    description: "1〜3番人気中心",
    bet_types: ["単勝", "複勝", "馬連"],
    amount_range: [50, 200],
    popularity_range: [1, 3],
  },
  "大穴狙い": {
    description: "5番人気以下を好む",
    bet_types: ["3連単", "馬単"],
    amount_range: [10, 100],
    popularity_range: [5, 99],
  },
  "バランス型": {
    description: "全人気帯にバランスよく",
    bet_types: ["単勝", "複勝", "馬連", "ワイド", "馬単", "3連複", "3連単"],
    amount_range: [100, 300],
    popularity_range: [1, 99],
  },
  "一点集中型": {
    description: "1点に全力投資",
    bet_types: ["単勝", "複勝", "馬連", "ワイド", "馬単", "3連複", "3連単"],
    amount_range: [300, 500],
    popularity_range: [1, 99],
  },
  "データ派": {
    description: "能力値・適性を重視した分析購入",
    bet_types: ["ワイド", "3連複"],
    amount_range: [100, 250],
    popularity_range: [1, 5],
  },
  "感情派": {
    description: "馬名や見た目で選ぶ（ほぼランダム）",
    bet_types: ["単勝", "複勝", "馬連", "ワイド", "馬単", "3連複", "3連単"],
    amount_range: [50, 300],
    popularity_range: [1, 99],
  },
  "逃げ馬信者": {
    description: "脚質「逃げ」の馬を中心に購入",
    bet_types: ["単勝", "馬単"],
    amount_range: [100, 400],
    popularity_range: [1, 99],
  },
  "人気逆張り": {
    description: "1番人気を避けて2〜4番人気を好む",
    bet_types: ["馬連", "ワイド"],
    amount_range: [100, 200],
    popularity_range: [2, 4],
  },
};

export const BOT_NAME_PERSONALITY: Record<string, string> = {
  "ウマ吉": "バランス型",
  "競馬太郎": "堅実派",
  "予想子さん": "データ派",
  "大穴ハンター": "大穴狙い",
  "堅実派ロボ": "堅実派",
  "マスタープレディクター": "データ派",
  "ラッキーセブン": "感情派",
  "鉄板信者": "堅実派",
  "万馬券夢想家": "大穴狙い",
  "冷静分析官": "データ派",
  "データマイスター": "データ派",
  "直感お姉さん": "感情派",
  "逃げ馬命": "逃げ馬信者",
  "ひねくれ者": "人気逆張り",
  "コインおじさん": "一点集中型",
};

export const BOT_PURCHASE_COMMENTS: Record<string, string[]> = {
  "ウマ吉": ["よっしゃ！来い！！", "今日は勝つぞ！", "頼むぞ！！", "ウマ吉、参上！"],
  "競馬太郎": ["堅い馬で行くぞ", "定番を信じる", "確実に取る"],
  "予想子さん": ["データ的にはこれね", "分析完了！", "統計上はこれが有利"],
  "大穴ハンター": ["このオッズ、夢がある！！", "大穴来い！！！", "万馬券取るぞ！！", "来い来い来い！！"],
  "堅実派ロボ": ["データ通りです", "合理的な選択", "リスク管理完了", "最適解を実行"],
  "マスタープレディクター": ["予想的中率97.3%（自称）", "俺の読みに狂いはない", "計算通り"],
  "ラッキーセブン": ["ラッキー！", "今日は運がいい気がする！", "七は縁起がいい！"],
  "鉄板信者": ["鉄板！絶対来る！", "これは固い！", "間違いない！！"],
  "万馬券夢想家": ["夢は万馬券！！", "億万長者への道！", "人生一発逆転！！！"],
  "冷静分析官": ["感情を排除して選択", "ロジカルに判断", "冷静に、合理的に"],
  "データマイスター": ["能力値を見れば答えは出る", "数字は嘘をつかない", "解析完了"],
  "直感お姉さん": ["なんとなくこの馬！", "ピンときた！", "女の勘！", "絶対これ！（根拠なし）"],
  "逃げ馬命": ["逃げ馬に賭ける！", "逃げ切ってくれ〜！", "走れ走れ！先頭守れ！"],
  "ひねくれ者": ["1番人気？買わない。", "あえて逆をいく", "天の邪鬼で何が悪い"],
  "コインおじさん": ["全部突っ込む！！", "一点勝負！", "これに全てをかける！！"],
};

export function generateNPCBet(horses: HorseData[]): Bet | null {
  const npcNames = Object.keys(BOT_NAME_PERSONALITY);
  const name = npcNames[Math.floor(Math.random() * npcNames.length)];
  const personalityKey = BOT_NAME_PERSONALITY[name];
  const personality = BOT_PERSONALITIES[personalityKey];

  if (!horses || horses.length === 0) return null;

  const betType = personality.bet_types[Math.floor(Math.random() * personality.bet_types.length)];
  const [minAmt, maxAmt] = personality.amount_range;
  const amount = Math.floor(Math.random() * (maxAmt - minAmt + 1)) + minAmt;

  const [minPop, maxPop] = personality.popularity_range;
  
  // フィルタリング
  let candidates = horses.filter(h => {
    const pop = h.popularity || 99;
    return pop >= minPop && pop <= maxPop;
  });
  if (candidates.length === 0) candidates = horses;

  let selected: HorseData[] = [];
  const needed = (betType === '3連複' || betType === '3連単') ? 3 : (betType === '単勝' || betType === '複勝') ? 1 : 2;

  if (personalityKey === "データ派") {
    // スコアが高い順
    const sorted = [...candidates].sort((a, b) => (b as any).score - (a as any).score);
    selected = sorted.slice(0, needed);
  } else if (personalityKey === "逃げ馬信者") {
    // 逃げ馬 → 先行 → 全体 の順でフォールバック
    const escape = candidates.filter(h => (h as any).running_style === "逃げ");
    const senkou = candidates.filter(h => (h as any).running_style === "先行");
    const pool = escape.length >= needed ? escape : (senkou.length >= needed ? senkou : [...escape, ...senkou].concat(candidates).slice(0, needed * 3));
    selected = pool.sort(() => Math.random() - 0.5).slice(0, needed);
  } else if (personalityKey === "大穴狙い") {
    const bigOdds = candidates.filter(h => (h.odds_win || 0) >= 15);
    const pool = bigOdds.length > 0 ? bigOdds : candidates;
    selected = pool.sort(() => Math.random() - 0.5).slice(0, needed);
  } else if (personalityKey === "一点集中型") {
    // スコア上位 needed 頭に全力投資
    const sorted = [...candidates].sort((a, b) => (b as any).score - (a as any).score);
    selected = sorted.slice(0, needed);
  } else if (personalityKey === "人気逆張り") {
    const notFav = candidates.filter(h => h.popularity !== 1);
    const pool = notFav.length > 0 ? notFav : candidates;
    selected = pool.sort(() => Math.random() - 0.5).slice(0, needed);
  } else {
    selected = candidates.sort(() => Math.random() - 0.5).slice(0, needed);
  }

  if (selected.length < needed) return null;

  return {
    id: 'npc-' + Math.random().toString(36).substr(2, 9),
    playerName: name,
    bet_type: betType,
    horse_numbers: selected.map(h => h.horse_number),
    amount: amount
  };
}

export function getNPCComment(name: string): string {
  const comments = BOT_PURCHASE_COMMENTS[name] || ["さあ、行くぞ！"];
  return comments[Math.floor(Math.random() * comments.length)];
}
