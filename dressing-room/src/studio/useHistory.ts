import { useCallback, useRef, useState } from 'react';

const LIMIT = 60;

/**
 * Undo / redo over immutable snapshots. Rapid changes with the same `key` (dragging one
 * slider) collapse into a single step, so undo never has to walk through every pixel.
 */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState({ past: [] as T[], present: initial, future: [] as T[] });
  const last = useRef({ key: '', at: 0 });

  const set = useCallback((next: T, key = '') => {
    const now = Date.now();
    const merge = key !== '' && key === last.current.key && now - last.current.at < 900;
    last.current = { key, at: now };
    setState((s) => (merge
      ? { ...s, present: next, future: [] }
      : { past: [...s.past, s.present].slice(-LIMIT), present: next, future: [] }));
  }, []);
  const undo = useCallback(() => {
    last.current = { key: '', at: 0 };
    setState((s) => (s.past.length
      ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] }
      : s));
  }, []);
  const redo = useCallback(() => {
    last.current = { key: '', at: 0 };
    setState((s) => (s.future.length
      ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) }
      : s));
  }, []);
  const reset = useCallback((value: T) => {
    last.current = { key: '', at: 0 };
    setState({ past: [], present: value, future: [] });
  }, []);

  return { value: state.present, set, undo, redo, reset, canUndo: state.past.length > 0, canRedo: state.future.length > 0, steps: state.past.length };
}
