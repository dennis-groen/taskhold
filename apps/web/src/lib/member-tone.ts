/** One of six housemate colours (globals.css, --member-*), the same for a name on every device */
export function toneFor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) | 0;
  return (Math.abs(hash) % 6) + 1;
}
