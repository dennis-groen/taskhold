import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { BackLink } from "@/components/back-link.tsx";
import { PageHeading } from "@/components/layout/page-heading.tsx";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api-client.ts";

import { createHousehold } from "../households.api.ts";

const routeApi = getRouteApi("/onboarding/create");

export function CreateHouseholdPage() {
  const { user } = routeApi.useRouteContext();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const lastName = user.name.trim().split(/\s+/).at(-1);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Give your household a name.");
      return;
    }

    setCreating(true);
    setError(null);
    try {
      await createHousehold(name);
      await navigate({ to: "/invite", search: { created: true } });
    } catch (err) {
      setError(errorMessage(err, "Couldn't create the household. Try again."));
      setCreating(false);
    }
  }

  return (
    <>
      <BackLink to="/onboarding" />
      <PageHeading title="Name your household">Everyone who joins sees this name.</PageHeading>

      <form onSubmit={(event) => void submit(event)} noValidate className="mt-8">
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor="household-name">Household name</FieldLabel>
          <Input
            id="household-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            placeholder={lastName ? `${lastName} household` : "Our household"}
            maxLength={60}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            className="h-12 rounded-xl px-4 text-base md:text-base"
          />
          {error ? (
            <FieldError>{error}</FieldError>
          ) : (
            <FieldDescription>A family name or your street works well.</FieldDescription>
          )}
        </Field>

        <Button type="submit" size="lg" disabled={creating} className="mt-6">
          {creating && <Spinner />}
          Create household
        </Button>
      </form>
    </>
  );
}
