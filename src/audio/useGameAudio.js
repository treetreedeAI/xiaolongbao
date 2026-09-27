import { useEffect, useRef } from 'react';
import { createAudioEngine } from './audioEngine.js';

/** Adds sound without replacing any game event handlers, state or DOM. */
export function useGameAudio(game) {
  const engineRef = useRef(null);
  const latest = useRef(game);
  latest.current = game;

  useEffect(() => {
    const engine = createAudioEngine();
    engineRef.current = engine;
    engine.update(latest.current);
    engine.setHidden(document.hidden);
    const insideGame = (event) => event.target instanceof Element
      && event.target.closest('[data-testid="game-shell"]');
    const unlock = (event) => {
      if (!event.isTrusted || !insideGame(event)) return;
      if (event.type === 'keydown' && (event.repeat || !['Enter', ' '].includes(event.key))) return;
      void engine.unlock();
    };
    const click = (event) => {
      if (!event.isTrusted || !insideGame(event)) return;
      const button = event.target.closest('button');
      if (!button || button.disabled) return;
      // Click covers keyboard and assistive-technology activation as well as tap.
      void engine.unlock().then((ready) => { if (ready) engine.click(); });
    };
    const visibility = () => engine.setHidden(document.hidden);
    const hide = () => engine.setHidden(true);
    document.addEventListener('pointerup', unlock, true);
    document.addEventListener('keydown', unlock, true);
    document.addEventListener('click', click, true);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', visibility);
    return () => {
      document.removeEventListener('pointerup', unlock, true);
      document.removeEventListener('keydown', unlock, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', visibility);
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.update(game);
  }, [game.step, game.phase, game.count, game.countdown, game.progress, game.paused]);
}
