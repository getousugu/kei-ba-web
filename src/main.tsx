import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initLocalPlayer, db } from './db/db.ts'
import { useGameStore } from './store/gameStore.ts'

// コインのバグ修正: 起動時にDBを初期化し、保存されたコインをストアに反映する
async function bootstrap() {
  await initLocalPlayer();
  const me = await db.players.get('me');
  if (me) {
    const { roomCoinsInitialized } = useGameStore.getState();
    // coinRule が 'global' の場合のみ DB のコインを読み込む（room モード時は10000固定）
    if (!roomCoinsInitialized) {
      useGameStore.setState({ myCoins: me.global_coins });
    }
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

bootstrap();
