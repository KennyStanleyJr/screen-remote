<script lang="ts">
  let { size = 28 }: { size?: number } = $props();
</script>

<svg viewBox="0 0 30 30" width={size} height={size} aria-hidden="true">
  <rect x="1" y="1" width="28" height="28" rx="1.5" fill="#1b2027" stroke="#3a424d" />
  {#each Array.from({ length: 16 }, (_, i) => i) as i (i)}
    <circle cx={6 + (i % 4) * 6} cy={6 + Math.floor(i / 4) * 6} r="1.4" fill="#4a535f" />
  {/each}
</svg>
