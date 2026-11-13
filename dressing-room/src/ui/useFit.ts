import { useLayoutEffect, useState, type RefObject } from 'react';

/** Size of a w×h box fitted inside the referenced container (contain), plus the container size. */
export function useFit(ref: RefObject<HTMLElement | null>, w: number, h: number) {
  const [box, setBox] = useState({ cw: 0, ch: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox({ cw: el.clientWidth, ch: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  const s = w && h && box.cw && box.ch ? Math.min(box.cw / w, box.ch / h) : 0;
  return { ...box, width: w * s, height: h * s, scale: s };
}
