<script lang="ts">
  import { Cable, ChevronDown, RotateCcw, Unplug } from '@lucide/svelte';
  import type { DeviceItem, ProcessorDetail, ProcessorView } from '@screen-remote/shared';
  import { app } from '$lib/app.svelte';
  import PanelIcon from '$lib/components/PanelIcon.svelte';
  import XdIcon from '$lib/components/XdIcon.svelte';
  import { trpc, errorMessage } from '$lib/trpc';
  import { ui } from '$lib/ui.svelte';

  let { proc, detail }: { proc: ProcessorView; detail: ProcessorDetail | null } = $props();
  let showAll = $state<string | null>(null);
  let showAllMissing = $state(false);

  const d = $derived(proc.devices);
  const missing = $derived(
    [...(d.missing ?? [])].sort(
      (a, b) =>
        Number(b.type === 'XD') - Number(a.type === 'XD') ||
        a.serial.localeCompare(b.serial, undefined, { numeric: true }),
    ),
  );
  const dropped = $derived(
    d.online !== undefined && d.baseline !== undefined && d.online < d.baseline,
  );

  const byType = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- rebuilt on every change, never mutated after
    const map = new Map<string, DeviceItem[]>();
    for (const dev of detail?.devices ?? []) {
      const key = dev.type ?? 'Unknown';
      map.set(key, [...(map.get(key) ?? []), dev]);
    }
    return [...map.entries()].sort(([a], [b]) =>
      a === 'XD' ? -1 : b === 'XD' ? 1 : a.localeCompare(b),
    );
  });

  function firmwareSummary(items: DeviceItem[]): string {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- plain local helper
    const counts = new Map<string, number>();
    for (const i of items) counts.set(i.firmware ?? '?', (counts.get(i.firmware ?? '?') ?? 0) + 1);
    return [...counts.entries()]
      .map(([fw, n]) => (counts.size > 1 ? `${fw} ×${n}` : fw))
      .join(', ');
  }

  async function resetBaseline() {
    if (!(await app.unlock())) return;
    const ok = await ui.askConfirm({
      title: 'Reset device count?',
      message: `Treat the ${d.online} devices online now as the normal set for ${proc.label ?? proc.name}. Use this after changing the wall.`,
      confirmLabel: 'Reset',
    });
    if (!ok) return;
    try {
      await trpc.processors.resetBaseline.mutate({ id: proc.id });
    } catch (err) {
      ui.toast('error', errorMessage(err));
    }
  }
</script>

<div class="stack">
  <section class="card pad counts">
    <div class="count" class:bad={dropped}>
      <b>{d.online ?? '–'}</b><span>online</span>
    </div>
    <div class="count">
      <b>{d.baseline ?? '–'}</b><span>expected</span>
    </div>
    <div class="count" class:warn={Boolean(d.errors)}>
      <b>{d.errors ?? '–'}</b><span>errors</span>
    </div>
    <button
      class="btn small ghost"
      onclick={resetBaseline}
      aria-label="Reset expected device count"
    >
      <RotateCcw size={15} />
    </button>
  </section>

  {#if dropped && missing.length}
    <section class="card tone-fault pad stack">
      <div class="row">
        <span class="icon-tile fault"><Unplug size={19} /></span>
        <h3>{missing.length} missing since the expected count was set</h3>
      </div>
      <ul class="missing">
        {#each missing.slice(0, showAllMissing ? undefined : 8) as dev (dev.serial)}
          <li>
            <span>{dev.type ?? 'Device'}</span><span class="mono">{dev.serial}</span>
          </li>
        {/each}
      </ul>
      {#if missing.length > 8}
        <button class="btn small ghost" onclick={() => (showAllMissing = !showAllMissing)}>
          {showAllMissing ? 'Show fewer' : `Show all ${missing.length}`}
        </button>
      {/if}
    </section>
  {:else if dropped}
    <p class="muted small note">Checking which devices dropped…</p>
  {/if}

  {#if d.errors}
    <p class="muted small note">
      Tessera reports {d.errors}
      {d.errors === 1 ? 'device' : 'devices'} in an error state. Its API doesn't say which one, so check
      the Devices view in Tessera.
    </p>
  {/if}

  {#if proc.cableLoops.length}
    <section class="card pad stack">
      <div class="row">
        <Cable size={18} />
        <h3>Cable loops</h3>
      </div>
      <div class="loops">
        {#each proc.cableLoops as l (l.loop)}
          {@const bad = /incorrect|one-to-many/i.test(l.state)}
          <div class="loop" class:bad>
            <span class="dot" class:ok={l.ok && !bad} class:fault={bad}></span>
            <span class="n">Loop {l.loop}</span>
            <span class="s">{l.state}</span>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  {#if !detail}
    <div class="empty">Loading device list…</div>
  {:else if detail.devices.length === 0}
    <div class="empty card">No devices reported.</div>
  {:else}
    {#each byType as [type, items] (type)}
      <section class="card">
        <button class="type" onclick={() => (showAll = showAll === type ? null : type)}>
          {#if type === 'XD'}<XdIcon size={48} />{:else}<PanelIcon size={30} />{/if}
          <div class="spacer">
            <b>{items.length} × {type === 'XD' ? 'XD' : type}</b>
            <div class="muted small">Firmware {firmwareSummary(items)}</div>
          </div>
          <span class="chev" class:open={showAll === type}><ChevronDown size={18} /></span>
        </button>
        {#if showAll === type}
          <ul>
            {#each items as dev (dev.serial)}
              <li>
                <span class="mono">{dev.serial}</span><span class="muted">{dev.firmware ?? ''}</span
                >
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/each}
  {/if}
</div>

<style>
  .pad {
    padding: 14px;
  }
  .small {
    font-size: 0.85rem;
  }
  .counts {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .count {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .count b {
    font-size: 1.5rem;
    font-variant-numeric: tabular-nums;
  }
  .count span {
    font-size: 0.75rem;
    color: var(--muted);
  }
  .count.bad b {
    color: var(--fault);
  }
  .count.warn b {
    color: var(--warn);
  }
  .note {
    margin: 0;
    padding: 0 2px;
  }
  .row h3 {
    flex: 1;
  }
  ul.missing {
    padding: 0;
    max-height: none;
  }
  .loops {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .loop {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    font-size: 0.85rem;
  }
  .loop.bad .s {
    color: var(--fault);
  }
  .loop .n {
    width: 56px;
    color: var(--muted);
  }
  .type {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 12px 14px;
    background: none;
    border: none;
    text-align: left;
  }
  .chev {
    display: flex;
    color: var(--muted);
    transition: transform 0.15s;
  }
  .chev.open {
    transform: rotate(180deg);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0 14px 10px;
    max-height: 320px;
    overflow-y: auto;
  }
  li {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    border-top: 1px solid var(--border);
    font-size: 0.85rem;
  }
</style>
