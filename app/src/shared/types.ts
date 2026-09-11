export type Mode = "bowl" | "circle";

export interface WaveSpawnPayload {
  x: number;
  y: number;
  speed: number;
  /** 波纹终点半径：由点击点到所在显示器最远边缘的距离推导，保证扩散到屏幕边缘 */
  endRadius: number;
}

export interface PetState {
  mode: Mode;
  /** 紧箍咒压力等级 0~4 */
  circleLevel: number;
  soundEnabled: boolean;
}
