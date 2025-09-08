'use client';

import { useState } from 'react';
import SpineRenderer from '../components/SpineRenderer';
import LoadingIndicator from '../components/LoadingIndicator';
import ControlPanel from '../components/ControlPanel';
import { getSkeletonPath, getAtlasPath, availableModels } from '../utils/spineUtils';
import useSpine from '../hooks/useSpine';

export default function Home() {
  // 現在選択されているモデル
  const [selectedModel, setSelectedModel] = useState(availableModels[0]);

  // Spineフックの使用
  const {
    isLoading,
    loadingProgress,
    animations,
    skins,
    spineObjects,
    currentAnimation,
    currentSkin,
    renderMode,
    createSpineObject,
    deleteSpineObject,
    deleteAllSpineObjects,
    toggleOverlap,
    changeAnimation,
    changeSkin,
    changeRenderMode,
    // createMany は createSpineObject(count) をそのまま使う
    createSpineObject: createMany,
  } = useSpine({
    skeletonPath: getSkeletonPath(selectedModel.id, false), // JSONフォーマット
    atlasPath: getAtlasPath(selectedModel.atlasName || selectedModel.id),
    initialAnimation: selectedModel.defaultAnimation,
  });

  // デバッグ用：コンソールログ
  console.log('Current model:', selectedModel);
  console.log('Paths:', getSkeletonPath(selectedModel.id, false), getAtlasPath(selectedModel.atlasName || selectedModel.id));
  console.log('Loading state:', isLoading, loadingProgress);
  console.log('Animations:', animations);

  // モデル変更ハンドラー
  const handleModelChange = (modelId: string) => {
    const model = availableModels.find((m) => m.id === modelId);
    if (model) setSelectedModel(model);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-8 bg-gray-50">
      <div className="z-10 max-w-5xl w-full items-center justify-between text-sm lg:flex">
        <h1 className="text-3xl font-bold mb-8 text-center w-full">Spine TS デモ</h1>
      </div>

      {/* モデル選択 */}
      <div className="mb-8 w-full max-w-5xl">
        <h2 className="text-xl font-semibold mb-4">モデル選択</h2>
        <div className="flex flex-wrap gap-4">
          {availableModels.map((model) => (
            <button
              key={model.id}
              className={`px-4 py-2 rounded ${
                selectedModel.id === model.id ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300'
              }`}
              onClick={() => handleModelChange(model.id)}
            >
              {model.name}
            </button>
          ))}
        </div>
      </div>

      {/* 機能テスト */}
      <div className="mb-8 w-full max-w-5xl">
        <h2 className="text-xl font-semibold mb-4">機能テスト</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* 左側: プレビューと読み込み状態 */}
          <div>
            <h3 className="text-lg font-medium mb-2">プレビュー</h3>
            <div className="bg-white rounded-lg shadow-md p-4 mb-4">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-64">
                  <p className="mb-4">読み込み中... {loadingProgress.toFixed(0)}%</p>
                  <LoadingIndicator progress={loadingProgress} className="w-64" />
                </div>
              ) : (
                <>
                  <div className="mb-4 text-sm text-gray-700 space-y-1">
                    <p>スケルトン: {getSkeletonPath(selectedModel.id, false)}</p>
                    <p>アトラス: {getAtlasPath(selectedModel.atlasName || selectedModel.id)}</p>
                    <p>アニメーション: {animations.length > 0 ? animations.join(', ') : '（なし）'}</p>
                  </div>

                  <SpineRenderer
                    skeletonPath={getSkeletonPath(selectedModel.id, false)}
                    atlasPath={getAtlasPath(selectedModel.atlasName || selectedModel.id)}
                    animation={currentAnimation || selectedModel.defaultAnimation}
                    skin={currentSkin}
                    width={400}
                    height={400}
                    className="mx-auto"
                    renderMode={renderMode}
                  />
                </>
              )}
            </div>
          </div>

          {/* 右側: コントロールパネルと生成オブジェクト一覧 */}
          <div>
            <h3 className="text-lg font-medium mb-2">コントロール</h3>
            <ControlPanel
              animations={animations}
              skins={skins}
              renderMode={renderMode}
              onAnimationChange={changeAnimation}
              onSkinChange={changeSkin}
              onRenderModeChange={changeRenderMode}
              onCreateSpine={() => createSpineObject(1)}
              onDeleteSpine={deleteSpineObject}      // 引数なし→直近を削除
              onDeleteAll={deleteAllSpineObjects}
              onToggleOverlap={toggleOverlap}
              onCreateMany={(count) => createMany(count)}
              className="mb-4"
            />

            {/* 生成されたオブジェクトの一覧（右側） */}
            <div className="mt-4">
              <h3 className="text-lg font-medium mb-2">
                生成されたオブジェクト（{spineObjects.length}）
              </h3>
              <div className="bg-white rounded-lg shadow-md p-4 min-h-[200px]">
                {spineObjects.length === 0 ? (
                  <p className="text-center text-gray-500">
                    オブジェクトがありません。「生成」または「2秒後に生成し、5秒後に自動削除」をお試しください。
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {spineObjects.map((obj) => (
                      <div key={obj.id} className="bg-gray-100 p-2 rounded">
                        <p className="text-xs">ID: {obj.id.substring(0, 8)}...</p>
                        <p className="text-xs">アニメーション: {obj.animation}</p>
                        <p className="text-xs">スキン: {obj.skin}</p>

                        {/* 個別プレビューは Player を既定にして WebGL コンテキスト過多を回避 */}
                        <SpineRenderer
                          skeletonPath={obj.skeleton || ''}
                          atlasPath={obj.atlas || ''}
                          animation={obj.animation || selectedModel.defaultAnimation}
                          skin={obj.skin}
                          width={150}
                          height={150}
                          className="mt-2"
                          renderMode={obj.renderMode || 'player'}
                        />

                        <button
                          className="mt-2 px-2 py-1 bg-red-500 text-white text-xs rounded"
                          onClick={() => deleteSpineObject(obj.id)}
                        >
                          削除
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 機能説明（「5秒ごと自動切替」を明記して保持） */}
      <div className="mb-8 w-full max-w-5xl">
        <h2 className="text-xl font-semibold mb-4">機能説明</h2>
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-gray-700">
            {/* 左列 */}
            <div className="space-y-4">
              <section>
                <h3 className="text-lg font-medium mb-1">ローディング</h3>
                <p>
                  アセット読み込みの進捗をプログレスバーで表示します。読み込み中はプレビューの代わりに進捗が表示されます。
                </p>
              </section>

              <section>
                <h3 className="text-lg font-medium mb-1">プレイヤー / WebGL 切替</h3>
                <p>
                  コントロールから描画モードを切り替えられます。大量表示は Player を推奨（WebGL コンテキストの過多を回避）。
                </p>
              </section>

              <section>
                <h3 className="text-lg font-medium mb-1">アニメーション / スキン切替</h3>
                <p>
                  コントロールからアニメーションとスキンを即時切替できます。モデルごとの利用可能一覧は自動取得します。
                </p>
              </section>
            </div>

            {/* 右列 */}
            <div className="space-y-4">
              <section>
                <h3 className="text-lg font-medium mb-1">生成 / 削除 / 全削除</h3>
                <p>
                  「生成」でオブジェクトを追加、「直近を削除」で最後に作成した 1 体を削除、「全削除」でまとめて削除できます。
                </p>
              </section>

              <section>
                <h3 className="text-lg font-medium mb-1">大量生成</h3>
                <p>
                  「10体生成」で一度に多数を追加し、パフォーマンス挙動を確認できます。必要に応じて重なり表示の切替も可能です。
                </p>
              </section>

              <section>
                <h3 className="text-lg font-medium mb-1">新機能: 遅延生成と自動削除</h3>
                <p>
                  「2秒後に生成し、5秒後に自動削除」ボタンで、2 秒後に 1 体を生成し、その 5 秒後に自動削除します。
                  Player モードの初回でも確実に削除が走るよう内部でグレース（短い待ち時間）を設けています。
                </p>
              </section>

              {/* ★ 保持：5秒ごとの自動切替 */}
              <section>
                <h3 className="text-lg font-medium mb-1">定期アニメーション切替（5秒ごと）</h3>
                <p>
                  オブジェクトが存在する場合、<strong>5秒ごと</strong>にランダムなオブジェクトのアニメーションが自動的に切り替わります。
                </p>
              </section>
            </div>
          </div>
        </div>
      </div>

      <footer className="mt-8 text-center text-gray-500 text-sm">
        © 2025 Spine TS デモ - Next.js + TypeScript + Spine TS Player/WebGL
      </footer>
    </main>
  );
}
