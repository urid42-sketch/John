import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { assetCanvas, fabricDetail, fabricTile, loadFabricAssets } from '../engine/fabricTiles';
import type { Fabric, GarmentDesign } from '../engine/types';
import { he } from '../i18n/he';
import { ensureFabricImage } from '../studio/renderDesign';
import { FLOOR_Y, FORM_BOTTOM, FORM_TOP, formPoint, garmentShell, hasCloth, LEVELS, rowAt, sectionPoint, type Shell } from './form';

const CENTER = 550, S = 0.01; // body units → scene units, y flipped
const V = (x: number, y: number, z: number) => new THREE.Vector3(x * S, (CENTER - y) * S, z * S);
const tint = (hex: string, k: number) => new THREE.Color(hex).lerp(new THREE.Color(k > 0 ? '#ffffff' : '#000000'), Math.abs(k));

/** Grid of points → mesh. uv = cloth coordinates, uv1 = (column, row) for the cut-out mask. */
function loft(pos: Shell['pos'], uv: (i: number, j: number) => [number, number]): THREE.BufferGeometry {
  const rows = pos.length - 1, cols = pos[0].length - 1;
  const p = new Float32Array((rows + 1) * (cols + 1) * 3), t = new Float32Array((rows + 1) * (cols + 1) * 2), t1 = new Float32Array((rows + 1) * (cols + 1) * 2);
  for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) {
    const k = i * (cols + 1) + j, q = pos[i][j], v = V(q.x, q.y, q.z);
    p.set([v.x, v.y, v.z], k * 3);
    t.set(uv(i, j), k * 2);
    t1.set([j / cols, 1 - i / rows], k * 2);
  }
  const idx: number[] = [];
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const a = i * (cols + 1) + j, b = a + 1, c = a + cols + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(t, 2));
  g.setAttribute('uv1', new THREE.BufferAttribute(t1, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const n = g.getAttribute('normal') as THREE.BufferAttribute; // close the seam smoothly
  for (let i = 0; i <= rows; i++) {
    const a = i * (cols + 1), b = a + cols;
    const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
  }
  return g;
}

function ring(y: number, cols: number, at: (theta: number) => { x: number; z: number }) {
  return Array.from({ length: cols + 1 }, (_, j) => { const th = (j / cols) * Math.PI * 2 - Math.PI, q = at(th); return { x: q.x, y, z: q.z }; });
}

function noiseTexture(size: number, strength: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!, img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) { const v = 128 + (Math.random() - 0.5) * 255 * strength; img.data.set([v, v, v, 255], i * 4); }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  return t;
}

/** The tailor's dress form: velvet torso, metal pole, wooden four-legged stand. */
function buildForm(): THREE.Group {
  const g = new THREE.Group();
  const cols = 72, rows = 84;
  const pos = Array.from({ length: rows + 1 }, (_, i) => {
    const y = FORM_TOP + (FORM_BOTTOM - FORM_TOP) * (i / rows);
    return ring(y, cols, (th) => formPoint(y, th));
  });
  const velvet = new THREE.MeshPhysicalMaterial({
    color: '#a8632c', roughness: 1, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color('#f2c48f'),
    bumpMap: noiseTexture(256, 0.5), bumpScale: 0.6,
  });
  const pile = assetCanvas('velvet');
  if (pile) { // real velvet: caramel colour with the photographed pile laid over it, and its relief
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const x = c.getContext('2d')!;
    x.fillStyle = '#b06a2f'; x.fillRect(0, 0, 512, 512);
    x.globalCompositeOperation = 'overlay'; x.drawImage(pile, 0, 0, 512, 512);
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    const bump = new THREE.CanvasTexture(pile);
    for (const t of [map, bump]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.2, 1.2); t.anisotropy = 4; }
    velvet.color.set('#ffffff'); velvet.map = map; velvet.bumpMap = bump; velvet.bumpScale = 1.4;
  }
  const torso = new THREE.Mesh(loft(pos, (i, j) => [j / cols * 3, i / rows * 3]), velvet);
  torso.castShadow = true;
  g.add(torso);
  const top = rowAt(FORM_TOP); // neck cap
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(top.hw * S, top.hw * S, 0.06, 40), new THREE.MeshStandardMaterial({ color: '#4a2516', roughness: 0.45 }));
  cap.scale.z = top.df / top.hw;
  cap.position.copy(V(0, FORM_TOP - 2, 0));
  g.add(cap);

  const metal = new THREE.MeshStandardMaterial({ color: '#b8b8b8', metalness: 1, roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1c1a1a', metalness: 0.6, roughness: 0.45 });
  const wood = new THREE.MeshStandardMaterial({ color: '#5b2c1b', roughness: 0.42 });
  const grainC = assetCanvas('wood');
  if (grainC) { const t = new THREE.CanvasTexture(grainC); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; wood.color.set('#b98f7c'); wood.map = t; }
  const rod = (y0: number, y1: number, r: number, m: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, (y1 - y0) * S, 24), m);
    mesh.position.copy(V(0, (y0 + y1) / 2, 0));
    mesh.castShadow = true;
    g.add(mesh);
  };
  rod(FORM_BOTTOM - 14, 800, 0.032, metal);
  rod(790, 880, 0.05, dark);
  const hub = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.34, 0.2), wood);
  hub.position.copy(V(0, 900, 0));
  hub.castShadow = true;
  g.add(hub);
  for (let k = 0; k < 4; k++) { // four legs sweeping down to the floor
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.13), wood);
    const pivot = new THREE.Group();
    leg.position.set(0.5, 0, 0);
    leg.rotation.z = -Math.atan2((FLOOR_Y - 930) * S, 1.0);
    leg.castShadow = true;
    pivot.add(leg);
    pivot.position.copy(V(0, 925, 0));
    pivot.rotation.y = Math.PI / 4 + (k * Math.PI) / 2;
    g.add(pivot);
  }
  return g;
}

