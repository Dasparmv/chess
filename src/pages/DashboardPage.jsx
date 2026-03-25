import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Avatar from '../components/Avatar';
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

function buildPublicAvatarUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data?.publicUrl || '';
}

function getWinRate(entry) {
  const total = Number(entry?.total_games || 0);
  if (!total) return '0%';
  return `${Math.round((Number(entry?.wins || 0) / total) * 100)}%`;
}

function withTimeout(promise, message, timeoutMs = 12000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

export default function DashboardPage() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const mountedRef = useRef(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);
  const [myGames, setMyGames] = useState([]);
  const [openInvites, setOpenInvites] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [creatingGame, setCreatingGame] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState('');
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

  const podium = ranking.slice(0, 3);
  const restOfRanking = ranking.slice(3);
  const baseMinutes = selectedPreset.custom ? Number(form.customBaseMinutes) : Number(selectedPreset.baseMinutes);
  const incrementSeconds = selectedPreset.custom
    ? Number(form.customIncrementSeconds)
    : Number(selectedPreset.incrementSeconds);

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    if (!user) return;
    if (!silent) {
      setLoading(true);
      setError('');
    }

    try {
      const username = profile?.username;

      const [statsResponse, myGamesResponse, rankingResponse, invitesResponse] = await Promise.all([
        withTimeout(supabase.from('user_stats').select('*').eq('user_id', user.id).maybeSingle(), 'Tiempo agotado al cargar estadísticas.'),
        withTimeout(
          supabase
            .from('games')
            .select(`
              *,
              white_profile:profiles!games_white_player_id_fkey(id, username, display_name, avatar_url),
              black_profile:profiles!games_black_player_id_fkey(id, username, display_name, avatar_url)
            `)
            .or(`created_by.eq.${user.id},white_player_id.eq.${user.id},black_player_id.eq.${user.id}`)
            .order('updated_at', { ascending: false }),
          'Tiempo agotado al cargar partidas.'
        ),
        withTimeout(
          supabase
            .from('user_stats')
            .select(`
              *,
              profile:profiles!user_stats_user_id_fkey(id, username, display_name, avatar_url)
            `)
            .order('wins', { ascending: false })
            .order('draws', { ascending: false })
            .limit(10),
          'Tiempo agotado al cargar ranking.'
        ),
        username
          ? withTimeout(
              supabase
                .from('games')
                .select(`
                  *,
                  white_profile:profiles!games_white_player_id_fkey(id, username, display_name, avatar_url),
                  black_profile:profiles!games_black_player_id_fkey(id, username, display_name, avatar_url)
                `)
                .eq('status', 'waiting')
                .neq('created_by', user.id)
                .or(`invited_username.is.null,invited_username.eq.${username}`)
                .order('created_at', { ascending: false }),
              'Tiempo agotado al cargar invitaciones.'
            )
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (!mountedRef.current) return;

      const responseError =
        statsResponse?.error || myGamesResponse?.error || rankingResponse?.error || invitesResponse?.error;

      if (responseError) {
        setError(responseError.message || 'No fue posible cargar el panel.');
      }

      setStats(statsResponse?.data || { wins: 0, losses: 0, draws: 0, total_games: 0 });
      setMyGames(myGamesResponse?.data || []);
      setRanking(
        (rankingResponse?.data || []).map((entry) => ({
          ...entry,
          profile: entry.profile
            ? { ...entry.profile, avatar_url: buildPublicAvatarUrl(entry.profile.avatar_url) }
            : null,
        }))
      );
      setOpenInvites(invitesResponse?.data || []);
    } catch (err) {
      if (mountedRef.current && !silent) {
        setError(err.message || 'No fue posible cargar el panel.');
      }
    } finally {
      if (mountedRef.current && !silent) {
        setLoading(false);
      }
    }
  }, [user, profile?.username]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (user && profile) {
      loadDashboard();
    }
  }, [user, profile, loadDashboard]);

  useEffect(() => {
    if (!user) return;

    const refresh = () => {
      if (document.visibilityState === 'visible') {
        loadDashboard({ silent: true });
      }
    };

    const interval = window.setInterval(() => {
      loadDashboard({ silent: true });
    }, 30000);

    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [user, loadDashboard]);

  const handleAvatarUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setUploadingAvatar(true);
    setAvatarMessage('');
    setError('');

    try {
      if (!file.type.startsWith('image/')) {
        throw new Error('Selecciona una imagen válida.');
      }

      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, cacheControl: '3600' });

      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: path })
        .eq('id', user.id);

      if (updateError) throw updateError;

      await refreshProfile();
      await loadDashboard({ silent: true });
      setAvatarMessage('Foto actualizada.');
    } catch (err) {
      setError(err.message || 'No fue posible actualizar la foto.');
    } finally {
      setUploadingAvatar(false);
      event.target.value = '';
    }
  };

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
          <button className="button button-secondary" type="button" onClick={() => loadDashboard()}>
            Recargar
          </button>
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
            <h2>Podio de jugadores</h2>
            <p className="muted">Clasificación general por victorias.</p>
          </div>
        </div>

        <div className="podium-grid">
          <div className={`podium-card podium-second ${podium[1] ? '' : 'is-empty'}`}>
            {podium[1] ? (
              <>
                <span className="podium-place">#2</span>
                <Avatar
                  name={podium[1].profile?.display_name || podium[1].profile?.username}
                  url={podium[1].profile?.avatar_url}
                  size="xl"
                />
                <strong>{podium[1].profile?.display_name || podium[1].profile?.username}</strong>
                <span className="muted">{podium[1].wins} victorias</span>
              </>
            ) : (
              <span className="muted">Aún no hay suficientes jugadores</span>
            )}
          </div>

          <div className={`podium-card podium-first ${podium[0] ? '' : 'is-empty'}`}>
            {podium[0] ? (
              <>
                <span className="podium-place">#1</span>
                <Avatar
                  name={podium[0].profile?.display_name || podium[0].profile?.username}
                  url={podium[0].profile?.avatar_url}
                  size="xxl"
                />
                <strong>{podium[0].profile?.display_name || podium[0].profile?.username}</strong>
                <span className="muted">{podium[0].wins} victorias · {getWinRate(podium[0])}</span>
              </>
            ) : (
              <span className="muted">Todavía no hay ranking</span>
            )}
          </div>

          <div className={`podium-card podium-third ${podium[2] ? '' : 'is-empty'}`}>
            {podium[2] ? (
              <>
                <span className="podium-place">#3</span>
                <Avatar
                  name={podium[2].profile?.display_name || podium[2].profile?.username}
                  url={podium[2].profile?.avatar_url}
                  size="xl"
                />
                <strong>{podium[2].profile?.display_name || podium[2].profile?.username}</strong>
                <span className="muted">{podium[2].wins} victorias</span>
              </>
            ) : (
              <span className="muted">Aún no hay suficientes jugadores</span>
            )}
          </div>
        </div>

        {restOfRanking.length ? (
          <div className="ranking-table top-space">
            {restOfRanking.map((entry, index) => (
              <div className="ranking-row" key={entry.user_id}>
                <span className="ranking-position">#{index + 4}</span>
                <div className="ranking-player">
                  <Avatar name={entry.profile?.display_name || entry.profile?.username} url={entry.profile?.avatar_url} size="sm" />
                  <div>
                    <strong>{entry.profile?.display_name || entry.profile?.username}</strong>
                    <p className="muted small-text">@{entry.profile?.username}</p>
                  </div>
                </div>
                <strong>{entry.wins}</strong>
              </div>
            ))}
          </div>
        ) : null}
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
              placeholder="ejemplo: juan_ajedrez"
              value={form.opponentUsername}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  opponentUsername: event.target.value.toLowerCase(),
                }))
              }
            />
          </label>

          <label>
            Color
            <select
              value={form.color}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  color: event.target.value,
                }))
              }
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
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  presetLabel: event.target.value,
                }))
              }
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
                Minutos base
                <input
                  type="number"
                  min="1"
                  max="180"
                  value={form.customBaseMinutes}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      customBaseMinutes: event.target.value,
                    }))
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
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      customIncrementSeconds: event.target.value,
                    }))
                  }
                />
              </label>
            </>
          ) : null}

          <button className="button button-primary" disabled={creatingGame} type="submit">
            {creatingGame ? 'Creando...' : 'Crear partida'}
          </button>
        </form>

        {error ? <div className="form-error top-space">{error}</div> : null}
      </section>

      <section className="card">
        <div className="section-title-row">
          <div>
            <h2>Perfil</h2>
            <p className="muted">Foto y datos visibles</p>
          </div>
        </div>

        <div className="profile-panel">
          <Avatar name={profile?.display_name || profile?.username} url={buildPublicAvatarUrl(profile?.avatar_url)} size="xxl" />
          <div className="profile-panel-body">
            <strong>{profile?.display_name || profile?.username}</strong>
            <p className="muted">@{profile?.username}</p>
            <label className="upload-button">
              <input type="file" accept="image/*" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
              <span>{uploadingAvatar ? 'Subiendo foto...' : 'Cambiar foto de perfil'}</span>
            </label>
            {avatarMessage ? <div className="form-message">{avatarMessage}</div> : null}
          </div>
        </div>
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
            <p className="muted">Top de jugadores</p>
          </div>
        </div>

        <div className="list-stack">
          {ranking.length ? (
            ranking.map((entry, index) => (
              <div className="list-item" key={entry.user_id}>
                <div className="ranking-player">
                  <Avatar name={entry.profile?.display_name || entry.profile?.username} url={entry.profile?.avatar_url} size="sm" />
                  <div>
                    <strong>
                      #{index + 1} · {entry.profile?.display_name || entry.profile?.username}
                    </strong>
                    <p className="muted small-text">{entry.wins} victorias · {entry.draws} tablas</p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="muted">Todavía no hay ranking.</p>
          )}
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
