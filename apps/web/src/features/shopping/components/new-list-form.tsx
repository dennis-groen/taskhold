import { PlusIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api-client.ts";

import { createList } from "../shopping.api.ts";
import { shoppingKeys } from "../shopping.queries.ts";

/** Creates a list and opens it */
export function NewListForm({ suggestion }: { suggestion?: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Give the list a name.");
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const list = await createList(name);
      queryClient.setQueryData(shoppingKeys.list(list.id), list);
      await queryClient.invalidateQueries({ queryKey: shoppingKeys.lists() });
      await navigate({ to: "/lists/$listId", params: { listId: list.id } });
    } catch (err) {
      setError(errorMessage(err, "Couldn't create the list. Try again."));
      setCreating(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <div className="flex gap-2">
        <Input
          aria-label="New list name"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "new-list-error" : undefined}
          placeholder={suggestion ?? "New list"}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          maxLength={60}
          autoComplete="off"
          className="h-11 min-w-0 flex-1 px-3 text-base md:text-base"
        />
        <Button
          type="submit"
          size="lg"
          variant="outline"
          disabled={creating}
          className="h-11 shrink-0 px-4"
        >
          {creating ? <Spinner /> : <PlusIcon />}
          Add list
        </Button>
      </div>
      {error && (
        <p id="new-list-error" role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
