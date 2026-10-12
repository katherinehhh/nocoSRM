# NocoBase 3 Application

A full-stack NocoBase 3 application. The server runs on `@nocobase/app-server` and the browser client is React with Refine, shadcn/ui, and Tailwind CSS.

You own everything in this directory. Add pages, API routes, database tables, and business logic directly here — this is your application's source code, not a framework you extend from the outside.

## Default and Examples

Default provides the application shell and product capabilities without example plugins or business demo pages. Application-owned routes start empty, and new databases receive no article sample data. Its built-in Users integration lists direct Authorization Permission Sets as application roles, while access assigned to all authenticated users remains separate. Use `app-template-examples` for article management and runnable plugin demonstrations.

Existing Default installations retain their data when example plugins are unregistered. If an installation already ran the article migration, retain its original migration sources as described in the [upgrade migration rules](.agents/skills/nocobase-app-upgrade/references/edge-cases.md#migrations) before upgrading. Do not erase migration history or delete existing data to make an upgrade start.

## Getting started

Configure the application, then start the development server:

```bash
pnpm nocobase config init
pnpm nocobase config check
pnpm dev
```

`pnpm nocobase config init` writes `config.yml` from `config.example.yml`, keeping its comments and generating the first key of `secrets.keys`, which encrypts what the application stores as a secret and from which the sign-in and session keys are derived. It is only needed once; `pnpm dev` and `pnpm start` refuse to run until it has been. `pnpm nocobase config check` loads the configuration the way a start would, connects to any database other than SQLite, and reports what would stop the application from starting or quietly misbehave.

`pnpm dev` starts the API server and the Vite client together, picks free ports if the defaults are taken, and prints the URL to open. Use the printed URL rather than assuming a port.

### Develop against another backend

Set `PROXY_TARGET_URL` to the backend application's public URL, including its mount path but excluding `/api`:

```bash
# Example only: replace /main with the backend's actual public mount path.
PROXY_TARGET_URL=http://127.0.0.1:13000/main pnpm dev
```

**`/main` is the fallback, not a required or fixed path.** Local development reads `APP_BASE_PATH` from the command-line environment, then `.env.local`, then `.env`, falling back to `/main` when unset. The remote path comes from `PROXY_TARGET_URL`; it is not inferred from the local `APP_BASE_PATH`. Read the target application's actual public URL before constructing this value. If it is mounted at the origin root, use the origin URL without a mount path.

For example, these applications can use different paths:

```bash
APP_BASE_PATH=/local PROXY_TARGET_URL=http://127.0.0.1:13000/crm pnpm dev
# /local/api/users -> http://127.0.0.1:13000/crm/api/users
# /local/ws        -> ws://127.0.0.1:13000/crm/ws
```

This runs Vite with your local client source and proxies API and WebSocket requests to that application. It does not start a local backend, allocate its port, wait for its health endpoint, or watch server configuration/plugins. Existing `beforeDev` hooks still run to prepare client artifacts. Open the printed **Local** URL (the Vite port); **Backend** identifies the target.

The target can be another local project running `pnpm dev`, or an HTTP(S) deployment. Use its printed application URL, not its Vite URL. Local `APP_BASE_PATH` and the remote mount path may differ: local `/main/api/users` can map to remote `/crm/api/users`. Trailing slashes are accepted. Credentials, query strings, and fragments are not accepted in the target URL.

Requests use the remote backend's data and permissions, including writes. Only `<APP_BASE_PATH>/api` and `<APP_BASE_PATH>/ws` are proxied; application root callbacks and absolute URLs returned by the backend keep their original routing. Cookie domain/path scopes are adapted to the local application. HTTP and WebSocket requests whose Origin matches the local request's protocol and Host are forwarded with the target Origin, so browser authentication and realtime connections pass the backend's same-origin checks. Same-origin Referer URLs within the local app base are mapped to the target app base as well; requests without Origin keep it absent. Other origins and referers remain unchanged and subject to backend validation. HTTPS-only cookie requirements remain enforced, and authentication flows using explicit callback URLs still require appropriate callback configuration.

The variable can also be set in `.env` or `.env.local`; the command-line environment takes precedence. Restart `pnpm dev` after changing the target. Without this variable, development still starts both the local backend and Vite. Production builds ignore it.

Use `APP_SERVER_PORT` to choose the local application port in either development mode. With `PROXY_TARGET_URL` set, it selects Vite's preferred port (5173 when unset); without a proxy target, it selects the local backend's preferred port (13000 when unset), while Vite still starts from 5173. If the preferred port is occupied, development selects the next available port and prints the actual URL. The remote backend address is always taken from `PROXY_TARGET_URL`.

```bash
APP_SERVER_PORT=13399 PROXY_TARGET_URL=http://127.0.0.1:13000/main pnpm dev
# Local: http://127.0.0.1:13399/main/ when 13399 is available.
# Replace /main with the remote application's actual mount path.
```

### Review your configuration

`pnpm nocobase config init` wrote `config.yml` from `config.example.yml`, with a generated `secrets.keys` key filled in. It gets you running on SQLite; adjust it for your situation:

- **Database.** SQLite needs no server and works as it is. Another one means installing its driver first — `pnpm add @nocobase/db-postgres`, and `pnpm remove @nocobase/db-sqlite` if nothing else uses SQLite — then `pnpm nocobase config init --dialect postgres --force` to rewrite the connection, and `pnpm nocobase config set` for its settings, with `--from-env` for the password so it stays out of the shell history. Which dialects the application can run on is decided by what it depends on, not by this file: a driver it does not have cannot be introduced from here.
- **Change a value** with `pnpm nocobase config set key=value`, which keeps the comments and refuses a section the application does not know. Values that differ per machine — `APP_SERVER_PORT`, `APP_SERVER_HOST`, `APP_PUBLIC_ORIGIN` — are better set in the environment, which is applied over this file; `config set` says when an environment variable overrides what it wrote.
- **Where the application is served.** `APP_BASE_PATH` is the public mount path, `/main` by default, so the development URL looks like `http://127.0.0.1:13000/main/`. `APP_SERVER_PORT` and `APP_SERVER_HOST` change what the server binds to.
- **Anything a feature you enable requires** — mail delivery, IM webhooks, storage. Every section is already here, commented out where it is optional.

`config.yml` is gitignored because it holds your `secrets.keys`. Deploy it through your secret management rather than committing it.

Keep the key: what was encrypted under it cannot be read without it. To rotate it, put a new key first in `secrets.keys` with a higher version and keep the old one after it, run `pnpm nocobase secrets rotate` (`pnpm nocobase secrets status` shows what is left to reseal), then remove the old key. Changing the current key signs everyone out.

To run against a production build instead:

```bash
pnpm build
pnpm start
```

## Project structure

```text
client/                  Browser application
├── routes.ts            Your page routes
├── pages/               Your page components
├── components/          Your components
│   └── ui/              shadcn/ui primitives
├── layouts/             App layout
│   └── components/      Layout containers, navigation, branding and account controls
├── routing/             Route rendering, access checks, loading and error UI
├── locales/             Your translated strings
├── theme/               App-wide theme and light/dark selector
├── extensions/          Application-owned copies of plugin-published UI
├── plugins.ts           Which plugins the browser loads
├── react-providers.ts   Your React context providers
├── service-provider.ts  Your client startup logic
└── runtime.ts           Composition root tying the above together

server/                  API server
├── routes/              Your HTTP endpoints
├── providers/           Your services and their lifecycle
├── config/              Application configuration composition
├── plugins.ts           Which plugins the server loads
├── app.ts               Application assembly
├── runtime.ts           Composition root
├── standalone.ts        Node entry point
└── embedded.ts          Entry point when a host process mounts it

cli/                     Command line
├── plugins.ts           Which plugins contribute commands and build and dev hooks
└── commands/            Your own commands, under the app topic (created when needed)

database/
└── main/
    ├── migrations/      Your schema history (initially empty)
    └── seeds/           Your required initial data (initially empty)

tests/                   Unit and integration tests, run by Vitest
└── playwright/          Browser tests against a running application, run by Playwright
config.yml              Your configuration, written by pnpm nocobase config init; gitignored
config.example.yml       Documented configuration template
```

The three files named `runtime.ts`, `plugins.ts`, and `routes.ts` are composition roots: they list what the application is made of. Reading them tells you what is loaded and in what order.

## Scripts

`pnpm dev`, `pnpm build` and `pnpm start` are the application's scripts. Everything else is `pnpm nocobase <topic> <command>`, which pnpm resolves to the application's CLI without a script; `pnpm nocobase --help` lists them all.

### Everyday development

| Script             | What it does                                                                         |
| ------------------ | ------------------------------------------------------------------------------------ |
| `pnpm dev`         | Start the API server and client with hot reload                                      |
| `pnpm build`       | Build the client and server into `dist/`                                             |
| `pnpm start`       | Run the built server; requires `pnpm build` first                                    |
| `pnpm build --tar` | Build, then pack `dist/` and `config.example.yml` into `storage/exports/dist.tar.gz` |

### Database

| Command                              | What it does                                                                                                                                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm nocobase db apply`             | Apply pending migrations from your `database/main/migrations/` and from every registered plugin, then pending seeds from `database/main/seeds/` and from those plugins                              |
| `pnpm nocobase db reset`             | Destructive: drop every managed schema object, then rerun all migrations and seeds from empty; asks first, and needs `--force` in CI                                                                |
| `pnpm nocobase db repair`            | Realign recorded migration and seed checksums with the current sources; `--dry-run` reports without writing                                                                                         |
| `pnpm nocobase collections generate` | Write `collection.json`, `metadata.json` and `schema.json` for every Collection under `database/<connection>/collections/`, plus a `_manifest.json`; `--check` fails when the files are out of date |

Migrations and seeds also run automatically on startup while `database.connections.main.migrations.autoRun` is `true` in `config.yml`. Run `pnpm nocobase db apply` explicitly when you want to apply a change without restarting. Both halves run only what is pending, so running it on an already-migrated database applies seeds alone.

Database tasks support `--connection <name>` and `--all`; no argument targets `database.default`. Per-connection source and upgrade rules are documented in [migrations and seeds](.agents/skills/nocobase-app-development/references/migrations.md).

### Checks

| Script               | What it does                                                 |
| -------------------- | ------------------------------------------------------------ |
| `pnpm test`          | Run the test suite once                                      |
| `pnpm test:watch`    | Re-run tests as files change                                 |
| `pnpm test:coverage` | Run tests and write a coverage report                        |
| `pnpm typecheck`     | Typecheck the client, tooling, and server                    |
| `pnpm lint`          | Report lint problems                                         |
| `pnpm fix`           | Fix lint problems, then format                               |
| `pnpm check`         | Everything above plus a build; what to run before committing |

`pnpm nocobase locales check` reports a language declared in `client/locales/` but not `server/locales/`, or the reverse, and exits nonzero until the lists align. The browser builds its language picker from the client list, so a client-only language still works in the interface; server messages fall back to English and the language control explains that fallback. Add the matching server locale when server-produced text should use the same language.

### Plugins

Mail (`@nocobase/app-plugin-mail`) is included and registered on the client and server. Configure mailbox providers under `mail.providers` in `config.yml` before connecting accounts; no provider credentials or demo mailboxes are included. See the [Mail configuration guide](.agents/skills/nocobase-app-plugin-mail/references/configuration-and-accounts.md). The plugin provides services and UI components; applications compose their own mailbox pages.

Plugins add features to your application. Let these commands edit `package.json`, `client/plugins.ts`, and `server/plugins.ts` for you rather than editing those files by hand.

| Command                                  | What it does                                                |
| ---------------------------------------- | ----------------------------------------------------------- |
| `pnpm nocobase plugin register <name>`   | Install a plugin and wire it into the client and server     |
| `pnpm nocobase plugin unregister <name>` | Remove a plugin and its wiring                              |
| `pnpm nocobase plugin update [name]`     | Upgrade one or all registered plugins and re-sync skills    |
| `pnpm nocobase plugin inspect <name>`    | Report a plugin's registration state; read-only             |
| `pnpm nocobase package remove <name>`    | Remove a direct NocoBase package and its synchronized Skill |
| `pnpm nocobase skills sync`              | Sync direct NocoBase package Skills into `.agents/skills/`  |

`pnpm install` automatically runs `pnpm nocobase skills sync` through the application's `postinstall` hook. Run `pnpm nocobase skills sync` manually when install scripts were disabled or Skills need refreshing.

Use a full package name, as with `plugin register` and `plugin unregister`; short names such as `authentication` also work. The optional name is a positional argument, not `--plugin`.

```bash
pnpm nocobase plugin update @nocobase/app-plugin-authentication  # Update one registered plugin
pnpm nocobase plugin update authentication                      # Equivalent short name
pnpm nocobase plugin update                                     # Update all registered plugins
pnpm nocobase plugin update @nocobase/app-plugin-authentication --dry-run  # Preview only
```

Without a name, the command collects registered plugins from `client/plugins.ts`, `server/plugins.ts`, and `cli/plugins.ts`. It uses the application's package manager; with pnpm, `update` follows the declared version ranges without `--latest`. An unregistered name is rejected, and an application with no registered plugins is left unchanged. After a successful package update, all registered plugins' agent skills are re-synchronized, even when only one package was selected.

Ordering in `client/plugins.ts` and `server/plugins.ts` is contribution order, and a plugin is enabled by appearing in the array. Reorder entries or pass a plugin its options by hand; leave adding and removing entries to the commands.

### Removing a NocoBase package

Before removing a direct `@nocobase/*` dependency, search the application's imports, plugin registrations, routes, services, configuration keys, tests, and build scripts for references to it. Migrate or remove those references first. The removal command updates package metadata and synchronized Skills; it does not rewrite application source or configuration and cannot decide whether the capability is still required.

```bash
pnpm nocobase package remove @nocobase/example
pnpm nocobase package remove @nocobase/example --dry-run
pnpm nocobase package remove @nocobase/example --json
```

For an ordinary package, the command uses the application's package manager to remove the dependency and update both `package.json` and the lockfile, then removes only the Skill directories recorded as owned by that package. For an `@nocobase/app-plugin-*` package, it reuses the `plugin unregister` steps so Client, Server, and CLI registrations are removed together with the dependency and its Skills. `pnpm nocobase plugin unregister <name>` remains available when the task is specifically expressed as unregistering a plugin.

After an interrupted or manual removal, make sure the manifest no longer declares the package and run a full `pnpm nocobase skills sync` to reconcile stale package-owned output. Passing a package already absent from the manifest to `package remove` can clean its recorded historical Skill ownership without uninstalling any other package.

### Diagnostics

| Command                       | What it does                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm nocobase dist retarget` | Replace native binaries with the target platform's; part of `pnpm build`                    |
| `pnpm nocobase dist check`    | Check that everything your server and CLI import reaches a deployment; part of `pnpm build` |

#### Deploying to a different machine

`pnpm build` produces `dist/`, which is the whole deployment: copy it to a server and run it. The build already ran `pnpm install --prod` inside `dist/`, so the tree ships with its `node_modules` and needs no install step on the server. It also keeps its own `package.json`, so `pnpm install --prod` run inside `dist/` on the server reinstalls exactly the same set: useful when `node_modules` was left out of a copy, never required after a normal build.

Client packages are not among them. Plugins declare what their browser code needs as peer dependencies, so your application installs one shared copy for its Vite build, while `dist/` opts out of peer installation entirely — `lucide-react`, `@base-ui/react` and the rest never reach a server that has no browser in it.

**The build targets the machine you run it on**, so `pnpm build && pnpm start` works. Deploying elsewhere means saying where:

```bash
pnpm build --help                                 # all build options
pnpm build                                        # this machine
pnpm build --target linux-x64                     # most Linux servers
pnpm build --target linux-arm64                   # ARM servers, Graviton
pnpm build --target linux-x64-musl                # Alpine, and most slim container images
pnpm build --target linux-x64 --node-version 24   # explicitly target Node 24
```

A `.node` binary is compiled for one platform, architecture, C library, and Node version at once, so a build made on a Mac installs binaries a Linux server cannot load. `--target` sets platform, architecture, and C library together, because they are chosen together: `linux-x64` and `linux-x64-musl` are different binaries, and Alpine needs the musl one. If you are unsure, `ldd --version` on the server prints `musl` for musl and `GNU libc` otherwise.

`--node-version` takes the major version your server runs, separately, because the same Linux host may run any of several. The binary retargeter knows ABI mappings for 20, 22, 24, and 26; the application itself requires Node >=24.

`pnpm build --help` (or `-h`) lists build options and exits without loading build dependencies, running hooks, or modifying `dist/`. Every successful build records `nocobase.buildTarget` in `dist/package.json`, including builds with no native modules: `platform`, `arch`, `libc`, `nodeMajor`, and `nodeAbi`. Use `libc` only for Linux; its value on other platforms is a compatibility placeholder. Deployment checks should compare these fields with the host runtime and also respect `engines.node`. With `--target current` (the default), the Node version and ABI come from the running process; an explicit platform target defaults to Node 24 unless `--node-version` is supplied.

For example, `pnpm build --target linux-x64 --node-version 24` produces:

```json
{
  "nocobase": {
    "buildTarget": {
      "platform": "linux",
      "arch": "x64",
      "libc": "glibc",
      "nodeMajor": 24,
      "nodeAbi": 137
    }
  }
}
```

`nodeMajor` describes the target runtime, not the Node version used to run the build. No target patch version is implied. These fields provide platform and Node ABI checks for deployment; they do not describe system libraries, CPU instruction requirements, or other runtime prerequisites.

If your application has no native modules — `pg`, `mysql2`, and `tedious` are all plain JavaScript — no platform-specific binaries need retargeting. The build still records the selected target, and the deployment runtime must satisfy `engines.node`.

#### Serving static assets from a CDN

Set `CDN_BASE_URL` when building to use a CDN for Vite-generated asset URLs:

```bash
CDN_BASE_URL=https://cdn.example.com/my-app/v1/ pnpm build
```

Use a full HTTPS URL ending in `/`. The build reads the process environment first, then `.env.local`, then `.env`. Unset, empty or whitespace-only values keep the default relative base (`./`). Development ignores this variable. This is a build parameter, not a `config.yml` option or a runtime variable listed by `pnpm nocobase config variables` or `dist/variables.json`; changing it requires rebuilding.

Upload the static files in `dist/client/` to the configured CDN prefix, preserving their paths. For example, `dist/client/assets/index-abc.js` must be available at `https://cdn.example.com/my-app/v1/assets/index-abc.js`. Configure the CDN to allow cross-origin module and font requests from the application origin. A release-specific prefix keeps different builds separate; retain assets needed by clients still running an older release.

Keep the complete `dist/client/` tree on the application server, and serve the application's HTML through it so runtime configuration is injected. The CDN setting changes Vite-processed HTML, JavaScript and CSS resource URLs, and static files addressed with `resolveAssetUrl`, including this template's logos:

```tsx
import { resolveAssetUrl } from '@nocobase/app-client';

<img src={resolveAssetUrl('/assets/logo-mark.png')} alt='Logo' />;
```

Pass the file's path relative to `dist/client/`, with or without a leading slash. `resolveAssetUrl` reads `import.meta.env.BASE_URL`, which Vite replaces with the configured `base` during the application build; the browser does not read `CDN_BASE_URL` from the server environment. With an absolute HTTP(S) CDN base it returns the CDN URL, otherwise it falls back to `resolveAppUrl` and the runtime `APP_BASE_PATH`. Already resolved URLs are preserved. Use `resolveAppUrl` for API URLs, page links and runtime-generated resources; the CDN must actually contain a file before it can be served there.

#### Packing the build

`pnpm build --tar` writes `storage/exports/dist.tar.gz`, the artifact `@nocobase/app-installer` installs on a server.

The archive has two levels: `config.example.yml` and `dist/` sit at the root, and the build is inside `dist/`. What `dist/` holds varies with the application; this is the shape:

```text
dist.tar.gz
├── config.example.yml
└── dist/
    ├── cli/
    ├── client/
    ├── node_modules/
    ├── server/
    ├── package.json
    └── pnpm-workspace.yaml
```

Combine it with `--target` when the archive is for another machine:

```bash
pnpm build --target linux-x64 --tar
```

#### Building a Docker image

For a source build using a CDN, pass its URL as a build argument:

```bash
docker build --build-arg CDN_BASE_URL=https://cdn.example.com/my-app/v1/ -t my-app .
```

With `DIST=prebuilt`, set `CDN_BASE_URL` on the earlier `pnpm build` command instead: the image packages the existing client files unchanged. Setting `CDN_BASE_URL` on a prebuilt image build or with `docker run -e` cannot change their compiled URLs. The source build does not read the host's `.env`; use the build argument.

`Dockerfile` builds this application from its sources into a production image. From the project root:

```bash
docker build -t my-app .
```

The build runs `pnpm build` inside the container, and the image holds only `dist/` and `config.example.yml`. `Dockerfile.dockerignore` keeps `config.yml`, `.env`, `storage/`, and `node_modules` out of the build context; keep the two files together. Settings in `.env` do not reach the image, so pass them to the container as environment variables.

The client is not tied to a mount path, so choose it when starting the container, `-e APP_BASE_PATH=/crm`; the image defaults to `/main`. The build runs on the builder's own architecture and cross-targets native modules, so `docker buildx build --platform linux/amd64,linux/arm64` compiles nothing under emulation.

To package a `dist/` you have already built instead, build it for the image's platform and pass `DIST=prebuilt`. Nothing is installed or compiled in the image, and it works in any directory that holds the build:

```bash
pnpm build --target linux-x64
docker build --platform linux/amd64 --build-arg DIST=prebuilt -t my-app .
```

`--target` and `--platform` must name the same architecture: Docker otherwise builds for the machine it runs on, which on Apple silicon is `linux/arm64`. The image build fails unless `dist/` was built for `linux` with glibc, the image's architecture, and Node 24, and unless it records `nocobase.relocatable`, which an `@nocobase/app-cli` from before relocatable builds does not. `dist/.env`, which `pnpm build` fills from your local `.env` files, is never copied in. One `dist/` covers one architecture, so a multi-platform image has to be built from source.

Run it with the configuration and data mounted, never copied in:

```bash
docker run -d --init -p 13000:13000 \
  -v ./config.yml:/app/config.yml:ro \
  -v ./storage:/app/storage \
  my-app
```

The image runs as the `node` user without pnpm, so `storage/` must be writable by UID 1000, and application commands run through `node dist/cli/index.js`, as in `docker run --rm -v ./config.yml:/app/config.yml:ro my-app node dist/cli/index.js config check`.

#### Adding a dependency

Where a package goes depends on which half of your application imports it.

| Imported from                     | Declare it in     |
| --------------------------------- | ----------------- |
| `server/`, `database/`, or `cli/` | `dependencies`    |
| `client/`, build tooling, tests   | `devDependencies` |

`dist/package.json` is generated from `dependencies` and is what a server installs, so a package in `devDependencies` is missing there however well it works locally. Client packages need nothing at runtime — Vite resolves and inlines them into `dist/client` while building.

Plugins' browser packages need nothing from you: a plugin declares those as peer dependencies, so installing the plugin brings one shared copy into your application, and `dist/` never installs them.

`pnpm build` verifies the server half and fails the build if something is missing, naming the package. One case it cannot check is an import whose name is assembled while the program runs:

```ts
await import(`${name}/index.js`);
```

Nothing can tell in advance which package that names, so declare it in `dependencies` when you write the code.

#### When the build or the deployment goes wrong

**`Cannot find module` on the server, but it runs locally.** The package is in `devDependencies`, which `dist/package.json` is not generated from. Move it to `dependencies` and rebuild.

**A browser package fails to resolve while building your application.** A plugin declares it as a peer dependency and something has to provide it. Add it to your `devDependencies`.

**`Error loading shared library`, `invalid ELF header`, or a bare reference to a `.node` file at startup.** The binary does not match the server. Compare what the build targeted against the server:

```bash
node -e "console.log(require('./dist/package.json').nocobase.buildTarget)"
node -p "process.platform + '-' + process.arch"   # on the server
node -p "process.versions.modules"                # on the server: the ABI
```

Rebuild with a matching `--target` and `--node-version`. ABI 115 is Node 20, 127 is Node 22, 137 is Node 24, 147 is Node 26.

**`no prebuilt binary for <target>` during the build.** The package publishes no build for that combination. Check whether the version you depend on supports the target, and whether a musl build exists if you asked for one — musl coverage is thinner than glibc.

## Configuration

`server/config/` and `client/config/` contain editable TypeScript defaults. `config.yml` holds environment-specific overrides, written by `pnpm nocobase config init` and yours to edit from there. It is gitignored because it carries your `secrets.keys`; deploy it through your secret management rather than committing it. It is generated from `config.example.yml`, which is kept beside it as the reference for every option.

Two settings decide where the application is reachable:

- `APP_BASE_PATH` is the public path the application is mounted at, `/main` by default. The browser API base URL is derived from it as `<APP_BASE_PATH>/api`.
- `APP_PUBLIC_ORIGIN` is the external origin used to build callback and redirect URLs. Set it in production. It must not repeat the base path — the runtime joins the two.

An environment variable a section declares takes precedence over the file, and the file over the code defaults. `pnpm nocobase config env` lists the variables and whether each is set; `pnpm nocobase config variables` describes each one — what it sets, whether it is a secret, whether a deployment must supply it — and `pnpm build` writes that description to `dist/variables.json`. `DB_*` set the main database connection, `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` the first administrator, and `APP_SAMPLE_DATA=true` loads the sample data when the database is first installed. `${NAME}` in `config.yml` is not expanded.

## Testing

Tests live in `tests/`, never beside the source they cover. Put logic and integration tests under `tests/logic/` and component tests under `tests/components/`. Browser tests belong in `tests/playwright/`, which Vitest skips. Playwright does not start the application: start it first (`pnpm dev`, or `pnpm build` and then the built application), then run `pnpm test:e2e`; each test reads the application URL, including its base path, from `APP_URL`. Tests that only need a real server, real authentication, or a real database run under Vitest with `createAppTest()` from `@nocobase/app-testing/server`.

### Notification testing

With the `notification:test` `send` permission, send a real message through the durable Notification Manager with `POST <APP_BASE_PATH>/api/notifications/testSends`. `GET <APP_BASE_PATH>/api/notifications/testTargets` lists each configured channel and the fields its test takes: Email tests require an address and IM tests use the configured logical target. The server enforces the permission when the message is submitted.

## API documentation

The application documents every `/api` endpoint it serves — its own routes, every registered plugin's, the data endpoints and Better Auth's sign-in endpoints — in an OpenAPI 3.1 document:

- Swagger UI: `<origin><APP_BASE_PATH>/api/swagger/docs`, such as `http://127.0.0.1:13000/main/api/swagger/docs`
- JSON: `<origin><APP_BASE_PATH>/api/swagger`

Only a signed-in user or an API key may read them; anyone else gets `401`. Open the Swagger UI in a browser where you are signed in, or, from a script, send an API key created with `POST <APP_BASE_PATH>/api/apiKeys` in the `x-api-key` header. Swagger UI's **Authorize** button takes a key too and keeps it across reloads.

```bash
curl -H "x-api-key: <key>" http://127.0.0.1:13000/main/api/swagger
```

Replace `/main` with the application's `APP_BASE_PATH`. An application without the authentication plugin registers no way to tell who is asking, so it does not serve the documentation at all and both URLs answer `404`. There is no setting that makes it public.

## Working with an AI agent

`AGENTS.md` describes how to build features here, and `.agents/skills/` contains package-owned guidance generated by `pnpm nocobase skills sync`. Give an agent an API key when it needs to call the application: it learns the available endpoints from the API document above rather than from route sources. If you use Claude Code, `CLAUDE.md` points at the same guidance. Keep application-specific rules in committed `AGENTS.md` files because synchronization replaces package-owned Skill directories.

## License

MIT

## Runtime paths and application creation

`runtime.paths`, configuration context `paths`, and `app.paths` share one resolved `AppPaths` object. Use `paths.storage('...')`, `paths.database('...')`, or the corresponding directory fields. `AppPathOptions` is input only; application path policies run before the final object is created and configuration is loaded. Standalone entries declare the deployment root in `server/runtime.ts` so the server and CLI share persistent storage outside the compiled code directory. That storage is `storage/` under the deployment root unless `APP_STORAGE_DIR` names another directory, absolute or relative to the deployment root; set it when the deployment root itself is replaced on every release, as an installer that keeps one directory per release does.

`server/app.ts` calls `createAppFromRuntime(runtime)` to transfer configuration, paths, mode and Host logging policy and bind `runtime.app`. Keep Provider, middleware and route registration explicit and ordered; `startApplicationInScope` owns startup and shutdown binding.

## Strict startup verification

Set `NOCOBASE_STRICT_STARTUP=true` when running `pnpm dev` or `pnpm start` in automated verification. Startup failures, including job import failures, exit nonzero after resource cleanup. Strict dev runs the server without watch mode so a failed server cannot remain hidden behind a watcher; restart the command after server or configuration changes. Client HMR remains available. Omit the variable or set it to `false` for normal development with server hot reload. Request errors and individual job execution failures do not terminate the application.

## SRM 业务工作台

入口：[SRM 工作台](http://127.0.0.1:13001/main/workspace)。旧 `/` 与 `/showcase` 跳转至工作台。日常页面为采购、供应商门户、交货计划、工作看板、交货核对台账；系统配置包含用户管理、业务设置、打印模板、连接状态、模型服务、邮箱及我的 API 密钥。

### 管理账号与 API Key

- 当前超级管理员在“系统配置 → 用户管理”创建业务人员，显式选择原生角色；创建不预选管理员，也不加载示例业务。账号资料、角色及业务归属分别保存。
- 用户行菜单“业务归属”选择内部人员或活跃供应商，并显式启用业务访问；新建普通账号未绑定时不能进入业务。供应商绑定始终限制可见范围；同账号再加其他业务角色也不会突破该范围。当前业务组织为 `main`，尚未实现多组织管理。
- 账号停用与业务访问停用分别控制身份和业务范围。原生无限制管理员保留管理兜底，不能用业务归属代替原生管理员权限撤销。
- “系统配置 → 我的 API 密钥”仅管理当前账号的密钥，支持命名、有效期、改名、启停和撤销。完整密钥仅在创建后显示一次；关闭后不可找回。页面只缓存脱敏摘要，密钥不写本地存储或日志。
- 密钥继承所属账号权限，外部集成应使用权限合适的账号。调用使用 `x-api-key: <YOUR_API_KEY>`，不可放在 URL 查询参数中；接口根地址为 `<origin>/main/api`。撤销、停用或账号停用后调用失效。泄漏时检查该账号全部密钥，原生密钥可以创建后续密钥，后续密钥不会随原密钥自动撤销。

### 实际业务流程

1. 维护供应商、物料、仓库和采购订单。订单提交后由另一位有权限人员审批，再由供应商确认。
2. 创建交货计划，选择已确认或部分收货的订单，带出来源明细并核对数量、包装、日期、SKU与打印标签数量；缺少可读物料信息时须自行确认 SKU/名称。没有示例 SKU、固定30件或虚构 FNSKU 默认值。
3. 管理员在业务设置启用原生交货审批流程；提交人不能自审。流程未启用时提交报错并通过原生失败转换恢复草稿，不永久滞留待审批。瞬时启动故障由原生持久任务重试；没有流程关联的待审批记录允许提交人“重试启动审批”，使用同一事件标识避免重复流程。
4. 审批后记录发运与交货完成。交货完成不记仓库库存；仓储人员在收货单登记实际入库。
5. 在交货核对台账“登记外部回执”，填写凭证、订单总额、实际数量及原因；或接收签名外部回执。核对金额是关联采购订单总额，不是本次分批交货的结算金额；数量是按件的总数，不能证明每个 SKU 逐项一致。
6. 有差异时“确认差异处置”记录核对原因、操作者和时间，不篡改来源。当前订单、交货状态或回执变化后重新核对，历史处置仍保留。无真实回执不能冒充一致；低风险自动审批也要求真实一致回执及当前有效订单。
7. 看板按状态组织工作，可搜索服务端匹配结果。最多显示最近200条匹配记录，并提示容量；它不支持拖拽改变状态。
8. 打印模板用于实际交货汇总与标签。空 FNSKU 不生成假条码。文本型PDF提取有2MB/前10页边界，扫描件需要另配OCR。AI分析只使用已配置真实模型，不会代替用户执行审批或付款；未配置模型时禁用分析。

### 外部系统与独立财务

- 财务入口：[独立财务工作台](http://localhost:13002/main/finance)。SRM不再提供日常财务菜单、付款汇总或财务自动策略；原财务地址及历史数据保留原权限保护。隐藏菜单不是禁止旧地址访问。
- 页面跳转不传账号、令牌或业务参数，不代表两套应用已同步；财务应用可能需要单独登录。真实ERP、财务、模型、邮箱和OCR均需客户服务配置。
- 连接状态页展示签名接收与事件。回调路径 `/main/callbacks/showcase`；服务器私下配置 `SHOWCASE_WEBHOOK_SECRET`、`SHOWCASE_WEBHOOK_ORGANIZATION`。JSON包含 `eventId`、`organizationId`、`rows:[{id,amount,quantity}]`，金额为整数分，id为交货计划ID。签名头 `x-timestamp` 为13位毫秒时间戳，`x-signature` 为 `HMAC-SHA256(secret, timestamp + '.' + 原始JSON)`，有效窗口5分钟、每次最多100条；密钥不能写进版本库。
- 未配置出站适配器时只记录真实交货，不生成“外部回传成功”。历史模拟回执被明确标记并排除当前核对，不删除历史记录。演示初始化、场景、模拟同步、失败重试、宿主页及规则操作接口已下线。
- 已认证的精简嵌入看板保留 `/integrations/embed/work-board`，无模拟宿主页；真实跨站嵌入仍需双方会话和CSP配置。

### 当前运行与边界

使用原SQLite数据库、原配置和编译版本在 `127.0.0.1:13001` 运行。改造前备份位于忽略目录 `storage/srm-operational/pre-operational.sqlite`；历史采购与交货记录保留，不自动重置演示数据。新增迁移增加业务归属版本/启停、归属审计及订单来源版本，不更改已执行历史迁移。

当前为单机业务基础版，尚未实现多实例高可用、完整多计划数量预约、分项回执核对、质检退货、自动跨系统同步或交货与入库单唯一关联。默认内存任务队列与SQLite不能据此声称已完成生产运维。API Key默认沿用账号权限，不提供独立细粒度凭证权限编辑。

本次验证：17个相关测试文件共64项通过，客户端/服务端类型检查、改动文件格式与零告警lint通过，最终编译与本机启动通过。工作台、用户与密钥页面HTTP200，未登录业务/用户/密钥接口HTTP401。浏览器安全策略阻止自动访问，新页面视觉、主题、375px及实际IME尚未验证。启动仍报告历史 `202610100001_operations_roles` 种子校验值不一致；本次未修改该历史脚本，也未自动重放或修复历史种子。原生工作流/邮件等仍使用内存队列，运行边界见上文。

独立验收的主要代码问题已修复并复查。可选体验改进仍保留：用户资料失败提示目前偏通用，角色冲突“重新载入”会替换未保存的角色选择；进一步细化错误分类和重载提示可在下一次迭代完成。

## 客户演示闭环

当前实例已准备并验证采购 → 独立审批 → 供应商确认 → 交货审批 → 发运 → 完成交货 → 实际入库 → 人工回执核对闭环，另留现场演示草稿。[中文操作步骤](docs/customer-demo.zh-CN.md)说明账号、页面入口、8件差异到10件一致的演示，以及外部服务边界。新增采购审批权限为审批员的订单审批/拒绝及订单、审计、幂等记录范围，不赋予管理员角色。

### SRM 与独立财务平台联动

已接入双向签名 API 和单据追溯链接。配置、真实案例、演示身份和操作步骤见 [财务联动演示说明](docs/finance-bridge.zh-CN.md)。
