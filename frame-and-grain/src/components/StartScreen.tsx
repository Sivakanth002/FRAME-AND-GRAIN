'use client';
// ============================================================================
// FRAME & GRAIN — Start Screen
// "WHAT DO YOU FEEL LIKE?" — four choices
// ============================================================================

interface StartScreenProps {
  exiting: boolean;
  onChoice: (choice: 'movie' | 'series' | 'anime' | 'idk') => void;
}

export function StartScreen({ exiting, onChoice }: StartScreenProps) {
  return (
    <div
      className={`start-screen${exiting ? ' exiting' : ''}`}
      role="main"
      aria-label="Frame & Grain — choose your film type"
    >
      <h1 className="start-question">What do you feel like?</h1>

      <div className="start-choices" role="group" aria-label="Content type choices">
        <button
          className="start-choice"
          onClick={() => onChoice('movie')}
          aria-label="I want a movie"
        >
          MOVIE
        </button>

        <button
          className="start-choice"
          onClick={() => onChoice('series')}
          aria-label="I want a series"
        >
          SERIES
        </button>

        <button
          className="start-choice"
          onClick={() => onChoice('anime')}
          aria-label="I want anime"
        >
          ANIME
        </button>

        <button
          className="start-choice idk"
          onClick={() => onChoice('idk')}
          aria-label="I don't know — surprise me"
        >
          I DON&apos;T KNOW
        </button>
      </div>

      <p className="start-wordmark" aria-hidden="true">
        FRAME &amp; GRAIN — Find the film worth your time
      </p>
    </div>
  );
}
