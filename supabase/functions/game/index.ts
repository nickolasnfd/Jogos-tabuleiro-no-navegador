// GERADO por scripts/build-fn.mjs — não edite à mão.

// src/engine/info.ts
var ROLES = ["chefao", "pistoleiro", "cobrador", "contador", "advogado"];
var ROLE_INFO = {
  chefao: {
    name: "O Chef\xE3o",
    short: "Chef\xE3o",
    power: "Cobra Tributo: pega 3 moedas.",
    blocks: "Bloqueia o Contrabando."
  },
  pistoleiro: {
    name: "O Pistoleiro",
    short: "Pistoleiro",
    power: "Faz uma Encomenda: paga 3 moedas e elimina uma influ\xEAncia de algu\xE9m.",
    blocks: "\u2014"
  },
  cobrador: {
    name: "O Cobrador",
    short: "Cobrador",
    power: "Extorque: toma 2 moedas de outro jogador.",
    blocks: "Bloqueia a Extors\xE3o."
  },
  contador: {
    name: "O Contador",
    short: "Contador",
    power: "Lava os Livros: compra 2 cartas e troca com as suas.",
    blocks: "Bloqueia a Extors\xE3o."
  },
  advogado: {
    name: "O Advogado",
    short: "Advogado",
    power: "\u2014",
    blocks: "Bloqueia a Encomenda do Pistoleiro."
  }
};
var ACTIONS = {
  bico: { name: "Bico", cost: 0, needsTarget: false, blockedBy: [], desc: "Pega 1 moeda. Ningu\xE9m pode impedir." },
  contrabando: {
    name: "Contrabando",
    cost: 0,
    needsTarget: false,
    blockedBy: ["chefao"],
    blockers: "any",
    desc: "Pega 2 moedas. Um Chef\xE3o pode bloquear."
  },
  acerto: {
    name: "Acerto de Contas",
    cost: 7,
    needsTarget: true,
    blockedBy: [],
    desc: "Paga 7 moedas. O alvo perde uma influ\xEAncia. Sem defesa."
  },
  tributo: { name: "Tributo", cost: 0, claim: "chefao", needsTarget: false, blockedBy: [], desc: "Chef\xE3o: pega 3 moedas." },
  encomenda: {
    name: "Encomenda",
    cost: 3,
    claim: "pistoleiro",
    needsTarget: true,
    blockedBy: ["advogado"],
    blockers: "target",
    desc: "Pistoleiro: paga 3 moedas, o alvo perde uma influ\xEAncia."
  },
  extorsao: {
    name: "Extors\xE3o",
    cost: 0,
    claim: "cobrador",
    needsTarget: true,
    blockedBy: ["cobrador", "contador"],
    blockers: "target",
    desc: "Cobrador: toma 2 moedas do alvo."
  },
  livros: {
    name: "Lavar os Livros",
    cost: 0,
    claim: "contador",
    needsTarget: false,
    blockedBy: [],
    desc: "Contador: compra 2 cartas e troca com as suas."
  }
};
var ACTION_ORDER = ["bico", "contrabando", "tributo", "extorsao", "livros", "encomenda", "acerto"];
var START_COINS = 2;
var MAX_COINS_BEFORE_FORCED = 10;
var MIN_PLAYERS = 2;
var MAX_PLAYERS = 6;

