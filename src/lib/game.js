import { Chess } from 'chess.js';

export const START_FEN = new Chess().fen();

export function buildJoinPayload(game, userId) {
  if (game.white_player_id && game.black_player_id) {
    throw new Error('La partida ya está completa.');
  }

  if (game.white_player_id === userId || game.black_player_id === userId) {
    return {};
  }

  if (!game.white_player_id) {
    return { white_player_id: userId };
  }

  if (!game.black_player_id) {
    return { black_player_id: userId };
  }

  throw new Error('No fue posible unirse a la partida.');
}

export function getGamePlayers(game, currentUserId) {
  const myColor = game.white_player_id === currentUserId ? 'white' : game.black_player_id === currentUserId ? 'black' : null;
  const opponentId = myColor === 'white' ? game.black_player_id : myColor === 'black' ? game.white_player_id : null;
  return { myColor, opponentId };
}

export function getLiveClocks(game, now) {
  let white = Number(game.white_time_ms ?? 0);
  let black = Number(game.black_time_ms ?? 0);

  if (game.status === 'active' && game.turn_started_at) {
    const elapsed = Math.max(0, now - new Date(game.turn_started_at).getTime());
    if (game.current_turn === 'w') white -= elapsed;
    if (game.current_turn === 'b') black -= elapsed;
  }

  return {
    white: Math.max(0, white),
    black: Math.max(0, black),
  };
}

export function createMovePayload(game, moveInput, userId) {
  const chess = new Chess(game.fen || undefined);
  const elapsed = game.turn_started_at ? Math.max(0, Date.now() - new Date(game.turn_started_at).getTime()) : 0;
  const incrementMs = Number(game.increment_seconds || 0) * 1000;
  const moverIsWhite = game.current_turn === 'w';
  const currentWhite = Number(game.white_time_ms || 0);
  const currentBlack = Number(game.black_time_ms || 0);

  if (moverIsWhite && game.white_player_id !== userId) throw new Error('No es tu turno.');
  if (!moverIsWhite && game.black_player_id !== userId) throw new Error('No es tu turno.');

  const remainingForMover = (moverIsWhite ? currentWhite : currentBlack) - elapsed;
  if (remainingForMover <= 0) {
    throw new Error('Tu tiempo ya terminó.');
  }

  const move = chess.move({
    from: moveInput.from,
    to: moveInput.to,
    promotion: moveInput.promotion || 'q',
  });

  if (!move) {
    throw new Error('Movimiento inválido.');
  }

  let nextWhite = currentWhite;
  let nextBlack = currentBlack;

  if (moverIsWhite) {
    nextWhite = remainingForMover + incrementMs;
  } else {
    nextBlack = remainingForMover + incrementMs;
  }

  const payload = {
    fen: chess.fen(),
    pgn: chess.pgn(),
    current_turn: chess.turn(),
    white_time_ms: Math.max(0, Math.round(nextWhite)),
    black_time_ms: Math.max(0, Math.round(nextBlack)),
    turn_started_at: new Date().toISOString(),
    draw_offer_by: null,
    moves_json: [
      ...(Array.isArray(game.moves_json) ? game.moves_json : []),
      {
        from: move.from,
        to: move.to,
        san: move.san,
        color: move.color,
        piece: move.piece,
        promotion: move.promotion || null,
        fen_after: chess.fen(),
        at: new Date().toISOString(),
      },
    ],
  };

  if (chess.isCheckmate()) {
    payload.status = 'finished';
    payload.winner_id = moverIsWhite ? game.white_player_id : game.black_player_id;
    payload.result = 'checkmate';
    payload.finished_at = new Date().toISOString();
  } else if (chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition()) {
    payload.status = 'finished';
    payload.winner_id = null;
    payload.result = 'draw';
    payload.finished_at = new Date().toISOString();
  }

  return payload;
}
