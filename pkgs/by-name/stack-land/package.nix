{
  lib,
  writeShellApplication,
  runCommand,
  bash,
  git,
  gh,
  jq,
  gawk,
  coreutils,
  gnugrep,
  gnused,
}:
let
  baseStackLand = writeShellApplication {
    name = "stack-land";
    runtimeInputs = [
      git
      gh
      jq
      gawk
      coreutils
    ];
    text = builtins.readFile ./stack-land.sh;
    meta = {
      description = "Assertion-only diagnostics for stacked-PR ancestry, Change-Id trailers, and reported checks";
      license = lib.licenses.mit;
      mainProgram = "stack-land";
    };
  };

  testStackLand = writeShellApplication {
    name = "test-stack-land";
    runtimeInputs = [
      bash
      git
      jq
      coreutils
      gnugrep
      gnused
      baseStackLand
    ];
    text = builtins.readFile ./test-stack-land.sh;
  };

  integrationTest =
    runCommand "stack-land-integration"
      {
        nativeBuildInputs = [ testStackLand ];
      }
      ''
        test-stack-land
        touch "$out"
      '';
in
baseStackLand.overrideAttrs (old: {
  passthru = (old.passthru or { }) // {
    tests = (old.passthru.tests or { }) // {
      integration = integrationTest;
    };
  };
})
