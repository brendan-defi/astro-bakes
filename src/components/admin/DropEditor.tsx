"use client";

import { useState } from "react";
import { DropForm, type DropFormProps } from "./DropForm";
import { DropLifecycle, type DropLifecycleProps } from "./DropLifecycle";

const DIRTY = "Save or discard the form's changes first: a lifecycle action reloads the drop as it is stored.";
const ACTIVE = "A lifecycle action is under way; the form picks up the stored drop when it finishes.";

/**
 * The drop's lifecycle buttons and its form together. A lifecycle action changes the stored drop and refreshes
 * the page, and the form then starts again from what is stored (its `version`). So the two take turns: while
 * the form has unsaved changes the buttons are held back and say why; and from the moment an action's
 * confirmation opens until its request has settled, the form is locked, so no edit can slip in under the action
 * and come out the other side labelled as the new state's.
 */
export function DropEditor({ lifecycle, form }: { lifecycle: Omit<DropLifecycleProps, "blocked" | "onActiveChange">; form: Omit<DropFormProps, "onDirtyChange" | "locked"> }) {
  const [dirty, setDirty] = useState(false);
  const [active, setActive] = useState(false);
  return (
    <>
      <DropLifecycle {...lifecycle} blocked={dirty ? DIRTY : undefined} onActiveChange={setActive} />
      <DropForm {...form} onDirtyChange={setDirty} locked={active ? ACTIVE : undefined} />
    </>
  );
}
