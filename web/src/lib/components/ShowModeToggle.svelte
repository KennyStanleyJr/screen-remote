<script lang="ts">
  import { ShieldCheck, Wrench } from '@lucide/svelte';
  import { app } from '$lib/app.svelte';
</script>

<button
  class="toggle"
  class:to-show={!app.showMode}
  onclick={() => app.toggleShowMode()}
  aria-label={app.showMode ? 'Switch to Setup Mode' : 'Switch to Show Mode'}
>
  {#if app.showMode}
    <Wrench size={16} />
    <span>Setup Mode</span>
  {:else}
    <ShieldCheck size={16} />
    <span>Show Mode</span>
  {/if}
</button>

<style>
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 12px;
    border-radius: var(--radius);
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    color: var(--text);
    font-weight: 600;
    font-size: 0.82rem;
    white-space: nowrap;
  }
  .toggle.to-show {
    border-color: var(--fault);
    color: #ff8a82;
  }
</style>
