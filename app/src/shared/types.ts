export type Mode = "bowl" | "circle";

export interface WaveSpawnPayload {
  x: number;
  y: number;
}

export interface PetState {
  mode: Mode;
  /** 紧箍咒压力等级 0~4 */
  circleLevel: number;
  soundEnabled: boolean;
}
