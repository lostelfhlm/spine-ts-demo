'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

interface ControlPanelProps {
  onAnimationChange?: (animation: string) => void;
  onSkinChange?: (skin: string) => void;
  onRenderModeChange?: (mode: 'player' | 'webgl') => void;
  onCreateSpine?: () => void;
  onDeleteSpine?: (id?: string) => void; // 引数なし→「直近を削除」想定
  onDeleteAll?: () => void;
  onToggleOverlap?: () => void;
  onCreateMany?: (count: number) => void;
  animations?: string[];
  skins?: string[];
  renderMode?: 'player' | 'webgl';
  className?: string;
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  onAnimationChange,
  onSkinChange,
  onRenderModeChange,
  onCreateSpine,
  onDeleteSpine,
  onDeleteAll,
  onCreateMany,
  animations = [],
  skins = [],
  renderMode = 'webgl',
  className,
}) => {
  // ---- 遅延生成→自動削除（5秒）ボタンの状態 ----
  type Phase = 'idle' | 'arming' | 'alive';
  const [phase, setPhase] = useState<Phase>('idle');
  const [timeLeftMs, setTimeLeftMs] = useState<number>(0);

  // タイマー参照
  const tickerRef = useRef<number | null>(null);      // 残り時間表示用 interval
  const armTORef = useRef<number | null>(null);       // 生成までの timeout（2秒）
  const deleteTORef = useRef<number | null>(null);    // 自動削除 timeout（5秒）
  const deadlineRef = useRef<number>(0);
  const mountedRef = useRef<boolean>(false);

  // 表示更新とアーム用タイマーのクリーンアップ（自動削除タイマーは残す）
  const clearTickerAndArm = () => {
    if (tickerRef.current != null) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
    if (armTORef.current != null) {
      clearTimeout(armTORef.current);
      armTORef.current = null;
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTickerAndArm();
      // Player 初回でアンマウントしても削除が確実に走るよう、
      // deleteTORef はここではクリアしない。
    };
  }, []);

  // 遅延生成→自動削除フロー
  const handleDelayedSpawn = () => {
    if (phase !== 'idle') return;

    // 1) 生成まで 2 秒カウントダウン
    setPhase('arming');
    const armMs = 2000;
    deadlineRef.current = Date.now() + armMs;
    setTimeLeftMs(armMs);

    clearTickerAndArm();
    tickerRef.current = window.setInterval(() => {
      const left = Math.max(0, deadlineRef.current - Date.now());
      if (mountedRef.current) setTimeLeftMs(left);
      if (left <= 0 && tickerRef.current != null) {
        clearInterval(tickerRef.current);
        tickerRef.current = null;
      }
    }, 100);

    armTORef.current = window.setTimeout(() => {
      // 2) 生成を発火
      onCreateSpine?.();

      // 3) Player モード初回対策：描画安定のため 500ms のグレース後に 5 秒カウント開始
      const grace = renderMode === 'player' ? 500 : 0;
      const aliveMs = 5000;
      deadlineRef.current = Date.now() + grace + aliveMs;

      if (mountedRef.current) {
        setPhase('alive');
        setTimeLeftMs(grace + aliveMs);
      }

      // 残り時間表示を再開
      if (tickerRef.current != null) clearInterval(tickerRef.current);
      tickerRef.current = window.setInterval(() => {
        const left = Math.max(0, deadlineRef.current - Date.now());
        if (mountedRef.current) setTimeLeftMs(left);
        if (left <= 0 && tickerRef.current != null) {
          clearInterval(tickerRef.current);
          tickerRef.current = null;
        }
      }, 100);

      // 4) 自動削除：アンマウントされても確実に実行させる
      if (deleteTORef.current != null) clearTimeout(deleteTORef.current);
      deleteTORef.current = window.setTimeout(() => {
        onDeleteSpine?.(); // 直近の 1 体を削除してもらう
        // 画面状態はマウント中のみ復帰
        if (mountedRef.current) {
          setPhase('idle');
          setTimeLeftMs(0);
        }
        deleteTORef.current = null;
      }, grace + aliveMs);
    }, armMs);
  };

  // ボタン表示（日本語）
  const delayedBtnText = useMemo(() => {
    if (phase === 'arming') return `生成まで: ${(timeLeftMs / 1000).toFixed(1)}s`;
    if (phase === 'alive') return `自動削除まで: ${(timeLeftMs / 1000).toFixed(1)}s`;
    return '2秒後に生成し、5秒後に自動削除';
  }, [phase, timeLeftMs]);

  // 見た目
  const sectionCls = 'mb-4';
  const labelCls = 'block mb-1 text-sm font-medium text-gray-700';
  const selectCls = 'w-full p-2 border border-gray-300 rounded';
  const btnCls =
    'p-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed';

  return (
    <div className={className}>
      {/* アニメーション選択 */}
      {animations.length > 0 && (
        <div className={sectionCls}>
          <label className={labelCls}>アニメーション</label>
          <select
            className={selectCls}
            onChange={(e) => onAnimationChange?.(e.target.value)}
          >
            {animations.map((anim) => (
              <option key={anim} value={anim}>
                {anim}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* スキン選択 */}
      {skins.length > 0 && (
        <div className={sectionCls}>
          <label className={labelCls}>スキン</label>
          <select
            className={selectCls}
            onChange={(e) => onSkinChange?.(e.target.value)}
          >
            {skins.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 描画モード */}
      <div className={sectionCls}>
        <label className={labelCls}>描画モード</label>
        <div className="flex gap-3">
          <label className="inline-flex items-center gap-1">
            <input
              type="radio"
              name="renderMode"
              value="webgl"
              checked={renderMode === 'webgl'}
              onChange={() => onRenderModeChange?.('webgl')}
            />
            <span>WebGL</span>
          </label>
          <label className="inline-flex items-center gap-1">
            <input
              type="radio"
              name="renderMode"
              value="player"
              checked={renderMode === 'player'}
              onChange={() => onRenderModeChange?.('player')}
            />
            <span>Player</span>
          </label>
        </div>
      </div>

      {/* 操作ボタン群 */}
      <div className="flex flex-wrap gap-2 items-center">
        {onCreateSpine && (
          <button className={btnCls} onClick={() => onCreateSpine()}>
            生成
          </button>
        )}

        {/* 遅延生成→自動削除 */}
        <button
          className={btnCls}
          onClick={handleDelayedSpawn}
          disabled={phase !== 'idle'}
          title="クリック後2秒で生成し、その5秒後に自動的に削除します"
        >
          {delayedBtnText}
        </button>

        {onDeleteSpine && (
          <button
            className="p-2 bg-red-600 text-white rounded hover:bg-red-700"
            onClick={() => onDeleteSpine()}
          >
            直近を削除
          </button>
        )}

        {onCreateMany && (
          <button
            className="p-2 bg-emerald-600 text-white rounded hover:bg-emerald-700"
            onClick={() => onCreateMany(10)}
            title="一度に10体生成します"
          >
            10体生成
          </button>
        )}

        {onDeleteAll && (
          <button
            className="p-2 bg-orange-500 text-white rounded hover:bg-orange-600"
            onClick={() => onDeleteAll()}
          >
            全削除
          </button>
        )}
      </div>
    </div>
  );
};

export default ControlPanel;
