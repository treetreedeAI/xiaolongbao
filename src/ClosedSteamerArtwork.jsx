import { useId } from 'react';

// Native coordinates of the supplied 1774 × 887 stove. Its two front supports
// and front edge cover the flame; all three PNGs retain their native ratios.
const stoveFront = `M0 520 L348 520
  C344 452 354 389 383 352 C415 307 488 282 592 261
  C635 246 670 260 683 285 C699 320 676 350 648 369
  C616 392 556 411 540 443 C527 467 520 490 520 520
  L1270 520 C1259 484 1248 452 1225 432
  C1197 413 1163 405 1128 380 C1084 348 1077 312 1097 282
  C1111 254 1133 248 1173 255 C1270 273 1363 304 1398 357
  C1425 400 1431 461 1430 520 H1774 V887 H0Z`;
const stoveTransform = `translate(0 139) scale(${302 / 1774})`;
const basketWidth = 216;
const basketHeight = basketWidth * 1230 / 1278;

export default function ClosedSteamerArtwork({ className = '', style }) {
  const id = useId();
  const base = import.meta.env.BASE_URL;

  return <svg className={`sprite steamer${className ? ` ${className}` : ''}`}
    style={style} data-testid="closed-steamer-hd"
    viewBox="0 0 302 290" preserveAspectRatio="xMidYMid meet"
    role="img" aria-label="蓋好的毛絨蒸籠，放在灰色毛絨爐子和火苗上">
    <defs>
      <clipPath id={`${id}-stove-back`} clipPathUnits="userSpaceOnUse">
        <path d={`M0 0H1774V887H0Z ${stoveFront}`} clipRule="evenodd" />
      </clipPath>
      <clipPath id={`${id}-stove-front`} clipPathUnits="userSpaceOnUse">
        <path d={stoveFront} />
      </clipPath>
    </defs>
    {/* Split the same untouched stove PNG around the flame, without retaining
        any pixels or dependency from the former flattened steamer/stove asset. */}
    <g transform={stoveTransform}>
      <image href={`${base}assets/stove-hd.png`} width="1774" height="887"
        preserveAspectRatio="xMidYMid meet" clipPath={`url(#${id}-stove-back)`} />
    </g>
    <image href={`${base}assets/flame-hd.png`} x="53" y="132" width="196" height="98"
      preserveAspectRatio="xMidYMid meet" />
    <g transform={stoveTransform}>
      <image href={`${base}assets/stove-hd.png`} width="1774" height="887"
        preserveAspectRatio="xMidYMid meet" clipPath={`url(#${id}-stove-front)`} />
    </g>
    <image href={`${base}assets/steamer-closed-hd.png`}
      x="43" y="0" width={basketWidth} height={basketHeight}
      preserveAspectRatio="xMidYMid meet" />
  </svg>;
}
