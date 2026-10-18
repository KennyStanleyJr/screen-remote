<script lang="ts">
  import { ui } from '$lib/ui.svelte';
  import Sheet from './Sheet.svelte';

  const req = $derived(ui.text);
  let value = $state('');

  $effect(() => {
    if (req) value = req.value;
  });

  const ready = $derived(Boolean(req?.allowEmpty) || value.trim().length > 0);

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (ready) req?.resolve(value.trim());
  }
</script>

{#if req}
  <Sheet title={req.title} onclose={() => req.resolve(null)}>
    <form class="stack" onsubmit={submit}>
      <label class="stack">
        <span class="label">{req.label}</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input
          class="input"
          type={req.password ? 'password' : 'text'}
          bind:value
          maxlength={req.password ? 128 : 40}
          autocomplete="off"
          autofocus
        />
      </label>
      <div class="row">
        <button type="button" class="btn" style="flex:1" onclick={() => req.resolve(null)}>
          Cancel
        </button>
        <button type="submit" class="btn primary" style="flex:1" disabled={!ready}>
          {req.password ? 'Continue' : 'Save'}
        </button>
      </div>
    </form>
  </Sheet>
{/if}
