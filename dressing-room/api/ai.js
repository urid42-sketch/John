// Vercel serverless function: the only place the AI provider key exists.
// Environment variables (Vercel → Project → Settings → Environment Variables):
//   FAL_KEY   – API key from fal.ai
//   APP_PIN   – a passphrase of at least 12 characters; the app must send it, so strangers cannot spend your credit
//   AI_MODEL  – optional, defaults to an image-editing model that accepts several reference images
import { timingSafeEqual } from 'node:crypto';

export const config = { maxDuration: 60 };

const TRYON_PROMPT =
  'Image 1 is a rough collage: clothes pasted flat on top of a photo of a woman. Image 2 is the original photo of the same woman. ' +
  'Create ONE photorealistic full-body photograph of this exact woman wearing exactly the clothes from image 1: the same garments, ' +
  'colours, prints, necklines, sleeves and lengths, now fitted naturally to her body with realistic drape, folds, seams and soft shadows, ' +
  'tucked correctly under her arms and hair. Keep her face, hair, skin tone, body shape and pose exactly as in image 2. ' +
  'Do not add, remove or redesign any garment. Soft neutral studio background, natural light, full body in frame.';

const editPrompt = (text) =>
  'This is a product photo of a single garment. Change it as follows: "' + text + '". ' +
  'Keep the same garment type, camera angle and framing unless the request says otherwise. ' +
  'Show only the garment, flat front view, on a plain pure white background, no person, no mannequin, no text.';

const MAX_IMAGE_CHARS = 1_400_000; // three images must fit Vercel's 4.5MB request limit
const hits = new Map(); // best-effort rate limit per warm instance
function limited(ip) {
  const now = Date.now(), list = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 8;
}
function samePin(a, b) {
  const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const key = process.env.FAL_KEY, pin = process.env.APP_PIN;
  // A short code could be guessed, so it does not count as configured.
  if (!key || !pin || pin.length < 12) return res.status(501).json({ error: 'not_configured' });
  // Count every attempt (wrong codes included) so guessing is throttled too.
  if (limited(String(req.headers['x-forwarded-for'] ?? 'x').split(',')[0])) return res.status(429).json({ error: 'rate' });
  if (!samePin(req.headers['x-app-pin'], pin)) return res.status(401).json({ error: 'bad_pin' });

  const { mode, images, text } = req.body ?? {};
  const okImages = Array.isArray(images) && images.length >= 1 && images.length <= 3 &&
    images.every((i) => typeof i === 'string' && /^data:image\/(jpeg|png);base64,/.test(i) && i.length < MAX_IMAGE_CHARS);
  if (!okImages || (mode !== 'tryon' && mode !== 'edit')) return res.status(400).json({ error: 'bad_request' });
  let prompt = TRYON_PROMPT;
  if (mode === 'edit') {
    const clean = String(text ?? '').replace(/["\n\r]/g, ' ').trim().slice(0, 300);
    if (!clean) return res.status(400).json({ error: 'bad_request' });
    prompt = editPrompt(clean);
  }
  const model = /^[\w./-]{3,80}$/.test(process.env.AI_MODEL ?? '') ? process.env.AI_MODEL : 'fal-ai/nano-banana/edit';

  try {
    const r = await fetch(`https://fal.run/${model}`, {
      method: 'POST',
      headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, image_urls: images, output_format: 'jpeg' }),
      signal: AbortSignal.timeout(50_000),
    });
    if (!r.ok) {
      console.error('provider error', r.status, (await r.text()).slice(0, 500));
      return res.status(502).json({ error: 'provider', status: r.status });
    }
    const url = (await r.json())?.images?.[0]?.url;
    if (typeof url !== 'string' || !url.startsWith('https://')) return res.status(502).json({ error: 'no_image' });
    const img = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!img.ok) return res.status(502).json({ error: 'no_image' });
    const type = img.headers.get('content-type') ?? 'image/jpeg';
    const buf = Buffer.from(await img.arrayBuffer());
    if (!type.startsWith('image/') || buf.length > 3_200_000) return res.status(502).json({ error: 'no_image' });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ image: `data:${type};base64,${buf.toString('base64')}` });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'provider' });
  }
}