// src/engine/game.ts
var DEFAULT_TIMERS = { reactMs: 1e4, choiceMs: 3e4, actionMs: 6e4 };
function nextRand(s) {
  s.rng = s.rng + 1831565813 | 0;
  let t = s.rng;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
function shuffle(s, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand(s) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
var isAlive = (p) => p.hand.length > 0;
var getPlayer = (s, id) => s.players.find((p) => p.id === id);
var alivePlayers = (s) => s.players.filter(isAlive);
function nameOf(s, id) {
  return getPlayer(s, id)?.name ?? "???";
}
function log(s, text, tone = "info") {
  s.logSeq += 1;
  s.log.push({ id: s.logSeq, text, tone });
  if (s.log.length > 80) s.log.splice(0, s.log.length - 80);
}
function newGame(players, seed, now, timers = DEFAULT_TIMERS) {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`O jogo precisa de ${MIN_PLAYERS} a ${MAX_PLAYERS} jogadores.`);
  }
  const s = {
    players: [],
    deck: [],
    turn: "",
    phase: { kind: "lobby" },
    log: [],
    logSeq: 0,
    rng: seed | 0,
    round: 1,
    version: 1,
    timers
  };
  for (const r of ROLES) for (let i = 0; i < 3; i++) s.deck.push(r);
  shuffle(s, s.deck);
  const order = players.map((p) => ({ ...p }));
  shuffle(s, order);
  for (const p of order) {
    s.players.push({ id: p.id, name: p.name, coins: START_COINS, hand: [s.deck.pop(), s.deck.pop()], lost: [] });
  }
  s.turn = s.players[0].id;
  s.phase = { kind: "action", deadline: now + timers.actionMs };
  log(s, `A fam\xEDlia se re\xFAne. ${nameOf(s, s.turn)} abre a noite.`, "alert");
  return s;
}
function responders(s) {
  const ph = s.phase;
  if (ph.kind === "react") {
    const d = ph.declared;
    const info = ACTIONS[d.action];
    const alive = alivePlayers(s).filter((p) => p.id !== d.actor);
    const ids = /* @__PURE__ */ new Set();
    if (ph.window === "action" && info.claim) alive.forEach((p) => ids.add(p.id));
    if (info.blockedBy.length) {
      if (info.blockers === "target") {
        if (d.target && alive.some((p) => p.id === d.target)) ids.add(d.target);
      } else alive.forEach((p) => ids.add(p.id));
    }
    return [...ids];
  }
  if (ph.kind === "blockReact") {
    return alivePlayers(s).filter((p) => p.id !== ph.blocker).map((p) => p.id);
  }
  return [];
}
function mustCoup(s, id) {
  const p = getPlayer(s, id);
  return !!p && p.coins >= MAX_COINS_BEFORE_FORCED;
}
function validTargets(s, actor) {
  return alivePlayers(s).filter((p) => p.id !== actor).map((p) => p.id);
}
function checkOver(s) {
  const alive = alivePlayers(s);
  if (alive.length <= 1) {
    const w = alive[0];
    s.phase = { kind: "over", winner: w ? w.id : "" };
    if (w) log(s, `${w.name} \xE9 o \xFAltimo de p\xE9. A cidade \xE9 dele.`, "good");
    return true;
  }
  return false;
}
function endTurn(s, now) {
  if (checkOver(s)) return;
  const n = s.players.length;
  let i = s.players.findIndex((p) => p.id === s.turn);
  for (let k = 0; k < n; k++) {
    i = (i + 1) % n;
    if (isAlive(s.players[i])) break;
  }
  if (i <= s.players.findIndex((p) => p.id === s.turn)) s.round += 1;
  s.turn = s.players[i].id;
  s.phase = { kind: "action", deadline: now + s.timers.actionMs };
  log(s, `Vez de ${s.players[i].name}.`);
}
function startLose(s, who, then, now) {
  const p = getPlayer(s, who);
  if (!isAlive(p)) return continueThen(s, then, now);
  if (p.hand.length === 1) {
    revealCard(s, who, p.hand[0]);
    return continueThen(s, then, now);
  }
  s.phase = { kind: "lose", who, then, deadline: now + s.timers.choiceMs };
}
function revealCard(s, who, role) {
  const p = getPlayer(s, who);
  const idx = p.hand.indexOf(role);
  p.hand.splice(idx, 1);
  p.lost.push(role);
  log(s, `${p.name} perde ${ROLE_INFO[role].name}${isAlive(p) ? "." : " \u2014 est\xE1 fora do jogo."}`, "bad");
}
function continueThen(s, then, now) {
  if (checkOver(s)) return;
  if (then.t === "endTurn") return endTurn(s, now);
  if (then.t === "resolve") return resolveAction(s, then.declared, now);
  if (then.t === "afterChallenge") return afterActionChallenge(s, then.declared, now);
}
function afterActionChallenge(s, d, now) {
  const actor = getPlayer(s, d.actor);
  if (!isAlive(actor)) return endTurn(s, now);
  const info = ACTIONS[d.action];
  const targetDead = info.needsTarget && (!d.target || !isAlive(getPlayer(s, d.target)));
  if (targetDead) {
    log(s, "O alvo j\xE1 n\xE3o est\xE1 na jogada. A\xE7\xE3o cancelada.");
    return endTurn(s, now);
  }
  if (info.blockedBy.length) {
    const draft = { ...s, phase: { kind: "react", declared: d, window: "afterChallenge", passed: [], deadline: 0 } };
    if (responders(draft).length > 0) {
      s.phase = { kind: "react", declared: d, window: "afterChallenge", passed: [], deadline: now + s.timers.reactMs };
      return;
    }
  }
  resolveAction(s, d, now);
}
function swapCard(s, who, role) {
  const p = getPlayer(s, who);
  const idx = p.hand.indexOf(role);
  p.hand.splice(idx, 1);
  s.deck.push(role);
  shuffle(s, s.deck);
  p.hand.push(s.deck.pop());
}
function resolveAction(s, d, now) {
  const actor = getPlayer(s, d.actor);
  const target = d.target ? getPlayer(s, d.target) : void 0;
  if (!isAlive(actor)) return endTurn(s, now);
  switch (d.action) {
    case "bico":
      actor.coins += 1;
      log(s, `${actor.name} faz um bico e embolsa 1 moeda.`);
      return endTurn(s, now);
    case "contrabando":
      actor.coins += 2;
      log(s, `${actor.name} passa contrabando e embolsa 2 moedas.`);
      return endTurn(s, now);
    case "tributo":
      actor.coins += 3;
      log(s, `${actor.name} cobra tributo e embolsa 3 moedas.`, "good");
      return endTurn(s, now);
    case "extorsao": {
      if (!target || !isAlive(target)) return endTurn(s, now);
      const amount = Math.min(2, target.coins);
      target.coins -= amount;
      actor.coins += amount;
      log(s, `${actor.name} extorque ${amount} moeda${amount === 1 ? "" : "s"} de ${target.name}.`);
      return endTurn(s, now);
    }
    case "livros": {
      const drawn = [s.deck.pop(), s.deck.pop()].filter(Boolean);
      const options = [...actor.hand, ...drawn];
      s.phase = { kind: "exchange", actor: actor.id, options, keep: actor.hand.length, deadline: now + s.timers.choiceMs };
      log(s, `${actor.name} mexe nos livros cont\xE1beis.`);
      return;
    }
    case "encomenda":
    case "acerto": {
      if (!target || !isAlive(target)) {
        log(s, "O alvo j\xE1 n\xE3o est\xE1 na jogada.");
        return endTurn(s, now);
      }
      log(
        s,
        d.action === "acerto" ? `${actor.name} acerta as contas com ${target.name}.` : `A encomenda de ${actor.name} chega at\xE9 ${target.name}.`,
        "bad"
      );
      return startLose(s, target.id, { t: "endTurn" }, now);
    }
  }
}
function closeWindow(s, now) {
  const ph = s.phase;
  if (ph.kind === "react") {
    log(s, "Ningu\xE9m se op\xF5e.");
    return resolveAction(s, ph.declared, now);
  }
  if (ph.kind === "blockReact") {
    log(s, `O bloqueio de ${nameOf(s, ph.blocker)} se mant\xE9m. A a\xE7\xE3o \xE9 cancelada.`);
    return endTurn(s, now);
  }
}
function maybeCloseWindow(s, now) {
  const ph = s.phase;
  if (ph.kind !== "react" && ph.kind !== "blockReact") return;
  const need = responders(s);
  if (need.every((id) => ph.passed.includes(id))) closeWindow(s, now);
}
var err = (error) => ({ ok: false, error });
function apply(prev, playerId, move, now) {
  const s = structuredClone(prev);
  const me = getPlayer(s, playerId);
  if (!me) return err("Voc\xEA n\xE3o est\xE1 nesta partida.");
  const ph = s.phase;
  if (ph.kind === "over") return err("A partida terminou.");
  if (ph.kind === "lobby") return err("A partida ainda n\xE3o come\xE7ou.");
  if (!isAlive(me)) return err("Voc\xEA est\xE1 fora do jogo.");
  switch (move.t) {
    /* ------------------------------- ação do turno ------------------------------ */
    case "action": {
      if (ph.kind !== "action") return err("N\xE3o \xE9 hora de escolher uma a\xE7\xE3o.");
      if (s.turn !== playerId) return err("N\xE3o \xE9 a sua vez.");
      const info = ACTIONS[move.action];
      if (!info) return err("A\xE7\xE3o inv\xE1lida.");
      if (mustCoup(s, playerId) && move.action !== "acerto") return err("Com 10 ou mais moedas voc\xEA \xE9 obrigado a dar um Acerto de Contas.");
      if (me.coins < info.cost) return err("Moedas insuficientes.");
      let target;
      if (info.needsTarget) {
        const t = move.target ? getPlayer(s, move.target) : void 0;
        if (!t || !isAlive(t) || t.id === playerId) return err("Escolha um alvo v\xE1lido.");
        target = t.id;
      }
      me.coins -= info.cost;
      const d = { action: move.action, actor: playerId, target, claim: info.claim, paid: info.cost };
      const tn = target ? nameOf(s, target) : "";
      const msgs = {
        bico: `${me.name} vai fazer um bico.`,
        contrabando: `${me.name} tenta passar contrabando.`,
        acerto: `${me.name} quer acertar as contas com ${tn}!`,
        tributo: `${me.name} diz ser o Chef\xE3o e exige tributo.`,
        encomenda: `${me.name} diz ser o Pistoleiro e faz uma encomenda contra ${tn}.`,
        extorsao: `${me.name} diz ser o Cobrador e extorque ${tn}.`,
        livros: `${me.name} diz ser o Contador e quer lavar os livros.`
      };
      log(s, msgs[move.action], info.claim ? "alert" : "info");
      if (move.action === "bico" || move.action === "acerto") {
        resolveAction(s, d, now);
      } else {
        const draft = { ...s, phase: { kind: "react", declared: d, window: "action", passed: [], deadline: 0 } };
        if (responders(draft).length === 0) resolveAction(s, d, now);
        else s.phase = { kind: "react", declared: d, window: "action", passed: [], deadline: now + s.timers.reactMs };
      }
      break;
    }
    /* ---------------------------------- passar ---------------------------------- */
    case "pass": {
      if (ph.kind !== "react" && ph.kind !== "blockReact") return err("Nada a passar agora.");
      if (!responders(s).includes(playerId)) return err("Voc\xEA n\xE3o pode reagir a esta jogada.");
      if (!ph.passed.includes(playerId)) ph.passed.push(playerId);
      maybeCloseWindow(s, now);
      break;
    }
    /* --------------------------------- desafiar --------------------------------- */
    case "challenge": {
      if (ph.kind === "react") {
        if (ph.window !== "action") return err("O desafio \xE0 a\xE7\xE3o j\xE1 foi resolvido.");
        const d = ph.declared;
        if (!d.claim) return err("Esta a\xE7\xE3o n\xE3o pode ser desafiada.");
        if (!responders(s).includes(playerId)) return err("Voc\xEA n\xE3o pode desafiar.");
        const claimer = getPlayer(s, d.actor);
        log(s, `${me.name} desafia ${claimer.name}!`, "alert");
        if (claimer.hand.includes(d.claim)) {
          log(s, `${claimer.name} mostra ${ROLE_INFO[d.claim].name}. O desafio falhou!`, "good");
          swapCard(s, d.actor, d.claim);
          startLose(s, playerId, { t: "afterChallenge", declared: d }, now);
        } else {
          log(s, `${claimer.name} estava blefando! N\xE3o tem ${ROLE_INFO[d.claim].name}.`, "bad");
          claimer.coins += d.paid;
          startLose(s, d.actor, { t: "endTurn" }, now);
        }
        break;
      }
      if (ph.kind === "blockReact") {
        if (!responders(s).includes(playerId)) return err("Voc\xEA n\xE3o pode desafiar.");
        const blocker = getPlayer(s, ph.blocker);
        log(s, `${me.name} desafia o bloqueio de ${blocker.name}!`, "alert");
        if (blocker.hand.includes(ph.blockRole)) {
          log(s, `${blocker.name} mostra ${ROLE_INFO[ph.blockRole].name}. O desafio falhou!`, "good");
          swapCard(s, ph.blocker, ph.blockRole);
          startLose(s, playerId, { t: "endTurn" }, now);
        } else {
          log(s, `${blocker.name} estava blefando! N\xE3o tem ${ROLE_INFO[ph.blockRole].name}.`, "bad");
          startLose(s, ph.blocker, { t: "resolve", declared: ph.declared }, now);
        }
        break;
      }
      return err("N\xE3o h\xE1 nada para desafiar.");
    }
    /* ---------------------------------- bloquear -------------------------------- */
    case "block": {
      if (ph.kind !== "react") return err("N\xE3o h\xE1 nada para bloquear.");
      const d = ph.declared;
      const info = ACTIONS[d.action];
      if (!info.blockedBy.includes(move.role)) return err("Esse personagem n\xE3o bloqueia esta a\xE7\xE3o.");
      const can = info.blockers === "target" ? d.target === playerId : playerId !== d.actor;
      if (!can) return err("Voc\xEA n\xE3o pode bloquear esta a\xE7\xE3o.");
      log(s, `${me.name} diz ser ${ROLE_INFO[move.role].name} e bloqueia ${nameOf(s, d.actor)}!`, "alert");
      s.phase = { kind: "blockReact", declared: d, blocker: playerId, blockRole: move.role, passed: [], deadline: now + s.timers.reactMs };
      maybeCloseWindow(s, now);
      break;
    }
    /* ----------------------------- perder influência --------------------------- */
    case "lose": {
      if (ph.kind !== "lose" || ph.who !== playerId) return err("Voc\xEA n\xE3o precisa revelar uma carta agora.");
      if (!me.hand.includes(move.role)) return err("Voc\xEA n\xE3o tem essa carta.");
      revealCard(s, playerId, move.role);
      continueThen(s, ph.then, now);
      break;
    }
    /* ---------------------------------- trocar --------------------------------- */
    case "exchange": {
      if (ph.kind !== "exchange" || ph.actor !== playerId) return err("Voc\xEA n\xE3o est\xE1 trocando cartas.");
      const pool = [...ph.options];
      if (move.keep.length !== ph.keep) return err(`Escolha exatamente ${ph.keep} carta(s).`);
      for (const r of move.keep) {
        const i = pool.indexOf(r);
        if (i < 0) return err("Sele\xE7\xE3o inv\xE1lida.");
        pool.splice(i, 1);
      }
      me.hand = [...move.keep];
      s.deck.push(...pool);
      shuffle(s, s.deck);
      log(s, `${me.name} termina de lavar os livros.`);
      endTurn(s, now);
      break;
    }
    default:
      return err("Jogada desconhecida.");
  }
  s.version = prev.version + 1;
  return { ok: true, state: s };
}
function deadlineOf(s) {
  const ph = s.phase;
  return "deadline" in ph ? ph.deadline : null;
}
function tick(prev, now) {
  const dl = deadlineOf(prev);
  if (dl === null || now < dl) return null;
  const s = structuredClone(prev);
  const ph = s.phase;
  switch (ph.kind) {
    case "action": {
      const me = getPlayer(s, s.turn);
      log(s, `${me.name} demorou demais.`, "alert");
      if (mustCoup(s, me.id)) {
        const targets = validTargets(s, me.id);
        const t = targets[Math.floor(nextRand(s) * targets.length)];
        const r2 = apply(s, me.id, { t: "action", action: "acerto", target: t }, now);
        if (r2.ok) return r2.state;
      }
      const r = apply(s, me.id, { t: "action", action: "bico" }, now);
      return r.ok ? r.state : null;
    }
    case "react":
    case "blockReact": {
      for (const id of responders(s)) if (!ph.passed.includes(id)) ph.passed.push(id);
      maybeCloseWindow(s, now);
      break;
    }
    case "lose": {
      const p = getPlayer(s, ph.who);
      log(s, `${p.name} demorou a decidir.`, "alert");
      revealCard(s, ph.who, p.hand[0]);
      continueThen(s, ph.then, now);
      break;
    }
    case "exchange": {
      const keep = ph.options.slice(0, ph.keep);
      const rest = ph.options.slice(ph.keep);
      const p = getPlayer(s, ph.actor);
      p.hand = keep;
      s.deck.push(...rest);
      shuffle(s, s.deck);
      log(s, `${p.name} demorou \u2014 mant\xE9m as pr\xF3prias cartas.`);
      endTurn(s, now);
      break;
    }
    default:
      return null;
  }
  s.version = prev.version + 1;
  return s;
}
function forfeit(prev, playerId, now) {
  const p = getPlayer(prev, playerId);
  if (!p || !isAlive(p) || prev.phase.kind === "over" || prev.phase.kind === "lobby") return null;
  const s = structuredClone(prev);
  const me = getPlayer(s, playerId);
  log(s, `${me.name} abandona a fam\xEDlia.`, "bad");
  while (me.hand.length) {
    const r = me.hand[0];
    me.hand.splice(0, 1);
    me.lost.push(r);
  }
  me.coins = 0;
  if (checkOver(s)) {
    s.version = prev.version + 1;
    return s;
  }
  const ph = s.phase;
  if (s.turn === playerId) {
    endTurn(s, now);
  } else if ("declared" in ph && ph.declared.actor === playerId) {
    endTurn(s, now);
  } else if (ph.kind === "lose" && ph.who === playerId) {
    continueThen(s, ph.then, now);
  } else if (ph.kind === "exchange" && ph.actor === playerId) {
    endTurn(s, now);
  } else if (ph.kind === "react" || ph.kind === "blockReact") {
    if (ph.kind === "blockReact" && ph.blocker === playerId) resolveAction(s, ph.declared, now);
    else maybeCloseWindow(s, now);
  }
  s.version = prev.version + 1;
  return s;
}

