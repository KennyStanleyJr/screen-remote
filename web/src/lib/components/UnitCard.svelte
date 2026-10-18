<script lang="ts">
  import { Boxes, MonitorPlay, Thermometer } from '@lucide/svelte';
  import type { ProcessorView, Unit } from '@screen-remote/shared';
  import { app } from '$lib/app.svelte';
  import {
    alertsFor,
    displayName,
    hasOverride,
    hottest,
    modelName,
    resolution,
    statusOf,
    worstSeverity,
    type Status,
  } from '$lib/format';
  import ProcessorArt from './ProcessorArt.svelte';

  let { unit }: { unit: Unit } = $props();

  const primary = $derived(app.processor(unit.kind === 'pair' ? unit.primaryId : unit.id));
  const backup = $derived(unit.kind === 'pair' ? app.processor(unit.backupId) : undefined);
  const members = $derived([primary, backup].filter((p): p is ProcessorView => Boolean(p)));
  const lead = $derived(members.find((p) => p.failover?.isActive) ?? members[0]);

  const unitAlerts = $derived(members.flatMap((p) => alertsFor(app.state, p.id)));
  const status = $derived<Status>(
    members.length === 0
      ? 'offline'
      : members.some((p) => statusOf(p, alertsFor(app.state, p.id)) === 'offline')
        ? 'fault'
        : statusOf(lead, unitAlerts),
  );

  function commonPrefix(a: string, b: string): string {
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    return a
      .slice(0, i)
      .replace(/[\s\-_]+\S?$/, '')
      .trim();
  }

  const title = $derived.by(() => {
    if (unit.kind === 'pair' && primary && backup) {
      const prefix = commonPrefix(displayName(primary), displayName(backup));
      if (prefix.length >= 3) return prefix;
    }
    return displayName(lead);
  });

  const missingName = $derived(
    unit.kind === 'pair' && !backup
      ? (primary?.failover?.partnerName ?? unit.backupSerial ?? 'Backup')
      : unit.kind === 'pair' && !primary
        ? (backup?.failover?.partnerName ?? unit.primarySerial ?? 'Primary')
        : '',
  );

  const overrideTags = $derived(
    [
      members.some((p) => p.overrides?.testPattern) && 'Pattern',
      members.some((p) => p.overrides?.blackout) && 'Blackout',
      members.some((p) => p.overrides?.freeze) && 'Freeze',
    ].filter((x): x is string => Boolean(x)),
  );
  const tone = $derived(status === 'ok' ? 'ok' : status === 'warn' ? 'warn' : 'fault');
  const temp = $derived(lead ? hottest(lead) : undefined);
  const devices = $derived(lead?.devices);
</script>

<a
  class="card unit"
  class:tone-warn={tone === 'warn'}
  class:tone-fault={tone === 'fault'}
  href={`/p/${encodeURIComponent(lead?.id ?? '')}`}
>
  <div class="head">
    <div>
      <div class="name">
        <span class="dot {tone}"></span>
        <h3>{title}</h3>
      </div>
      <div class="sub muted">
        {unit.kind === 'pair' ? 'Failover pair' : 'Standalone'} · {modelName(lead?.type)}
      </div>
    </div>
    <div class="tags">
      {#each overrideTags as label (label)}<span class="tag warn">{label}</span>{/each}
      {#if unitAlerts.length}
        <span
          class="tag"
          class:fault={worstSeverity(unitAlerts) === 'critical'}
          class:warn={worstSeverity(unitAlerts) !== 'critical'}
        >
          {unitAlerts.length} alert{unitAlerts.length > 1 ? 's' : ''}
        </span>
      {/if}
    </div>
  </div>

  <div class="art">
    {#if unit.kind === 'pair'}
      {#each [{ p: primary, role: 'Primary' }, { p: backup, role: 'Backup' }] as m (m.role)}
        <div class="member">
          <span class="role">{m.role}{m.p?.failover?.isActive ? ' · active' : ''}</span>
          {#if m.p}
            <ProcessorArt
              name={displayName(m.p)}
              model={modelName(m.p.type)}
              reachable={m.p.reachable}
              active={m.p.failover?.isActive}
              override={hasOverride(m.p)}
              alert={worstSeverity(alertsFor(app.state, m.p.id))}
            />
          {:else}
            <ProcessorArt name={missingName} missing />
          {/if}
        </div>
      {/each}
    {:else if lead}
      <ProcessorArt
        name={displayName(lead)}
        model={modelName(lead.type)}
        reachable={lead.reachable}
        override={hasOverride(lead)}
        alert={worstSeverity(unitAlerts)}
      />
    {/if}
  </div>

  {#if lead?.reachable}
    <div class="stats">
      <span class:dim={!lead.input?.hasSignal}><MonitorPlay size={15} /> {resolution(lead)}</span>
      {#if devices?.online !== undefined}
        <span class:bad={devices.baseline !== undefined && devices.online < devices.baseline}>
          <Boxes size={15} />
          {devices.online}{devices.baseline !== undefined ? `/${devices.baseline}` : ''}
        </span>
      {/if}
      {#if temp !== undefined}<span><Thermometer size={15} /> {Math.round(temp)}°C</span>{/if}
    </div>
  {:else}
    <div class="stats"><span class="bad">Not responding · {lead?.host}</span></div>
  {/if}
</a>

<style>
  .unit {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
  }
  .unit:active {
    background: var(--surface-2);
  }
  .name {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .head {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .sub {
    font-size: 0.8rem;
    margin-top: 2px;
    padding-left: 15px;
  }
  .head > div:first-child {
    min-width: 0;
  }
  .head h3 {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tags {
    display: flex;
    flex-shrink: 0;
    gap: 4px;
    justify-content: flex-end;
    align-items: flex-start;
    white-space: nowrap;
  }
  .art {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .member {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .role {
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--faint);
    font-weight: 600;
  }
  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    font-size: 0.85rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .stats span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .stats .dim {
    color: var(--warn);
  }
  .stats .bad {
    color: var(--fault);
  }
</style>
