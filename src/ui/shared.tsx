import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { ROLE_INFO } from '../engine/info';
import type { Role } from '../engine/types';
import type { PublicPlayer, View } from '../engine/view';
import { CardBack, CoinIcon, RoleIcon } from './Icons';
import { useTicker } from './useRoom';

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`logo${small ? ' small' : ''}`}>
      <span className="logo-top">— a lei do silêncio —</span>
      <h1>OMERTÀ</h1>
    </div>
  );
}

export function joinUrl(code: string) {
  return `${location.origin}${location.pathname}?sala=${code}`;
}

export function Qr({ text, size = 220 }: { text: string; size?: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(text, { margin: 1, width: size * 2, color: { dark: '#120b0a', light: '#e9dcc0' } }).then((u) => alive && setSrc(u));
    return () => {
      alive = false;
    };
  }, [text, size]);
  return src ? <img className="qr" src={src} width={size} height={size} alt={`QR code para entrar: ${text}`} /> : <div className="qr" style={{ width: size, height: size }} />;
}

export function RoleCard({ role, selected, onClick, dim, size = 'md' }: { role: Role; selected?: boolean; onClick?: () => void; dim?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const info = ROLE_INFO[role];
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`rcard r-${role} ${size}${selected ? ' selected' : ''}${dim ? ' dim' : ''}`} onClick={onClick} type={onClick ? 'button' : undefined}>
      <div className="rcard-inner">
        <RoleIcon role={role} size={size === 'lg' ? 84 : size === 'sm' ? 36 : 60} />
        <div className="rcard-name">{info.name}</div>
        {size !== 'sm' && (
          <div className="rcard-text">
            {info.power !== '—' && <p>{info.power}</p>}
            {info.blocks !== '—' && <p className="blk">{info.blocks}</p>}
          </div>
        )}
      </div>
    </Tag>
  );
}

export function Coins({ n }: { n: number }) {
  return (
    <span className="coins" aria-label={`${n} moedas`}>
      <CoinIcon /> <b>{n}</b>
    </span>
  );
}

export function PlayerChip({ p, me, big = false, waiting = false }: { p: PublicPlayer; me?: boolean; big?: boolean; waiting?: boolean }) {
  return (
    <div className={`pchip${p.isTurn ? ' turn' : ''}${!p.alive ? ' dead' : ''}${me ? ' me' : ''}${big ? ' big' : ''}${waiting ? ' waiting' : ''}`}>
      <div className="pname">
        {p.name}
        {me ? ' (você)' : ''}
      </div>
      <div className="pcards">
        {Array.from({ length: p.cards }).map((_, i) => (
          <CardBack key={`b${i}`} small={!big} />
        ))}
        {p.lost.map((r, i) => (
          <div key={`l${i}`} className={`lostcard r-${r}`} title={ROLE_INFO[r].name}>
            <RoleIcon role={r} size={big ? 30 : 20} />
          </div>
        ))}
      </div>
      <Coins n={p.coins} />
    </div>
  );
}

export function Countdown({ view, msLeft, total }: { view: View; msLeft: (d: number | null) => number | null; total: number }) {
  useTicker(100);
  const left = msLeft(view.deadline);
  if (left == null) return null;
  const pct = Math.max(0, Math.min(1, left / total));
  const secs = Math.max(0, Math.ceil(left / 1000));
  return (
    <div className={`countdown${pct < 0.35 ? ' low' : ''}`} role="timer" aria-label={`${secs} segundos`}>
      <div className="bar">
        <div className="fill" style={{ width: `${pct * 100}%` }} />
      </div>
      <span>{secs}s</span>
    </div>
  );
}

export function LogList({ view, n = 8 }: { view: View; n?: number }) {
  const items = view.log.slice(-n).reverse();
  return (
    <ul className="loglist" aria-live="polite">
      {items.map((l) => (
        <li key={l.id} className={`tone-${l.tone ?? 'info'}`}>
          {l.text}
        </li>
      ))}
    </ul>
  );
}

export function Rules({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Como se joga</h2>
        <p>
          Cada um começa com <b>2 cartas secretas</b> (suas influências) e <b>2 moedas</b>. Perdeu as duas cartas, está fora. <b>O último de pé vence.</b>
        </p>
        <h3>No seu turno, escolha uma jogada</h3>
        <ul>
          <li><b>Bico</b> — +1 moeda. Ninguém impede.</li>
          <li><b>Contrabando</b> — +2 moedas. O Chefão pode bloquear.</li>
          <li><b>Acerto de Contas</b> — paga 7: alguém perde uma influência. Sem defesa. <b>Com 10+ moedas é obrigatório.</b></li>
        </ul>
        <h3>Ou finja ser um personagem (pode ser blefe!)</h3>
        <ul>
          <li><b>Chefão</b> — Tributo: +3 moedas.</li>
          <li><b>Pistoleiro</b> — Encomenda: paga 3, alguém perde uma influência. O Advogado bloqueia.</li>
          <li><b>Cobrador</b> — Extorsão: toma 2 moedas de alguém. Cobrador ou Contador bloqueiam.</li>
          <li><b>Contador</b> — Lavar os Livros: compra 2 cartas e escolhe quais manter.</li>
          <li><b>Advogado</b> — só bloqueia a Encomenda.</li>
        </ul>
        <h3>Desafiar e bloquear</h3>
        <p>
          Qualquer um pode <b>desafiar</b> quem declara um personagem. Quem foi desafiado mostra a carta: se tinha, o desafiante perde uma influência (e a carta é trocada por outra do baralho); se estava blefando, perde ele. Você também pode <b>bloquear</b> declarando o personagem certo — e o bloqueio também pode ser desafiado.
        </p>
        <p className="muted">Você tem 10 segundos para reagir. Quem não responde, deixa passar.</p>
        <button className="btn gold" onClick={onClose}>Entendi</button>
      </div>
    </div>
  );
}
