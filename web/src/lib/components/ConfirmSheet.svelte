<script lang="ts">
  import { TriangleAlert } from '@lucide/svelte';
  import { ui } from '$lib/ui.svelte';
  import Sheet from './Sheet.svelte';

  const req = $derived(ui.confirm);
  let typed = $state('');

  $effect(() => {
    if (req) typed = '';
  });

  const ready = $derived(
    !req?.typeToConfirm || typed.trim().toUpperCase() === req.typeToConfirm.toUpperCase(),
  );
</script>

{#if req}
  <Sheet title={req.title} onclose={() => req.resolve(false)}>
    <div class="row msg">
      {#if req.danger}<span class="icon"><TriangleAlert size={22} /></span>{/if}
      <p>{req.message}</p>
    </div>
    {#if req.typeToConfirm}
      <label class="stack">
        <span class="label">Type {req.typeToConfirm} to confirm</span>
        <input
          class="input mono"
          bind:value={typed}
          autocapitalize="characters"
          autocomplete="off"
        />
      </label>
    {/if}
    <div class="row">
      <button class="btn" style="flex:1" onclick={() => req.resolve(false)}>Cancel</button>
      <button
        class="btn"
        class:danger={req.danger}
        class:primary={!req.danger}
        style="flex:1"
        disabled={!ready}
        onclick={() => req.resolve(true)}
      >
        {req.confirmLabel ?? 'Confirm'}
      </button>
    </div>
  </Sheet>
{/if}

<style>
  .msg {
    align-items: flex-start;
  }
  .msg p {
    margin: 0;
  }
  .icon {
    color: var(--fault);
    flex-shrink: 0;
  }
</style>
