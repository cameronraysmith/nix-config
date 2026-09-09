{
  config,
  inputs,
  ...
}:
let
  flakeModules = config.flake.modules.nixos;
  flakeUsers = config.flake.users;
  cogneeLib = config.flake.lib.cognee;
  inherit (config.flake.lib.hosts) magnetite;
in
{
  flake.modules.nixos."machines/nixos/magnetite" =
    {
      config,
      pkgs,
      lib,
      ...
    }:
    let
      omnigraphCookbooks = pkgs.fetchFromGitHub {
        owner = "ModernRelay";
        repo = "omnigraph-cookbooks";
        rev = "7978b30199c8172b5fba612aef3c5b42f15f5e72";
        hash = "sha256-zdh4RPcZjASYaorsl1LAfvBLZ6WYfxiCbVKjxhCbtfQ=";
      };
    in
    {
      imports = [
        inputs.srvos.nixosModules.server
        inputs.srvos.nixosModules.hardware-hetzner-cloud
        inputs.srvos.nixosModules.mixins-nginx
        inputs.home-manager.nixosModules.home-manager
        inputs.niks3.nixosModules.niks3
        inputs.buildbot-nix.nixosModules.buildbot-master
        inputs.buildbot-nix.nixosModules.buildbot-worker
        inputs.nixbot.nixosModules.nixbot
        inputs.gitea-mq.nixosModules.default
      ]
      ++ (with flakeModules; [
        base
        hm-sops-bridge
        niks3
        ssh-known-hosts
        stibnite-builder
        stibnite-session
        buildbot
        nixbot
        gitea-mq
        gitea
        sso-gateway
        gitea-actions-runner
        docker
        kanidm
        matrix
        omnigraph
        # Imported but deliberately not enabled: services.buzz-relay.enable
        # defaults to false and is not set here. See the header comment in
        # modules/nixos/buzz-relay.nix for the object-store, Redis and backup
        # prerequisites that gate switching it on.
        buzz-relay
        effects-vanixiets-secrets
        effects-ironstar-secrets
      ]);

      # Make flake available to all modules (required by ssh-known-hosts)
      _module.args.flake = inputs.self;

      nixpkgs.hostPlatform = "x86_64-linux";

      # ZFS device node path - more stable for cloud VMs
      boot.zfs.devNodes = "/dev/disk/by-path";

      # Bootloader: GRUB BIOS mode (CX53 has legacy BIOS only, not UEFI)
      # srvos hardware-hetzner-cloud handles GRUB BIOS configuration

      networking.hostName = "magnetite";

      networking.search = [ ];

      system.stateVersion = "25.05";

      # systemd-nspawn-flavor NixOS tests require uid-range, auto-allocate-uids, and cgroups.
      # See nixos/doc/manual/development/running-nixos-tests.section.md in nixpkgs.
      nix.settings = {
        auto-allocate-uids = true;
        extra-system-features = [ "uid-range" ];
        experimental-features = [
          "auto-allocate-uids"
          "cgroups"
        ];
      };

      # magnetite is x86_64-linux and cannot build aarch64-darwin derivations,
      # so darwin work is dispatched to stibnite, the fleet's only machine of
      # that system. Two mechanisms, two callers:
      #   nix.buildMachines below — a local nix build by an operator who wants
      #     the darwin result in magnetite's store.
      #   /etc/nix/stibnite-store-uri — a caller that wants the build to happen
      #     entirely in stibnite's store with nothing copied back.
      # nixbot.toml sets attribute = "checks.x86_64-linux", which prevents CI
      # from evaluating or requesting aarch64-darwin work and makes this builder
      # unreachable from CI. modules/nixos/nixbot.nix and
      # modules/nixos/buildbot.nix each set buildSystems = [ "x86_64-linux" ]
      # as an independent second layer. These controls remain because stibnite
      # is a laptop without guaranteed availability and a sleeping machine
      # could gate CI.
      services.stibnite-builder.enable = true;
      nix.buildMachines = config.services.stibnite-builder.buildMachines;

      # The build and session keys are separately authorized for independent
      # revocation and rotation. Only the build key is confined to the Nix
      # protocol by `restrict` and a forced command. The session key is broader:
      # it grants an unrestricted login as admin-group crs58, already a Nix
      # trusted user, with build authority plus shell.
      services.stibnite-session.enable = true;

      # User configuration managed via clan inventory users service (modules/clan/inventory/services/users/cameron.nix).

      security.sudo.wheelNeedsPassword = false;

      security.acme = {
        acceptTerms = true;
        defaults.email = "cameron@scientistexperience.net";
      };

      # Shared kanidm-OIDC SSO gateway. cognee registers as consumer #1 (D10):
      # the gateway emits the kb.scientistexperience.net forceSSL+ACME vhost,
      # proxies `/` to the loopback frontend and `/api/` to the ZeroTier REST
      # API, gates on cognee_access membership, and applies the browser-vs-API
      # 401 split. The gateway owns the oauth2-proxy-kanidm unit, the sso-gateway
      # kanidm client, and the auth.scientistexperience.net subdomain.
      sso.enable = false;

      # Redirect the auth subdomain root (`auth.scientistexperience.net/`) to the
      # kanidm apps portal instead of the stock nginx welcome page. The shared
      # "SSO" apps-portal card launches the auth-root landing, so without this it
      # lands on a dead nginx page; pointing `/` at the kanidm portal turns that
      # tile into a useful entry point. `/oauth2/*` is unaffected.
      sso.rootRedirectUrl = "https://accounts.scientistexperience.net/";

      # Shared-client apps-portal card image (generic SSO/OIDC tile). The shared
      # client reverts to the default "SSO" label and auth-root landing; this
      # gives it a branded icon. The oauth2-proxy project icon (MIT, in-repo,
      # commit-pinned) brands the tile to the gateway implementation we run.
      sso.clientImageFile = pkgs.fetchurl {
        url = "https://raw.githubusercontent.com/oauth2-proxy/oauth2-proxy/899c743afc71e695964165deb11f50b9a0703c97/docs/static/img/logos/OAuth2_Proxy_icon.svg";
        hash = "sha256-7d14/2OgFEcZxC0DKJdvwgmfynv5BTj8wOBhYwpcAWU=";
      };

      sso.services.cognee = {
        domain = cogneeLib.publicFqdn;
        allowedGroups = [ "cognee_access" ];
        upstream = {
          "/" = "http://127.0.0.1:3000";
          "/api/" = "http://[${magnetite.zt}]:9270";
        };
        # Dedicated apps-portal tile launching the cognee UI, scoped (via the
        # gateway) to cognee_access — the same group in allowedGroups, so tile
        # visibility matches gateway admission.
        portalCard = {
          displayName = "Cognee";
          landingUrl = "https://${cogneeLib.publicFqdn}";
          imageFile = pkgs.fetchurl {
            url = "https://raw.githubusercontent.com/topoteretes/cognee/b7fcc7faa51acffc28386392f0250521c1536679/cognee-frontend/src/app/icon.svg";
            hash = "sha256-5o5gLrjcuFhKxjEtTNfalPcs2VrBhdRRonedH6CmmnA=";
          };
        };
      };

      # Tune ZFS auto-snapshot retention for a single-disk cloud VPS without
      # off-site snapshot replication. The nixpkgs defaults (frequent=4,
      # hourly=24, daily=7, weekly=4, monthly=1 via srvos mkDefault) are
      # calibrated for workstations with USB backup targets and produce
      # excessive snapshot churn on a cloud node. `/nix` is opted out via
      # the disko `com.sun:auto-snapshot=false` property; the remaining
      # datasets (/nixos, /home, /docker, /podman) retain a short window.
      services.zfs.autoSnapshot = {
        frequent = 0;
        hourly = 4;
        daily = 3;
        weekly = 1;
        monthly = lib.mkForce 0;
      };

      # Disko's `options."com.sun:auto-snapshot" = "false"` on reproducible-content
      # datasets (root/nix, root/docker, root/podman; see disko.nix) is honored only
      # at dataset CREATION time. For already-provisioned hosts, the property is not
      # re-asserted by `nixos-rebuild switch` or `clan machines update`. These oneshots
      # make the declared intent a runtime invariant by issuing `zfs set` at boot.
      # `zfs set` is a no-op when the value already matches, so the units are
      # idempotent and side-effect-free on repeat boots.
      systemd.services.zfs-assert-root-nix-noautosnap = {
        description = "Assert com.sun:auto-snapshot=false on zroot/root/nix";
        wantedBy = [ "multi-user.target" ];
        after = [ "zfs-import.target" ];
        serviceConfig = {
          Type = "oneshot";
          RemainAfterExit = true;
          ExecStart = "${pkgs.zfs}/bin/zfs set com.sun:auto-snapshot=false zroot/root/nix";
        };
      };

      systemd.services.zfs-assert-root-docker-noautosnap = {
        description = "Assert com.sun:auto-snapshot=false on zroot/root/docker";
        wantedBy = [ "multi-user.target" ];
        after = [ "zfs-import.target" ];
        serviceConfig = {
          Type = "oneshot";
          RemainAfterExit = true;
          ExecStart = "${pkgs.zfs}/bin/zfs set com.sun:auto-snapshot=false zroot/root/docker";
        };
      };

      systemd.services.zfs-assert-root-podman-noautosnap = {
        description = "Assert com.sun:auto-snapshot=false on zroot/root/podman";
        wantedBy = [ "multi-user.target" ];
        after = [ "zfs-import.target" ];
        serviceConfig = {
          Type = "oneshot";
          RemainAfterExit = true;
          ExecStart = "${pkgs.zfs}/bin/zfs set com.sun:auto-snapshot=false zroot/root/podman";
        };
      };

      # Pool-starvation guardrails (2026-06-10 incident: /nix consumed the
      # entire 304G pool and wedged every dataset). The quota caps /nix below
      # pool capacity; the reservations guarantee / and /home writable
      # headroom even when /nix hits its quota. Mirrored create-time in
      # disko.nix; these oneshots enforce the values on the already-
      # provisioned host because disko options apply at dataset creation only.
      systemd.services.zfs-set-root-nix-quota = {
        description = "Assert quota=250G on zroot/root/nix";
        wantedBy = [ "multi-user.target" ];
        after = [ "zfs-import.target" ];
        serviceConfig = {
          Type = "oneshot";
          RemainAfterExit = true;
          ExecStart = "${pkgs.zfs}/bin/zfs set quota=250G zroot/root/nix";
        };
      };

      systemd.services.zfs-set-root-nixos-reservation = {
        description = "Assert reservation=10G on zroot/root/nixos";
        wantedBy = [ "multi-user.target" ];
        after = [ "zfs-import.target" ];
        serviceConfig = {
          Type = "oneshot";
          RemainAfterExit = true;
          ExecStart = "${pkgs.zfs}/bin/zfs set reservation=10G zroot/root/nixos";
        };
      };

      systemd.services.zfs-set-root-home-reservation = {
        description = "Assert reservation=4G on zroot/root/home";
        wantedBy = [ "multi-user.target" ];
        after = [ "zfs-import.target" ];
        serviceConfig = {
          Type = "oneshot";
          RemainAfterExit = true;
          ExecStart = "${pkgs.zfs}/bin/zfs set reservation=4G zroot/root/home";
        };
      };

      # Raise nix daemon free-space thresholds for a build host. clan-core and
      # srvos both set 512 MiB / 3 GiB via mkDefault, which is undersized for
      # buildbot-nix workers materializing large closures on a CX53 with niks3
      # GC pressure. Trigger GC at 30 GiB free, free until 80 GiB available.
      #
      # http-connections and max-substitution-jobs raise the daemon's ceiling on
      # concurrent cache round trips. Both were at their nix defaults, and the
      # daemon is where every substituter byte originates: nixbot.service sets
      # RestrictAddressFamilies=AF_UNIX and runs nix-eval-jobs under bwrap, so
      # the evaluator reaches the network only by asking the daemon over its
      # UNIX socket. nixbot hard-codes --check-cache-status in that invocation
      # (nix_eval.py), so every evaluated attribute's closure is resolved
      # against all nine configured substituters before the evaluation can
      # finish, and neither the flag nor nixbot's eval_concurrency is reachable
      # from its NixOS module.
      #
      # Measured on 2026-09-02, build 172 (117 attributes, 490 s): a ~75-90 s
      # burst where six nix-eval-jobs workers each hold 75-85% of a core, then
      # 6.5-7 min in which the master has no children at all and sits in
      # unix_stream_read on the daemon socket with a flat
      # voluntary_ctxt_switches count, taking ~48 reads/s, while the daemon
      # itself idles at a few percent CPU holding established TLS connections
      # to the caches. 85% of that evaluation's wall clock is this wait. Host
      # load was 1.11 of 16 CPUs with vmstat wa=0, so it is neither CPU nor IO
      # saturation. A path absent from every cache costs the sum over the nine
      # endpoints, ~1.27 s of serial-equivalent latency measured by curl, of
      # which TLS is only 30-65 ms: the cost is round trips, not handshakes,
      # and keep-alive reuse was confirmed working (6 ms warm hit).
      #
      # Both dials therefore oversubscribe relative to the 16 cores on purpose,
      # because the work they bound is latency-bound rather than CPU-bound.
      # Neither is bounded by RAM: they live in nix-daemon.service, outside the
      # eval cgroup whose evalMaxMemorySize x (evalWorkerCount + 1) = 14 GiB cap
      # is the one ceiling that must stay enforceable, since exceeding it fails
      # a pull request permanently with no retry. A curl handle costs tens of
      # KiB, so 100 connections is single-digit MiB against 20 GiB available.
      nix.settings = {
        min-free = 30 * 1024 * 1024 * 1024;
        max-free = 80 * 1024 * 1024 * 1024;

        # Default 25. Bounded by file descriptors and outbound sockets.
        http-connections = 100;

        # Default 16. Bounded by CPU for decompression and by network for the
        # transfers themselves; unlike http-connections this one is not measured
        # as binding, because the wait above is evaluation-time narinfo
        # resolution rather than build-time substitution.
        max-substitution-jobs = 32;
      };

      # base sets nix.gc.options fleet-wide as a plain string (modules/system/
      # nix-optimization.nix), so this host-level tightening requires mkForce.
      # Build outputs persist in the niks3 R2 cache; short local retention is
      # safe on the build host.
      nix.gc.options = lib.mkForce "--delete-older-than 7d";

      # Nix >= 2.30 keeps build sandboxes in /nix/var/nix/builds; the only
      # reaper is the Nix package's tmpfiles rule (nix-daemon.conf, age 7d).
      # A 7d window let a nix-daemon ENOSPC crash-loop orphan 201 sandboxes
      # (232 GiB) on 2026-06-10. This entry renders into 00-nixos.conf, which
      # sorts before nix-daemon.conf, so per tmpfiles.d(5) precedence the 1d
      # age wins for this path. Active sandboxes (<= 3h buildbot hard
      # timeout) never enter the 1d window.
      systemd.tmpfiles.rules = [
        "d /nix/var/nix/builds 0755 root root 1d -"
      ];

      # Cloudflare R2 S3 credentials scoped to the sciexp bucket, delivered as an
      # EnvironmentFile. object_store has no shared-credentials-file provider, so
      # process environment variables are the only source omnigraph resolves.
      clan.core.vars.generators.omnigraph-r2 = {
        prompts.access-key = {
          description = ''
            Cloudflare R2 S3 access key ID with read and write scope on bucket
            sciexp. Minted in the Cloudflare dashboard; distinct from the
            niks3-s3 token, which is scoped to sciexp-nix-cache.
          '';
          type = "hidden";
          persist = true;
          display = {
            group = "omnigraph";
            label = "AWS_ACCESS_KEY_ID";
          };
        };

        prompts.secret-key = {
          description = "Cloudflare R2 S3 secret access key paired with the access key ID above.";
          type = "hidden";
          persist = true;
          display = {
            group = "omnigraph";
            label = "AWS_SECRET_ACCESS_KEY";
          };
        };

        files.access-key.deploy = false;
        files.secret-key.deploy = false;

        files."env" = {
          restartUnits = [ "omnigraph-server.service" ];
        };

        script = ''
          {
            printf 'AWS_ACCESS_KEY_ID=%s\n' "$(cat "$prompts/access-key")"
            printf 'AWS_SECRET_ACCESS_KEY=%s\n' "$(cat "$prompts/secret-key")"
          } > "$out/env"
        '';
      };

      clan.core.vars.generators.omnigraph-bearer-tokens = {
        files."tokens.json" = {
          restartUnits = [ "omnigraph-server.service" ];
        };
        runtimeInputs = [
          pkgs.openssl
          pkgs.jq
        ];
        script = ''
          jq -n --arg token "$(openssl rand -hex 32)" '{admin: $token}' > "$out/tokens.json"
        '';
      };

      services.omnigraph = {
        enable = true;

        storageUri = "s3://sciexp/omnigraph/clusters/dev-graph";

        s3 = {
          endpointUrl = "https://1ece4a9a8f092f8cbdd679d22b9ecb1f.r2.cloudflarestorage.com";
          region = "auto";
        };

        bindAddress = magnetite.zt;
        port = 8090;
        requireAllGraphs = true;

        environmentFile = config.clan.core.vars.generators.omnigraph-r2.files."env".path;
        bearerTokensFile =
          config.clan.core.vars.generators.omnigraph-bearer-tokens.files."tokens.json".path;

        cluster = {
          settings = {
            metadata.name = "dev-graph";
            graphs.dev = {
              schema = "schema.pg";
              queries = "queries/";
            };
            policies = {
              dev = {
                file = "policies/dev.policy.yaml";
                applies_to = [ "dev" ];
              };
              server = {
                file = "policies/server.policy.yaml";
                applies_to = [ "cluster" ];
              };
            };
          };

          extraFiles = {
            "schema.pg" = "${omnigraphCookbooks}/dev-graph/schema.pg";
            "queries" = "${omnigraphCookbooks}/dev-graph/queries";
            "policies/dev.policy.yaml" = ./omnigraph/dev.policy.yaml;
            "policies/server.policy.yaml" = ./omnigraph/server.policy.yaml;
          };

          actor = "magnetite";
        };
      };

      # Permit binding magnetite's ZeroTier-assigned IPv6 before zerotierone
      # settles on cold boot (mirrors modules/machines/nixos/cinnabar/caddy.nix).
      boot.kernel.sysctl."net.ipv6.ip_nonlocal_bind" = 1;

      # srvos hardware-hetzner-cloud sets useNetworkd=true and useDHCP=false; configure primary interface explicitly.
      systemd.network.networks."10-uplink" = {
        matchConfig.Name = "en*";
        networkConfig = {
          DHCP = "yes";
          IPv6AcceptRA = true;
        };
        dhcpV4Config.UseDNS = true;
        dhcpV6Config.UseDNS = true;
      };

      # Firewall configuration: dual-zone (public + ZeroTier)
      networking.firewall = {
        enable = true;
        allowedTCPPorts = [
          22
          80
          443
        ];
        # Admin and internal services accessible via ZeroTier only
        interfaces."zt+" = {
          allowedTCPPorts = [ 8090 ]; # omnigraph; further ports added by service modules
        };
      };

      # Increase MaxAuthTries to accommodate agent forwarding with many keys
      # Default is 6, but Bitwarden SSH agent may have 10+ keys loaded
      services.openssh.settings.MaxAuthTries = 20;

      # nix-fast-build --remote opens one ssh connection per build, so a client
      # with N cores offers up to N concurrent pre-auth connections. sshd's
      # default MaxStartups of 10:30:100 starts dropping past ten, and a dropped
      # handshake surfaces as `kex_exchange_identification: Connection reset by
      # peer` and an exit status of 255 attributed to whichever build owned the
      # connection -- a red check naming a package that is not at fault. An
      # 18-core client reliably lost a random handful of checks per run this way.
      services.openssh.settings.MaxStartups = "64:30:256";

      # Restricted builder user for remote nix builds (no sudo, SSH key only)
      users.users.builder = {
        isNormalUser = true;
        description = "Remote nix build user";
        # nix-daemon --stdio is exactly what an ssh-ng caller would otherwise
        # invoke (`remote-program` defaults to nix-daemon), so forcing it serves
        # the build protocol and discards anything else the client asks for.
        # sshd runs the forced command through the account's login shell, so the
        # shell must stay executable; a nologin shell would break the protocol
        # rather than harden it. Mirrors the stibnite direction of this pair.
        openssh.authorizedKeys.keys = [
          ''restrict,command="${config.nix.package}/bin/nix-daemon --stdio" ${
            lib.removeSuffix "\n"
              inputs.self.darwinConfigurations.stibnite.config.clan.core.vars.generators.nix-remote-build.files."key.pub".value
          }''
        ];
      };

      # An untrusted remote-build account cannot push unsigned store paths: the
      # daemon rejects them with "lacks a signature by a trusted key", which
      # fails any derivation whose input is evaluated locally on stibnite and so
      # exists nowhere a signature could come from. Deploys are unaffected
      # because they connect as root. This list appends to the fleet-wide
      # root/@wheel set in modules/system/nix-settings.nix.
      nix.settings.trusted-users = [ "builder" ];

      # Bridge NixOS-level sops to home-manager for user secret key delivery.
      # sopsIdentity defaults to flake.users.cameron.meta.sopsAgeKeyId
      # ("crs58" via alias-fold inheritance).
      hm-sops-bridge.users.cameron = { };

      # cameron is an alias for crs58; alias-keyed reads keep this
      # call site ignorant of the alias->target relationship.
      # Infrastructure settings provided by the cameron inventory service.
      home-manager.users.cameron = {
        imports = flakeUsers.cameron.modules;
      };
    };
}
