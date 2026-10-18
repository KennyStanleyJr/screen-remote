<script lang="ts">
  import { Bell, Link2, RefreshCw, Server } from '@lucide/svelte';
  import type { Unit } from '@screen-remote/shared';
  import { app } from '$lib/app.svelte';
  import UnitCard from '$lib/components/UnitCard.svelte';
  import { ago, alertsFor, unitIds } from '$lib/format';
  import { trpc } from '$lib/trpc';

  type Filter = 'all' | 'problems' | 'no-failover';
  let filter = $state<Filter>('all');

  const s = $derived(app.state);
  const processors = $derived(s?.processors ?? []);
  const online = $derived(processors.filter((p) => p.reachable).length);
  const pairs = $derived((s?.units ?? []).filter((u) => u.kind === 'pair'));
  const healthyPairs = $derived(
    pairs.filter(
      (u) =>
        unitIds(u).length === 2 &&
        unitIds(u).every((id) => app.processor(id)?.failover?.partnerPresent),
    ).length,
  );
  const critical = $derived(s?.alerts.filter((a) => a.severity === 'critical').length ?? 0);

  function hasProblem(u: Unit): boolean {
    if (u.kind === 'pair' && unitIds(u).length < 2) return true;
    return unitIds(u).some((id) => !app.processor(id)?.reachable || alertsFor(s, id).length > 0);
  }

  const units = $derived(
    (s?.units ?? []).filter((u) =>
      filter === 'all' ? true : filter === 'problems' ? hasProblem(u) : u.kind === 'single',
    ),
  );
</script>

<div class="page stack">
  <div class="summary">
    <div class="card tile">
      <Server size={18} />
      <div><b>{online}/{processors.length}</b><span>online</span></div>
    </div>
    <a class="card tile" class:fault={critical > 0} href="/alerts">
      <Bell size={18} />
      <div><b>{s?.alerts.length ?? 0}</b><span>alerts</span></div>
    </a>
    <div class="card tile">
      <Link2 size={18} />
      <div><b>{healthyPairs}/{pairs.length}</b><span>pairs OK</span></div>
    </div>
  </div>

  <div class="row toolbar">
    <div class="seg" role="tablist">
      {#each [['all', 'All'], ['problems', 'Problems'], ['no-failover', 'No failover']] as [id, label] (id)}
        <button
          role="tab"
          aria-selected={filter === id}
          class:on={filter === id}
          onclick={() => (filter = id as Filter)}
        >
          {label}
        </button>
      {/each}
    </div>
    <div class="spacer"></div>
    <button
      class="btn small ghost"
      disabled={s?.scan.running}
      onclick={() => trpc.processors.rescan.mutate()}
      aria-label="Scan for processors"
    >
      <span class:spin={s?.scan.running}><RefreshCw size={16} /></span>
      {s?.scan.running ? 'Scanning' : 'Scan'}
    </button>
  </div>

  {#if !s}
    <div class="empty">Loading…</div>
  {:else if processors.length === 0}
    <div class="empty card">
      <Server size={32} />
      <h2>No processors found yet</h2>
      <p>
        Make sure IP Control is enabled in each processor's Live Control tile and the Pi is on the
        processor network. Last scan {ago(s.scan.lastRun)}.
      </p>
      <a class="btn" href="/settings">Add a processor by IP</a>
    </div>
  {:else if units.length === 0}
    <div class="empty">Nothing matches this filter.</div>
  {:else}
    <div class="grid">
      {#each units as unit (unit.key)}
        <UnitCard {unit} />
      {/each}
    </div>
  {/if}
</div>

<style>
  .summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .tile {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    color: var(--muted);
  }
  .tile div {
    display: flex;
    flex-direction: column;
    line-height: 1.15;
  }
  .tile b {
    color: var(--text);
    font-size: 1.15rem;
    font-variant-numeric: tabular-nums;
  }
  .tile span {
    font-size: 0.75rem;
  }
  .tile.fault {
    border-color: color-mix(in srgb, var(--fault) 60%, transparent);
    color: var(--fault);
  }
  .seg {
    display: inline-flex;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .seg button {
    padding: 7px 12px;
    background: transparent;
    border: none;
    border-right: 1px solid var(--border-strong);
    font-size: 0.85rem;
    color: var(--muted);
  }
  .seg button:last-child {
    border-right: none;
  }
  .seg button.on {
    background: var(--surface-3);
    color: var(--text);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 12px;
  }
  .spin {
    display: inline-flex;
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
