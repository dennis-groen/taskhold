import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toneFor } from "@/lib/member-tone.ts";

/** One letter reads at 24px; two letters at that size don't */
function initial(name: string) {
  return (name.trim()[0] ?? "?").toUpperCase();
}

export function UserAvatar({
  name,
  image,
  size,
  className,
}: {
  name: string;
  image: string | null;
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  return (
    <Avatar size={size} data-tone={toneFor(name)} className={className}>
      {/* Decorative: the name is always shown or read next to it */}
      {image && <AvatarImage src={image} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback className="text-xs font-[750] group-data-[size=lg]/avatar:text-base group-data-[size=sm]/avatar:text-xs">
        {initial(name)}
      </AvatarFallback>
    </Avatar>
  );
}
