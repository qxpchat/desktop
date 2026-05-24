<script lang="ts">
  import Welcome from './Welcome.svelte';
  import Instant from './Instant.svelte';
  import ManualLogin from './ManualLogin.svelte';
  import BackupImport from './BackupImport.svelte';
  import BackupReceive from './BackupReceive.svelte';
  import SignupScan from './SignupScan.svelte';

  type Route = 'welcome' | 'instant' | 'manual' | 'backupImport' | 'backupReceive' | 'scan';

  let route = $state<Route>('welcome');
  // QR string captured by `SignupScan.svelte` and threaded into Instant.
  // Mutually exclusive — only one of the two is non-null at a time.
  let prefilledQr = $state<string | null>(null);
  let prefilledInvite = $state<string | null>(null);

  function go(target: Route) {
    route = target;
  }

  function onScanDcAccount(qr: string) {
    prefilledQr = qr;
    prefilledInvite = null;
    route = 'instant';
  }

  function onScanInvite(qr: string) {
    prefilledInvite = qr;
    prefilledQr = null;
    route = 'instant';
  }
</script>

{#if route === 'welcome'}
  <Welcome
    onSignUp={() => {
      prefilledQr = null;
      prefilledInvite = null;
      go('instant');
    }}
    onManualSetup={() => go('manual')}
    onRestoreBackup={() => go('backupImport')}
    onAddAsSecondDevice={() => go('backupReceive')}
    onScan={() => go('scan')}
  />
{:else if route === 'instant'}
  <Instant
    onBack={() => go('welcome')}
    onManual={() => go('manual')}
    onScan={() => go('scan')}
    {prefilledQr}
    {prefilledInvite}
  />
{:else if route === 'manual'}
  <ManualLogin onBack={() => go('welcome')} />
{:else if route === 'backupImport'}
  <BackupImport onBack={() => go('welcome')} />
{:else if route === 'backupReceive'}
  <BackupReceive onBack={() => go('welcome')} />
{:else if route === 'scan'}
  <SignupScan
    onBack={() => go('welcome')}
    onDcAccount={onScanDcAccount}
    onInvite={onScanInvite}
  />
{/if}
