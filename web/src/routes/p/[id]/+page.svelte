<script lang="ts">
  import { ArrowLeft, ArrowLeftRight, Pencil } from '@lucide/svelte';
  import type { ProcessorDetail } from '@screen-remote/shared';
  import { page } from '$app/state';
  import { app } from '$lib/app.svelte';
  import ProcessorArt from '$lib/components/ProcessorArt.svelte';
  import DevicesTab from '$lib/detail/DevicesTab.svelte';
  import FailoverTab from '$lib/detail/FailoverTab.svelte';
  import OutputTab from '$lib/detail/OutputTab.svelte';
  import OverviewTab from '$lib/detail/OverviewTab.svelte';
  import PatternsTab from '$lib/detail/PatternsTab.svelte';
  import ScreensTab from '$lib/detail/ScreensTab.svelte';
  import { ago, alertsFor, displayName, hasOverride, modelName, worstSeverity } from '$lib/format';
  import { errorMessage, trpc } from '$lib/trpc';
  import { ui } from '$lib/ui.svelte';

  type Tab = 'overview' | 'patterns' | 'output' | 'screens' | 'devices' | 'failover';

  const id = $derived(decodeURIComponent(page.params.id ?? ''));
  const proc = $derived(app.processor(id));
  const partner = $derived(
    proc?.failover?.enabled
      ? app.state?.processors.find((p) => p.serial && p.serial === proc.failover?.partnerSerial)
      : undefined,
  );

  const procAlerts = $derived(proc ? alertsFor(app.state, proc.id) : []);
  const overrideList = $derived(
    [
      proc?.overrides?.testPattern && 'Test pattern',
      proc?.overrides?.blackout && 'Blackout',
      proc?.overrides?.freeze && 'Freeze',
    ].filter((x): x is string => Boolean(x)),
  );

  let tab = $state<Tab>('overview');
  const detail = $derived<ProcessorDetail | null>(app.details[id] ?? null);

  $effect(() => {
    const target = id;
    const sub = trpc.processors.detail.subscribe(
      { id: target },
      { onData: (d) => app.setDetail(target, d) },
    );
    return () => sub.unsubscribe();
  });

  const tabs = $derived<{ id: Tab; label: string }[]>([
    { id: 'overview', label: 'Overview' },
    { id: 'patterns', label: 'Patterns' },
    { id: 'output', label: 'Output' },
    ...(detail === null || detail.groups.length
      ? [{ id: 'screens' as const, label: 'Screens' }]
      : []),
    { id: 'devices', label: 'Devices' },
    { id: 'failover', label: 'Failover' },
  ]);

  async function rename() {
    if (!proc || !(await app.unlock())) return;
    const label = await ui.askText(
      'Rename processor',
      'Name shown in Screen Remote',
      displayName(proc),
    );
    if (label === null) return;
    try {
      await trpc.processors.rename.mutate({ id: proc.id, label });
    } catch (err) {
      ui.toast('error', errorMessage(err));
    }
  }
</script>

<div class="page stack">
  <div class="row">
    <a class="btn small ghost back" href="/" aria-label="Back"><ArrowLeft size={18} /></a>
    {#if proc}
      <div class="spacer title">
        <h1>{displayName(proc)}</h1>
        <div class="muted sub">
          {modelName(proc.type)} · {proc.host}{proc.port === 80 ? '' : `:${proc.port}`} · Tessera {proc.softwareVersion ??
            '?'}
        </div>
      </div>
      <button class="btn small ghost" onclick={rename} aria-label="Rename"
        ><Pencil size={16} /></button
      >
    {/if}
  </div>

  {#if !app.state}
    <div class="empty">Loading…</div>
  {:else if !proc}
    <div class="empty card">
      <h2>Processor not found</h2>
      <a class="btn" href="/">Back to processors</a>
    </div>
  {:else}
    <div class="hero">
      <ProcessorArt
        name={displayName(proc)}
        model={modelName(proc.type)}
        reachable={proc.reachable}
        active={proc.failover?.enabled ? proc.failover.isActive : undefined}
        override={hasOverride(proc)}
        alert={worstSeverity(alertsFor(app.state, proc.id))}
      />
      <div class="lit">
        {#if overrideList.length}
          <span class="warn"><b>OVERRIDE</b> {overrideList.join(', ')} on</span>
        {:else if proc.reachable}
          <span class="muted">Showing the input</span>
        {/if}
        {#if procAlerts.length}
          <span class:fault={worstSeverity(procAlerts) === 'critical'} class="warn">
            <b>ALERT</b>
            {procAlerts.length === 1 ? procAlerts[0]!.title : `${procAlerts.length} problems`}
          </span>
        {/if}
      </div>
      {#if !proc.reachable}
        <p class="offline">
          Not responding{proc.error ? ` (${proc.error})` : ''}. Last seen {ago(proc.lastSeen)}.
        </p>
      {/if}
      {#if partner}
        <a class="partner" href={`/p/${encodeURIComponent(partner.id)}`}>
          <ArrowLeftRight size={15} />
          <span>
            {proc.failover?.role === 'backup' ? 'Primary' : 'Backup'}: <b>{displayName(partner)}</b>
            · {partner.failover?.isActive ? 'active' : 'standby'}
          </span>
        </a>
      {/if}
    </div>

    <div class="tabs" role="tablist">
      {#each tabs as t (t.id)}
        <button
          role="tab"
          aria-selected={tab === t.id}
          class:on={tab === t.id}
          onclick={() => (tab = t.id)}
        >
          {t.label}
        </button>
      {/each}
    </div>

    {#if tab === 'overview'}<OverviewTab {proc} {detail} />
    {:else if tab === 'patterns'}<PatternsTab {proc} />
    {:else if tab === 'output'}<OutputTab {proc} {detail} />
    {:else if tab === 'screens'}<ScreensTab {proc} {detail} />
    {:else if tab === 'devices'}<DevicesTab {proc} {detail} />
    {:else if tab === 'failover'}<FailoverTab {proc} />{/if}
  {/if}
</div>

<style>
  .back {
    padding: 0 8px;
  }
  .title {
    min-width: 0;
  }
  .title h1 {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sub {
    font-size: 0.8rem;
  }
  .hero {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 560px;
  }
  .lit {
    display: flex;
    gap: 14px;
    min-height: 1.4em;
    font-size: 0.82rem;
    white-space: nowrap;
    overflow: hidden;
  }
  .lit span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .lit b {
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    margin-right: 4px;
  }
  .lit .warn {
    color: var(--warn);
  }
  .lit .fault {
    color: var(--fault);
  }
  .offline {
    margin: 0;
    color: var(--fault);
    font-size: 0.9rem;
  }
  .partner {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    align-self: flex-start;
    padding: 6px 10px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    font-size: 0.85rem;
    color: var(--muted);
  }
  .partner b {
    color: var(--text);
    font-weight: 600;
  }
  .tabs {
    position: sticky;
    top: 57px;
    z-index: 10;
    display: flex;
    gap: 2px;
    overflow-x: auto;
    margin: 0 -16px;
    padding: 0 16px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    scrollbar-width: none;
  }
  .tabs button {
    padding: 12px 12px 10px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--muted);
    font-weight: 500;
    white-space: nowrap;
  }
  .tabs button.on {
    color: var(--text);
    border-bottom-color: var(--accent);
  }
</style>
