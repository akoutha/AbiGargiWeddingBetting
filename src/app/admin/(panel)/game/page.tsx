import { headers } from "next/headers";
import QRCode from "qrcode";
import {
  addAdmin, endGame, reopenGame, resetGame, setAdminActive, setAdminPassword, setPaused,
} from "@/app/admin/actions";
import { activityLog, adminAccounts, dashboardStats } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/admin-session";
import { signedMoney } from "@/lib/game/format";
import { ActionForm } from "@/components/admin/action-form";
import { LocalTime } from "@/components/admin/time";

const ACTIONS: Record<string, string> = {
  "event.create": "Created an event",
  "event.update": "Edited an event",
  "event.publish": "Published an event",
  "event.lock": "Locked an event",
  "event.reopen": "Reopened an event",
  "event.settle": "Settled an event",
  "event.correct": "Corrected a result",
  "event.void": "Voided an event",
  "event.delete": "Deleted a draft",
  "event.duplicate": "Duplicated an event",
  "outcome.set_odds": "Changed odds",
  "outcome.add": "Added an outcome",
  "outcome.rename": "Renamed an outcome",
  "outcome.delete": "Deleted an outcome",
  "function.add": "Added a function",
  "function.update": "Edited a function",
  "function.delete": "Deleted a function",
  "guest.add": "Added a guest",
  "guest.import": "Imported guests",
  "guest.rename": "Renamed a guest",
  "guest.reset_pin": "Reset a PIN",
  "guest.set_active": "Changed a guest's access",
  "guest.adjust_balance": "Adjusted a balance",
  "game.set_paused": "Paused or resumed betting",
  "game.end": "Ended the game",
  "game.reopen": "Reopened the game",
  "game.reset": "Reset the game",
  "admin.add": "Added an admin",
  "admin.set_active": "Changed an admin's access",
  "admin.set_password": "Changed a password",
};

const detail = (d: Record<string, unknown>) =>
  [d.question, d.name, d.label, d.reason, d.count && `${d.count} guests`, typeof d.amount === "number" && signedMoney(d.amount)]
    .filter(Boolean).join(", ");

export default async function GamePage() {
  const admin = await requireAdmin();
  const [stats, log, admins, head] = await Promise.all([
    dashboardStats(), activityLog(), adminAccounts(), headers(),
  ]);
  const code = process.env.WEDDING_ACCESS_CODE ?? "";
  const host = head.get("x-forwarded-host") ?? head.get("host") ?? "";
  const proto = head.get("x-forwarded-proto") ?? "https";
  const link = `${proto}://${host}/join/link?code=${encodeURIComponent(code)}`;
  const qr = await QRCode.toString(link, { type: "svg", margin: 1, color: { dark: "#143526", light: "#fffaf0" } });

  return (
    <>
      <h1 className="page-title">Game</h1>

      <section className="panel">
        <h2>Invite guests</h2>
        <p>Wedding code: <strong>{code}</strong></p>
        {host.startsWith("localhost") && <p className="notice">This QR code points to your computer. Print it after the site is live.</p>}
        <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} />
        <p className="break">{link}</p>
        <a className="button secondary" download="wedding-betting-qr.svg" href={`data:image/svg+xml,${encodeURIComponent(qr)}`}>Download QR code</a>
      </section>

      <section className="panel">
        <h2>Betting</h2>
        {stats.ended ? (
          <>
            <p>The game has ended and the leaderboard is final.</p>
            <ActionForm action={reopenGame} submit="Reopen game" pendingText="Reopening..." variant="secondary" confirm="Reopen the game?" />
          </>
        ) : (
          <>
            <ActionForm action={setPaused} submit={stats.paused ? "Resume betting" : "Pause all betting"} variant="secondary">
              <input type="hidden" name="paused" value={String(!stats.paused)} />
            </ActionForm>
            <p className="spaced-text">Ending the game freezes the leaderboard. Settle or void every event first.</p>
            <ActionForm action={endGame} submit="End game" pendingText="Ending..." variant="danger" confirm="End the game and freeze the leaderboard?" />
          </>
        )}
      </section>

      <section className="panel">
        <h2>Admins</h2>
        <ul className="rows">
          {admins.map((a) => (
            <li className="row-item" key={a.user_id}>
              <div>
                <strong>{a.display_name}{a.is_owner && " (owner)"}</strong>
                <small>{a.email}{!a.is_active && ", deactivated"}</small>
              </div>
              {admin.isOwner && a.user_id !== admin.id && (
                <ActionForm action={setAdminActive} submit={a.is_active ? "Deactivate" : "Reactivate"} variant="secondary" className="inline-form">
                  <input type="hidden" name="id" value={a.user_id} />
                  <input type="hidden" name="active" value={String(!a.is_active)} />
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
        {admin.isOwner && (
          <details>
            <summary>Add a delegated admin</summary>
            <ActionForm action={addAdmin} submit="Add admin">
              <label htmlFor="new-name">Name</label>
              <input id="new-name" name="name" required />
              <label htmlFor="new-email">Email</label>
              <input id="new-email" name="email" type="email" autoComplete="off" required />
              <label htmlFor="new-password">Temporary password (at least 10 characters)</label>
              <input id="new-password" name="password" type="password" minLength={10} autoComplete="new-password" required />
            </ActionForm>
          </details>
        )}
        <details>
          <summary>Change your password</summary>
          <ActionForm action={setAdminPassword} submit="Change password">
            <input type="hidden" name="id" value={admin.id} />
            <label htmlFor="my-password">New password (at least 10 characters)</label>
            <input id="my-password" name="password" type="password" minLength={10} autoComplete="new-password" required />
            <p>You&apos;ll need to sign in again.</p>
          </ActionForm>
        </details>
      </section>

      <section className="panel">
        <h2>Activity log</h2>
        {log.length === 0 ? <p>No activity yet.</p> : (
          <ul className="rows">
            {log.map((l) => (
              <li className="row-item" key={l.id}>
                <div>
                  <strong>{ACTIONS[l.action] ?? l.action}</strong>
                  <small>{l.admin_name}{detail(l.details) && `, ${detail(l.details)}`}</small>
                </div>
                <small><LocalTime iso={l.created_at} /></small>
              </li>
            ))}
          </ul>
        )}
      </section>

      {admin.isOwner && (
        <section className="panel danger-panel">
          <h2>Reset test data</h2>
          <p>This permanently deletes every guest, event, bet, balance, and log entry. Admin accounts stay. Use it once, before you load the real game.</p>
          <ActionForm action={resetGame} submit="Reset everything" pendingText="Resetting..." variant="danger" confirm="Delete all game data? This can't be undone.">
            <label htmlFor="confirm">Type RESET to confirm</label>
            <input id="confirm" name="confirm" autoComplete="off" required />
          </ActionForm>
        </section>
      )}
    </>
  );
}
