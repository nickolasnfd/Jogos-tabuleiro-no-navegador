import type { Room, Store } from './handler';

/** Armazenamento em memória: usado em desenvolvimento local e nos testes. */
export class MemoryStore implements Store {
  private rooms = new Map<string, { room: Room; rev: number }>();

  async get(code: string) {
    const r = this.rooms.get(code);
    return r ? { room: structuredClone(r.room), rev: r.rev } : null;
  }

  async create(room: Room) {
    if (this.rooms.has(room.code)) return false;
    this.rooms.set(room.code, { room: structuredClone(room), rev: 0 });
    return true;
  }

  async save(room: Room, expectedRev: number) {
    const r = this.rooms.get(room.code);
    if (!r || r.rev !== expectedRev) return false;
    this.rooms.set(room.code, { room: structuredClone(room), rev: expectedRev + 1 });
    return true;
  }

  /** remove salas inativas há mais de `maxAgeMs` */
  purge(now: number, maxAgeMs = 6 * 3600_000) {
    for (const [k, v] of this.rooms) if (now - v.room.updatedAt > maxAgeMs) this.rooms.delete(k);
  }
}
