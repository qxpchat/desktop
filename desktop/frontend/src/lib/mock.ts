// Deterministic placeholder data so the shell has something to render.
// Replaced by real RPC-backed state from Phase 3 onwards.

export type MockAccount = {
  id: number;
  displayName: string;
  email: string;
  color: string;
  unread: number;
};

export type MockChat = {
  id: number;
  name: string;
  lastMessage: string;
  timestamp: string;
  unread: number;
  color: string;
  isGroup: boolean;
  pinned?: boolean;
};

export const mockAccounts: MockAccount[] = [
  { id: 1, displayName: 'Alice', email: 'alice@example.com', color: '#7c4dff', unread: 0 },
  { id: 2, displayName: 'Work', email: 'me@work.example.com', color: '#26a69a', unread: 3 },
  { id: 3, displayName: 'Family', email: 'me@family.example.com', color: '#ef5350', unread: 0 },
];

export const mockChats: MockChat[] = [
  {
    id: 101,
    name: 'Bob',
    lastMessage: 'See you tomorrow!',
    timestamp: '12:34',
    unread: 0,
    color: '#1976d2',
    isGroup: false,
    pinned: true,
  },
  {
    id: 102,
    name: 'Project chat',
    lastMessage: 'Carol: PR is up for review.',
    timestamp: '11:02',
    unread: 5,
    color: '#388e3c',
    isGroup: true,
  },
  {
    id: 103,
    name: 'Dad',
    lastMessage: 'Photos from the trip',
    timestamp: 'Yesterday',
    unread: 0,
    color: '#f57c00',
    isGroup: false,
  },
  {
    id: 104,
    name: 'Book club',
    lastMessage: 'Eve: Chapter 3 was wild!',
    timestamp: 'Mon',
    unread: 2,
    color: '#5e35b1',
    isGroup: true,
  },
  {
    id: 105,
    name: 'Notifications',
    lastMessage: 'Welcome to qxp.',
    timestamp: 'Apr 30',
    unread: 0,
    color: '#546e7a',
    isGroup: false,
  },
];

export function avatarInitial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}
