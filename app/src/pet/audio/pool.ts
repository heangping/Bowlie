export interface Stoppable {
  stop: () => void;
}

/** 有限实例池：超过上限时停掉最旧实例并断开音频图。 */
export class AudioPool {
  private readonly entries: Stoppable[] = [];
  private lastIndex = -1;
  private lastPlayedAt = 0;

  constructor(
    private readonly max: number,
    private readonly minIntervalMs = 0,
  ) {}

  play(factories: Array<() => Stoppable>): void {
    if (factories.length === 0) return;

    let index = Math.floor(Math.random() * factories.length);
    if (index === this.lastIndex) {
      index = (index + 1) % factories.length;
    }
    this.playAt(index, factories);
  }

  playAt(index: number, factories: Array<() => Stoppable>): void {
    if (index < 0 || index >= factories.length) return;

    const now = performance.now();
    if (this.minIntervalMs > 0 && now - this.lastPlayedAt < this.minIntervalMs) {
      return;
    }

    this.lastPlayedAt = now;
    this.lastIndex = index;
    const entry = factories[index]();
    this.entries.push(entry);

    if (this.entries.length > this.max) {
      this.entries.shift()?.stop();
    }
  }

  stopAll(): void {
    for (const entry of this.entries) {
      entry.stop();
    }
    this.entries.length = 0;
    this.lastPlayedAt = 0;
  }
}
