export const TIME_CONTROL_PRESETS = [
  { label: '1+0', baseMinutes: 1, incrementSeconds: 0 },
  { label: '3+0', baseMinutes: 3, incrementSeconds: 0 },
  { label: '3+2', baseMinutes: 3, incrementSeconds: 2 },
  { label: '5+0', baseMinutes: 5, incrementSeconds: 0 },
  { label: '10+0', baseMinutes: 10, incrementSeconds: 0 },
  { label: '15+10', baseMinutes: 15, incrementSeconds: 10 },
  { label: 'Personalizado', custom: true },
];

export const formatClock = (milliseconds) => {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const formatResultLabel = (game, myUserId) => {
  if (game.status !== 'finished') return 'En curso';
  if (!game.winner_id) return 'Tablas';
  return game.winner_id === myUserId ? 'Victoria' : 'Derrota';
};
