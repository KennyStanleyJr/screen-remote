<script lang="ts">
  import type { Severity } from '@screen-remote/shared';

  interface Props {
    name: string;
    model?: string;
    reachable?: boolean;
    /** true = active, false = standby, undefined = not in a failover pair. */
    active?: boolean;
    override?: boolean;
    alert?: Severity;
    /** Draw as a dashed placeholder for a partner that was not found. */
    missing?: boolean;
  }

  let {
    name,
    model = 'SX40',
    reachable = true,
    active,
    override = false,
    alert,
    missing = false,
  }: Props = $props();

  const off = '#2b3139';
  const display = $derived(missing ? 'NOT FOUND' : !reachable ? 'NO RESPONSE' : name);
  const text = $derived(display.length > 12 ? `${display.slice(0, 11)}…` : display);
  const leds = $derived([
    {
      label: 'POWER',
      help: 'Responding on the network',
      color: reachable && !missing ? '#3fb950' : off,
    },
    {
      label: 'ACTIVE',
      help: 'Bright: driving the screens. Dim: standby in a failover pair.',
      color:
        !reachable || missing
          ? off
          : active === true
            ? '#4c9dff'
            : active === false
              ? '#24496f'
              : off,
    },
    {
      label: 'OVERRIDE',
      help: 'Test pattern, blackout or freeze is on, so the screens are not showing the input',
      color: reachable && override ? '#d29922' : off,
    },
    {
      label: 'ALERT',
      help: 'Something needs attention. See Alerts.',
      color:
        !reachable && !missing
          ? '#f85149'
          : alert === 'critical'
            ? '#f85149'
            : alert === 'warning'
              ? '#d29922'
              : off,
    },
  ]);
</script>

<svg
  viewBox="0 0 300 52"
  class:missing
  role="img"
  aria-label={`${model} ${display}`}
  preserveAspectRatio="xMidYMid meet"
>
  <!-- rack ears -->
  <rect x="0" y="0" width="14" height="52" rx="2" class="ear" />
  <rect x="286" y="0" width="14" height="52" rx="2" class="ear" />
  <circle cx="7" cy="10" r="2.2" class="hole" />
  <circle cx="7" cy="42" r="2.2" class="hole" />
  <circle cx="293" cy="10" r="2.2" class="hole" />
  <circle cx="293" cy="42" r="2.2" class="hole" />

  <!-- chassis -->
  <rect x="14" y="2" width="272" height="48" rx="3" class="chassis" />

  <!-- vents -->
  {#each Array.from({ length: 7 }, (_, i) => i) as i (i)}
    <line x1={26 + i * 5} y1="12" x2={26 + i * 5} y2="40" class="vent" />
  {/each}

  <!-- front display -->
  <rect x="68" y="11" width="94" height="30" rx="2" class="display" />
  <text
    x="115"
    y="30.5"
    text-anchor="middle"
    class="display-text"
    class:fault={!reachable && !missing}
  >
    {text}
  </text>

  <!-- status LEDs -->
  {#each leds as led, i (led.label)}
    <g>
      <title>{led.label}: {led.help}</title>
      <circle cx={179 + i * 27} cy="21" r="3.6" fill={led.color} />
      <text x={179 + i * 27} y="37" text-anchor="middle" class="led-label">{led.label}</text>
    </g>
  {/each}

  <text x="279" y="45" text-anchor="end" class="model">{model}</text>
</svg>

<style>
  svg {
    display: block;
    width: 100%;
    height: auto;
  }
  .ear {
    fill: #222831;
    stroke: #3a424d;
  }
  .hole {
    fill: #0e1013;
  }
  .chassis {
    fill: #1b2027;
    stroke: #3a424d;
  }
  .vent {
    stroke: #2c333c;
    stroke-width: 2;
  }
  .display {
    fill: #07090c;
    stroke: #2f3640;
  }
  .display-text {
    font-family: var(--mono);
    font-size: 12px;
    fill: #9fc6ff;
    letter-spacing: 0.04em;
  }
  .display-text.fault {
    fill: #f85149;
  }
  .led-label {
    font-family: var(--font);
    font-size: 5.6px;
    fill: #7d8590;
    letter-spacing: 0.04em;
  }
  .model {
    font-family: var(--font);
    font-size: 8px;
    font-weight: 700;
    fill: #5c6570;
    letter-spacing: 0.08em;
  }
  .missing .ear,
  .missing .chassis {
    fill: transparent;
    stroke-dasharray: 4 3;
  }
  .missing .vent,
  .missing .hole {
    display: none;
  }
  .missing .display-text {
    fill: #7d8590;
  }
</style>
