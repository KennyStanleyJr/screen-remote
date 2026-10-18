<script lang="ts">
  import { ShieldCheck, Unplug, Wrench } from '@lucide/svelte';
  import { app } from '$lib/app.svelte';

  let { mode }: { mode: 'show' | 'setup' | 'offline' } = $props();
</script>

<div class="mode {mode}" aria-live="polite">
  <span class="icon">
    {#if mode === 'show'}<ShieldCheck size={20} />
    {:else if mode === 'setup'}<Wrench size={20} />
    {:else}<Unplug size={20} />{/if}
  </span>
  <div class="text">
    <b>{mode === 'show' ? 'Show Mode' : mode === 'setup' ? 'Setup Mode' : 'Offline'}</b>
    <small>
      {mode === 'show'
        ? 'Commands locked'
        : mode === 'setup'
          ? app.session?.unlocked
            ? 'Changes go live'
            : 'PIN needed for changes'
          : 'Reconnecting…'}
    </small>
  </div>
</div>

<style>
  .mode {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .icon {
    display: flex;
    flex-shrink: 0;
  }
  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: 1.15;
  }
  b {
    font-size: 0.95rem;
    letter-spacing: 0.01em;
    white-space: nowrap;
  }
  small {
    font-size: 0.72rem;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .show .icon,
  .show b {
    color: #ff8a82;
  }
  .setup .icon,
  .setup b {
    color: var(--warn);
  }
  .offline .icon {
    color: var(--muted);
  }
</style>
