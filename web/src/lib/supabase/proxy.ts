import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  authConfigured,
  SESSION_COOKIE_OPTIONS,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  withSessionLife,
} from "./config";

/** Refreshes the session cookie on every request and sends anyone who isn't
 *  signed in away from /dashboard. This is only the first gate. The role
 *  check lives in lib/auth.ts, next to the data. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!authConfigured) {
    return redirectToLogin(request);
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, withSessionLife(options));
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return redirectToLogin(request);
  return response;
}

function redirectToLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}
