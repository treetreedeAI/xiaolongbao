import { useId } from 'react';

// Native coordinates of the supplied 1459 × 1078 lid-free basket. Only the
// front rim/body occlude the bun; the interior and rear rim remain behind it.
const frontEdge = 'M0 364 C61 418 118 452 187 483 C320 546 500 577 729 579 C964 579 1161 536 1292 471 C1370 429 1422 392 1459 350';
const frontPath = `${frontEdge} V1078 H0 Z`;
// Two native pixels of overlap lie entirely inside the opaque rim, preventing
// a fractional-pixel seam without duplicating the translucent outer fur.
const backEdge = 'M0 366 C61 420 118 454 187 485 C320 548 500 579 729 581 C964 581 1161 538 1292 473 C1370 431 1422 394 1459 352';
const backPath = `${backEdge} V0 H0 Z`;

export default function OpenSteamerArtwork({ progress = 0, className = '', style }) {
  const id = useId();
  const base = import.meta.env.BASE_URL;
  const amount = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const basketSrc = `${base}assets/steamer-open-hd.png`;

  return <div className={`open-steamer-artwork${className ? ` ${className}` : ''}`}
    style={{ position: 'absolute', inset: 0, pointerEvents: 'none', ...style }}
    data-testid="open-steamer-hd" role="img"
    aria-label={amount >= 1 ? '小籠包已放進開口蒸籠' : '把小籠包放進開口蒸籠'}>
    {/* Match the old front sprite's canvas ratio while keeping the supplied
        image at 1459 × 1078. Empty space below aligns the rim with the existing
        bun path; no image stretching, cropping or CSS position changes. */}
    <svg className="sprite basket-front" viewBox="0 0 1459 1369"
      preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs><clipPath id={`${id}-back`} clipPathUnits="userSpaceOnUse"><path d={backPath} /></clipPath></defs>
      <image href={basketSrc} width="1459" height="1078"
        preserveAspectRatio="xMidYMid meet" clipPath={`url(#${id}-back)`} />
    </svg>
    <img className="sprite placing-bun" src={`${base}assets/bun-hd.png`} alt="" draggable="false"
      style={{ left: `${7 + amount * 24}%`, top: `${15 + amount * 14}%` }} />
    <svg className="sprite basket-front" viewBox="0 0 1459 1369"
      preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs><clipPath id={`${id}-front`} clipPathUnits="userSpaceOnUse"><path d={frontPath} /></clipPath></defs>
      <image href={basketSrc} width="1459" height="1078"
        preserveAspectRatio="xMidYMid meet" clipPath={`url(#${id}-front)`} />
    </svg>
  </div>;
}
