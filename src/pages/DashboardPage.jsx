import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { START_FEN } from '../lib/game';
import { supabase } from '../lib/supabase';
import { TIME_CONTROL_PRESETS, formatResultLabel } from '../lib/timeControls';

function getOpponent(game, currentUserId) {
  if (game.white_player_id === currentUserId) return game.black_profile;
  if (game.black_player_id === currentUserId) return game.white_profile;
  return null;
}

function buildHeadToHead(games, myUserId) {
  const map = new Map();

  for (const game of games) {
    const opponent = getOpponent(game, myUserId);
    if (!opponent?.id) continue;

    const current = map.get(opponent.id) || {
      opponent,
      wins: 0,
      losses: 0,
      draws: 0,
      total: 0,
    };

    current.total += 1;
    if (!game.winner_id) current.draws += 1;
    else if (game.winner_id === myUserId) current.wins += 1;
    else current.losses += 1;

    map.set(opponent.id, current);
  }

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);
  const [myGames, setMyGames] = useState([]);
  const [openInvites, setOpenInvites] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [creatingGame, setCreatingGame] = useState(false);
  const [form, setForm] = useState({
    opponentUsername: '',
    color: 'random',
    presetLabel: '5+0',
    customBaseMinutes: 5,
    customIncrementSeconds: 0,
  });

  const selectedPreset = useMemo(
    () => TIME_CONTROL_PRESETS.find((preset) => preset.label === form.presetLabel) || TIME_CONTROL_PRESETS[3],
    [form.presetLabel]
  );

  const baseMinutes = selectedPreset.custom ? Number(form.customBaseMinutes) : Number(selectedPreset.baseMinutes);
  const incrementSeconds = selectedPreset.custom
    ? Number(form.customIncrementSeconds)
    : Number(selectedPreset.incrementSeconds);

  const loadDashboard = async () => {
    setLoading(true);
    setError('');

    const username = profile?.username;

    const [statsResponse, myGamesResponse, rankingResponse, invitesResponse] = await Promise.all([
      supabase.from('user_stats').select('*').eq('user_id', user.id).maybeSingle(),
      supabase
        .from('games')
        .select(`
          *,
          white_profile:profiles!games_white_player_id_fkey(id, username, display_name),
          black_profile:profiles!games_black_player_id_fkey(id, username, display_name)
        `)
        .or(`created_by.eq.${user.id},white_player_id.eq.${user.id},black_player_id.eq.${user.id}`)
        .order('updated_at', { ascending: false }),
      supabase
        .from('user_stats')
        .select(`
          *,
          profile:profiles!user_stats_user_id_fkey(id, username, display_name)
        `)
        .order('wins', { ascending: false })
        .order('draws', { ascending: false })
        .limit(10),
      username
        ? supabase
            .from('games')
            .select(`
              *,
              white_profile:profiles!games_white_player_id_fkey(id, username, display_name),
              black_profile:profiles!games_black_player_id_fkey(id, username, display_name)
            `)
            .eq('status', 'waiting')
            .neq('created_by', user.id)
            .or(`invited_username.is.null,invited_username.eq.${username}`)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    const responseError =
      statsResponse.error || myGamesResponse.error || rankingResponse.error || invitesResponse.error;

    if (responseError) {
      setError(responseError.message);
    } else {
      setStats(statsResponse.data || { wins: 0, losses: 0, draws: 0, total_games: 0 });
      setMyGames(myGamesResponse.data || []);
      setRanking(rankingResponse.data || []);
      setOpenInvites(invitesResponse.data || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (user && profile) {
      loadDashboard();
    }
  }, [user, profile]);

  const handleCreateGame = async (event) => {
    event.preventDefault();
    setCreatingGame(true);
    setError('');

    try {
      const normalizedUsername = form.opponentUsername.trim().toLowerCase();
      if (normalizedUsername && normalizedUsername === profile.username) {
        throw new Error('No puedes invitarte a ti mismo.');
      }

      if (baseMinutes <= 0 || incrementSeconds < 0) {
        throw new Error('Configura un tiempo válido.');
      }

      if (normalizedUsername) {
        const { data: invitedProfile, error: invitedError } = await supabase
          .from('profiles')
          .select('id, username')
          .eq('username', normalizedUsername)
          .maybeSingle();

        if (invitedError) throw invitedError;
        if (!invitedProfile) throw new Error('No existe un usuario con ese username.');
      }

      let creatorColor = form.color;
      if (creatorColor === 'random') {
        creatorColor = Math.random() > 0.5 ? 'white' : 'black';
      }

      const baseMs = baseMinutes * 60 * 1000;
      const payload = {
        created_by: user.id,
        invited_username: normalizedUsername || null,
        status: 'waiting',
        fen: START_FEN,
        pgn: '',
        moves_json: [],
        current_turn: 'w',
        white_time_ms: baseMs,
        black_time_ms: baseMs,
        base_minutes: baseMinutes,
        increment_seconds: incrementSeconds,
        white_player_id: creatorColor === 'white' ? user.id : null,
        black_player_id: creatorColor === 'black' ? user.id : null,
      };

      const { data, error: insertError } = await supabase
        .from('games')
        .insert(payload)
        .select('id')
        .single();

      if (insertError) throw insertError;

      navigate(`/game/${data.id}`);
    } catch (err) {
      setError(err.message || 'No fue posible crear la partida.');
    } finally {
      setCreatingGame(false);
    }
  };

  const finishedGames = myGames.filter((game) => game.status === 'finished');
  const activeGames = myGames.filter((game) => game.status === 'active' || game.status === 'waiting');
  const headToHead = buildHeadToHead(finishedGames, user.id);

  if (loading) {
    return <div className="card">Cargando panel...</div>;
  }

  return (
    <div className="dashboard-grid">
      <section className="card card-span-2">
        <div className="section-title-row">
          <div>
            <h1>Panel principal</h1>
            <p className="muted">Tu usuario: @{profile?.username}</p>
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <span>Victorias</span>
            <strong>{stats?.wins ?? 0}</strong>
          </div>
          <div className="stat-card">
            <span>Derrotas</span>
            <strong>{stats?.losses ?? 0}</strong>
          </div>
          <div className="stat-card">
            <span>Tablas</span>
            <strong>{stats?.draws ?? 0}</strong>
          </div>
          <div className="stat-card">
            <span>Total</span>
            <strong>{stats?.total_games ?? 0}</strong>
          </div>
        </div>
      </section>

      <section className="card card-span-2">
        <div className="section-title-row">
          <div>
            <h2>Crear partida</h2>
            <p className="muted">Comparte el enlace o invita por username.</p>
          </div>
        </div>

        <form className="create-game-form" onSubmit={handleCreateGame}>
          <label>
            Username del rival (opcional)
            <input
              type="text"
              placeholder="ejemplo: carlos_92"
              value={form.opponentUsername}
              onChange={(e) => setForm((current) => ({ ...current, opponentUsername: e.target.value }))}
            />
          </label>

          <label>
            Color
            <select
              value={form.color}
              onChange={(e) => setForm((current) => ({ ...current, color: e.target.value }))}
            >
              <option value="random">Aleatorio</option>
              <option value="white">Blancas</option>
              <option value="black">Negras</option>
            </select>
          </label>

          <label>
            Tiempo
            <select
              value={form.presetLabel}
              onChange={(e) => setForm((current) => ({ ...current, presetLabel: e.target.value }))}
            >
              {TIME_CONTROL_PRESETS.map((preset) => (
                <option key={preset.label} value={preset.label}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>

          {selectedPreset.custom ? (
            <>
              <label>
                Minutos por jugador
                <input
                  type="number"
                  min="1"
                  max="180"
                  value={form.customBaseMinutes}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, customBaseMinutes: e.target.value }))
                  }
                />
              </label>

              <label>
                Incremento por jugada (segundos)
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={form.customIncrementSeconds}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, customIncrementSeconds: e.target.value }))
                  }
                />
              </label>
            </>
          ) : null}

          <button className="button button-primary" disabled={creatingGame} type="submit">
            {creatingGame ? 'Creando partida...' : 'Crear partida'}
          </button>
        </form>

        {error ? <div className="form-error top-space">{error}</div> : null}
      </section>

      <section className="card">
        <div className="section-title-row">
          <div>
            <h2>Invitaciones disponibles</h2>
            <p className="muted">Partidas esperando rival.</p>
          </div>
        </div>

        <div className="list-stack">
          {openInvites.length === 0 ? <p className="muted">No hay invitaciones pendientes.</p> : null}
          {openInvites.map((game) => {
            const creator = game.created_by === game.white_player_id ? game.white_profile : game.black_profile;
            return (
              <div className="list-item" key={game.id}>
                <div>
                  <strong>@{creator?.username || 'jugador'}</strong>
                  <p className="muted small-text">
                    {game.base_minutes}+{game.increment_seconds} · {game.invited_username ? `Invitación para @${game.invited_username}` : 'Abierta'}
                  </p>
                </div>
                <Link className="button button-secondary" to={`/game/${game.id}`}>
                  Abrir
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <div className="section-title-row">
          <div>
            <h2>Ranking</h2>
            <p className="muted">Basado en victorias.</p>
          </div>
        </div>

        <div className="list-stack">
          {ranking.map((entry, index) => (
            <div className="list-item" key={entry.user_id}>
              <div>
                <strong>
                  #{index + 1} {entry.profile?.display_name || entry.profile?.username}
                </strong>
                <p className="muted small-text">
                  @{entry.profile?.username} · {entry.wins}V / {entry.losses}D / {entry.draws}T
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card card-span-2">
        <div className="section-title-row">
          <div>
            <h2>Tus partidas</h2>
            <p className="muted">Activas, pendientes y terminadas.</p>
          </div>
        </div>

        <div className="list-stack">
          {activeGames.length === 0 ? <p className="muted">Aún no tienes partidas.</p> : null}
          {activeGames.map((game) => {
            const opponent = getOpponent(game, user.id);
            return (
              <div className="list-item" key={game.id}>
                <div>
                  <strong>{opponent ? `vs @${opponent.username}` : 'Esperando rival'}</strong>
                  <p className="muted small-text">
                    {game.status === 'waiting' ? 'Esperando que el rival entre' : 'Partida activa'} · {game.base_minutes}+{game.increment_seconds}
                  </p>
                </div>
                <Link className="button button-secondary" to={`/game/${game.id}`}>
                  Abrir
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card card-span-2">
        <div className="section-title-row">
          <div>
            <h2>Marcador contra rivales</h2>
            <p className="muted">Balance acumulado por oponente.</p>
          </div>
        </div>

        <div className="list-stack">
          {headToHead.length === 0 ? <p className="muted">Aún no tienes historial contra otros jugadores.</p> : null}
          {headToHead.map((entry) => (
            <div className="list-item" key={entry.opponent.id}>
              <div>
                <strong>
                  {entry.opponent.display_name || entry.opponent.username} (@{entry.opponent.username})
                </strong>
                <p className="muted small-text">
                  {entry.wins} victorias · {entry.losses} derrotas · {entry.draws} tablas
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card card-span-2">
        <div className="section-title-row">
          <div>
            <h2>Últimos resultados</h2>
            <p className="muted">Historial reciente.</p>
          </div>
        </div>

        <div className="list-stack">
          {finishedGames.slice(0, 10).map((game) => {
            const opponent = getOpponent(game, user.id);
            return (
              <div className="list-item" key={game.id}>
                <div>
                  <strong>
                    {formatResultLabel(game, user.id)} {opponent ? `vs @${opponent.username}` : ''}
                  </strong>
                  <p className="muted small-text">
                    {game.result || 'finalizada'} · {game.base_minutes}+{game.increment_seconds}
                  </p>
                </div>
                <Link className="button button-secondary" to={`/game/${game.id}`}>
                  Ver
                </Link>
              </div>
            );
          })}
          {finishedGames.length === 0 ? <p className="muted">Todavía no hay resultados terminados.</p> : null}
        </div>
      </section>
    </div>
  );
}
