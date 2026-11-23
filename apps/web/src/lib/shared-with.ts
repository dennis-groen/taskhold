export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Minimal person identity carried in rows and offline changes */
export type PersonSummary = { id: string; name: string };

/** A housemate as the "Shared with" line shows them */
export type Housemate = PersonSummary & { image: string | null };

/** Everyone except the viewer, in the order given */
export function otherHousemates(people: Housemate[], viewerId: string): Housemate[] {
  return people
    .filter((person) => person.id !== viewerId)
    .map(({ id, name, image }) => ({ id, name, image }));
}

/** "Noor", "Noor and Alex", "Noor, Alex and Jules", "Noor, Alex and 3 others" */
export function namesList(names: string[]): string {
  // Past three names the line stops being readable at a glance
  if (names.length > 3) return `${names.slice(0, 2).join(", ")} and ${names.length - 2} others`;
  return new Intl.ListFormat("en-GB", { type: "conjunction" }).format(names);
}

/** "Shared with Sam" / "Shared with Sam and Bo" / "Just you so far", for headings of shared things */
export function sharedWith(otherNames: string[]): string {
  if (otherNames.length === 0) return "Just you so far";
  return `Shared with ${namesList(otherNames)}`;
}
