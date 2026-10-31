import { Link } from "@tanstack/react-router";

import { PageHeading } from "@/components/layout/page-heading.tsx";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** For a list someone deleted, or a link to a list from another household */
export function ListNotFound() {
  return (
    <>
      <PageHeading title="This list isn't here anymore">
        Someone in your household may have deleted it.
      </PageHeading>
      <Link to="/lists" className={cn(buttonVariants({ size: "lg" }), "mt-8 h-11 px-5")}>
        Back to your lists
      </Link>
    </>
  );
}
