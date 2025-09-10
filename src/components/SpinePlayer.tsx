'use client';

import { useEffect, useRef } from 'react';

interface SpinePlayerProps {
  skeletonPath: string;
  atlasPath: string;
  animation?: string;
  skin?: string;
  loop?: boolean;
  premultipliedAlpha?: boolean;
  width?: number;
  height?: number;
  backgroundColor?: string;
  className?: string;
  onAnimationComplete?: () => void;
}

/**
 * SpinePlayerコンポーネント
 * Spine Playerライブラリを使用してSpineアニメーションを表示します。
 */
export default function SpinePlayer({
  skeletonPath,
  atlasPath,
  animation,
  skin = 'default',
  loop = true,
  premultipliedAlpha = true,
  width = 800,
  height = 600,
  backgroundColor = '#00000000',
  className = '',
  onAnimationComplete,
}: SpinePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const uniqueIdRef = useRef<string>(`spine-player-${Math.random().toString(36).substring(2, 9)}`);

  useEffect(() => {
    // コンテナ要素が存在することを確認
    if (!containerRef.current) return;

    // 一意のIDを設定
    containerRef.current.id = uniqueIdRef.current;

    // 遅延読み込みを設定（WebGLコンテキストの競合を避けるため）
    const timeoutId = setTimeout(() => {
      // スケルトンパスとアトラスパスが有効かどうかを確認
      if (!skeletonPath || !atlasPath) {
        console.error('Invalid skeleton or atlas path:', skeletonPath, atlasPath);
        return;
      }

      // Spine Playerライブラリを動的にインポート
      console.log('Loading Spine Player with paths:', skeletonPath, atlasPath);
      import('@esotericsoftware/spine-player').then((SpinePlayerModule) => {
        // 既存のプレイヤーがあれば破棄
        if (playerRef.current) {
          try {
            playerRef.current.dispose();
          } catch (e) {
            console.warn('Error disposing player:', e);
          }
          playerRef.current = null;
        }

        // コンテナ要素が存在することを再確認（非同期処理のため）
        if (!containerRef.current) {
          console.warn('Container element no longer exists');
          return;
        }

        // 新しいSpine Playerを作成
        try {
          console.log('Creating Spine Player with module:', SpinePlayerModule);
          
          // エラーハンドリングを改善
          playerRef.current = new SpinePlayerModule.SpinePlayer(containerRef.current as HTMLElement, {
            skeleton: skeletonPath,
            atlas: atlasPath,
            animation: animation,
            premultipliedAlpha: premultipliedAlpha,
            backgroundColor: backgroundColor,
            alpha: backgroundColor.endsWith('00'),
            showControls: false, // コントロールを非表示に
            preserveDrawingBuffer: true,
            showLoading: false,
            // controlBonesプロパティは文字列配列が必要
            controlBones: [],
            viewport: {
              debugRender: false,
              transitionTime: 0.2
            },
            success: (player: any) => {
              // プレイヤーの初期化が成功した場合の処理
              try {
                // アニメーションの存在確認
                const animationExists = player.skeleton.data.animations.some(
                  (anim: any) => anim.name === animation
                );
                
                if (!animationExists && player.skeleton.data.animations.length > 0) {
                  // 指定されたアニメーションが存在しない場合は最初のアニメーションを使用
                  console.warn(`Animation "${animation}" does not exist, using default animation instead`);
                  const defaultAnim = player.skeleton.data.animations[0].name;
                  player.setAnimation(defaultAnim);
                }
                
                // アニメーション終了検出のためのリスナーを追加
                if (!loop && onAnimationComplete) {
                  player.animationState.addListener({
                    complete: (entry: any) => {
                      // アニメーションが完了したときに通知
                      if (entry.trackIndex === 0) {
                        onAnimationComplete();
                      }
                    }
                  });
                }
                
                // スキンの設定
                if (skin !== 'default') {
                  const skinExists = player.skeleton.data.skins.some(
                    (s: any) => s.name === skin
                  );
                  
                  if (skinExists) {
                    // スキンを設定
                    const skeleton = player.skeleton;
                    if (skeleton && typeof skeleton.setSkinByName === 'function') {
                      skeleton.setSkinByName(skin);
                      skeleton.setSlotsToSetupPose();
                    }
                  } else {
                    console.warn(`Skin "${skin}" does not exist, using default skin instead`);
                  }
                }
              } catch (e) {
                console.warn('Error setting animation or skin:', e);
              }
            },
            error: (player: any, msg: string) => {
              console.error('Error loading spine data:', msg);
            }
          });
        } catch (e) {
          // プレイヤー作成エラー処理
          console.error('Error creating Spine Player:', e);
        }
      }).catch(error => {
        console.error('Failed to load Spine Player module:', error);
      });
    }, 100); // 100ms遅延

    // クリーンアップ関数
    return () => {
      clearTimeout(timeoutId);
      
      if (playerRef.current) {
        try {
          playerRef.current.dispose();
        } catch (e) {
          console.warn('Error disposing player during cleanup:', e);
        }
        playerRef.current = null;
      }
    };
  }, [skeletonPath, atlasPath, animation, skin, premultipliedAlpha, backgroundColor]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: width,
        height: height,
        maxWidth: '100%',
      }}
    />
  );
}
