<script lang="ts">
  import { CircleAlert, CircleCheck, Info } from '@lucide/svelte';
  import { ui } from '$lib/ui.svelte';
</script>

<div class="toasts" aria-live="polite">
  {#each ui.toasts as t (t.id)}
    <button class="toast {t.kind}" onclick={() => ui.dismiss(t.id)} aria-label="Dismiss">
      {#if t.kind === 'ok'}<CircleCheck size={18} />{:else if t.kind === 'error'}<CircleAlert
          size={18}
        />{:else}<Info size={18} />{/if}
      <span>{t.text}</span>
    </button>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    left: 12px;
    right: 12px;
    top: calc(var(--safe-top) + 8px);
    z-index: 60;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    pointer-events: none;
  }
  .toast {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    max-width: 480px;
    width: 100%;
    padding: 10px 12px;
    background: var(--surface-3);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
    color: var(--text);
    font: inherit;
    font-size: 0.9rem;
    text-align: left;
    pointer-events: auto;
    animation: drop 160ms ease-out;
  }
  @keyframes drop {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
  }
  .toast.ok :global(svg) {
    color: var(--ok);
  }
  .toast.error {
    border-color: color-mix(in srgb, var(--fault) 55%, var(--border-strong));
    background: color-mix(in srgb, var(--fault) 8%, var(--surface-3));
  }
  .toast.error :global(svg) {
    color: var(--fault);
  }
  .toast :global(svg) {
    color: var(--accent);
    flex-shrink: 0;
    margin-top: 1px;
  }
</style>
