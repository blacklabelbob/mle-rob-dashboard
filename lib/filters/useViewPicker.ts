"use client";

/**
 * Q67b — the one hook the picker component calls. Thin by design, like `useTableRows`: it
 * loads the list, folds it through the pure `selectViewPicker`, and forwards clicks to
 * `viewsClient`. Every rule about what the control may CLAIM lives in `viewPicker.ts`;
 * every rule about what the wire may return lives in `viewsClient.ts`. This file owns only
 * the two things React owns — when to fetch, and what to do after a write.
 *
 * The address bar is read here rather than passed in for `useTableRows`' reason: it IS the
 * state, so Back/Forward and a bookmarked `?view=` all land on the same selection without
 * the page threading anything through.
 *
 * **A write always re-reads the list.** Patching the local array after a save would leave
 * the picker describing a `saved_views` table it can no longer see — the id, the scope and
 * the normalised name all come from the row Postgres actually wrote, and a 409 raised by a
 * colleague's view created a second ago is only visible in a fresh read.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { ViewSource } from "./page";
import { selectViewPicker, type ViewPickerModel } from "./viewPicker";
import {
  createSavedView,
  deleteSavedView,
  fetchSavedViews,
  type SavedViewList,
} from "./viewsClient";
import { canShareWithTeam, viewSaveScope, type ViewIdentity } from "./viewIdentity";

export type UseViewPickerResult = {
  model: ViewPickerModel;
  /** `null` until the first list lands; the model already says what that means on screen. */
  list: SavedViewList | null;
  /** Why the list is missing, in a rep's words. */
  listError: string | null;
  /** Why the last save or delete did not happen. Cleared when the next one starts. */
  actionError: string | null;
  /** True while a save or delete is in flight — the buttons disable, nothing else moves. */
  busy: boolean;
  /** Offered only when this rep has a team; see `viewIdentity`. */
  canShare: boolean;
  save: (name: string, shared?: boolean) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
};

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function useViewPicker(
  identity: ViewIdentity | null,
  source: ViewSource | null,
): UseViewPickerResult {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const pageUrl = search === "" ? pathname : `${pathname}?${search}`;

  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloads, setReloads] = useState(0);

  const owner = identity?.owner ?? null;
  const team = identity?.team ?? null;

  // Which read the stored answer belongs to. Stamping the answer with its own request means
  // a new rep, a new team or a reload INVALIDATES the previous list and its error by simply
  // not matching any more — no reset written back from the effect, and a late response from
  // a superseded request can never paint over the current one.
  const requestKey = `${owner ?? ""}|${team ?? ""}|${reloads}`;
  const [answer, setAnswer] = useState<{
    key: string;
    list: SavedViewList | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    // No identity is not an error and not an empty list — it is "we cannot ask yet", and
    // the component says so. Firing the request anyway would 400 on a blank owner.
    if (owner === null) return;
    const ac = new AbortController();
    let live = true;
    fetchSavedViews({ owner, team }, { fetchImpl: fetch, signal: ac.signal })
      .then((next) => {
        if (live) setAnswer({ key: requestKey, list: next, error: null });
      })
      .catch((e) => {
        if (!live || ac.signal.aborted) return;
        // The old list is dropped with the error: a stale list beside a failure message
        // invites a click that deletes a view this rep may no longer be looking at.
        setAnswer({ key: requestKey, list: null, error: message(e) });
      });
    return () => {
      live = false;
      ac.abort();
    };
  }, [owner, team, requestKey]);

  // "We cannot ask yet" is a fact about `owner`, known at render — never a stored value.
  const current = answer !== null && answer.key === requestKey ? answer : null;
  const list = owner === null ? null : (current?.list ?? null);
  const listError = owner === null ? null : (current?.error ?? null);

  const model = useMemo(
    () =>
      selectViewPicker({
        pageUrl,
        source,
        list,
        saveScope: identity ? viewSaveScope(identity) : null,
      }),
    // `identity` is a fresh object each render; its two strings are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageUrl, source, list, owner, team],
  );

  const save = useCallback(
    async (name: string, shared = false) => {
      if (!identity || !model.saveable) return false;
      setBusy(true);
      setActionError(null);
      try {
        await createSavedView(
          { ...model.saveable, name, ...viewSaveScope(identity, shared) },
          { fetchImpl: fetch },
        );
        setReloads((n) => n + 1);
        return true;
      } catch (e) {
        setActionError(message(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [identity, model.saveable],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!owner) return false;
      setBusy(true);
      setActionError(null);
      try {
        await deleteSavedView(id, owner, { fetchImpl: fetch });
        setReloads((n) => n + 1);
        return true;
      } catch (e) {
        setActionError(message(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [owner],
  );

  return {
    model,
    list,
    listError,
    actionError,
    busy,
    canShare: canShareWithTeam(identity),
    save,
    remove,
  };
}
