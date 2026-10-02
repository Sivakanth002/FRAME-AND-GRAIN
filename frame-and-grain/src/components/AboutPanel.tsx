'use client';
// ============================================================================
// FRAME & GRAIN — About Panel
// Editorial. Minimal. Required attributions included.
// ============================================================================

interface AboutPanelProps {
  onClose: () => void;
}

export function AboutPanel({ onClose }: AboutPanelProps) {
  return (
    <div
      className="about-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="About Frame & Grain"
    >
      <button
        className="about-close"
        onClick={onClose}
        aria-label="Close About"
        autoFocus
      >
        ✕ CLOSE
      </button>

      <div className="about-content">
        <div>
          <p className="about-wordmark">FRAME &amp; GRAIN</p>
          <h1 className="about-tagline">
            Find the film worth your time.
          </h1>
        </div>

        <div className="about-body">
          <p>
            Frame &amp; Grain is a discovery surface for cinema and television.
            Not a catalogue. Not a ranking. An archive you move through.
          </p>
          <p style={{ marginTop: '1em' }}>
            The Lens is the interface. Move through the collection.
            One film will find you.
          </p>
          <p style={{ marginTop: '1em' }}>
            TUNE refines the archive to your moment.
            LUCKY trusts us to choose.
          </p>
        </div>

        <div className="about-attribution">
          <p>
            Film data and imagery provided by{' '}
            <a
              href="https://www.themoviedb.org/"
              target="_blank"
              rel="noopener noreferrer"
            >
              The Movie Database (TMDB)
            </a>
            . This product uses the TMDB API but is not endorsed or certified by TMDB.
          </p>
          <p style={{ marginTop: '0.75em' }}>
            Watch provider availability data supplied by{' '}
            <a
              href="https://www.justwatch.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              JustWatch
            </a>{' '}
            via the TMDB API.
          </p>
        </div>
      </div>
    </div>
  );
}
