<script lang="ts">
  interface Props {
    type: string | number;
    label?: string;
  }
  let { type, label }: Props = $props();
  const uid = $props.id();

  const solids: Record<string, string> = {
    red: '#ff0000',
    green: '#00ff00',
    blue: '#0000ff',
    cyan: '#00ffff',
    magenta: '#ff00ff',
    yellow: '#ffff00',
    white: '#ffffff',
    black: '#000000',
  };

  const scrolling = $derived(typeof type === 'string' && type.startsWith('scrolling-'));
  const base = $derived(
    typeof type === 'number' ? 'frame' : scrolling ? type.slice('scrolling-'.length) : type,
  );
  const bars = ['#fff', '#ff0', '#0ff', '#0f0', '#f0f', '#f00', '#00f', '#000'];
  const smpte = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
  const smpteMid = ['#0000c0', '#131313', '#c000c0', '#131313', '#00c0c0', '#131313', '#c0c0c0'];
</script>

<svg viewBox="0 0 80 48" role="img" aria-label={label ?? String(type)}>
  <defs>
    <pattern id={`${uid}-grid`} width="10" height="10" patternUnits="userSpaceOnUse">
      <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#fff" stroke-width="0.8" />
    </pattern>
    <pattern
      id={`${uid}-diag`}
      width="8"
      height="8"
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(45)"
    >
      <line x1="0" y1="0" x2="0" y2="8" stroke="#fff" stroke-width="0.8" />
      <line x1="0" y1="0" x2="8" y2="0" stroke="#fff" stroke-width="0.8" />
    </pattern>
    <pattern id={`${uid}-check`} width="16" height="16" patternUnits="userSpaceOnUse">
      <rect width="16" height="16" fill="#000" />
      <rect width="8" height="8" fill="#fff" />
      <rect x="8" y="8" width="8" height="8" fill="#fff" />
    </pattern>
    <linearGradient id={`${uid}-grad`}>
      <stop offset="0" stop-color="#000" />
      <stop offset="1" stop-color="#fff" />
    </linearGradient>
    <linearGradient id={`${uid}-cgrad`}>
      <stop offset="0" stop-color="#ff8000" />
      <stop offset="1" stop-color="#0040ff" />
    </linearGradient>
  </defs>

  {#if base in solids}
    <rect width="80" height="48" fill={solids[base]} />
  {:else if base === 'grid'}
    <rect width="80" height="48" fill="#000" />
    <rect width="80" height="48" fill={`url(#${uid}-grid)`} />
  {:else if base === 'forty-five-degree-grid'}
    <rect width="80" height="48" fill="#000" />
    <rect width="80" height="48" fill={`url(#${uid}-diag)`} />
  {:else if base === 'checkerboard'}
    <rect width="80" height="48" fill={`url(#${uid}-check)`} />
  {:else if base === 'colour-bars'}
    {#each bars as c, i (i)}
      <rect x={i * 10} width="10" height="48" fill={c} />
    {/each}
  {:else if base === 'smpte-bars'}
    {#each smpte as c, i (i)}
      <rect x={(i * 80) / 7} width={80 / 7 + 0.3} height="32" fill={c} />
      <rect x={(i * 80) / 7} y="32" width={80 / 7 + 0.3} height="4" fill={smpteMid[i]} />
    {/each}
    <rect y="36" width="14" height="12" fill="#00214c" />
    <rect x="14" y="36" width="14" height="12" fill="#fff" />
    <rect x="28" y="36" width="14" height="12" fill="#32006a" />
    <rect x="42" y="36" width="38" height="12" fill="#131313" />
  {:else if base === 'gradient'}
    <rect width="80" height="48" fill={`url(#${uid}-grad)`} />
  {:else if base === 'custom-gradient'}
    <rect width="80" height="48" fill={`url(#${uid}-cgrad)`} />
  {:else if base === 'custom-colour'}
    <rect width="80" height="48" fill="#8a6d3b" />
  {:else if base === 'strobe'}
    <rect width="40" height="48" fill="#fff" />
    <rect x="40" width="40" height="48" fill="#000" />
    <path d="M44 8 L34 26 H41 L36 40 L48 20 H41 Z" fill="#d29922" />
  {:else if base === 'brompton'}
    <rect width="80" height="48" fill="#111" />
    <circle cx="40" cy="24" r="18" fill="none" stroke="#fff" stroke-width="1" />
    <line x1="0" y1="24" x2="80" y2="24" stroke="#666" stroke-width="0.6" />
    <line x1="40" y1="0" x2="40" y2="48" stroke="#666" stroke-width="0.6" />
    {#each bars.slice(0, 7) as c, i (i)}
      <rect x={19 + i * 6} y="20" width="6" height="8" fill={c} />
    {/each}
  {:else if base === 'frame'}
    <rect width="80" height="48" fill="#10151b" />
    <rect x="22" y="10" width="36" height="24" rx="1" fill="none" stroke="#4a535f" />
    <path d="M24 32 L34 22 L41 28 L47 23 L56 32 Z" fill="#2f3a46" />
    <circle cx="49" cy="16" r="2.5" fill="#4a535f" />
    <text x="40" y="44" text-anchor="middle" font-size="8" fill="#8b949e" font-family="system-ui">
      {type}
    </text>
  {:else}
    <rect width="80" height="48" fill="#1c2128" />
    {#each Array.from({ length: 6 }, (_, i) => i) as i (i)}
      <rect
        x={8 + (i % 3) * 23}
        y={8 + Math.floor(i / 3) * 18}
        width="18"
        height="13"
        fill="none"
        stroke="#4a535f"
        stroke-dasharray="2 2"
      />
    {/each}
  {/if}

  {#if scrolling}
    <rect x="58" y="34" width="18" height="11" rx="2" fill="rgba(0,0,0,0.7)" />
    <path
      d="M62 39.5 H70 M67 36.5 L70 39.5 L67 42.5"
      stroke="#fff"
      stroke-width="1.4"
      fill="none"
    />
  {/if}
</svg>

<style>
  svg {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 2px;
    border: 1px solid #2a3039;
  }
</style>
