import { CaretRightIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { Group } from "@/components/layout/group.tsx";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

/**
 * A card that starts closed behind a "Label (count)" toggle, for things that are finished with
 * (the cart, done to-dos). `action` sits on the right of the toggle, for clearing them out.
 */
export function CollapsibleGroup({
  label,
  count,
  action,
  children,
}: {
  label: string;
  count: number;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <Collapsible render={<section aria-label={label} />} className="mt-6">
      <div className="flex items-center justify-between gap-2">
        <CollapsibleTrigger
          render={
            <Button variant="ghost" className="group -ml-2 h-11 px-2 text-muted-foreground" />
          }
        >
          <CaretRightIcon className="transition-transform group-data-[panel-open]:rotate-90 motion-reduce:transition-none" />
          {label} ({count})
        </CollapsibleTrigger>
        {action}
      </div>
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-[ending-style]:h-0 data-[starting-style]:h-0 motion-reduce:transition-none">
        {/* Room for the card's ring, which the panel would otherwise clip while it opens */}
        <div className="px-px pt-2 pb-px">
          <Group>{children}</Group>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
