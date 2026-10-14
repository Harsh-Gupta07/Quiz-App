import { useEffect, useRef } from 'react';

type KeyMap = Record<string, (e: KeyboardEvent) => void>;

/**
 * Global keyboard shortcuts. Ignored while typing in inputs. When a button has focus, Enter is
 * intercepted here (and the native click suppressed) so a single key press can never fire twice.
 */
export function useHotkeys(map: KeyMap, enabled = true) {
  const ref = useRef(map);
  ref.current = map;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
      if (target?.closest('[role="dialog"]')) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const fn = ref.current[key];
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
