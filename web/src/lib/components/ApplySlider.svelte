<script lang="ts">
  interface Props {
    label: string;
    value: number | undefined;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    disabled?: boolean;
    onapply: (value: number) => void;
  }
  let { label, value, min, max, step = 1, unit = '', disabled = false, onapply }: Props = $props();

  let draft = $state<number | null>(null);
  const shown = $derived(draft ?? value ?? min);
  const dirty = $derived(draft !== null && draft !== value);

  function apply() {
    if (draft === null) return;
    onapply(draft);
    draft = null;
  }
</script>

<div class="slider">
  <div class="top">
    <span class="label">{label}</span>
    <span class="val" class:dirty>
      {value === undefined && draft === null ? '–' : shown}{unit}
    </span>
  </div>
  <div class="row">
    <input
      type="range"
      {min}
      {max}
      {step}
      value={shown}
      {disabled}
      oninput={(e) => (draft = Number(e.currentTarget.value))}
      aria-label={label}
    />
    <button class="btn small" class:primary={dirty} disabled={!dirty || disabled} onclick={apply}>
      Apply
    </button>
    {#if dirty}
      <button class="btn small ghost" onclick={() => (draft = null)}>Reset</button>
    {/if}
  </div>
</div>

<style>
  .slider {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .val {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .val.dirty {
    color: var(--accent);
  }
</style>
