/** Web Audio 上下文与主增益，统一 -3dBFS 余量（主增益 0.8） */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function getContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  return ctx;
}

export function getMaster(): GainNode {
  getContext();
  if (!master) throw new Error("master gain not initialized");
  return master;
}

let enabled = true;

export function setSoundEnabled(value: boolean): void {
  enabled = value;
  if (master && ctx) {
    master.gain.setTargetAtTime(value ? 0.8 : 0, ctx.currentTime, 0.02);
  }
}

export function isSoundEnabled(): boolean {
  return enabled;
}
