import { useRef } from 'react';
import FinishedArtwork from './FinishedArtwork.jsx';
import ClosedSteamerArtwork from './ClosedSteamerArtwork.jsx';
import OpenSteamerArtwork from './OpenSteamerArtwork.jsx';
import SteamingSequence from './SteamingSequence.jsx';

export const spriteNames = ['bun', 'dough', 'flour-cup', 'bowl', 'jug', 'spoon', 'empty-spoon', 'wrapper', 'basket-front', 'lid', 'steamer-closed', 'finished', 'finished-base', 'finished-bun', 'cover-basket', 'timer-frame', 'filling', 'water-drop', 'steam-puff', 'finished-hd', 'flour-cup-hd', 'bowl-hd', 'bun-hd', 'filling-hd', 'timer-frame-hd', 'lid-hd', 'steamer-closed-hd', 'empty-spoon-hd', 'dough-hd', 'steam-single-hd', 'steamer-open-hd', 'stove-hd', 'flame-hd', 'spoon-hd', 'flour-cup-empty-hd', 'flour-particles-hd', 'jug-hd', 'jug-empty-hd', 'water-drop-hd', 'bowl-empty-hd', 'wrap-1-hd', 'wrap-2-hd', 'wrap-3-hd', 'wrapper-hd', 'cover-basket-hd'];
const asset = (name) => `${import.meta.env.BASE_URL}assets/${name}.png`;
const smooth = (n) => n * n * (3 - 2 * n);

function Sprite({ name, className = '', style = {}, alt = '' }) {
  return <img draggable="false" className={`sprite ${className}`} src={asset(name)} alt={alt} style={style} />;
}

function Flour({ amount, reducedMotion }) {
  return <div className="flour-fall" aria-hidden="true">
    <Sprite name="flour-particles-hd" className="flour-particles-hd" style={{
      top: `${30 + (reducedMotion ? 6 : amount * 12)}%`,
      opacity: amount > 0 && amount < .95 ? Math.sin(amount * Math.PI) : 0,
    }} />
  </div>;
}

function Timer({ game }) {
  // Entire five seconds begin only after the engine's entering phase has finished.
  const remaining = game.phase === 'entering' ? 1 : Math.max(0, 1 - game.countdownProgress);
  return <div className="timer timer-hd" role="timer" aria-label={`等待，剩餘 ${game.countdown} 秒`}>
    <Sprite name="timer-frame-hd" alt="奶油色毛絨倒數時鐘" />
    <svg className="timer-ring" viewBox="0 0 1218 1292" aria-hidden="true">
      <circle className="ring-track" cx="609" cy="680" r="310" />
      <circle className="ring-value" cx="609" cy="680" r="310" transform="rotate(-90 609 680)" pathLength="100" strokeDasharray={`${remaining * 100} 100`} />
    </svg>
    <span className="timer-digit" data-testid="countdown" aria-live="off">{game.countdown}</span>
    <span className="sr-only" aria-live="polite">{game.ready ? '五秒等待完成，可以下一步。' : ''}</span>
  </div>;
}

