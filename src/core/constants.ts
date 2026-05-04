export const RARITY_EMOJI: Record<string, string> = {
  Common: '⚪',
  Rare: '🔵',
  Epic: '🟣',
  Legendary: '🟡',
};

export const HORSE_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e',
  '#84cc16', '#0ea5e9', '#a855f7', '#fb923c', '#10b981',
  '#6366f1', '#e11d48', '#0891b2',
];

export const FIELD_CONDITIONS = ['良', '稍重', '重', '不良'];

export const DISTANCE_CATEGORIES: Record<string, [number, number]> = {
  短距離: [1000, 1400],
  マイル: [1500, 1800],
  中距離: [1900, 2400],
  長距離: [2500, 3600],
};

export const CONDITION_MODIFIERS: Record<string, number> = {
  絶好調: 1.05,
  好調: 1.02,
  普通: 1.00,
  不調: 0.95,
  絶不調: 0.90,
};

export const FIELD_CONDITION_MODIFIERS: Record<string, any> = {
  良: { speed: 1.0, stamina: 1.0, power: 1.0 },
  稍重: { speed: 0.98, stamina: 0.97, power: 1.02 },
  重: { speed: 0.95, stamina: 0.94, power: 1.05 },
  不良: { speed: 0.92, stamina: 0.90, power: 1.08 },
};

export const RUNNING_STYLE_CONFIG: Record<string, any> = {
  逃げ: { start: 1.2, middle: 1.0, end: 0.8 },
  先行: { start: 1.1, middle: 1.0, end: 1.0 },
  差し: { start: 0.9, middle: 1.0, end: 1.2 },
  追込: { start: 0.8, middle: 0.9, end: 1.4 },
};

export const APTITUDE_MULTIPLIERS: Record<string, number> = {
  S: 1.05,
  A: 1.00,
  B: 0.95,
  C: 0.90,
  D: 0.80,
  E: 0.70,
  F: 0.60,
  G: 0.50,
};

export const MARGINS = [
  [0.0, "ハナ"],
  [0.1, "アタマ"],
  [0.2, "クビ"],
  [0.3, "1/2"],
  [0.5, "3/4"],
  [0.7, "1"],
  [1.0, "1 1/4"],
  [1.3, "1 1/2"],
  [1.6, "1 3/4"],
  [2.0, "2"],
  [2.5, "2 1/2"],
  [3.0, "3"],
  [4.0, "4"],
  [5.0, "5"],
  [10.0, "大差"],
];

export interface TitleDefinition {
  id: string;
  name: string;
  description: string;
  color: string;
}

