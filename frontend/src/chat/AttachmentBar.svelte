<script lang="ts">
  import type { PendingAttachment } from '../lib/state/chat.svelte';
  import { type IconName } from '../lib/Icon.svelte';
  import PendingMediaRow from './PendingMediaRow.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    attachment: PendingAttachment;
    onClose: () => void;
  };

  let { attachment, onClose }: Props = $props();

  function iconFor(viewtype: string): IconName {
    switch (viewtype) {
      case 'Video':
        return 'play';
      case 'Audio':
        return 'music';
      case 'Voice':
        return 'mic';
      case 'Vcard':
        return 'user';
      default:
        return 'file';
    }
  }

  function labelFor(viewtype: string): string {
    switch (viewtype) {
      case 'Image':
        return t('Image');
      case 'Gif':
        return t('GIF');
      case 'Video':
        return t('Video');
      case 'Audio':
        return t('Audio');
      case 'Voice':
        return t('Voice');
      case 'Vcard':
        return t('Contact');
      default:
        return t('Attachment');
    }
  }

  let label = $derived(labelFor(attachment.viewtype));
  let subtitle = $derived(attachment.displayName ?? attachment.filename);
  let thumbIcon = $derived(iconFor(attachment.viewtype));
</script>

<PendingMediaRow
  thumbUrl={attachment.previewUrl}
  {thumbIcon}
  {label}
  {subtitle}
  {onClose}
  data-testid="composer__attachment-bar"
  closeTestId="composer__attachment-bar-close"
/>