export default function Stage({ game, onAction }) {
  const pointerStart = useRef(null);
  const suppressClick = useRef(false);
  const isAnimating = game.phase === 'action' || game.phase === 'settling';
  const actionProgress = game.ready || game.phase === 'settling' ? 1 : game.phase === 'action' ? game.progress : 0;
  const p = smooth(Math.min(1, actionProgress));
  const locked = game.busy || game.ready || game.step === 8 || game.step === 9 || game.step === 0;

  function down(event) {
    if (game.step !== 3 || locked) return;
    suppressClick.current = false;
    pointerStart.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function up(event) {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start || locked) return;
    if (Math.abs(event.clientX - start.x) >= 28 && Math.abs(event.clientX - start.x) > Math.abs(event.clientY - start.y)) {
      suppressClick.current = true;
      onAction();
    }
  }

  function click() {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (!locked) onAction();
  }

  const scenes = {
    0: <div className="cover-art"><Sprite name="cover-basket-hd" className="hero-finished" alt="微笑的小籠包坐在有校徽的淺米色蒸籠裡" /><div className="hello-rays" aria-hidden="true"><i /><i /><i /><i /></div></div>,
    1: <>
      <Sprite name="bowl-empty-hd" className="mixing-bowl" style={{ opacity: 1 - p }} />
      <Sprite name="bowl-hd" className="mixing-bowl" style={{ opacity: p }} />
      <Sprite name="flour-cup-empty-hd" className="flour-cup" style={{ opacity: p, transform: game.reducedMotion ? 'none' : `translate(${p * -9}%, ${Math.sin(p * Math.PI) * 12}%)` }} />
      <Sprite name="flour-cup-hd" className="flour-cup" style={{ opacity: 1 - p, transform: game.reducedMotion ? 'none' : `translate(${p * -9}%, ${Math.sin(p * Math.PI) * 12}%)` }} />
      <Flour amount={actionProgress} reducedMotion={game.reducedMotion} />
      {game.ready && <span className="completed-tick" aria-hidden="true"><Check /></span>}
    </>,
    2: <>
      <Sprite name="bowl-hd" className="mixing-bowl" />
      <Sprite name="jug-empty-hd" className="water-jug" style={{ opacity: p, transform: game.reducedMotion ? 'none' : `translateY(${Math.sin(p * Math.PI) * 10}%)` }} />
      <Sprite name="jug-hd" className="water-jug" style={{ opacity: 1 - p, transform: game.reducedMotion ? 'none' : `translateY(${Math.sin(p * Math.PI) * 10}%)` }} />
      {(isAnimating || game.ready) && [0, 1, 2, 3].map((i) => <Sprite key={i} name="water-drop-hd" className="water-drop" style={{ left: `${42 + i % 2 * 5}%`, top: `${28 + ((actionProgress * 85 + i * 9) % 30)}%`, opacity: game.ready || p > .94 ? 0 : .96 }} />)}
      {game.ready && <span className="completed-tick" aria-hidden="true"><Check /></span>}
    </>,
    3: <>
      <Sprite name="dough-hd" className="dough" style={{ transform: `translateX(${isAnimating && !game.reducedMotion ? Math.sin(p * Math.PI * 2) * 5 : 0}%)` }} />
      <div className="knead-arrows" aria-hidden="true"><span>←</span><span>→</span></div>
    </>,
    4: <>
      <Sprite name="wrapper-hd" className="wrapper" />
      <Sprite name="empty-spoon-hd" className="filling-spoon" style={{ opacity: Math.min(1, p * 12), transform: game.reducedMotion ? 'none' : `translateY(${p * 9}%)` }} />
      <Sprite name="spoon-hd" className="filling-spoon" style={{ opacity: Math.max(0, 1 - p * 12), transform: game.reducedMotion ? 'none' : `translateY(${p * 9}%)` }} />
      <Sprite name="filling-hd" className="falling-filling" style={{ opacity: Math.min(1, p * 12), left: `${38 - p * 1.5}%`, top: `${game.reducedMotion && p > 0 ? 61 : 21 + p * 40}%` }} />
    </>,
    5: (() => {
      const fold = game.ready ? 3 : Math.min(3, game.count + (isAnimating ? p : 0));
      return <>
        <div className="wrapping-base" style={{ opacity: Math.max(0, 1 - fold) }}><Sprite name="wrapper-hd" className="wrapper" /><Sprite name="filling-hd" className="wrap-filling" /></div>
        {[1, 2, 3].map((stage) => <Sprite key={stage} name={`wrap-${stage}-hd`} className="wrapping-bun"
          style={{ opacity: Math.max(0, 1 - Math.abs(fold - stage)) }} />)}
      </>;
    })(),
    6: <>
      <OpenSteamerArtwork progress={p} />
      <Sprite name="lid-hd" className="side-lid" />
    </>,
    7: <SteamingSequence progress={actionProgress} reducedMotion={game.reducedMotion} />,
    9: <>
      <FinishedArtwork />
      <ClosedSteamerArtwork className="finale-closed" />
      <Sprite name="lid-hd" className="opening-lid" />
      <div className="celebration" aria-hidden="true"><i /><i /><i /><i /></div>
    </>,
  };

  return <div className={`stage stage-${game.step}`} data-testid="stage" aria-label={game.step === 8 ? '倒數時鐘' : '小籠包製作舞台'}>
    {game.step !== 8 && <div className="stage-floor" aria-hidden="true" />}
    {game.step === 8 ? <Timer game={game} /> : <div className="scene" aria-hidden={game.step !== 0 && game.step !== 9 ? true : undefined}>
      {scenes[game.step]}
    </div>}
    {game.step > 0 && game.step < 8 && <button className={`art-hit-area hit-${game.step}`} tabIndex={-1} aria-hidden="true" disabled={locked}
      onPointerDown={down} onPointerUp={up} onPointerCancel={() => { pointerStart.current = null; suppressClick.current = false; }} onClick={click} />}
  </div>;
}

function Check() {
  return <svg viewBox="0 0 28 28"><path d="m6 14 5 5 11-12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
