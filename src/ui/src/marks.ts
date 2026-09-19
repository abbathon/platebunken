/**
 * The mark beside a track he keeps choosing.
 *
 * Drawn, one weight, never a glyph or an emoji — the same rule as every other icon here. Each
 * one has to survive being ~22 px tall beside a 64 px numeral, which rules out anything with
 * interior detail: at that size a busy shape is a smudge, and a smudge beside a number he is
 * learning to read is worse than no mark at all.
 *
 * Two of these are taken already and must not be reused:
 *   ★ star  = the *new* shelf
 *   ♥ heart = the *most-played* shelf
 * The heart is the one exception worth making, because on the rail it ALREADY means "the ones
 * he plays most" — so a heart on a track and a heart on the shelf are saying the same thing,
 * which is coherence rather than collision. The star is not: it means *new*, and a star on an
 * old favourite would be a straight contradiction.
 *
 * A longship is taken too — it is the *vikingtid* theme's emblem — so the Norse set below is
 * helmet, shield, sword and hammer, and deliberately not a ship.
 *
 * Two Norse marks were tried and dropped. A **valknut** needs more pixels than this row has;
 * three interlocked triangles collapse into a smudge that could be anything. An **axe** was
 * attempted four times and reads as a flag on a pole every time — at this size a thin haft
 * beside a broad blade IS a pennant, and the shape that would fix it, a symmetric double-bit,
 * is the same species of error as putting horns on the helmet. Better to drop it than to ship
 * a mark that says the wrong word.
 *
 * No runes either, tempting as they are. This row sits beside numerals a four-year-old is
 * learning to read, and a letterform is exactly the wrong thing to put next to a digit he is
 * still working out.
 */
export type MarkId =
  | "bar" | "heart" | "pentagram" | "sigil" | "bolt" | "flame" | "pick" | "skull" | "dot"
  | "helmet" | "shield" | "sword" | "hammer";

export interface Mark {
  id: MarkId;
  /** Parent-facing, in the settings screen. The child never reads a label. */
  label: [nb: string, en: string];
  /** null = no glyph: the solid bar, drawn in CSS. The quietest option there is. */
  svg: string | null;
  /** Why it is on the list, for whoever picks. */
  note: [nb: string, en: string];
}

