<script lang="ts">
  import { CircleCheck, OctagonAlert, TriangleAlert, Info } from '@lucide/svelte';
  import { app } from '$lib/app.svelte';
  import { ago, displayName } from '$lib/format';

  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 10_000);
    return () => clearInterval(t);
  });

  const alerts = $derived(app.state?.alerts ?? []);
</script>

<div class="page stack">
  <h1>Alerts</h1>

  {#if alerts.length === 0}
    <div class="empty card">
      <span class="ok"><CircleCheck size={36} /></span>
      <h2>All clear</h2>
      <p>Every processor is responding with no problems detected.</p>
    </div>
  {:else}
    <div class="list">
      {#each alerts as a (a.id)}
        {@const p = app.processor(a.processorId)}
        <a
          class="card alert"
          class:tone-fault={a.severity === 'critical'}
          href={p ? `/p/${encodeURIComponent(p.id)}` : undefined}
        >
          <span
            class="icon-tile"
            class:fault={a.severity === 'critical'}
            class:warn={a.severity === 'warning'}
          >
            {#if a.severity === 'critical'}<OctagonAlert size={19} />
            {:else if a.severity === 'warning'}<TriangleAlert size={19} />
            {:else}<Info size={19} />{/if}
          </span>
          <div class="spacer">
            <div class="row">
              <b>{a.title}</b>
              <span class="spacer"></span>
              <span class="muted small">{ago(a.since, now)}</span>
            </div>
            <div class="muted msg">{a.message}</div>
            {#if p}<div class="small proc">{displayName(p)}</div>{/if}
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>

<style>
  .ok {
    color: var(--ok);
  }
  .empty p {
    margin: 0;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .alert {
    display: flex;
    gap: 12px;
    padding: 12px 14px;
  }
  .msg {
    font-size: 0.9rem;
    margin-top: 2px;
  }
  .small {
    font-size: 0.78rem;
  }
  .proc {
    margin-top: 6px;
    color: var(--accent);
  }
</style>
