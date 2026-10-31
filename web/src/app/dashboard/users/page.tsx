import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import UserManagementClient from "./UserManagementClient";

export const metadata: Metadata = { title: "Users and roles" };

async function fetchUsers() {
  const { createAdminClient } = await import("@/lib/supabase/server");
  const supabase = await createAdminClient();

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, name, role, email");

  return { profiles: profiles ?? [] };
}

export default async function UsersPage() {
  const session = await requireStaff();
  if (!session) return null;

  const isAdmin = session.role === "admin";

  const { profiles } = await fetchUsers();
  const sorted = [...profiles].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <UserManagementClient
      initialUsers={sorted}
      isAdmin={isAdmin}
      session={session}
    />
  );
}
