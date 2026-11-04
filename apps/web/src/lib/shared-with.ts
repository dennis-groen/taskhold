export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** A housemate as the "Shared with" line shows them */
export type Housemate = { id: string; name: string; image: string | null };

/** Everyone except the viewer, in the order given */
export function otherHousemates(people: Housemate[], viewerId: string): Housemate[] {
  return people
    .filter((person) => person.id !== viewerId)
    .map(({ id, name, image }) => ({ id, name, image }));
}

/** "Shared with Sam" / "Shared with Sam and Bo" / "Just you so far", for headings of shared things */
export function sharedWith(otherNames: string[]): string {
  if (otherNames.length === 0) return "Just you so far";
  // Past three names the line stops being readable at a glance
  if (otherNames.length > 3) {
    const rest = otherNames.length - 2;
    return `Shared with ${otherNames.slice(0, 2).join(", ")} and ${rest} others`;
  }
  const names = new Intl.ListFormat("en", { type: "conjunction" }).format(otherNames);
  return `Shared with ${names}`;
}
