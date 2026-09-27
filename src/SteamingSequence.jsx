import { useId } from 'react';

const clamp = (value) => Math.max(0, Math.min(1, value));
const cue = (progress, start, end) => {
  const t = clamp((progress - start) / (end - start));
  return t * t * (3 - 2 * t);
};

// These masks only layer the supplied PNGs; the original files stay untouched.
const stoveFront = `M0 520 L348 520
  C344 452 354 389 383 352 C415 307 488 282 592 261
  C635 246 670 260 683 285 C699 320 676 350 648 369
  C616 392 556 411 540 443 C527 467 520 490 520 520
  L1270 520 C1259 484 1248 452 1225 432
  C1197 413 1163 405 1128 380 C1084 348 1077 312 1097 282
  C1111 254 1133 248 1173 255 C1270 273 1363 304 1398 357
  C1425 400 1431 461 1430 520 H1774 V887 H0Z`;
const basketFront = 'M0 364 C61 418 118 452 187 483 C320 546 500 577 729 579 C964 579 1161 536 1292 471 C1370 429 1422 392 1459 350 V1078 H0Z';
const basketBack = 'M0 366 C61 420 118 454 187 485 C320 548 500 579 729 581 C964 581 1161 538 1292 473 C1370 431 1422 394 1459 352 V0 H0Z';
const wisps = [[12, 28], [73, 29], [19, 16], [65, 15], [41, 10],
  [6, 18], [82, 17], [26, 7], [56, 6], [41, 1]];

export default function SteamingSequence({ progress = 0, reducedMotion = false }) {
  const id = useId();
  const p = clamp(Number.isFinite(progress) ? progress : 0);
  const src = (name) => `${import.meta.env.BASE_URL}assets/${name}.png`;
  const flame = cue(p, .08, .23);
  const basket = cue(p, .24, .40);
  const bun = cue(p, .43, .61);
  const lid = cue(p, .63, .81);
  const growth = cue(p, .84, 1);
  const basketY = 52 - (reducedMotion ? 0 : (1 - basket) * 35);
  const bunY = 27 - (reducedMotion ? 0 : (1 - bun) * 43);
  const lidY = -8 - (reducedMotion ? 0 : (1 - lid) * 32);
  const basketTransform = `translate(43 ${basketY}) scale(${216 / 1459})`;
  const stoveTransform = `translate(0 139) scale(${302 / 1774})`;

  return <div className="steaming-sequence" data-testid="steaming-sequence" data-progress={p}>
    <div className="sequence-steam" aria-hidden="true">
      {wisps.map(([left, top], index) => {
        const start = index < 5 ? .81 + index * .008 : .9 + (index - 5) * .008;
        return <span className="sequence-wisp" key={index} data-testid="steam-wisp"
          style={{ left: `${left}%`, top: `${top}%`, opacity: cue(p, start, start + .065),
            transform: `scale(${1 + growth * .5})`, '--i': index }}>
          <img src={src('steam-single-hd')} alt="" draggable="false" />
        </span>;
      })}
    </div>
    <svg className="sprite steamer steaming-art" viewBox="0 0 302 290" preserveAspectRatio="xMidYMid meet"
      aria-hidden="true">
      <defs>
        <clipPath id={`${id}-stove-back`} clipPathUnits="userSpaceOnUse">
          <path d={`M0 0H1774V887H0Z ${stoveFront}`} clipRule="evenodd" />
        </clipPath>
        <clipPath id={`${id}-stove-front`} clipPathUnits="userSpaceOnUse"><path d={stoveFront} /></clipPath>
        <clipPath id={`${id}-basket-back`} clipPathUnits="userSpaceOnUse"><path d={basketBack} /></clipPath>
        <clipPath id={`${id}-basket-front`} clipPathUnits="userSpaceOnUse"><path d={basketFront} /></clipPath>
      </defs>
      {/* The stove arrives with the existing step-entry transition. */}
      <g data-testid="steam-stove" opacity="1" transform={stoveTransform}>
        <image href={src('stove-hd')} width="1774" height="887" clipPath={`url(#${id}-stove-back)`} />
      </g>
      <g data-testid="steam-flame" opacity={flame}
        transform={reducedMotion ? undefined : `translate(151 230) scale(${.88 + flame * .12}) translate(-151 -230)`}>
        <image href={src('flame-hd')} x="53" y="132" width="196" height="98" />
      </g>
      <g transform={stoveTransform}>
        <image href={src('stove-hd')} width="1774" height="887" clipPath={`url(#${id}-stove-front)`} />
      </g>
      <g data-testid="steam-basket" opacity={basket} transform={basketTransform}>
        <image href={src('steamer-open-hd')} width="1459" height="1078" clipPath={`url(#${id}-basket-back)`} />
      </g>
      <g data-testid="steam-bun" opacity={bun} transform={`translate(73 ${bunY})`}>
        <image href={src('wrap-3-hd')} width="156" height={156 * 1122 / 1402} />
      </g>
      <g data-testid="steam-basket-front" opacity={basket} transform={basketTransform}>
        <image href={src('steamer-open-hd')} width="1459" height="1078" clipPath={`url(#${id}-basket-front)`} />
      </g>
      <g data-testid="steam-lid" opacity={lid} transform={`translate(34 ${lidY})`}>
        <image href={src('lid-hd')} width="234" height="156" />
      </g>
    </svg>
  </div>;
}