// src/engine/view.ts
var emptyCan = { actions: [], targets: [], challenge: false, block: [], pass: false, lose: [], exchange: null };
function viewFor(s, me) {
  const players = s.players.map((p) => ({
    id: p.id,
    name: p.name,
    coins: p.coins,
    cards: p.hand.length,
    lost: [...p.lost],
    alive: isAlive(p),
    isTurn: s.turn === p.id && s.phase.kind !== "over"
  }));
  const ph = s.phase;
  let phase;
  switch (ph.kind) {
    case "action":
      phase = { kind: "action", actor: s.turn };
      break;
    case "react":
      phase = {
        kind: "react",
        declared: ph.declared,
        window: ph.window,
        waitingOn: responders(s).filter((id) => !ph.passed.includes(id))
      };
      break;
    case "blockReact":
      phase = {
        kind: "blockReact",
        declared: ph.declared,
        blocker: ph.blocker,
        blockRole: ph.blockRole,
        waitingOn: responders(s).filter((id) => !ph.passed.includes(id))
      };
      break;
    case "lose":
      phase = { kind: "lose", who: ph.who };
      break;
    case "exchange":
      phase = { kind: "exchange", actor: ph.actor };
      break;
    case "over":
      phase = { kind: "over", winner: ph.winner };
      break;
    default:
      phase = { kind: "lobby" };
  }
  const mine = me ? getPlayer(s, me) : void 0;
  const can = { ...emptyCan, actions: [], block: [], lose: [], targets: [] };
  if (mine && isAlive(mine)) {
    if (ph.kind === "action" && s.turn === mine.id) {
      const forced = mustCoup(s, mine.id);
      can.targets = validTargets(s, mine.id);
      can.actions = ACTION_ORDER.map((a) => {
        const info = ACTIONS[a];
        if (forced && a !== "acerto") return { action: a, enabled: false, reason: "Voc\xEA tem 10+ moedas: \xE9 obrigat\xF3rio dar um Acerto de Contas." };
        if (mine.coins < info.cost) return { action: a, enabled: false, reason: `Precisa de ${info.cost} moedas.` };
        return { action: a, enabled: true };
      });
    }
    if (ph.kind === "react") {
      const rs = responders(s);
      if (rs.includes(mine.id) && !ph.passed.includes(mine.id)) {
        const d = ph.declared;
        const info = ACTIONS[d.action];
        can.pass = true;
        can.challenge = ph.window === "action" && !!d.claim;
        if (info.blockedBy.length) {
          const ok2 = info.blockers === "target" ? d.target === mine.id : mine.id !== d.actor;
          if (ok2) can.block = [...info.blockedBy];
        }
      }
    }
    if (ph.kind === "blockReact") {
      if (responders(s).includes(mine.id) && !ph.passed.includes(mine.id)) {
        can.pass = true;
        can.challenge = true;
      }
    }
    if (ph.kind === "lose" && ph.who === mine.id) can.lose = [...new Set(mine.hand)];
    if (ph.kind === "exchange" && ph.actor === mine.id) can.exchange = { options: [...ph.options], keep: ph.keep };
  }
  return {
    version: s.version,
    me,
    players,
    phase,
    deadline: deadlineOf(s),
    deckCount: s.deck.length,
    round: s.round,
    log: s.log.slice(-40),
    hand: mine ? [...mine.hand] : [],
    can
  };
}

