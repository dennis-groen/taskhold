import { CircleHalfIcon, MoonIcon, SunIcon } from "@/components/icons.ts";
import { Button } from "@/components/ui/button";
import { useTheme, type ThemeChoice } from "@/lib/theme.ts";

const OPTIONS: { choice: ThemeChoice; label: string; icon: typeof SunIcon }[] = [
  { choice: "light", label: "Light", icon: SunIcon },
  { choice: "dark", label: "Dark", icon: MoonIcon },
  { choice: "system", label: "Auto", icon: CircleHalfIcon },
];

/** Light, dark, or Auto: follow the device's setting, which is where everyone starts */
export function ThemeToggle() {
  const { choice, setChoice } = useTheme();

  return (
    <fieldset className="flex gap-1">
      <legend className="sr-only">Theme</legend>
      {OPTIONS.map(({ choice: option, label, icon: IconComponent }) => (
        <Button
          key={option}
          type="button"
          variant="ghost"
          size="lg"
          aria-pressed={choice === option}
          onClick={() => setChoice(option)}
          className="flex-1 rounded-[0.625rem] px-2 text-muted-foreground aria-pressed:bg-primary-soft aria-pressed:text-primary-soft-foreground"
        >
          <IconComponent weight={choice === option ? "fill" : "regular"} />
          {label}
        </Button>
      ))}
    </fieldset>
  );
}
