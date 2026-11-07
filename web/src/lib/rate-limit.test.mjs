import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clientAddress, createSignInLimit, createTryCounter } from "./rate-limit.ts";

const MINUTE = 60 * 1000;

/** A clock the test moves by hand. */
function fakeClock() {
  let time = 1_000_000;
  return {
    now: () => time,
    pass: (ms) => {
      time += ms;
    },
  };
}

describe("createTryCounter", () => {
  it("blocks a name once it has used up its tries, and not before", () => {
    const clock = fakeClock();
    const counter = createTryCounter({ tries: 3, windowMs: 10 * MINUTE }, clock.now);
    counter.addFailure("a");
    counter.addFailure("a");
    assert.equal(counter.isBlocked("a"), false);
    counter.addFailure("a");
    assert.equal(counter.isBlocked("a"), true);
    assert.equal(counter.isBlocked("b"), false);
  });

  it("lets a name try again once its oldest try is outside the window", () => {
    const clock = fakeClock();
    const counter = createTryCounter({ tries: 2, windowMs: 10 * MINUTE }, clock.now);
    counter.addFailure("a");
    clock.pass(4 * MINUTE);
    counter.addFailure("a");
    assert.equal(counter.isBlocked("a"), true);
    clock.pass(6 * MINUTE);
    assert.equal(counter.isBlocked("a"), false, "the first try is now 10 minutes old");
    counter.addFailure("a");
    assert.equal(counter.isBlocked("a"), true);
  });

  it("forgets a name when it's cleared", () => {
    const clock = fakeClock();
    const counter = createTryCounter({ tries: 1, windowMs: MINUTE }, clock.now);
    counter.addFailure("a");
    counter.clear("a");
    assert.equal(counter.isBlocked("a"), false);
    assert.equal(counter.size, 0);
  });

  it("drops names whose tries are all old the next time one fails", () => {
    const clock = fakeClock();
    const counter = createTryCounter({ tries: 5, windowMs: MINUTE }, clock.now);
    counter.addFailure("a");
    counter.addFailure("b");
    clock.pass(2 * MINUTE);
    counter.addFailure("c");
    assert.equal(counter.size, 1);
  });

  it("remembers no more than the most names, dropping the ones that failed longest ago", () => {
    const clock = fakeClock();
    const counter = createTryCounter({ tries: 1, windowMs: MINUTE, mostNames: 3 }, clock.now);
    for (const name of ["a", "b", "c", "d", "e"]) {
      counter.addFailure(name);
      clock.pass(1);
    }
    assert.equal(counter.size, 3);
    assert.equal(counter.isBlocked("a"), false);
    assert.equal(counter.isBlocked("b"), false);
    assert.equal(counter.isBlocked("e"), true);
  });

  it("only keeps as many times for a name as it needs", () => {
    const clock = fakeClock();
    const counter = createTryCounter({ tries: 2, windowMs: 10 * MINUTE }, clock.now);
    for (let i = 0; i < 100; i++) counter.addFailure("a");
    clock.pass(10 * MINUTE);
    assert.equal(counter.isBlocked("a"), false);
  });
});

describe("createSignInLimit", () => {
  it("stops an email after 5 wrong tries in 15 minutes, from any address", () => {
    const clock = fakeClock();
    const limit = createSignInLimit(clock.now);
    for (let i = 0; i < 4; i++) limit.addFailure("officer@example.test", `10.0.0.${i}`);
    assert.equal(limit.isBlocked("officer@example.test", "10.0.0.9"), false);
    limit.addFailure("officer@example.test", "10.0.0.4");
    assert.equal(limit.isBlocked("officer@example.test", "10.0.0.9"), true);
    assert.equal(limit.isBlocked("ranger@example.test", "10.0.0.9"), false);
    clock.pass(15 * MINUTE);
    assert.equal(limit.isBlocked("officer@example.test", "10.0.0.9"), false);
  });

  it("counts an email the same whatever its capitals or spaces", () => {
    const limit = createSignInLimit(fakeClock().now);
    for (let i = 0; i < 5; i++) limit.addFailure(" Officer@Example.TEST ", "10.0.0.1");
    assert.equal(limit.isBlocked("officer@example.test", "10.0.0.2"), true);
  });

  it("stops an address after 20 wrong tries across any emails", () => {
    const limit = createSignInLimit(fakeClock().now);
    for (let i = 0; i < 20; i++) limit.addFailure(`person${i}@example.test`, "10.0.0.1");
    assert.equal(limit.isBlocked("someone.new@example.test", "10.0.0.1"), true);
    assert.equal(limit.isBlocked("someone.new@example.test", "10.0.0.2"), false);
  });

  it("starts an email's count again once it signs in, but not the address's", () => {
    const limit = createSignInLimit(fakeClock().now);
    for (let i = 0; i < 4; i++) limit.addFailure("officer@example.test", "10.0.0.1");
    limit.signedIn("officer@example.test");
    for (let i = 0; i < 4; i++) limit.addFailure("officer@example.test", "10.0.0.1");
    assert.equal(limit.isBlocked("officer@example.test", "10.0.0.2"), false);
    for (let i = 0; i < 12; i++) limit.addFailure(`person${i}@example.test`, "10.0.0.1");
    assert.equal(limit.isBlocked("officer@example.test", "10.0.0.1"), true, "20 from this address");
  });
});

describe("clientAddress", () => {
  const headersOf = (values) => ({ get: (name) => values[name] ?? null });

  it("takes the first address the host passed on", () => {
    assert.equal(clientAddress(headersOf({ "x-forwarded-for": "10.0.0.1, 10.0.0.2" })), "10.0.0.1");
  });

  it("falls back to x-real-ip, then to one shared name", () => {
    assert.equal(clientAddress(headersOf({ "x-real-ip": " 10.0.0.3 " })), "10.0.0.3");
    assert.equal(clientAddress(headersOf({ "x-forwarded-for": " " })), "unknown");
    assert.equal(clientAddress(headersOf({})), "unknown");
  });
});
