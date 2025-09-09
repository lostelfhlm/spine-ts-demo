'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import SpinePlayer from './SpinePlayer';
import SpineCanvas, { SpineCanvasProps } from './SpineCanvas';

/* -------------------------------------------
 * 描画モードの定義
 * ----------------------------------------- */
type RenderMode = 'player' | 'webgl';

/* -------------------------------------------
 * 共通プロップ：SpineCanvas のプロップを継承
 * 追加:
 *  - renderMode: 描画モード（既定: webgl）
 *  - enableAutoFallback: WebGL が見えない場合は Player に自動切替（既定: true）
 *  - showAnimationEndMessage: アニメーション終了時にメッセージを表示（既定: false）
 *  - onAnimationComplete: アニメーション完了時のコールバック
 * ----------------------------------------- */
interface SpineRendererProps extends SpineCanvasProps {
  renderMode?: RenderMode;
  enableAutoFallback?: boolean;
  showAnimationEndMessage?: boolean;
  onAnimationComplete?: () => void;
}

/* -------------------------------------------
 * SpineRenderer 本体
 *  - renderMode='webgl' のときは WebGL を優先
 *  - WebGL 側が描画不能と判断した場合（onError）に Player へフォールバック
 *  - key にモード/パス/フォールバック状態を含め、確実に再マウント
 * ----------------------------------------- */
const SpineRenderer: React.FC<SpineRendererProps> = (props) => {
  const {
    renderMode = 'webgl',
    enableAutoFallback = true,
    showAnimationEndMessage = false,
    onAnimationComplete,

    // Canvas / Player 共通プロップ
    skeletonPath,
    atlasPath,
    animation,
    skin,
    loop = true,
    width = 400,
    height = 400,
    className,
    premultipliedAlpha,
    backgroundColor = '#ffffff',
  } = props;

  // WebGL → Player 自動フォールバックの内部フラグ
  const [forcePlayer, setForcePlayer] = useState(false);
  
  // アニメーション終了メッセージの表示状態
  const [showEndMessage, setShowEndMessage] = useState(false);

  // 再マウントを保証する key（モード/パス/フォールバック状態を含める）
  const key = useMemo(
    () => `${forcePlayer ? 'player' : renderMode}:${skeletonPath ?? ''}:${atlasPath ?? ''}`,
    [forcePlayer, renderMode, skeletonPath, atlasPath]
  );

  // 実効モード（フォールバック適用後）
  const effectiveMode: RenderMode =
    renderMode === 'webgl' && enableAutoFallback && forcePlayer ? 'player' : renderMode;

  // WebGL キャンバス側からのエラー通知（可視化不能/ロード失敗など）
  const handleWebglError = (_reason: string | Error) => {
    // エラー情報をログに出力
    console.error('WebGL rendering error:', _reason);
    
    // 一度でも「見えない」と判断されたら Player に切り替える
    if (enableAutoFallback && !forcePlayer) {
      console.log('Falling back to Player mode due to WebGL error');
      setForcePlayer(true);
    }
  };

  // レンダリングモードインジケーターのスタイル
  const modeIndicatorStyle: React.CSSProperties = {
    position: 'absolute',
    top: '5px',
    right: '5px',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    color: 'white',
    padding: '2px 6px',
    borderRadius: '3px',
    fontSize: '12px',
    fontWeight: 'bold',
    zIndex: 10,
    pointerEvents: 'none',
  };
  
  // アニメーション終了メッセージのスタイル
  const endMessageStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '10px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    color: 'white',
    padding: '5px 10px',
    borderRadius: '5px',
    fontSize: '14px',
    fontWeight: 'bold',
    zIndex: 20,
    pointerEvents: 'none',
    opacity: showEndMessage ? 1 : 0,
    transition: 'opacity 0.3s ease',
  };
  
  // アニメーション完了時の処理
  const handleAnimationComplete = () => {
    if (showAnimationEndMessage) {
      setShowEndMessage(true);
      
      // 5秒後にメッセージを非表示にする
      setTimeout(() => {
        setShowEndMessage(false);
      }, 5000);
    }
    
    // 親コンポーネントに通知
    if (onAnimationComplete) {
      onAnimationComplete();
    }
  };

  // Player モード（通常 or フォールバック後）
  if (effectiveMode === 'player') {
    return (
      <div style={{ position: 'relative', width, height }}>
        <div style={modeIndicatorStyle}>Player</div>
        <SpinePlayer
          key={key}
          skeletonPath={skeletonPath!}
          atlasPath={atlasPath!}
          animation={animation}
          skin={skin}
          loop={loop}
          width={width}
          height={height}
          backgroundColor={backgroundColor}
          className={className}
          onAnimationComplete={handleAnimationComplete}
        />
        {showEndMessage && (
      <div style={endMessageStyle}>
        アニメーション終了しました！
      </div>
        )}
      </div>
    );
  }

  // WebGL モード（描画不能時は onError で Player へ自動フォールバック）
  return (
    <div style={{ position: 'relative', width, height }}>
      <div style={modeIndicatorStyle}>WebGL</div>
      <SpineCanvas
        key={key}
        skeletonPath={skeletonPath}
        atlasPath={atlasPath}
        animation={animation}
        skin={skin}
        loop={loop}
        width={width}
        height={height}
        className={className}
        premultipliedAlpha={premultipliedAlpha}
        backgroundColor={backgroundColor}
        onError={handleWebglError}
        onAnimationComplete={handleAnimationComplete}
      />
      {showEndMessage && (
        <div style={endMessageStyle}>
          アニメーション終了しました！
        </div>
      )}
    </div>
  );
};

export default SpineRenderer;
