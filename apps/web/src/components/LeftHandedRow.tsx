import { useId } from "react";

import { HandPointingIcon } from "@/components/icons.ts";
import { SettingRow } from "@/components/layout/SettingRow.tsx";
import { Switch } from "@/components/ui/switch";
import { useTickSide } from "@/lib/tick-side.ts";
import { cn } from "cn";

/**
 * "Left-handed layout": moves the round button in every row to the left edge, on this phone only.
 * A sample row under it shows the button moving, which says what the switch does faster than words.
 */
export function LeftHandedRow() {
  const [side, setSide] = useTickSide();
  const id = useId();
  const left = side === "left";
  return (
    <div>
      <SettingRow
        icon={HandPointingIcon}
        title="Left-handed layout"
        sub="Moves the round button to the left, for your left thumb. This phone only."
        htmlFor={id}
        end={
          <Switch
            id={id}
            checked={left}
            onCheckedChange={(checked) => setSide(checked ? "left" : "right")}
          />
        }
      />
      <SampleRow left={left} />
    </div>
  );
}

/**
 * A pretend shopping row, "Milk" and its button. The button slides to the other edge and the name
 * steps aside for it, so it reads as one thing moving rather than the row being redrawn.
 */
function SampleRow({ left }: { left: boolean }) {
  const move =
    "transition-[translate] duration-300 ease-(--ease-in-out) motion-reduce:transition-none";
  return (
    <div
      aria-hidden
      className="mr-4 mb-3 ml-[calc(1rem+2.5rem+0.875rem)] rounded-xl bg-muted px-3.5 py-2.5"
    >
      <div className="relative h-6 @container">
        <span
          className={cn(
            "absolute top-0 left-0 text-[0.9375rem] leading-6 font-[600]",
            move,
            left && "translate-x-9",
          )}
        >
          Milk
        </span>
        <span
          className={cn(
            "absolute top-0 right-0 size-6 rounded-full border-2 border-foreground/40",
            move,
            left && "-translate-x-[calc(100cqw-1.5rem)]",
          )}
        />
      </div>
    </div>
  );
}
