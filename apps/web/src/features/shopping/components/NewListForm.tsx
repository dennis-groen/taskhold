import { useNavigate } from "@tanstack/react-router";

import { AddRow } from "@/components/AddRow.tsx";

import { useManageLists } from "../shopping.hooks.ts";

/** Creates a list and opens it, straight away and without a connection too */
export function NewListForm({ onCreated }: { onCreated?: () => void }) {
  const navigate = useNavigate();
  const { create } = useManageLists();

  async function add(name: string) {
    const listId = create(name);
    onCreated?.();
    await navigate({ to: "/lists/$listId", params: { listId } });
    return true;
  }

  return <AddRow label="New list" maxLength={60} onAdd={add} />;
}
