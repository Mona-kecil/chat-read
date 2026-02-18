import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLongPressHandlers } from "@/hooks/use-long-press";

describe("createLongPressHandlers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls onLongPress after the default delay", () => {
    const onLongPress = vi.fn();
    const { handlers } = createLongPressHandlers({ onLongPress });

    handlers.onPointerDown();
    expect(onLongPress).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(onLongPress).toHaveBeenCalledOnce();
  });

  it("does NOT call onLongPress if pointer released before delay", () => {
    const onLongPress = vi.fn();
    const { handlers } = createLongPressHandlers({ onLongPress });

    handlers.onPointerDown();
    vi.advanceTimersByTime(200);
    handlers.onPointerUp();

    vi.advanceTimersByTime(200);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("cleans up timer via cleanup function", () => {
    const onLongPress = vi.fn();
    const { handlers, cleanup } = createLongPressHandlers({ onLongPress });

    handlers.onPointerDown();
    vi.advanceTimersByTime(100);
    cleanup();

    vi.advanceTimersByTime(300);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("uses custom delay when provided", () => {
    const onLongPress = vi.fn();
    const { handlers } = createLongPressHandlers({ onLongPress, delay: 500 });

    handlers.onPointerDown();
    vi.advanceTimersByTime(300);
    expect(onLongPress).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(onLongPress).toHaveBeenCalledOnce();
  });

  it("cancels on pointerLeave", () => {
    const onLongPress = vi.fn();
    const { handlers } = createLongPressHandlers({ onLongPress });

    handlers.onPointerDown();
    vi.advanceTimersByTime(100);
    handlers.onPointerLeave();

    vi.advanceTimersByTime(300);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("prevents default on contextMenu", () => {
    const onLongPress = vi.fn();
    const { handlers } = createLongPressHandlers({ onLongPress });
    const event = { preventDefault: vi.fn() };

    handlers.onContextMenu(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });
});