const s = (body: string, stroke = 0) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"${
    stroke ? ` fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linejoin="round"` : ""
  }>${body}</svg>`;

export const MARKS: readonly Mark[] = [
  {
    id: "bar",
    label: ["Strek", "Bar"],
    svg: null,
    note: ["Ingen figur. Samme språk som sporet som spilles nå.",
           "No glyph. The same language as the now-playing mark."],
  },
  {
    id: "heart",
    label: ["Hjerte", "Heart"],
    // The same path as the most-played shelf mark, deliberately.
    svg: s(`<path d="M12 21S3.5 15.4 3.5 9.6A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8.5 2.6C20.5 15.4 12 21 12 21Z"/>`),
    note: ["Betyr allerede «mest spilt» på hylla til høyre.",
           "Already means 'most played' on the right rail."],
  },
  {
    id: "pentagram",
    // Point DOWN. Five vertices on a circle of radius 9 about (12,12), starting at the bottom
    // and joining every second one: 90° → 234° → 18° → 162° → 306°.
    label: ["Pentagram", "Pentagram"],
    // 1.7, not 2: at the size this renders, a heavier stroke makes the five points meet and
    // the star fills into a blob. Drawn to r=9.6 for the same reason — more room between the
    // strokes rather than a bigger mark.
    svg: s(`<path d="M12 21.6 6.35 4.25 21.13 15.02 2.87 15.02 17.65 4.25Z"/>`, 1.7),
    note: ["Omvendt, som seg hør og bør. Åpen strek, leses best stor.",
           "Inverted, as it should be. Open stroke; needs the size."],
  },
  {
    id: "sigil",
    label: ["Pentagram i sirkel", "Pentagram in a circle"],
    svg: s(
      `<circle cx="12" cy="12" r="10.4"/>` +
      `<path d="M12 20.6 7.06 5.4 19.99 14.8 4.01 14.8 16.94 5.4Z"/>`,
      1.5,
    ),
    note: ["Hele seglet. Mest detalj — sjekk at det ikke gror igjen.",
           "The full sigil. The most detail — check it does not fill in."],
  },
  {
    id: "bolt",
    label: ["Lyn", "Lightning"],
    svg: s(`<path d="M13.8 2 5 13.8h5.4L9.2 22 19 10.2h-5.6z"/>`),
    note: ["Leses umiddelbart, også lite. Ingen kollisjon.",
           "Reads instantly, even small. Collides with nothing."],
  },
  {
    id: "flame",
    label: ["Flamme", "Flame"],
    svg: s(`<path d="M12 2.2c2.6 3.6 5.1 5.7 5.1 9.7a5.1 5.1 0 0 1-10.2 0c0-1.9.8-3.1 1.9-4.3.2 1.2.9 2 1.7 2.3C11.9 8.1 11 5.4 12 2.2Z"/>`),
    note: ["Én silhuett, ingen innvendig detalj.", "One silhouette, no interior detail."],
  },
  {
    id: "pick",
    label: ["Plekter", "Guitar pick"],
    // Wider and flatter across the top than the first attempt, which tapered too early and
    // read as a lightbulb rather than a pick.
    svg: s(`<path d="M12 3.4c4.1 0 7.3 2 7.3 4.7 0 3.5-4 8.6-5.7 10.9a2 2 0 0 1-3.2 0C8.7 16.7 4.7 11.6 4.7 8.1c0-2.7 3.2-4.7 7.3-4.7Z"/>`),
    note: ["Enkel form, holder seg lita. Ingenting annet bruker den.",
           "Simple, holds up small. Nothing else uses it."],
  },
  {
    id: "skull",
    label: ["Hodeskalle", "Skull"],
    svg: s(`<path fill-rule="evenodd" d="M12 2C7.6 2 4 5.5 4 9.8c0 2.3 1.1 4.3 2.9 5.7V19a1 1 0 0 0 1 1h8.2a1 1 0 0 0 1-1v-3.5c1.8-1.4 2.9-3.4 2.9-5.7C20 5.5 16.4 2 12 2Zm-3.3 9.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm6.6 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z"/>`),
    note: ["Mest karakter, mest detalj. Øyehulene er det som ryker først.",
           "The most character and the most detail; the eye sockets go first."],
  },
  {
    id: "helmet",
    label: ["Hjelm", "Helmet"],
    // A spangenhelm with a nose guard — not horned. Horns are a 19th-century opera invention,
    // and more to the point two horns and a dome is three shapes fighting for the same 30 px.
    // The nose guard does the work: it is what makes the silhouette read as a helmet at all.
    // A spectacle helmet: dome, straight sides, and two eye openings PUNCHED OUT, with the
    // nose guard being the metal left between them. Two earlier attempts hung a nose guard off
    // the bottom of a dome and both read as a mushroom — a cap on a stem is a mushroom
    // whatever you intended. The eye holes are what make it a face, and a face is a helmet.
    svg: s(`<path fill-rule="evenodd" d="M12 2.4c-4.8 0-8.7 3.7-8.7 8.2V20h17.4v-9.4c0-4.5-3.9-8.2-8.7-8.2ZM6.9 12.8h3.2v4.6H6.9Zm7 0h3.2v4.6h-3.2Z"/>`),
    note: ["Nesebeskytteren er det som gjør den lesbar. Ingen horn.",
           "The nose guard is what makes it readable. No horns."],
  },
  {
    id: "shield",
    label: ["Skjold", "Shield"],
    // Round shield: rim, cross division, and a filled boss at the centre. The boss is what
    // stops it reading as a plain circle, which is the dot.
    svg: s(
      `<circle cx="12" cy="12" r="9.2"/>` +
      `<path d="M12 2.8v18.4M2.8 12h18.4"/>` +
      `<circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/>`,
      1.7,
    ),
    note: ["Bulen i midten skiller den fra prikken.",
           "The centre boss is what separates it from the dot."],
  },
  {
    id: "sword",
    label: ["Sverd", "Sword"],
    // Point up, cruciform hilt, round pommel. Point up reads as a mark; point down reads as a
    // dagger about to land on the track below it.
    svg: s(
      `<path d="M12 1.5 10.2 5.2v9.1h3.6V5.2Z"/>` +
      `<path d="M6.8 15.1h10.4v1.9H6.8zM11.1 18h1.8v2h-1.8z"/>` +
      `<circle cx="12" cy="21.3" r="1.7"/>`,
    ),
    note: ["Spissen opp. Ned leser den som en dolk over sporet under.",
           "Point up. Point down reads as a dagger over the track below."],
  },
  {
    id: "hammer",
    label: ["Mjølne", "Mjölnir"],
    // Thor's hammer as the pendant is actually worn: wide head at the top, tapering to a
    // point. Chunky, so it survives the size better than anything else in the Norse set.
    svg: s(`<path d="M5.4 2.4h13.2v6H14v7.4h2.9L12 22.4 7.1 15.8H10V8.4H5.4Z"/>`),
    note: ["Tyngst av de norrøne — tåler liten størrelse best.",
           "The chunkiest of the Norse set — survives small sizes best."],
  },
  {
    id: "dot",
    label: ["Prikk", "Dot"],
    svg: s(`<circle cx="12" cy="12" r="4.4"/>`),
    note: ["Så stille det går an å bli uten å forsvinne.",
           "As quiet as it gets without disappearing."],
  },
];

export const markById = (id: string): Mark => MARKS.find((m) => m.id === id) ?? MARKS[1]!;

/** The mark's markup, or "" for the bar — CSS draws that one on the row itself. */
export const markSvg = (id: string): string => markById(id).svg ?? "";
