## ADDED Requirements

### Requirement: Released package interface

The deployment SHALL expose Omnigent version `0.12.0` as `packages.x86_64-linux.omnigent`, with a Linux CLI providing `server` and `host` commands.

#### Scenario: Built CLI is inspected

- **WHEN** the Linux package has been built and its CLI is invoked with `--help`
- **THEN** the command exits successfully and lists both `server` and `host`

### Requirement: Server configuration preserves shared services

The server configuration SHALL enable Omnigent at `omni.scientistexperience.net`, connect to the `omnigent` database through PostgreSQL peer authentication, retain PostgreSQL major version 16 and the existing `matrix-synapse` and `buildbot` databases, and order service startup after database setup through `postgresql.target`.
The deployment SHALL deliver cookie and client secrets through environment files associated with generators `omnigent-cookie-secret-omnigent` and `kanidm-oauth2-omnigent` without publishing their values in source or verification output.

#### Scenario: Composed server configuration is evaluated

- **WHEN** the enabled server configuration is evaluated
- **THEN** its database list contains all three databases, its PostgreSQL package version starts with `16.`, its service ordering includes `postgresql.target`, and both secret generators are present

### Requirement: Confidential authentication and app admission

The deployment SHALL configure one confidential OAuth2 client named `omnigent` with issuer `https://accounts.scientistexperience.net/oauth2/openid/omnigent`, callback `https://omni.scientistexperience.net/auth/callback`, and landing URL `https://omni.scientistexperience.net`.
Its sole group scope map SHALL be `omnigent_users = [ "openid" "profile" "email" ]`, with membership managed operationally, PKCE retained, and email-verification bypass unset.
Omnigent SHALL leave `OMNIGENT_OIDC_ALLOWED_DOMAINS` unset and use administrator roster entry `cameron.ray.smith@gmail.com`.
The server SHALL run one worker because the CLI-login ticket store is process-local.

The authentication trust boundary is the asserted identity and scope information returned by Kanidm, not independent proof that a person controls the asserted mailbox.
Primary mail administration and the empty `idm_people_self_mail_write` group remain operational obligations.
The shipped mobile WebView delegates `/auth/cli-login` to the system browser; this configuration does not establish phone or laptop passkey usability by itself.

#### Scenario: Authentication configuration is inspected

- **WHEN** the enabled server and Kanidm configuration are evaluated
- **THEN** the client, issuer, callback, landing URL, sole scope map, worker count, unset domain restriction, and administrator entry match the specified values

### Requirement: Streaming ingress configuration

The deployment SHALL expose an unproxied CNAME named `omni.scientistexperience.net` targeting `magnetite.scientistexperience.net` and an ACME-backed HTTPS nginx proxy to the loopback server.
The proxy SHALL support WebSocket upgrades and configure `proxy_read_timeout 1d;`, `proxy_send_timeout 1d;`, and `proxy_buffering off;`.

#### Scenario: Reverse proxy configuration is evaluated

- **WHEN** the endpoint's nginx virtual host is evaluated
- **THEN** HTTPS is forced, WebSocket proxying is enabled, and all three streaming directives are present

### Requirement: Foreground runner and Atomic configuration

The host service SHALL run as `cameron` in the foreground with `--server https://omni.scientistexperience.net`, without `--background` or `omnigent host enable`.
Its environment SHALL contain exactly these required values, while permitting unrelated runtime variables:

```text
PI_ACP_PI_COMMAND=atomic
PI_CODING_AGENT_DIR=/home/cameron/.atomic/agent
OMNIGENT_RUNNER_ENV_PASSTHROUGH=PI_ACP_PI_COMMAND,PI_CODING_AGENT_DIR
```

The host's configured ACP agent SHALL use this stanza:

```yaml
acp:
  agents:
    - name: Atomic
      command: bunx pi-acp@0.0.33
      omnigent_mcp: false
      inject_system_prompt: false
      env_passthrough: [PI_ACP_PI_COMMAND, PI_CODING_AGENT_DIR]
```

The service SHALL set `NoNewPrivileges = true` and omit `RestrictNamespaces`, `SystemCallFilter`, `ProtectKernelTunables`, `ProtectKernelLogs`, `ProtectHostname`, and `ProcSubset`.
Atomic and its runtime executables SHALL be available on the explicit runner PATH beside Pi and the other initially selected CLIs.

The execution boundary is the `cameron` account, not sandbox isolation for native sessions.
Adding `/nix/store` to sandbox `read_paths` exposes more readable files and weakens isolation.
No configuration assertion here guarantees an ACP session or permission round-trip end to end.

#### Scenario: Runner unit is evaluated

- **WHEN** the magnetite runner unit is evaluated
- **THEN** its user, foreground command, three required environment values, positive privilege setting, and six absent settings match the specified configuration

#### Scenario: ACP agent is configured by the operator

- **WHEN** the operator seeds the host's Omnigent configuration
- **THEN** the Atomic stanza matches the pinned command, disabled injection settings, and explicit environment passthrough names

### Requirement: Single-server clan composition

The deployment SHALL expose the omnigent clan service and bind both its server and host roles to the machine set `[ "magnetite" ]`.
The composition SHALL reject a second server with diagnostic `Omnigent requires exactly one server`.

#### Scenario: A second server is declared

- **WHEN** configuration evaluation includes a second server machine
- **THEN** evaluation fails with the specified exactly-one-server diagnostic

### Requirement: Pinned and confirmed deployment

The controller SHALL deploy only from the observed exported bookmark and verified tip SHA, using a pinned `git+file` source URL rather than the mutable working copy.
Secret generation and DNS application SHALL require their operator confirmations.
DNS application SHALL accept only a saved plan containing exactly one create of a Cloudflare DNS record named `omni.scientistexperience.net` and no other resource changes, and SHALL reject a changed saved-plan hash.
Activation evidence SHALL record the source URL, SHA, and before/after `/run/current-system` paths.

#### Scenario: DNS plan contains an unrelated resource change

- **WHEN** the saved DNS plan includes any additional resource change
- **THEN** the controller blocks instead of applying the plan

#### Scenario: Saved plan changes after review

- **WHEN** the saved plan's hash differs from its reviewed hash
- **THEN** the controller blocks instead of applying the plan

### Requirement: Acceptance evidence remains qualified

The controller SHALL record live service, discovery, nginx, runner-environment, and current-invocation host-online observations separately from human responses.
It SHALL collect `passed`, `failed`, or `not tested` for each of `laptop passkey login`, `/ui/apps tile`, `Android app login`, and `one acp:atomic session`.
Any failed response SHALL block; any untested response SHALL leave acceptance incomplete; four passed responses SHALL produce `human_attested`, never independently verified acceptance.

#### Scenario: An acceptance item is not tested

- **WHEN** an operator records `not tested` for any checklist item
- **THEN** the result retains that response and reports incomplete acceptance with a caveat

#### Scenario: All acceptance items are reported passed

- **WHEN** the operator records `passed` once for all four checklist items
- **THEN** the result reports human-attested acceptance separately from tool observations
