export default function Avatar({ name, url, size = 'md', className = '' }) {
  const label = String(name || 'Jugador').trim();
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'J';

  return url ? (
    <img src={url} alt={label} className={`avatar avatar-${size} ${className}`.trim()} />
  ) : (
    <div className={`avatar avatar-${size} avatar-fallback ${className}`.trim()} aria-label={label}>
      {initials}
    </div>
  );
}
