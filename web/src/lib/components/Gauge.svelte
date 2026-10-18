<script lang="ts">
  interface Props {
    label: string;
    value: number;
    min?: number;
    max: number;
    unit?: string;
    warn?: number;
    crit?: number;
  }
  let { label, value, min = 0, max, unit = '', warn, crit }: Props = $props();

  const pct = $derived(Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)));
  const level = $derived(
    crit !== undefined && value >= crit
      ? 'fault'
      : warn !== undefined && value >= warn
        ? 'warn'
        : 'ok',
  );
</script>

<div class="gauge">
  <div class="top">
    <span class="name">{label}</span>
    <span class="val {level}">{Math.round(value * 10) / 10}{unit}</span>
  </div>
  <div class="track">
    <div class="bar {level}" style:width={`${pct}%`}></div>
    {#if warn !== undefined}<div
        class="mark"
        style:left={`${((warn - min) / (max - min)) * 100}%`}
      ></div>{/if}
  </div>
</div>

<style>
  .gauge {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .top {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
  }
  .name {
    color: var(--muted);
  }
  .val {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .val.warn {
    color: var(--warn);
  }
  .val.fault {
    color: var(--fault);
  }
  .track {
    position: relative;
    height: 6px;
    background: var(--surface-3);
    border-radius: 2px;
    overflow: hidden;
  }
  .bar {
    height: 100%;
    background: var(--ok);
    opacity: 0.85;
  }
  .bar.warn {
    background: var(--warn);
  }
  .bar.fault {
    background: var(--fault);
  }
  .mark {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--muted);
    opacity: 0.6;
  }
</style>