// src/server/handler.ts
var CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
var randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));
function makeCode() {
  const b = randomBytes(4);
  return Array.from(b, (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join("");
}
function makeToken() {
  return Array.from(randomBytes(18), (x) => x.toString(36).padStart(2, "0")).join("").slice(0, 28);
}
function makeId() {
  return "p" + Array.from(randomBytes(5), (x) => x.toString(16).padStart(2, "0")).join("");
}
var ok = (body) => ({ status: 200, body });
var fail = (status, error) => ({ status, body: { error } });
function cleanName(raw) {
  const s = String(raw ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().replace(/\s+/g, " ").slice(0, 14);
  return s;
}
function roomInfo(room) {
  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    players: room.players.map((p) => ({ id: p.id, name: p.name })),
    min: MIN_PLAYERS,
    max: MAX_PLAYERS
  };
}
function auth(room, body) {
  const p = room.players.find((x) => x.id === body.playerId);
  if (!p) return null;
  const a = String(body.secret ?? "");
  const b = p.secret;
  if (a.length !== b.length) return null;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0 ? p : null;
}
function stateReply(room, rev, me, now) {
  return {
    room: roomInfo(room),
    view: room.game ? viewFor(room.game, me) : null,
    serverNow: now,
    rev
  };
}
function settle(room, now) {
  let changed = false;
  if (room.game && room.status === "playing") {
    const t = tick(room.game, now);
    if (t) {
      room.game = t;
      changed = true;
    }
    if (room.game.phase.kind === "over") {
      room.status = "over";
      changed = true;
    }
  }
  if (changed) room.updatedAt = now;
  return changed;
}
async function handle(store2, raw, now, notify2 = () => {
}) {
  if (!raw || typeof raw !== "object") return fail(400, "Requisi\xE7\xE3o inv\xE1lida.");
  const body = raw;
  const op = String(body.op ?? "");
  if (op === "create") {
    for (let i = 0; i < 8; i++) {
      const code2 = makeCode();
      const room = { code: code2, hostId: null, status: "lobby", players: [], game: null, createdAt: now, updatedAt: now };
      if (await store2.create(room)) {
        await notify2(code2, 0);
        return ok({ code: code2 });
      }
    }
    return fail(503, "N\xE3o foi poss\xEDvel criar a sala. Tente de novo.");
  }
  const code = String(body.code ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
  if (code.length !== 4) return fail(400, "C\xF3digo de sala inv\xE1lido.");
  for (let attempt = 0; attempt < 6; attempt++) {
    const found = await store2.get(code);
    if (!found) return fail(404, "Sala n\xE3o encontrada. Confira o c\xF3digo.");
    const { room, rev } = found;
    let mutated = settle(room, now);
    let reply = null;
    let me = null;
    switch (op) {
      /* ---------------------------------- estado ---------------------------------- */
      case "state": {
        if (body.playerId) {
          me = auth(room, body);
          if (!me) return fail(403, "Sess\xE3o inv\xE1lida. Entre na sala novamente.");
        }
        reply = null;
        break;
      }
      /* ---------------------------------- entrar ---------------------------------- */
      case "join": {
        if (body.playerId && body.secret) {
          me = auth(room, body);
          if (me) break;
        }
        if (room.status !== "lobby") return fail(409, "A partida j\xE1 come\xE7ou.");
        if (room.players.length >= MAX_PLAYERS) return fail(409, "A sala est\xE1 cheia.");
        let name = cleanName(body.name);
        if (!name) return fail(400, "Diga seu nome, parceiro.");
        const base = name;
        let n = 2;
        while (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) name = `${base.slice(0, 11)} ${n++}`;
        me = { id: makeId(), name, secret: makeToken() };
        room.players.push(me);
        if (!room.hostId) room.hostId = me.id;
        room.updatedAt = now;
        mutated = true;
        break;
      }
      /* --------------------------------- começar ---------------------------------- */
      case "start":
      case "rematch": {
        me = auth(room, body);
        if (!me) return fail(403, "Sess\xE3o inv\xE1lida.");
        if (room.hostId !== me.id) return fail(403, "S\xF3 o anfitri\xE3o pode fazer isso.");
        if (op === "start") {
          if (room.status !== "lobby") return fail(409, "A partida j\xE1 come\xE7ou.");
          if (room.players.length < MIN_PLAYERS) return fail(409, `S\xE3o necess\xE1rios pelo menos ${MIN_PLAYERS} jogadores.`);
          const seed = new Uint32Array(randomBytes(4).buffer)[0];
          room.game = newGame(room.players.map((p) => ({ id: p.id, name: p.name })), seed, now);
          room.status = "playing";
        } else {
          if (room.status !== "over") return fail(409, "A partida ainda n\xE3o terminou.");
          room.game = null;
          room.status = "lobby";
        }
        room.updatedAt = now;
        mutated = true;
        break;
      }
      /* ---------------------------------- jogada ---------------------------------- */
      case "act": {
        me = auth(room, body);
        if (!me) return fail(403, "Sess\xE3o inv\xE1lida.");
        if (room.status !== "playing" || !room.game) return fail(409, "A partida n\xE3o est\xE1 em andamento.");
        const r = apply(room.game, me.id, body.move, now);
        if (!r.ok) {
          if (mutated && !await store2.save(room, rev)) continue;
          return { status: 422, body: { error: r.error, ...stateReply(room, mutated ? rev + 1 : rev, me.id, now) } };
        }
        room.game = r.state;
        if (room.game.phase.kind === "over") room.status = "over";
        room.updatedAt = now;
        mutated = true;
        break;
      }
      /* ----------------------------------- sair ----------------------------------- */
      case "leave": {
        me = auth(room, body);
        if (!me) return ok({ left: true });
        if (room.status === "lobby") {
          room.players = room.players.filter((p) => p.id !== me.id);
          if (room.hostId === me.id) room.hostId = room.players[0]?.id ?? null;
        } else if (room.game && room.status === "playing") {
          const g = forfeit(room.game, me.id, now);
          if (g) {
            room.game = g;
            if (g.phase.kind === "over") room.status = "over";
          }
          if (room.hostId === me.id) {
            const next = room.game.players.find((p) => p.hand.length > 0 && p.id !== me.id);
            room.hostId = next?.id ?? room.hostId;
          }
        }
        room.updatedAt = now;
        mutated = true;
        reply = ok({ left: true });
        break;
      }
      default:
        return fail(400, "Opera\xE7\xE3o desconhecida.");
    }
    if (mutated) {
      const saved = await store2.save(room, rev);
      if (!saved) continue;
      await notify2(code, rev + 1);
    }
    const newRev = mutated ? rev + 1 : rev;
    if (reply) return reply;
    const out = stateReply(room, newRev, me ? me.id : null, now);
    if (op === "join" && me) return ok({ ...out, playerId: me.id, secret: me.secret });
    return ok(out);
  }
  return fail(409, "Muita gente jogando ao mesmo tempo. Tente de novo.");
}

// supabase/entry.ts
var URL_ = Deno.env.get("SUPABASE_URL");
var KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
var REST = `${URL_}/rest/v1/omerta_rooms`;
var H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
var PgStore = class {
  async get(code) {
    const r = await fetch(`${REST}?code=eq.${code}&select=rev,data`, { headers: H });
    if (!r.ok) throw new Error(`db get ${r.status}`);
    const rows = await r.json();
    return rows[0] ? { room: rows[0].data, rev: rows[0].rev } : null;
  }
  async create(room) {
    const r = await fetch(REST, {
      method: "POST",
      headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify({ code: room.code, rev: 0, data: room })
    });
    if (r.status === 409) return false;
    if (!r.ok) throw new Error(`db create ${r.status}`);
    return true;
  }
  /** UPDATE ... WHERE rev = esperado  → controle otimista atômico */
  async save(room, expectedRev) {
    const r = await fetch(`${REST}?code=eq.${room.code}&rev=eq.${expectedRev}`, {
      method: "PATCH",
      headers: { ...H, Prefer: "return=representation" },
      body: JSON.stringify({ rev: expectedRev + 1, data: room, updated_at: (/* @__PURE__ */ new Date()).toISOString() })
    });
    if (!r.ok) throw new Error(`db save ${r.status}`);
    return (await r.json()).length === 1;
  }
};
async function notify(code) {
  try {
    await fetch(`${URL_}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ messages: [{ topic: `omerta:${code}`, event: "changed", payload: {}, private: false }] })
    });
  } catch {
  }
}
var store = new PgStore();
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response("m\xE9todo n\xE3o permitido", { status: 405, headers: CORS });
  let body = null;
  try {
    const text = await req.text();
    if (text.length > 2e4) return new Response("grande demais", { status: 413, headers: CORS });
    body = JSON.parse(text);
  } catch {
  }
  try {
    if (body?.op === "create") {
      fetch(`${URL_}/rest/v1/rpc/omerta_purge_rooms`, { method: "POST", headers: H, body: "{}" }).catch(() => {
      });
    }
    const r = await handle(store, body, Date.now(), notify);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("erro interno", e);
    return new Response(JSON.stringify({ error: "Erro interno do servidor." }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