function clothMaterial(f: Fabric): THREE.MeshPhysicalMaterial {
  const map = new THREE.CanvasTexture(fabricTile(f));
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  const base = f.colors[0];
  const m = new THREE.MeshPhysicalMaterial({ map, side: THREE.DoubleSide, roughness: 0.85, sheen: 0.3, sheenRoughness: 0.6, sheenColor: tint(base, 0.5) });
  if (f.kind === 'satin') { m.roughness = 0.58 - 0.22 * f.sheen; m.sheen = 0.7; m.sheenRoughness = 0.25; m.sheenColor = tint(base, 0.7); }
  if (f.kind === 'velvet') { m.roughness = 1; m.sheen = 0.55; m.sheenRoughness = 0.5; m.sheenColor = tint(base, 0.3); }
  if (f.kind === 'denim' || f.kind === 'linen') { m.roughness = 0.95; m.sheen = 0.1; }
  if (f.kind === 'lace') { m.transparent = true; m.alphaTest = 0.08; }
  const weave = fabricDetail(f.kind);
  if (weave && f.sequins <= 0.05) { // the threads catch the light
    const b = new THREE.CanvasTexture(weave);
    b.wrapS = b.wrapT = THREE.RepeatWrapping;
    m.bumpMap = b; m.bumpScale = f.kind === 'satin' ? 0.35 : 0.9;
  }
  if (f.sequins > 0.05) { m.roughness = Math.max(0.12, m.roughness - 0.5 * f.sequins); m.metalness = 0.55 * f.sequins; m.bumpMap = noiseTexture(128, 1); m.bumpScale = 1.5; (m.bumpMap as THREE.Texture).repeat.set(24, 24); }
  return m;
}

