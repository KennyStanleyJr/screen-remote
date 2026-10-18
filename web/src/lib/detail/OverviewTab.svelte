<script lang="ts">
  import {
    Crosshair,
    Film,
    Info,
    MonitorPlay,
    Moon,
    OctagonAlert,
    Pause,
    Snowflake,
    TriangleAlert,
  } from '@lucide/svelte';
  import type { InputPort, ProcessorDetail, ProcessorView } from '@screen-remote/shared';
  import { patternInfo } from '@screen-remote/shared';
  import { app } from '$lib/app.svelte';
  import Gauge from '$lib/components/Gauge.svelte';
  import LockedNote from '$lib/components/LockedNote.svelte';
  import PatternThumb from '$lib/components/PatternThumb.svelte';
  import { alertsFor, displayName, unitIds, unitOf } from '$lib/format';

  let { proc, detail }: { proc: ProcessorView; detail: ProcessorDetail | null } = $props();

  const pairIds = $derived.by(() => {
    const u = unitOf(app.state, proc.id);
    return u?.kind === 'pair' ? unitIds(u) : [];
  });
  const inputs = $derived(detail?.inputs ?? []);
  const isActiveInput = (p: InputPort) =>
    proc.input?.portType === p.type && proc.input.portNumber === p.number;

  async function selectInput(p: InputPort) {
    const targets = pairIds.length === 2 ? pairIds : [proc.id];
    const names = targets.map((id) => displayName(app.processor(id))).join(' and ');
    await app.run(
      targets,
      'input.select',
      { portType: p.type, portNumber: p.number },
      {
        confirm: {
          title: `Switch to ${p.label}?`,
          message: `${names} will show whatever is on ${p.label}.${p.hasSignal ? '' : ' No signal is detected on that input right now.'}`,
          confirmLabel: `Switch to ${p.label}`,
          danger: !p.hasSignal,
        },
      },
    );
  }

  let showAllTemps = $state(false);
  const temps = $derived([...proc.temperatures].sort((a, b) => b.value - a.value));
  const visibleTemps = $derived(showAllTemps ? temps : temps.slice(0, 4));
  const alerts = $derived(alertsFor(app.state, proc.id));
  const o = $derived(proc.overrides);
  const patternName = $derived(
    typeof o?.testPatternType === 'number'
      ? (proc.frameStore.find((f) => f.frame === o.testPatternType)?.name ??
          `Frame ${o.testPatternType}`)
      : patternInfo(String(o?.testPatternType ?? '')).label,
  );
  const restoring = $derived(app.state?.pendingRestores.includes(proc.id) ?? false);
</script>

