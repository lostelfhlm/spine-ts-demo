'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as spine from '@esotericsoftware/spine-webgl';

export interface SpineCanvasProps {
  // --- 表示サイズ（CSS ピクセル） ---
  width?: number;
  height?: number;
  className?: string;

  // --- アセットパス ---
  skeletonPath?: string; // .json または .skel
  atlasPath?: string;    // .atlas

  // --- 再生設定 ---
  animation?: string;
  skin?: string;
  loop?: boolean;

  // --- 描画設定 ---
  premultipliedAlpha?: boolean;
  backgroundColor?: string; // 例: '#ffffff'

  // --- エラー通知（親がフォールバック等に使う） ---
  //     ・アセット失敗 / コンテキスト異常 / 可視領域が取れない 等で呼ぶ
  onError?: (reason: string | Error) => void;
  
  // --- アニメーション完了通知 ---
  onAnimationComplete?: () => void;
}

/** Spine 4.2: Physics.update が存在する環境のみ引数として渡す（undefined ならランタイム既定） */
const PHYSICS_UPDATE: any = (spine as any)?.Physics?.update ?? undefined;

/* ---------------- ユーティリティ ---------------- */

/** パスをディレクトリとファイル名に分割 */
function splitDirAndFile(path: string) {
  const i = path.lastIndexOf('/');
  if (i === -1) return { dir: '', file: path };
  return { dir: path.slice(0, i + 1), file: path.slice(i + 1) };
}

/** AssetManager の完了待ち（エラーを拾って reject） */
function waitAssets(am: spine.AssetManager, timeoutMs = 20000) {
  const start = performance.now();
  return new Promise<void>((resolve, reject) => {
    const step = () => {
      if (am.isLoadingComplete()) {
        const any = am as any;
        if (any?.errors?.length) {
          reject(
            new Error(
              'Spine assets failed: ' +
                any.errors.map((e: any) => e?.message || String(e)).join(', ')
            )
          );
          return;
        }
        resolve(); return;
      }
      if (performance.now() - start > timeoutMs) {
        reject(new Error('Spine assets loading timeout.'));
        return;
      }
      requestAnimationFrame(step);
    };
    step();
  });
}

/** CSS 色を RGBA(0..1) に変換 */
function cssColorToRGBA(css = '#00000000'): [number, number, number, number] {
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  g.fillStyle = css;
  g.fillRect(0, 0, 1, 1);
  const d = g.getImageData(0, 0, 1, 1).data;
  return [d[0] / 255, d[1] / 255, d[2] / 255, d[3] / 255];
}

/** 現在ポーズの AABB を取得（ゼロ幅/ゼロ高は微小値で保護） */
function getBounds(s: spine.Skeleton) {
  const b = new spine.SkeletonBounds();
  b.update(s, true);
  const w = Math.max(1e-6, b.maxX - b.minX);
  const h = Math.max(1e-6, b.maxY - b.minY);
  const cx = b.minX + w / 2;
  const cy = b.minY + h / 2;
  return { w, h, cx, cy };
}

/** カメラを CSS 幅高さ基準で等比フィット */
function fitCamera(renderer: spine.SceneRenderer, skeleton: spine.Skeleton, cssW: number, cssH: number, padding = 1.1) {
  const b = getBounds(skeleton);
  const zoomX = (b.w * padding) / cssW;
  const zoomY = (b.h * padding) / cssH;
  const zoom = Math.max(zoomX, zoomY);

  const cam = renderer.camera;
  cam.zoom = zoom;
  cam.position.set(b.cx, b.cy, 0);
  cam.viewportWidth = cssW;
  cam.viewportHeight = cssH;
  cam.update();
  renderer.resize(spine.ResizeMode.Stretch);
}

/* ---------------- 本体 ---------------- */

