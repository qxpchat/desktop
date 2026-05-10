// Contact list state for the active account. Used by compose flow and group
// member picker. Re-fetches when:
//   - the active account changes
//   - the search query changes (debounced 150ms)
//   - ContactsChanged event fires
//
// `getContacts(accountId, listFlags, query?)` is the daemon-side filter, so
// search is server-side too — we don't post-process client-side.

import { rpc } from '../rpc';
import { onEvent } from '../events';

export type Contact = {
  id: number;
  address: string;
  color: string;
  authName: string;
  status: string;
  displayName: string;
  name: string;
  profileImage: string | null;
  nameAndAddr: string;
  isBlocked: boolean;
  isKeyContact: boolean;
  e2eeAvail: boolean;
  isVerified: boolean;
  verifierId: number | null;
  lastSeen: number;
  wasSeenRecently: boolean;
  isBot: boolean;
};

/** DC_GCL_ADD_SELF — include the user themselves in the contact list. */
export const GCL_ADD_SELF = 0x02;

export type ContactsState = {
  accountId: number | null;
  flags: number;
  query: string;
  contacts: Contact[];
  loading: boolean;
};

export const contacts = $state<ContactsState>({
  accountId: null,
  flags: 0,
  query: '',
  contacts: [],
  loading: false,
});

let pendingQuery = '';
let queryDebounce: ReturnType<typeof setTimeout> | null = null;
let loadGen = 0;

export function setContactsScope(accountId: number | null, flags: number = 0): void {
  if (contacts.accountId === accountId && contacts.flags === flags) return;
  contacts.accountId = accountId;
  contacts.flags = flags;
  contacts.contacts = [];
  if (accountId != null) void load();
}

export function setContactsQuery(q: string): void {
  pendingQuery = q;
  if (queryDebounce != null) clearTimeout(queryDebounce);
  queryDebounce = setTimeout(() => {
    queryDebounce = null;
    if (pendingQuery !== contacts.query) {
      contacts.query = pendingQuery;
      void load();
    }
  }, 150);
}

async function load(): Promise<void> {
  const accountId = contacts.accountId;
  if (accountId == null) return;
  const gen = ++loadGen;
  contacts.loading = true;
  try {
    const list = await rpc.call<Contact[]>('get_contacts', [
      accountId,
      contacts.flags,
      contacts.query.trim() || null,
    ]);
    if (gen !== loadGen || contacts.accountId !== accountId) return;
    contacts.contacts = list;
  } catch (err) {
    if (gen === loadGen) console.warn('contacts load failed:', err);
  } finally {
    if (gen === loadGen) contacts.loading = false;
  }
}

onEvent('ContactsChanged', (ev) => {
  if (contacts.accountId != null && ev.contextId === contacts.accountId) void load();
});