<div class="stack">
  {#if alerts.length}
    <div class="stack">
      {#each alerts as a (a.id)}
        <div class="card alert" class:tone-fault={a.severity === 'critical'}>
          <span
            class="icon-tile"
            class:fault={a.severity === 'critical'}
            class:warn={a.severity === 'warning'}
          >
            {#if a.severity === 'critical'}<OctagonAlert size={19} />
            {:else if a.severity === 'warning'}<TriangleAlert size={19} />
            {:else}<Info size={19} />{/if}
          </span>
          <div class="text">
            <b>{a.title}</b>
            <span>{a.message}</span>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <section class="card pad">
    <div class="row">
      <MonitorPlay size={18} />
      <h3>Input</h3>
    </div>
    {#if proc.input?.hasSignal}
      <div class="big">
        {proc.input.width}×{proc.input.height}<span> @ {proc.input.refreshRate} Hz</span>
      </div>
      <div class="facts">
        <span>{proc.input.portType?.toUpperCase()} {proc.input.portNumber}</span>
        {#if proc.input.bitDepth}<span>{proc.input.bitDepth}-bit</span>{/if}
        {#if proc.input.hdrFormat}<span>{proc.input.hdrFormat.replace(/-/g, ' ')}</span>{/if}
      </div>
    {:else}
      <div class="big warn">No signal</div>
      <div class="facts">
        <span>{proc.input?.portType?.toUpperCase()} {proc.input?.portNumber ?? ''}</span>
      </div>
    {/if}
    {#if inputs.length > 1}
      <div class="ports">
        {#each inputs as p (`${p.type}-${p.number}`)}
          <button
            class="port"
            class:on={isActiveInput(p)}
            disabled={!app.canCommand || isActiveInput(p)}
            onclick={() => selectInput(p)}
          >
            <b>{p.label}</b>
            <small class:sig={p.hasSignal}>
              {p.hasSignal ? `${p.width}×${p.height} ${p.refreshRate}` : 'No signal'}
            </small>
          </button>
        {/each}
      </div>
    {/if}
  </section>

  <section class="card pad stack">
    <div class="row">
      <Film size={18} />
      <h3>On screen</h3>
    </div>
    <div class="overrides">
      <button
        class="ov"
        class:on={o?.testPattern}
        disabled={!app.canCommand}
        onclick={() =>
          o?.testPattern
            ? app.run([proc.id], 'testPattern.off', {})
            : app.run([proc.id], 'testPattern.show', { type: o?.testPatternType ?? 'smpte-bars' })}
      >
        <div class="thumb">
          <PatternThumb type={o?.testPatternType ?? 'smpte-bars'} />
        </div>
        <span>Test pattern</span>
        <small>{o?.testPattern ? patternName : 'Off'}</small>
      </button>
      <button
        class="ov"
        class:on={o?.blackout}
        disabled={!app.canCommand}
        onclick={() => app.run([proc.id], 'blackout.set', { enabled: !o?.blackout })}
      >
        <div class="glyph"><Moon size={26} /></div>
        <span>Blackout</span>
        <small>{o?.blackout ? 'On' : 'Off'}</small>
      </button>
      <button
        class="ov"
        class:on={o?.freeze}
        disabled={!app.canCommand}
        onclick={() => app.run([proc.id], 'freeze.set', { enabled: !o?.freeze })}
      >
        <div class="glyph">
          {#if o?.freeze}<Snowflake size={26} />{:else}<Pause size={26} />{/if}
        </div>
        <span>Freeze</span>
        <small>{o?.freeze ? 'On' : 'Off'}</small>
      </button>
    </div>
    <LockedNote />
    <button
      class="btn block"
      disabled={!app.canCommand || restoring}
      onclick={() => app.run([proc.id], 'identify', {})}
    >
      <Crosshair size={18} />
      {restoring ? 'Identifying…' : 'Identify (flash grid for 6 s)'}
    </button>
  </section>

  <section class="card pad stack">
    <h3>Health</h3>
    <div class="gauges">
      {#each visibleTemps as t (t.key)}
        <Gauge
          label={t.label}
          value={t.value}
          max={100}
          unit="°C"
          warn={app.state?.thresholds.tempWarnC}
          crit={app.state?.thresholds.tempCritC}
        />
      {/each}
    </div>
    {#if temps.length > 4}
      <button class="btn small ghost" onclick={() => (showAllTemps = !showAllTemps)}>
        {showAllTemps ? 'Show fewer' : `Show all ${temps.length} sensors`}
      </button>
    {/if}
    {#if proc.fans.length}
      <div class="fans">
        {#each proc.fans as f (f.key)}
          <div class="fan" class:bad={f.ok === false}>
            <span class="muted">{f.label}</span>
            <b>{f.rpm !== undefined ? `${Math.round(f.rpm)} rpm` : f.ok ? 'OK' : 'Fault'}</b>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <section class="card pad">
    <dl>
      <dt>Project</dt>
      <dd>{proc.projectName ?? '–'}</dd>
      <dt>Preset</dt>
      <dd>{proc.preset.name ?? '–'}{proc.preset.number ? ` (#${proc.preset.number})` : ''}</dd>
      <dt>Uptime</dt>
      <dd>{proc.uptime ?? '–'}</dd>
      <dt>Software</dt>
      <dd>
        Tessera {proc.softwareVersion ?? '?'} <span class="muted">(profile {proc.profileId})</span>
      </dd>
      <dt>Serial</dt>
      <dd class="mono">{proc.serial ?? '–'}</dd>
      <dt>Address</dt>
      <dd class="mono">{proc.host}{proc.port === 80 ? '' : `:${proc.port}`}</dd>
    </dl>
  </section>
</div>

<style>
  .pad {
    padding: 14px;
  }
  .row h3 {
    flex: 1;
  }
  .big {
    margin-top: 8px;
    font-size: 1.5rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .big span {
    font-size: 1rem;
    color: var(--muted);
    font-weight: 500;
  }
  .big.warn {
    color: var(--warn);
  }
  .facts {
    display: flex;
    gap: 12px;
    color: var(--muted);
    font-size: 0.85rem;
    text-transform: capitalize;
  }
  .ports {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 6px;
    margin: 12px 0 8px;
  }
  .port {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 8px 10px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    text-align: left;
  }
  .port.on {
    border-color: var(--accent);
    background: var(--accent-dim);
  }
  .port:disabled {
    cursor: default;
  }
  .port small {
    color: var(--muted);
    font-size: 0.72rem;
  }
  .port small.sig {
    color: var(--ok);
  }
  .small {
    font-size: 0.85rem;
  }
  .overrides {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .ov {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px 6px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    text-align: center;
  }
  .ov.on {
    border-color: var(--warn);
    background: var(--warn-dim);
  }
  .ov:disabled {
    cursor: default;
  }
  .ov span {
    font-weight: 600;
    font-size: 0.85rem;
  }
  .ov small {
    color: var(--muted);
    font-size: 0.75rem;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ov.on small {
    color: var(--warn);
  }
  .thumb {
    width: 64px;
  }
  .glyph {
    height: 39px;
    display: flex;
    align-items: center;
    color: var(--muted);
  }
  .ov.on .glyph {
    color: var(--warn);
  }
  .gauges {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px 16px;
  }
  .fans {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 8px;
  }
  .fan {
    display: flex;
    flex-direction: column;
    font-size: 0.85rem;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .fan.bad {
    border-color: var(--fault);
    color: var(--fault);
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 16px;
    margin: 0;
    font-size: 0.9rem;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
  .alert {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 10px 12px;
    font-size: 0.9rem;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .text span {
    color: var(--muted);
  }
</style>