/** Black / white picture of where the tube has cloth (necklines, armholes, straps). */
function maskTexture(d: GarmentDesign, shell: Shell): THREE.CanvasTexture {
  const W = 512, H = 512, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!, img = ctx.createImageData(W, H);
  for (let i = 0; i < H; i++) {
    const y = shell.yTop + (shell.yHem - shell.yTop) * (i / (H - 1)), r = rowAt(Math.min(y, LEVELS.hip));
    for (let j = 0; j < W; j++) {
      const th = (j / (W - 1)) * Math.PI * 2 - Math.PI;
      const v = hasCloth(d, sectionPoint(r, th, false).x, y, Math.cos(th) > 0) ? 255 : 0;
      img.data.set([v, v, v, 255], (i * W + j) * 4);
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.channel = 1; // sampled with uv1
  return t;
}

function buildGarment(d: GarmentDesign): THREE.Group {
  const g = new THREE.Group();
  const f = d.fabric, tileWorld = 256 * 0.55 * f.scale; // body units covered by one fabric tile
  const mat = clothMaterial(f);
  let shell = garmentShell(d);
  const crotchY = 574; // past the underside of the form, so nothing of it shows between the legs
  if (d.type === 'pants') { // upper part as a tube, then two legs
    const keep = shell.pos.filter((row) => row[0].y <= crotchY);
    shell = { ...shell, pos: keep, rows: keep.length - 1, yHem: keep[keep.length - 1][0].y };
  }
  const uv = (pos: Shell['pos']) => (i: number, j: number): [number, number] => [((j / (pos[0].length - 1)) * Math.PI * 2 * 78) / tileWorld, -pos[i][j].y / tileWorld];
  const body = new THREE.Mesh(loft(shell.pos, uv(shell.pos)), mat);
  if (d.type === 'dress' || d.type === 'top') { mat.alphaMap = maskTexture(d, shell); mat.alphaTest = Math.max(mat.alphaTest, 0.5); if (f.kind === 'lace') mat.alphaTest = 0.3; }
  body.castShadow = true;
  g.add(body);

  if (d.type === 'pants') {
    const hemY = garmentShell(d).yHem, legMat = mat.clone();
    for (const side of [-1, 1]) {
      const rows = 40, cols = 32;
      const pos = Array.from({ length: rows + 1 }, (_, i) => {
        const top = LEVELS.hip + 10, t = i / rows, y = top + (hemY - top) * t;
        const taper = t < 0.5 ? 1 - 0.34 * (t / 0.5) : 0.66 + (d.flare * 0.9) * ((t - 0.5) / 0.5) ** 2;
        const r = (46 + 82 * d.ease) * taper;
        return ring(y, cols, (th) => ({ x: side * (40 + 4 * t) + Math.sin(th) * r, z: Math.cos(th) * r * 1.05 + 2 }));
      });
      const leg = new THREE.Mesh(loft(pos, (i, j) => [((j / cols) * Math.PI * 2 * 40) / tileWorld, -pos[i][j].y / tileWorld]), legMat);
      leg.castShadow = true;
      g.add(leg);
    }
  }

  // sleeves: the form has no arms, so they sit at the shoulder ends and hang
  if ((d.type === 'dress' || d.type === 'top') && (d.neckline === 'v' || d.neckline === 'round') && (d.sleeves === 'short' || d.sleeves === 'puff' || d.sleeves === 'long')) {
    for (const side of [-1, 1]) {
      const sm = mat.clone(); sm.alphaMap = null; sm.alphaTest = f.kind === 'lace' ? 0.08 : 0;
      let mesh: THREE.Mesh;
      if (d.sleeves === 'long') {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.15, 2.5, 28, 1, true), sm);
        mesh.position.copy(V(side * 104, 214 + 122, 0));
        mesh.rotation.z = side * 0.1;
      } else {
        const puff = d.sleeves === 'puff';
        mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.62), sm);
        mesh.scale.set(puff ? 0.36 : 0.29, puff ? 0.44 : 0.4, puff ? 0.4 : 0.34);
        mesh.position.copy(V(side * (puff ? 92 : 88), puff ? 222 : 226, 0));
        mesh.rotation.z = side * -0.5;
      }
      mesh.castShadow = true;
      g.add(mesh);
    }
  }

  // details that have a 3D form: belt, buttons, bow
  const at = (y: number, theta: number, lift = 0) => {
    const i = Math.round(((y - shell.yTop) / (shell.yHem - shell.yTop)) * shell.rows), row = shell.pos[Math.min(shell.rows, Math.max(0, i))];
    const j = Math.round(((theta + Math.PI) / (Math.PI * 2)) * shell.cols), q = row[Math.min(shell.cols, Math.max(0, j))];
    const l = Math.hypot(q.x, q.z) || 1;
    return V(q.x + (q.x / l) * lift, q.y, q.z + (q.z / l) * lift);
  };
  const yOf = (v: number) => shell.yTop + (shell.yHem - shell.yTop) * v;
  for (const det of d.details) {
    const color = new THREE.Color(det.color);
    if (det.kind === 'belt') {
      const y = (d.type === 'dress' || d.type === 'top' ? LEVELS.waist : LEVELS.waist - 6) + (det.y - 0.5) * 120, h = 7 * det.size, cols = 72;
      const band = [y - h, y, y + h].map((yy, k) => ring(yy, cols, (th) => { const p = at(yy, th, k === 1 ? 4.5 : 2.5); return { x: p.x / S, z: p.z / S }; }));
      const mesh = new THREE.Mesh(loft(band, (i, j) => [j / cols, i]), new THREE.MeshStandardMaterial({ color, roughness: 0.5, side: THREE.DoubleSide }));
      mesh.castShadow = true;
      g.add(mesh);
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.2, h * S * 2.6, 0.035), new THREE.MeshStandardMaterial({ color: '#d7b25e', metalness: 1, roughness: 0.25 }));
      buckle.position.copy(at(y, (det.x - 0.5) * 1.2, 6));
      g.add(buckle);
    } else if (det.kind === 'buttons') {
      const n = Math.max(1, Math.round(det.n ?? 5)), len = det.len ?? 0.5;
      for (let k = 0; k < n; k++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.035 * det.size, 16, 12), new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.2 }));
        b.scale.z = 0.5;
        b.position.copy(at(yOf(Math.min(0.98, det.y + 0.08 + (n === 1 ? 0 : (k / (n - 1)) * len * 0.8))), (det.x - 0.5) * 1.2, 2));
        g.add(b);
      }
    } else if (det.kind === 'bow') {
      const c = at(yOf(det.y), (det.x - 0.5) * 1.6, 5), m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, sheen: 0.6, sheenColor: tint(det.color, 0.5) });
      for (const sx of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), m);
        w.scale.set(0.17 * det.size, 0.1 * det.size, 0.045 * det.size);
        w.position.set(c.x + sx * 0.16 * det.size, c.y, c.z);
        w.rotation.z = sx * 0.25;
        g.add(w);
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.07 * det.size, 0.26 * det.size, 0.012), m);
        tail.position.set(c.x + sx * 0.07 * det.size, c.y - 0.17 * det.size, c.z);
        tail.rotation.z = sx * 0.3;
        g.add(tail);
      }
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.05 * det.size, 16, 12), m);
      knot.position.copy(c);
      g.add(knot);
    }
  }
  return g;
}

