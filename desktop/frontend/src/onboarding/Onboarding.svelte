<script lang="ts">
  import Welcome from './Welcome.svelte';
  import Instant from './Instant.svelte';
  import ManualLogin from './ManualLogin.svelte';
  import BackupImport from './BackupImport.svelte';
  import BackupReceive from './BackupReceive.svelte';

  type Route = 'welcome' | 'instant' | 'manual' | 'backupImport' | 'backupReceive';

  let route = $state<Route>('welcome');

  function go(target: Route) {
    route = target;
  }
</script>

{#if route === 'welcome'}
  <Welcome
    onSignUp={() => go('instant')}
    onManualSetup={() => go('manual')}
    onRestoreBackup={() => go('backupImport')}
    onAddAsSecondDevice={() => go('backupReceive')}
  />
{:else if route === 'instant'}
  <Instant onBack={() => go('welcome')} onManual={() => go('manual')} />
{:else if route === 'manual'}
  <ManualLogin onBack={() => go('welcome')} />
{:else if route === 'backupImport'}
  <BackupImport onBack={() => go('welcome')} />
{:else if route === 'backupReceive'}
  <BackupReceive onBack={() => go('welcome')} />
{/if}
