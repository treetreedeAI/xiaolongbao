import { useId } from 'react';

// Display the supplied PNG unchanged. SVG clips provide foreground occlusion
// for the existing small bun bounce without regenerating or editing its pixels.
const top = `M306 426
  C307 372 320 315 353 269
  C409 200 497 149 568 116
  C562 99 564 61 588 39
  C611 19 646 18 677 34
  C695 33 720 35 743 48
  C761 60 766 89 762 112
  C837 138 899 177 946 224
  C991 270 1018 346 1020 426`;
const bunPath = `${top} L1020 455
  C946 500 831 514 667 514 C505 514 381 492 306 455 Z`;
const foregroundHole = `${top}
  C946 467 828 480 667 480 C508 480 382 466 306 426 Z`;

export default function FinishedArtwork() {
  const id = useId();
  const src = `${import.meta.env.BASE_URL}assets/finished-hd.png`;
  return <svg className="sprite steamer" data-testid="finished-hd"
    viewBox="0 0 1356 1159" preserveAspectRatio="xMidYMid meet"
    role="img" aria-label="微笑的小籠包蒸好了，蒸籠保留校徽，兩旁冒出蒸汽">
    <defs>
      <clipPath id={`${id}-bun`}><path d={bunPath} /></clipPath>
      <clipPath id={`${id}-base`}><path d={`M0 0H1356V1159H0Z ${foregroundHole}`} clipRule="evenodd" /></clipPath>
    </defs>
    {/* Seven native SVG units keep movement within the supplied visible fur. */}
    <g className="finished-art"><image href={src} width="1356" height="1159" clipPath={`url(#${id}-bun)`} /></g>
    <image href={src} width="1356" height="1159" clipPath={`url(#${id}-base)`} />
  </svg>;
}
