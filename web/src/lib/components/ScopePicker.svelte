<script lang="ts">
  import type { ProcessorView } from '@screen-remote/shared';
  import { app } from '$lib/app.svelte';
  import { unitIds, unitOf } from '$lib/format';

  type Scope = 'this' | 'pair' | 'all';

  interface Props {
    proc: ProcessorView;
    /** Resolved processor ids the next command should go to. */
    targets: string[];
  }
  // eslint-disable-next-line no-useless-assignment -- bindable prop, read by the parent
  let { proc, targets = $bindable() }: Props = $props();

  const pairIds = $derived.by(() => {
    const u = unitOf(app.state, proc.id);
    return u?.kind === 'pair' ? unitIds(u) : [];
  });
  const allIds = $derived(
    (app.state?.processors ?? []).filter((p) => p.reachable).map((p) => p.id),
  );

  let scope = $state<Scope>('this');
  let initialised = false;

  $effect(() => {
    if (!initialised && pairIds.length === 2) {
      scope = 'pair';
      initialised = true;
    }
  });

  $effect(() => {
    targets = scope === 'pair' && pairIds.length ? pairIds : scope === 'all' ? allIds : [proc.id];
  });

  const options = $derived(
    [
      { id: 'this' as const, label: 'This processor', show: true },
      { id: 'pair' as const, label: 'Both in pair', show: pairIds.length === 2 },
      { id: 'all' as const, label: `All (${allIds.length})`, show: allIds.length > 1 },
    ].filter((o) => o.show),
  );
</script>

{#if options.length > 1}
  <div class="scope">
    <span class="label">Send to</span>
    <div class="opts">
      {#each options as o (o.id)}
        <button class:on={scope === o.id} onclick={() => (scope = o.id)}>{o.label}</button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .scope {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .opts {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .opts button {
    padding: 6px 10px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    background: transparent;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .opts button.on {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-dim);
  }
</style>
