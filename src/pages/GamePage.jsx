import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Chessboard } from 'react-chessboard';
import { START_FEN, buildJoinPayload, createMovePayload, getGamePlayers, getLiveClocks } from '../lib/game';
import { supabase } from '../lib/supabase';
import { formatClock } from '../lib/timeControls';
import { useAuth } from '../contexts/AuthContext';

export default function GamePage() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const timeoutHandledRef = useRef(false);
  const previousTurnRef = useRef(null);
  const notificationPermissionRequestedRef = useRef(false);

  const fetchGame = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('games')
      .select(`
        *,
        white_profile:profiles!games_white_player_id_fkey(id, username, display_name, avatar_url),
        black_profile:profiles!games_black_player_id_fkey(id, username, display_name, avatar_url)
      `)
      .eq('id', gameId)
      .single();

    if (fetchError) throw fetchError;
    return data;
  }, [gameId]);

  const loadGame = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError('');
    }

    try {
      const data = await fetchGame();
      setGame((current) => {
        if (!current) return data;
        if ((data?.updated_at || '') >= (current?.updated_at || '')) return data;
        return current;
      });
      timeoutHandledRef.current = false;
    } catch (err) {
      if (!silent) {
        setError(err.message || 'No fue posible cargar la partida.');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [fetchGame]);

  useEffect(() => {
    loadGame();
  }, [loadGame]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

  const notifyTurn = useCallback(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted' || !document.hidden) return;

    const note = new Notification('Tu turno', {
      body: 'Ya puedes mover en la partida.',
      tag: `game-turn-${gameId}`,
      renotify: true,
    });

    note.onclick = () => {
      window.focus();
      note.close();
    };
  }, [gameId]);

  const requestNotificationPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;

    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`game-${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, async () => {
        await loadGame({ silent: true });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId, loadGame]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      loadGame({ silent: true });
    }, 1200);

    return () => window.clearInterval(interval);
  }, [loadGame]);

  useEffect(() => {
    if (!user || notificationPermissionRequestedRef.current) return;
    notificationPermissionRequestedRef.current = true;
    requestNotificationPermission().catch(() => {});
  }, [user, requestNotificationPermission]);

  const { myColor, opponentId } = useMemo(
    () => (game && user ? getGamePlayers(game, user.id) : { myColor: null, opponentId: null }),
    [game, user]
  );

  const liveClocks = useMemo(() => (game ? getLiveClocks(game, now) : { white: 0, black: 0 }), [game, now]);
  const isMyTurn = game && game.status === 'active' && ((game.current_turn === 'w' && myColor === 'white') || (game.current_turn === 'b' && myColor === 'black'));
  const canJoin =
    game &&
    game.status === 'waiting' &&
    !myColor &&
    (!game.invited_username || game.invited_username === profile?.username);
  const whiteName = game?.white_profile?.display_name || game?.white_profile?.username || 'Pendiente';
  const blackName = game?.black_profile?.display_name || game?.black_profile?.username || 'Pendiente';
  const shareLink = typeof window !== 'undefined' ? `${window.location.origin}/game/${gameId}` : '';
  const opponentName = opponentId
    ? myColor === 'white'
      ? game?.black_profile?.display_name || game?.black_profile?.username
      : game?.white_profile?.display_name || game?.white_profile?.username
    : null;

  const lastMove = Array.isArray(game?.moves_json) && game.moves_json.length ? game.moves_json[game.moves_json.length - 1] : null;
  const lastMoveIsOpponent =
    lastMove && myColor ? (lastMove.color === 'w' && myColor === 'black') || (lastMove.color === 'b' && myColor === 'white') : Boolean(lastMove);
  const highlightedSquares = lastMove && lastMoveIsOpponent
    ? {
        [lastMove.from]: { backgroundColor: 'rgba(250, 204, 21, 0.35)' },
        [lastMove.to]: { backgroundColor: 'rgba(250, 204, 21, 0.55)' },
      }
    : {};

  const updateGameAndSync = async (payload, extraFilters = {}) => {
    setGame((current) => (current ? { ...current, ...payload } : current));

    let query = supabase.from('games').update(payload).eq('id', gameId);

    Object.entries(extraFilters).forEach(([key, value]) => {
      query = query.eq(key, value);
    });

    const { error: updateError } = await query;
    if (updateError) {
      await loadGame({ silent: true });
      throw updateError;
    }

    await loadGame({ silent: true });
  };

  const finishGame = async (payload) => {
    await updateGameAndSync(payload);
  };

  const handleJoinGame = async () => {
    setActionLoading(true);
    setError('');

    try {
      if (!game || !user) return;
      const joinPayload = buildJoinPayload(game, user.id);
      const nowIso = new Date().toISOString();

      const payload = {
        ...joinPayload,
        status: 'active',
        started_at: nowIso,
        turn_started_at: nowIso,
      };

      await updateGameAndSync(payload, { status: 'waiting' });
    } catch (err) {
      setError(err.message || 'No fue posible entrar a la partida.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      alert('Enlace copiado.');
    } catch {
      alert(shareLink);
    }
  };

  const handlePieceDrop = async (sourceSquare, targetSquare) => {
    if (!game || !user || !isMyTurn || actionLoading) return false;

    setActionLoading(true);
    setError('');

    try {
      const payload = createMovePayload(
        game,
        {
          from: sourceSquare,
          to: targetSquare,
          promotion: 'q',
        },
        user.id
      );

      await updateGameAndSync(payload, { status: 'active' });
      return true;
    } catch (err) {
      setError(err.message || 'No fue posible registrar el movimiento.');
      return false;
    } finally {
      setActionLoading(false);
    }
  };

  const handleResign = async () => {
    if (!game || !myColor) return;
    setActionLoading(true);
    setError('');

    try {
      const winnerId = myColor === 'white' ? game.black_player_id : game.white_player_id;
      await finishGame({
        status: 'finished',
        winner_id: winnerId,
        result: 'resign',
        finished_at: new Date().toISOString(),
      });
    } catch (err) {
      setError(err.message || 'No fue posible rendirse.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOfferDraw = async () => {
    if (!game || !myColor || !user) return;
    setActionLoading(true);
    setError('');

    try {
      await finishGame({ draw_offer_by: user.id });
    } catch (err) {
      setError(err.message || 'No fue posible ofrecer tablas.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRespondDraw = async (accept) => {
    if (!game) return;
    setActionLoading(true);
    setError('');

    try {
      if (accept) {
        await finishGame({
          status: 'finished',
          winner_id: null,
          result: 'draw',
          draw_offer_by: null,
          finished_at: new Date().toISOString(),
        });
      } else {
        await finishGame({ draw_offer_by: null });
      }
    } catch (err) {
      setError(err.message || 'No fue posible responder las tablas.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRematch = async () => {
    if (!game || !opponentName || !user) return;
    setActionLoading(true);
    setError('');

    try {
      const creatorColor = myColor === 'white' ? 'black' : 'white';
      const baseMs = Number(game.base_minutes) * 60 * 1000;
      const payload = {
        created_by: user.id,
        invited_username: myColor === 'white' ? game.black_profile?.username : game.white_profile?.username,
        status: 'waiting',
        fen: START_FEN,
        pgn: '',
        moves_json: [],
        current_turn: 'w',
        white_time_ms: baseMs,
        black_time_ms: baseMs,
        base_minutes: game.base_minutes,
        increment_seconds: game.increment_seconds,
        white_player_id: creatorColor === 'white' ? user.id : null,
        black_player_id: creatorColor === 'black' ? user.id : null,
      };

      const { data, error: insertError } = await supabase.from('games').insert(payload).select('id').single();
      if (insertError) throw insertError;
      navigate(`/game/${data.id}`);
    } catch (err) {
      setError(err.message || 'No fue posible crear la revancha.');
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    if (!game || !myColor || game.status !== 'active') return;

    const currentMyTurn =
      (game.current_turn === 'w' && myColor === 'white') ||
      (game.current_turn === 'b' && myColor === 'black');

    const previousTurn = previousTurnRef.current;

    if (previousTurn === null) {
      previousTurnRef.current = game.current_turn;
      return;
    }

    const previousWasMine =
      (previousTurn === 'w' && myColor === 'white') ||
      (previousTurn === 'b' && myColor === 'black');

    if (!previousWasMine && currentMyTurn) {
      notifyTurn();
      if (typeof document !== 'undefined') document.title = 'Tu turno - Ajedrez BN';
    } else if (typeof document !== 'undefined') {
      document.title = 'Ajedrez BN';
    }

    previousTurnRef.current = game.current_turn;
  }, [game, myColor, notifyTurn]);

  useEffect(() => {
    if (!game || game.status !== 'active' || timeoutHandledRef.current) return;

    if (liveClocks.white <= 0) {
      timeoutHandledRef.current = true;
      finishGame({
        status: 'finished',
        winner_id: game.black_player_id,
        result: 'timeout',
        white_time_ms: 0,
        finished_at: new Date().toISOString(),
      }).catch((err) => setError(err.message || 'No fue posible cerrar la partida por tiempo.'));
    } else if (liveClocks.black <= 0) {
      timeoutHandledRef.current = true;
      finishGame({
        status: 'finished',
        winner_id: game.white_player_id,
        result: 'timeout',
        black_time_ms: 0,
        finished_at: new Date().toISOString(),
      }).catch((err) => setError(err.message || 'No fue posible cerrar la partida por tiempo.'));
    }
  }, [game, liveClocks.white, liveClocks.black]);

  useEffect(() => () => {
    if (typeof document !== 'undefined') {
      document.title = 'Ajedrez BN';
    }
  }, []);

  if (loading) {
    return <div className="card">Cargando partida...</div>;
  }

  if (!game) {
    return <div className="card">No fue posible cargar la partida.</div>;
  }

  return (
    <div className="game-layout">
      <section className="card board-card">
        <div className="section-title-row">
          <div>
            <h1>Partida</h1>
            <p className="muted">
              {game.base_minutes}+{game.increment_seconds} · estado: {game.status}
            </p>
          </div>
          <Link to="/dashboard" className="button button-secondary">
            Volver
          </Link>
        </div>

        <div className="players-grid">
          <div className={`player-banner ${game.current_turn === 'w' && game.status === 'active' ? 'is-active' : ''}`}>
            <div>
              <span className="muted small-text">Blancas</span>
              <strong>{whiteName}</strong>
            </div>
            <div className="clock">{formatClock(liveClocks.white)}</div>
          </div>
          <div className={`player-banner ${game.current_turn === 'b' && game.status === 'active' ? 'is-active' : ''}`}>
            <div>
              <span className="muted small-text">Negras</span>
              <strong>{blackName}</strong>
            </div>
            <div className="clock">{formatClock(liveClocks.black)}</div>
          </div>
        </div>

        <div className="board-wrapper">
          <Chessboard
            id="main-board"
            position={game.fen}
            boardOrientation={myColor || 'white'}
            onPieceDrop={handlePieceDrop}
            arePiecesDraggable={Boolean(isMyTurn)}
            customSquareStyles={highlightedSquares}
            customBoardStyle={{ borderRadius: '16px', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.18)' }}
          />
        </div>

        {lastMove && lastMoveIsOpponent ? (
          <div className="notice-box notice-highlight">
            <strong>Último movimiento del rival</strong>
            <p className="muted">{lastMove.san} · {lastMove.from} → {lastMove.to}</p>
          </div>
        ) : null}

        {game.status === 'waiting' && myColor ? (
          <div className="notice-box">
            <strong>Esperando rival</strong>
            <p className="muted">Comparte el enlace para que tu amigo entre y la partida iniciará en cuanto se una.</p>
            <div className="inline-actions">
              <button className="button button-primary" onClick={handleCopyLink} type="button">
                Copiar enlace
              </button>
              <span className="muted small-text break-text">{shareLink}</span>
            </div>
          </div>
        ) : null}

        {canJoin ? (
          <div className="notice-box">
            <strong>Listo para entrar</strong>
            <p className="muted">Cuando entres, la partida empezará de inmediato.</p>
            <button className="button button-primary" disabled={actionLoading} onClick={handleJoinGame} type="button">
              {actionLoading ? 'Entrando...' : 'Unirme a la partida'}
            </button>
          </div>
        ) : null}

        {game.status === 'finished' ? (
          <div className="notice-box">
            <strong>
              {game.winner_id ? `Ganó ${game.winner_id === game.white_player_id ? whiteName : blackName}` : 'La partida terminó en tablas'}
            </strong>
            <p className="muted">Resultado: {game.result || 'finalizada'}</p>
          </div>
        ) : null}

        {error ? <div className="form-error top-space">{error}</div> : null}
      </section>

      <aside className="card side-panel">
        <div className="section-title-row">
          <div>
            <h2>Acciones</h2>
            <p className="muted">Control de partida</p>
          </div>
        </div>

        <div className="list-stack">
          <div className="list-item">
            <div>
              <strong>Tu color</strong>
              <p className="muted small-text">{myColor ? (myColor === 'white' ? 'Blancas' : 'Negras') : 'Invitado'}</p>
            </div>
          </div>
          <div className="list-item">
            <div>
              <strong>Rival</strong>
              <p className="muted small-text">{opponentName || 'Pendiente'}</p>
            </div>
          </div>
          <div className="list-item">
            <div>
              <strong>Turno</strong>
              <p className="muted small-text">{game.current_turn === 'w' ? 'Blancas' : 'Negras'}</p>
            </div>
          </div>
        </div>

        <div className="button-stack top-space">
          <button className="button button-secondary" type="button" onClick={handleCopyLink}>
            Copiar enlace
          </button>
          <button className="button button-secondary" type="button" onClick={requestNotificationPermission}>
            Activar notificaciones
          </button>
          {game.status === 'active' && myColor ? (
            <>
              <button className="button button-secondary" type="button" onClick={handleOfferDraw} disabled={actionLoading || game.draw_offer_by === user?.id}>
                Ofrecer tablas
              </button>
              <button className="button button-danger" type="button" onClick={handleResign} disabled={actionLoading}>
                Rendirse
              </button>
            </>
          ) : null}
          {game.status === 'finished' && myColor && opponentName ? (
            <button className="button button-primary" type="button" onClick={handleRematch} disabled={actionLoading}>
              Revancha
            </button>
          ) : null}
        </div>

        {game.draw_offer_by && game.draw_offer_by !== user?.id && game.status === 'active' ? (
          <div className="notice-box top-space">
            <strong>Tu rival ofreció tablas</strong>
            <div className="inline-actions top-space">
              <button className="button button-primary" type="button" onClick={() => handleRespondDraw(true)}>
                Aceptar
              </button>
              <button className="button button-secondary" type="button" onClick={() => handleRespondDraw(false)}>
                Rechazar
              </button>
            </div>
          </div>
        ) : null}

        <div className="section-title-row top-space">
          <div>
            <h2>Movimientos</h2>
            <p className="muted">Registro de la partida</p>
          </div>
        </div>

        <ol className="moves-list">
          {(Array.isArray(game.moves_json) ? game.moves_json : []).map((move, index) => (
            <li key={`${move.san}-${index}`} className={index === (game.moves_json?.length || 0) - 1 ? 'move-last' : ''}>
              <span>{index + 1}.</span>
              <strong>{move.san}</strong>
              <span className="muted">{move.from} → {move.to}</span>
            </li>
          ))}
          {(Array.isArray(game.moves_json) ? game.moves_json : []).length === 0 ? (
            <li className="muted">Aún no hay movimientos.</li>
          ) : null}
        </ol>
      </aside>
    </div>
  );
}
