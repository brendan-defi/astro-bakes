"use client";

import { useState } from "react";
import { DropForm, type DropFormProps } from "./DropForm";
import { DropLifecycle, type DropLifecycleProps } from "./DropLifecycle";

/**
 * The drop's lifecycle buttons and its form together. A lifecycle action changes the stored drop and refreshes
 * the page, and the form then starts again from what is stored (its `version`), so while the form has unsaved
 * changes the buttons are held back rather than letting those changes be thrown away or, worse, relabelled as
 * belonging to the new state.
 */
export function DropEditor({ lifecycle, form }: { lifecycle: Omit<DropLifecycleProps, "blocked">; form: Omit<DropFormProps, "onDirtyChange"> }) {
  const [dirty, setDirty] = useState(false);
  return (
    <>
      <DropLifecycle {...lifecycle} blocked={dirty ? "Save or discard the form's changes first: a lifecycle action reloads the drop as it is stored." : undefined} />
      <DropForm {...form} onDirtyChange={setDirty} />
    </>
  );
}
