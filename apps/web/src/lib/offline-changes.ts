// Changes: what people do to an area's data (tick an item, mark a chore done, delete a to-do).
// A change shows on screen straight away, waits for a connection when there isn't one, survives the
// app being closed, and is rolled back with a notice if the API turns it down. Features declare
// their changes here with defineChange; this module does the rest.
import {
  useQueryClient,
  type DataTag,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";

import { changeFailed, offerUndo } from "./feedback.ts";

/** A part of the app whose data is fetched, refetched and kept on the device as a whole */
export type Area = "shopping" | "chores" | "todos";

/**
 * A change marked `idempotent` does the same when the API gets it twice. Only those are saved
 * while their request is on its way, because nobody can tell whether a request the app was closed
 * during reached the server (see offline-cache.ts). Others are saved only while they wait for a
 * connection, when they certainly haven't been sent.
 */
export type ChangeMeta = { idempotent: boolean };

const DEFAULT_FAILURE = "Couldn't save that change. Check your connection and try again.";

/** What a feature says about one of its changes */
type ChangeSpec<Vars, Data, Response, UndoVars> = {
  /** Sending it twice does the same as once (see ChangeMeta). No default: both ways lose data. */
  idempotent: boolean;
  /** The API call. Everything it needs is in `vars`, which are saved with the change. */
  send: (vars: Vars) => Promise<Response>;
  /** The query the change shows in */
  target: (vars: Vars) => DataTag<QueryKey, Data, Error>;
  /**
   * What the target looks like after the change, shown straight away. Leave it out when only the
   * API knows (a due date it works out): the screen then follows `settle` once it's saved.
   */
  apply?: (data: Data, vars: Vars) => Data;
  /** Puts the API's answer in the target, for a change without `apply` */
  settle?: (data: Data, response: Response, vars: Vars) => Data;
  /**
   * Runs one after another with the area's other ordered changes, so an undo can't reach the API
   * before what it undoes, and an edit can't arrive after its item went
   */
  ordered?: boolean;
  /** How it's taken back: by which change, with what. `before` is the target before this change. */
  undo?: {
    by: Change<UndoVars>;
    /** Null when there's nothing to take back */
    vars: (vars: Vars, before: Data | undefined) => UndoVars | null;
  };
  /** The notice when the API turns it down; false when the caller shows the error itself */
  failure?: string | false;
};

/** A change as declared with defineChange. Run it with useChange; register it with registerChanges. */
export type Change<Vars> = {
  readonly key: readonly [Area, "change", string];
  readonly ordered: boolean;
  /** The query options React Query needs, for this query client */
  readonly options: (queryClient: QueryClient) => ChangeOptions<Vars>;
  /** Sends what takes it back. Judged before the change is applied; null when there's nothing. */
  readonly undoFor: (queryClient: QueryClient, vars: Vars) => (() => Promise<unknown>) | null;
};

type ChangeOptions<Vars> = {
  mutationKey: readonly unknown[];
  meta: ChangeMeta;
  scope?: { id: string };
  mutationFn: (vars: Vars) => Promise<unknown>;
  onMutate: (vars: Vars) => Promise<{ previous: unknown }>;
  onSuccess: (response: unknown, vars: Vars) => void;
  onError: (err: Error, vars: Vars, context: { previous: unknown } | undefined) => void;
  onSettled: () => void;
};

/**
 * Declares a change in `area`. Its key, `[area, "change", name]`, is saved with it on the device,
 * so renaming a change or changing the shape of its variables strands changes still waiting on
 * people's phones.
 */
export function defineChange<Vars, Data, Response = unknown, UndoVars = never>(
  area: Area,
  name: string,
  spec: ChangeSpec<Vars, Data, Response, UndoVars>,
): Change<Vars> {
  const ordered = spec.ordered ?? false;
  if (spec.undo && !(ordered && spec.undo.by.ordered)) {
    throw new Error(`${area}/${name}: a change and its undo must both be ordered`);
  }
  const key = [area, "change", name] as const;

  return {
    key,
    ordered,
    options: (queryClient) => ({
      mutationKey: key,
      meta: { idempotent: spec.idempotent },
      ...(ordered && { scope: { id: orderedScope(area) } }),
      mutationFn: spec.send,
      onMutate: async (vars) => {
        if (!spec.apply) return { previous: undefined };
        const queryKey = spec.target(vars);
        // A refetch that's already on its way would overwrite the change with older data
        await queryClient.cancelQueries({ queryKey });
        const previous = queryClient.getQueryData(queryKey);
        // Not on the device (a list that isn't open): nothing to show, but the change is still sent
        if (previous !== undefined) queryClient.setQueryData(queryKey, spec.apply(previous, vars));
        return { previous };
      },
      onSuccess: (response, vars) => {
        const { settle } = spec;
        if (!settle) return;
        queryClient.setQueryData(
          spec.target(vars),
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- what spec.send resolved with
          (data) => data && settle(data, response as Response, vars),
        );
      },
      onError: (err, vars, context) => {
        if (context?.previous !== undefined) {
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- read from this target in onMutate
          queryClient.setQueryData(spec.target(vars), context.previous as Data);
        }
        if (spec.failure !== false) changeFailed(err, spec.failure ?? DEFAULT_FAILURE);
      },
      onSettled: () => refetchAfterLastChange(queryClient, area),
    }),
    undoFor: (queryClient, vars) => {
      if (!spec.undo) return null;
      const { by, vars: undoVars } = spec.undo;
      const taken = undoVars(vars, queryClient.getQueryData(spec.target(vars)));
      if (taken === null) return null;
      return () => execute(queryClient, by, taken);
    },
  };
}

/**
 * Makes each change's options the defaults for its key, so a change saved on the device can run
 * after a restart, before any page has set it up. Call once per area at startup, before the saved
 * copy is restored.
 */
export function registerChanges(
  queryClient: QueryClient,
  changes: Record<string, Change<never>>,
): void {
  for (const change of Object.values(changes)) {
    queryClient.setMutationDefaults(change.key, change.options(queryClient));
  }
}

/** Offered after a change that can be taken back, e.g. "Milk removed" with an Undo button */
export type UndoOffer = {
  message: string;
  /** Runs before the undo is sent, e.g. to let go of a row held in place */
  onUndo?: () => void;
};

/**
 * Runs `change`: shows it straight away and sends it, now or once there's a connection. Pass an
 * UndoOffer to offer Undo; nothing is offered when there's nothing to take back. Resolves once the
 * API has it; rejects when it fails, after rolling back (and showing a notice, unless the change
 * is quiet).
 */
export function runChange<Vars>(
  queryClient: QueryClient,
  change: Change<Vars>,
  vars: Vars,
  offer?: UndoOffer,
): Promise<unknown> {
  // Judged before the change is applied, while what it removes is still there
  const undo = offer ? change.undoFor(queryClient, vars) : null;
  const sent = execute(queryClient, change, vars);
  if (offer && undo) {
    offerUndo(offer.message, () => {
      offer.onUndo?.();
      undo().catch(() => {});
    });
  }
  return sent;
}

/**
 * runChange for components. `run` returns at once; `runAsync` resolves once the API has the change
 * and rejects when it fails, for forms that close afterwards.
 */
export function useChange<Vars>(change: Change<Vars>): {
  run: (vars: Vars, undo?: UndoOffer) => void;
  runAsync: (vars: Vars) => Promise<unknown>;
} {
  const queryClient = useQueryClient();
  return {
    run: (vars, offer) => {
      // Failures roll back and say so themselves
      runChange(queryClient, change, vars, offer).catch(() => {});
    },
    runAsync: (vars) => runChange(queryClient, change, vars),
  };
}

/**
 * Refetches an area after someone else (or another of the person's devices) changed it, unless the
 * person's own change there is still being saved: refetching then would briefly undo it on screen,
 * and the change refetches when it's done anyway
 */
export function refetchArea(queryClient: QueryClient, area: Area): void {
  if (isChanging(queryClient, area)) return;
  void queryClient.invalidateQueries({ queryKey: [area] });
}

function isChanging(queryClient: QueryClient, area: Area): boolean {
  return queryClient.isMutating({ mutationKey: [area, "change"] }) > 0;
}

/**
 * Builds the change in the mutation cache and runs it. Not tied to a mounted component, so an Undo
 * tapped after the page has gone still runs.
 */
function execute<Vars>(queryClient: QueryClient, change: Change<Vars>, vars: Vars) {
  return queryClient
    .getMutationCache()
    .build(queryClient, change.options(queryClient))
    .execute(vars);
}

/**
 * Refetches the whole area after the last of several quick changes, so an early response can't
 * undo a later one. Not awaited: the change would count as running until the refetch ends, and
 * the next one would skip its refetch.
 */
function refetchAfterLastChange(queryClient: QueryClient, area: Area) {
  if (queryClient.isMutating({ mutationKey: [area, "change"] }) === 1) {
    void queryClient.invalidateQueries({ queryKey: [area] });
  }
}

function orderedScope(area: Area): string {
  return `${area}-ordered`;
}
