// Node preload that shifts the clock to FAKE_NOW (an ISO time), so a local
// server serves the slate of a PAST game day. Time keeps ticking from there.
// Used only to capture the README art; see capture.mjs.
//
//   FAKE_NOW=2026-07-20T16:00:00Z NODE_OPTIONS="--import ./scripts/readme-art/fake-clock.mjs" npx next start
const target = Date.parse(process.env.FAKE_NOW ?? "");
if (Number.isFinite(target)) {
  const RealDate = Date;
  const skew = target - RealDate.now();
  class FakeDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + skew);
      else super(...args);
    }
    static now() {
      return RealDate.now() + skew;
    }
  }
  globalThis.Date = FakeDate;
}
