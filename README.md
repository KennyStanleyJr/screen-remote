# Show Remote

Monitor and set up Brompton Tessera processors from your phone. A Raspberry Pi on the processor
network finds every processor, shows failover pairs and problems at a glance, and runs setup
commands such as test patterns, frame store, brightness, identify and a dead pixel check.

**Show Mode** is on whenever the Pi starts. While it is on, the Pi refuses every command and only
monitors. Turning it off needs the setup PIN.

- [Setup guide](docs/SETUP.md): wiring, installing on the Pi, and adding the app to phones.
- [Project brief](docs/PROJECT_BRIEF.md): requirements, Tessera API notes and scope.

## Quick start (development)

```bash
npm install
npm run dev
```

Open http://localhost:5173. This runs against eight simulated processors, and the setup PIN is
`1234`.

## Layout

| Folder               | What                                                        |
| -------------------- | ----------------------------------------------------------- |
| `shared/`            | Data model, command definitions, Tessera version profiles   |
| `server/`            | Fastify and tRPC server: discovery, polling, alerts, safety |
| `web/`               | SvelteKit PWA                                               |
| `tools/mock-tessera` | Simulated processors for development                        |
| `scripts/`           | Raspberry Pi installer                                      |
