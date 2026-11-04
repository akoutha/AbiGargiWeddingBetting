import Link from "next/link";
import { requireGuest } from "@/lib/auth/session";

export default async function WelcomePage() {
  const guest = await requireGuest();
  return (
    <main className="join">
      <h1>You&apos;re in, {guest.displayName.split(" ")[0]}</h1>
      <p className="join-lead">You have $1,000 in fictional money. Here&apos;s how it works.</p>
      <ol className="how-to">
        <li>Pick an event and choose what you think will happen.</li>
        <li>Choose how much to bet. A $100 bet at 3x pays $300 if you&apos;re right.</li>
        <li>Change your mind any time before betting closes.</li>
        <li>Climb the leaderboard by winning the most.</li>
      </ol>
      <Link className="button" href="/">See the bets</Link>
    </main>
  );
}
