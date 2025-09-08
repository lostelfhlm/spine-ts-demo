'use client';

/**
 * SpineCanvas（Spine 4.2 対応・単一WebGLキャンバスで複数Skeletonを描画）
 * - 方式1: items[] を渡すと単一Canvasに全て描画（コンテキスト数=1）
 * - 単体props（skeletonPath/atlasPath...）でも従来どおり動作（下位互換）
 * - 4.2物理API：updateWorldTransform(physics) は常に指定（フォールバック付き）
 * - 非同期ロード＋キャンセル／DPR／リサイズ／GLコンテキストロスト復帰
 * - AABB（Region/Meshの世界頂点）でセル中心フィット（BoundingBox不要）
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as spine from '@esotericsoftware/spine-webgl';

/** 単体用プロップス */
type SingleItemProps = {
  skeletonPath?: string;  // .json or .skel
  atlasPath?: string;     // .atlas
  animation?: string;
  skin?: string;
  loop?: boolean;
};

/** 複数描画用の1要素 */
type MultiItem = {
  id?: string;
  skeletonPath: string;
  atlasPath: string;
  animation?: string;
  skin?: string;
  loop?: boolean;
};

type MultiItemsProps = {
  /** 指定すると単一Canvasに items を全て描画（単体propsより優先） */
  items?: MultiItem[];
};

type CommonProps = {
  width?: number;
  height?: number;
  className?: string;
  premultipliedAlpha?: boolean;
  backgroundColor?: string;
};

export type SpineCanvasProps = CommonProps & SingleItemProps & MultiItemsProps;

/** 4.2 物理列挙のフォールバック（バンドル差で Physics が undefined でも数値で代替） */
const PHYSICS_UPDATE: spine.Physics =
  ((spine as any)?.Physics?.update ?? 2) as spine.Physics; // 0:none, 1:pose, 2:update

/** 内部ランタイム */
type Runtime = {
  skeleton: spine.Skeleton;
  state: spine.AnimationState;
};

const PADDING_RATIO = 0.9;

/** path を dir と file に分解 */
function splitDirAndFile(path: string) {
  const idx = path.lastIndexOf('/');
  if (idx === -1) return { dir: '', file: path };
  return { dir: path.substring(0, idx + 1), file: path.substring(idx + 1) };
}

/** 非ブロッキングで AssetManager の完了を待つ */
function waitForAssetsComplete(am: spine.AssetManager, timeoutMs: number): Promise<void> {
  const start = performance.now();
  return new Promise((resolve, reject) => {
    function tick() {
      if (am.isLoadingComplete()) {
        const anyAm = am as any;
        if (anyAm && Array.isArray(anyAm.errors) && anyAm.errors.length > 0) {
          reject(new Error('Spine assets failed: ' + anyAm.errors.map((e: any) => e?.message || String(e)).join(', ')));
          return;
        }
        resolve(); return;
      }
      if (performance.now() - start > timeoutMs) {
        reject(new Error('Spine assets loading timeout.')); return;
      }
      requestAnimationFrame(tick);
    }
    tick();
  });
}

