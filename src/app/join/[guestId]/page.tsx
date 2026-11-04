import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { hasAccess } from "@/lib/auth/session";
import { guestForJoin } from "@/lib/game/queries";
import { PinForm } from "@/components/join-forms";

export default async function GuestPinPage({ params }: { params: Promise<{ guestId: string }> }) {
  if (!(await hasAccess())) redirect("/join");
  const { guestId } = await params;
  const guest = await guestForJoin(guestId);
  if (!guest) notFound();

  return (
    <main className="join">
      <h1>{guest.display_name}</h1>
      <p className="join-lead">
        {guest.has_pin
          ? "Enter your 4-digit PIN."
          : "Create a 4-digit PIN. You'll need it if you sign in on another phone."}
      </p>
      <PinForm guestId={guest.id} isNew={!guest.has_pin} />
      <Link className="quiet-link" href="/join">That&apos;s not me</Link>
    </main>
  );
}
