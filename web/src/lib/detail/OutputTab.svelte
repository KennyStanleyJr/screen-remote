<script lang="ts">
  import { Check, Pencil, Sun } from '@lucide/svelte';
  import type { ProcessorDetail, ProcessorView } from '@screen-remote/shared';
  import { app } from '$lib/app.svelte';
  import { ui } from '$lib/ui.svelte';
  import ApplySlider from '$lib/components/ApplySlider.svelte';
  import LockedNote from '$lib/components/LockedNote.svelte';
  import ScopePicker from '$lib/components/ScopePicker.svelte';

  let { proc, detail }: { proc: ProcessorView; detail: ProcessorDetail | null } = $props();
  let targets = $state<string[]>([]);
  let editing = $state(false);
  const out = $derived(detail?.output);

  async function rename(number: number, name: string) {
    const next = await ui.askText('Rename preset', 'Name', name);
    if (next && next !== name) await app.run(targets, 'preset.rename', { number, name: next });
  }
  const maxNits = $derived(
    out?.brightnessLimitEnabled && out.brightnessLimitValue ? out.brightnessLimitValue : 5000,
  );
</script>

<div class="stack">
  <LockedNote />
  <ScopePicker {proc} bind:targets />

  {#if !detail}
    <div class="empty">Loading output settings…</div>
  {:else}
    <section class="card pad stack">
      <div class="row">
        <Sun size={18} />
        <h3>Output colour</h3>
      </div>
      <ApplySlider
        label="Brightness"
        value={out?.brightness}
        min={0}
        max={Math.max(maxNits, out?.brightness ?? 0)}
        step={10}
        unit=" nits"
        disabled={!app.canCommand}
        onapply={(nits) => app.run(targets, 'output.brightness', { nits })}
      />
      <ApplySlider
        label="Colour temperature"
        value={out?.colourTemperature}
        min={2000}
        max={11000}
        step={100}
        unit=" K"
        disabled={!app.canCommand}
        onapply={(kelvin) => app.run(targets, 'output.colourTemperature', { kelvin })}
      />
      <ApplySlider
        label="Gamma"
        value={out?.gamma}
        min={1}
        max={4}
        step={0.05}
        disabled={!app.canCommand}
        onapply={(gamma) => app.run(targets, 'output.gamma', { gamma })}
      />
      {#if out?.brightnessLimitEnabled}
        <p class="muted small">Brightness limit is on at {out.brightnessLimitValue} nits.</p>
      {/if}
    </section>

    <section class="card pad">
      <h3>Signal</h3>
      <dl>
        <dt>Genlock</dt>
        <dd>
          {out?.genlockSource?.replace(/-/g, ' ') ?? '–'}{out?.genlockSource === 'internal' &&
          out.genlockInternalRate
            ? ` (${out.genlockInternalRate} Hz)`
            : ''}
        </dd>
        <dt>Output bit depth</dt>
        <dd>{out?.bitDepth ?? '–'}-bit</dd>
        <dt>Frame rate multiplier</dt>
        <dd>{out?.frameRateMultiplier ?? '–'}×</dd>
      </dl>
    </section>

    <section class="stack">
      <div class="row">
        <h3 class="spacer">Presets</h3>
        {#if detail.presets.length}
          <button class="btn small ghost" onclick={() => (editing = !editing)}>
            {editing ? 'Done' : 'Edit'}
          </button>
        {/if}
      </div>
      {#if detail.presets.length === 0}
        <div class="empty card">No presets on this processor.</div>
      {:else}
        <div class="presets">
          {#each detail.presets as p (p.number)}
            {@const active = proc.preset.number === p.number}
            <div class="preset" class:on={active}>
              <button
                class="hit"
                disabled={!app.canCommand || active || editing}
                onclick={() => app.run(targets, 'preset.recall', { number: p.number })}
              >
                <span class="num">{p.number}</span>
                <span class="name">{p.name}</span>
                {#if active}<Check size={16} />{/if}
              </button>
              {#if editing}
                <button
                  class="edit"
                  aria-label="Rename"
                  disabled={!app.canCommand}
                  onclick={() => rename(p.number, p.name)}><Pencil size={15} /></button
                >
              {/if}
            </div>
          {/each}
        </div>
      {/if}
      <p class="muted small">
        Recalling a preset applies the settings saved in it. New presets are saved in Tessera
        itself; the processor's remote API can recall and rename presets but not create or overwrite
        them.
      </p>
    </section>
  {/if}
</div>

<style>
  .pad {
    padding: 14px;
  }
  .small {
    font-size: 0.85rem;
    margin: 0;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 16px;
    margin: 10px 0 0;
    font-size: 0.9rem;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    text-transform: capitalize;
  }
  .presets {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .preset {
    display: flex;
    align-items: stretch;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .preset.on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .hit {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
    padding: 0 12px;
    background: none;
    border: none;
    color: inherit;
    text-align: left;
  }
  .hit:disabled {
    cursor: default;
  }
  .edit {
    width: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    border-left: 1px solid var(--border);
    color: var(--muted);
  }
  .num {
    width: 28px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .name {
    flex: 1;
  }
</style>
