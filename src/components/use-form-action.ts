"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent } from "react";

type State = { error?: string; ok?: string };

/** Keeps what the person typed when an action fails, and clears it after a success. */
export function useFormAction<S extends State>(action: (state: S, form: FormData) => Promise<S>) {
  const [state, dispatch, pending] = useActionState(action, {} as Awaited<S>);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => dispatch(data));
  }

  return { state, pending, ref, onSubmit };
}
