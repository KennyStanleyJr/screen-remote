<script lang="ts">
  import { Lock } from '@lucide/svelte';
  import { app } from '$lib/app.svelte';
</script>

{#if !app.canCommand}
  <div class="note">
    <Lock size={16} />
    <span
      >{app.showMode
        ? 'Show Mode is on. Controls are locked.'
        : 'Enter the setup PIN to use controls.'}</span
    >
    <button class="btn small" onclick={() => (app.showMode ? app.leaveShowMode() : app.unlock())}>
      Unlock
    </button>
  </div>
{/if}

<style>
  .note {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px 8px 12px;
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius);
    color: var(--muted);
    font-size: 0.85rem;
  }
  .note span {
    flex: 1;
  }
</style>
