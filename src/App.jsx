import { useEffect, useRef, useState } from 'react';
import { useBunGame } from './useBunGame.js';
import { usePWA } from './usePWA.js';
import Stage, { spriteNames } from './Stage.jsx';

const copy = [
  { en: 'Let’s Make a Little Bun!', zh: '一起做小籠包！', action: '開始', actionEn: 'Start' },
  { en: 'Add Flour', zh: '加入麵粉', hint: '點麵粉杯。', action: '加入麵粉', actionEn: 'Add Flour' },
  { en: 'Add Water', zh: '加入清水', hint: '點水壺。', action: '加入清水', actionEn: 'Add Water' },
  { en: 'Knead', zh: '揉一揉', hint: '左右揉三次，或點「揉一下」三次。', action: '揉一下', actionEn: 'Knead' },
  { en: 'Add Filling', zh: '放入肉餡', hint: '點湯匙。', action: '放入肉餡', actionEn: 'Add Filling' },
  { en: 'Wrap It Up', zh: '包起來', hint: '點麵皮三次。', action: '包一下', actionEn: 'Wrap' },
  { en: 'Into the Steamer', zh: '放進蒸籠', hint: '點包子。', action: '放進蒸籠', actionEn: 'Place the Bun' },
  { en: 'Start Steaming', zh: '開始蒸', hint: '點「開始蒸」。', action: '開始蒸', actionEn: 'Start Steaming' },
  { en: 'Wait', zh: '等待' },
  { en: 'Done!', zh: '做好啦！', action: '再做一次', actionEn: 'Play Again' },
];

function HomeIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m3 10 9-7 9 7M5.5 9v11h5v-6h3v6h5V9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Arrow() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function OfflineStatus({ pwa }) {
  const label = {
    loading: '正在準備離線遊戲…請保持連線',
    ready: pwa.isOffline ? '離線遊玩中' : '已可離線遊玩',
    error: '離線素材尚未準備完成，請連線重試',
    unsupported: '可線上遊玩；此環境不支援離線儲存',
    development: '開發預覽 · 離線功能請使用正式預覽',
  }[pwa.cacheState];
  return <span className="cache-status" data-testid="cache-status" data-state={pwa.cacheState}>
    <span className="status-dot" aria-hidden="true" />{label}
    {pwa.cacheState === 'error' && <button className="text-button" onClick={pwa.retryOffline}>重試</button>}
  </span>;
}

