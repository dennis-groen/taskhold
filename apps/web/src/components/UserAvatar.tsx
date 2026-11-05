import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** One of six calm tones (globals.css, --tone-*), the same for a name on every device */
function toneFor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) | 0;
  return (Math.abs(hash) % 6) + 1;
}

export function UserAvatar({
  name,
  image,
  size,
}: {
  name: string;
  image: string | null;
  size?: "default" | "sm" | "lg";
}) {
  return (
    <Avatar size={size} data-tone={toneFor(name)}>
      {/* Decorative: the name is always shown next to it */}
      {image && <AvatarImage src={image} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
