'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface SpineObject {
  id: string;
  x: number;
  y: number;
  scale: number;
  animation: string;
  skin: string;
  skeleton?: string;
  atlas?: string;
  renderMode?: 'player' | 'webgl';
  loop?: boolean;
  showAnimationEndMessage?: boolean;
}

interface SpineObjectOptions {
  loop?: boolean;
  showAnimationEndMessage?: boolean;
}

interface UseSpineOptions {
  skeletonPath: string;
  atlasPath: string;
  initialAnimation?: string;
  initialSkin?: string;
}

/**
 * useSpine フック
 * Spineアニメーションの管理を行うカスタムフック
 */
export default function useSpine({
  skeletonPath,
  atlasPath,
  initialAnimation = 'idle',
  initialSkin = 'default',
}: UseSpineOptions) {
  // 状態管理
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [animations, setAnimations] = useState<string[]>([]);
  const [skins, setSkins] = useState<string[]>([]);
  const [spineObjects, setSpineObjects] = useState<SpineObject[]>([]);
  const [currentAnimation, setCurrentAnimation] = useState(initialAnimation);
  const [currentSkin, setCurrentSkin] = useState(initialSkin);
  const [isOverlapping, setIsOverlapping] = useState(false);
  const [renderMode, setRenderMode] = useState<'player' | 'webgl'>('player');

  // AssetManagerの参照を保持
  const assetManagerRef = useRef<any>(null);
  const animationDataRef = useRef<any>(null);

  // Spineアセットの読み込み
  useEffect(() => {
    let isMounted = true;
    let intervalId: NodeJS.Timeout;

    // モデルが変更されたら、ローディング状態をリセット
    setIsLoading(true);
    setLoadingProgress(0);
    
    // 新しいモデルが読み込まれるときに、現在のアニメーションをリセット
    setCurrentAnimation(initialAnimation);

    const loadAssets = async () => {
      try {
        // Spine WebGLモジュールを動的にインポート
        const SpineModule = await import('@esotericsoftware/spine-webgl');
        
        // AssetManagerの作成
        // 一時的なキャンバス要素を作成してWebGLコンテキストを取得
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 1;
        tempCanvas.height = 1;
        tempCanvas.getContext('webgl2') || tempCanvas.getContext('webgl');
        const context = new SpineModule.ManagedWebGLRenderingContext(tempCanvas);
        
        // 絶対URLを使用して、正しいパスでアセットを読み込む
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
        const assetManager = new SpineModule.AssetManager(context, baseUrl);
        assetManagerRef.current = assetManager;
        
        // アセットの読み込み
        console.log('Loading assets:', skeletonPath, atlasPath);
        assetManager.loadText(skeletonPath);
        assetManager.loadTextureAtlas(atlasPath);
        
        // 読み込み状態の監視
        intervalId = setInterval(() => {
          if (!isMounted) return;
          
          if (assetManager.isLoadingComplete()) {
            clearInterval(intervalId);
            
            try {
              // アニメーションデータの解析
              console.log('Loading complete, parsing data');
              const atlas = assetManager.require(atlasPath);
              console.log('Atlas loaded:', atlas);
              const atlasLoader = new SpineModule.AtlasAttachmentLoader(atlas);
              const skeletonJson = new SpineModule.SkeletonJson(atlasLoader);
              const skeletonData = skeletonJson.readSkeletonData(assetManager.require(skeletonPath));
              console.log('Skeleton data parsed:', skeletonData);
              
              // アニメーションとスキンのリストを取得
              const animList = skeletonData.animations.map((anim: any) => anim.name);
              const skinList = skeletonData.skins.map((skin: any) => skin.name);
              
              if (isMounted) {
                animationDataRef.current = skeletonData;
                setAnimations(animList);
                setSkins(skinList);
                
                // 新しいモデルのアニメーションリストに基づいて、適切なアニメーションを設定
                // 指定されたinitialAnimationがアニメーションリストに存在するか確認
                if (initialAnimation && animList.includes(initialAnimation)) {
                  setCurrentAnimation(initialAnimation);
                } else if (animList.length > 0) {
                  // 存在しない場合は最初のアニメーションを使用
                  setCurrentAnimation(animList[0]);
                  console.log(`Animation "${initialAnimation}" not found, using first animation: ${animList[0]}`);
                }
                
                setIsLoading(false);
                setLoadingProgress(100);
              }
            } catch (error) {
              console.error('Spineデータの解析エラー:', error);
              console.error('Error details:', JSON.stringify(error));
              if (isMounted) {
                setIsLoading(false);
                setLoadingProgress(0);
              }
            }
          } else {
            // 読み込み進捗の更新
            const progress = assetManager.getLoaded() / Math.max(1, assetManager.getToLoad()) * 100;
            if (isMounted) {
              setLoadingProgress(progress);
            }
          }
        }, 100);
      } catch (error) {
        console.error('Spineモジュールの読み込みエラー:', error);
        if (isMounted) {
          setIsLoading(false);
          setLoadingProgress(0);
        }
      }
    };

    loadAssets();

    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [skeletonPath, atlasPath]);

  // Spineオブジェクトの生成
  const createSpineObject = useCallback((count = 1, options?: SpineObjectOptions) => {
    // アセットが読み込まれていない場合は処理しない
    if (isLoading || animations.length === 0) {
      console.warn('Cannot create Spine objects while assets are loading');
      return;
    }
    
    // 大量生成時は制限を設ける
    const safeCount = Math.min(count, 10); // 最大10個まで
    
    if (count === 1) {
      // 単一オブジェクトの場合は即時生成
      const id = `spine-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const x = Math.random() * 80 - 40; // -40 to 40
      const y = Math.random() * 80 - 40; // -40 to 40
      const scale = 0.5 + Math.random() * 0.5; // 0.5 to 1.0
      
      // 有効なアニメーションを確保
      const validAnimation = animations.includes(currentAnimation) ? currentAnimation : animations[0];
      // 有効なスキンを確保
      const validSkin = skins.includes(currentSkin) ? currentSkin : 'default';
      
      const newObject = {
        id,
        x,
        y,
        scale,
        animation: validAnimation,
        skin: validSkin,
        skeleton: skeletonPath,
        atlas: atlasPath,
        renderMode,
        loop: options?.loop,
        showAnimationEndMessage: options?.showAnimationEndMessage,
      };
      
      setSpineObjects((prev) => isOverlapping ? [...prev, newObject] : [newObject]);
    } else {
      // 複数オブジェクトの場合は段階的に生成
      const batchSize = 3; // 一度に生成する数
      const batches = Math.ceil(safeCount / batchSize);
      
      // 段階的に生成する関数
      const createBatch = (batchIndex: number) => {
        if (batchIndex >= batches) return;
        
        const newObjects: SpineObject[] = [];
        const start = batchIndex * batchSize;
        const end = Math.min(start + batchSize, safeCount);
        
        for (let i = start; i < end; i++) {
          const id = `spine-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${i}`;
          const x = Math.random() * 80 - 40; // -40 to 40
          const y = Math.random() * 80 - 40; // -40 to 40
          const scale = 0.5 + Math.random() * 0.5; // 0.5 to 1.0
          
          // 有効なアニメーションを確保
          const validAnimation = animations.includes(currentAnimation) ? currentAnimation : animations[0];
          // 有効なスキンを確保
          const validSkin = skins.includes(currentSkin) ? currentSkin : 'default';
          
          newObjects.push({
            id,
            x,
            y,
            scale,
            animation: validAnimation,
            skin: validSkin,
            skeleton: skeletonPath,
            atlas: atlasPath,
            renderMode,
            loop: options?.loop,
            showAnimationEndMessage: options?.showAnimationEndMessage,
          });
        }
        
        setSpineObjects((prev) => {
          const result = isOverlapping ? [...prev, ...newObjects] : (batchIndex === 0 ? newObjects : [...prev, ...newObjects]);
          
          // 次のバッチを生成
          setTimeout(() => createBatch(batchIndex + 1), 300);
          
          return result;
        });
      };
      
      // 最初のバッチを生成
      createBatch(0);
    }
  }, [currentAnimation, currentSkin, isOverlapping, skeletonPath, atlasPath, isLoading, animations, skins]);

  // Spineオブジェクトの削除
  const deleteSpineObject = useCallback((id?: string) => {
    if (id) {
      setSpineObjects((prev) => prev.filter((obj) => obj.id !== id));
    } else if (spineObjects.length > 0) {
      setSpineObjects((prev) => prev.slice(0, -1));
    }
  }, [spineObjects]);

  // 全Spineオブジェクトの削除
  const deleteAllSpineObjects = useCallback(() => {
    setSpineObjects([]);
  }, []);

  // 重複表示の切り替え
  const toggleOverlap = useCallback(() => {
    setIsOverlapping((prev) => !prev);
  }, []);

  // アニメーションの変更
  const changeAnimation = useCallback((animation: string) => {
    setCurrentAnimation(animation);
    setSpineObjects((prev) =>
      prev.map((obj) => ({
        ...obj,
        animation,
      }))
    );
  }, []);

  // スキンの変更
  const changeSkin = useCallback((skin: string) => {
    setCurrentSkin(skin);
    setSpineObjects((prev) =>
      prev.map((obj) => ({
        ...obj,
        skin,
      }))
    );
  }, []);

  // レンダリングモードの変更
  const changeRenderMode = useCallback((mode: 'player' | 'webgl') => {
    setRenderMode(mode);
    setSpineObjects((prev) =>
      prev.map((obj) => ({
        ...obj,
        renderMode: mode,
      }))
    );
  }, []);

  // 定時アニメーション用のタイマー
  useEffect(() => {
    if (spineObjects.length === 0) return;
    
    const timerId = setInterval(() => {
      // ランダムなオブジェクトを選択してアニメーションを変更
      if (animations.length > 1) {
        const randomIndex = Math.floor(Math.random() * spineObjects.length);
        const randomAnimation = animations[Math.floor(Math.random() * animations.length)];
        
        setSpineObjects((prev) =>
          prev.map((obj, index) =>
            index === randomIndex ? { ...obj, animation: randomAnimation } : obj
          )
        );
      }
    }, 5000); // 5秒ごとに実行
    
    return () => clearInterval(timerId);
  }, [spineObjects, animations]);

  return {
    isLoading,
    loadingProgress,
    animations,
    skins,
    spineObjects,
    currentAnimation,
    currentSkin,
    isOverlapping,
    renderMode,
    createSpineObject,
    deleteSpineObject,
    deleteAllSpineObjects,
    toggleOverlap,
    changeAnimation,
    changeSkin,
    changeRenderMode,
  };
}
