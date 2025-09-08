'use client';

import React from 'react';
import SpinePlayer from './SpinePlayer';
import SpineCanvas, { SpineCanvasProps } from './SpineCanvas';

type RenderMode = 'player' | 'webgl';

interface SpineRendererProps extends Omit<SpineCanvasProps, 'items'> {
  renderMode?: RenderMode;
  items?: SpineCanvasProps['items']; // 方式1：複数描画
}

const SpineRenderer: React.FC<SpineRendererProps> = (props) => {
  const {
    renderMode = 'webgl',
    width = 400,
    height = 400,
    className,
    premultipliedAlpha = true,
    backgroundColor = '#00000000',
    skeletonPath,
    atlasPath,
    animation,
    skin,
    loop = true,
    items,
  } = props;

  return (
    <div className={className}>
      {renderMode === 'player' ? (
        <SpinePlayer
          skeletonPath={skeletonPath!}
          atlasPath={atlasPath!}
          animation={animation}
          skin={skin}
          loop={loop}
          width={width}
          height={height}
          backgroundColor={backgroundColor}
        />
      ) : (
        <SpineCanvas
          width={width}
          height={height}
          className={className}
          premultipliedAlpha={premultipliedAlpha}
          backgroundColor={backgroundColor}
          skeletonPath={skeletonPath}
          atlasPath={atlasPath}
          animation={animation}
          skin={skin}
          loop={loop}
          items={items}       // ★ 左側は items を渡して単一Canvasにまとめる
        />
      )}
    </div>
  );
};

export default SpineRenderer;
