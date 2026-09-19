/**
 * The numeral face — the one place in the child's interface where typography does real work.
 *
 * Everything else he sees is cover art. The number line in §4.2 is 64px numerals a four-year-old
 * is learning to read, so the face is chosen against that job and nothing else. Archivo carries
 * the wordmark and the parent's surfaces; it does not have to carry this too.
 *
 * Pure data, like the themes. All three faces are **self-hosted** — see
 * `public/fonts/fonts.css`. They used to come from Google Fonts, which worked everywhere except
 * the kiosk, which has no WAN and would have quietly rendered this in a system font.
 */
export interface NumeralFace {
  id: string;
  /** Parent-facing. Never shown to the child. */
  label: string;
  /** Full CSS stack, ending in a generic so a missing font degrades rather than disappears. */
  stack: string;
  /** The family spec the self-hosted woff2 files were generated from. See public/fonts/. */
  googleFamily: string;
  /** The weight the number line renders at. Not every face ships 800. */
  weight: number;
  /** Why this one is a candidate. Shown to the parent in settings. */
  note: string;
}

export const NUMERAL_FACES: readonly NumeralFace[] = [
  {
    id: "archivo",
    label: "Archivo",
    stack: "Archivo, 'Helvetica Neue', Arial, sans-serif",
    googleFamily: "Archivo:wght@400;600;800",
    weight: 800,
    // The incumbent, and it arrived with the first prototype rather than being argued for. Its
    // numerals are condensed — a display virtue that costs legibility in a column — and its `1`
    // is a bare stem noticeably lighter than every other digit, which in a number line is the
    // first numeral he meets reading as a divider.
    note: "Incumbent. Condensed; its 1 is lighter than the other digits.",
  },
  {
    id: "andika",
    label: "Andika",
    stack: "Andika, Archivo, sans-serif",
    googleFamily: "Andika:wght@400;700",
    weight: 700,
    note: "SIL, drawn for beginning readers. Widest and evenest digits of the three.",
  },
  {
    id: "lexend",
    label: "Lexend",
    stack: "Lexend, Archivo, sans-serif",
    googleFamily: "Lexend:wght@400;600;800",
    weight: 800,
    note: "Drawn against reading-proficiency research. Geometric, very open.",
  },
];

/**
 * Still the incumbent, deliberately. The comparison exists so the parent can decide by putting
 * it in front of the child; changing the default before that would be deciding for him.
 */
export const DEFAULT_NUMERAL_FACE = "archivo";

export function numeralFace(id: string | null | undefined): NumeralFace {
  return NUMERAL_FACES.find((f) => f.id === id)
    ?? NUMERAL_FACES.find((f) => f.id === DEFAULT_NUMERAL_FACE)!;
}

/** CSS custom properties for a face. */
export function numeralVars(f: NumeralFace): Record<string, string> {
  return { "--numeral-font": f.stack, "--numeral-weight": String(f.weight) };
}
