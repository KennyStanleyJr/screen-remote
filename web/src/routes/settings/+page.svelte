<script lang="ts">
  import { Download, Lock, Plus, RefreshCw, Trash2, Unlock } from '@lucide/svelte';
  import type { AuditEntry, Settings } from '@screen-remote/shared';
  import { onMount } from 'svelte';
  import { app } from '$lib/app.svelte';
  import { ago, displayName, time } from '$lib/format';
  import { errorMessage, trpc } from '$lib/trpc';
  import { ui } from '$lib/ui.svelte';

  interface Loaded {
    settings: Settings;
    effectiveScanTargets: string[];
    profiles: { id: string; label: string; minVersion: string }[];
  }

  let data = $state<Loaded | null>(null);
  let deviceName = $state('');
  let scanText = $state('');
  let newHost = $state('');
  let audit = $state<AuditEntry[] | null>(null);
  let pinCurrent = $state('');
  let pinNext = $state('');

  const locked = $derived(!app.session?.unlocked);

  async function load() {
    data = await trpc.settings.get.query();
    scanText = data.settings.scanTargets.join('\n');
  }

  onMount(() => {
    void load();
    deviceName =
      app.session?.deviceName === 'Unnamed device' ? '' : (app.session?.deviceName ?? '');
  });

  async function guarded(fn: () => Promise<unknown>, ok?: string) {
    if (!(await app.unlock())) return;
    try {
      await fn();
      if (ok) ui.toast('ok', ok);
      await load();
    } catch (err) {
      ui.toast('error', errorMessage(err));
    }
  }

  async function saveName() {
    try {
      app.session = await trpc.session.setDeviceName.mutate({
        name: deviceName || 'Unnamed device',
      });
    } catch (err) {
      ui.toast('error', errorMessage(err));
    }
  }

  const update = (patch: Partial<Settings>) => guarded(() => trpc.settings.update.mutate(patch));

  async function forget(id: string, name: string) {
    const okd = await ui.askConfirm({
      title: `Forget ${name}?`,
      message:
        'It will be removed from the list. If it is still on the network, the next scan will find it again.',
      confirmLabel: 'Forget',
    });
    if (okd) await guarded(() => trpc.processors.forget.mutate({ id }));
  }

  async function changePin(e: SubmitEvent) {
    e.preventDefault();
    await guarded(async () => {
      await trpc.settings.changePin.mutate({ current: pinCurrent, next: pinNext });
      pinCurrent = '';
      pinNext = '';
    }, 'PIN changed');
  }
</script>

