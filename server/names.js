// Usernames (ONLINE.md section 6): 3 to 16 letters, digits, _ or -, unique whatever the capitals, and nothing offensive or official-sounding.
// Usernames are the only words players choose that others see, so they are checked here; a Report button lets the owner rename the rest.
// The lists are deliberately short and easy to extend. A name is compared after undoing common disguises (0 for o, 1 for i, 3 for e ...).

// blocked anywhere in a name: long enough that an innocent word never contains them
const ANYWHERE = ['fuck', 'shit', 'cunt', 'nigger', 'nigga', 'faggot', 'retard', 'rapist', 'hitler', 'wanker', 'bollock', 'bitch', 'whore', 'slut',
  'paedo', 'molest', 'porn', 'dildo', 'penis', 'vagina', 'pussy', 'tranny', 'kike', 'chink', 'spastic', 'twat'];
// innocent words and places that contain one of those, taken out before looking (Scunthorpe, Hancock ...)
const SAFE = ['scunthorpe', 'hancock', 'peacock', 'cockburn', 'woodcock', 'shitake', 'shiitake', 'cocktail'];
// blocked as the whole name or one part of it (split at _ or -): short words that innocent words contain, and names that pose as staff
const WHOLE = ['ass', 'arse', 'fag', 'tit', 'tits', 'cum', 'sex', 'rape', 'kkk', 'jew', 'gay', 'spaz', 'cock', 'wank', 'pedo', 'nazi', 'nazis', 'admin', 'administrator', 'mod', 'moderator', 'system',
  'staff', 'support', 'official', 'owner', 'auld', 'auldworld', 'root', 'server', 'null', 'undefined', 'anonymous', 'fallen'];

const UNLEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g', '@': 'a', '$': 's', '!': 'i' };
const plain = (s) => s.toLowerCase().replace(/[01345789@$!]/g, (c) => UNLEET[c] ?? c);

// null if the name may be used, else the reason it may not (said to the player)
export function nameProblem(name) {
  if (typeof name !== 'string') return 'Choose a name.';
  if (!/^[A-Za-z0-9_-]{3,16}$/.test(name)) return 'Use 3 to 16 letters, digits, _ or -.';
  if (!/[A-Za-z]/.test(name)) return 'Use at least one letter.';
  if (/^[_-]|[_-]$|[_-]{2}/.test(name)) return 'Start and end with a letter or digit, with no _ or - side by side.';
  const p = plain(name), parts = p.split(/[_-]/), joined = parts.join('');
  const looked = SAFE.reduce((t, w) => t.split(w).join('~'), joined);   // (a safe word cannot hide a bad one: it becomes a gap)
  if (ANYWHERE.some((w) => looked.includes(w))) return 'That name is not allowed.';
  if (WHOLE.some((w) => joined === w || parts.includes(w))) return 'That name is not allowed.';
  return null;
}
