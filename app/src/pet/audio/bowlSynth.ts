import { getContext, getMaster } from "./engine";
import type { Stoppable } from "./pool";

type PartialTimbre = {
  /**
   * 相对基频的倍率。颂钵是板/壳振动体，泛音列明显非谐，
   * 所以用 1 : 2.71 : 5.42 : 8.93 : 13.1 这组实测比例，而不是整数倍频。
   */
  ratio: number;
  amplitude: number;
  /** 该泛音的指数衰减时长（秒）：高频先消散，基频留最长的余韵。 */
  decay: number;
};

type BowlTimbre = {
  frequency: number;
  duration: number;
  /**
   * 拍频（Hz）。真实颂钵的口沿振动模态会分裂成两个极接近的频率，
   * 叠加后产生缓慢的振幅脉动——这是"嗡——"的那种生命感来源。
   */
  beatHz: number;
  /** 低通截止频率随余韵下移，模拟高频先衰减的听感。 */
  brightnessStart: number;
  brightnessEnd: number;
  partials: PartialTimbre[];
};

const BOWL_SOUND_VARIANTS = [
  {
    frequency: 174,
    duration: 4.6,
    beatHz: 2.2,
    brightnessStart: 5200,
    brightnessEnd: 880,
    partials: [
      { ratio: 1, amplitude: 1, decay: 4.6 },
      { ratio: 2.71, amplitude: 0.4, decay: 3.1 },
      { ratio: 5.42, amplitude: 0.18, decay: 2.0 },
      { ratio: 8.93, amplitude: 0.08, decay: 1.2 },
      { ratio: 13.1, amplitude: 0.035, decay: 0.75 },
    ],
  },
  {
    frequency: 191,
    duration: 5.0,
    beatHz: 2.6,
    brightnessStart: 5600,
    brightnessEnd: 960,
    partials: [
      { ratio: 1, amplitude: 1, decay: 5.0 },
      { ratio: 2.68, amplitude: 0.38, decay: 3.3 },
      { ratio: 5.34, amplitude: 0.17, decay: 2.1 },
      { ratio: 8.86, amplitude: 0.075, decay: 1.25 },
      { ratio: 13.0, amplitude: 0.03, decay: 0.8 },
    ],
  },
  {
    frequency: 208,
    duration: 5.4,
    beatHz: 3.0,
    brightnessStart: 6000,
    brightnessEnd: 1040,
    partials: [
      { ratio: 1, amplitude: 1, decay: 5.4 },
      { ratio: 2.74, amplitude: 0.38, decay: 3.5 },
      { ratio: 5.46, amplitude: 0.19, decay: 2.3 },
      { ratio: 8.98, amplitude: 0.08, decay: 1.35 },
      { ratio: 13.2, amplitude: 0.04, decay: 0.85 },
    ],
  },
] satisfies BowlTimbre[] as readonly BowlTimbre[];

export type BowlSoundVariant = 0 | 1 | 2;

const ATTACK_SECONDS = 0.006;
const SILENCE = 0.0001;
/** 各泛音相加后的静态余量，避免拍频同相瞬间削顶 */
const OUTPUT_GAIN = 0.75;

export function playBowlSound(variant: BowlSoundVariant): Stoppable {
  const timbre = BOWL_SOUND_VARIANTS[variant];
  const ctx = getContext();
  const master = getMaster();
  const now = ctx.currentTime;

  const soundGain = ctx.createGain();
  soundGain.gain.setValueAtTime(OUTPUT_GAIN, now);
  soundGain.connect(master);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(timbre.brightnessStart, now);
  filter.frequency.exponentialRampToValueAtTime(
    timbre.brightnessEnd,
    now + timbre.duration,
  );
  filter.Q.value = 0.7;
  filter.connect(soundGain);

  const totalAmplitude = timbre.partials.reduce(
    (sum, partial) => sum + partial.amplitude,
    0,
  );
  const oscillators: OscillatorNode[] = [];
  let longestDecay = 0;

  for (const partial of timbre.partials) {
    const base = timbre.frequency * partial.ratio;
    const level = (partial.amplitude / totalAmplitude) * 0.5;
    longestDecay = Math.max(longestDecay, partial.decay);

    const partialGain = ctx.createGain();
    partialGain.gain.setValueAtTime(SILENCE, now);
    partialGain.gain.exponentialRampToValueAtTime(level, now + ATTACK_SECONDS);
    partialGain.gain.exponentialRampToValueAtTime(SILENCE, now + partial.decay);
    partialGain.connect(filter);

    // 两个轻微失谐的振荡器叠加 → 该泛音带上拍频脉动
    const detuneRatio = timbre.beatHz / base;
    for (const ratio of [1, 1 + detuneRatio]) {
      const oscillator = ctx.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(base * ratio, now);
      oscillator.connect(partialGain);
      oscillator.start(now);
      oscillator.stop(now + partial.decay + 0.08);
      oscillators.push(oscillator);
    }
  }

  let stopped = false;
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    const stopAt = ctx.currentTime + 0.06;
    soundGain.gain.cancelScheduledValues(ctx.currentTime);
    soundGain.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
    for (const oscillator of oscillators) {
      oscillator.stop(stopAt);
    }
    window.setTimeout(() => {
      filter.disconnect();
      soundGain.disconnect();
    }, 160);
  };

  // 各泛音衰减时长不同，用最长的那条兜底回收音频图
  window.setTimeout(() => {
    filter.disconnect();
    soundGain.disconnect();
  }, (longestDecay + 0.25) * 1000);

  return { stop };
}
