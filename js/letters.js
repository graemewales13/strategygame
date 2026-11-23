// Letter cards on a small screen (T34): only one letter stands open at a time, the rest are one-line rows.
// Pure, so the rules tests can read it: which letter is open, given the player's letters and the one he clicked open.
// The one he chose stays open while it lasts; otherwise the newest (the highest id) is open.
export function openLetter(letters, chosen) {
  if (!letters.length) return null;
  if (chosen != null && letters.some((o) => o.id === chosen)) return chosen;
  return letters.reduce((a, o) => (o.id > a.id ? o : a)).id;
}
// a letter's kind in one word, for its card's head and its one-line row
export function letterKind(o) {
  const kind = o.kind || 'treaty';
  return { treaty: o.state === 'alliance' ? 'Alliance' : o.state === 'trade' ? 'Trade treaty' : 'Peace', joinwar: 'Call to arms', tribute: 'Demand', aid: 'Plea for aid' }[kind] || 'Letter';
}
