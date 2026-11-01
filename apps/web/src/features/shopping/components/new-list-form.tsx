import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { errorMessage } from "@/lib/api-client.ts";

import { createList } from "../shopping.api.ts";
import { shoppingKeys } from "../shopping.queries.ts";
import { AddRow } from "@/components/add-row.tsx";

/** Creates a list and opens it */
export function NewListForm({ onCreated }: { onCreated?: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function create(name: string) {
    setCreating(true);
    setError(null);
    try {
      const list = await createList(name);
      queryClient.setQueryData(shoppingKeys.list(list.id), list);
      void queryClient.invalidateQueries({ queryKey: shoppingKeys.lists() });
      onCreated?.();
      await navigate({ to: "/lists/$listId", params: { listId: list.id } });
      return true;
    } catch (err) {
      setError(errorMessage(err, "Couldn't create the list. Try again."));
      return false;
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <AddRow label="New list" maxLength={60} pending={creating} onAdd={create} />
      {error && (
        <p role="alert" className="px-4 pb-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
