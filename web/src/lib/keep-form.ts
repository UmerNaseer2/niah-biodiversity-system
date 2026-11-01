import { unstable_rethrow } from "next/navigation";

/** What a form says when its request got no answer. A login that ran out
 *  looks the same from here, since the proxy sends that request to sign in. */
export const NO_ANSWER =
  "The server didn’t answer, so this may not have saved. What you entered is still here. Try again in a minute. If it keeps happening you may be signed out, so sign in again in a new tab and save from here.";

/**
 * A server action for a form's JavaScript path. A request that fails throws,
 * and React would swap the form for the error screen, losing what was typed.
 * Here it becomes an answer like any other. Without JavaScript the browser
 * posts to the action itself, so the form keeps that too. Next's own signals,
 * like redirect(), are thrown as well, and those have to carry on.
 */
export function answerOnFailure<State>(
  action: (previous: State, formData: FormData) => Promise<State>,
  failed: (formData: FormData) => State,
) {
  return async (previous: State, formData: FormData) => {
    try {
      return await action(previous, formData);
    } catch (error) {
      unstable_rethrow(error);
      console.error("A form's request failed:", error);
      return failed(formData);
    }
  };
}
