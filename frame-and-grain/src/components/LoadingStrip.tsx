'use client';
// ============================================================================
// FRAME & GRAIN — Loading Strip
// Filmstrip-style micro-animation — shown only for slow requests
// ============================================================================

export function LoadingStrip() {
  return (
    <div
      className="loading-strip"
      role="status"
      aria-label="Loading — searching the collection"
      aria-live="polite"
    >
      <div className="loading-frames" aria-hidden="true">
        <div className="loading-frame" />
        <div className="loading-frame" />
        <div className="loading-frame" />
        <div className="loading-frame" />
      </div>
      <span>SEARCHING</span>
    </div>
  );
}
