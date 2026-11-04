import Link from "next/link";
import { ImportGuests } from "@/components/admin/import-guests";

export default function ImportGuestsPage() {
  return (
    <>
      <Link className="back" href="/admin/guests">All guests</Link>
      <h1 className="page-title">Import guests</h1>
      <p className="status-note">Use a CSV with a display_name column, or paste one name per line. Nothing is saved until you confirm.</p>
      <ImportGuests />
    </>
  );
}
