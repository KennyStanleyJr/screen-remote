<script lang="ts">
  import { Camera, Pencil, Power, Trash2 } from '@lucide/svelte';
  import {
    defaultProfile,
    getProfile,
    patternInfo,
    type ProcessorView,
  } from '@screen-remote/shared';
  import { app } from '$lib/app.svelte';
  import LockedNote from '$lib/components/LockedNote.svelte';
  import PatternThumb from '$lib/components/PatternThumb.svelte';
  import ScopePicker from '$lib/components/ScopePicker.svelte';
  import { displayName } from '$lib/format';
  import { ui } from '$lib/ui.svelte';

  let { proc }: { proc: ProcessorView } = $props();

  let targets = $state<string[]>([]);
  let scrolling = $state(false);
  let editing = $state(false);

  const hidden = new Set(['custom-colour']);

  const profile = $derived(getProfile(proc.profileId) ?? defaultProfile);
  const o = $derived(proc.overrides);
  const current = $derived(o?.testPattern ? o.testPatternType : undefined);
  const patterns = $derived(
    profile.testPatterns
      .filter((id) => !patternInfo(id).scrolling && !hidden.has(id))
      .map((base) => {
        const moving = `scrolling-${base}`;
        const canScroll = profile.testPatterns.includes(moving);
        return {
          base,
          id: scrolling && canScroll ? moving : base,
          active: current === base || (canScroll && current === moving),
        };
      }),
  );

  const baseOf = (id: string) => (id.startsWith('scrolling-') ? id.slice(10) : id);
  const canScroll = (base: string) => profile.testPatterns.includes(`scrolling-${base}`);

  $effect(() => {
    if (typeof current === 'string' && canScroll(baseOf(current))) {
      scrolling = current.startsWith('scrolling-');
    }
  });

  function setScrolling(on: boolean) {
    scrolling = on;
    if (typeof current !== 'string') return;
    const base = baseOf(current);
    if (canScroll(base) && current.startsWith('scrolling-') !== on) {
      void show(on ? `scrolling-${base}` : base);
    }
  }

  async function show(type: string) {
    const info = patternInfo(type);
    if (info.flashing) {
      const ok = await ui.askConfirm({
        title: 'Flashing pattern',
        message: `${info.label} flashes rapidly. Make sure nobody sensitive to flashing light is near the screens.`,
        confirmLabel: 'Show it',
      });
      if (!ok) return;
    }
    await app.run(targets, 'testPattern.show', { type });
  }

  const nextFreeSlot = $derived.by(() => {
    const used = new Set(proc.frameStore.map((f) => f.frame));
    for (let i = 1; i <= 50; i++) if (!used.has(i)) return i;
    return undefined;
  });

  async function rename(frame: number, name: string) {
    const next = await ui.askText('Rename stored frame', 'Name', name);
    if (next && next !== name) await app.run([proc.id], 'frameStore.rename', { frame, name: next });
  }

  async function capture(frame: number, overwrite: boolean) {
    await app.run(
      [proc.id],
      'frameStore.capture',
      { frame },
      {
        confirm: {
          title: overwrite ? `Overwrite frame ${frame}?` : `Capture to frame ${frame}?`,
          message: overwrite
            ? `The current output of ${displayName(proc)} will replace stored frame ${frame}. This cannot be undone.`
            : `Saves what ${displayName(proc)} is showing right now as frame ${frame}.`,
          confirmLabel: overwrite ? 'Overwrite' : 'Capture',
          danger: overwrite,
        },
      },
    );
  }

  async function remove(frame: number, name: string) {
    await app.run(
      [proc.id],
      'frameStore.delete',
      { frame },
      {
        confirm: {
          title: `Delete "${name}"?`,
          message: `Stored frame ${frame} will be deleted from ${displayName(proc)}. This cannot be undone.`,
          confirmLabel: 'Delete',
          danger: true,
          typeToConfirm: 'DELETE',
        },
      },
    );
  }
</script>

