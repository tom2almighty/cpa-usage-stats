/**
 * 插件 logo。与 assets/logo.svg、插件元数据里的 Logo 同源：
 * 深色底 + 柱状图形，保证看板标题与管理中心插件卡片视觉一致。
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 256" role="img" aria-hidden className={className}>
      <rect width="256" height="256" rx="56" fill="currentColor" />
      <g fill="var(--background)">
        <rect x="57" y="140" width="25" height="60" rx="7" />
        <rect x="96" y="112" width="25" height="88" rx="7" />
        <rect x="135" y="84" width="25" height="116" rx="7" />
        <rect x="174" y="56" width="25" height="144" rx="7" />
      </g>
    </svg>
  );
}
