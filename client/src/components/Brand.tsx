export function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className={`brand ${light ? 'brand-light' : ''}`}>
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 64 64" width="38" height="38">
          <rect width="64" height="64" rx="16" fill="rgba(255,255,255,0.08)" />
          <circle cx="43" cy="21" r="8" fill="#e8b93b" />
          <path d="M14 45c12-2 22-9 29-23 3 15-6 28-22 30-4 0-7-2-7-7Z" fill="#f7f3e7" />
        </svg>
      </span>
      <span className="brand-text">
        <strong>LeaveDesk</strong>
        <small>Leave management</small>
      </span>
    </div>
  );
}
