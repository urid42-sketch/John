import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { he } from '../i18n/he';
import { IconCamera, IconImage, IconLink, IconPaste } from '../ui/icons';
import { errorText } from '../ui/errors';
import { toastError } from '../ui/toast';
import { fromClipboard, fromDataTransfer, fromFile, fromUrl, ImportError, type Picked } from './sources';

export function SourceStep({ kind, onPick }: { kind: 'garment' | 'doll'; onPick: (p: Picked) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [help, setHelp] = useState<string | null>(null);

  const fail = (e: unknown) => {
    const text = errorText(e);
    // Blocked links get a persistent explanation instead of a passing toast.
    if (e instanceof ImportError && (e.code === 'cors' || e.code === 'pinterest' || e.code === 'urlNotImage' || e.code === 'clipboardDenied')) setHelp(text);
    else toastError(text);
  };
  const run = async (fn: () => Promise<Picked> | Picked) => {
    setBusy(true);
    setHelp(null);
    try { onPick(await fn()); } catch (e) { fail(e); } finally { setBusy(false); }
  };

  // Ctrl+V / ⌘V anywhere on this screen.
  useEffect(() => {
    const onPaste = (e: globalThis.ClipboardEvent) => {
      const p = fromDataTransfer(e.clipboardData, 'paste');
      if (p) { e.preventDefault(); onPick(p); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [onPick]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const p = fromDataTransfer(e.dataTransfer, 'file');
    if (p) onPick(p); else toastError(he.errors.notImage);
  };
  // Long-press → "Paste" fallback for browsers that block clipboard.read().
  const onAreaPaste = (e: ClipboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const p = fromDataTransfer(e.clipboardData, 'paste');
    if (p) onPick(p); else toastError(he.errors.clipboardEmpty);
  };

  const pasteBtn = (
    <button className={`btn w-full ${kind === 'garment' ? 'btn-primary' : 'btn-ghost'}`} disabled={busy}
      onClick={() => void run(fromClipboard)}>
      <IconPaste />{he.import.paste}
    </button>
  );
  const galleryBtn = (
    <button className={`btn w-full ${kind === 'doll' ? 'btn-primary' : 'btn-ghost'}`} disabled={busy}
      onClick={() => fileRef.current?.click()}>
      <IconImage />{he.import.gallery}
    </button>
  );

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 ${over ? 'bg-rose-soft' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <input ref={fileRef} type="file" accept="image/*" hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run(() => fromFile(f)); }} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run(() => fromFile(f)); }} />

      {kind === 'garment' ? (
        <>
          {pasteBtn}
          <p className="-mt-2 text-center text-xs text-muted">{he.import.pasteHint}</p>
          {galleryBtn}
        </>
      ) : (
        <>
          {galleryBtn}
          <button className="btn btn-ghost w-full" disabled={busy} onClick={() => camRef.current?.click()}>
            <IconCamera />{he.import.camera}
          </button>
          {pasteBtn}
        </>
      )}

      <div
        contentEditable suppressContentEditableWarning inputMode="none" onPaste={onAreaPaste}
        onBeforeInput={(e) => e.preventDefault()}
        className="flex min-h-20 items-center justify-center rounded-2xl border border-dashed border-line px-4 text-center text-sm text-muted outline-none focus:border-rose"
        style={{ WebkitUserSelect: 'text', userSelect: 'text', WebkitTouchCallout: 'default', caretColor: 'transparent' }}
        aria-label={he.import.pasteAreaHint}
      >
        {he.import.pasteAreaHint}
      </div>

      {kind === 'garment' && (
        <form
          className="space-y-2"
          onSubmit={(e) => { e.preventDefault(); if (url.trim()) void run(() => fromUrl(url)); }}
        >
          <label className="flex items-center gap-2 text-sm text-muted"><IconLink />{he.import.link}</label>
          <div className="flex gap-2">
            <input
              type="url" dir="ltr" inputMode="url" value={url} placeholder={he.import.linkPlaceholder}
              onChange={(e) => setUrl(e.target.value)}
              className="h-12 min-w-0 flex-1 rounded-2xl border border-line bg-paper px-4 text-sm outline-none focus:border-rose"
            />
            <button className="btn btn-ghost shrink-0" disabled={busy || !url.trim()}>{he.import.linkGo}</button>
          </div>
        </form>
      )}

      {help && (
        <div role="alert" className="rounded-2xl border border-rose/40 bg-rose-soft p-4 text-sm leading-relaxed">
          {help}
        </div>
      )}
      <p className="hidden text-center text-xs text-muted md:block">{he.import.drop}</p>
    </div>
  );
}
