import {
  CheckCircleIcon,
  InfoIcon,
  SpinnerIcon,
  WarningIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import { useTheme } from "@/lib/theme.ts";

// The app's popover colors, in Sonner's own variables
const COLORS: CSSProperties & Record<`--${string}`, string> = {
  "--normal-bg": "var(--popover)",
  "--normal-text": "var(--popover-foreground)",
  "--normal-border": "var(--border)",
  "--border-radius": "var(--radius)",
};

// shadcn's Sonner wrapper, reading the theme from the app's ThemeProvider instead of next-themes
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CheckCircleIcon weight="fill" className="size-5" />,
        info: <InfoIcon weight="fill" className="size-5" />,
        warning: <WarningIcon weight="fill" className="size-5" />,
        error: <XCircleIcon weight="fill" className="size-5" />,
        loading: <SpinnerIcon className="size-5 animate-spin" />,
      }}
      style={COLORS}
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
