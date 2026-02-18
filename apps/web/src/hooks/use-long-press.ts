import { useCallback, useEffect, useRef } from "react";

export type UseLongPressOptions = {
  delay?: number;
  onLongPress: () => void;
  onCancel?: () => void;
};

type LongPressHandlers = {
  onPointerDown: () => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onContextMenu: (e: { preventDefault: () => void }) => void;
};

export const createLongPressHandlers = (
  options: UseLongPressOptions,
): { handlers: LongPressHandlers; cleanup: () => void } => {
  const delay = options.delay ?? 300;
  let timerId: ReturnType<typeof setTimeout> | null = null;

  const clear = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  const handlers: LongPressHandlers = {
    onPointerDown: () => {
      clear();
      timerId = setTimeout(() => {
        options.onLongPress();
      }, delay);
    },
    onPointerUp: () => {
      clear();
    },
    onPointerLeave: () => {
      clear();
    },
    onContextMenu: (e) => {
      e.preventDefault();
    },
  };

  return { handlers, cleanup: clear };
};

export const useLongPress = (options: UseLongPressOptions) => {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return clear;
  }, [clear]);

  const handlers = {
    onPointerDown: useCallback(() => {
      clear();
      const delay = optionsRef.current.delay ?? 300;
      timerRef.current = setTimeout(() => {
        optionsRef.current.onLongPress();
      }, delay);
    }, [clear]),
    onPointerUp: useCallback(() => {
      clear();
      optionsRef.current.onCancel?.();
    }, [clear]),
    onPointerLeave: useCallback(() => {
      clear();
      optionsRef.current.onCancel?.();
    }, [clear]),
    onContextMenu: useCallback((e: React.PointerEvent | React.MouseEvent) => {
      e.preventDefault();
    }, []),
  };

  return { handlers };
};
