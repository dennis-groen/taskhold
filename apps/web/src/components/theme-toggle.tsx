import { MoonIcon, SunIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { useTheme, type Theme } from "@/lib/theme.ts";

const OPTIONS: { theme: Theme; label: string; icon: typeof SunIcon }[] = [
  { theme: "light", label: "Light", icon: SunIcon },
  { theme: "dark", label: "Dark", icon: MoonIcon },
];

/** Light or dark. Shows the system's theme as selected until the person picks one. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <fieldset className="flex gap-2">
      <legend className="sr-only">Theme</legend>
      {OPTIONS.map(({ theme: option, label, icon: IconComponent }) => (
        <Button
          key={option}
          type="button"
          variant={theme === option ? "default" : "outline"}
          aria-pressed={theme === option}
          onClick={() => setTheme(option)}
          className="h-10 flex-1 rounded-full px-4"
        >
          <IconComponent weight={theme === option ? "fill" : "regular"} />
          {label}
        </Button>
      ))}
    </fieldset>
  );
}
