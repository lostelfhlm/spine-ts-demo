/**
 * Spineアニメーション関連のユーティリティ関数
 */

/**
 * アセットパスを生成する
 * @param fileName ファイル名
 * @returns 完全なアセットパス
 */
export function getAssetPath(fileName: string): string {
  // 絶対パスを使用
  return `/assets/spine/${fileName}`;
}

// デバッグ用：アセットパスのログ出力
console.log('Asset path example:', getAssetPath('spineboy-pro.json'));
// クライアントサイドでのみwindowオブジェクトにアクセス
if (typeof window !== 'undefined') {
  console.log('Current location:', window.location.href);
}

/**
 * スケルトンパスを生成する
 * @param name スケルトン名
 * @param binary バイナリ形式かどうか
 * @returns スケルトンファイルのパス
 */
export function getSkeletonPath(name: string, binary: boolean = false): string {
  return getAssetPath(`${name}${binary ? '.skel' : '.json'}`);
}

/**
 * アトラスパスを生成する
 * @param name アトラス名
 * @param pma PMA（Premultiplied Alpha）テクスチャかどうか
 * @returns アトラスファイルのパス
 */
export function getAtlasPath(name: string, pma: boolean = false): string {
  // 既存のアセットはPMAサフィックスを使用していないようなので、デフォルトをfalseに変更
  return getAssetPath(`${name}${pma ? '-pma' : ''}.atlas`);
}

/**
 * Spineモデルの型定義
 */
export interface SpineModel {
  id: string;
  name: string;
  defaultAnimation: string;
  atlasName?: string;
}

/**
 * Spineアニメーションとスキン情報を取得する
 * @param skeletonData スケルトンデータ
 * @returns アニメーションとスキンの配列
 */
export function getSpineAnimationsAndSkins(skeletonData: any): { animations: string[], skins: string[] } {
  if (!skeletonData) {
    return { animations: [], skins: [] };
  }

  // アニメーション名の配列を取得
  const animations = skeletonData.animations ? 
    skeletonData.animations.map((anim: any) => anim.name) : [];
  
  // スキン名の配列を取得
  const skins = skeletonData.skins ?
    skeletonData.skins.map((skin: any) => skin.name) : [];
  
  return { animations, skins };
}

/**
 * デフォルトのアニメーションを取得する
 * @param animations アニメーション名の配列
 * @param preferredAnimation 優先するアニメーション名
 * @returns デフォルトのアニメーション名
 */
export function getDefaultAnimation(animations: string[], preferredAnimation?: string): string {
  if (!animations || animations.length === 0) {
    return '';
  }

  // 優先アニメーションが指定されていて、存在する場合はそれを使用
  if (preferredAnimation && animations.includes(preferredAnimation)) {
    return preferredAnimation;
  }

  // 一般的なデフォルトアニメーション名のリスト
  const commonDefaultAnimations = ['idle', 'Idle', 'default', 'Default', 'stand', 'Stand'];
  
  // 一般的なデフォルトアニメーションが存在するか確認
  for (const defaultAnim of commonDefaultAnimations) {
    if (animations.includes(defaultAnim)) {
      return defaultAnim;
    }
  }

  // 見つからない場合は最初のアニメーションを返す
  return animations[0];
}

/**
 * デフォルトのスキンを取得する
 * @param skins スキン名の配列
 * @param preferredSkin 優先するスキン名
 * @returns デフォルトのスキン名
 */
export function getDefaultSkin(skins: string[], preferredSkin?: string): string {
  if (!skins || skins.length === 0) {
    return 'default';
  }

  // 優先スキンが指定されていて、存在する場合はそれを使用
  if (preferredSkin && skins.includes(preferredSkin)) {
    return preferredSkin;
  }

  // 'default'スキンが存在するか確認
  if (skins.includes('default')) {
    return 'default';
  }

  // 見つからない場合は最初のスキンを返す
  return skins[0];
}

/**
 * 利用可能なSpineモデルのリスト
 */
export const availableModels: SpineModel[] = [
  {
    id: 'con-card/conCard',
    name: 'コンカード',
    defaultAnimation: 'idleFront',
  },
  {
    id: 'droneAi/droneAi',
    name: 'ドローンAi',
    defaultAnimation: 'idle',
  },
  {
    id: 'droneMai/droneMai',
    name: 'ドローンMai',
    defaultAnimation: 'idle',
  },
  {
    id: 'droneMie/droneMie',
    name: 'ドローンMie',
    defaultAnimation: 'idle',
  },
  {
    id: 'monster/worMonster',
    name: 'モンスター',
    defaultAnimation: 'idle',
    atlasName: 'monster/monsterAll',
  },
  {
    id: 'monster/monsterEat',
    name: 'モンスター（食べる）',
    defaultAnimation: 'idle',
    atlasName: 'monster/monsterAll',
  },
  {
    id: 'monster/worMonsterGet',
    name: 'モンスター（ゲット）',
    defaultAnimation: 'idle',
    atlasName: 'monster/monsterAll',
  },
  {
    id: 'pho-dialog-stone/phoStoneAttachment',
    name: 'フォダイアログストーン（アタッチメント）',
    defaultAnimation: 'idle',
    atlasName: 'pho-dialog-stone/phoDialogStone',
  },
  {
    id: 'pho-dialog-stone/phoStoneBase',
    name: 'フォダイアログストーン（ベース）',
    defaultAnimation: 'idle',
    atlasName: 'pho-dialog-stone/phoDialogStone',
  },
  {
    id: 'pho-dialog-stone/phoStoneBase_100',
    name: 'フォダイアログストーン（ベース100）',
    defaultAnimation: 'idle',
    atlasName: 'pho-dialog-stone/phoDialogStone',
  },
  {
    id: 'pho-dialog-stone/phoStoneGet',
    name: 'フォダイアログストーン（ゲット）',
    defaultAnimation: 'intro',
    atlasName: 'pho-dialog-stone/phoDialogStone',
  },
  {
    id: 'pho-transfer-default/phoTransferDefault',
    name: 'フォトランスファー（デフォルト）',
    defaultAnimation: 'idle',
  },
  {
    id: 'pho-transfer-factory/phoTransferFactory',
    name: 'フォトランスファー（ファクトリー）',
    defaultAnimation: 'idle',
  },
  {
    id: 'pho-transfer-island/phoTransferIsland',
    name: 'フォトランスファー（アイランド）',
    defaultAnimation: 'idle',
  },
  {
    id: 'spine-scholar/scholar',
    name: 'スカラー',
    defaultAnimation: 'idle',
  },
  {
    id: 'wor-generator/wor_generator',
    name: 'ワージェネレーター',
    defaultAnimation: 'idle',
  },
  {
    id: 'wor-sort-machine/worSortmachine',
    name: 'ワーソートマシン',
    defaultAnimation: 'idle',
  },
];

/**
 * 指定されたミリ秒だけ待機する
 * @param ms 待機ミリ秒
 * @returns Promiseオブジェクト
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
