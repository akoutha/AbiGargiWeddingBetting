import Link from "next/link";
import { createEvent } from "@/app/admin/actions";
import { adminFunctions } from "@/lib/admin/queries";
import { ActionForm } from "@/components/admin/action-form";
import { OutcomeRows } from "@/components/admin/outcome-rows";
import { LockTimeField } from "@/components/admin/time";

export default async function NewEventPage() {
  const functions = await adminFunctions();
  return (
    <>
      <Link className="back" href="/admin/events">All events</Link>
      <h1 className="page-title">New event</h1>
      <section className="panel">
        <ActionForm action={createEvent} submit="Save as draft">
          <label htmlFor="question">Question</label>
          <input id="question" name="question" placeholder="Who cries first?" required />
          <label htmlFor="description">Description (optional)</label>
          <textarea id="description" name="description" rows={2} />
          <label htmlFor="function_id">Function</label>
          <select id="function_id" name="function_id" defaultValue="">
            <option value="">No function</option>
            {functions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <LockTimeField />
          <OutcomeRows />
        </ActionForm>
      </section>
    </>
  );
}
