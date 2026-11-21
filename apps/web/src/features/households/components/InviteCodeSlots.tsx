import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { INVITE_CODE_LENGTH, INVITE_CODE_PATTERN, extractInviteCode } from "../invite-code.ts";
import { cn } from "cn";

/**
 * The invite code as eight slots, used both to show a code and to type one,
 * so what one person shares looks exactly like what the other fills in.
 */
export function InviteCodeSlots({
  id,
  value,
  onChange,
  readOnly,
  invalid,
  reveal,
}: {
  id: string;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  invalid?: boolean;
  /** Plays the slots in one by one, for a freshly created code */
  reveal?: boolean;
}) {
  const slot = (index: number) => (
    <InputOTPSlot
      key={index}
      index={index}
      aria-invalid={invalid || undefined}
      className={cn(
        // Eight separate cells, in the wide cut, so a code reads across a room
        "h-14 w-auto min-w-0 flex-1 rounded-[10px] border-2 border-transparent bg-muted text-[1.75rem] font-[800] tabular-nums [font-stretch:125%] first:rounded-l-[10px] first:border-l-2 last:rounded-r-[10px] dark:bg-muted sm:h-16",
        reveal &&
          "animate-in duration-500 ease-out fade-in fill-mode-both slide-in-from-bottom-2 motion-reduce:animate-none",
      )}
      style={reveal ? { animationDelay: `${150 + index * 70}ms` } : undefined}
    />
  );

  return (
    <InputOTP
      id={id}
      value={value}
      onChange={(next) => onChange?.(next.toUpperCase())}
      maxLength={INVITE_CODE_LENGTH}
      pattern={INVITE_CODE_PATTERN}
      pasteTransformer={extractInviteCode}
      readOnly={readOnly}
      inputMode="text"
      autoCapitalize="characters"
      autoComplete="off"
      containerClassName="flex w-full max-w-[26rem] items-center gap-1.5"
    >
      <InputOTPGroup className="flex-1 gap-1.5">{[0, 1, 2, 3].map(slot)}</InputOTPGroup>
      <InputOTPSeparator className="w-1.5 [&_svg]:hidden" />
      <InputOTPGroup className="flex-1 gap-1.5">{[4, 5, 6, 7].map(slot)}</InputOTPGroup>
    </InputOTP>
  );
}
