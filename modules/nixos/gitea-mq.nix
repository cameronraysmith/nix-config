# gitea-mq GitHub merge queue for magnetite, beside nixbot and buildbot-nix.
#
# Credential generator catalog (slots; values populated as marked):
#   - gitea-mq-github-app-secret-key/key.pem: manual `clan vars set` (GitHub App PEM key)
#   - gitea-mq-github-webhook-secret/secret: generated with `openssl rand -hex 32`
# Both files retain root ownership and mode 0400: systemd loads them through
# LoadCredential before the dynamic user exists. Naming that transient user
# as a file owner would fail activation. Both restart the unit on rotation
# because systemd snapshots credentials at start. The service pushes the
# webhook URL and secret to the App at startup; the PEM must be supplied.
#
# Coexistence constraints:
#   - Peer authentication over /run/postgresql couples the unit name, dynamic
#     user name, and PostgreSQL role name: all must remain gitea-mq.
#   - The loopback listener uses 8092 because LiveKit's JWT service already
#     binds the upstream default port 8080 (modules/nixos/matrix.nix).
#   - hideRefFromClients stays false: its default on this host would inject
#     an ExecStartPre into the local Gitea unit, which this GitHub queue does
#     not use.
#
# Before first start, apply the approved G2 ruleset diff: one branch ruleset
# named gitea-mq requiring only the queue's own status, with the queue App
# and orchestrator bypasses. A remaining nixbot required check would replace
# the configured fallback pair; an absent gitea-mq ruleset would be created
# by startup setup. Installation selection must remain vanixiets alone:
# github.repos adds repositories to installations, rather than filtering them.
{
  flake.modules.nixos.gitea-mq =
    {
      config,
      pkgs,
      ...
    }:
    let
      listen = "127.0.0.1:8092";
      domain = "mq.scientistexperience.net";
      gen = config.clan.core.vars.generators;
      # G1 must supply the public App id before deployment (tasks 1.2 and 4.1).
      pendingGithubAppId = 1;
    in
    {
      clan.core.vars.generators.gitea-mq-github-app-secret-key = {
        files."key.pem".restartUnits = [ "gitea-mq.service" ];
        script = ''
          echo "gitea-mq GitHub App private key: populate via clan vars set" >&2
          exit 1
        '';
      };

      clan.core.vars.generators.gitea-mq-github-webhook-secret = {
        files."secret".restartUnits = [ "gitea-mq.service" ];
        runtimeInputs = [ pkgs.openssl ];
        script = ''
          openssl rand -hex 32 > "$out/secret"
        '';
      };

      services.gitea-mq = {
        enable = true;
        externalUrl = "https://${domain}";
        listenAddr = listen;
        hideRefFromClients = false;
        github = {
          appId = pendingGithubAppId;
          privateKeyFile = gen.gitea-mq-github-app-secret-key.files."key.pem".path;
          webhookSecretFile = gen.gitea-mq-github-webhook-secret.files."secret".path;
          repos = [ "cameronraysmith/vanixiets" ];
        };
        batchMax = 0;
        skipQueueIfUpToDate = true;
        requiredChecks = [
          "nixbot/nix-eval"
          "nixbot/nix-build"
        ];
      };

      services.postgresql = {
        ensureDatabases = [ "gitea-mq" ];
        ensureUsers = [
          {
            name = "gitea-mq";
            ensureDBOwnership = true;
          }
        ];
      };

      services.nginx.virtualHosts.${domain} = {
        forceSSL = true;
        enableACME = true;
        locations."/".proxyPass = "http://${listen}";
      };

      assertions =
        let
          cfg = config.services.gitea-mq;
          adr = "docs/notes/development/version-control/adr-substitution-first-rollup-landing.md R12";
        in
        [
          {
            assertion = cfg.batchMax == 0;
            message = "services.gitea-mq.batchMax must be 0 (batch everything queued; single-entry fast-forward path) per ${adr}";
          }
          {
            assertion = cfg.skipQueueIfUpToDate == true;
            message = "services.gitea-mq.skipQueueIfUpToDate must be true per ${adr}";
          }
          {
            assertion =
              cfg.requiredChecks == [
                "nixbot/nix-eval"
                "nixbot/nix-build"
              ];
            message = "services.gitea-mq.requiredChecks must be exactly nixbot/nix-eval and nixbot/nix-build per ${adr}";
          }
          {
            assertion = !(config.systemd.services.gitea-mq.environment ? GITEA_MQ_MERGE_LABEL);
            message = "GITEA_MQ_MERGE_LABEL must not be set on gitea-mq.service; the upstream default merge-queue is the pinned value per ${adr}";
          }
        ];
    };
}
