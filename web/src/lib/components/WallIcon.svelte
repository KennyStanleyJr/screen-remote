<script lang="ts">
  interface Props {
    cols?: number;
    rows?: number;
    /** 0-1 brightness used to tint the panels. */
    level?: number;
    width?: number;
  }
  let { cols = 6, rows = 3, level = 0.6, width = 96 }: Props = $props();
  const cell = 10;
  const w = $derived(cols * cell + 2);
  const h = $derived(rows * cell + 2);
  const fill = $derived(`color-mix(in srgb, #4c9dff ${Math.round(15 + level * 45)}%, #0e1013)`);
</script>

<svg viewBox={`0 0 ${w} ${h + 8}`} {width} aria-hidden="true">
  {#each Array.from({ length: cols * rows }, (_, i) => i) as i (i)}
    <rect
      x={1 + (i % cols) * cell}
      y={1 + Math.floor(i / cols) * cell}
      width={cell - 1}
      height={cell - 1}
      {fill}
      stroke="#0e1013"
      stroke-width="0.6"
    />
  {/each}
  <rect x={w / 2 - 1.5} y={h} width="3" height="6" fill="#3a424d" />
  <rect x={w / 2 - 10} y={h + 6} width="20" height="2" fill="#3a424d" />
</svg>
