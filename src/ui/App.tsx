import { useEffect, useState } from 'react';
import { Home, TableHome } from './Home';
import { Lobby } from './Lobby';
import { PhoneGame } from './Phone';
import { Table } from './Table';
import { clearSession, loadSession } from './api';
import { useRoom } from './useRoom';

type Route = { page: 'home'; code?: string } | { page: 'play'; code: string } | { page: 'table'; code?: string };

function parse(): Route {
  const q = new URLSearchParams(location.search);
  const sala = (q.get('sala') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  if (q.has('mesa')) {
    const m = (q.get('mesa') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    return { page: 'table', code: m.length === 4 ? m : undefined };
  }
  if (sala.length === 4) return loadSession(sala) ? { page: 'play', code: sala } : { page: 'home', code: sala };
  return { page: 'home' };
}

function go(search: string) {
  history.pushState(null, '', search || location.pathname);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export default function App() {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);

  if (route.page === 'table') {
    return route.code ? <TableRoom code={route.code} /> : <TableHome onOpen={(c) => go(`?mesa=${c}`)} onBack={() => go('')} />;
  }
  if (route.page === 'play') return <PlayRoom code={route.code} />;
  return <Home initialCode={route.code} onEnter={(c) => go(`?sala=${c}`)} onTable={() => go('?mesa')} />;
}

function Splash({ text }: { text: string }) {
  return (
    <div className="screen center splash">
      <div className="spinner" />
      <p className="muted">{text}</p>
    </div>
  );
}

function PlayRoom({ code }: { code: string }) {
  const session = loadSession(code);
  const hook = useRoom(code, session);
  const leave = async () => {
    await hook.send('leave');
    clearSession(code);
    go('');
  };
  if (hook.fatal) {
    return (
      <div className="screen center splash">
        <p>{hook.fatal}</p>
        <button
          className="btn gold"
          onClick={() => {
            clearSession(code);
            go(`?sala=${code}`);
          }}
        >
          Voltar
        </button>
      </div>
    );
  }
  if (!hook.data) return <Splash text={hook.error ?? 'Entrando na sala…'} />;
  const { room, view } = hook.data;
  const myId = session!.playerId;
  const stillIn = room.players.some((p) => p.id === myId);
  if (!stillIn) return <Splash text="Você saiu desta sala." />;
  return (
    <>
      {room.status === 'lobby' || !view ? (
        <Lobby room={hook.data} hook={hook} myId={myId} onLeave={leave} />
      ) : (
        <PhoneGame room={hook.data} hook={hook} myId={myId} onLeave={leave} />
      )}
      {hook.error && <div className="offline" role="status">Reconectando…</div>}
    </>
  );
}

function TableRoom({ code }: { code: string }) {
  const hook = useRoom(code, null);
  if (hook.fatal) return <Splash text={hook.fatal} />;
  if (!hook.data) return <Splash text={hook.error ?? 'Abrindo a mesa…'} />;
  return (
    <>
      <Table room={hook.data} hook={hook} />
      {hook.error && <div className="offline" role="status">Reconectando…</div>}
    </>
  );
}
