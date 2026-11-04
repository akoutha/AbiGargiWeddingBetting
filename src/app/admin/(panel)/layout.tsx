import { requireAdmin } from "@/lib/auth/admin-session";
import { AdminNav } from "@/components/admin/admin-nav";
import { signOut } from "@/app/admin/actions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <>
      <header className="admin-header">
        <p>Admin</p>
        <form action={signOut}>
          <span>{admin.displayName}</span>
          <button className="text-button on-dark">Sign out</button>
        </form>
      </header>
      <main className="admin">{children}</main>
      <AdminNav />
    </>
  );
}
