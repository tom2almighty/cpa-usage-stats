/**
 * 插件 logo：与 cpa-dashboard 面板同一套图形（蓝色圆角方块 + 四根白色圆头柱）。
 * assets/logo.svg 与 web/index.html 的 favicon 是同一图形的放大/编码版本，改这里记得三处同步。
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      <rect width="32" height="32" rx="7" fill="#2a78d6" />
      <path d="M8 22V16M13.3 22V11M18.7 22V14M24 22V9" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
