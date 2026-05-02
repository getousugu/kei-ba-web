
export interface CommentaryEvent {
  type: string;
  horse_number: number;
  horse_name: string;
  jockey_name: string;
  [key: string]: any;
}

export class CommentaryGenerator {
  private static PHRASES: Record<string, string[]> = {
    GATE_OPEN: [
      "🏁 ゲートが開いた！！各馬一斉にスタート！！",
      "🏁 スタートしました！！各馬勢いよく飛び出して行く！！",
      "🏁 ゲートオープン！！さぁレースが始まった！！",
      "🏁 行った行った！！全馬一斉に発進！！"
    ],
    GOOD_START: [
      "🚀 {name}、抜群の手応えで飛び出した！！",
      "🚀 {name}、ロケットスタートだ！！",
      "🚀 {name}が素晴らしいダッシュ！完璧なタイミング！"
    ],
    BAD_START: [
      "😱 {name}がゲートで立ち遅れた！痛恨の出遅れ！！",
      "😱 {name}、痛恨のスタートミス！巻き返せるか！？",
      "😱 {name}が反応遅れた！出遅れは痛い！！"
    ],
    PACE_HI: [
      "❗ ハイペースの展開！先頭集団がグイグイ引っ張る！",
      "⚡ これはペースが速い！前に行く馬はスタミナが試される！",
      "💨 飛ばしすぎか！？後ろの馬には展開有利か！"
    ],
    PACE_MID: [
      "🏃 平均的なペース。各馬の実力が試される展開だ",
      "📏 ミドルペース。特に波乱のない展開で進む",
      "🎯 ミドルペース！これは正攻法の戦いになりそうだ"
    ],
    PACE_LOW: [
      "💤 スローペースの展開。各馬手探りの状態が続く",
      "🐌 ペースはスロー。先行馬にとっては理想的な展開か",
      "😌 じっくりとした流れ。前残りの展開になるか？"
    ],
    LEADER: [
      "先頭は{name}が引っ張る！自分のペースに持ち込めるか",
      "{name}が大きなストライドで先頭を走る！",
      "先頭を走るのは{name}！後続を引き離しにかかる！"
    ],
    MIDDLE: [
      "🔄 中盤戦！ここからレースが動き始める！",
      "🔄 中盤を過ぎて早くも動きが出てきた！",
      "🔄 折り返し地点！ここが勝負のカギを握る！"
    ],
    POS_UP: [
      "── そして！？{name}が不気味に動き出している！！",
      "{name}が徐々に順位を上げてきた！！",
      "！！{name}が動いた！！一気にポジションを上げる！！"
    ],
    CORNER3: [
      "🔄 3コーナー通過！勝負どころが近づいてくる！",
      "🔄 3コーナー！ここからが本番だ！",
      "🔄 残り半周！ここで勝負が動くか！"
    ],
    FINAL_CORNER: [
      "🏇 最終コーナー！！勝負の分かれ目がやってきた！！",
      "🏇 4コーナーを回る！！各馬が一斉にスパートの構え！！",
      "🏇 最後の曲がり角！！ここを抜ければ直線だ！！"
    ],
    LAST_SPURT: [
      "💨 {name}がラストスパート！勝利への執念を見せる！！",
      "💨 {name}が仕掛けた！一気に加速していく！！",
      "💨 {name}の末脚が爆発！前を猛烈に追う！！"
    ],
    HOMESTRETCH: [
      "🔥 直線に向いた！！各騎手が一斉に追い出した！！",
      "🔥 直線！！ここからが最後の力比べだ！！",
      "🔥 直線勝負！！最後の数百メートルで全てが決まる！！"
    ],
    WHIP: [
      "{name}、必死に追い出す！！残り200m！",
      "ムチが入った！{name}がさらに加速！！",
      "{name}とジョッキーが一体となって突き進む！！"
    ],
    GOAL: [
      "🏁 ゴーーーール！！！！決着の瞬間！！",
      "🏁 ゴールイン！！！！全力を出し切った！！",
      "🏁 ゴール！！！！素晴らしいレースだった！！"
    ],
    WINNER: [
      "🥇 勝ったのは{name}！！見事な勝利です！！",
      "🥇 {name}が堂々の1着！！力を証明した！！",
      "🥇 栄冠は{name}の手に！！最高のパフォーマンス！！"
    ],
    UPSET: [
      "🎆 信じられない！！大波乱だ！！",
      "🎆 驚愕の結末！！誰も予想できなかった！！",
      "🎆 まさかの展開！！番狂わせが起きた！！"
    ]
  };

  public static generate(stageIdx: number, sim: any, horses: any[]): string[] {
    const stage = sim.stages[stageIdx];
    const events = stage.events || [];
    const lines: string[] = [];

    // 1. フェーズごとの基本実況（厳選）
    if (stageIdx === 0) {
      lines.push(this.pick("GATE_OPEN"));
    } else if (stageIdx === 1) {
      const paceKey = sim.pace === "ハイペース" ? "PACE_HI" : sim.pace === "スローペース" ? "PACE_LOW" : "PACE_MID";
      lines.push(this.pick(paceKey));
      const leader = stage.sorted_horses[0];
      lines.push(this.pick("LEADER", leader.horse_name));
    }

    // 2. イベント実況（目立つものに絞る）
    events.forEach((ev: CommentaryEvent) => {
      if (ev.type === "good_start") lines.push(this.pick("GOOD_START", ev.horse_name));
      if (ev.type === "bad_start") lines.push(this.pick("BAD_START", ev.horse_name));
      if (ev.type === "last_spurt") lines.push(this.pick("LAST_SPURT", ev.horse_name));
      if (ev.type === "wild_explosion") lines.push(`💨 暴れ馬${ev.horse_name}が火を噴いた！！`);
    });

    return lines;
  }

  public static pick(key: string, name?: string): string {
    const list = this.PHRASES[key];
    if (!list) return "";
    let text = list[Math.floor(Math.random() * list.length)];
    if (name) text = text.replace(/{name}/g, name);
    return text;
  }
}
