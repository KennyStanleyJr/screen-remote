<script lang="ts">
  import type { GroupItem, ProcessorDetail, ProcessorView } from '@screen-remote/shared';
  import { app } from '$lib/app.svelte';
  import ApplySlider from '$lib/components/ApplySlider.svelte';
  import LockedNote from '$lib/components/LockedNote.svelte';
  import WallIcon from '$lib/components/WallIcon.svelte';
  import { unitIds, unitOf } from '$lib/format';

  let { proc, detail }: { proc: ProcessorView; detail: ProcessorDetail | null } = $props();
  const pairIds = $derived.by(() => {
    const u = unitOf(app.state, proc.id);
    return u?.kind === 'pair' ? unitIds(u) : [];
  });
  const targets = $derived(pairIds.length === 2 ? pairIds : [proc.id]);
  const out = $derived(detail?.output);

  const brightnessOf = (g: GroupItem) => (g.override ? g.brightness : out?.brightness) ?? 0;

  function summary(g: GroupItem): string {
    if (!g.override) return `Follows processor · ${out?.brightness ?? '–'} nits`;
    return `Own settings · ${g.brightness ?? '–'} nits · ${g.colourTemperature ?? '–'} K`;
  }
</script>

<div class="stack">
  <LockedNote />
  {#if !detail}
    <div class="empty">Loading screens…</div>
  {:else if detail.groups.length === 0}
    <div class="empty card">
      <WallIcon cols={5} rows={2} level={0.2} />
      <h3>No screen groups</h3>
      <p>
        This project has no Tessera groups. Create a group per screen in Tessera to adjust screens
        individually here.
      </p>
    </div>
  {:else}
    <div class="groups">
      {#each detail.groups as g (g.number)}
        <section class="card group">
          <div class="head">
            <WallIcon level={Math.min(1, brightnessOf(g) / 2000)} width={72} />
            <div class="spacer">
              <b>{g.name}</b>
              <div class="muted small" class:own={g.override}>{summary(g)}</div>
            </div>
          </div>
          <div class="stack body">
            {#if g.override !== undefined}
              <div class="seg" role="radiogroup" aria-label="Colour settings for {g.name}">
                <button
                  role="radio"
                  aria-checked={!g.override}
                  class:on={!g.override}
                  disabled={!app.canCommand || !g.override}
                  onclick={() =>
                    app.run(targets, 'group.override', { group: g.number, enabled: false })}
                >
                  Follow processor
                </button>
                <button
                  role="radio"
                  aria-checked={g.override}
                  class:on={g.override}
                  disabled={!app.canCommand || g.override}
                  onclick={() =>
                    app.run(targets, 'group.override', { group: g.number, enabled: true })}
                >
                  Own settings
                </button>
              </div>
            {/if}
            <div class="stack sliders" class:inactive={g.override === false}>
              <ApplySlider
                label="Brightness"
                value={g.brightness}
                min={0}
                max={Math.max(5000, g.brightness ?? 0)}
                step={10}
                unit=" nits"
                disabled={!app.canCommand || g.override === false}
                onapply={(nits) => app.run(targets, 'group.brightness', { group: g.number, nits })}
              />
              <ApplySlider
                label="Colour temperature"
                value={g.colourTemperature}
                min={2000}
                max={11000}
                step={100}
                unit=" K"
                disabled={!app.canCommand || g.override === false}
                onapply={(kelvin) =>
                  app.run(targets, 'group.colourTemperature', { group: g.number, kelvin })}
              />
              {#if g.gamma !== undefined}
                <ApplySlider
                  label="Gamma"
                  value={g.gamma}
                  min={1}
                  max={4}
                  step={0.05}
                  disabled={!app.canCommand || g.override === false}
                  onapply={(gamma) => app.run(targets, 'group.gamma', { group: g.number, gamma })}
                />
              {/if}
            </div>
            <p class="muted small note">
              {g.override === false
                ? 'Following the processor (Output tab). Choose Own settings to use these values.'
                : 'These values replace the processor settings for this screen.'}
            </p>
          </div>
        </section>
      {/each}
    </div>
  {/if}
</div>

<style>
  .small {
    font-size: 0.85rem;
  }
  .own {
    color: var(--accent);
  }
  .empty p {
    margin: 0;
    max-width: 340px;
  }
  .groups {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 10px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 14px;
  }
  .body {
    padding: 0 14px 14px;
  }
  .sliders.inactive {
    opacity: 0.5;
  }
  .seg {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .seg button {
    min-height: 40px;
    background: none;
    border: none;
    color: var(--muted);
    font-weight: 600;
    font-size: 0.85rem;
  }
  .seg button + button {
    border-left: 1px solid var(--border-strong);
  }
  .seg button.on {
    background: var(--accent-dim);
    color: var(--text);
  }
  .seg button:disabled {
    cursor: default;
  }
  .note {
    margin: 0;
    min-height: 2.6em;
  }
</style>
