"use server";

import { refresh, revalidatePath } from "next/cache";
import { getSession, SERVICE_DOWN } from "@/lib/auth";
import { checkAlertId } from "@/lib/iot";
import { checkAlerts, sqlIsMissing } from "@/lib/iot-db";
import { authConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type SensorResult = { ok: boolean; message: string };

const TRY_AGAIN = "Nothing was changed. Try again, and if it keeps happening, check the server’s logs.";

/**
 * Anyone can send a request straight to a server action, so this checks who is signed in itself.
 * The database checks the role again (supabase/017).
 */
async function staffProblem() {
  if (!authConfigured) return "Sensors aren’t set up on this server yet.";
  const session = await getSession();
  if (session.status === "signed-out") {
    return "You’re signed out. Sign in again, then try that again.";
  }
  if (session.status === "unavailable") return SERVICE_DOWN;
  if (session.status !== "ok") {
    return "Only conservation officers and administrators can do this.";
  }
  return null;
}

async function changeAlert(
  name: "iot_acknowledge_alert" | "iot_resolve_alert",
  input: unknown,
  done: string,
): Promise<SensorResult> {
  const problem = await staffProblem();
  if (problem) return { ok: false, message: problem };

  const checked = checkAlertId(input);
  if (!checked.ok) return checked;

  const supabase = await createClient();
  const { error } = await supabase.rpc(name, { alert: checked.value });
  if (error) {
    if (error.code === "42501") {
      return {
        ok: false,
        message: "The database didn’t let your account do this. Reload the page to check you’re still signed in.",
      };
    }
    if (sqlIsMissing(error)) {
      return { ok: false, message: "Alerts aren’t set up in this database yet." };
    }
    if (error.code === "P0001") {
      return { ok: false, message: "That alert is gone. Reload the page to see the ones left." };
    }
    console.error("Changing an alert failed:", error.code);
    return { ok: false, message: TRY_AGAIN };
  }
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: done };
}

/** Says someone has seen it and is on it. It stays on the list until it's resolved. */
export async function acknowledgeAlert(alert: unknown) {
  return changeAlert("iot_acknowledge_alert", alert, "Acknowledged.");
}

/** Closes it. The database records who and when. */
export async function resolveAlert(alert: unknown) {
  return changeAlert("iot_resolve_alert", alert, "Resolved.");
}

/** The sensors page's timer. refresh() has the router draw the page and the staff menu again. */
export async function refreshSensors() {
  refresh();
}

/** The timer on every other staff page. Only redraws when the urgent count isn't what it's showing. */
export async function checkUrgentCount(showing: unknown) {
  if (await staffProblem()) return;
  const counts = await checkAlerts();
  if (counts && counts.urgent !== showing) refresh();
}
