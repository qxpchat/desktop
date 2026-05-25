<script lang="ts">
  import { fileUrl } from '../lib/files';
  import PendingMediaRow from './PendingMediaRow.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    gif: { url: string; term: string; localPath: string };
    onClose: () => void;
  };
  let { gif, onClose }: Props = $props();
</script>

<PendingMediaRow
  thumbUrl={fileUrl(gif.localPath)}
  thumbIcon="gif"
  label={t('GIF')}
  subtitle={gif.term || t('GIF')}
  {onClose}
  data-testid="composer__pending-gif"
  closeTestId="composer__pending-gif-close"
/>
