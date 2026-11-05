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
        "size-[2.125rem] text-lg font-semibold min-[360px]:size-9 min-[400px]:size-10 sm:size-12 sm:text-xl",
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
    >
      <InputOTPGroup>{[0, 1, 2, 3].map(slot)}</InputOTPGroup>
      <InputOTPSeparator className="text-muted-foreground" />
      <InputOTPGroup>{[4, 5, 6, 7].map(slot)}</InputOTPGroup>
    </InputOTP>
  );
}
