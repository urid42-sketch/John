import { useState } from 'react';
import { he } from '../i18n/he';
import { IconClose } from '../ui/icons';
import { aiConsented, aiPin, setAiConsent, setAiPin } from './client';

/** True when the user already agreed and entered the activation code. */
export const aiReady = () => aiConsented() && aiPin() !== '';

/** One-time sheet: explains that images leave the phone and asks for the activation code. */
export function AiGate({ onReady, onClose }: { onReady: () => void; onClose: () => void }) {
  const [pin, setPin] = useState(aiPin());
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end bg-ink/30" onClick={onClose}>
      <div className="safe-b mx-auto w-full max-w-xl space-y-3 rounded-t-3xl bg-paper p-5" role="dialog" aria-label={he.ai.consentTitle} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg">{he.ai.consentTitle}</h2>
          <button className="flex h-11 w-11 items-center justify-center" onClick={onClose} aria-label={he.common.close}><IconClose /></button>
        </div>
        <p className="text-sm leading-relaxed text-muted">{he.ai.consentBody}</p>
        <label className="block">
          <span className="mb-1 block text-sm">{he.ai.pinTitle}</span>
          <input
            type="password" inputMode="text" autoComplete="off" dir="ltr" value={pin} onChange={(e) => setPin(e.target.value)}
            className="h-12 w-full rounded-2xl border border-line bg-cream px-4 outline-none focus:border-rose"
          />
          <span className="mt-1 block text-xs text-muted">{he.ai.pinHint}</span>
        </label>
        <button
          className="btn btn-primary w-full" disabled={!pin.trim()}
          onClick={() => { setAiPin(pin.trim()); setAiConsent(); onReady(); }}
        >
          {he.ai.consentGo}
        </button>
      </div>
    </div>
  );
}
