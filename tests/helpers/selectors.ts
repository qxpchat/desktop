// Canonical `data-testid` selectors. Tests reference these constants, never
// raw text — text is i18n-volatile, and the UI-primitive refactor is going
// to reshape every visible class name. Each entry here is a contract: if
// the component changes its testid, the suite breaks at compile time, not
// at run time.
//
// Naming convention: kebab-case nouns, double-underscore for sub-parts.
//   chat-list                       (a landmark)
//   chat-list-row                   (a member)
//   chat-list-row__pin              (a part of a row)
//
// Discriminators (chat id, msg id, account id) ride on a sibling
// `data-<kind>-id` attribute on the same element. The selector helpers
// below compose the two.

export const TID = {
  // -- App top-level branches --
  appBoot: '[data-testid="app-boot"]',
  onboarding: '[data-testid="onboarding"]',
  appShell: '[data-testid="app-shell"]',

  // -- App shell --
  navTabs: '[data-testid="nav-tabs"]',
  navTab: (accountId: number) =>
    `[data-testid="nav-tab"][data-account-id="${accountId}"]`,
  burgerBadge: '[data-testid="burger-badge"]',

  // -- Chat list pane --
  chatList: '[data-testid="chat-list"]',
  chatListRow: (chatId: number) =>
    `[data-testid="chat-list-row"][data-chat-id="${chatId}"]`,
  chatListRowPin: '[data-testid="chat-list-row__pin"]',
  chatListRowUnread: '[data-testid="chat-list-row__unread"]',
  chatListRowMute: '[data-testid="chat-list-row__mute"]',
  chatListRowAvatar: '[data-testid="chat-list-row__avatar"]',
  chatListSearch: '[data-testid="chat-list-search"]',
  chatListArchiveLink: '[data-testid="chat-list-archive-link"]',
  chatListArchiveBack: '[data-testid="chat-list-archive-back"]',
  composeButton: '[data-testid="compose-button"]',

  // -- Compose pane (new conversation) --
  composePane: '[data-testid="compose-pane"]',
  composePaneSearch: '[data-testid="compose-pane__search"]',
  composePaneNewGroup: '[data-testid="compose-pane__new-group"]',
  composePaneNewChannel: '[data-testid="compose-pane__new-channel"]',
  composePaneNewContact: '[data-testid="compose-pane__new-contact"]',
  composePaneBack: '[data-testid="compose-pane__back"]',

  // -- Choose members (group/channel) --
  chooseMembers: '[data-testid="choose-members"]',
  chooseMembersSearch: '[data-testid="choose-members__search"]',
  chooseMembersNext: '[data-testid="choose-members__next"]',
  chooseMembersCancel: '[data-testid="choose-members__cancel"]',

  // -- Group metadata --
  groupMetadata: '[data-testid="group-metadata"]',
  groupMetadataName: '[data-testid="group-metadata__name"]',
  groupMetadataDescription: '[data-testid="group-metadata__description"]',
  groupMetadataVerified: '[data-testid="group-metadata__verified"]',
  groupMetadataCreate: '[data-testid="group-metadata__create"]',
  groupMetadataBack: '[data-testid="group-metadata__back"]',

  // -- Chat row context menu --
  chatRowMenu: '[data-testid="chat-row-menu"]',
  chatRowMenuItem: (action: string) =>
    `[data-testid="chat-row-menu-item"][data-action="${action}"]`,
  chatRowMuteOption: '[data-testid="chat-row-mute-option"]',

  // -- Delete chat confirmation dialog --
  deleteChatDialog: '[data-testid="delete-chat-dialog"]',
  deleteChatDialogConfirm: '[data-testid="delete-chat-dialog__confirm"]',
  deleteChatDialogCancel: '[data-testid="delete-chat-dialog__cancel"]',

  // -- Shared ConfirmDialog (Modal replacement for native confirm/alert) --
  confirmDialogConfirm: '[data-testid="confirm-dialog__confirm"]',
  confirmDialogCancel: '[data-testid="confirm-dialog__cancel"]',

  // -- Chat top bar --
  chatTopbar: '[data-testid="chat-topbar"]',
  chatTopbarTitle: '[data-testid="chat-topbar__title"]',
  chatTopbarInfo: '[data-testid="chat-topbar__info"]',

  // -- Chat info (group/contact settings) --
  chatInfo: '[data-testid="chat-info"]',
  chatInfoBack: '[data-testid="chat-info__back"]',
  chatInfoName: '[data-testid="chat-info__name"]',
  chatInfoRename: '[data-testid="chat-info__rename"]',
  chatInfoNameInput: '[data-testid="chat-info__name-input"]',
  chatInfoNameSave: '[data-testid="chat-info__name-save"]',
  chatInfoNameCancel: '[data-testid="chat-info__name-cancel"]',
  chatInfoEphemeral: '[data-testid="chat-info__ephemeral"]',
  chatInfoMembers: '[data-testid="chat-info__members"]',
  chatInfoMember: '[data-testid="chat-info__member"]',
  chatInfoMemberByName: (name: string) =>
    `[data-testid="chat-info__member"][data-name="${name}"]`,
  chatInfoMemberOpen: '[data-testid="chat-info__member-open"]',
  chatInfoMemberRemove: '[data-testid="chat-info__member-remove"]',
  chatInfoLeave: '[data-testid="chat-info__leave"]',
  chatInfoDelete: '[data-testid="chat-info__delete"]',
  chatInfoMedia: '[data-testid="chat-info__media"]',
  chatInfoQrInvite: '[data-testid="chat-info__qr-invite"]',
  chatInfoAddMember: '[data-testid="chat-info__add-member"]',
  chatInfoAddMemberDialog: '[data-testid="chat-info__add-member-dialog"]',
  chatInfoAddMemberSearch: '[data-testid="chat-info__add-member-search"]',
  chatInfoAddMemberRow: '[data-testid="chat-info__add-member-row"]',
  chatInfoAddMemberRowByName: (name: string) =>
    `[data-testid="chat-info__add-member-row"][data-name="${name}"]`,
  chatInfoAddMemberRowByAddress: (addr: string) =>
    `[data-testid="chat-info__add-member-row"][data-address="${addr}"]`,
  chatInfoAddMemberConfirm: '[data-testid="chat-info__add-member-confirm"]',
  chatInfoAddMemberCancel: '[data-testid="chat-info__add-member-cancel"]',
  chatInfoAvatarEdit: '[data-testid="chat-info__avatar-edit"]',
  chatInfoAvatarFileInput: '[data-testid="chat-info__avatar-file-input"]',

  // -- Media browser --
  mediaBrowser: '[data-testid="media-browser"]',
  mediaBrowserTab: (tab: 'gallery' | 'audio' | 'files') =>
    `[data-testid="media-browser__tab"][data-tab="${tab}"]`,
  mediaBrowserEmpty: '[data-testid="media-browser__empty"]',
  mediaBrowserGrid: '[data-testid="media-browser__grid"]',
  mediaBrowserList: '[data-testid="media-browser__list"]',
  mediaBrowserTile: '[data-testid="media-browser__tile"]',
  mediaBrowserTileByViewType: (viewType: string) =>
    `[data-testid="media-browser__tile"][data-view-type="${viewType}"]`,
  mediaBrowserRow: '[data-testid="media-browser__row"]',
  mediaBrowserRowByViewType: (viewType: string) =>
    `[data-testid="media-browser__row"][data-view-type="${viewType}"]`,
  mediaBrowserRowDelete: '[data-testid="media-browser__row-delete"]',
  mediaBrowserRowShow: '[data-testid="media-browser__row-show"]',
  mediaBrowserRowDownload: '[data-testid="media-browser__row-download"]',
  mediaBrowserBack: '[data-testid="media-browser__back"]',
  mediaBrowserLoading: '[data-testid="media-browser__loading"]',

  // -- Image lightbox --
  imageCell: '[data-testid="image-cell"]',
  imageLightbox: '[data-testid="image-lightbox"]',
  imageLightboxMedia: '[data-testid="image-lightbox__media"]',
  imageLightboxPrev: '[data-testid="image-lightbox__prev"]',
  imageLightboxNext: '[data-testid="image-lightbox__next"]',
  imageLightboxCaption: '[data-testid="image-lightbox__caption"]',
  imageLightboxTimestamp: '[data-testid="image-lightbox__timestamp"]',

  // -- Profile-rail toggle (hosted by the chat list when the rail is
  //    collapsed, by the rail itself when it is open) --
  chatListBurger: '[data-testid="rail-toggle"]',

  // -- Settings --
  navTabsSettings: '[data-testid="nav-tabs__settings"]',
  settings: '[data-testid="settings"]',
  settingsBack: '[data-testid="settings__back"]',
  settingsLogout: '[data-testid="settings__logout"]',
  settingsRailItem: (section: string) =>
    `[data-testid="settings__rail-item"][data-section="${section}"]`,
  settingsSection: '[data-testid="settings__section"]',
  settingsSectionBy: (section: string) =>
    `[data-testid="settings__section"][data-section="${section}"]`,

  // -- Settings: Profile --
  settingsProfileName: '[data-testid="settings-profile__name"]',
  settingsProfileSignature: '[data-testid="settings-profile__signature"]',
  settingsProfileSave: '[data-testid="settings-profile__save"]',

  // -- Settings: Appearance --
  settingsAppearanceTheme: '[data-testid="settings-appearance__theme"]',
  settingsAppearanceThemeOption: (theme: string) =>
    `[data-testid="settings-appearance__theme-option"][data-theme="${theme}"]`,
  settingsAppearanceAccent: '[data-testid="settings-appearance__accent"]',
  settingsAppearanceAccentSwatch: '[data-testid="settings-appearance__accent-swatch"]',

  // -- Settings: About --
  settingsAboutCoreVersion: '[data-testid="settings-about__core-version"]',
  settingsAboutSqliteVersion: '[data-testid="settings-about__sqlite-version"]',
  settingsAboutArch: '[data-testid="settings-about__arch"]',

  // -- Settings: Chats & Media --
  settingsChatsMdns: '[data-testid="settings-chats__mdns"]',

  // -- Settings: Blocked --
  settingsBlockedEmpty: '[data-testid="settings-blocked__empty"]',
  settingsBlockedList: '[data-testid="settings-blocked__list"]',
  settingsBlockedRow: '[data-testid="settings-blocked__row"]',
  settingsBlockedRowByAddress: (addr: string) =>
    `[data-testid="settings-blocked__row"][data-address="${addr}"]`,
  settingsBlockedUnblock: '[data-testid="settings-blocked__unblock"]',

  // -- Settings: Backup --
  settingsBackupStatus: '[data-testid="settings-backup__status"]',
  settingsBackupExport: '[data-testid="settings-backup__export"]',
  settingsBackupDownload: '[data-testid="settings-backup__download"]',

  // -- Settings: Add Second Device --
  settingsAddDevice: '[data-testid="settings-add-device"]',
  settingsAddDeviceStart: '[data-testid="settings-add-device__start"]',
  settingsAddDeviceQr: '[data-testid="settings-add-device__qr"]',
  settingsAddDeviceCode: '[data-testid="settings-add-device__code"]',
  settingsAddDeviceCopy: '[data-testid="settings-add-device__copy"]',
  settingsAddDeviceCancel: '[data-testid="settings-add-device__cancel"]',
  settingsAddDeviceCancelConfirm: '[data-testid="settings-add-device__cancel-confirm"]',
  settingsAddDeviceError: '[data-testid="settings-add-device__error"]',

  // -- Settings: Connectivity --
  settingsConnectivityRelay: '[data-testid="settings-connectivity__relay"]',
  settingsConnectivityRelayByAddr: (addr: string) =>
    `[data-testid="settings-connectivity__relay"][data-addr="${addr}"]`,

  // -- Settings: Logs --
  settingsLogsHeader: '[data-testid="settings-logs__header"]',
  settingsLogsList: '[data-testid="settings-logs__list"]',
  settingsLogsEntry: '[data-testid="settings-logs__entry"]',
  settingsLogsEmpty: '[data-testid="settings-logs__empty"]',

  // -- Chat-list search (doubles as global message search) --
  chatListSearchMessagesHeader: '[data-testid="chat-list-search__messages-header"]',
  chatListSearchHit: '[data-testid="chat-list-search__hit"]',

  // -- In-chat search bar (Ctrl+F) --
  inChatSearch: '[data-testid="in-chat-search"]',
  inChatSearchInput: '[data-testid="in-chat-search__input"]',
  inChatSearchCount: '[data-testid="in-chat-search__count"]',
  inChatSearchPrev: '[data-testid="in-chat-search__prev"]',
  inChatSearchNext: '[data-testid="in-chat-search__next"]',
  inChatSearchClose: '[data-testid="in-chat-search__close"]',

  // -- Nav tabs (profile rail) --
  navTabsAccount: '[data-testid="nav-tabs__account"]',
  navTabsAccountById: (id: number) =>
    `[data-testid="nav-tabs__account"][data-account-id="${id}"]`,
  navTabsAccountByName: (name: string) =>
    `[data-testid="nav-tabs__account"][data-name="${name}"]`,
  navTabsAccountBadge: '[data-testid="nav-tabs__account-badge"]',
  navTabsAccountBadgeById: (id: number) =>
    `[data-testid="nav-tabs__account"][data-account-id="${id}"] [data-testid="nav-tabs__account-badge"]`,
  navTabsAddAccount: '[data-testid="nav-tabs__add-account"]',
  navTabsAccountMenu: '[data-testid="nav-tabs__account-menu"]',
  navTabsAccountMenuMute: '[data-testid="nav-tabs__account-menu-mute"]',
  navTabsAccountMenuUnmute: '[data-testid="nav-tabs__account-menu-unmute"]',
  navTabsAccountMenuRemove: '[data-testid="nav-tabs__account-menu-remove"]',
  navTabsAccountMute: '[data-testid="nav-tabs__account-mute"]',
  navTabsAccountMuteById: (id: number) =>
    `[data-testid="nav-tabs__account"][data-account-id="${id}"] [data-testid="nav-tabs__account-mute"]`,
  navTabsConnectivity: '[data-testid="nav-tabs__connectivity"]',
  navTabsHoverCard: '[data-testid="nav-tabs__hover-card"]',
  settingsProfileTag: '[data-testid="settings-profile__tag"]',
  navTabsQrShow: '[data-testid="nav-tabs__qr-show"]',
  navTabsProxy: '[data-testid="nav-tabs__proxy"]',

  // -- QR show --
  qrShow: '[data-testid="qr-show"]',
  qrShowBack: '[data-testid="qr-show__back"]',
  qrShowCard: '[data-testid="qr-show__card"]',
  qrShowSvg: '[data-testid="qr-show__svg"]',
  qrShowUrl: '[data-testid="qr-show__url"]',
  qrShowCopy: '[data-testid="qr-show__copy"]',
  qrShowPaste: '[data-testid="qr-show__paste"]',
  qrShowWithdraw: '[data-testid="qr-show__withdraw"]',

  // -- QR scanner / dispatcher --
  qrDispatcher: '[data-testid="qr-dispatcher"]',
  qrDispatcherBack: '[data-testid="qr-dispatcher__back"]',
  qrDispatcherPasteInput: '[data-testid="qr-dispatcher__paste-input"]',
  qrDispatcherPasteSubmit: '[data-testid="qr-dispatcher__paste-submit"]',
  qrDispatcherError: '[data-testid="qr-dispatcher__error"]',
  qrDispatcherCard: '[data-testid="qr-dispatcher__card"]',
  qrDispatcherTitle: '[data-testid="qr-dispatcher__title"]',
  qrDispatcherBody: '[data-testid="qr-dispatcher__body"]',
  qrDispatcherConfirm: '[data-testid="qr-dispatcher__confirm"]',
  qrDispatcherReset: '[data-testid="qr-dispatcher__reset"]',

  // -- Chat view (drop target) --
  chatView: '[data-testid="chat-view"]',

  // -- Composer --
  composer: '[data-testid="composer"]',
  contactRequestBar: '[data-testid="contact-request-bar"]',
  contactRequestBarAccept: '[data-testid="contact-request-bar__accept"]',
  contactRequestBarDecline: '[data-testid="contact-request-bar__decline"]',
  composerTextarea: '[data-testid="composer__textarea"]',
  composerSend: '[data-testid="composer__send"]',
  composerAttach: '[data-testid="composer__attach"]',
  composerEmoji: '[data-testid="composer__emoji"]',
  composerFileInput: '[data-testid="composer__file-input"]',
  composerAttachmentBar: '[data-testid="composer__attachment-bar"]',
  composerAttachmentBarClose: '[data-testid="composer__attachment-bar-close"]',

  // -- Attach menu --
  attachMenu: '[data-testid="attach-menu"]',
  attachMenuItem: (action: 'file' | 'contact') =>
    `[data-testid="attach-menu-item"][data-action="${action}"]`,

  // -- Contact picker --
  contactPicker: '[data-testid="contact-picker"]',
  contactRow: '[data-testid="contact-row"]',
  contactRowByName: (name: string) =>
    `[data-testid="contact-row"][data-name="${name}"]`,
  contactRowMenu: '[data-testid="contact-row-menu"]',
  contactRowMenuDelete: '[data-testid="contact-row-menu-item"][data-action="delete"]',
  composePaneDeleteContact: '[data-testid="compose-pane__delete-contact"]',

  // -- Message bubble --
  messageBubble: (msgId: number) =>
    `[data-testid="message-bubble"][data-msg-id="${msgId}"]`,
  messageBubbleText: '[data-testid="message-bubble__text"]',
  messageBubbleQuote: '[data-testid="message-bubble__quote"]',
  messageBubbleSender: '[data-testid="message-bubble__sender"]',
  messageBubbleMeta: '[data-testid="message-bubble__meta"]',
  messageBubbleState: '[data-testid="message-bubble__state"]',

  // -- Message gallery (collapsed run of consecutive media) --
  messageGallery: '[data-testid="message-gallery"]',
  messageGalleryTile: '[data-testid="message-gallery__tile"]',
  messageGalleryCaption: '[data-testid="message-gallery__caption"]',
  messageGalleryUnroll: '[data-testid="message-gallery__unroll"]',
  messageGalleryState: '[data-testid="message-gallery__state"]',

  // -- Context menu (message) --
  contextMenu: '[data-testid="context-menu"]',
  contextMenuItem: (action: string) =>
    `[data-testid="context-menu-item"][data-action="${action}"]`,

  // -- Message context menu (right-click on a bubble) --
  msgContextMenu: '[data-testid="message-context-menu"]',
  msgContextMenuItem: (action: string) =>
    `[data-testid="message-context-menu-item"][data-action="${action}"]`,
  msgContextMenuQuickEmoji: (emoji: string) =>
    `[data-testid="message-context-menu__quick-emoji"][data-emoji="${emoji}"]`,
  msgContextMenuMoreEmoji: '[data-testid="message-context-menu__more-emoji"]',

  // -- Composer quote bar (reply / edit) --
  composerQuoteBar: '[data-testid="composer__quote-bar"]',
  composerQuoteBarClose: '[data-testid="composer__quote-bar-close"]',

  // -- Delete-message dialog --
  deleteMsgDialog: '[data-testid="delete-msg-dialog"]',
  deleteMsgDialogForMe: '[data-testid="delete-msg-dialog__delete-for-me"]',
  deleteMsgDialogForAll: '[data-testid="delete-msg-dialog__delete-for-all"]',
  deleteMsgDialogCancel: '[data-testid="delete-msg-dialog__cancel"]',

  // -- Chat picker (forward target) --
  chatPicker: '[data-testid="chat-picker"]',
  chatPickerSearch: '[data-testid="chat-picker__search"]',
  chatPickerRow: '[data-testid="chat-picker__row"]',
  chatPickerRowByName: (name: string) =>
    `[data-testid="chat-picker__row"][data-name="${name}"]`,

  // -- Reactions row on a bubble (sibling of the bubble in the DOM, not
  //    a child — addressable by `data-msg-id` to pair it back up). --
  reactionsRow: '[data-testid="reactions-row"]',
  reactionsRowForMsg: (msgId: number) =>
    `[data-testid="reactions-row"][data-msg-id="${msgId}"]`,
  reactionsRowChip: (emoji: string) =>
    `[data-testid="reactions-row__chip"][data-emoji="${emoji}"]`,
  reactionsRowChipForMsg: (msgId: number, emoji: string) =>
    `[data-testid="reactions-row"][data-msg-id="${msgId}"] [data-testid="reactions-row__chip"][data-emoji="${emoji}"]`,

  // -- Multi-select selection bar --
  selectionBar: '[data-testid="selection-bar"]',
  selectionBarCount: '[data-testid="selection-bar__count"]',
  selectionBarForward: '[data-testid="selection-bar__forward"]',
  selectionBarCopy: '[data-testid="selection-bar__copy"]',
  selectionBarDelete: '[data-testid="selection-bar__delete"]',
  selectionBarCancel: '[data-testid="selection-bar__cancel"]',

  // -- Modal / dialog --
  modal: (name: string) => `[data-testid="modal"][data-modal="${name}"]`,
  modalPrimary: '[data-testid="modal__primary"]',
  modalDanger: '[data-testid="modal__danger"]',
  modalCancel: '[data-testid="modal__cancel"]',
  modalBackdrop: '[data-testid="modal__backdrop"]',

  // -- Onboarding --
  onboardingWelcome: '[data-testid="onboarding-welcome"]',
  onboardingWelcomeSignUp: '[data-testid="onboarding-welcome__sign-up"]',
  onboardingWelcomeAltToggle: '[data-testid="onboarding-welcome__alt-toggle"]',
  onboardingWelcomeManualSetup: '[data-testid="onboarding-welcome__manual-setup"]',
  onboardingWelcomeRestoreBackup: '[data-testid="onboarding-welcome__restore-backup"]',
  onboardingWelcomeAddSecondDevice: '[data-testid="onboarding-welcome__add-second-device"]',
  onboardingInstant: '[data-testid="onboarding-instant"]',
  onboardingInstantName: '[data-testid="onboarding-instant__name"]',
  onboardingInstantSubmit: '[data-testid="onboarding-instant__submit"]',
  onboardingManual: '[data-testid="onboarding-manual"]',
  onboardingManualAddr: '[data-testid="onboarding-manual__addr"]',
  onboardingManualPassword: '[data-testid="onboarding-manual__password"]',
  onboardingManualSubmit: '[data-testid="onboarding-manual__submit"]',
  onboardingBackupImport: '[data-testid="onboarding-backup-import"]',
  onboardingBackupImportPicker: '[data-testid="onboarding-backup-import__picker"]',
  onboardingBackupReceive: '[data-testid="onboarding-backup-receive"]',
  onboardingBackupReceivePasteClipboard: '[data-testid="onboarding-backup-receive__paste-clipboard"]',
} as const;
