<script lang="ts">
  import '../app.css';
  import { Bell, ScanEye, Server, Settings } from '@lucide/svelte';
  import { onMount, type Snippet } from 'svelte';
  import { pwaInfo } from 'virtual:pwa-info';
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import { app } from '$lib/app.svelte';
  import ConfirmSheet from '$lib/components/ConfirmSheet.svelte';
  import ModeIndicator from '$lib/components/ModeIndicator.svelte';
  import PinSheet from '$lib/components/PinSheet.svelte';
  import ShowModeToggle from '$lib/components/ShowModeToggle.svelte';
  import TextSheet from '$lib/components/TextSheet.svelte';
  import Toasts from '$lib/components/Toasts.svelte';

  let { children }: { children: Snippet } = $props();

  const manifestLink = $derived(pwaInfo ? pwaInfo.webManifest.linkTag : '');

  let scroller: HTMLElement | undefined = $state();
  /** Content scrolls inside `main`, not the window, so reset it on new pages. */
  afterNavigate(({ type }) => {
    if (type !== 'popstate') scroller?.scrollTo({ top: 0 });
  });

  onMount(() => {
    app.start();
    if (pwaInfo) {
      void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
    }
  });

  const mode = $derived(!app.connected ? 'offline' : app.showMode ? 'show' : 'setup');
  $effect(() => {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', mode === 'show' ? '#3a1517' : '#0e1013');
  });
  const alertCount = $derived(app.state?.alerts.length ?? 0);
  const critical = $derived(app.state?.alerts.some((a) => a.severity === 'critical') ?? false);

  const nav = [
    { href: '/', label: 'Processors', icon: Server },
    { href: '/alerts', label: 'Alerts', icon: Bell },
    { href: '/check', label: 'Pixel check', icon: ScanEye },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  function active(href: string): boolean {
    const path = page.url.pathname;
    return href === '/' ? path === '/' || path.startsWith('/p/') : path.startsWith(href);
  }
</script>

<svelte:head>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html manifestLink}
</svelte:head>

<div class="shell">
  <header class={mode}>
    <a href="/" class="brand" aria-label="Screen Remote">
      <img src="/icons/icon.svg" alt="" width="24" height="24" />
      <span>Screen Remote</span>
    </a>
    <ModeIndicator {mode} />
    <div class="spacer"></div>
    <ShowModeToggle />
  </header>

  <main bind:this={scroller}>
    {@render children()}
  </main>

  <nav>
    {#each nav as item (item.href)}
      <a href={item.href} class:active={active(item.href)}>
        <span class="icon">
          <item.icon size={22} />
          {#if item.href === '/alerts' && alertCount > 0}
            <span class="badge" class:critical>{alertCount}</span>
          {/if}
        </span>
        <span>{item.label}</span>
      </a>
    {/each}
  </nav>
</div>

<PinSheet />
<ConfirmSheet />
<TextSheet />
<Toasts />

<style>
  /*
   * The app is a fixed full-screen frame: header, scrolling content, nav. Bottom-fixed elements
   * drift above the screen edge in iOS home-screen apps, so the nav is laid out, not fixed.
   */
  .shell {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
  }
  main {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  header {
    flex-shrink: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: calc(10px + var(--safe-top)) 16px 10px;
    background: rgba(14, 16, 19, 0.92);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--border);
    transition:
      background-color 200ms,
      border-color 200ms;
  }
  header.show {
    background: color-mix(in srgb, #3a1517 92%, transparent);
    border-bottom: 2px solid var(--fault);
  }
  header.setup {
    border-bottom: 2px solid var(--warn);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .brand img {
    border-radius: 3px;
  }
  .brand::after {
    content: '';
    width: 1px;
    height: 24px;
    margin-left: 4px;
    background: var(--border-strong);
  }
  @media (max-width: 560px) {
    .brand span {
      display: none;
    }
  }
  nav {
    flex-shrink: 0;
    z-index: 20;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    height: calc(var(--nav-h) + var(--safe-bottom));
    padding-bottom: var(--safe-bottom);
    background: var(--surface);
    border-top: 1px solid var(--border);
  }
  nav a {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    font-size: 0.7rem;
    color: var(--muted);
  }
  nav a.active {
    color: var(--accent);
  }
  .icon {
    position: relative;
    display: flex;
  }
  .badge {
    position: absolute;
    top: -5px;
    right: -10px;
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
    border-radius: 3px;
    background: var(--warn);
    color: #111;
    font-size: 0.68rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .badge.critical {
    background: var(--fault);
    color: #fff;
  }
</style>
