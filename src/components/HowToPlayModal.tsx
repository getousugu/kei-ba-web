interface HowToPlayModalProps {
  onClose: () => void;
}

const betTypes = [
  ['単勝', '選んだ1頭が1着'],
  ['複勝', '選んだ1頭が3着以内'],
  ['馬連', '1・2着の2頭を順不同で的中'],
  ['ワイド', '選んだ2頭がどちらも3着以内'],
  ['馬単', '1・2着を着順どおり的中'],
  ['3連複', '1～3着の3頭を順不同で的中'],
  ['3連単', '1～3着を着順どおり的中'],
];

const sections = [
  ['1. まずはレースに参加', '名前と称号を決めたら、自分でルームを作るか、受け取ったルームコードを入力して参加します。ひとりで遊ぶ場合もルーム作成で始められます。中央競馬場はルーム設定を使わず、サーバーの実時間に合わせて定期開催されます。'],
  ['2. レース開催設定', 'ホストは出走頭数、距離、馬場、天候、コース、馬券受付時間などを決めます。「レースの盛り上がりを追加する」は着順や走破タイムを変えず、見た目の競り合いやドラマだけを加えます。迷ったときはおまかせ設定で問題ありません。'],
  ['3. 馬カードの見方', 'オッズが低いほど人気馬です。能力、調子、脚質、距離適性、馬場適性を合わせて予想します。逃げは前、先行は好位、差し・追込は後方から進みやすい傾向がありますが、展開、距離、消耗によって結果は変わります。中央の馬には通算成績とは別に中央獲得賞金があります。'],
  ['4. 馬券を買う', '券種と馬を選び、購入額を入力します。受付締切までは購入済み馬券の取消・買い直しができます。オッズと払戻見込を確認し、所持金を使い切らないようにしましょう。BOXは選んだ馬の全組合せ、ながしは軸馬から相手へまとめて買う方法です。'],
  ['5. レースを見る', '発走後は表示を「馬」または「丸」に切り替えられます。丸表示は馬番の把握、馬表示はレースの臨場感に向いています。カメラは自動・全体・先頭・注目馬から選択でき、注目馬は複数選べます。際どい決着では、全馬入線後に実際の決勝線通過場面を使った写真判定が始まります。'],
  ['6. 結果とリプレイ', '確定着順、払戻、購入した馬券の的中状況を確認できます。ハイライトではレース全編を再生でき、重要場面にも移動できます。通常ルームでは次のレースを続けるか投票します。中央では次回開催へ戻ります。'],
  ['7. 中央競馬場', '中央は5分ごとに発走し、毎時00分はG1です。締切と発走はサーバー時刻が基準です。レースを最後まで見なくても購入情報は保存され、次回起動時に確定結果に応じて自動精算されます。接続が切れた場合は、少し待って入り直してください。'],
  ['8. WIN5・名付け馬・称号', 'WIN5は5レース連続で1着馬を当てるモードです。途中でキャッシュアウトするか、最後まで挑戦できます。ホームの名付け馬作成では自分の馬を馬プールへ加えられます。レース参加、的中、払戻、特殊な展開などで称号が増え、ホームで付け替えられます。'],
];

export default function HowToPlayModal({ onClose }: HowToPlayModalProps) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6 animate-fade-in">
      <button type="button" aria-label="遊び方を閉じる" className="absolute inset-0 bg-black/85 backdrop-blur-md" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-[30px] border border-indigo-400/20 bg-[#131316] shadow-2xl shadow-indigo-950/40">
        <div className="flex items-start justify-between gap-4 border-b border-white/5 bg-gradient-to-r from-indigo-500/10 via-violet-500/5 to-transparent px-6 py-5 sm:px-8">
          <div>
            <div className="text-[9px] font-black tracking-[0.28em] text-indigo-400/70">HOW TO PLAY</div>
            <h2 className="mt-1 text-2xl font-black text-white">けいーばの遊び方</h2>
            <p className="mt-2 text-xs font-bold text-gray-500">予想して、賭けて、レースを見届ける競馬ゲームです。</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-lg font-black text-gray-400 transition hover:bg-white/10 hover:text-white">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-8 custom-scrollbar">
          <div className="grid gap-4 md:grid-cols-2">
            {sections.map(([title, body]) => (
              <section key={title} className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-5">
                <h3 className="text-sm font-black text-indigo-300">{title}</h3>
                <p className="mt-2 text-[11px] font-bold leading-6 text-gray-400">{body}</p>
              </section>
            ))}
          </div>

          <section className="mt-4 rounded-2xl border border-amber-400/15 bg-amber-400/[0.035] p-5">
            <h3 className="text-sm font-black text-amber-300">馬券の種類</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {betTypes.map(([name, description]) => (
                <div key={name} className="rounded-xl border border-white/5 bg-black/20 p-3">
                  <div className="text-xs font-black text-white">{name}</div>
                  <div className="mt-1 text-[10px] font-bold leading-relaxed text-gray-500">{description}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-4 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.035] p-5">
            <h3 className="text-sm font-black text-emerald-300">予想のヒント</h3>
            <ul className="mt-3 space-y-2 text-[11px] font-bold leading-relaxed text-gray-400">
              <li>・人気だけでなく、距離適性・馬場適性・調子・脚質の組合せを見る。</li>
              <li>・同じ馬でも展開次第で走りが変わる。結果画面のリプレイで敗因を探す。</li>
              <li>・高配当ほど的中は難しい。複勝やワイドと組み合わせて買い方を調整する。</li>
              <li>・写真判定中の映像は決勝線通過時の記録。演出によって着順が入れ替わることはありません。</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
