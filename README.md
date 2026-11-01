# OMERTÀ

Jogo de blefe da máfia dos anos 30, no navegador. Cada jogador usa o próprio celular; uma TV/notebook mostra a mesa.
Entre pelo **QR code** ou pelo **código de 4 letras**. De 2 a 6 jogadores, ~15 minutos por partida.

## Como se joga
Cada um tem 2 cartas secretas (influências) e 2 moedas. Perdeu as duas cartas, está fora; o último de pé vence.
No seu turno: **Bico** (+1), **Contrabando** (+2, o Chefão bloqueia), **Acerto de Contas** (paga 7, alguém perde uma carta; obrigatório com 10+),
ou finja ser um personagem — **Chefão** (Tributo +3), **Pistoleiro** (paga 3, elimina uma carta; o Advogado bloqueia),
**Cobrador** (rouba 2; Cobrador/Contador bloqueiam), **Contador** (troca cartas). Qualquer um pode **desafiar** um personagem declarado
ou um bloqueio: quem blefou perde uma carta, quem acusou errado também. Reações têm **10 s**.

## Jogar agora (mesma rede Wi-Fi)
```bash
npm install
npm run play
```
O comando compila o front e sobe tudo numa porta só. Ele imprime dois endereços:
1. **TV/notebook:** abra o endereço `…/?mesa` → aparece o QR code e o código da sala.
2. **Celulares:** leiam o QR code (ou abram o endereço e digitem o código). O primeiro a entrar é o anfitrião e inicia a partida.

As salas ficam em memória nesse computador (reiniciar o servidor apaga as salas). Para jogar com amigos em **redes diferentes** use o deploy com Supabase abaixo.

## Rodar em modo desenvolvimento
```bash
npm install
npm run dev:server   # API local em memória (porta 8787)
npm run dev          # front em http://localhost:5173 (proxy /api -> 8787)
```
- Celulares: abra `/` → criar sala. TV: abra `/?mesa`.
- Para testar com celulares reais na mesma rede, acesse `http://IP-DA-MAQUINA:5173`.

## Testes
```bash
npm test             # motor de regras + API (inclui 1500 partidas aleatórias)
npm run typecheck
NODE_PATH=$(npm root -g) node e2e/play.cjs   # E2E: TV + 3 celulares jogando uma partida (requer dev server + vite no ar)
```

## Arquitetura
- `src/engine/` — regras do jogo, função pura `(estado, jogada) → novo estado`, RNG com semente. **O servidor é quem manda**: o celular só mostra.
- `src/server/handler.ts` — API (`create`, `join`, `state`, `start`, `act`, `leave`, `rematch`), independente de infraestrutura, com controle otimista de concorrência.
- `supabase/entry.ts` — Edge Function (Deno) sobre Postgres; `supabase/migrations/` — tabela `omerta_rooms` (RLS ligado, sem policies: só a função acessa).
- `src/ui/` — React mobile-first (celular) e modo mesa (TV).
- **Privacidade:** a visão de cada jogador (`viewFor`) só contém a própria mão; o baralho nunca sai do servidor. Há testes para isso.
- Tempo real: Supabase Realtime Broadcast avisa "mudou" + polling de segurança a cada 1,5 s. Prazos vencidos são aplicados pelo servidor na próxima leitura.

## Deploy
1. `npm run build:fn` gera `supabase/functions/game/index.ts`; publicar como função `game` com `verify_jwt = false`.
2. Aplicar `supabase/migrations/*.sql`.
3. Front: defina `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` e faça deploy do `dist/` (Vercel).
4. Para remover tudo do banco: `supabase/omerta_teardown.sql`.

## Variações de regra em relação ao jogo de cartas que inspirou a mecânica
- Tema, nomes e arte próprios.
- Declarar um bloqueio encerra a janela de desafio da ação original (agiliza o jogo no celular).
