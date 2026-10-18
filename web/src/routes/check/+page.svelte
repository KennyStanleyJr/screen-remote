<script lang="ts">
  import { ChevronLeft, ChevronRight, CircleCheck, ScanEye, Timer } from '@lucide/svelte';
  import { deadPixelSequence, patternInfo, type Unit } from '@screen-remote/shared';
  import { onDestroy } from 'svelte';
  import { app } from '$lib/app.svelte';
  import LockedNote from '$lib/components/LockedNote.svelte';
  import PatternThumb from '$lib/components/PatternThumb.svelte';
  import { displayName, unitIds } from '$lib/format';
  import { trpc } from '$lib/trpc';

  const hints: Record<string, string> = {
    red: 'Look for pixels that are dark or a different colour.',
    green: 'Look for pixels that are dark or a different colour.',
    blue: 'Look for pixels that are dark or a different colour.',
    white: 'Dark spots are dead pixels. Coloured spots are a dead sub-pixel.',
    black: 'Look for pixels that stay lit (stuck pixels).',
  };

  let phase = $state<'select' | 'run'>('select');
  let selected = $state<string[]>([]);
  let step = $state(0);
  let auto = $state(false);
  let seconds = $state(6);
  const FRAME_KEY = 'screenremote.check.extraFrame';
  const savedFrame = Number(localStorage.getItem(FRAME_KEY) ?? NaN);
  /** Optional stored frame (e.g. an LDM map) shown as the last step. Remembered on this device. */
  let extraFrame = $state<number | null>(Number.isInteger(savedFrame) ? savedFrame : null);
  $effect(() => {
    if (extraFrame === null) localStorage.removeItem(FRAME_KEY);
    else localStorage.setItem(FRAME_KEY, String(extraFrame));
  });
  let running: string[] = [];
  let runningSequence: (string | number)[] = $state([]);

  const units = $derived(app.state?.units ?? []);

  function unitLabel(u: Unit): string {
    const ids = unitIds(u);
    const first = app.processor(ids[0]);
    return ids.length > 1 ? `${displayName(first)} + partner` : displayName(first);
  }

  function toggle(key: string) {
    selected = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
  }

  const targets = $derived(
    units
      .filter((u) => selected.includes(u.key))
      .flatMap(unitIds)
      .filter((id) => app.processor(id)?.reachable),
  );

  const hasFrame = (id: string, frame: number) =>
    app.processor(id)?.frameStore.some((f) => f.frame === frame) ?? false;

  /** Stored frames found on any processor, by frame number. */
  const allFrames = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- rebuilt on every change, never mutated after
    const byNumber = new Map<number, string>();
    for (const p of app.state?.processors ?? []) {
      for (const f of p.frameStore) if (!byNumber.has(f.frame)) byNumber.set(f.frame, f.name);
    }
    if (extraFrame !== null && !byNumber.has(extraFrame)) {
      byNumber.set(extraFrame, `Frame ${extraFrame} (not found)`);
    }
    return [...byNumber]
      .map(([frame, name]) => ({ frame, name }))
      .sort((a, b) => a.frame - b.frame);
  });

  /** Selected processors that don't have the chosen frame; they skip that step. */
  const withoutFrame = $derived(
    extraFrame === null ? [] : targets.filter((id) => !hasFrame(id, extraFrame!)),
  );

  const sequence = $derived<(string | number)[]>(
    phase === 'run'
      ? runningSequence
      : [...deadPixelSequence, ...(extraFrame !== null ? [extraFrame] : [])],
  );
  const current = $derived(sequence[step] ?? 'white');

  function stepLabel(s: string | number): string {
    if (typeof s === 'string') return patternInfo(s).label;
    return allFrames.find((f) => f.frame === s)?.name ?? `Frame ${s}`;
  }

  async function start() {
    const res = await app.run(targets, 'patternCheck.begin', {});
    if (!res) return;
    running = targets;
    runningSequence = sequence;
    step = 0;
    phase = 'run';
    await show(0);
  }

  async function show(i: number) {
    step = i;
    const type = sequence[i]!;
    const ids = typeof type === 'number' ? running.filter((id) => hasFrame(id, type)) : running;
    await app.run(ids, 'patternCheck.step', { type });
  }

  async function finish() {
    auto = false;
    const ids = running;
    running = [];
    phase = 'select';
    await app.run(ids, 'patternCheck.end', {});
  }

  $effect(() => {
    if (!auto || phase !== 'run') return;
    const timer = setInterval(() => {
      if (step < sequence.length - 1) void show(step + 1);
      else auto = false;
    }, seconds * 1000);
    return () => clearInterval(timer);
  });

  onDestroy(() => {
    if (running.length && !app.showMode) {
      void trpc.commands.run.mutate({ targets: running, command: 'patternCheck.end', args: {} });
    }
  });
</script>

