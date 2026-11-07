// A tiny headless-Chrome driver over the DevTools protocol, for the README
// art scripts. It uses only Node built-ins (Node 22+ for the global
// WebSocket), so the repo needs no browser-automation dependency.
//
// Chrome is found at CHROME_PATH, else the default macOS install.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Ends the whole script if it runs longer than `ms`, whatever it waits on.
export function watchdog(ms) {
  setTimeout(() => {
    console.error(`Gave up after ${ms / 60_000} minutes.`);
    process.exit(1);
  }, ms).unref();
}

// Rejects if `promise` has not settled within `ms`.
export function deadline(promise, ms, what) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took longer than ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function stop(proc, profile) {
  if (proc.exitCode === null && proc.signalCode === null) {
    proc.kill();
    await deadline(once(proc, "exit"), 5_000, "Chrome exit").catch(() => proc.kill("SIGKILL"));
  }
  // Chrome's helper processes can still be writing to the profile for a
  // moment; a leftover temp folder must not fail the run.
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}

// Starts Chrome with a throwaway profile and returns a driver for its one tab.
// Gives up (and kills Chrome) if that takes more than 30s.
export async function launch(extraArgs = []) {
  const profile = await mkdtemp(path.join(os.tmpdir(), "readme-art-"));
  const proc = spawn(
    CHROME,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      ...extraArgs,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  let ws;
  try {
    ws = await deadline(connect(profile), 30_000, "Starting Chrome");
  } catch (err) {
    ws?.close();
    await stop(proc, profile);
    throw err;
  }
  let nextId = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    const call = pending.get(msg.id);
    if (call) {
      pending.delete(msg.id);
      if (msg.error) call.reject(new Error(`${call.method}: ${msg.error.message}`));
      else call.resolve(msg.result);
    } else {
      for (const fn of listeners) fn(msg);
    }
  });
  // Every call has a deadline, so a wedged page fails loudly instead of
  // hanging the run.
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method}: no reply in 30s`));
      }, 30_000);
      const done = (fn) => (v) => {
        clearTimeout(timer);
        fn(v);
      };
      pending.set(id, { method, resolve: done(resolve), reject: done(reject) });
      ws.send(JSON.stringify({ id, method, params }));
    });
  await send("Page.enable");

  return {
    // Runs fn(arg) in the page and returns its (JSON) result.
    async evaluate(fn, arg) {
      const { result, exceptionDetails } = await send("Runtime.evaluate", {
        expression: `(${fn})(${JSON.stringify(arg)})`,
        awaitPromise: true,
        returnByValue: true,
      });
      if (exceptionDetails) {
        throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
      }
      return result.value;
    },

    async viewport(width, height, deviceScaleFactor = 1, mobile = false) {
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor, mobile });
      await send("Emulation.setTouchEmulationEnabled", { enabled: mobile });
    },

    async goto(url) {
      let fn;
      const loaded = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${url} did not load in 60s`)), 60_000);
        fn = (msg) => {
          if (msg.method === "Page.loadEventFired") {
            clearTimeout(timer);
            resolve();
          }
        };
        listeners.add(fn);
      });
      try {
        await send("Page.navigate", { url });
        await loaded;
      } finally {
        listeners.delete(fn);
      }
    },

    // Types into the focused element like a keyboard would.
    async type(text) {
      await send("Input.insertText", { text });
    },

    async pressEnter() {
      const key = { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
      await send("Input.dispatchKeyEvent", { type: "keyDown", ...key, text: "\r", unmodifiedText: "\r" });
      await send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
    },

    async screenshot(file) {
      const { data } = await send("Page.captureScreenshot", { format: "png" });
      await writeFile(file, Buffer.from(data, "base64"));
    },

    async close() {
      ws.close();
      await stop(proc, profile);
    },
  };
}

// Waits for Chrome's debugging port, then opens a socket to its tab.
async function connect(profile) {
  let port;
  for (const until = Date.now() + 25_000; !port && Date.now() < until; ) {
    // Chrome writes the port to the profile once it is listening.
    port = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8").catch(() => "")).split("\n")[0];
    if (!port) await sleep(50);
  }
  if (!port) throw new Error(`Chrome did not start (${CHROME}).`);
  const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(10_000) });
  const tab = (await res.json()).find((t) => t.type === "page");
  if (!tab) throw new Error("Chrome has no tab.");
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error("Could not connect to Chrome.")), { once: true });
  });
  return ws;
}