<div class="page stack">
  <h1>Settings</h1>

  <section class="card pad stack">
    <h2>This device</h2>
    <label class="stack tight">
      <span class="label">Device name (shown in the change log)</span>
      <div class="row">
        <input
          class="input"
          bind:value={deviceName}
          placeholder="e.g. Sam's phone"
          maxlength="40"
        />
        <button class="btn" onclick={saveName}>Save</button>
      </div>
    </label>
    <div class="row">
      {#if app.session?.unlocked}
        <Unlock size={18} />
        <span class="spacer">Unlocked until Show Mode is turned back on</span>
        <button class="btn small" onclick={() => app.lock()}><Lock size={15} /> Lock</button>
      {:else}
        <Lock size={18} />
        <span class="spacer muted">Locked. Settings below need the setup PIN.</span>
        <button class="btn small" onclick={() => app.unlock()}>Unlock</button>
      {/if}
    </div>
  </section>

  <section class="card pad stack">
    <div class="row">
      <h2 class="spacer">Processors</h2>
      <button
        class="btn small"
        disabled={app.state?.scan.running}
        onclick={() => trpc.processors.rescan.mutate()}
      >
        <RefreshCw size={15} />
        {app.state?.scan.running ? 'Scanning…' : 'Scan now'}
      </button>
    </div>
    <p class="muted small">
      Last scan {ago(app.state?.scan.lastRun)}{app.state?.scan.lastFound !== undefined
        ? `, found ${app.state.scan.lastFound}`
        : ''}. Scanning: <span class="mono">{data?.effectiveScanTargets.join(', ') ?? '…'}</span>
    </p>
    <ul class="procs">
      {#each app.state?.processors ?? [] as p (p.id)}
        <li>
          <span class="dot" class:ok={p.reachable}></span>
          <div class="spacer">
            <div>{displayName(p)}</div>
            <div class="muted small mono">
              {p.host}{p.port === 80 ? '' : `:${p.port}`} · {p.serial ?? 'no serial'}
            </div>
          </div>
          <button
            class="btn small ghost"
            aria-label="Forget"
            onclick={() => forget(p.id, displayName(p))}
          >
            <Trash2 size={16} />
          </button>
        </li>
      {/each}
    </ul>
    <form
      class="row"
      onsubmit={(e) => {
        e.preventDefault();
        void guarded(() => trpc.processors.add.mutate({ host: newHost.trim() })).then(
          () => (newHost = ''),
        );
      }}
    >
      <input class="input mono" bind:value={newHost} placeholder="Add by IP, e.g. 192.168.0.50" />
      <button class="btn" disabled={!newHost.trim()}><Plus size={16} /> Add</button>
    </form>
    <label class="stack tight">
      <span class="label"
        >Scan ranges (one per line, empty = 192.168.0.x, 192.168.1.x and this Pi's own networks)</span
      >
      <textarea
        class="input mono"
        rows="3"
        bind:value={scanText}
        placeholder="192.168.0.0/24&#10;10.0.10.20-80"
        disabled={locked}></textarea>
    </label>
    <button
      class="btn"
      disabled={locked}
      onclick={() =>
        update({
          scanTargets: scanText
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        })}
    >
      Save scan ranges
    </button>
  </section>

  {#if data}
    <section class="card pad stack">
      <h2>Tessera version</h2>
      <p class="muted small">
        Each processor's API profile is picked from its software version. Force one here if a new
        Tessera release is not recognised yet.
      </p>
      <select
        class="input"
        disabled={locked}
        value={data.settings.profileOverride}
        onchange={(e) => update({ profileOverride: e.currentTarget.value })}
      >
        <option value="auto">Automatic (recommended)</option>
        {#each data.profiles as p (p.id)}
          <option value={p.id}>{p.label} (from {p.minVersion})</option>
        {/each}
      </select>
      <ul class="versions">
        {#each app.state?.processors ?? [] as p (p.id)}
          <li>
            <span>{displayName(p)}</span><span class="muted"
              >{p.softwareVersion ?? '?'} → profile {p.profileId}</span
            >
          </li>
        {/each}
      </ul>
    </section>

    <section class="card pad stack">
      <h2>Alerts and safety</h2>
      <div class="grid2">
        <label class="stack tight">
          <span class="label">Warm at °C</span>
          <input
            class="input"
            type="number"
            min="30"
            max="120"
            disabled={locked}
            value={data.settings.thresholds.tempWarnC}
            onchange={(e) =>
              update({
                thresholds: {
                  ...data!.settings.thresholds,
                  tempWarnC: Number(e.currentTarget.value),
                },
              })}
          />
        </label>
        <label class="stack tight">
          <span class="label">Hot at °C</span>
          <input
            class="input"
            type="number"
            min="30"
            max="120"
            disabled={locked}
            value={data.settings.thresholds.tempCritC}
            onchange={(e) =>
              update({
                thresholds: {
                  ...data!.settings.thresholds,
                  tempCritC: Number(e.currentTarget.value),
                },
              })}
          />
        </label>
      </div>
      <label class="stack tight">
        <span class="label">Turn Show Mode back on automatically after no commands for</span>
        <select
          class="input"
          disabled={locked}
          value={data.settings.autoRelockMinutes}
          onchange={(e) => update({ autoRelockMinutes: Number(e.currentTarget.value) })}
        >
          <option value={0}>Never</option>
          {#each [15, 30, 60, 120, 240] as m (m)}<option value={m}>{m} minutes</option>{/each}
        </select>
      </label>
    </section>
  {/if}

  <section class="card pad stack">
    <h2>Setup PIN</h2>
    <form class="stack" onsubmit={changePin}>
      <div class="grid2">
        <input
          class="input"
          type="password"
          inputmode="numeric"
          placeholder="Current PIN"
          bind:value={pinCurrent}
          disabled={locked}
        />
        <input
          class="input"
          type="password"
          inputmode="numeric"
          placeholder="New PIN (4-8 digits)"
          bind:value={pinNext}
          disabled={locked}
        />
      </div>
      <button class="btn" disabled={locked || !pinCurrent || !/^\d{4,8}$/.test(pinNext)}
        >Change PIN</button
      >
    </form>
  </section>

  <section class="card pad stack">
    <div class="row">
      <h2 class="spacer">Change log</h2>
      <button
        class="btn small"
        onclick={async () => (audit = await trpc.audit.list.query({ limit: 100 }))}
      >
        {audit ? 'Refresh' : 'Show'}
      </button>
    </div>
    {#if audit}
      {#if audit.length === 0}
        <p class="muted small">Nothing yet.</p>
      {:else}
        <ul class="audit">
          {#each audit as e, i (i)}
            <li>
              <span class="muted mono">{time(e.ts)}</span>
              <span class="what">
                <b>{e.action}</b>
                {#if e.targets.length}<span class="muted">
                    · {e.targets.map((t) => t.label).join(', ')}</span
                  >{/if}
                <div class="muted small">{e.device}{e.error ? ` · ${e.error}` : ''}</div>
              </span>
              <span
                class="tag"
                class:ok={e.result === 'ok'}
                class:fault={e.result === 'error' || e.result === 'blocked'}
                class:warn={e.result === 'partial'}>{e.result}</span
              >
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </section>

  <section class="card pad stack">
    <h2>Phone setup</h2>
    <p class="muted small">
      New phone? Install the Show Remote certificate once so the app opens securely, then use "Add
      to Home Screen".
    </p>
    <a class="btn" href="/certs/rootCA.pem" download><Download size={16} /> Download certificate</a>
  </section>
</div>

<style>
  .pad {
    padding: 14px;
  }
  .small {
    font-size: 0.82rem;
    margin: 0;
  }
  .tight {
    gap: 6px;
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  textarea.input {
    resize: vertical;
  }
  .procs,
  .versions,
  .audit {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .procs li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    border-top: 1px solid var(--border);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--fault);
    flex-shrink: 0;
  }
  .dot.ok {
    background: var(--ok);
  }
  .versions li {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 0;
    border-top: 1px solid var(--border);
    font-size: 0.85rem;
  }
  .audit li {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 10px;
    align-items: start;
    padding: 8px 0;
    border-top: 1px solid var(--border);
    font-size: 0.85rem;
  }
</style>
