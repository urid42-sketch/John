import type { ReactNode } from 'react';

function I({ children, size = 24 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
  );
}
export const IconMirror = () => <I><rect x="6" y="3" width="12" height="18" rx="6" /><path d="M10 8l4 4M10 12l2 2" /></I>;
export const IconHanger = () => <I><path d="M12 8a2 2 0 1 0-2-2" /><path d="M12 8v2l9 6.5a1 1 0 0 1-.6 1.8H3.6a1 1 0 0 1-.6-1.8L12 10" /></I>;
export const IconScissors = () => <I><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><path d="M8 7.5L20 18M8 16.5L20 6" /></I>;
export const IconHeart = () => <I><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></I>;
export const IconGear = () => <I><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.500V21M3 12h2.5M18.5 12H21M5.6 5.600l1.8 1.800M16.6 16.600l1.8 1.800M5.6 18.400l1.8-1.800M16.6 7.400l1.8-1.8" /></I>;
export const IconPlus = () => <I><path d="M12 5v14M5 12h14" /></I>;
export const IconBack = () => <I><path d="M9 6l6 6-6 6" /></I>;
export const IconClose = () => <I><path d="M6 6l12 12M18 6L6 18" /></I>;
export const IconUndo = () => <I><path d="M8 5L4 9l4 4" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></I>;
export const IconTrash = () => <I><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></I>;
export const IconFlip = () => <I><path d="M12 3v18" strokeDasharray="2 3" /><path d="M9 7L4 12l5 5V7zM15 7l5 5-5 5V7z" /></I>;
export const IconUp = () => <I><rect x="8" y="4" width="12" height="12" rx="2" /><path d="M4 9v9a2 2 0 0 0 2 2h9" /></I>;
export const IconDown = () => <I><rect x="4" y="8" width="12" height="12" rx="2" strokeDasharray="3 3" /><rect x="8" y="4" width="12" height="12" rx="2" /></I>;
export const IconCopy = () => <I><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></I>;
export const IconPaste = () => <I><rect x="5" y="5" width="14" height="16" rx="2" /><path d="M9 5V3h6v2M9 12h6M9 16h4" /></I>;
export const IconImage = () => <I><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="M21 16l-5-5-8 8" /></I>;
export const IconCamera = () => <I><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></I>;
export const IconLink = () => <I><path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1" /><path d="M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1" /></I>;
export const IconEraser = () => <I><path d="M4 16l9-9 6 6-6 6H8z" /><path d="M10 10l6 6M4 20h16" /></I>;
export const IconBrush = () => <I><path d="M14 4l6 6-8 8H6v-6z" /><path d="M4 20c2 0 3-1 3-3" /></I>;
export const IconSparkle = () => <I><path d="M12 3l1.8 5.200L19 10l-5.2 1.800L12 17l-1.8-5.200L5 10l5.2-1.800z" /><path d="M19 16v4M17 18h4" /></I>;
export const IconFilter = () => <I><path d="M4 6h16M7 12h10M10 18h4" /></I>;
