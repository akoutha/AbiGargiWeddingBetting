"use client";

import { setupOwner, signIn } from "@/app/admin/actions";
import { useFormAction } from "@/components/use-form-action";

export function SignInForm() {
  const { state, pending, ref, onSubmit } = useFormAction(signIn);
  return (
    <form ref={ref} onSubmit={onSubmit} className="join-form">
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="username" required />
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="button" disabled={pending}>{pending ? "Signing in..." : "Sign in"}</button>
    </form>
  );
}

export function SetupForm() {
  const { state, pending, ref, onSubmit } = useFormAction(setupOwner);
  return (
    <form ref={ref} onSubmit={onSubmit} className="join-form">
      <label htmlFor="setup_code">Setup code</label>
      <input id="setup_code" name="setup_code" type="password" autoComplete="off" required />
      <label htmlFor="name">Your name</label>
      <input id="name" name="name" autoComplete="name" required />
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="username" required />
      <label htmlFor="password">Password (at least 10 characters)</label>
      <input id="password" name="password" type="password" minLength={10} autoComplete="new-password" required />
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="button" disabled={pending}>{pending ? "Creating..." : "Create owner account"}</button>
    </form>
  );
}
