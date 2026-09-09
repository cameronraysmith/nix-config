# buzz-relay — the Buzz Nostr relay, git server and media host.
#
# DELIBERATELY SHIPPED DISABLED. Importing this module changes nothing; every
# unit, firewall hole and secret below sits behind `services.buzz-relay.enable`,
# which defaults to false and is not set on any host. The module exists so the
# configuration surface is reviewable and the credential slots are declared
# before anything is switched on, not because the relay is ready to run.
#
# Three operational prerequisites are unmet, and each is its own change:
#
#   1. Object storage. The relay hard-requires an S3-compatible store — media
#      storage init is fatal at startup (`main.rs:444-448` at upstream
#      6e5c462: `config.media.validate()` then `MediaStorage::new`, both
#      `?`-propagating) and there is no feature flag that disables media. Worse,
#      the git object store runs a *conformance probe* at boot
#      (`BUZZ_GIT_CONFORMANCE_PROBE`, default ON, `main.rs:498-516`) that races
#      32 writers for 3 rounds against the bucket to prove compare-and-swap
#      semantics. A store that merely speaks S3 is not enough; it has to pass
#      that probe. Which bucket, on which provider, with what consistency
#      guarantees, is undecided.
#   2. Redis. Required (`config.rs:515`, and the relay's pubsub/registry paths
#      assume it). This fleet has never run Redis as a daemon class — there is
#      no precedent, no hardening baseline and no backup story for it here.
#   3. Backups. There is no backup system on this fleet at all: magnetite has
#      local ZFS snapshots and explicitly no off-site replication. The relay's
#      Postgres holds the community, membership and signed-auth history, which
#      is exactly the class of state that must not live on one disk.
#
# Postgres, Redis and object storage are therefore modelled here as
# DEPENDENCIES AND OPTIONS. This module provisions none of them: no
# `services.postgresql` colonisation, no `services.redis`, no bucket. It states
# what it needs and asserts when enabled without it.
#
# There is also no nginx vhost, no DNS record and no tenant hostname in this
# change. That is deliberate and load-bearing rather than an omission: the Host
# derived from `RELAY_URL` is the durable tenant key. It is persisted as
# `communities.host` in Postgres and signed into every NIP-42/NIP-98 auth event,
# so it cannot be renamed later without invalidating history. `relayUrl` below
# consequently has NO DEFAULT and is required at enable time.
#
# See docs/notes/development/buzz/self-hosting.md.
{ ... }:
{
  flake.modules.nixos.buzz-relay =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    let
      cfg = config.services.buzz-relay;

      # IPv6 literals must be bracketed before they are joined to a port, and
      # the mesh addresses this fleet binds are IPv6 (modules/lib/hosts.nix).
      bindTarget =
        if lib.hasInfix ":" cfg.bindAddress then
          "[${cfg.bindAddress}]:${toString cfg.port}"
        else
          "${cfg.bindAddress}:${toString cfg.port}";

      # The /64 ZeroTier prefix of this fleet's mesh, mirroring
      # modules/nixos/cognee.nix. The no-public-bind assertion admits loopback
      # or any address inside this prefix.
      ztPrefix = "fddb:4344:343b:14b9:";
      isLoopbackOrMesh =
        addr: addr == "127.0.0.1" || addr == "::1" || addr == "localhost" || lib.hasPrefix ztPrefix addr;

      # Typed options are rendered first, then `settings` last, so an operator
      # can override any of them without a module edit — the escape hatch
      # modules/nixos/cognee.nix:144-156 uses. Values are stringified here
      # because the relay reads everything through `std::env::var`.
      #
      # Booleans are emitted as exactly "true"/"false". The relay has at least
      # five distinct boolean dialects (`BUZZ_AUTO_MIGRATE` takes true/1/yes/on
      # at main.rs:29-36; `Config::parse_bool` takes true/1/on plus
      # false/0/off/""; many vars are a bare `== "true" || == "1"`;
      # `BUZZ_GIT_CONFORMANCE_PROBE` is `!= "false"`; `BUZZ_HUDDLE_AUDIO_AVAILABLE`
      # is `!(== "false" || == "0")`). Only the literal strings "true" and
      # "false" are read identically by all five.
      renderValue =
        value:
        if lib.isBool value then
          (if value then "true" else "false")
        else if lib.isInt value then
          toString value
        else
          value;

      typedEnvironment = {
        BUZZ_BIND_ADDR = bindTarget;
        BUZZ_HEALTH_PORT = toString cfg.healthPort;
        BUZZ_METRICS_PORT = toString cfg.metricsPort;
        RELAY_URL = cfg.relayUrl;
        DATABASE_URL = cfg.database.url;
        REDIS_URL = cfg.redis.url;
        BUZZ_S3_ENDPOINT = cfg.objectStore.endpoint;
        BUZZ_S3_BUCKET = cfg.objectStore.bucket;
        BUZZ_S3_ADDRESSING_STYLE = cfg.objectStore.addressingStyle;
        BUZZ_AUTO_MIGRATE = if cfg.autoMigrate then "true" else "false";
        # Forced on. Upstream defaults this to false, and false is the branch
        # that selects a hardcoded, published dev keypair (0000…0001) when no
        # private key is supplied (main.rs:419-440). The identity generator
        # below always supplies one, so this only converts a silent dev-key
        # fallback into a loud startup failure. Overridable through `settings`,
        # which renders last.
        BUZZ_REQUIRE_AUTH_TOKEN = "true";
        # `create_dir_all`'d by the relay at startup (config.rs:414-432), and
        # relative to CWD if left unset — the "./repos" default at
        # config.rs:820-822 — which under systemd would be `/`.
        BUZZ_GIT_REPO_PATH = "${cfg.stateDir}/git";
      }
      // lib.optionalAttrs (cfg.objectStore.region != null) {
        BUZZ_S3_REGION = cfg.objectStore.region;
      }
      // lib.optionalAttrs (cfg.adminHost != null) { BUZZ_ADMIN_HOST = cfg.adminHost; };

      environment = typedEnvironment // (lib.mapAttrs (_: renderValue) cfg.settings);

      # Copied from modules/nixos/omnigraph.nix. AF_UNIX is retained because the
      # relay can serve an additional listener on a Unix domain socket
      # (`BUZZ_UDS_PATH`), and because Postgres over a local socket needs it.
      hardening = {
        CapabilityBoundingSet = [ "" ];
        DeviceAllow = "";
        DevicePolicy = "closed";
        LockPersonality = true;
        MemoryDenyWriteExecute = true;
        NoNewPrivileges = true;
        PrivateDevices = true;
        PrivateTmp = true;
        PrivateUsers = true;
        ProcSubset = "pid";
        ProtectClock = true;
        ProtectControlGroups = true;
        ProtectHome = true;
        ProtectHostname = true;
        ProtectKernelLogs = true;
        ProtectKernelModules = true;
        ProtectKernelTunables = true;
        ProtectProc = "invisible";
        ProtectSystem = "strict";
        RemoveIPC = true;
        RestrictAddressFamilies = [
          "AF_INET"
          "AF_INET6"
          "AF_UNIX"
        ];
        RestrictNamespaces = true;
        RestrictRealtime = true;
        RestrictSUIDSGID = true;
        SystemCallArchitectures = "native";
        SystemCallFilter = [
          "@system-service"
          "~@resources"
          "~@privileged"
        ];
        UMask = "0077";
      };
    in
    {
      options.services.buzz-relay = {
        # The typed set below is chosen on one rule: an option is typed if
        # getting it wrong is either unrecoverable or silent. That yields three
        # groups.
        #
        #   Unrecoverable — `relayUrl` (the tenant key, signed into auth events
        #   and persisted as communities.host, so effectively immutable after
        #   first boot) and `database.*` (the relay's only durable store).
        #
        #   Silently wrong — `bindAddress`/`port` (a public bind succeeds
        #   silently under ip_nonlocal_bind=1, so it needs a build-time gate,
        #   which needs a typed value to gate on), `objectStore.*` (dev defaults
        #   `buzz_dev`/`buzz_dev_secret` against localhost:9000 mean an
        #   unconfigured relay fails at the probe rather than at config parse),
        #   and `autoMigrate` (off by default, so a fresh database silently
        #   serves against an unmigrated schema).
        #
        #   Interface contract — `healthPort`/`metricsPort` (both bind 0.0.0.0
        #   unconditionally, so the firewall must know them), `adminHost` (the
        #   admin surface is inert until set, so its presence is a security
        #   decision), `stateDir`, and `openFirewall`.
        #
        # Everything else — the ~90 remaining variables: rate limits, media size
        # caps, pool sizes, background-task intervals, mesh, push, join policy,
        # OTEL — is reachable through `settings`, which renders last and can
        # override any of the above.

        enable = lib.mkEnableOption ''
          the Buzz relay.

          Off by default and not enabled on any host. See the header comment in
          modules/nixos/buzz-relay.nix for the object-store, Redis and backup
          prerequisites that must land before this is switched on
        '';

        package = lib.mkPackageOption pkgs "buzz-relay" { };

        relayUrl = lib.mkOption {
          type = lib.types.str;
          example = "wss://buzz.example.net";
          description = ''
            Public WebSocket URL clients reach this relay on. Required: there is
            deliberately no default.

            This is the single most consequential setting in the module, and it
            is effectively immutable after first boot. The relay derives the
            deployment community's host from it and seeds it into Postgres as
            `communities.host`, and that host is then embedded in every signed
            NIP-42 and NIP-98 auth event. Changing it later does not rename a
            deployment; it orphans the existing community row and invalidates
            the signed history against it.

            The scheme is load-bearing too, not cosmetic: it drives the
            expected-URL reconstruction both auth schemes verify against, so a
            TLS-terminated deployment must say `wss://`, never `ws://`.

            Upstream's default is `ws://localhost:3000`, which is why this
            option refuses to default — inheriting that default would produce a
            relay that starts, serves, and writes a permanent `localhost`
            tenant row.
          '';
        };

        bindAddress = lib.mkOption {
          type = lib.types.str;
          default = "127.0.0.1";
          description = ''
            Address the application listener (WebSocket + REST) binds. An IPv6
            literal is bracketed automatically when `BUZZ_BIND_ADDR` is
            assembled.

            Constrained by an assertion to loopback or the ZeroTier mesh prefix.
            Upstream defaults to `0.0.0.0`, which this module does not inherit.
          '';
        };

        port = lib.mkOption {
          type = lib.types.port;
          default = 3000;
          description = "Port the application listener binds.";
        };

        healthPort = lib.mkOption {
          type = lib.types.port;
          default = 8080;
          description = ''
            Port of the separate health router, serving `/_liveness`,
            `/_readiness` and `/_status`.

            Note this listener binds `0.0.0.0` unconditionally — the address is
            hardcoded, not derived from
            {option}`services.buzz-relay.bindAddress`. Containment is therefore
            a firewall matter, which is why this port is typed: the mesh-scoped
            firewall rule below has to name it.
          '';
        };

        metricsPort = lib.mkOption {
          type = lib.types.port;
          default = 9102;
          description = ''
            Port of the Prometheus `/metrics` listener. Like the health
            listener, this binds `0.0.0.0` unconditionally regardless of
            {option}`services.buzz-relay.bindAddress`.
          '';
        };

        adminHost = lib.mkOption {
          type = lib.types.nullOr lib.types.str;
          default = null;
          example = "admin.buzz.example.net";
          description = ''
            Authority (host, optionally `host:port`, with no scheme, path, `@`
            or backslash) that serves the bundled admin SPA and the admin API.

            Left null the entire admin surface is inert and unrouted, which is
            the default posture. Setting it is a security decision, not a
            cosmetic one: it exposes the operator API, gated by NIP-98
            signatures from the configured operator pubkeys rather than by any
            shared secret this module could hold.
          '';
        };

        autoMigrate = lib.mkOption {
          type = lib.types.bool;
          default = false;
          description = ''
            Whether to run the embedded sqlx migrations at startup
            (`BUZZ_AUTO_MIGRATE`).

            Upstream defaults this off and then *continues starting anyway*,
            logging only "Skipping database migrations because BUZZ_AUTO_MIGRATE
            is not enabled". A fresh database therefore does not fail loudly; it
            serves against a schema that does not exist yet and fails later, in
            request paths. The alternative is running `buzz-admin migrate` out
            of band before first start.

            Left off here to match upstream rather than to recommend it: turning
            it on couples schema change to unit restart, which is a deployment
            policy decision for whoever enables this relay.
          '';
        };

        stateDir = lib.mkOption {
          type = lib.types.str;
          default = "/var/lib/buzz-relay";
          description = ''
            Writable state directory, created by systemd via `StateDirectory=`.

            Holds the git scratch tree (`BUZZ_GIT_REPO_PATH`, set to `git/`
            beneath this) and its pack cache. Upstream is explicit that this
            tree "need not be persistent or shared across replicas" — repository
            name uniqueness lives in Postgres, not here — so it is a cache in
            the durability sense even though it is stored under
            `/var/lib`. Backups do not need to cover it; Postgres and the object
            store are the authoritative state.
          '';
        };

        openFirewall = lib.mkOption {
          type = lib.types.bool;
          default = true;
          description = ''
            Whether to open the application, health and metrics ports on the
            ZeroTier mesh interface (`zt+`) only, never globally.

            Health and metrics are included because both listeners bind
            `0.0.0.0` regardless of
            {option}`services.buzz-relay.bindAddress`, so the interface-scoped
            rule is the only thing containing them.
          '';
        };

        database = {
          url = lib.mkOption {
            type = lib.types.str;
            example = "postgres://buzz@localhost:5432/buzz";
            description = ''
              libpq connection URL for the relay's PostgreSQL database
              (`DATABASE_URL`). Required: there is deliberately no default,
              because upstream's is `postgres://buzz:buzz_dev@localhost:5432/buzz`
              — a real URL with a dev password that would be silently inherited.

              This module provisions no database. Postgres must already exist,
              with the `buzz` role and database created and the `pgcrypto`
              extension available, before the relay is enabled. Connecting is
              fatal at startup with no retry: `Db::new` failing aborts the
              process, which is why the unit below disables systemd's start
              rate limiter.

              Do not put the password in this URL — it would land in the Nix
              store, world-readable. The `buzz-relay-db-password` generator
              below supplies it as `PGPASSWORD` through an `EnvironmentFile`
              instead; a peer-authenticated local socket also works.
            '';
          };

          host = lib.mkOption {
            type = lib.types.str;
            default = "localhost";
            description = ''
              Hostname of the PostgreSQL server, used to order the unit after a
              local `postgresql.service` and to document the dependency. Purely
              declarative — the relay itself reads only
              {option}`services.buzz-relay.database.url`.
            '';
          };
        };

        redis = {
          url = lib.mkOption {
            type = lib.types.str;
            example = "redis://localhost:6379";
            description = ''
              Redis connection URL (`REDIS_URL`). Redis is a hard runtime
              requirement, not an optional cache.

              This module provisions nothing: it neither enables
              `services.redis` nor asserts that a local instance exists, because
              the URL may legitimately point off-host. Required: there is
              deliberately no default, because this fleet runs no Redis at all,
              so an operator enabling the relay must supply a reachable one
              rather than inherit a localhost address nothing is listening on.

              A password belongs in an `EnvironmentFile` override of `REDIS_URL`
              rather than here, since this value reaches the Nix store.
            '';
          };
        };

        objectStore = {
          endpoint = lib.mkOption {
            type = lib.types.str;
            example = "https://accountid.r2.cloudflarestorage.com";
            description = ''
              Endpoint URL of the S3-compatible object store
              (`BUZZ_S3_ENDPOINT`). Required: no default, because upstream's is
              `http://localhost:9000` — a MinIO dev endpoint that an
              unconfigured relay would silently address.

              The backend is deliberately pluggable rather than pinned to a
              provider. Whatever is chosen must survive the git object-store
              conformance probe the relay runs at boot, which races concurrent
              writers to prove compare-and-swap semantics; eventual-consistency
              stores fail it.
            '';
          };

          bucket = lib.mkOption {
            type = lib.types.str;
            example = "buzz-media";
            description = ''
              Bucket holding media and git objects (`BUZZ_S3_BUCKET`).
              Required: upstream defaults to `buzz-media`, which would be
              inherited silently.
            '';
          };

          region = lib.mkOption {
            type = lib.types.nullOr lib.types.str;
            default = null;
            example = "auto";
            description = ''
              Value of `BUZZ_S3_REGION`. Left null the relay falls back to
              `AWS_REGION` and then to `us-east-1`, which most non-AWS
              S3-compatible stores reject.
            '';
          };

          addressingStyle = lib.mkOption {
            type = lib.types.enum [
              "path"
              "virtual"
            ];
            default = "path";
            description = ''
              Bucket addressing style (`BUZZ_S3_ADDRESSING_STYLE`). Path-style
              matches MinIO and most self-hosted stores; AWS S3 proper and
              several CDN-fronted providers want virtual-host style.
            '';
          };
        };

        settings = lib.mkOption {
          type = lib.types.attrsOf (
            lib.types.oneOf [
              lib.types.str
              lib.types.int
              lib.types.bool
            ]
          );
          default = { };
          example = {
            BUZZ_REQUIRE_AUTH_TOKEN = true;
            BUZZ_REQUIRE_RELAY_MEMBERSHIP = true;
            RELAY_OWNER_PUBKEY = "0000…";
            BUZZ_PUSH_GATEWAY_DELIVERY_URL = "";
            BUZZ_MAX_CONNECTIONS = 10000;
            RUST_LOG = "buzz_relay=info";
          };
          description = ''
            Free-form environment variables for the relay, rendered last into
            the unit environment and therefore able to override any value the
            typed options above produce.

            The relay is configured exclusively through environment variables —
            no config file, no CLI flags, roughly 110 variables in total. The
            typed options cover the dozen or so that are unrecoverable or
            silently wrong when misconfigured; everything else (rate limits,
            media size caps, pool sizes, background-task intervals, join policy,
            mesh, push, OTEL) belongs here.

            Booleans are rendered as the literal strings `true` and `false`,
            which is the only form every one of the relay's several boolean
            parsers agrees on. Integers are rendered with `toString`.

            Nothing secret may go here: these values are rendered into the unit
            file in the Nix store, which is world-readable. Secrets belong in an
            `EnvironmentFile`.

            Two entries worth knowing about when this relay is eventually
            switched on. `BUZZ_PUSH_GATEWAY_DELIVERY_URL` defaults to a live
            third-party endpoint at `https://push.buzz.xyz`, so a self-hosted
            deployment that does not want outbound calls there must set it to
            the empty string. And `BUZZ_REPLICA_HEAD_MAX_AGE_SECS` is a renamed
            variable whose mere presence is a hard startup error — setting it
            here is a way to make the relay refuse to boot.
          '';
        };
      };

      config = lib.mkIf cfg.enable {
        assertions = [
          {
            assertion = cfg.relayUrl != "";
            message = ''
              services.buzz-relay.relayUrl is empty. It is the relay's public
              WebSocket URL, and the Host derived from it becomes the durable
              tenant key: it is persisted as communities.host and signed into
              every NIP-42/NIP-98 auth event, so it cannot be changed later
              without orphaning that community and invalidating its signed
              history. Choose it before first boot.
            '';
          }
          {
            assertion = lib.hasPrefix "wss://" cfg.relayUrl || lib.hasPrefix "ws://" cfg.relayUrl;
            message = ''
              services.buzz-relay.relayUrl (${cfg.relayUrl}) must be a ws:// or
              wss:// URL. Its scheme drives the expected-URL reconstruction that
              NIP-42 and NIP-98 verify signatures against, so an http:// or
              bare-host value does not merely look wrong, it fails
              authentication at runtime. Any TLS-terminated deployment must say
              wss://.
            '';
          }
          {
            # Mirrors the cognee no-public-bind gate. Load-bearing because
            # magnetite retains net.ipv6.ip_nonlocal_bind=1, under which
            # binding an address the host does not hold succeeds silently
            # instead of failing at startup.
            assertion = isLoopbackOrMesh cfg.bindAddress;
            message = ''
              buzz-relay no-public-bind invariant violated: bindAddress must be
              loopback (127.0.0.1/::1) or inside the ZeroTier prefix
              ${ztPrefix}*/64. Resolved bindAddress = ${cfg.bindAddress}.

              A public bind would be silent under the retained
              ip_nonlocal_bind=1 rather than failing at startup. Public reach
              belongs behind the nginx reverse proxy, which is a separate
              change from this one.

              Note that the health (${toString cfg.healthPort}) and metrics
              (${toString cfg.metricsPort}) listeners bind 0.0.0.0
              unconditionally and cannot be constrained this way; the
              mesh-scoped firewall rule is what contains them.
            '';
          }
          {
            assertion = cfg.objectStore.endpoint != "" && cfg.objectStore.bucket != "";
            message = ''
              services.buzz-relay.objectStore.endpoint and .bucket must both be
              set. The relay hard-requires an S3-compatible object store —
              media storage initialisation is fatal at startup and there is no
              flag that disables media — and upstream's defaults are a MinIO
              dev endpoint (http://localhost:9000, bucket buzz-media) that would
              otherwise be inherited silently.
            '';
          }
          {
            assertion = cfg.database.url != "";
            message = ''
              services.buzz-relay.database.url is empty. This module provisions
              no PostgreSQL: the database, the role and the pgcrypto extension
              must already exist. Connecting is fatal at startup with no retry,
              so an unreachable database means the unit fails rather than
              degrades.
            '';
          }
          {
            assertion = !(lib.hasInfix "buzz_dev" cfg.database.url);
            message = ''
              services.buzz-relay.database.url appears to contain upstream's dev
              password (buzz_dev). Beyond being the published default, any
              password written into this option is rendered into the Nix store
              and is world-readable on the host. The password is supplied as
              PGPASSWORD by the buzz-relay-db-password generator below; a
              peer-authenticated local socket also works.
            '';
          }
          {
            assertion = cfg.redis.url != "";
            message = ''
              services.buzz-relay.redis.url is empty. Redis is a hard runtime
              requirement of the relay, not an optional cache, and this module
              provisions none — no services.redis is enabled anywhere in this
              fleet. A reachable Redis must be supplied before the relay is
              enabled.
            '';
          }
        ];

        # Credential slots. Generator names are effectively immutable once
        # minted: renaming one orphans the encrypted material committed under
        # vars/per-machine/<host>/<generator>/. They are therefore named
        # `buzz-relay-<subject>`, matching the service name rather than the
        # upstream variable name, so that a rename or re-prefix upstream does
        # not strand this fleet's sops material.

        # Relay Nostr identity: a 32-byte secp256k1 secret key as 64 lowercase
        # hex characters. Auto-generated because upstream NEVER generates or
        # persists one. With the variable unset the relay either falls back to a
        # hardcoded, published dev key (0000…0001, when BUZZ_REQUIRE_AUTH_TOKEN
        # is false) or panics outright (when it is true) — there is no keyfile
        # path option and no random-and-save branch, despite a stale doc comment
        # upstream claiming "a fresh keypair is generated at startup".
        #
        # The key must be stable across restarts: it signs the NIP-43 events
        # that membership mode verifies, and a rotated key makes every
        # previously signed event unverifiable. `openssl rand -hex 32` follows
        # the niks3-api-token / sso-cookie-secret pattern, and is uniform over
        # the secp256k1 key space for all practical purposes.
        clan.core.vars.generators.buzz-relay-identity = {
          files."env" = {
            restartUnits = [ "buzz-relay.service" ];
          };
          runtimeInputs = [ pkgs.openssl ];
          script = ''
            printf 'BUZZ_RELAY_PRIVATE_KEY=%s\n' "$(openssl rand -hex 32)" > "$out/env"
          '';
        };

        # Git hook HMAC secret. Auto-generated to fix a fail-silent upstream
        # default: with the variable unset the relay mints a random 32-byte
        # secret on every boot (`rand::random()` then hex-encoded) and logs
        # nothing at all about having done so — unlike the relay keypair, which
        # at least warns. Every restart therefore silently invalidates
        # outstanding hook signatures.
        #
        # Upstream validates a *supplied* value at >= 32 characters. 32 random
        # bytes rendered as 64 hex characters clears that and matches the length
        # of the value upstream generates for itself.
        clan.core.vars.generators.buzz-relay-git-hook-hmac = {
          files."env" = {
            restartUnits = [ "buzz-relay.service" ];
          };
          runtimeInputs = [ pkgs.openssl ];
          script = ''
            printf 'BUZZ_GIT_HOOK_HMAC_SECRET=%s\n' "$(openssl rand -hex 32)" > "$out/env"
          '';
        };

        # PostgreSQL role password, in cognee-db-password's dual shape: one
        # generated value emitted twice. The `password` file exists so that the
        # later provisioning change can set the role password from it (an ALTER
        # ROLE in a postgresql-setup ExecStartPost, owned by whichever change
        # actually creates the database); the `env` fragment is what the relay
        # reads, and it has no *_FILE variant, so its copy must be a KEY=value
        # line.
        #
        # PGPASSWORD rather than an interpolated DATABASE_URL: sqlx populates
        # the password from it when the URL does not carry one, and it keeps the
        # password out of the store-resident URL entirely instead of requiring
        # the URL to be assembled at runtime.
        #
        # restartUnits names only buzz-relay.service: this module creates no
        # postgresql.service, so naming one here would be a restart request for
        # a unit it does not own.
        clan.core.vars.generators.buzz-relay-db-password = {
          files."password" = {
            owner = "postgres";
            restartUnits = [ "buzz-relay.service" ];
          };
          files."env" = {
            restartUnits = [ "buzz-relay.service" ];
          };
          runtimeInputs = [ pkgs.openssl ];
          script = ''
            password=$(openssl rand -hex 32)
            printf '%s' "$password" > "$out/password"
            printf 'PGPASSWORD=%s\n' "$password" > "$out/env"
          '';
        };

        # Object store credentials, following the omnigraph-r2 prompt pattern
        # (modules/machines/nixos/magnetite/default.nix:264-302): these are
        # minted in a provider's dashboard, not derivable on the host, so the
        # generator prompts for them once rather than inventing a value.
        #
        # Emitted as a single `env` file rather than separate
        # access-key/secret-key files because the relay has no *_FILE variants
        # and reads both only from the process environment. That `env` file is
        # wired into EnvironmentFile below, so this prompt is the only place an
        # operator supplies these — there is deliberately no second, manual
        # credentials-path option competing with it.
        clan.core.vars.generators.buzz-relay-object-store = {
          prompts.access-key = {
            description = ''
              Access key ID for the S3-compatible object store backing the buzz
              relay's media and git objects, scoped read/write on the relay's
              bucket.
            '';
            type = "hidden";
            persist = true;
            display = {
              group = "buzz-relay";
              label = "BUZZ_S3_ACCESS_KEY";
            };
          };

          prompts.secret-key = {
            description = "Secret access key paired with the access key ID above.";
            type = "hidden";
            persist = true;
            display = {
              group = "buzz-relay";
              label = "BUZZ_S3_SECRET_KEY";
            };
          };

          files.access-key.deploy = false;
          files.secret-key.deploy = false;

          files."env" = {
            restartUnits = [ "buzz-relay.service" ];
          };

          script = ''
            {
              printf 'BUZZ_S3_ACCESS_KEY=%s\n' "$(cat "$prompts/access-key")"
              printf 'BUZZ_S3_SECRET_KEY=%s\n' "$(cat "$prompts/secret-key")"
            } > "$out/env"
          '';
        };

        systemd.services.buzz-relay = {
          description = "Buzz relay";
          wantedBy = [ "multi-user.target" ];
          after = [
            "network-online.target"
          ]
          ++ lib.optional (
            cfg.database.host == "localhost" || cfg.database.host == "127.0.0.1"
          ) "postgresql.service";
          wants = [ "network-online.target" ];

          inherit environment;

          # The relay shells out to the git binary in roughly nineteen places
          # across its CAS-publish, hydrate and transport paths, and resolves it
          # by name. Without git on PATH those paths fail at runtime rather than
          # at startup.
          path = [ pkgs.git ];

          serviceConfig = hardening // {
            # `exec`, not `notify`: the relay implements no sd_notify handshake
            # (nothing in the workspace links libsystemd or reads NOTIFY_SOCKET)
            # and takes no arguments. `exec` at least defers "started" until
            # after a successful execve, which `simple` does not.
            Type = "exec";
            ExecStart = lib.getExe' cfg.package "buzz-relay";

            # Every secret the relay needs arrives here, and each one comes from
            # a clan-vars generator rather than an operator-managed path: the
            # sops-backed lane is the only one that keeps this material out of
            # the Nix store and out of a committed file.
            EnvironmentFile = [
              config.clan.core.vars.generators.buzz-relay-identity.files."env".path
              config.clan.core.vars.generators.buzz-relay-git-hook-hmac.files."env".path
              config.clan.core.vars.generators.buzz-relay-db-password.files."env".path
              config.clan.core.vars.generators.buzz-relay-object-store.files."env".path
            ];

            StateDirectory = "buzz-relay";
            WorkingDirectory = cfg.stateDir;

            # No LoadCredential here, deliberately. It is this fleet's usual
            # pairing with DynamicUser — staging happens root-side before
            # privilege drop, so a credential's ownership does not constrain the
            # service — but the relay cannot consume one: it reads no *_FILE
            # variant for any setting and never looks at CREDENTIALS_DIRECTORY.
            # Every secret therefore arrives through EnvironmentFile above,
            # which systemd also reads as root before the privilege drop, so the
            # DynamicUser-safety property is preserved. EnvironmentFile is read
            # once at unit start, which is why each generator above names its
            # restartUnits.

            DynamicUser = true;
            Restart = "on-failure";

            # Postgres being unreachable at startup is fatal with no retry: the
            # relay aborts rather than backing off. Combined with systemd's
            # default 5-restarts-in-10s cap that turns a slow database into a
            # permanently failed unit needing manual reset-failed — exactly the
            # 2026-05-22 ENOSPC incident, where postgres PANICked and gitea was
            # marked permanently failed. The fix is the same one applied to
            # gitea then: disable the rate cap, lengthen the backoff, let the
            # relay keep retrying while postgres recovers. Startup is idempotent.
            RestartSec = "30s";

            # Above the relay's 35s worst-case teardown, measured from SIGTERM:
            # a fixed 5s grace during which readiness returns 503 and no
            # listener has closed yet, then a 30s hard drain that force-exits
            # with status 1 if exceeded. A TimeoutStopSec at or below 35s would
            # race that self-imposed budget and turn an orderly drain into a
            # SIGKILL. The margin covers the exit path after the drain returns.
            TimeoutStopSec = "45s";
          };

          unitConfig = {
            StartLimitIntervalSec = 0;
          };
        };

        # Mesh-scoped, never global — the fleet precedent (cognee, mosh). The
        # health and metrics listeners are included because both bind 0.0.0.0
        # unconditionally, independent of bindAddress, so this rule is the only
        # thing containing them.
        networking.firewall.interfaces."zt+".allowedTCPPorts = lib.mkIf cfg.openFirewall [
          cfg.port
          cfg.healthPort
          cfg.metricsPort
        ];
      };
    };
}
