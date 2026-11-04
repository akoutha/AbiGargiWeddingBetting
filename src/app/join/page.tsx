import { redirect } from "next/navigation";
import { currentGuest, hasAccess } from "@/lib/auth/session";
import { activeGuests } from "@/lib/game/queries";
import { AccessCodeForm, GuestPicker } from "@/components/join-forms";

export default async function JoinPage() {
  if (await currentGuest()) redirect("/");
  const allowed = await hasAccess();

  return (
    <main className="join">
      <h1>Place your bets on the wedding</h1>
      {allowed ? (
        <>
          <p className="join-lead">Find your name to get your $1,000.</p>
          <GuestPicker guests={await activeGuests()} />
        </>
      ) : (
        <>
          <p className="join-lead">Enter the code from your invitation. It&apos;s all fictional money.</p>
          <AccessCodeForm />
        </>
      )}
    </main>
  );
}
