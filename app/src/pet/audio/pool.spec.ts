import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioPool, type Stoppable } from "./pool";

let now = 0;

beforeEach(() => {
  now = 0;
  vi.useFakeTimers();
  vi.spyOn(performance, "now").mockImplementation(() => now);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function createEntry(): Stoppable {
  return { stop: vi.fn() };
}

describe("audio pool", () => {
  it("stops the oldest entry after reaching the limit", () => {
    const pool = new AudioPool(2);
    const first = createEntry();
    const second = createEntry();
    const third = createEntry();
    const factories = [() => first, () => second, () => third];

    pool.playAt(0, factories);
    pool.playAt(1, factories);
    pool.playAt(2, factories);

    expect(first.stop).toHaveBeenCalledTimes(1);
    expect(second.stop).not.toHaveBeenCalled();
    expect(third.stop).not.toHaveBeenCalled();
  });

  it("blocks plays inside the minimum interval", () => {
    const pool = new AudioPool(4, 250);
    const first = createEntry();
    const second = createEntry();
    const factories = [() => first, () => second];

    pool.playAt(0, factories);
    now = 100;
    pool.playAt(1, factories);

    expect(first.stop).not.toHaveBeenCalled();
    expect(second.stop).not.toHaveBeenCalled();
  });

  it("avoids repeating the same variant", () => {
    const pool = new AudioPool(4);
    const first = createEntry();
    const second = createEntry();
    const third = createEntry();
    const factories = [() => first, () => second, () => third];
    const random = vi.spyOn(Math, "random").mockReturnValue(0);

    pool.play(factories);
    pool.play(factories);
    pool.play(factories);

    expect(random).toHaveBeenCalledTimes(3);
    expect(first.stop).not.toHaveBeenCalled();
    expect(second.stop).not.toHaveBeenCalled();
    expect(third.stop).not.toHaveBeenCalled();
  });

  it("stops all entries and clears the pool", () => {
    const pool = new AudioPool(4);
    const first = createEntry();
    const second = createEntry();
    const factories = [() => first, () => second];

    pool.playAt(0, factories);
    pool.playAt(1, factories);
    pool.stopAll();

    expect(first.stop).toHaveBeenCalledTimes(1);
    expect(second.stop).toHaveBeenCalledTimes(1);
  });

  it("allows the next play immediately after stopAll", () => {
    const pool = new AudioPool(4, 250);
    const first = createEntry();
    const second = createEntry();
    const factories = [() => first, () => second];

    now = 300;
    pool.playAt(0, factories);
    now = 400;
    pool.stopAll();
    pool.playAt(1, factories);

    expect(first.stop).toHaveBeenCalledTimes(1);
    expect(second.stop).not.toHaveBeenCalled();
  });
});
