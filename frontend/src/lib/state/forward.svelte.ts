// Pending message-forward flow. Held at module scope (not inside ChatView)
// because the flow deliberately switches the visible chat to the forward
// target — which remounts ChatView — and the queued message ids must
// survive that switch. `ForwardFlow.svelte` (mounted app-level) drives the
// picker + confirmation against this state.

export const forwardState = $state<{ messageIds: number[] | null }>({
  messageIds: null,
});

/** Begin a forward: opens the chat picker for `ids`. No-op on empty input. */
export function startForward(ids: number[]): void {
  forwardState.messageIds = ids.length > 0 ? [...ids] : null;
}
