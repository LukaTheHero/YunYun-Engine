# YunYun appearance pack

The one appearance pack YunYun Engine ships (`basic` in `src/lib/mari-work-animations.ts`). It replaces
upstream's original assistant pixel packs, which the fork does not ship.

Every file was made from the fork's own art, `../chibi-yunyun.png` and `../yunyun-profile.png`, and keeps
the exact size and frame layout of the upstream file it replaces, so the existing CSS sheet animations
(`background-size: 400% 100%` and `600% 100%`) line up:

- Stories (`thinking.webp` … `idle.webp`): 512 × 192, four 128 × 192 frames of the chibi.
- Portraits: `portrait-idle`, `-blink`, `-hover` 299 × 450 and `portrait-shrug` 300 × 450, one chibi each;
  `portrait-drag.webp` 1200 × 450, four 300 × 450 frames.
- `pull-heads.webp`: 576 × 96, six 96 × 96 copies of the profile portrait.
- Poses: the chibi fitted to each upstream pose box; `pose-profile.webp` is the profile portrait at 128 × 128.

The chibi is bottom-centered in each frame with transparent padding, then saved as WebP at quality 88.
The art is static, so the animated slots hold still. Replace any file with real animation frames of the
same size to animate it, and bump `MARI_SPRITE_VERSION` so the service worker refetches it.