export const TITLES: TitleDefinition[] = [
  { id: 'title_collector', name: '称号コレクター', description: '現在の称号所持数が名前に反映される', color: 'text-fuchsia-400' },
  { id: 'beginner', name: '初心者', description: '競馬の世界に足を踏み入れた者', color: 'text-gray-400' },
  { id: 'first_win', name: '初勝利', description: '初めて馬券を的中させた', color: 'text-green-400' },
  { id: 'manbaken', name: '万馬券ハンター', description: '100倍以上の配当を的中させた', color: 'text-yellow-400' },
  { id: 'super_manbaken', name: '超万馬券王', description: '300倍以上の配当を的中させた', color: 'text-orange-500' },
  { id: 'miracle', name: '奇跡の目撃者', description: '1000倍以上の配当を的中させた', color: 'text-pink-500' },
  { id: 'millionaire', name: '大富豪', description: '所持金が100,000Cを超えた', color: 'text-amber-500' },
  { id: 'rich', name: '成金', description: '所持金が500,000Cを超えた', color: 'text-amber-400' },
  { id: 'billionaire', name: '億万長者', description: '所持金が1,000,000Cを超えた', color: 'text-yellow-300' },
  { id: 'bankrupt', name: '破産者', description: '所持金が1,000C以下になった', color: 'text-red-500' },
  { id: 'gambler', name: 'ギャンブラー', description: '1レースに10,000C以上賭けた', color: 'text-purple-400' },
  { id: 'high_roller', name: 'ハイローラー', description: '1レースに100,000C以上賭けた', color: 'text-fuchsia-600' },
  { id: 'all_in', name: '全ツッパ', description: '所持金を全額賭けた', color: 'text-red-600' },
  { id: 'steady', name: '堅実派', description: '通算5回以上的中させた', color: 'text-emerald-400' },
  { id: 'legend', name: '伝説の予想屋', description: '累計払戻額が1,000,000Cを超える', color: 'text-indigo-400' },
  { id: 'god_of_gambling', name: '賭神', description: '累計払戻額が10,000,000Cを超える', color: 'text-yellow-200' },
  { id: 'lucky_seven', name: 'ラッキーセブン', description: '通算7レース参加した', color: 'text-teal-400' },
  { id: 'seeker', name: '血統の求道者', description: '通算10レース以上参加した', color: 'text-blue-400' },
  { id: 'veteran', name: '歴戦の猛者', description: '通算50レース以上参加した', color: 'text-red-800' },
  { id: 'centaur', name: '人馬一体', description: '通算100レース以上参加した', color: 'text-emerald-600' },
  { id: 'loser', name: '負け犬', description: '通算10回以上不的中', color: 'text-gray-600' },
  { id: 'unlucky_streak', name: '不運の連鎖', description: '通算20回以上不的中', color: 'text-gray-700' },
  { id: 'poor', name: '路頭に迷う者', description: '所持金が100C以下になった', color: 'text-orange-900' },
  { id: 'high_stake', name: '鉄火場の主', description: '1レースに500,000C以上賭けた', color: 'text-red-900' },
  { id: 'winner_20', name: '重賞請負人', description: '通算20回以上的中させた', color: 'text-emerald-500' },
  { id: 'whale', name: '海を統べる者', description: '累計払戻額が50,000,000Cを超える', color: 'text-blue-600' },
  { id: 'dev_friend', name: '開発者の友達', description: 'この世界のコードを書いた者たちの、密かな話し相手。', color: 'text-cyan-400' },
  { id: 'hermes', name: 'ヘルメス', description: '飛び交う情報、渦巻く思惑。その全てを掌の上で転がす神の伝令。', color: 'text-sky-300' },
  { id: 'debugger', name: 'デバッガー', description: 'システムの綻びを見つける者', color: 'text-red-400' },
  { id: 'gravity_master', name: '重力使い', description: 'Antigravityの加護を受けた者', color: 'text-indigo-500' },
  { id: 'war_lover', name: 'よろしい、ならば戦争だ', description: 'かくして役者は全員演壇へと登り、暁の惨劇は幕を上げる。', color: 'text-red-700' },
  { id: 'no_life_king', name: '死なずの君', description: '素敵だ。やはり人間は素晴らしい。', color: 'text-slate-400' },
  { id: 'keiba_lover', name: 'よろしい、ならば競馬だ', description: '君らの馬の速さは一体どこの誰が保障してくれるのだね? ---私だ。私の、我らの熱狂だ。', color: 'text-emerald-500' },
  { id: 'last_chance', name: '背水の陣', description: '所持金が10C以下の状態で的中させた', color: 'text-orange-600' },
  { id: 'jackpot_777', name: 'ラッキー・セブン・フィーバー', description: '所持金がちょうど777C、または7777Cになった', color: 'text-yellow-500' },
  { id: 'all_or_nothing', name: '極限の勝負師', description: '全財産を賭けて、100倍以上の配当を手にした', color: 'text-red-600' },
  { id: 'win5_survivor', name: 'WIN5生存者', description: 'WIN5サバイバルで生き残っている', color: 'text-emerald-400' },
  { id: 'win5_champion', name: 'WIN5覇者', description: 'WIN5を完全制覇した', color: 'text-yellow-400' },
  { id: 'win5_legend', name: '伝説の5連勝', description: '一度も外さずにWIN5を駆け抜けた', color: 'text-yellow-500' },
  { id: 'win5_hunter', name: '賞金首', description: '高額なキャリーオーバーを奪取した', color: 'text-orange-400' },
];
// horse_generator が必要とする定数
// (元々 constants.ts になかったため horse_generator の import エラーになっていた)
export const RARITY_DISTRIBUTION: Record<string, { weight: number; mean: number; std: number }> = {
  Common: { weight: 60, mean: 45, std: 10 },
  Rare: { weight: 25, mean: 60, std: 8 },
  Epic: { weight: 12, mean: 75, std: 6 },
  Legendary: { weight: 3, mean: 88, std: 4 },
};

export const WILD_HORSE_STYLE = '暴れ馬';

export const GENDERS = ['牡', '牝'];
export const GENDER_WEIGHTS = [55, 45];

export const COAT_COLORS = [
  '鹿毛', '青鹿毛', '鹿毛メーン', '青鹿毛メーン', '黒鹿毛',
  '栗毛', '青毛', '青鹿毛黒', '白毛',
];

export const GROWTH_TYPES = ['早熟', '標準', '遅熟', '持続力型'];
export const GROWTH_TYPE_WEIGHTS = [20, 45, 25, 10];

export const APTITUDE_RANKS = ['A', 'B', 'C', 'D', 'E'];

export const CONDITIONS = ['絶好調', '好調', '普通', '不調', '絶不調'];
export const CONDITION_WEIGHTS = [5, 20, 50, 20, 5];

export const HORSE_WEIGHT_MIN = 420;
export const HORSE_WEIGHT_MAX = 560;
export const HORSE_WEIGHT_CHANGE_RANGE = [-12, 12];