export default function App() {
  const game = useBunGame();
  // Updating never resets an in-progress game or dismisses an open dialog.
  const pwa = usePWA({ canReload: game.step === 0 && !game.paused });
  const [dialogType, setDialogType] = useState(null);
  const dialog = useRef(null);
  const heading = useRef(null);
  const nextButton = useRef(null);
  const lastActive = useRef(null);
  const previousStep = useRef(0);
  const [assetError, setAssetError] = useState(false);
  const data = copy[game.step];

  useEffect(() => {
    // Warm every supplied sprite before a child reaches the corresponding step.
    const images = spriteNames.map((name) => {
      const img = new Image();
      img.src = `${import.meta.env.BASE_URL}assets/${name}.png`;
      img.onerror = () => setAssetError(true);
      return img;
    });
    return () => images.forEach((img) => { img.onerror = null; });
  }, []);

  useEffect(() => {
    if (previousStep.current !== game.step) {
      heading.current?.focus({ preventScroll: true });
      previousStep.current = game.step;
    }
  }, [game.step]);

  useEffect(() => {
    if (game.ready && document.hasFocus()) nextButton.current?.focus({ preventScroll: true });
  }, [game.ready]);

  function openDialog(type) {
    lastActive.current = document.activeElement;
    game.setModalOpen(true);
    setDialogType(type);
    dialog.current.showModal();
  }

  function closeDialog() {
    dialog.current.close();
    setDialogType(null);
    game.setModalOpen(false);
    lastActive.current?.focus({ preventScroll: true });
  }

  function home() {
    if (game.step > 0 && game.step < 9) openDialog('home');
    else game.goHome();
  }

  function confirmHome() {
    closeDialog();
    game.goHome();
  }

  const activate = game.step === 0 ? game.begin : game.step === 9 ? game.replay : game.act;
  const entering = game.phase === 'entering';
  const motionStyle = entering ? {
    transform: game.reducedMotion ? 'none' : `translateX(${(1 - game.progress) * 60}px)`,
    opacity: game.reducedMotion ? .25 + game.progress * .75 : .45 + game.progress * .55,
  } : {};
  const hint = game.ready ? data.done : data.hint;

  return <main className={`game-shell ${game.paused ? 'paused' : ''} ${game.reducedMotion ? 'reduced-motion' : ''} ${game.step === 0 ? 'cover' : ''} ${game.step === 8 ? 'waiting' : ''}`}
    data-testid="game-shell" data-step={game.step} data-phase={game.phase}
    onKeyDownCapture={(event) => {
      // A held key must not activate a newly focused Next button.
      if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
    }}>
    <nav className="topbar" aria-label="製作進度">
      <button className="home-button" aria-label="回到首頁" onClick={home}><HomeIcon /></button>
      {game.step > 0 ? <div className="progress-group">
        <span className="step-number" aria-label={`第 ${game.step} 步，共 9 步`}>{game.step}</span>
        <ol className="progress-dots" aria-label="九個製作步驟">
          {copy.slice(1).map((item, i) => <li key={item.en} aria-current={game.step === i + 1 ? 'step' : undefined} aria-label={`第 ${i + 1} 步：${item.zh}`}><span /></li>)}
        </ol>
      </div> : null}
      <span className="topbar-spacer" aria-hidden="true" />
    </nav>

    <section className="play-screen" aria-labelledby="step-heading" style={motionStyle}>
      <header className="step-heading" ref={heading} tabIndex={-1} id="step-heading">
        <p className="english-title" lang="en">{data.en}</p>
        <h1>{data.zh}</h1>
      </header>

      <Stage game={game} onAction={activate} />

      <div className={`action-area ${game.ready ? 'is-ready' : ''}`}>
        {game.step !== 8 && hint && <p className="hint" aria-live="polite">{hint}</p>}
        {(game.step === 3 || game.step === 5) && !game.ready && <div className="repetition-count" aria-label={`已完成 ${game.count} 次，共 3 次`}>
          {[0, 1, 2].map((i) => <span key={i} className={i < game.count ? 'filled' : ''}>{i + 1}</span>)}
        </div>}
        {game.ready ? <button ref={nextButton} data-testid="next-action" className="action-hit-area next-button" onClick={game.next} disabled={game.busy}>
          <span className="primary-button button-face"><span><span className="button-en" lang="en">Next</span><span>下一步</span></span><Arrow /></span>
        </button> : game.step !== 8 ? <button data-testid="primary-action" className="action-hit-area" onClick={activate} disabled={game.busy || assetError}>
          <span className="primary-button button-face">
            <span><span className="button-en" lang="en">{data.actionEn}</span><span>{data.action}</span></span>
            {(game.step === 0 || game.step === 9) && <Arrow />}
          </span>
        </button> : <div className="countdown-button-space" aria-hidden="true" />}
        {assetError && <p className="asset-error" role="alert">圖片未完整載入，請連線後重新整理。</p>}
      </div>
    </section>

    {/* Keep the timer screen focused: no install prompts or production props here. */}
    <footer className="app-footer" hidden={game.step === 8}>
      <OfflineStatus pwa={pwa} />
      {!pwa.standalone && pwa.isIOS && <button className="text-button" onClick={() => openDialog('install')}>加入主畫面</button>}
      {pwa.canInstall && !pwa.isIOS && <button className="text-button" onClick={pwa.install}>安裝遊戲</button>}
    </footer>

    <dialog ref={dialog} className="small-dialog" onCancel={(event) => { event.preventDefault(); closeDialog(); }}>
      {dialogType === 'home' ? <>
        <h2>要回到首頁嗎？</h2>
        <p>這次的製作會重新開始。</p>
        <button className="primary-button" onClick={closeDialog} autoFocus>繼續製作</button>
        <button className="secondary-button" onClick={confirmHome}>回到首頁</button>
      </> : <>
        <h2>把小籠包帶回主畫面</h2>
        <p>在 Safari 點「分享」，再選「加入主畫面」。如果目前瀏覽器沒有這個選項，請用 Safari 開啟。</p>
        <p>等下方顯示「已可離線遊玩」後，即可離線製作。</p>
        <button className="primary-button" onClick={closeDialog}>知道了</button>
      </>}
    </dialog>
  </main>;
}
