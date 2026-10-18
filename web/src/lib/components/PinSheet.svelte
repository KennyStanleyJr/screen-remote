<script lang="ts">
  import { Delete } from '@lucide/svelte';
  import { ui } from '$lib/ui.svelte';
  import Sheet from './Sheet.svelte';

  const req = $derived(ui.pin);
  let pin = $state('');

  $effect(() => {
    if (req) pin = '';
  });

  function press(d: string) {
    if (pin.length < 8) pin += d;
  }

  function submit() {
    if (pin.length >= 4) req?.resolve(pin);
  }

  function onkeydown(e: KeyboardEvent) {
    if (!req) return;
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') pin = pin.slice(0, -1);
    else if (e.key === 'Enter') submit();
  }
</script>

<svelte:window {onkeydown} />

{#if req}
  <Sheet title={req.title} onclose={() => req.resolve(null)}>
    {#if req.message}<p class="muted msg">{req.message}</p>{/if}
    <div class="dots" class:error={Boolean(req.error) && pin.length === 0}>
      {#each Array.from({ length: Math.max(4, pin.length) }, (_, i) => i) as i (i)}
        <span class:filled={i < pin.length}></span>
      {/each}
    </div>
    {#if req.error && pin.length === 0}<p class="err">{req.error}</p>{/if}
    <div class="pad">
      {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as d (d)}
        <button class="key" onclick={() => press(d)}>{d}</button>
      {/each}
      <button class="key ghost" onclick={() => (pin = pin.slice(0, -1))} aria-label="Delete">
        <Delete size={22} />
      </button>
      <button class="key" onclick={() => press('0')}>0</button>
      <button class="key go" disabled={pin.length < 4} onclick={submit}>OK</button>
    </div>
    <button class="btn ghost block" onclick={() => req.resolve(null)}>Cancel</button>
  </Sheet>
{/if}

<style>
  .msg {
    margin: 0;
  }
  .dots {
    display: flex;
    justify-content: center;
    gap: 14px;
    padding: 8px 0;
  }
  .dots span {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid var(--border-strong);
  }
  .dots span.filled {
    background: var(--accent);
    border-color: var(--accent);
  }
  .dots.error span {
    border-color: var(--fault);
  }
  .err {
    margin: -6px 0 0;
    text-align: center;
    color: var(--fault);
    font-size: 0.9rem;
  }
  .pad {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .key {
    height: 60px;
    font-size: 1.4rem;
    font-weight: 500;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .key:active {
    background: var(--surface-3);
  }
  .key.ghost {
    background: transparent;
  }
  .key.go {
    background: var(--accent);
    color: #06111f;
    font-size: 1rem;
    font-weight: 700;
  }
  .key.go:disabled {
    opacity: 0.35;
  }
</style>
