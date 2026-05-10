
export interface CommentaryEvent {
  type: string;
  horse_number: number;
  horse_name: string;
  jockey_name: string;
  [key: string]: any;
}

export class CommentaryGenerator {
  private static PHRASES: Record<string, string[]> = {
    RACE_INTRO: [
      "🎙️ さぁ、夢の舞台が整いました！各馬、ゲートに向かいます！！",
      "🎙️ 伝統の一戦、いよいよ発走の時が近づいてきました！！",
      "🎙️ 静寂に包まれる競馬場. 運命のゲートインが始まります！！",
      "🎙️ ファンの期待を乗せて、精鋭たちが今ここに集結しました！！",
      "🎙️ ターフに刻まれる新たな伝説。その目撃者となるのは、あなたです！！",
      "🎙️ 準備はいいか！情熱がぶつかり合う、最高のステージが幕を開けます！！",
      "🎙️ 緊張感が極限まで高まっています。運命の号砲は、もう間もなくです！！",
      "🎙️ 選ばれし戦士たちの饗宴。勝利の女神は、誰に微笑むのでしょうか！！",
      "🎙️ 震えるような興奮。かつてない激戦の予感が、この場を満たしています！！",
      "🎙️ 決戦の時、来たれり。誇りを懸けた戦いが、今まさに始まろうとしています！！",
      "🎙️ 砂塵が舞うか、芝が跳ねるか。歴史の1ページが今、開かれようとしています！",
      "🎙️ 全馬ゲートへ。静寂の先に待つのは、歓喜か、それとも絶望か！！",
      "🎙️ 伝説の目撃者となる準備はできているか！運命のゲートイン！！",
      "🎙️ 競馬の神様、今日は誰に微笑むのか。熱狂の渦が巻き起こります！！",
      "🎙️ 輝く蹄音、高鳴る鼓動。至高の戦いが今、始まろうとしています！！",
      "🎙️ この一瞬のために、彼らは牙を研いできた。最強決定戦、いよいよです！！",
      "🎙️ 万感の思いを胸に、それぞれの馬がゲートへと向かっていく！！",
      "🎙️ 今日という日を、誰もが待ちわびていた。運命の幕が上がります！！",
      "🎙️ この舞台に立てること自体が、すでに奇跡。さぁ、奇跡の上塗りだ！！",
      "🎙️ 息を呑む静寂。その静寂を破る号砲が、今まさに轟こうとしている！！",
      "🎙️ どんな結末が待っているのか。それを知るのはゴールだけです！！",
      "🎙️ 蹄が大地を踏みしめる。その一歩一歩が、歴史を刻んでいく！！"
    ],
    GATE_OPEN: [
      "🏁 ゲートが開いた！！各馬一斉にスタート！！",
      "🏁 スタートしました！！各馬勢いよく飛び出して行く！！",
      "🏁 ゲートオープン！！さぁレースが始まった！！",
      "🏁 スタート！！各馬が一斉にガッと飛び出していく！！",
      "🏁 行った行った！！全馬一斉に発進！！運命の瞬間が来た！！",
      "🏁 各馬綺麗なスタート！さぁ、ハナを切るのはどの馬か！！",
      "🏁 揃った揃った！一団となって1コーナーを目指します！！",
      "🏁 弾かれたように飛び出した！白熱のバトルが今、幕を開けました！！",
      "🏁 綺麗に揃ったスタート！ここから長い戦いが始まります！！",
      "🏁 ゲートが開いた！一気に地面を蹴って飛び出していった！！",
      "🏁 号砲一発！全馬が一斉に飛び出した！！",
      "🏁 開いた！開いた！各馬が怒涛のダッシュを見せる！！",
      "🏁 発走！一団となって最初のコーナーへ突き進む！！",
      "🏁 さぁ行った！歴史の幕が今、切って落とされました！！",
      "🏁 スタート！まずは先頭争いから目が離せない！！"
    ],
    GOOD_START: [
      "🚀 {name}、抜群の手応えで飛び出した！！",
      "🚀 {name}、{jockey}騎手の好判断！ロケットスタートだ！！",
      "🚀 {name}が素晴らしいダッシュ！完璧なタイミング！",
      "🚀 {name}、一気に前へ！{jockey}騎手の気迫が伝わる！",
      "🚀 {name}が矢のようなスタート！一気に主導権を握る構えか！！",
      "🚀 おっと！{name}が好発進！順調に飛び出しました！！",
      "🚀 理想的な飛び出し！{name}が先陣を切って進みます！！",
      "🚀 {name}、好スタート！馬体も軽く、軽快な足取りです！！",
      "🚀 見て下さいこの飛び出し！{name}、気合十分です！！",
      "🚀 {name}が弾かれたように飛び出した！完璧な発走です！！",
      "🚀 {name}、ゲートを蹴り飛ばすような勢いで飛び出していった！！",
      "🚀 これは完璧！{name}が誰よりも早く飛び出した！！",
      "🚀 {name}の好発進！{jockey}騎手のスタートセンスが光る！！",
      "🚀 ワンテンポ早い！{name}が最高のスタートを切りました！！",
      "🚀 スルッと出た！{name}、序盤から理想のポジションへ！！"
    ],
    BAD_START: [
      "😱 {name}、痛恨の出遅れ！！",
      "😱 {name}がゲートで立ち遅れた！{jockey}騎手が必死に追う！！",
      "😱 {name}、痛恨のスタートミス！巻き返せるか！？",
      "😱 {name}が反応遅れた！出遅れは痛い！！",
      "😱 あーっと！{name}のスタートが遅れた！これは厳しい展開か！！",
      "😱 {name}、ゲート内で暴れたか！？完全に出遅れてしまいました！！",
      "😱 痛い、痛すぎる！{name}、大きく遅れてのスタートになりました！！",
      "😱 ゲートに嫌われたか、{name}が出遅れた！！",
      "😱 {name}、一歩遅れた！この差をどう埋めるか！！",
      "😱 スタート失敗！{name}、後方からの競馬を余儀なくされそうです！！",
      "😱 ゲートが開いた瞬間、{name}が固まった！これは誤算だ！！",
      "😱 {name}、出遅れた！{jockey}騎手が全力で追い出している！！"
    ],
    PACE_HI: [
      "❗ ハイペースの展開！先頭集団がグイグイ引っ張る！",
      "⚡ これはペースが速い！ハイペース！前に行く馬はスタミナが試される！",
      "🔥 ハイペースだ！先行勢はこのペースについていけるか！？",
      "💨 飛ばしすぎでは！？ハイペース！後ろの馬にとっては展開有利かもしれない！",
      "⚡ 息をつく暇もないハイペース！サバイバルレースの様相です！！",
      "❗ ペースが緩みません！これはスタミナの削り合いになるぞ！！",
      "🔥 激流のハイペース！先行集団は息を入れる暇もありません！！",
      "⚡ 超高速決着の予感！このハイペースを誰が生き残るのか！！",
      "🌪️ 暴走気味のハイペース！先行勢のスタミナが心配です！！",
      "🔥 前はかなり飛ばしています！まさに消耗戦の様相！！",
      "⚡ 超抜のラップタイム！これはタフなレースになりそうだ！！",
      "🔥 誰も抑えが効かない！完全なハイペース！後方待機組に追い風か！！",
      "⚡ 前が潰れ合う展開！差し・追込の馬にとっては絶好のシナリオだ！！",
      "🌪️ 壮絶なペース！ゴール前には全馬息も絶え絶えになるかもしれない！！",
      "❗ このペースは保つまい！前で崩れが始まるのはいつか、注目です！！"
    ],
    PACE_MID: [
      "🏃 平均的なペースで進んでいる。各馬の実力が試される展開",
      "📏 ミドルペース。特に波乱のない展開で進む",
      "⚖️ ペースは平均的。脚質に左右されない実力勝負か",
      "🎯 ミドルペース！これは正攻法の戦い！実力がそのまま出る展開だ！",
      "📏 淀みのないミドルペース。各馬リラックスして走れています！！",
      "🏃 流れるようなペース。ここまでは理想的な展開と言えるでしょう！！",
      "⚖️ ちょうど良い加減のミドルペース。勝負は直線に持ち越されそうです！！",
      "🎯 整然としたミドルペース。どの脚質にもチャンスのある展開！！",
      "📏 標準的な流れ。ここからどの馬が動くかがポイントになりそうです！！",
      "🏃 無駄のないペース配分。各馬が虎視眈々と好機を窺っています！！"
    ],
    PACE_LOW: [
      "💤 スローペースの展開。各馬手探りの状態が続く",
      "🐌 ペースはスロー。先行馬にとっては理想的な展開か",
      "😌 じっくりとしたスローペース。これは前残りの展開になるか？",
      "🔇 スローすぎる！後ろの馬には届かないか！？前で粘れた馬の勝利か！",
      "💤 まったりとしたスローペース。どこで誰が動くのか、心理戦です！！",
      "🐌 落ち着いた流れ。脚を溜めている馬たちにとっては絶好の展開か！！",
      "😌 スローで推移しています。これは最後の瞬発力勝負になりそうだ！！",
      "💤 じりじりとしたスローペース。我慢比べの様相を呈しています！！",
      "🐌 誰も動かない。この重苦しい空気を打ち破るのはどの馬か！！",
      "😌 ゆったりとした流れ。後半の爆発に備えて脚を貯めているようです！！"
    ],
    LEADER: [
      "先頭は{name}が引っ張る！",
      "{name}が大きなストライドで先頭を走る！{jockey}騎手、ここは自分のペース！",
      "先頭を走るのは{name}！後続を引き離しにかかる！",
      "{name}、見事に先頭を奪取！最高の展開だ！",
      "{name}が単独先頭！悠々とレースをコントロールしています！！",
      "{name}が逃げる！自分の形に持ち込んで主導権を握った！！",
      "{name}、影をも踏ませぬ逃げ脚！後続との差をさらに広げるか！！",
      "先頭は{name}、単騎逃げの構えか！淡々とピッチを刻みます！",
      "{name}が堂々の先頭！余裕を持ってレースを支配している！！",
      "先頭{name}、後続を従えて悠然と走る！これが王者の走りか！！",
      "{name}が先手を取った！{jockey}騎手、理想的なポジションに付けています！！",
      "単独先頭の{name}！ここまでは計算通りの展開に見えます！！"
    ],
    MIDDLE: [
      "🔄 中盤戦！ここからレースが動き始める！",
      "🔄 中盤を過ぎて早くも動きが出てきた！",
      "🔄 折り返し地点！ここが勝負のカギを握る！",
      "🔄 中盤！スタミナの消耗が勝負を左右し始める！",
      "🔄 レースは折り返し！各馬、牙を研いでいる状態か！！",
      "🔄 さぁ中盤、隊列に変化が出てくるか！目が離せません！！",
      "🔄 各馬じっくりと脚を溜める中盤戦。嵐の前の静けさか！！",
      "🔄 中盤！ここからが本当の意味での勝負どころです！！",
      "🔄 レースは中間点へ。疲労がじわじわと各馬に忍び寄っている！！",
      "🔄 折り返し！ここから先は体力との戦いになってきます！！"
    ],
    POS_UP: [
      "── そして！？{name}が不気味に動き出している！！",
      "{name}が徐々に順位を上げてきた！！{jockey}騎手の手応えは十分か！",
      "！！{name}が動いた！！一気にポジションを上げる！！",
      "{name}が外を通って進出！一気に前を飲み込みにいくのか！！",
      "おっと！{name}がこの位置から仕掛ける！勝負に出たか！！",
      "まくりをかけるのは{name}！一気に集団を置き去りにします！！",
      "{name}がじわじわと上がってくる！まだ余力がある証拠だ！！",
      "静かに、しかし確実に！{name}が順位を押し上げてきた！！",
      "{name}の手応えが明らかに違う！スルスルとポジションを上げます！！",
      "外から！{name}が一気に動いた！この勢いは止まらないか！！"
    ],
    CORNER3: [
      "🔄 3コーナー通過！勝負どころが近づいてくる！",
      "🔄 3コーナー！ここからが本番だ！",
      "🔄 残り半周！ここで勝負が動くか！",
      "🔄 3コーナーをカーブ！各馬、一斉に手綱が動き出した！！",
      "🔄 さぁ3コーナー通過！ここから直線に向けて加速していく！！",
      "🔄 3コーナーから4コーナーへ！レースが最高潮に向かいます！！",
      "🔄 3コーナー！各馬が一気に手応えを確かめる！！",
      "🔄 コーナーを回る！ここで脚が残っているのはどの馬か！！",
      "🔄 3コーナー！外から動く馬、内で我慢する馬、それぞれの策が交錯する！！"
    ],
    FINAL_CORNER: [
      "🏇 最終コーナー！！勝負の分かれ目がやってきた！！",
      "🏇 4コーナーを回る！！各馬が一斉にスパートの構え！！",
      "🏇 最後の曲がり角！！ここを抜ければ直線だ！！",
      "🏇 4コーナー！！運命の直線へ向かう！！誰が最初に抜け出すか！！",
      "🏇 さぁ第4コーナーを回って直線だ！内か外か、どっちを突く！！",
      "🏇 コーナー出口！一番良い手応えで回ってきたのはどの馬だ！！",
      "🏇 最終コーナーを回る！全馬、全開で直線へ飛び込んだ！！",
      "🏇 第4コーナー、カーブを切った！ここからは地力の勝負だ！！",
      "🏇 最後のカーブ！歓声の渦へと吸い込まれていく！！",
      "🏇 さぁ直線だ！遮るものは何もない！前を追え！！",
      "🏇 4コーナー立ち上がり！一団となって直線へ向かう！！",
      "🏇 運命のコーナー出口！誰の脚色が勝っているか！！",
      "🏇 最終コーナー！馬群が一気に凝縮する、混沌の瞬間！！",
      "🏇 コーナーを回りながらもう動いた！各騎手が渾身の追い出し！！",
      "🏇 残りわずか！このコーナーを制した馬が勝利を手にするか！！"
    ],
    LAST_SPURT: [
      "💨 {name}がラストスパート！勝利への執念を見せる！！",
      "💨 {name}が仕掛けた！{jockey}騎手が必死のスパート！！",
      "💨 {name}の末脚が爆発！前を猛烈に追う！！",
      "💨 {name}がグイグイ伸びる！エンジンの掛かりが違う！！",
      "💨 {name}の末脚全開！一完歩ごとに前との差を詰める！！",
      "💨 ここが勝負！{name}、持てる力をすべて絞り出す！！",
      "💨 いけーっ！{name}！地を這うような末脚が炸裂だ！！",
      "💨 {name}が飛んできた！！ものすごい脚色だ！！",
      "💨 捉えるか！{name}が次元の違う脚を見せている！！",
      "💨 {name}、怒涛の追い上げ！これは届くか、届くのか！！",
      "💨 未知の領域へ！{name}、限界を超えた加速を見せています！！",
      "💨 魂の叫び！{name}が地を蹴って、一気に前を飲み込む構え！！",
      "💨 {name}の独壇場か！？信じられない末脚を繰り出した！！",
      "💨 来た来た来た！{name}がすごい勢いで突っ込んでくる！！",
      "💨 {name}、火の出るような末脚！{jockey}騎手も全力で追っている！！",
      "💨 脚が違う！{name}だけがまるで別次元のスピードで伸びている！！",
      "💨 これが末脚！{name}が前を飲み込む時間はあるか！！"
    ],
    HOMESTRETCH: [
      "🔥 直線に向いた！！各騎手が一斉に追い出した！！",
      "🔥 直線入口！！勝負が始まる！！",
      "🔥 直線勝負！！最後の数百メートルで全てが決まる！！",
      "🔥 さぁ直線だ！ここからが本当の力比べ！！",
      "🔥 最後の直線！全馬の意地がぶつかり合う！！",
      "🔥 遮るものはない直線！真の実力勝負、開幕！！",
      "🔥 絶叫の直線！誰が抜け出すんだ、誰が来るんだ！！",
      "🔥 叩き合いだ！意地とプライドのぶつかり合いだ！！",
      "🔥 スタンドが揺れている！最後の死闘が今始まった！！",
      "🔥 直線！全馬が一気に加速！ここからは根性と意地だ！！",
      "🔥 ゴールが見えてきた！諦めるな、まだ終わっていないぞ！！",
      "🔥 渾身の直線勝負！ここで何かが起きる予感がする！！",
      "🔥 直線で激突！ムチが飛ぶ、声援が響く、熱狂の坩堝と化した！！"
    ],
    WHIP: [
      "{name}、必死に追い出す！！",
      "ムチが入った！{name}がさらに加速！！",
      "{name}と{jockey}騎手が一体となって突き進む！！",
      "{name}、必死の粘り！ムチに応えてもう一伸びできるか！！",
      "{name}が叩き合う！ジョッキーの鼓舞に応えて踏ん張っている！！",
      "渾身のムチが飛ぶ！{name}、勝利への執念が爆発！！",
      "{jockey}騎手が叫ぶ！{name}も応える！この二人の絆が今、試されている！！",
      "追え！{name}！{jockey}騎手の全力が馬体に乗り移った！！",
      "ムチに応えた！{name}がもうひと伸び！諦めない気持ちが前を捉える！！"
    ],
    GOAL: [
      "🏁 ゴーーーール！！！！決着の瞬間！！",
      "🏁 ゴールイン！！！！全力を出し切った！！",
      "🏁 ゴール！！！！素晴らしいレースだった！！",
      "🏁 決着！！勝利の女神はどの馬に微笑んだのか！！",
      "🏁 入線！！全馬、持てる力を出し切りました！！",
      "🏁 感動のフィニッシュ！歴史に残る名勝負が決着しました！！",
      "🏁 どっちだーっ！！際どい決着！写真判定か！！",
      "🏁 捉えたか！残ったか！わずかに{name}かーっ！！",
      "🏁 叫びたくなるような名勝負！今、決着！！",
      "🏁 1点を見つめるような大接戦！勝ったのは…！？",
      "🏁 ゴール板を駆け抜けた！歓喜の瞬間、今ここに！！",
      "🏁 大歓声の中、決着！歴史が塗り替えられました！！",
      "🏁 並んだところがゴール！これは分からない、大激戦だ！！",
      "🏁 ゴール！最後まで諦めなかった馬が、笑顔でゴールを駆け抜けた！！",
      "🏁 全力を出し切ったゴール！この感動を誰と分かち合いますか！！",
      "🏁 入線！夢か現か、信じられない結末がここに待っていた！！",
      "🏁 駆け抜けた！全馬が心を燃やして、この瞬間のために走ってきた！！"
    ],
    WINNER: [
      "🥇 勝ったのは{name}！！見事な勝利です！！",
      "🥇 {name}が堂々の1着！！力を証明した！！",
      "🥇 栄冠は{name}の手に！！最高のパフォーマンス！！",
      "🥇 圧倒的な強さ！{name}が頂点に立ちました！！",
      "🥇 見事！{name}がライバルを退けて優勝です！！",
      "🥇 誇り高き勝利！{name}、その名を歴史に刻みました！！",
      "🥇 {name}が栄光のゴールへ！この勝利は誰にも揺るがせない！！",
      "🥇 王者の証明！{name}がすべてを力で押し切りました！！",
      "🥇 {name}、完全勝利！{jockey}騎手との最高のコンビネーションが実を結んだ！！",
      "🥇 今日一番の走りを見せたのは{name}！文句なしの優勝です！！"
    ],
    UPSET: [
      "🎆 信じられない！！大波乱だ！！",
      "🎆 驚愕の結末！！誰も予想できなかった！！",
      "🎆 まさかの展開！！番狂わせが起きた！！",
      "🎆 大荒れです！人気馬が崩れ、伏兵が突っ込んできた！！",
      "🎆 どよめきが止まらない！これぞ競馬、何が起こるか分かりません！！",
      "🎆 歴史的波乱！今日は万馬券の予感がします！！",
      "🎆 下剋上！！誰もがあっと驚く結末がここに！！",
      "🎆 これが競馬！どんな強者も、番狂わせには勝てない！！",
      "🎆 予想を根底から覆す大波乱！競馬の神様はいたずら好きですね！！",
      "🎆 夢が叶った！！大穴馬が奇跡のゴールを駆け抜けました！！"
    ],
    CHASING: [
      "{name}が{pos}番手につけている！じわじわと差を詰めるか！",
      "{name}は{pos}番手の好位置！{jockey}騎手の手応えは良さそうだ！",
      "{name}、{pos}番手から虎視眈々と前を狙う！",
      "{name}が{pos}番手で前を射程圏に入れている！タイミングを計っているか！！",
      "{name}は{pos}番手。じっくりと脚を溜め、爆発の時を待っています！！",
      "{name}、{pos}番手。虎視眈々と逆転の機会をうかがいます！！",
      "{name}は{pos}番手で我慢！ここからの一気の進出を狙っているか！！",
      "{pos}番手に{name}。落ち着いた走り、まだ余力は十分そうです！！"
    ],
    TRAILING: [
      "後方から{name}！この展開をどう動かすか！？",
      "{name}は最後方！溜めに溜めて一気に爆発させるか！？",
      "{name}、後方待機。{jockey}騎手がじっくりと脚を溜めている！",
      "殿から{name}！この位置から届くのか、それとも！？",
      "{name}は後方で息を潜める。直線での大逆転に賭ける構えです！！",
      "最後方に構える{name}。この静寂は爆発の前触れか！！",
      "{name}、後ろでじっと我慢！届くかどうかは直線の末脚次第！！",
      "後方に位置する{name}。誰よりも遅く動いて、誰よりも速く差す！！",
      "{name}は殿最後方！この大外一気が決まれば最高のドラマになる！！"
    ],
    RAIN: [
      "🌧️ 雨中の戦いが始まる！水しぶきを上げながら各馬が力走！",
      "☔ 雨が降りしきる中でのレース！パワーと根性が問われる！",
      "🌧️ 降りしきる雨が馬場を濡らす！過酷な条件での一戦です！！",
      "☔ 視界も悪い雨のレース。精神力とスタミナが試されます！！",
      "🌧️ 止まない雨。これがレースにどう影響するのか注視しましょう！！",
      "☔ ぬかるんだ馬場を力強く蹴る！雨中でも燃える闘志が伝わります！！",
      "🌧️ 雨粒が馬体を叩く！それでも脚を緩めない、これが本物の闘志だ！！"
    ],
    SUNNY: [
      "☀️ 晴天の下、最高のコンディションでレーススタート！",
      "🌞 素晴らしい天気の下、白熱のレースが繰り広げられる！",
      "☀️ 絶好の競馬日和！太陽に照らされて馬体が輝いています！！",
      "🌞 青空が広がる競馬場。絶好のコンディションが整いました！！",
      "☀️ 最高の馬場、最高の空。役者はすべて揃いました！！",
      "🌞 燦々と輝く太陽の下！馬も人も最高の状態でのレースです！！",
      "☀️ 晴れ渡る空が、今日の名勝負を祝福しているかのようです！！"
    ],
    CLOUDY: [
      "☁️ どんよりとした曇り空の下、各馬がスタートを切ります！",
      "☁️ 雲が空を覆っていますが、馬場状態は良好です！",
      "☁️ いつ雨が降ってもおかしくない空模様！レースはどうなるか！？",
      "☁️ 曇天の下、静かな緊張感がターフを包んでいます！！",
      "☁️ 鉛色の空でも、馬たちの情熱は輝いている！さぁ始まります！！"
    ],
    SNOW: [
      "⛄ なんと雪が舞っています！銀世界でのレースとなりました！！",
      "❄️ 冷たい雪が馬体を打ちつけます！過酷なサバイバルレースだ！！",
      "⛄ スタミナを奪う雪！これは波乱の予感がします！！",
      "❄️ 雪煙を上げながら疾走する！これぞ究極のサバイバルレースだ！！",
      "⛄ 白い世界を駆け抜ける！普通ではない条件が普通ではない結末を呼ぶか！！"
    ],
    HEAVY_FIELD: [
      "🌊 水しぶきが舞う重馬場！パワーのある馬が有利だ！",
      "💧 ぬかるむ重馬場！スタミナとパワーが試される大勝負！",
      "🌊 タフな重馬場が馬たちの体力を削る！粘り強さが鍵です！！",
      "💧 力の要る重馬場。ダートのようなパワーが必要とされる展開か！！",
      "🌊 重たい馬場。適性の差が勝敗を大きく分けることになりそうです！！",
      "💧 馬場が脚を取る！こういう条件でこそ、真のパワーホースが輝く！！",
      "🌊 重馬場巧者の本領発揮か！条件が得意な馬が頭ひとつ抜け出す！！"
    ],
    BAD_FIELD: [
      "😱 不良馬場！深い泥の中を駆け抜けるのはどの馬か！馬場適性が全てだ！",
      "🌪️ 最悪の馬場コンディション！不良馬場で真の実力が問われる！",
      "😱 泥だらけの不良馬場！走るたびに馬が脚を取られる難コースです！！",
      "🌪️ これ以上ない過酷な不良馬場。根性だけでゴールを目指す戦いか！！",
      "😱 足元の悪い不良馬場。まさにサバイバルな一戦になるでしょう！！",
      "🌪️ 泥が飛び散る！不良馬場を苦にしない馬だけが笑える展開！！",
      "😱 馬場状態は最悪！これはもはや適性を持つ馬だけの戦いだ！！"
    ],
    OVERTAKE: [
      "🔥 {name}が並びかけた！かわした！！一気に前へ出ます！！",
      "🔥 ここで{name}が動いた！{target}を鮮やかに抜き去っていく！！",
      "🔥 {name}の脚色が違う！{target}をかわしてポジションを上げました！！",
      "🔥 見事な加速！{name}が{target}を抜き去り、前を追走します！！",
      "🔥 {name}がかわした！{target}を置き去りにして突き進む！！",
      "🔥 前を捉えた！{name}、並ぶ間もなく{target}を抜き去っていった！！",
      "🔥 あっという間！{name}が{target}をまとめて飲み込んでいく！！",
      "🔥 豪快に外から！{name}が{target}をかわして順位を押し上げた！！",
      "🔥 差した！{name}が鋭く{target}を交わして前を向く！！"
    ],
    LEADER_CHANGE: [
      "📢 先頭が入れ替わった！！{name}が前に出た！！",
      "📢 ここで先頭交代！！{name}がトップに躍り出ました！！",
      "📢 さぁ先頭が変わった！！{name}が先頭に立ち、レースを引っ張ります！！",
      "📢 {name}が先頭を奪取！！ついにトップが入れ替わりました！！",
      "📢 波乱の展開！！{name}が先頭を奪い、独走態勢に入るか！！",
      "📢 トップ交代！！{name}が力強く抜け出し、先頭に立ちました！！",
      "📢 さぁ激戦の先頭争い！{name}がついにトップを奪った！！",
      "📢 前が入れ替わる！{name}が主導権を握りました！！",
      "📢 逆転！{name}が先頭に！展開が大きく動きました！！",
      "📢 {name}が抜け出した！新たなリーダーの誕生です！！"
    ],
    LEAD_BIG: [
      "🐘 {name}が独走状態！！後続に大きな差をつけています！！",
      "🐘 圧倒的なリード！{name}、影をも踏ませぬ逃げ脚です！！",
      "🐘 後続は遥か後ろ！{name}が一人旅を続けています！！",
      "🐘 大差がついた！！{name}、このままセーフティリードを守り切るか！！",
      "🐘 {name}、別次元の走り！後続が追いつく気配すらない！！",
      "🐘 圧巻だ！{name}が完全に独走！これは誰も追いつけないのか！！"
    ],
    LEAD_CLOSE: [
      "⚔️ 激しい叩き合い！！{name}と後続の差はほとんどありません！！",
      "⚔️ 大接戦だ！！1点を見つめるような、手に汗握る攻防！！",
      "⚔️ 差がない！！一完歩ごとに順位が入れ替わってもおかしくない！！",
      "⚔️ 鼻差の争いか！？{name}が必死に粘る、後続が迫る！！",
      "⚔️ 離れない！並んでいる！どっちも譲らない！！",
      "⚔️ まさに死闘！クビの上げ下げ、運命の瞬間に向かう！！",
      "⚔️ 熱すぎる！こんな接戦、見たことがない！！",
      "⚔️ 紙一重の攻防！どちらが先にゴールを踏むのか！！",
      "⚔️ 息詰まる攻防！{name}、絶対に譲らないという気迫が伝わる！！",
      "⚔️ 頭の上げ下げ！肉眼では判断できないほどの大接戦！！"
    ],
    CROWD_ROAR: [
      "🔊 スタンドからは地鳴りのような大歓声！！",
      "🔊 場内の熱気が最高潮に達しています！！",
      "🔊 観客のボルテージもMAX！！物凄い熱気です！！",
      "🔊 割れんばかりの拍手と歓声！これぞ競馬の醍醐味！！",
      "🔊 スタンドが総立ちだ！この瞬間のために来たんだ！！",
      "🔊 歓声が競馬場全体を包み込む！感動が伝染していく！！"
    ],
    FAVORITE_MOVE: [
      "⭐ 1番人気{name}、ここで動いた！！満を持してのスパートか！！",
      "⭐ 注目の{name}がポジションを上げる！ファンの期待を背負って進出！！",
      "⭐ 1番人気{name}の手応えが良い！！スルスルと前に取り付きます！！",
      "⭐ やはりこの馬か！1番人気{name}、王者の貫禄で進出開始！！",
      "⭐ 王者の走りを見せるか！1番人気{name}が牙を剥く！！",
      "⭐ {name}が動いた！期待に応える走りを見せてくれ！！",
      "⭐ さすが1番人気！{name}が最高のタイミングで仕掛けてきた！！"
    ],
    FAVORITE_STRUGGLE: [
      "❗ 1番人気{name}、少し苦しいか！？手応えが怪しくなってきた！！",
      "❗ 人気の{name}、伸びを欠いているか！？必死に追っているが差が縮まらない！！",
      "❗ おっと、1番人気{name}が後退していく！これはどうしたことか！！",
      "❗ まさかの失速！？1番人気{name}、本来の力が出せていない様子です！！",
      "❗ 1番人気{name}、沈んでいく！これは場内騒然！！",
      "❗ {name}が苦しい！これは波乱の予感がしてきた！！",
      "❗ 人気を裏切るのか！{name}が思うように動けていない！！"
    ],
    WILD_EXPLOSION: [
      "💨 暴れ馬{name}が火を噴いた！！一気に加速していく！！",
      "💨 暴走か、それとも執念か！？{name}が凄まじい脚で突き抜ける！！",
      "💨 見ろ、あの脚！{name}が本能のままに爆発的なスパートをかける！！",
      "💨 {name}が覚醒した！！誰も止められない爆速スパートだ！！",
      "💨 まさに重戦車！{name}、荒れ狂う嵐のように前を飲み込みます！！",
      "💨 これぞ暴れ馬の真骨頂！{name}、常識外れの加速だ！！",
      "💨 牙を剥いた{name}！この勢いは誰にも止められない！！",
      "💨 制御不能の爆速！！{name}が異次元のスピードで駆け抜ける！！",
      "💨 {name}！地を蹴る力が桁違いだ！！まるで暴風雨のような勢い！！",
      "💨 限界突破！{name}、ただただ速い！前へ前へと突き進む！！",
      "💨 これが本物の暴れ馬！{name}が全てを吹き飛ばして突き進む！！",
      "💨 嵐のように！{name}の爆発が誰も予想しなかった場面で炸裂した！！"
    ],
    WILD_CONTROL_LOST: [
      "⚠️ 暴れ馬{name}が暴走中！！コントロール不能、あらぬ方向へ走っていく！！",
      "⚠️ 気性難爆発！！{name}が予測不能な動き！ジョッキーも必死に抑え込む！！",
      "⚠️ {name}が暴れている！！レースに集中できていないか、大波乱の予感！！",
      "⚠️ おっと危ない！！{name}が斜行、あるいは逸走か！？制御が効きません！！",
      "⚠️ {name}がどこへ行く！？本能のままに走っているのか、制御不能だ！！",
      "⚠️ これが暴れ馬！{name}が突然気性を爆発させた！どうなるか分からない！！"
    ],
    INTERFERENCE: [
      "💢 おっと！{name}、他馬と接触か！？大きな不利を受けた！！",
      "💢 厳しい！{name}、進路をカットされたか！立て直せるか！？",
      "💢 前が壁になった！{name}、行き場を失って大きく後退！！",
      "💢 あーっと、{name}がバランスを崩した！他馬の影響を受けたようです！！",
      "💢 {name}、馬場に脚を取られたか！？急激に失速！！",
      "💢 厳しい展開！{name}、スタミナ切れか足取りが重い！！",
      "💢 コース取りに失敗！{name}、外に膨らんでロスが出た！！",
      "💢 痛恨！{name}が包まれた！抜け出せるか！？",
      "💢 進路なし！{name}、身動きが取れない状況に追い込まれた！！"
    ],
    STAMINA_DEPLETED: [
      "😫 {name}、スタミナが切れたか！？足取りが急激に重くなった！！",
      "😫 {name}、ここで力尽きたか！完全に脚が止まってしまった！！",
      "😫 あーっと！{name}がバテてしまった！直線に入る前にスタミナ切れか！！",
      "😫 {name}、限界か！？ずるずると後退していく！！",
      "😫 厳しい！{name}、スタミナ温存が裏目に出たか、完全にガス欠です！！",
      "😫 {name}の脚が鉛のように重くなってきた！残り距離が遠すぎる！！",
      "😫 {name}、ここで止まってしまったか！体が限界を超えたようです！！"
    ],
    BREAKTHROUGH: [
      "💥 {name}が強引にこじ開けた！！馬群を割って突き進む！！",
      "💥 前が壁！？いや、{name}が力ずくで突破した！！",
      "💥 なんというパワーだ！{name}、密集地帯を弾き飛ばすように進出！！",
      "💥 {name}の重戦車のような突進！前詰まりを自らの力で打開した！！",
      "💥 押しのけた！{name}が圧倒的なパワーで活路を切り開く！！",
      "💥 怯まない！{name}が密集地帯でも馬群をかき分けて前へ！！"
    ],
    CORNER_BOOST: [
      "🌪️ {name}がコーナーで外から豪快にまくっていく！！",
      "🌪️ 勝負をかけたか！？{name}が一気に外からポジションを上げる！！",
      "🌪️ {name}が素晴らしい手応えで上がっていく！コーナーで加速だ！！",
      "🌪️ 力強い足取り！{name}がまくりを打って前を射程圏に捉える！！",
      "🌪️ コーナーを制した！{name}が外から一気に上がってきた！！",
      "🌪️ {name}が外を通って猛追！コーナーでのパワーが炸裂している！！"
    ],
    STAMINA_FADING: [
      "💦 {name}、少し足取りが怪しくなってきたか！？",
      "💦 {name}、苦しい表情だ！ジョッキーが必死に励ます！！",
      "💦 {name}、ここが正念場！スタミナが持つかどうかのギリギリの戦い！！",
      "💦 {name}の脚色が鈍ってきた！このまま持ちこたえられるか！！",
      "💦 {name}、苦しい！それでも諦めない！根性が試されている！！"
    ],
    HANA_ARASOI: [
      "🔥 激しいハナ争い！！{name}も一歩も譲らない！！",
      "🔥 {name}が意地でも先頭に行こうとする！！序盤から激しい消耗戦だ！！",
      "🔥 逃げ馬同士の意地のぶつかり合い！！{name}もガンガン飛ばしていく！！",
      "🔥 {name}が引かない！誰もハナを譲ろうとしない！これは共倒れの危機か！！",
      "🔥 壮絶なハナ争い！{name}が先頭の座を巡って激しくせり合う！！"
    ],
    GUTS: [
      "🔥 {name}、驚異の粘り！！根性を見せています！！",
      "🔥 負けられない！{name}、{jockey}騎手の叱咤に応えてもう一伸び！！",
      "🔥 ど根性だ！{name}、馬体を並べてからが勝負強い！！",
      "🔥 {name}、闘志に火がついた！！ライバルを突き放しにかかる！！",
      "🔥 これが本物の根性！{name}が誰よりも諦めない走りを見せている！！",
      "🔥 {name}、バテない！バテるわけにはいかない！魂の走りだ！！",
      "🔥 粘る粘る！{name}、限界を超えてもまだ前を向いている！！"
    ],
    RACE_SUMMARY: [
      "📋 激闘が幕を閉じました。全馬、素晴らしい走りを見せてくれました！！",
      "📋 レース終了！勝利の余韻に包まれる中、各馬が検量室へと向かいます！！",
      "📋 息を呑むような大接戦でした。これぞ競馬、これぞ名勝負！！",
      "📋 歓喜と落胆が交錯する競馬場。全力を出し切った馬たちに拍手を！！",
      "📋 鳴り止まない鼓動。歴史に名を刻む、素晴らしい一戦となりました！！",
      "📋 決着がつきました。勝った馬も敗れた馬も、すべてがヒーローです！！",
      "📋 素晴らしいドラマでした。この興奮は、しばらく冷めそうにありません！！",
      "📋 夢の続きはまた次へ。全力で駆け抜けたすべての戦士たちに敬意を！！",
      "📋 言葉はいりません。ただただ、この名勝負を目に焼き付けましょう！！",
      "📋 これにて全馬入線。新たな伝説の誕生を、私たちは目にしました！！",
      "📋 感動をありがとう。勝者も敗者も、全力を尽くした者に拍手を！！",
      "📋 レースが終わった。しかし、この興奮と感動は消えることがない！！",
      "📋 全馬、お疲れ様でした。また次の舞台で、その雄姿を見せてください！！"
    ],
    CHAMPION_MENTION: [
      "🏆 注目は{name}！圧倒的な実績を誇るこの馬が、格の違いを見せるか！！",
      "🏆 王者の風格、{name}！今日もその強さを見せつけてくれるのでしょうか！！",
      "🏆 強豪{name}、パドックから気合十分！勝利のみを見据えています！！",
      "🏆 幾多の激戦を潜り抜けてきた{name}。その経験がここでも活きるか！！",
      "🏆 さぁ、主役の登場だ！{name}がターフを支配するのか！！",
      "🏆 {name}の実力は折り紙付き！今日も王者の走りを見せてくれるか！！",
      "🏆 百戦錬磨の{name}！この舞台で再び頂点を目指す！！"
    ],
    STREAK_MENTION: [
      "🔥 絶好調！{name}は現在このルームで{wins}連勝中！！勢いが止まりません！！",
      "🔥 波に乗る{name}、今日も勝利を重ねるか！現在{wins}連勝の快進撃！！",
      "🔥 ルームの支配者、{name}！{wins}連勝という圧倒的な力を見せつけています！！",
      "🔥 {name}、負け知らずの{wins}連勝中！今日も1番人気に応えるか！！",
      "🔥 {wins}連勝の怪物、{name}！この記録をどこまで伸ばすのか！！",
      "🔥 止まらない！{name}が{wins}連勝でこのレースに臨む！記録更新なるか！！"
    ],
    LAST_WINNER_MENTION: [
      "🎖️ 前走の覇者、{name}！連勝を狙ってゲートに向かいます！！",
      "🎖️ 前回見事な勝利を挙げた{name}。その勢いは本物か、試練の一戦です！！",
      "🎖️ ディフェンディングチャンピオン、{name}！返り咲きを狙います！！",
      "🎖️ 先ほど素晴らしい走りを見せた{name}。二戦連続の栄冠を狙います！！",
      "🎖️ 前走の勝者{name}が連勝を賭けてここに！勢いは本物か！！",
      "🎖️ チャンピオンの証明！{name}が今日も最高の走りを見せてくれるか！！"
    ]
  };

