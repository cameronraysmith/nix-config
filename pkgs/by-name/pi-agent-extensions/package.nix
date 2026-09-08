{
  fetchFromGitHub,
  lib,
  stdenvNoCC,
}:
let
  rev = "c700f300707db5345727052682c88e3064030aa2";
in
stdenvNoCC.mkDerivation {
  pname = "pi-agent-extensions";
  version = "0.1.0-unstable-2026-07-28";

  src = fetchFromGitHub {
    owner = "rytswd";
    repo = "pi-agent-extensions";
    inherit rev;
    hash = "sha256-RLtDi9ahKONSJBuuYkYo/oIIxDX6PWiZ7rlevOStUUk=";
  };

  # Prevent a stale direnv ctx in the debounce timer from crashing the agent.
  # Upstream HEAD (1667a5c, 2026-08-25) still has the bug; drop this patch when
  # upstream carries an equivalent fix.
  patches = [ ./direnv-stale-context.patch ];

  dontConfigure = true;
  dontBuild = true;
  strictDeps = true;

  installPhase = ''
    runHook preInstall

    sourceNodeModules=$(find . -type d -name node_modules -print -quit)
    if [ -n "$sourceNodeModules" ]; then
      echo "pi-agent-extensions source contains node_modules: $sourceNodeModules" >&2
      exit 1
    fi

    mkdir -p "$out"
    cp -R . "$out/"

    runHook postInstall
  '';

  meta = {
    description = "Collection of Pi coding-agent extensions";
    homepage = "https://github.com/rytswd/pi-agent-extensions";
    license = lib.licenses.mit;
    sourceProvenance = with lib.sourceTypes; [ fromSource ];
    platforms = lib.platforms.all;
  };
}
