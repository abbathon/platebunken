// Procedural cover art, so this runs offline and ships nobody else's artwork.
// Real covers come from Music Assistant's imageproxy at the exact tile size.
import type { Album } from "./store";

const ink = (h: number, l: number, s = 70) => `hsl(${h} ${s}% ${l}%)`;

/** Ten composition families. Each must be recognisable at 120px and at 900px. */
function mark(i: number, h: number): string {
  const fg = ink(h, 62, 85);
  const dim = ink(h, 30, 45);
  const pale = ink((h + 40) % 360, 84, 60);
  switch (i % 10) {
    case 0: // concentric rings
      return [40, 30, 20, 10].map((r, k) =>
        `<circle cx="50" cy="46" r="${r}" fill="none" stroke="${k % 2 ? dim : fg}" stroke-width="4"/>`).join("");
    case 1: // vertical bars
      return [12, 26, 40, 54, 68, 82].map((x, k) =>
        `<rect x="${x}" y="${14 + (k % 3) * 8}" width="8" height="${64 - (k % 3) * 14}" fill="${k % 2 ? fg : pale}"/>`).join("");
    case 2: // monolith
      return `<rect x="34" y="10" width="32" height="70" fill="${fg}"/><rect x="42" y="22" width="16" height="46" fill="${dim}"/>`;
    case 3: // triangle stack
      return `<path d="M50 8 L86 76 L14 76Z" fill="${fg}"/><path d="M50 34 L70 76 L30 76Z" fill="${dim}"/>`;
    case 4: // grid of squares
      return Array.from({ length: 9 }, (_, k) =>
        `<rect x="${18 + (k % 3) * 24}" y="${14 + Math.floor(k / 3) * 24}" width="18" height="18" fill="${k % 4 ? fg : pale}"/>`).join("");
    case 5: // arc / sunrise
      return `<path d="M10 74 A40 40 0 0 1 90 74Z" fill="${fg}"/><path d="M26 74 A24 24 0 0 1 74 74Z" fill="${dim}"/>`;
    case 6: // cross
      return `<rect x="42" y="8" width="16" height="72" fill="${fg}"/><rect x="20" y="30" width="60" height="16" fill="${fg}"/>`;
    case 7: // wave
      return `<path d="M6 60 Q28 24 50 60 T94 60" fill="none" stroke="${fg}" stroke-width="7"/>` +
             `<path d="M6 74 Q28 38 50 74 T94 74" fill="none" stroke="${dim}" stroke-width="7"/>`;
    case 8: // eye
      return `<path d="M8 46 Q50 6 92 46 Q50 86 8 46Z" fill="${dim}"/><circle cx="50" cy="46" r="17" fill="${fg}"/>`;
    default: // shards
      return `<path d="M20 78 L38 10 L50 50 L62 14 L80 78Z" fill="${fg}"/>`;
  }
}

/** Procedural cover, used only when Music Assistant has no artwork for the album. */
export function coverSvg(album: Album): string {
  const h = album.hue;
  const bg1 = ink(h, 11, 30);
  const bg2 = ink((h + 25) % 360, 6, 35);
  const label = ink(h, 92, 30);
  return `
<svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img"
     aria-label="${album.artist} — ${album.title}">
  <defs>
    <linearGradient id="bg-${album.id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" fill="url(#bg-${album.id})"/>
  <g transform="translate(0,-4)">${mark(album.mark, h)}</g>
  <rect x="0" y="86" width="100" height="14" fill="${ink(h, 8, 40)}"/>
  <text x="6" y="95.2" fill="${label}" font-family="Archivo, sans-serif"
        font-size="7" font-weight="800" letter-spacing="-0.3"
        textLength="88" lengthAdjust="spacingAndGlyphs">${esc(album.artist.toUpperCase())}</text>
</svg>`.trim();
}

function esc(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}
