import type { Role } from '../engine/types';

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function RoleIcon({ role, size = 64 }: { role: Role; size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" {...S}>
      {role === 'chefao' && (
        <>
          {/* chapéu fedora + charuto */}
          <path d="M6 44 Q32 54 58 44 Q54 49 32 51 Q10 49 6 44Z" fill="currentColor" fillOpacity=".25" />
          <path d="M16 42 Q14 18 32 15 Q50 18 48 42" />
          <path d="M17 33 Q32 37 47 33" />
          <path d="M24 16 Q32 22 40 16" />
        </>
      )}
      {role === 'pistoleiro' && (
        <>
          {/* revólver */}
          <path d="M6 20 H46 Q50 20 50 24 V30 H30 L26 38 H16 L19 30 H8 Q6 30 6 28Z" fill="currentColor" fillOpacity=".25" />
          <path d="M24 38 L20 54 H30 L33 38" />
          <circle cx="38" cy="26" r="3" />
          <path d="M50 24 H58" />
        </>
      )}
      {role === 'cobrador' && (
        <>
          {/* pilha de moedas com cifrão */}
          <ellipse cx="32" cy="48" rx="18" ry="6" fill="currentColor" fillOpacity=".25" />
          <path d="M14 48 V40 M50 48 V40" />
          <ellipse cx="32" cy="40" rx="18" ry="6" fill="currentColor" fillOpacity=".25" />
          <path d="M14 40 V32 M50 40 V32" />
          <ellipse cx="32" cy="32" rx="18" ry="6" />
          <path d="M32 6 V22 M38 10 Q32 6 27 10 Q24 15 32 15 Q40 15 37 20 Q32 24 26 20" />
        </>
      )}
      {role === 'contador' && (
        <>
          {/* livro-caixa */}
          <path d="M10 12 H46 Q52 12 52 18 V52 H16 Q10 52 10 46Z" fill="currentColor" fillOpacity=".2" />
          <path d="M10 46 Q10 52 16 52" />
          <path d="M18 22 H44 M18 30 H44 M18 38 H34" />
          <path d="M40 40 L58 22 L62 26 L44 44 L38 46Z" />
        </>
      )}
      {role === 'advogado' && (
        <>
          {/* balança da justiça */}
          <path d="M32 8 V54 M20 54 H44" />
          <path d="M10 18 H54" />
          <path d="M10 18 L4 36 H22 Z M54 18 L42 36 H60 Z" fill="currentColor" fillOpacity=".2" />
          <circle cx="32" cy="8" r="2.5" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

export function CoinIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#d9b252" stroke="#7a5a14" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="7" fill="none" stroke="#7a5a14" strokeWidth="1" opacity=".6" />
      <text x="12" y="16.2" textAnchor="middle" fontSize="11" fontWeight="800" fill="#6a4c0e" fontFamily="Playfair Display, serif">
        $
      </text>
    </svg>
  );
}

export function CardBack({ small = false }: { small?: boolean }) {
  return (
    <div className={`cardback${small ? ' small' : ''}`} aria-label="carta virada">
      <svg viewBox="0 0 40 56" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true" {...S} strokeWidth={1.4}>
        <rect x="3" y="3" width="34" height="50" rx="3" />
        <path d="M20 12 L30 28 L20 44 L10 28Z" />
        <circle cx="20" cy="28" r="3" fill="currentColor" />
      </svg>
    </div>
  );
}
