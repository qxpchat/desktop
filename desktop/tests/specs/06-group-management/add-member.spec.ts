// Phase 6 — add a member to an existing group.
//
// TODO: there is currently no "Add member" affordance in `ChatInfo`.
// The component renders the members list with a per-row Remove button,
// but no Add button or row-tap that opens the picker. To make this
// spec live we'd need to extend ChatInfo with an Add-member path
// (mirror the compose-flow ChooseMembers, scoped to the active chat).
//
// Skipping until that UI exists. The underlying RPC
// (`add_contact_to_chat`) is already exercised by the Phase 5 group
// spec at creation time, so this isn't dark code — it just isn't
// reachable from the post-creation surface yet.

import { test } from '../../fixtures/app-paired.js';

test.skip('add-member: UI affordance not yet shipped', async () => {
  /* see header comment */
});
