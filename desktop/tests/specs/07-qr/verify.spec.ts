// Phase 7 — verify a contact via QR.
//
// "Verify" in delta-chat = run secure_join via the contact's QR so
// you end up with a key-contact (verified shield in the UI).
//
// This case is *structurally* already exercised by every other
// paired-fixture spec — the templates we run against are built by
// running secure_join end-to-end in `ensure-pool.mjs`. Adding a
// dedicated spec here requires a third, unverified pool account
// (the existing peer is already verified — re-verifying it is a
// no-op confirmation and doesn't really test the transition).
//
// Live-pairing a third slot would cost a 30-90s handshake per run,
// for marginal additional coverage. Deferring until either:
//   (a) the templates grow a verify-only trio variant, or
//   (b) we add a "verified shield" assertion to the paired-spec
//       baseline so verification is implicitly covered.

import { test } from '../../fixtures/app-paired.js';

test.skip('verify a contact via QR: covered structurally by template build', async () => {
  /* see header comment */
});
