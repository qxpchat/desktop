// Pane-2 finite state machine. Mirrors Signal Desktop's `LeftPaneHelper`
// switching: same pane footprint, different header / body / actions per mode.
//
// Modes added across phases:
//   Phase 1/3  : inbox
//   Phase 5    : compose
//   Phase 6    : chooseMembers, setGroupMetadata
//   Phase 13   : archive
//   Phase 20   : search

export type PaneMode =
  | { kind: 'inbox' }
  | { kind: 'compose' }
  | {
      kind: 'chooseMembers';
      flow: 'group' | 'channel';
      selected: number[];
    }
  | {
      kind: 'setGroupMetadata';
      flow: 'group' | 'channel';
      selected: number[];
    }
  | { kind: 'archive' }
  | { kind: 'search'; query: string };

export const paneMode = $state<{ mode: PaneMode }>({ mode: { kind: 'inbox' } });

export function setPaneMode(mode: PaneMode): void {
  paneMode.mode = mode;
}

export function backToInbox(): void {
  paneMode.mode = { kind: 'inbox' };
}
