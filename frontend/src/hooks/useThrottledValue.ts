import { useState, useEffect, useRef } from 'react';

/**
 * Returns a throttled version of `value` that updates at most once per
 * `intervalMs`. The trailing edge is always delivered so the final value
 * is never lost.
 */
export function useThrottledValue<T>(value: T, intervalMs: number): T {
  const [throttled, setThrottled] = useState(value);
  const lastUpdate = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastUpdate.current;

    if (elapsed >= intervalMs) {
      lastUpdate.current = now;
      setThrottled(value);
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        lastUpdate.current = Date.now();
        setThrottled(value);
      }, intervalMs - elapsed);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, intervalMs]);

  return throttled;
}
