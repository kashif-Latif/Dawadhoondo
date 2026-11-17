import { Link } from 'react-router-dom';

export function Pill({ className = 'size-9' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="18" fill="#1E6B52" />
      <g transform="rotate(-35 32 32)">
        <rect x="14" y="24" width="36" height="16" rx="8" fill="#FBF7F0" />
        <path d="M32 24h10a8 8 0 0 1 0 16H32z" fill="#F2A541" />
      </g>
    </svg>
  );
}

export default function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <Pill />
      <span className="font-display text-xl font-extrabold tracking-tight">
        Dawa<span className="text-leaf">Dhoondo</span>
      </span>
    </Link>
  );
}
