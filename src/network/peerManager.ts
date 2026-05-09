import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { useGameStore } from '../store/gameStore';

export class PeerManager {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  public myPeerId: string | null = null;
  /** ゲスト側がホストへの接続を保持するための参照 */
  private hostPeerId: string | null = null;
  private guestCoins: Map<string, number> = new Map();
  private guestTitles: Map<string, { name: string; id: string }> = new Map();
  // Imp-3: ホスト未接続時のメッセージキュー
  private messageQueue: any[] = [];

  private getPeerConfig() {
    return {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
        ],
        iceCandidatePoolSize: 10,
      }
    };
  }

  public async createRoom(requestedId?: string): Promise<string> {
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.hostPeerId = null;

    return new Promise((resolve, reject) => {
      // PeerJS: ID を自動生成するには第1引数を省略する
      this.peer = requestedId ? new Peer(requestedId, this.getPeerConfig() as any) : new Peer(this.getPeerConfig() as any);

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000);

      this.peer.on('open', (id) => {
        clearTimeout(timeout);
        this.myPeerId = id;
        console.log('[PeerManager] Host Peer ID:', id);
        this.setupPeerHandlers();
        setTimeout(() => this.updateParticipantsOnHost(), 500);
        resolve(id);
      });

      this.peer.on('error', (err) => {
        clearTimeout(timeout);
        console.error('[PeerManager] Peer Error:', err);
        reject(err);
      });
    });
  }

  public async joinRoom(roomId: string, retryCount = 3): Promise<void> {
    const store = useGameStore.getState();

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        await new Promise<void>((resolve, reject) => {
          let settled = false;
          const settle = (fn: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(connTimeout);
            fn();
          };

        this.disconnect();
          this.peer = new Peer(this.getPeerConfig());

          let connTimeout: ReturnType<typeof setTimeout>;

          this.peer.on('open', (id) => {
            this.myPeerId = id;
            this.peer!.on('disconnected', () => this.peer?.reconnect());

            const hasDebt = store.debtAmount > 0;
            const conn = this.peer!.connect(roomId, {
              metadata: {
                playerName: store.playerName,
                playerTitle: hasDebt ? '負け犬' : (store.playerTitle === '称号コレクター' ? `${store.ownedTitles.length}冠の覇者` : store.playerTitle),
                playerTitleId: hasDebt ? 'debt_loser' : store.playerTitleId
              },
              reliable: true
            });

            connTimeout = setTimeout(() => {
              settle(() => reject(new Error('Connection timeout')));
            }, 15000);

            conn.on('open', () => {
              console.log('[PeerManager] Connected to host:', roomId);
              this.hostPeerId = roomId;
              this.connections.set(roomId, conn);
              this.setupConnectionHandlers(conn);

              // Imp-11, 14: 接続確立直後に自分のコインをホストに送信する
              conn.send({ type: 'coins_update', coins: store.myCoins });

              // Imp-3: キューに溜まっていたメッセージを一括送信
              while (this.messageQueue.length > 0) {
                const queuedData = this.messageQueue.shift();
                console.log(`[PeerManager] Sending queued ${queuedData.type} to host`);
                conn.send(queuedData);
              }

              settle(() => resolve());
            });

            conn.on('error', (err) => settle(() => reject(err)));
          });

          this.peer.on('error', (err) => settle(() => reject(err)));
        });
        return; // 成功
      } catch (err) {
        console.warn(`[PeerManager] joinRoom attempt ${attempt} failed:`, err);
        if (attempt === retryCount) throw err;
        await new Promise(r => setTimeout(r, 1000 * attempt)); // 指数バックオフ
      }
    }
  }

  public disconnect() {
    this.connections.forEach(conn => conn.close());
    this.connections.clear();
    this.guestCoins.clear();
    this.guestTitles.clear();
    this.messageQueue = [];
    this.hostPeerId = null;
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }

  private setupPeerHandlers() {
    if (!this.peer) return;

    this.peer.on('connection', (conn) => {
      conn.on('open', () => {
        const store = useGameStore.getState();
        if (store.participants.length >= store.roomSettings.participantLimit && !this.connections.has(conn.peer)) {
          conn.send({ type: 'room_full' });
          setTimeout(() => conn.close(), 500);
          return;
        }
        console.log('[PeerManager] New guest connection:', conn.peer);
        this.connections.set(conn.peer, conn);
        this.setupConnectionHandlers(conn);
        setTimeout(() => {
          this.updateParticipantsOnHost();
          this.syncInitialState(conn);
        }, 1000);
      });
    });

    this.peer.on('disconnected', () => this.peer?.reconnect());
  }

  private setupConnectionHandlers(conn: DataConnection) {
    // Imp-1: ハートビート監視
    let lastPing = Date.now();
    const heartbeatInterval = setInterval(() => {
      if (conn.open) {
        conn.send({ type: 'ping' });
      }
      if (Date.now() - lastPing > 15000) { // 15秒応答なしで切断扱い
        console.warn('[PeerManager] Heartbeat timeout for:', conn.peer);
        clearInterval(heartbeatInterval);
        if (!ended) {
          conn.close();
        }
      }
    }, 5000);

    conn.on('data', (data: any) => {
      if (data?.type === 'ping') {
        if (conn.open) conn.send({ type: 'pong' });
        return;
      }
      if (data?.type === 'pong') {
        lastPing = Date.now();
        return;
      }
      lastPing = Date.now();
      console.log(`[PeerManager] Received ${data?.type} from ${conn.peer}`);
      this.handleIncomingData(conn.peer, data);
    });

    let ended = false;
    const onEnd = () => {
      if (ended) return;
      ended = true;
      clearInterval(heartbeatInterval);
      console.warn('[PeerManager] Connection lost with:', conn.peer);
      this.connections.delete(conn.peer);
      const store = useGameStore.getState();
      if (store.role === 'guest' && conn.peer === this.hostPeerId) {
        const oldParticipants = store.participants;
        // ホスト切断時はゲスト側の participants もクリア
        store.updateParticipants([]);
        this.handleHostLoss(oldParticipants);
      } else {
        this.updateParticipantsOnHost();
      }
    };

    conn.on('close', onEnd);
    conn.on('error', onEnd);
  }

  private async handleHostLoss(oldParticipants: any[]) {
    const store = useGameStore.getState();
    if (!store.roomSettings.hostMigration) return;

    // host を除外し、自分が残っているゲストリストから次のホストを決定
    const others = oldParticipants.filter(p => p.id !== 'host');
    if (others.length === 0) return;

    const nextLeader = others[0];
    if (nextLeader.id === this.myPeerId) {
      try {
        // 自分が新しいホストになる。元のPeerIDを引き継ぐことで他ゲストから再接続可能にする
        await this.createRoom(this.myPeerId || undefined);
        store.setRole('host', this.myPeerId || 'host');
        store.addChatMessage({ id: 'sys-' + Date.now(), sender: 'SYSTEM', text: 'ホストとして引き継ぎました。', timestamp: Date.now() });
      } catch (e) { console.error(e); }
    } else {
      setTimeout(() => {
        this.joinRoom(nextLeader.id).then(() => store.setRole('guest', nextLeader.id)).catch(console.error);
      }, 3000); // 新ホストの準備を3秒待つ
    }
  }

  private syncInitialState(conn: DataConnection) {
    if (!conn.open) return;
    const store = useGameStore.getState();
    console.log('[PeerManager] Syncing full state to new guest');
    conn.send({
      type: 'sync_full_state',
      phase: store.phase,
      settings: store.roomSettings,
      horses: store.horses,
      raceData: store.raceData,
      bettingEndTime: store.bettingEndTime,
      raceStartTime: store.raceStartTime,
      participants: store.participants,
      win5Data: store.win5Data,
      roomCarryover: store.roomCarryover,
      sessionHorseWins: store.sessionHorseWins,
      lastWinnerHN: store.lastWinnerHN
    });
  }

  private handleIncomingData(peerId: string, data: any) {
    if (!data || !data.type) return;
    const store = useGameStore.getState();

    switch (data.type) {
      case 'sync_full_state':
      case 'phase_start':
        console.log('[PeerManager] Processing atomic state update:', data.phase);

        const nextSettings = data.settings || data.roomSettings;
        const isMidGame = (data.phase === 'betting' || data.phase === 'race');
        const shouldSpectate = data.type === 'sync_full_state' && isMidGame;

        if ((data.phase === 'betting' || data.phase === 'setup' || data.phase === 'lobby') && store.phase !== data.phase) {
          useGameStore.getState().resetBets();
          useGameStore.getState().clearNpcChatMessages();
        }

        useGameStore.setState((s) => ({
          ...s,
          ...(nextSettings ? { roomSettings: { ...s.roomSettings, ...nextSettings } } : {}),
          ...(data.horses ? { horses: data.horses } : {}),
          ...(data.raceData ? { raceData: data.raceData } : {}),
          ...(data.bettingEndTime ? { bettingEndTime: data.bettingEndTime } : {}),
          ...(data.raceStartTime ? { raceStartTime: data.raceStartTime } : {}),
          ...(data.participants ? { participants: data.participants } : {}),
          ...(data.phase ? { phase: data.phase } : {}),
          ...(data.win5Data !== undefined ? { win5Data: data.win5Data } : {}),
          ...(data.roomCarryover !== undefined ? { roomCarryover: data.roomCarryover } : {}),
          ...(data.sessionHorseWins !== undefined ? { sessionHorseWins: data.sessionHorseWins } : {}),
          ...(data.lastWinnerHN !== undefined ? { lastWinnerHN: data.lastWinnerHN } : {}),
          isSpectator: data.phase === 'betting' ? false : (s.isSpectator || shouldSpectate)
        }));
        break;
      case 'chat':
        store.addChatMessage(data.msg);
        // ホストはリレーする（ただし送信元には送らない）
        if (store.role === 'host') this.broadcastExcept(data, peerId);
        break;
      case 'update_room_settings':
        store.setRoomSettings(data.settings);
        break;
      case 'participants_update':
        store.updateParticipants(data.participants);
        break;
        break;
      // Imp-13: ゲストから 'vote' が来たときホストが集計して rematchVotes を更新し、全員に共有
      case 'vote':
        if (store.role === 'host') {
          const votes = useGameStore.getState().rematchVotes;
          const cleaned = {
            continue: votes.continue.filter((id: string) => id !== peerId),
            end: votes.end.filter((id: string) => id !== peerId),
          };
          if (data.vote === 'continue') cleaned.continue.push(peerId);
          else if (data.vote === 'end') cleaned.end.push(peerId);
          store.setRematchVotes(cleaned);
          this.broadcast({ type: 'vote_update', votes: cleaned });
        }
        break;
      case 'vote_update':
        store.setRematchVotes(data.votes);
        break;
      // Imp-5: ベットが入った/キャンセルされたらオッズを再計算してブロードキャスト
      case 'place_bet':
        if (store.role === 'host') {
          const nextPool = [...store.hostBetPool, data.bet];
          store.setHostBetPool(nextPool);

          // WIN5の購入なら賞金プールに加算
          if (data.bet.bet_type === 'WIN5' && store.win5Data) {
            const nextWin5 = { ...store.win5Data, totalPrize: store.win5Data.totalPrize + data.bet.amount };
            store.setWin5Data(nextWin5);
            // オッズと一緒にWIN5状態もブロードキャスト
            this.broadcast({ type: 'win5_update', data: nextWin5 });
          }

          this.recalculateAndBroadcastOdds(nextPool);
        }
        break;
      case 'cancel_bet':
        if (store.role === 'host') {
          const nextPool = store.hostBetPool.filter(b => b.id !== data.betId);
          store.setHostBetPool(nextPool);
          this.recalculateAndBroadcastOdds(nextPool);
        }
        break;
      case 'odds_update':
        store.updateHorses(data.horses);
        break;
      case 'title_update':
      case 'update_profile':
        if (store.role === 'host') {
          const tName = data.name || data.title;
          const tId = data.id || 'unknown';
          if (tName) {
            this.guestTitles.set(peerId, { name: tName, id: tId });
            this.updateParticipantsOnHost();
          }
        }
        break;
      case 'coins_update':
        // ゲストが自分のコインをホストに報告する → Map に記録して参加者リストを更新
        if (store.role === 'host') {
          this.guestCoins.set(peerId, data.coins);
          this.updateParticipantsOnHost();
        }
        break;
      case 'room_full':
        alert('参加しようとしたルームは満員です。');
        useGameStore.getState().setPhase('login');
        this.disconnect();
        break;
      case 'win5_start':
        store.setWin5Data(data.data);
        if (data.settings) store.setRoomSettings(data.settings);
        store.addChatMessage({ id: 'win5-' + Date.now(), sender: 'SYSTEM', text: '🏆 WIN5が開催されました！', timestamp: Date.now() });
        break;
      case 'win5_update':
        store.setWin5Data(data.data);
        if (store.role === 'host') this.broadcastExcept(data, peerId);
        break;
      case 'win5_carryover_update':
        store.setRoomCarryover(data.val);
        break;

      case 'join_win5':
        if (store.role === 'host' && store.win5Data) {
          const nextData = {
            ...store.win5Data,
            survivors: [...store.win5Data.survivors, data.playerId],
            totalPrize: store.win5Data.totalPrize + data.amount
          };
          store.setWin5Data(nextData);
          this.broadcast({ type: 'win5_update', data: nextData });

          const player = store.participants.find(p => p.id === data.playerId);
          const msg = {
            id: 'join-win5-' + Date.now(),
            sender: 'SYSTEM',
            text: `🏆 ${player?.name || 'ゲスト'}さんがWIN5に参加しました！現在の賞金: ${nextData.totalPrize}C`,
            timestamp: Date.now()
          };
          store.addChatMessage(msg);
          this.broadcast({ type: 'chat', msg });
        }
        break;
      case 'win5_cashout':
        if (store.role === 'host' && store.win5Data) {
          const nextData = {
            ...store.win5Data,
            survivors: store.win5Data.survivors.filter(id => id !== data.playerId),
            totalPrize: Math.max(0, store.win5Data.totalPrize - (data.amount || 0))
          };
          store.setWin5Data(nextData);
          this.broadcast({ type: 'win5_update', data: nextData });

          const player = store.participants.find(p => p.id === data.playerId);
          const msg = {
            id: 'cashout-win5-' + Date.now(),
            sender: 'SYSTEM',
            text: `💸 ${player?.name || 'ゲスト'}さんがWIN5からキャッシュアウトしました（${data.amount || 0}C獲得）。現在の賞金: ${nextData.totalPrize}C`,
            timestamp: Date.now()
          };
          store.addChatMessage(msg);
          this.broadcast({ type: 'chat', msg });
        }
        break;
      // Imp-16: 不明なメッセージタイプを受け取った場合のログ
      default:
        console.warn('[PeerManager] Unknown message type:', data.type);
        break;
    }
  }

  // Imp-5: ホストによるオッズ再計算とブロードキャスト
  public async recalculateAndBroadcastOdds(pool: any[]) {
    const store = useGameStore.getState();
    const { oddsCalculator } = await import('../core/odds_calculator');
    // オッズ計算は現在の馬データとプール全体から算出する
    const updatedHorses = oddsCalculator.updateOddsWithBets([...store.horses], pool);
    store.updateHorses(updatedHorses);
    this.broadcast({ type: 'odds_update', horses: updatedHorses });
  }

  public reportTitleToHost(name: string, id: string) {
    const store = useGameStore.getState();
    if (store.role === 'host') {
      this.updateParticipantsOnHost();
    } else if (this.hostPeerId) {
      this.sendToHost({ type: 'title_update', name, id });
    }
  }

  public updateParticipantsOnHost() {
    // ステートの更新が反映されるのを僅かに待ってからリストを作成する (Race Condition 対策)
    setTimeout(() => {
      const store = useGameStore.getState();
      if (store.role !== 'host') return;

      const hasDebt = store.debtAmount > 0;
      const list = [
        {
          id: this.myPeerId || 'host',
          name: store.playerName,
          title: hasDebt ? '負け犬' : store.playerTitle,
          titleId: hasDebt ? 'debt_loser' : (store.playerTitleId || 'beginner'),
          coins: store.myCoins
        },
        ...Array.from(this.connections.entries()).map(([id, conn]) => ({
          id: id,
          name: (conn.metadata as any)?.playerName || 'Guest',
          title: this.guestTitles.get(id)?.name || (conn.metadata as any)?.playerTitle || '初心者',
          titleId: this.guestTitles.get(id)?.id || (conn.metadata as any)?.playerTitleId || 'beginner',
          coins: this.guestCoins.get(id) ?? 10000,
        }))
      ];
      store.updateParticipants(list);
      this.broadcast({ type: 'participants_update', participants: list });
    }, 50);
  }


  public broadcast(data: any) {
    if (!this.peer || this.peer.destroyed) return;
    console.log(`[PeerManager] Broadcasting ${data.type} to ${this.connections.size} connections`);
    this.connections.forEach(conn => { if (conn.open) conn.send(data); });
  }

  /** 特定 peerId を除いてブロードキャスト（chatリレー等で送信元に再送しないため） */
  private broadcastExcept(data: any, excludePeerId: string) {
    if (!this.peer || this.peer.destroyed) return;
    this.connections.forEach((conn, id) => {
      if (id !== excludePeerId && conn.open) conn.send(data);
    });
  }

  public sendToHost(data: any) {
    const store = useGameStore.getState();
    if (store.role === 'host') {
      // ホスト自身が送る場合は直接処理（自分自身はbroadcastExceptで除外されるのでOK）
      this.handleIncomingData(this.myPeerId || 'host', data);
      return;
    }
    const hostConn = this.hostPeerId ? this.connections.get(this.hostPeerId) : null;
    if (hostConn && hostConn.open) {
      console.log(`[PeerManager] Sending ${data.type} to host`);
      hostConn.send(data);
    } else {
      console.log(`[PeerManager] sendToHost: Connection not ready, queuing ${data.type}`);
      this.messageQueue.push(data);
      if (this.messageQueue.length > 50) {
        this.messageQueue.shift();
      }
    }
  }

  /** ゲストが自分のコインをホストに報告してparticipantsを更新させる */
  public reportCoinsToHost(coins: number) {
    const store = useGameStore.getState();
    if (store.role === 'guest') {
      // ホスト側で guestCoins Map に記録されるよう coins_update を送る
      this.sendToHost({ type: 'coins_update', coins });
    }
  }
}

export const peerManager = new PeerManager();
