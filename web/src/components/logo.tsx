/** A little tag on a green square, same drawing as app/icon.svg */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      <rect width="32" height="32" rx="8" fill="#1f6b3a" />
      <rect x="9" y="6" width="14" height="20" rx="2.5" fill="#f5f7f2" />
      <circle cx="16" cy="10.5" r="1.8" fill="#1f6b3a" />
      <path
        d="M12.5 16.5h7M12.5 20h4.5"
        stroke="#1f6b3a"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