  public static generateIntro(): string[] {
    return [this.pick("RACE_INTRO")];
  }

  public static generateSummary(): string[] {
    return [this.pick("RACE_SUMMARY")];
  }

  public static generate(stageIdx: number, sim: any, horses: any[], finishedHNs: Set<number> = new Set(), sessionWins: Record<number, number> = {}, lastWinnerHN: number | null = null): string[] {
    const stage = sim.stages[stageIdx];
    const events = stage.events || [];
    const lines: string[] = [];

    // 1. フェーズごとの基本実況
    if (stageIdx === 0) {
      if (sim.weather === "雨") lines.push(this.pick("RAIN"));
      if (sim.weather === "晴") lines.push(this.pick("SUNNY"));
      if (sim.weather === "曇") lines.push(this.pick("CLOUDY"));
      if (sim.weather === "雪") lines.push(this.pick("SNOW"));
      if (sim.field_condition === "重") lines.push(this.pick("HEAVY_FIELD"));
      if (sim.field_condition === "不良") lines.push(this.pick("BAD_FIELD"));

      lines.push(this.pick("GATE_OPEN"));
    } else if (stageIdx === 1) {
      const paceKey = sim.pace === "ハイペース" ? "PACE_HI" : sim.pace === "スローペース" ? "PACE_LOW" : "PACE_MID";
      lines.push(this.pick(paceKey));
      
      const leader = stage.sorted_horses[0];
      const leaderData = horses.find(h => h.horse_number === leader?.horse_number);
      if (leaderData && !finishedHNs.has(leader.horse_number)) lines.push(this.pick("LEADER", { name: leaderData.name, jockey: leaderData.jockey_name }));
    } else if (stage.stage_name === "middle") {
      lines.push(this.pick("MIDDLE"));
      const leader = stage.sorted_horses[0];
      const second = stage.sorted_horses[1];
      const leaderData = horses.find(h => h.horse_number === leader?.horse_number);
      const secondData = horses.find(h => h.horse_number === second?.horse_number);
      if (leaderData && secondData && !finishedHNs.has(leader.horse_number) && !finishedHNs.has(second.horse_number)) {
        if (Math.random() > 0.5) {
          lines.push(`${leaderData.name}が依然として先頭！ピッタリと${secondData.name}がマークする！`);
        } else {
          if (stage.sorted_horses.length > 3) {
            const mid = stage.sorted_horses[Math.floor(stage.sorted_horses.length / 2)];
            const midData = horses.find(h => h.horse_number === mid?.horse_number);
            if (midData && !finishedHNs.has(mid.horse_number)) {
              lines.push(this.pick("CHASING", { name: midData.name, jockey: midData.jockey_name, pos: (Math.floor(stage.sorted_horses.length / 2) + 1).toString() }));
            }
          }
        }
      }
    } else if (stage.stage_name === "corner3") {
      lines.push(this.pick("CORNER3"));
    } else if (stage.stage_name === "final_corner") {
      lines.push(this.pick("FINAL_CORNER"));
    } else if (stage.stage_name === "homestretch_early" || stage.stage_name === "homestretch_final") {
      if (Math.random() > 0.3) lines.push(this.pick("HOMESTRETCH"));
      if (Math.random() > 0.7) lines.push(this.pick("CROWD_ROAR"));
    } else if (stageIdx % 2 === 0 && stageIdx < sim.stages.length - 2) {
      const leader = stage.sorted_horses[0];
      const second = stage.sorted_horses[1];
      const leaderData = horses.find(h => h.horse_number === leader?.horse_number);
      const secondData = horses.find(h => h.horse_number === second?.horse_number);
      if (leaderData && secondData && !finishedHNs.has(leader.horse_number) && !finishedHNs.has(second.horse_number)) {
        const r = Math.random();
        if (r > 0.6) {
          lines.push(`${leaderData.name}が依然として先頭！ピッタリと${secondData.name}がマークする！`);
        } else {
          if (stage.sorted_horses.length > 3) {
            const mid = stage.sorted_horses[Math.floor(stage.sorted_horses.length / 2)];
            const midData = horses.find(h => h.horse_number === mid?.horse_number);
            if (midData && !finishedHNs.has(mid.horse_number)) {
              lines.push(this.pick("CHASING", { name: midData.name, jockey: midData.jockey_name, pos: (Math.floor(stage.sorted_horses.length / 2) + 1).toString() }));
            }
          }
        }
      }
    }

    // 2. イベント実況
    events.forEach((ev: CommentaryEvent) => {
      if (finishedHNs.has(ev.horse_number)) return;

      const stageHorse = stage.sorted_horses.find((h: any) => h.horse_number === ev.horse_number);
      const rank = stageHorse?.position ?? 10;
      
      // スタミナ切れ実況は上位5頭のみ（スパム防止）
      if (ev.type === "stamina_depleted" || ev.type === "stamina_fading") {
         if (rank >= 6) return;
      }

      if (ev.type === "good_start") lines.push(this.pick("GOOD_START", { name: ev.horse_name, jockey: ev.jockey_name }));
      if (ev.type === "bad_start") lines.push(this.pick("BAD_START", { name: ev.horse_name, jockey: ev.jockey_name }));
      if (ev.type === "last_spurt") lines.push(this.pick("LAST_SPURT", { name: ev.horse_name, jockey: ev.jockey_name }));
      if (ev.type === "wild_explosion") lines.push(this.pick("WILD_EXPLOSION", { name: ev.horse_name, jockey: ev.jockey_name }));
      if (ev.type === "wild_control_lost") lines.push(this.pick("WILD_CONTROL_LOST", { name: ev.horse_name, jockey: ev.jockey_name }));
      if (ev.type === "interference") lines.push(this.pick("INTERFERENCE", { name: ev.horse_name, jockey: ev.jockey_name }));
      if (ev.type === "breakthrough") lines.push(this.pick("BREAKTHROUGH", { name: ev.horse_name, jockey: ev.jockey_name }));
      if (ev.type === "corner_boost") lines.push(this.pick("CORNER_BOOST", { name: ev.horse_name, jockey: ev.jockey_name }));
      if (ev.type === "guts_display") lines.push(this.pick("GUTS", { name: ev.horse_name, jockey: ev.jockey_name }));
      if (ev.type === "stamina_depleted") lines.push(this.pick("STAMINA_DEPLETED", { name: ev.horse_name, jockey: ev.jockey_name }));
      if (ev.type === "stamina_fading") lines.push(this.pick("STAMINA_FADING", { name: ev.horse_name, jockey: ev.jockey_name }));
      if (ev.type === "hana_arasoi") lines.push(this.pick("HANA_ARASOI", { name: ev.horse_name, jockey: ev.jockey_name }));
      if (ev.type === "overtake") lines.push(this.pick("OVERTAKE", { name: ev.horse_name, target: ev.target_name }));
      if (ev.type === "leader_change") lines.push(this.pick("LEADER_CHANGE", { name: ev.horse_name }));
      if (ev.type === "lead_big") lines.push(this.pick("LEAD_BIG", { name: ev.horse_name }));
      if (ev.type === "lead_close") lines.push(this.pick("LEAD_CLOSE", { name: ev.horse_name }));
      if (ev.type === "pos_up") lines.push(this.pick("POS_UP", { name: ev.horse_name, jockey: ev.jockey_name }));
    });

    // 3. 人気馬への言及
    if (stageIdx >= 2 && stageIdx % 2 === 0) {
      const favorite = horses.find(h => h.popularity === 1);
      if (favorite && !finishedHNs.has(favorite.horse_number)) {
        const stageHorse = stage.sorted_horses.find((h: any) => h.horse_number === favorite.horse_number);
        if (stageHorse) {
          const rank = stageHorse.position;
          const r = Math.random();
          if (rank <= 3 && r > 0.5) {
            lines.push(this.pick("FAVORITE_MOVE", { name: favorite.name, jockey: favorite.jockey_name }));
          } else if (rank > 6 && r > 0.5) {
            lines.push(this.pick("FAVORITE_STRUGGLE", { name: favorite.name, jockey: favorite.jockey_name }));
          }
        }
      }
    }

    // 4. 実績馬への言及
    if (stageIdx === 0 && Math.random() > 0.3) {
      const champion = horses.find(h => (h.rating || 0) > 1200 || (h.wins || 0) >= 5);
      if (champion) {
        lines.push(this.pick("CHAMPION_MENTION", { name: champion.name }));
      }
    }

    // 5. セッション内のストーリー（連勝、前走勝者）
    if (stageIdx === 0 && Math.random() > 0.4) {
      const streaker = horses.find(h => (sessionWins[h.horse_number] || 0) >= 2);
      if (streaker) {
        const sWins = (sessionWins[streaker.horse_number] || 0).toString();
        lines.push(this.pick("STREAK_MENTION", { name: streaker.name, wins: sWins }));
      } else if (lastWinnerHN !== null) {
        const lastWinner = horses.find(h => h.horse_number === lastWinnerHN);
        if (lastWinner) {
          lines.push(this.pick("LAST_WINNER_MENTION", { name: lastWinner.name }));
        }
      }
    }

    return lines;
  }

  public static generateFinish(winner: any, popularity: number = 1): string[] {
    const lines: string[] = [];
    lines.push(this.pick("GOAL"));
    lines.push(this.pick("WINNER", { name: winner.name, jockey: (winner as any).jockey_name }));
    if (popularity >= 5) {
      lines.push(this.pick("UPSET"));
    }
    return lines;
  }

  public static pick(key: string, vars: Record<string, string> = {}): string {
    const list = this.PHRASES[key];
    if (!list) return "";
    let text = list[Math.floor(Math.random() * list.length)];
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{${k}}`, 'g'), String(v));
    }
    return text;
  }
}
