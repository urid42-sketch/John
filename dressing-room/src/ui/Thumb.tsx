import { useBlobUrl } from '../db/blobs';
import type { BlobRef } from '../db/types';

export function Thumb({ blob, alt, className = '' }: { blob: BlobRef; alt: string; className?: string }) {
  const url = useBlobUrl(blob);
  return url ? (
    <img src={url} alt={alt} draggable={false} className={`h-full w-full object-contain ${className}`} />
  ) : (
    <div className={`h-full w-full ${className}`} aria-hidden="true" />
  );
}