<div class="page stack">
  <div class="row">
    <ScanEye size={22} />
    <h1>Dead pixel check</h1>
  </div>

  {#if phase === 'select'}
    <p class="muted intro">
      Steps the selected processors through solid colours so you can walk the screens and spot dead
      or stuck pixels. When you finish, each processor goes back to what it was showing before.
    </p>
    <LockedNote />

    <div class="row">
      <span class="label">Processors</span>
      <div class="spacer"></div>
      <button
        class="btn small ghost"
        onclick={() => (selected = selected.length === units.length ? [] : units.map((u) => u.key))}
      >
        {selected.length === units.length ? 'Clear' : 'Select all'}
      </button>
    </div>
    <div class="list">
      {#each units as u (u.key)}
        <button class="pick" class:on={selected.includes(u.key)} onclick={() => toggle(u.key)}>
          <span class="check"
            >{#if selected.includes(u.key)}<CircleCheck size={20} />{/if}</span
          >
          <span class="spacer">{unitLabel(u)}</span>
          <span class="muted small">{unitIds(u).length} proc.</span>
        </button>
      {/each}
    </div>

    <div class="seq">
      {#each sequence as s (s)}
        <div class="mini"><PatternThumb type={s} /></div>
      {/each}
    </div>

    <label class="stack tight">
      <span class="label">Last step from the frame store (optional)</span>
      <select
        class="input"
        value={extraFrame ?? ''}
        onchange={(e) =>
          (extraFrame = e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
      >
        <option value="">None</option>
        {#each allFrames as f (f.frame)}
          <option value={f.frame}>{f.frame} · {f.name}</option>
        {/each}
      </select>
      {#if withoutFrame.length}
        <span class="warn small">
          Not in the frame store on {withoutFrame
            .map((id) => displayName(app.processor(id)))
            .join(', ')}. They'll skip that step.
        </span>
      {/if}
      <span class="muted small">
        Tessera's LDM test pattern can't be triggered over its remote API. To find which LDM a dead
        pixel is on, capture an LDM map image into the frame store on each processor and pick it
        here.
      </span>
    </label>

    <button
      class="btn primary block big"
      disabled={targets.length === 0 || !app.canCommand}
      onclick={start}
    >
      Start on {targets.length} processor{targets.length === 1 ? '' : 's'}
    </button>
  {:else}
    <div class="preview">
      <PatternThumb type={current} />
    </div>
    <div class="now">
      <div class="label">Step {step + 1} of {sequence.length}</div>
      <h2>{stepLabel(current)}</h2>
      <p class="muted">
        {typeof current === 'string'
          ? hints[current]
          : 'Note which LDM the dead pixel sits on before swapping.'}
      </p>
    </div>

    <div class="dots">
      {#each sequence as s, i (s)}
        <button
          class="dot"
          class:on={i === step}
          class:done={i < step}
          onclick={() => show(i)}
          aria-label={stepLabel(s)}
        >
          <PatternThumb type={s} />
        </button>
      {/each}
    </div>

    <div class="nav">
      <button class="btn big" disabled={step === 0} onclick={() => show(step - 1)}>
        <ChevronLeft size={22} /> Back
      </button>
      <button
        class="btn big primary"
        disabled={step === sequence.length - 1}
        onclick={() => show(step + 1)}
      >
        Next <ChevronRight size={22} />
      </button>
    </div>

    <label class="row auto">
      <input type="checkbox" bind:checked={auto} />
      <Timer size={16} /> Auto-advance every
      <select class="input sel" bind:value={seconds}>
        {#each [3, 6, 10, 20] as n (n)}<option value={n}>{n}s</option>{/each}
      </select>
    </label>

    <button class="btn block big" onclick={finish}>
      <CircleCheck size={18} /> Finish and restore
    </button>
  {/if}
</div>

<style>
  .intro {
    margin: 0;
  }
  .tight {
    gap: 6px;
  }
  .small {
    font-size: 0.8rem;
  }
  .warn {
    color: var(--warn);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .pick {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 50px;
    padding: 0 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    text-align: left;
  }
  .pick.on {
    border-color: var(--accent);
    background: var(--accent-dim);
  }
  .check {
    width: 20px;
    height: 20px;
    border: 1px solid var(--border-strong);
    border-radius: 3px;
    display: flex;
    color: var(--accent);
  }
  .pick.on .check {
    border: none;
  }
  .seq {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
  }
  .big {
    min-height: 54px;
    font-size: 1.05rem;
  }
  .preview {
    max-width: 420px;
    width: 100%;
    margin: 0 auto;
  }
  .now {
    text-align: center;
  }
  .now h2 {
    font-size: 1.6rem;
    margin: 2px 0 4px;
  }
  .now p {
    margin: 0;
  }
  .dots {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
  }
  .dot {
    padding: 3px;
    background: none;
    border: 2px solid transparent;
    border-radius: var(--radius);
    opacity: 0.55;
  }
  .dot.done {
    opacity: 0.8;
  }
  .dot.on {
    border-color: var(--accent);
    opacity: 1;
  }
  .nav {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .auto {
    justify-content: center;
    color: var(--muted);
    font-size: 0.9rem;
  }
  .sel {
    width: auto;
    min-height: 34px;
    padding: 4px 8px;
  }
</style>
