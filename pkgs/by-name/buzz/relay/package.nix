# buzz-relay - WebSocket relay server for the Buzz communications platform.
#
# Built from the relay-source sibling rather than the shared `source` sibling.
# `source` tracks the desktop-v* train and feeds the client-side packages;
# relay-source tracks relay-v* and is bumped on the server's own schedule, so a
# relay upgrade does not drag the desktop CLI and git helpers with it.
#
# Unlike the client packages, `version` here is the crate's real version:
# crates/buzz-relay/Cargo.toml pins 0.2.1 explicitly and documents that it does
# not inherit the workspace 0.1.0, because the relay ships as an independently
# released artifact.
#
# reqwest is configured workspace-wide as
# `{ version = "0.13", features = ["json", "rustls"], default-features = false }`
# (Cargo.toml:102), and 0.13's `rustls` feature implies `__rustls-aws-lc-rs`,
# so aws-lc-sys is compiled from source exactly as in buzz-cli. openssl-sys is
# also in the lockfile but is not reached on this feature resolution.
# aws-lc-sys defaults to its CcBuilder backend; AWS_LC_SYS_CMAKE_BUILDER forces
# the cmake backend instead, matching nixpkgs' own unconditional aws-lc-sys
# crate override (default-crate-overrides.nix:58-62), whose comment notes the
# cc backend fails at least on Darwin. cmake is therefore a build tool here
# rather than the build system, hence dontUseCmakeConfigure.
#
# The wrapper's PATH prefix is load-bearing on two independent paths, and both
# fail closed.
#
# The first is the pre-receive hook. The relay writes a bash script into every
# bare repository it creates (crates/buzz-relay/src/api/git/hook.rs:32-146,
# installed by install_hook at :148-180) whose first line is
# `#!/usr/bin/env bash`. That script is FAIL-CLOSED by construction: it runs
# `set -eo pipefail`, computes an HMAC with `openssl dgst`, POSTs to the
# relay's internal policy endpoint with `curl`, and exits 1 on any non-200,
# timeout or network error. It additionally uses git, sed, date, mktemp and
# sort. A missing tool therefore does not degrade the hook, it rejects every
# push. Upstream's own container encodes the same requirement as a compiled-in
# test: hook.rs:186-206 asserts that the Dockerfile runtime stage installs curl
# and openssl, with the message "relay runtime image must install {tool}; the
# git pre-receive hook uses it and fails closed without it".
#
# `#!/usr/bin/env bash` is rewritten to a store path rather than left alone.
# Under systemd with a hardened unit there is no ambient PATH to find `env`'s
# bash through, and the hook is spawned by git rather than by the wrapper, so
# it does not inherit the wrapper's PATH prefix at the point the shebang is
# resolved. bashNonInteractive is the correct choice over bash: the hook is a
# non-interactive script and the interactive variant only adds readline.
#
# The second path is the relay process itself, which shells out to a bare
# `git` by name (api/git/transport.rs:866, :1266, :1670), so git must be on
# PATH for fetch/push to work at all.
#
# BUZZ_WEB_DIR and BUZZ_ADMIN_WEB_DIR are deliberately NOT set. Upstream's
# container sets them to /srv/buzz/web and /srv/buzz/admin-web
# (Dockerfile:151-152), but those directories hold the *built output* of two
# Vite/React applications: web/ and admin-web/ in the source tree are
# TypeScript sources, and Dockerfile:117-118 runs
# `pnpm install --frozen-lockfile` then `pnpm -C web build && pnpm -C admin-web build`
# to produce web/dist and admin-web/dist. Packaging those would mean vendoring
# a second, JavaScript dependency closure (a 7118-line pnpm-lock.yaml plus two
# pnpm patches) alongside the cargo one, which is out of scope here.
#
# Leaving them unset is safe and is upstream's own source-tree default
# (TESTING.md:285 lists BUZZ_WEB_DIR as "unset (source)"). Setting them to a
# path that does not contain index.html is NOT safe: config.rs:968-975 and
# :947-955 return ConfigError::InvalidValue in that case and the relay refuses
# to start. Unset leaves web_dir = None (config.rs:960-964) and the relay runs
# normally.
#
# What that costs: the bundled invite landing page at /invite/{code} and the
# optional git repository browser (BUZZ_SERVE_GIT_WEB_GUI) are not served, and
# the read-only admin dashboard is unavailable. The admin dashboard is gated on
# BUZZ_ADMIN_HOST regardless (config.rs:930-942), so BUZZ_ADMIN_WEB_DIR is
# never even consulted unless that host is configured. Everything else — the
# WebSocket relay, the REST surface, git push/pull over HTTP, NIP-42/NIP-98
# auth — is unaffected.
#
# Source: https://github.com/block/buzz
{
  lib,
  rustPlatform,
  relay-source,
  cmake,
  makeWrapper,
  bashNonInteractive,
  cacert,
  coreutils,
  curl,
  gitMinimal,
  gnused,
  openssl,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "buzz-relay";
  inherit (relay-source) version cargoDeps;
  src = relay-source;

  # --bin names the expected binary explicitly. Redundant at this pin, where
  # the crate declares exactly one [[bin]] and also sets default-run, but it
  # makes an upstream addition of a second binary change the install set
  # visibly instead of silently.
  cargoBuildFlags = [
    "-p"
    "buzz-relay"
    "--bin"
    "buzz-relay"
  ];

  nativeBuildInputs = [
    cmake
    makeWrapper
  ];
  dontUseCmakeConfigure = true;

  env.AWS_LC_SYS_CMAKE_BUILDER = "1";

  # The shebang rewrite is applied to the Rust string literal in the source
  # tree, before compilation, because the hook text is compiled into the binary
  # as a `const &str`. patchShebangs cannot reach it: there is no such file on
  # disk at build time, and the file the relay eventually writes is created at
  # runtime, long after any fixup phase.
  #
  # The substitution is asserted rather than assumed. substituteInPlace does
  # not fail when its pattern is absent, so an upstream change to the shebang
  # line would otherwise leave a relay that emits `/usr/bin/env bash` hooks and
  # fails every push on a machine without that path.
  postPatch = ''
    substituteInPlace crates/buzz-relay/src/api/git/hook.rs \
      --replace-fail \
        '#!/usr/bin/env bash' \
        '#!${lib.getExe bashNonInteractive}'
  '';

  postInstall = ''
    wrapProgram $out/bin/buzz-relay \
      --set-default SSL_CERT_FILE ${cacert}/etc/ssl/certs/ca-bundle.crt \
      --prefix PATH : ${
        lib.makeBinPath [
          bashNonInteractive
          coreutils
          curl
          gitMinimal
          gnused
          openssl
        ]
      }
  '';

  doCheck = false;

  doInstallCheck = true;
  # There is no flag probe available here. crates/buzz-relay/src/main.rs
  # registers no argument parser at all — not clap, not anything — so
  # `--help` is silently ignored and the process proceeds to open a Postgres
  # pool and eventually fails on a connection timeout. That is exactly the
  # situation source/package.nix already documents for the client binaries.
  #
  # Instead the check drives the configuration validator, which runs at
  # main.rs:142 before any database work. Pointing BUZZ_WEB_DIR at a directory
  # with no index.html makes Config::from_env return
  # ConfigError::InvalidValue (config.rs:968-975), which main.rs turns into a
  # non-zero exit with "Invalid configuration" on stderr. This reaches real
  # relay code, terminates deterministically, needs no network and no DB, and
  # asserts the precise semantics this package's comment relies on when it
  # declines to set BUZZ_WEB_DIR: a bad web dir is fatal at startup, so unset
  # is the only safe value until the bundles are actually built.
  #
  # The wrapper and the shebang rewrite are asserted separately, because a
  # dropped wrapper or a missed substitution yields a relay that starts and
  # serves traffic normally and then rejects every git push at the first hook
  # invocation — a failure no startup probe would surface.
  #
  # The shebang assertion greps the binary, not a file on disk. The hook is a
  # compiled-in `const &str` (hook.rs:32) that only reaches the filesystem when
  # the relay creates a repository at runtime.
  installCheckPhase = ''
    runHook preInstallCheck

    grep -qF '${gitMinimal}' "$out/bin/buzz-relay"
    grep -qF '${openssl}' "$out/bin/buzz-relay"
    grep -qF '${curl}' "$out/bin/buzz-relay"

    grep -qF '#!${lib.getExe bashNonInteractive}' "$out/bin/.buzz-relay-wrapped"
    if grep -qF '#!/usr/bin/env bash' "$out/bin/.buzz-relay-wrapped"; then
      echo "error: pre-receive hook shebang was not rewritten to a store path" >&2
      exit 1
    fi

    checkdir=$(mktemp -d)
    mkdir -p "$checkdir/empty-web"

    # Asserting both the non-zero exit and the message pins the outcome from
    # both directions: a non-zero exit alone would be satisfied by a missing
    # library or a sandbox permission problem rather than by the validator.
    #
    # `if ... then exit 1; fi` rather than `! cmd`, because under set -e the
    # shell does not exit when a command's status is inverted with `!`, so
    # `! "$out/bin/buzz-relay"` would pass silently in the one case this
    # exists to catch.
    if BUZZ_WEB_DIR="$checkdir/empty-web" \
      "$out/bin/buzz-relay" > "$checkdir/out" 2>&1; then
      echo "error: relay accepted a BUZZ_WEB_DIR with no index.html" >&2
      cat "$checkdir/out" >&2
      exit 1
    fi
    grep -qF 'does not contain index.html' "$checkdir/out"

    runHook postInstallCheck
  '';

  meta = {
    homepage = "https://github.com/block/buzz";
    description = "WebSocket relay server for the Buzz communications platform";
    changelog = "https://github.com/block/buzz/releases/tag/relay-v${finalAttrs.version}";
    license = lib.licenses.asl20;
    mainProgram = "buzz-relay";
    maintainers = with lib.maintainers; [ cameronraysmith ];
    platforms = lib.platforms.linux ++ lib.platforms.darwin;
  };
})