const SpineCanvas: React.FC<SpineCanvasProps> = ({
  width = 400,
  height = 400,
  className,
  skeletonPath,
  atlasPath,
  animation,
  skin,
  loop = true,
  premultipliedAlpha = true,
  backgroundColor = '#ffffff',
  onError,
  onAnimationComplete,
}) => {
  // --- Canvas/Renderer/State の参照 ---
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<spine.ManagedWebGLRenderingContext | null>(null);
  const rendererRef = useRef<spine.SceneRenderer | null>(null);
  const skeletonRef = useRef<spine.Skeleton | null>(null);
  const stateRef = useRef<spine.AnimationState | null>(null);
  const rafRef = useRef<number | null>(null);

  // --- レイアウト再調整フラグ（数フレームだけ再フィット） ---
  const relayoutFramesRef = useRef(0);

  // --- DPR とロード可否 ---
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const canLoad = useMemo(() => !!skeletonPath && !!atlasPath, [skeletonPath, atlasPath]);

  // --- WebGL コンテキスト復旧用キー ---
  const [glKey, setGlKey] = useState(0);

  /* ========== 1) WebGL 初期化 / 破棄 ========== */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // CSS サイズと物理解像度の設定
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));

    // WebGL 管理コンテキスト
    const ctx = new spine.ManagedWebGLRenderingContext(canvas, {
      alpha: true,
      premultipliedAlpha,
      antialias: true,
      preserveDrawingBuffer: false,
      stencil: false,
      depth: false,
    });
    const gl = ctx.gl as WebGLRenderingContext;

    // SceneRenderer とカメラ初期化
    const renderer = new spine.SceneRenderer(canvas, ctx);
    renderer.camera.position.set(0, 0, 0);
    renderer.camera.viewportWidth = width;  // CSS 基準
    renderer.camera.viewportHeight = height;
    renderer.camera.update();
    renderer.resize(spine.ResizeMode.Stretch);
    gl.viewport(0, 0, canvas.width, canvas.height);

    // クリア色
    const clear = cssColorToRGBA(backgroundColor);

    // コンテキストロスト/復旧
    const onLost = (e: Event) => {
      e.preventDefault();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    const onRestored = () => setGlKey((k) => k + 1);

    canvas.addEventListener('webglcontextlost', onLost as EventListener, false);
    canvas.addEventListener('webglcontextrestored', onRestored as EventListener, false);

    ctxRef.current = ctx;
    rendererRef.current = renderer;

    // 描画ループ（ウォッチドッグ付き）
    let last = performance.now();
    let watchdogStart = 0;               // 可視 AABB が取れない期間の計測
    const watchdogLimitMs = 600;         // 0.6秒連続で「見えない」なら onError

    const loopFrame = (now: number) => {
      const r = rendererRef.current;
      const s = skeletonRef.current;
      const st = stateRef.current;
      const c = canvasRef.current;
      const context = ctxRef.current;

      if (!r || !s || !st || !c || !context) {
        rafRef.current = requestAnimationFrame(loopFrame);
        return;
      }

      const gl2 = context.gl as WebGLRenderingContext;
      const dt = (now - last) / 1000;
      last = now;

      gl2.clearColor(clear[0], clear[1], clear[2], clear[3]);
      gl2.clear(gl2.COLOR_BUFFER_BIT);

      // 更新・適用・ワールド変換
      s.update(dt);
      st.update(dt);
      st.apply(s);
      (s as any).updateWorldTransform(PHYSICS_UPDATE);

      // 初期数フレームはカメラ再フィット
      if (relayoutFramesRef.current > 0) {
        fitCamera(r, s, width, height);
        relayoutFramesRef.current--;
      }

      // AABB ウォッチ：極端に小さい/無限値などは「見えていない」と判断
      const b = getBounds(s);
      const invisible = !isFinite(b.w) || !isFinite(b.h) || b.w < 1e-4 || b.h < 1e-4;
      if (invisible) {
        if (watchdogStart === 0) watchdogStart = now;
        else if (now - watchdogStart > watchdogLimitMs) {
          // 一定時間まったく可視にならない → 親に通知（フォールバック用途）
          onError?.('no-visual');
          watchdogStart = 0; // 多重通知を避ける
        }
      } else {
        watchdogStart = 0;
      }

      r.begin();
      r.drawSkeleton(s, premultipliedAlpha);
      r.end();

      rafRef.current = requestAnimationFrame(loopFrame);
    };

    rafRef.current = requestAnimationFrame(loopFrame);

    // クリーンアップ
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      rendererRef.current = null;
      skeletonRef.current = null;
      stateRef.current = null;
      try { (ctx as any)?.dispose?.(); } catch {}
      ctxRef.current = null;

      canvas.removeEventListener('webglcontextlost', onLost as EventListener);
      canvas.removeEventListener('webglcontextrestored', onRestored as EventListener);
    };
  }, [width, height, dpr, premultipliedAlpha, backgroundColor, glKey, onError]);

  /* ========== 2) リサイズ時の再適合 ========== */
  useEffect(() => {
    const canvas = canvasRef.current;
    const r = rendererRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !r || !ctx) return;

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));

    (ctx.gl as WebGLRenderingContext).viewport(0, 0, canvas.width, canvas.height);

    r.camera.viewportWidth = width;
    r.camera.viewportHeight = height;
    r.camera.update();
    r.resize(spine.ResizeMode.Stretch);

    if (skeletonRef.current) {
      fitCamera(r, skeletonRef.current, width, height);
      relayoutFramesRef.current = 3;
    }
  }, [width, height, dpr, glKey]);

  /* ========== 3) アセット読み込み（atlas ディレクトリを pathPrefix に設定） ========== */
  useEffect(() => {
    if (!canLoad) return;
    const ctx = ctxRef.current;
    const renderer = rendererRef.current;
    if (!ctx || !renderer) return;

    let cancelled = false;

    (async () => {
      try {
        // ★ atlas のあるディレクトリを前提に AssetManager を初期化
        const { dir: atlasDir, file: atlasFile } = splitDirAndFile(atlasPath!);
        const am = new spine.AssetManager(ctx, atlasDir);

        // skeleton は atlas と同じディレクトリならファイル名、異なるならフルパスでロード
        const sLower = skeletonPath!.toLowerCase();
        const { dir: skDir, file: skFile } = splitDirAndFile(skeletonPath!);
        if (sLower.endsWith('.json')) {
          if (skDir === atlasDir) am.loadText(skFile); else am.loadText(skeletonPath!);
        } else {
          if (skDir === atlasDir) am.loadBinary(skFile); else am.loadBinary(skeletonPath!);
        }

        // atlas はファイル名でロード（内部 PNG は atlasDir を前置して解決される）
        am.loadTextureAtlas(atlasFile);

        await waitAssets(am, 20000);
        if (cancelled) return;

        // データ構築
        const atlas = am.get(atlasFile) as spine.TextureAtlas;
        const loader = new spine.AtlasAttachmentLoader(atlas);

        let data: spine.SkeletonData;
        if (sLower.endsWith('.json')) {
          const json = new spine.SkeletonJson(loader);
          const raw = am.get(skDir === atlasDir ? skFile : skeletonPath!) as string;
          data = json.readSkeletonData(raw);
        } else {
          const bin = new spine.SkeletonBinary(loader);
          const raw = am.get(skDir === atlasDir ? skFile : skeletonPath!) as ArrayBuffer;
          data = bin.readSkeletonData(new Uint8Array(raw));
        }

        const skeleton = new spine.Skeleton(data);
        skeleton.setToSetupPose();

        // skin 設定（存在確認つき）
        const skinName = skin ?? data.defaultSkin?.name;
        if (skinName && data.findSkin(skinName)) skeleton.setSkinByName(skinName);
        else if (data.defaultSkin) skeleton.setSkin(data.defaultSkin);

        // state
        const stateData = new spine.AnimationStateData(data);
        const state = new spine.AnimationState(stateData);

        // animation（存在確認つき）
        const animName = animation ?? data.animations[0]?.name;
        if (animName && data.findAnimation(animName)) {
          state.setAnimation(0, animName, loop ?? true);
          
          // アニメーション完了イベントリスナーを追加
          if (!loop && onAnimationComplete) {
            state.addListener({
              complete: (entry) => {
                // アニメーションが完了したときに通知
                if (entry.trackIndex === 0 && entry.animation && entry.animation.name === animName) {
                  onAnimationComplete();
                }
              }
            });
          }
        }

        // 初回は 0 秒更新→適用→ワールド変換→カメラフィット
        state.update(0);
        state.apply(skeleton);
        (skeleton as any).updateWorldTransform(PHYSICS_UPDATE);

        fitCamera(renderer, skeleton, width, height);
        relayoutFramesRef.current = 3;

        if (!cancelled) {
          skeletonRef.current = skeleton;
          stateRef.current = state;
        }
      } catch (e) {
        // ロード/パース失敗 → 親へ通知（フォールバック用途）
        if (!cancelled) onError?.(e as Error);
      }
    })();

    return () => { cancelled = true; };
  }, [canLoad, skeletonPath, atlasPath, animation, skin, loop, width, height, onError]);

  /* ========== 4) skin 切替 ========== */
  useEffect(() => {
    const s = skeletonRef.current;
    const r = rendererRef.current;
    if (!s || !r || !skin) return;
    if (s.data.findSkin(skin)) {
      s.setSkinByName(skin);
      s.setSlotsToSetupPose();
      (s as any).updateWorldTransform(PHYSICS_UPDATE);
      fitCamera(r, s, width, height);
      relayoutFramesRef.current = 3;
    }
  }, [skin, width, height]);

  /* ========== 5) アニメ切替 ========== */
  useEffect(() => {
    const s = skeletonRef.current;
    const st = stateRef.current;
    const r = rendererRef.current;
    if (!s || !st || !animation || !r) return;

    if (s.data.findAnimation(animation)) {
      st.setAnimation(0, animation, loop ?? true);
      st.update(0);
      st.apply(s);
      (s as any).updateWorldTransform(PHYSICS_UPDATE);
      fitCamera(r, s, width, height);
      relayoutFramesRef.current = 3;
    }
  }, [animation, loop, width, height]);

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
