"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";

type ActionState = {
  status: "idle" | "done" | "error";
  message: string;
};

async function ensureAdmin() {
  const session = await getSession();
  if (session.role !== "admin") {
    throw new Error("Unauthorized: Only administrators can perform this action.");
  }
}

export async function inviteUser(prevState: ActionState, formData: FormData) {
  const email = formData.get("email");
  if (typeof email !== "string" || !email) {
    return { status: "error", message: "Please provide a valid email address." };
  }

  try {
    await ensureAdmin();
    const supabase = await createAdminClient();
    const { error } = await supabase.auth.admin.inviteUserByEmail(email);

    if (error) {
      return { status: "error", message: `Invitation failed: ${error.message}` };
    }

    return { status: "done", message: `Invitation sent to ${email}.` };
  } catch (e) {
    const message = e instanceof Error ? e.message : "An unexpected error occurred.";
    return { status: "error", message };
  }
}

export async function updateUserRole(prevState: ActionState, formData: FormData) {
  const userId = formData.get("userId");
  const role = formData.get("role");

  if (typeof userId !== "string" || !userId) {
    return { status: "error", message: "User ID is required." };
  }
  if (typeof role !== "string" || !role) {
    return { status: "error", message: "Role is required." };
  }

  try {
    await ensureAdmin();
    const supabase = await createClient(); // Profiles update uses RLS, so anon client is fine for admin
    const { error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", userId);

    if (error) {
      return { status: "error", message: `Update failed: ${error.message}` };
    }

    return { status: "done", message: `User role updated to ${role}.` };
  } catch (e) {
    const message = e instanceof Error ? e.message : "An unexpected error occurred.";
    return { status: "error", message };
  }
}
