'use client';

interface LoadingIndicatorProps {
  progress: number;
  className?: string;
}

/**
 * LoadingIndicatorコンポーネント
 * アセット読み込み状態を視覚的に表示します。
 */
export default function LoadingIndicator({ progress, className = '' }: LoadingIndicatorProps) {
  // 進捗率を0-100の範囲に制限
  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <div className={`relative w-full h-4 bg-gray-200 rounded-full overflow-hidden ${className}`}>
      <div
        className="absolute top-0 left-0 h-full bg-blue-500 transition-all duration-300 ease-out"
        style={{ width: `${clampedProgress}%` }}
      />
      <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center text-xs font-medium text-white">
        {clampedProgress.toFixed(0)}%
      </div>
    </div>
  );
}
