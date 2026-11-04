"use client";

import { useState } from "react";
import type { AdminState } from "@/app/admin/actions";
import { useFormAction } from "@/components/use-form-action";

type Props = {
  action: (state: AdminState, form: FormData) => Promise<AdminState>;
  submit: string;
  pendingText?: string;
  /** Asks this question before running a serious action. */
  confirm?: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
  children?: React.ReactNode;
};

export function ActionForm({
  action, submit, pendingText = "Saving...", confirm, variant = "primary", className, children,
}: Props) {
  const { state, pending, ref, onSubmit } = useFormAction(action);
  const [armed, setArmed] = useState(false);
  const buttonClass = `button${variant === "primary" ? "" : ` ${variant}`}`;

  return (
    <form ref={ref} className={className ?? "admin-form"} onSubmit={(e) => { setArmed(false); onSubmit(e); }}>
      {children}
      {confirm && armed && <p className="confirm-text">{confirm}</p>}
      {/* Separate keys stop a click on the first button from also submitting the form. */}
      <div className="actions">
        {confirm && !armed ? (
          <button key="ask" type="button" className={buttonClass} onClick={() => setArmed(true)}>{submit}</button>
        ) : (
          <button key="run" className={buttonClass} disabled={pending}>
            {pending ? pendingText : confirm ? `Yes, ${submit.toLowerCase()}` : submit}
          </button>
        )}
        {confirm && armed && (
          <button type="button" className="button secondary" onClick={() => setArmed(false)}>Keep it</button>
        )}
      </div>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      {state.ok && !state.error && <p className="success" role="status">{state.ok}</p>}
    </form>
  );
}
