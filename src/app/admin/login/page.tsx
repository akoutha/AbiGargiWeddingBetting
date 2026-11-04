import { redirect } from "next/navigation";
import { hasAnyAdmin } from "@/lib/admin/queries";
import { currentAdmin } from "@/lib/auth/admin-session";
import { SetupForm, SignInForm } from "@/components/admin/login-forms";

export default async function AdminLoginPage() {
  if (await currentAdmin()) redirect("/admin");
  const ready = await hasAnyAdmin();
  return (
    <main className="join">
      <h1>{ready ? "Admin sign-in" : "Set up the admin panel"}</h1>
      <p className="join-lead">
        {ready ? "Run the game from here." : "Create the owner account. You'll only do this once."}
      </p>
      {ready ? <SignInForm /> : <SetupForm />}
    </main>
  );
}