function dispose(o: THREE.Object3D) {
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    m.geometry?.dispose();
    for (const mat of (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as THREE.MeshPhysicalMaterial[]) {
      mat.map?.dispose(); mat.alphaMap?.dispose(); mat.bumpMap?.dispose(); mat.dispose();
    }
  });
}

/** Rotatable 3D view of the design on a tailor's dress form. */
export default function Viewer({ design, onUnavailable }: { design: GarmentDesign; onUnavailable?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ setDesign: (d: GarmentDesign) => void } | null>(null);
  const [hint, setHint] = useState(true);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); }
    catch (e) { console.error(e); onUnavailable?.(); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = 'none';

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.75;
    const key = new THREE.DirectionalLight('#fff4e6', 2.4);
    key.position.set(4, 7, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -5, right: 5, top: 6, bottom: -6, near: 1, far: 30 });
    key.shadow.bias = -0.0008;
    key.shadow.radius = 6;
    scene.add(key, new THREE.DirectionalLight('#dfe8ff', 0.5).translateX(-5).translateY(2).translateZ(-4));
    const floor = new THREE.Mesh(new THREE.CircleGeometry(7, 48), new THREE.ShadowMaterial({ opacity: 0.22 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.copy(V(0, FLOOR_Y, 0));
    floor.receiveShadow = true;
    scene.add(floor);
    void loadFabricAssets().catch(() => undefined).then(() => { if (alive) { scene.add(buildForm()); render(); } });

    const camera = new THREE.PerspectiveCamera(27, 1, 0.1, 100);
    camera.position.set(6.6, 0.9, 20.5);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, -0.05, 0);
    controls.enablePan = false;
    controls.minDistance = 8; controls.maxDistance = 30;
    controls.minPolarAngle = 0.75; controls.maxPolarAngle = 1.72;
    controls.rotateSpeed = 0.8;
    controls.update();

    let frame = 0, alive = true;
    const render = () => { if (!frame && alive) frame = requestAnimationFrame(() => { frame = 0; renderer.render(scene, camera); }); };
    controls.addEventListener('change', render);
    controls.addEventListener('start', () => setHint(false));
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      // keep the whole stand in view on narrow screens
      camera.fov = w / h < 0.5 ? 27 + (0.5 - w / h) * 50 : 27;
      camera.updateProjectionMatrix();
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let garment: THREE.Group | null = null, token = 0;
    api.current = {
      setDesign: (d) => {
        const my = ++token;
        void ensureFabricImage(d.fabric).catch(() => undefined).then(() => {
          if (!alive || my !== token) return;
          const next = buildGarment(d);
          if (garment) { scene.remove(garment); dispose(garment); }
          garment = next;
          scene.add(next);
          render();
        });
      },
    };
    api.current.setDesign(design);

    return () => {
      alive = false;
      api.current = null;
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.dispose();
      dispose(scene);
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
    // the scene is built once; design changes go through api.current
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { api.current?.setDesign(design); }, [design]);

  return (
    <div className="studio-backdrop absolute inset-0">
      <div ref={host} className="absolute inset-0" dir="ltr" />
      {hint && <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs text-muted">{he.studio.rotateHint}</p>}
    </div>
  );
}
