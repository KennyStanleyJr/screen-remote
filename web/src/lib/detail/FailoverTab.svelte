<script lang="ts">
  import { ArrowLeftRight, Power } from '@lucide/svelte';
  import type { ProcessorView } from '@screen-remote/shared';
  import { app } from '$lib/app.svelte';
  import LockedNote from '$lib/components/LockedNote.svelte';
  import ProcessorArt from '$lib/components/ProcessorArt.svelte';
  import { displayName, hasOverride, modelName } from '$lib/format';
  import { ui } from '$lib/ui.svelte';

  let { proc }: { proc: ProcessorView } = $props();

  const f = $derived(proc.failover);
  const partner = $derived(
    app.state?.processors.find((p) => p.serial && p.serial === f?.partnerSerial),
  );
  const pair = $derived(f?.role === 'backup' ? [partner, proc] : [proc, partner]);

  const modes = $derived([
    { label: 'On partner failure', on: f?.modes.onPartnerFail },
    { label: 'On partner video loss', on: f?.modes.onPartnerVideoFail },
    { label: 'On Blackout/Freeze button press', on: f?.modes.onButtonPress },
    { label: 'Prefer primary', on: f?.modes.preferPrimary },
  ]);

  async function reboot() {
    if (!app.canCommand) return;
    const pw = await ui.askText(
      `Reboot ${displayName(proc)}`,
      'Processor password (leave blank if none is set)',
      '',
      { allowEmpty: true, password: true },
    );
    if (pw === null) return;
    await app.run(
      [proc.id],
      'system.reboot',
      { password: pw || undefined },
      {
        confirm: {
          title: `Reboot ${displayName(proc)}?`,
          message:
            f?.enabled && f.isActive
              ? 'This processor is ACTIVE. Its partner should take over, but the wall may glitch.'
              : 'The processor will restart and its output will drop while it boots.',
          confirmLabel: 'Reboot',
          danger: true,
          typeToConfirm: 'REBOOT',
        },
      },
    );
  }
</script>

<div class="stack">
  {#if !f?.enabled}
    <div class="empty card">
      <ArrowLeftRight size={28} />
      <h3>Failover is off</h3>
      <p>This processor is running standalone without a backup.</p>
    </div>
  {:else}
    <section class="card pad stack">
      <div class="diagram">
        {#each pair as p, i (i)}
          <div class="member" class:active={p?.failover?.isActive}>
            <span class="label"
              >{i === 0 ? 'Primary' : 'Backup'}{p?.failover?.isActive
                ? ' · active'
                : ' · standby'}</span
            >
            {#if p}
              <a href={`/p/${encodeURIComponent(p.id)}`}>
                <ProcessorArt
                  name={displayName(p)}
                  model={modelName(p.type)}
                  reachable={p.reachable}
                  active={p.failover?.isActive}
                  override={hasOverride(p)}
                />
              </a>
            {:else}
              <ProcessorArt name={f.partnerName ?? 'Partner'} missing />
            {/if}
          </div>
          {#if i === 0}
            <div class="link" class:broken={!f.partnerPresent}>
              <ArrowLeftRight size={16} />
              <span
                >{f.partnerPresent
                  ? 'Partner linked'
                  : `Partner missing${f.partnerAbsence ? ` for ${f.partnerAbsence}` : ''}`}</span
              >
            </div>
          {/if}
        {/each}
      </div>
      <dl>
        <dt>This processor</dt>
        <dd>{f.role ?? '?'} · {f.isActive ? 'active' : 'standby'}</dd>
        <dt>Partner</dt>
        <dd>{f.partnerName ?? '–'} <span class="mono muted">{f.partnerSerial ?? ''}</span></dd>
        {#if f.partnerVideoAbsence && f.partnerVideoAbsence !== '0s'}
          <dt>Partner video lost</dt>
          <dd>{f.partnerVideoAbsence}</dd>
        {/if}
      </dl>
    </section>

    <section class="card pad stack">
      <h3>Fails over when</h3>
      <ul class="modes">
        {#each modes as m (m.label)}
          <li class:on={m.on}><span class="box">{m.on ? '✓' : ''}</span>{m.label}</li>
        {/each}
      </ul>
    </section>
  {/if}

  <section class="card pad stack danger-zone">
    <h3>Careful</h3>
    <LockedNote />
    {#if f?.enabled}
      <button
        class="btn danger block"
        disabled={!app.canCommand || !f.partnerPresent}
        onclick={() =>
          app.run(
            [proc.id],
            'failover.request',
            {},
            {
              confirm: {
                title: 'Swap active processor?',
                message: `The ${f.isActive ? 'backup' : 'other processor'} will take over driving the wall. The image may glitch briefly.`,
                confirmLabel: 'Request failover',
                danger: true,
              },
            },
          )}
      >
        <ArrowLeftRight size={16} /> Request failover
      </button>
    {/if}
    <button class="btn danger block" disabled={!app.canCommand} onclick={reboot}>
      <Power size={16} /> Reboot processor
    </button>
  </section>
</div>

<style>
  .pad {
    padding: 14px;
  }
  .empty p {
    margin: 0;
  }
  .diagram {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .member {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .member.active {
    border-color: var(--accent);
  }
  .link {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 0.8rem;
    color: var(--ok);
  }
  .link.broken {
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
    text-transform: capitalize;
  }
  .modes {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.9rem;
    color: var(--muted);
  }
  .modes li.on {
    color: var(--text);
  }
  .box {
    display: inline-flex;
    width: 18px;
    height: 18px;
    margin-right: 8px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border-strong);
    border-radius: 3px;
    font-size: 0.75rem;
    color: var(--ok);
  }
  .danger-zone {
    border-color: color-mix(in srgb, var(--fault) 35%, var(--border));
  }
</style>
