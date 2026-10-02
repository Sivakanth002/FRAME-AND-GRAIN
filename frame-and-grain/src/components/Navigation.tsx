'use client';
// ============================================================================
// FRAME & GRAIN — Navigation
// ============================================================================

interface NavigationProps {
  onLogo: () => void;
  onTune: () => void;
  onLucky: () => void;
  onAbout: () => void;
  tuneActive: boolean;
  luckyActive: boolean;
}

export function Navigation({ onLogo, onTune, onLucky, onAbout, tuneActive, luckyActive }: NavigationProps) {
  return (
    <nav className="nav" aria-label="Main navigation">
      <button
        className="nav-logo"
        onClick={onLogo}
        aria-label="Frame & Grain home"
      >
        FRAME <span>&</span> GRAIN
      </button>

      <ul className="nav-links" role="list">
        <li>
          <button
            className={`nav-link${tuneActive ? ' active' : ''}`}
            onClick={onTune}
            aria-pressed={tuneActive}
            aria-label="Open TUNE — refine your discovery"
          >
            TUNE
          </button>
        </li>
        <li>
          <button
            className={`nav-link accent${luckyActive ? ' active' : ''}`}
            onClick={onLucky}
            aria-pressed={luckyActive}
            aria-label="I'm Feeling Lucky — surprise me"
          >
            LUCKY
          </button>
        </li>
        <li>
          <button
            className="nav-link"
            onClick={onAbout}
            aria-label="About Frame & Grain"
          >
            ABOUT
          </button>
        </li>
      </ul>
    </nav>
  );
}
