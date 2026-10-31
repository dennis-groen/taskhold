export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** First names of everyone except the viewer, in the order given */
export function otherFirstNames(
  people: { id: string; name: string }[],
  viewerId: string,
): string[] {
  return people.filter((person) => person.id !== viewerId).map((person) => firstName(person.name));
}

/** "Shared with Sam" / "Shared with Sam and Bo" / "Just you so far", for headings of shared things */
export function sharedWith(otherNames: string[]): string {
  if (otherNames.length === 0) return "Just you so far";
  const names = new Intl.ListFormat("en", { type: "conjunction" }).format(otherNames);
  return `Shared with ${names}`;
}