<div class="stack">
  <LockedNote />
  <ScopePicker {proc} bind:targets />

  <section class="card pad current">
    <div class="thumb">
      <PatternThumb type={o?.testPatternType ?? 'black'} />
    </div>
    <div class="spacer">
      <div class="label">Test pattern</div>
      <b>
        {#if current === undefined}Off{:else if typeof current === 'number'}
          {proc.frameStore.find((f) => f.frame === current)?.name ?? `Frame ${current}`}
        {:else}{patternInfo(current).label}{/if}
      </b>
    </div>
    <button
      class="btn"
      disabled={!app.canCommand}
      onclick={() => app.run(targets, 'testPattern.off', {})}
    >
      <Power size={16} /> Off
    </button>
  </section>

  <section class="stack">
    <div class="row">
      <h3>Patterns</h3>
      <div class="spacer"></div>
      <label class="row small muted">
        <input
          type="checkbox"
          checked={scrolling}
          onchange={(e) => setScrolling(e.currentTarget.checked)}
        /> Scrolling
      </label>
    </div>
    <div class="grid">
      {#each patterns as p (p.base)}
        <button
          class="tile"
          class:on={p.active}
          disabled={!app.canCommand}
          onclick={() => show(p.id)}
        >
          <PatternThumb type={p.id} />
          <span>{patternInfo(p.base).label}</span>
        </button>
      {/each}
    </div>
  </section>

  <section class="stack">
    <div class="row">
      <h3>Frame store</h3>
      <span class="muted small">{displayName(proc)} only</span>
      <div class="spacer"></div>
      {#if proc.frameStore.length}
        <button class="btn small ghost" onclick={() => (editing = !editing)}>
          {editing ? 'Done' : 'Edit'}
        </button>
      {/if}
    </div>
    {#if proc.frameStore.length === 0}
      <div class="empty card">No stored frames on this processor.</div>
    {:else}
      <div class="grid">
        {#each proc.frameStore as f (f.frame)}
          <div class="tile frame" class:on={current === f.frame}>
            <button
              class="hit"
              disabled={!app.canCommand || editing}
              onclick={() => app.run(targets, 'frameStore.recall', { frame: f.frame })}
            >
              <PatternThumb type={f.frame} />
              <span>{f.name}</span>
            </button>
            {#if editing}
              <div class="edit">
                <button
                  aria-label="Rename"
                  disabled={!app.canCommand}
                  onclick={() => rename(f.frame, f.name)}><Pencil size={15} /></button
                >
                <button
                  aria-label="Overwrite with current output"
                  disabled={!app.canCommand}
                  onclick={() => capture(f.frame, true)}><Camera size={15} /></button
                >
                <button
                  aria-label="Delete"
                  class="del"
                  disabled={!app.canCommand}
                  onclick={() => remove(f.frame, f.name)}><Trash2 size={15} /></button
                >
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
    {#if nextFreeSlot !== undefined}
      <button
        class="btn block"
        disabled={!app.canCommand}
        onclick={() => capture(nextFreeSlot, false)}
      >
        <Camera size={16} /> Capture current output to frame {nextFreeSlot}
      </button>
    {/if}
  </section>
</div>

<style>
  .pad {
    padding: 14px;
  }
  .small {
    font-size: 0.85rem;
  }
  .current {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .current .thumb {
    width: 80px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 8px;
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-size: 0.78rem;
    text-align: left;
  }
  .tile span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted);
  }
  .tile.on {
    border-color: var(--accent);
    background: var(--accent-dim);
  }
  .tile.on span {
    color: var(--text);
  }
  .tile:disabled {
    cursor: default;
  }
  .frame {
    padding: 0;
  }
  .frame .hit {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px;
    background: none;
    border: none;
    text-align: left;
    font-size: inherit;
  }
  .edit {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border-top: 1px solid var(--border);
  }
  .edit button {
    display: flex;
    justify-content: center;
    padding: 8px 0;
    background: none;
    border: none;
    border-right: 1px solid var(--border);
    color: var(--muted);
  }
  .edit button:last-child {
    border-right: none;
  }
  .edit .del {
    color: var(--fault);
  }
</style>