/** 現在ポーズのAABB（BoundingBox無しでもRegion/Meshから推定） */
function computeAABB(skeleton: spine.Skeleton) {
  let minX = Number.POSITIVE_INFINITY, minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
  const temp = new Float32Array(8 * 3);

  for (let i = 0; i < skeleton.slots.length; i++) {
    const slot = skeleton.slots[i];
    const att = slot.getAttachment();
    if (!att) continue;

    if (att instanceof spine.RegionAttachment) {
      // 4.2: RegionAttachment.computeWorldVertices は Slot を受け取る
      (att as any).computeWorldVertices(slot, temp, 0, 2);
      for (let v = 0; v < 8; v += 2) {
        const x = temp[v], y = temp[v + 1];
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      }
    } else if (att instanceof spine.MeshAttachment) {
      const world = new Float32Array(att.worldVerticesLength);
      att.computeWorldVertices(slot, 0, att.worldVerticesLength, world, 0, 2);
      for (let v = 0; v < world.length; v += 2) {
        const x = world[v], y = world[v + 1];
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      }
    }
  }
  if (minX === Number.POSITIVE_INFINITY) { minX = 0; minY = 0; maxX = 1; maxY = 1; }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** 単一 Skeleton のロード（json / skel 自動判定） */
async function loadOneSkeleton(
  context: spine.ManagedWebGLRenderingContext,
  item: MultiItem,
  timeoutMs = 20000
): Promise<Runtime> {
  const { dir: atlasDir, file: atlasFile } = splitDirAndFile(item.atlasPath);
  const am = new spine.AssetManager(context, atlasDir);

  const lower = item.skeletonPath.toLowerCase();
  const { dir: skelDir, file: skelFile } = splitDirAndFile(item.skeletonPath);
  if (lower.endsWith('.json')) {
    if (skelDir !== atlasDir) am.loadText(item.skeletonPath); else am.loadText(skelFile);
  } else {
    if (skelDir !== atlasDir) am.loadBinary(item.skeletonPath); else am.loadBinary(skelFile);
  }
  am.loadTextureAtlas(atlasFile);

  await waitForAssetsComplete(am, timeoutMs);

  const atlas = am.get(atlasFile) as spine.TextureAtlas;
  const loader = new spine.AtlasAttachmentLoader(atlas);

  let data: spine.SkeletonData;
  if (lower.endsWith('.json')) {
    const json = new spine.SkeletonJson(loader);
    const raw = am.get(item.skeletonPath) ?? am.get(skelFile);
    data = json.readSkeletonData(raw as string);
  } else {
    const bin = new spine.SkeletonBinary(loader);
    const raw = am.get(item.skeletonPath) ?? am.get(skelFile);
    data = bin.readSkeletonData(new Uint8Array(raw as ArrayBuffer));
  }

  const skeleton = new spine.Skeleton(data);
  skeleton.setToSetupPose();

  // skin
  const skinName = item.skin ?? (data.defaultSkin?.name ?? undefined);
  if (skinName && data.findSkin(skinName)) skeleton.setSkinByName(skinName);
  else if (data.defaultSkin) skeleton.setSkin(data.defaultSkin);

  skeleton.updateWorldTransform(PHYSICS_UPDATE);

  const stateData = new spine.AnimationStateData(data);
  const state = new spine.AnimationState(stateData);

  // animation
  const animName = item.animation ?? (data.animations[0]?.name ?? undefined);
  if (animName && data.findAnimation(animName)) {
    state.setAnimation(0, animName, item.loop ?? true);
  }

  return { skeleton, state };
}

/** グリッドにレイアウト（y軸は上向き） */
function layoutGrid(runtimes: Runtime[], W: number, H: number) {
  if (runtimes.length === 0) return;
  const cols = Math.ceil(Math.sqrt(runtimes.length));
  const rows = Math.ceil(runtimes.length / cols);
  const cellW = W / cols, cellH = H / rows;

  for (let i = 0; i < runtimes.length; i++) {
    const rt = runtimes[i];
    const cx = i % cols, cy = Math.floor(i / cols);

    const targetCx = cx * cellW + cellW / 2;
    const targetCy = cy * cellH + cellH / 2; // y上向きのまま

    // 現在ポーズのAABB
    const aabb = computeAABB(rt.skeleton);
    const bw = Math.max(aabb.width, 1), bh = Math.max(aabb.height, 1);
    const scale = Math.min(cellW / bw, cellH / bh) * PADDING_RATIO;

    rt.skeleton.scaleX = scale;
    rt.skeleton.scaleY = scale;

    const centerX = aabb.minX + bw / 2;
    const centerY = aabb.minY + bh / 2;

    rt.skeleton.x = targetCx - centerX * scale;
    rt.skeleton.y = targetCy - centerY * scale;
  }
}

const SpineCanvas: React.FC<SpineCanvasProps> = ({
  width = 400,
  height = 400,
  className,
  premultipliedAlpha = true,
  backgroundColor = '#00000000',
  // 単体
  skeletonPath, atlasPath, animation, skin, loop = true,
  // 複数
  items,
}) => {
  // items 未指定なら単体を items 化（下位互換）
  const normalized: MultiItem[] | null = useMemo(() => {
    if (items && items.length) return items;
    if (skeletonPath && atlasPath) return [{ skeletonPath, atlasPath, animation, skin, loop }];
    return null;
  }, [items, skeletonPath, atlasPath, animation, skin, loop]);

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<spine.ManagedWebGLRenderingContext | null>(null);
  const rendererRef = useRef<spine.SceneRenderer | null>(null);
  const rafRef = useRef<number | null>(null);

  const [runtimes, setRuntimes] = useState<Runtime[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const relayoutFramesRef = useRef(0);

  // 初期化 / 破棄
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));

    const context = new spine.ManagedWebGLRenderingContext(canvas, {
      alpha: true, premultipliedAlpha, antialias: true, preserveDrawingBuffer: false, stencil: false, depth: false,
    });
    const gl = context.gl;
    const renderer = new spine.SceneRenderer(canvas, context);
    renderer.camera.position.set(canvas.width / 2, canvas.height / 2, 0);
    renderer.camera.viewportWidth = canvas.width;
    renderer.camera.viewportHeight = canvas.height;
    renderer.resize(spine.ResizeMode.Stretch);
    gl.viewport(0, 0, canvas.width, canvas.height);

    const parseBG = () => {
      try {
        const c = document.createElement('canvas'); const g = c.getContext('2d');
        if (!g) return [0,0,0,0] as [number,number,number,number];
        g.fillStyle = backgroundColor ?? '#00000000'; g.fillRect(0,0,1,1);
        const d = g.getImageData(0,0,1,1).data; return [d[0]/255, d[1]/255, d[2]/255, d[3]/255] as [number,number,number,number];
      } catch { return [0,0,0,0] as [number,number,number,number]; }
    };
    const clearColor = parseBG();

    const onLost = (e: Event) => { e.preventDefault(); if (rafRef.current!=null) cancelAnimationFrame(rafRef.current); };
    const onRestored = () => { setReloadKey((k)=>k+1); };
    canvas.addEventListener('webglcontextlost', onLost as EventListener, false);
    canvas.addEventListener('webglcontextrestored', onRestored as EventListener, false);

    ctxRef.current = context;
    rendererRef.current = renderer;

    // 描画ループ
    let last = performance.now();
    const frame = (now: number) => {
      const ctx = ctxRef.current, r = rendererRef.current, cvs = canvasRef.current;
      if (!ctx || !r || !cvs) { rafRef.current = requestAnimationFrame(frame); return; }
      const gl = ctx.gl as any;
      if (gl.isContextLost && gl.isContextLost()) { rafRef.current = requestAnimationFrame(frame); return; }

      const dt = (now - last) / 1000; last = now;

      // クリア
      (ctx.gl as WebGLRenderingContext).clearColor(clearColor[0], clearColor[1], clearColor[2], clearColor[3]);
      (ctx.gl as WebGLRenderingContext).clear((ctx.gl as WebGLRenderingContext).COLOR_BUFFER_BIT);

      // 初期数フレームはフィット/レイアウトを安定化
      if (relayoutFramesRef.current > 0) {
        layoutGrid(runtimes, cvs.width, cvs.height);
        relayoutFramesRef.current -= 1;
      }

      r.begin();
      for (const rt of runtimes) {
        rt.skeleton.update(dt);
        rt.state.update(dt);
        rt.state.apply(rt.skeleton);
        rt.skeleton.updateWorldTransform(PHYSICS_UPDATE);
        r.drawSkeleton(rt.skeleton, premultipliedAlpha);
      }
      r.end();

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current!=null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      rendererRef.current = null;
      try { (context as any)?.dispose?.(); } catch {}
      ctxRef.current = null;
      canvas.removeEventListener('webglcontextlost', onLost as EventListener);
      canvas.removeEventListener('webglcontextrestored', onRestored as EventListener);
    };
  }, [width, height, dpr, premultipliedAlpha, backgroundColor, reloadKey]);

  // リサイズでカメラ/ビューポート更新
  useEffect(() => {
    const canvas = canvasRef.current; const ctx = ctxRef.current; const r = rendererRef.current;
    if (!canvas || !ctx || !r) return;
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    canvas.width = Math.max(1, Math.floor(width * dpr)); canvas.height = Math.max(1, Math.floor(height * dpr));
    r.camera.position.set(canvas.width / 2, canvas.height / 2, 0);
    r.camera.viewportWidth = canvas.width; r.camera.viewportHeight = canvas.height;
    r.resize(spine.ResizeMode.Stretch);
    ctx.gl.viewport(0, 0, canvas.width, canvas.height);
    layoutGrid(runtimes, canvas.width, canvas.height);
  }, [width, height, dpr, runtimes.length]);

  // 非同期ロード（順次）＋ キャンセル保護
  useEffect(() => {
    const ctx = ctxRef.current; const canvas = canvasRef.current;
    if (!ctx || !canvas) return;

    setRuntimes([]);
    if (!normalized || normalized.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const loaded: Runtime[] = [];
        for (const it of normalized) {
          const rt = await loadOneSkeleton(ctx, it, 20000);
          if (cancelled) return;
          loaded.push(rt);
        }
        // レイアウト
        layoutGrid(loaded, canvas.width, canvas.height);
        relayoutFramesRef.current = 10; // 最初の数フレームは姿勢変化に追従
        if (!cancelled) setRuntimes(loaded);
      } catch (e) {
        if (!cancelled) console.error(e);
      }
    })();

    return () => { cancelled = true; };
  }, [JSON.stringify(normalized)]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      width={Math.max(1, Math.floor((width ?? 1) * (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)))}
      height={Math.max(1, Math.floor((height ?? 1) * (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)))}
      style={{ display: 'block', width: width ?? 400, height: height ?? 400 }}
    />
  );
};

export default SpineCanvas;
