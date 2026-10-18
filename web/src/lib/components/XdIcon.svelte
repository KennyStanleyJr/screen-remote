<script lang="ts">
  let { ok = true, size = 56 }: { ok?: boolean; size?: number } = $props();
</script>

<svg viewBox="0 0 64 30" width={size} height={(size * 30) / 64} aria-hidden="true">
  <rect x="1" y="1" width="62" height="28" rx="2" fill="#1b2027" stroke="#3a424d" />
  <rect x="6" y="7" width="12" height="16" rx="1" fill="#07090c" stroke="#2f3640" />
  <circle cx="12" cy="15" r="2.2" fill={ok ? '#3fb950' : '#f85149'} />
  {#each Array.from({ length: 10 }, (_, i) => i) as i (i)}
    <rect
      x={24 + (i % 5) * 7.4}
      y={i < 5 ? 7 : 17}
      width="5"
      height="6"
      rx="0.8"
      fill="#0e1013"
      stroke="#4a535f"
      stroke-width="0.8"
    />
  {/each}
</svg>
