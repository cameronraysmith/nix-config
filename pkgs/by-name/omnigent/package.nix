{
  lib,
  fetchPypi,
  python3Packages,
  runCommand,
}:
let
  version = "0.12.0";
  py = python3Packages;
  omnigent-client = py.callPackage ./omnigent-client.nix { inherit version; };
  omnigent-ui-sdk = py.callPackage ./omnigent-ui-sdk.nix {
    inherit version omnigent-client;
  };

  # Version 0.18.1 requires websockets, omitted by the pinned nixpkgs recipe.
  # https://pypi.org/pypi/openai-agents/0.18.1/json
  openai-agents = py.openai-agents.overridePythonAttrs (old: {
    dependencies = old.dependencies ++ [ py.websockets ];
  });
  omnigent = py.buildPythonPackage {
    pname = "omnigent";
    inherit version;
    format = "wheel";

    src = fetchPypi {
      pname = "omnigent";
      inherit version;
      format = "wheel";
      python = "py3";
      dist = "py3";
      platform = "any";
      hash = "sha256-cDiE5p/7lE51VEo7OVoepm+nNZmIQ62uk8qtvxajt0Q=";
    };

    pythonRelaxDeps = [
      "argon2-cffi"
      "cachetools"
      "packaging"
      "rich"
      "websockets"
    ];

    dependencies = [
      omnigent-client
      omnigent-ui-sdk
      openai-agents
      py.alembic
      py.anyio
      py.argon2-cffi
      py.cachetools
      py.cel-python
      py.certifi
      py.claude-agent-sdk
      py.click
      py.fastapi
      py.ftfy
      py.httpx
      py.json5
      py.keyring
      py.mcp
      py.openai
      py.opentelemetry-api
      py.packaging
      py.pexpect
      py.pillow
      py.prompt-toolkit
      py.protobuf
      py.psutil
      py.psycopg
      py.pydantic
      py.pyjwt
      py.pyte
      py.python-dateutil
      py.pyyaml
      py.rich
      py.sqlalchemy
      py.starlette
      py.tiktoken
      py.tomlkit
      py.uvicorn
      py.websockets
      py.zstandard
    ]
    ++ py.pyjwt.optional-dependencies.crypto
    ++ py.uvicorn.optional-dependencies.standard;

    dontWrapPythonPrograms = true;

    pythonImportsCheck = [
      "omnigent"
      "omnigent.cli"
      "omnigent.claude_native_hook"
      "omnigent_client"
      "omnigent_ui_sdk"
      "psycopg"
    ];

    meta = {
      description = "Common orchestration layer for AI coding agents";
      homepage = "https://omnigent.ai";
      license = lib.licenses.asl20;
      mainProgram = "omnigent";
      platforms = lib.platforms.unix;
    };
  };
  pythonEnv = py.python.withPackages (_: [ omnigent ]);
in
runCommand "omnigent-${version}"
  {
    pname = "omnigent";
    inherit version;
    inherit (omnigent) meta;
    passthru = {
      python = pythonEnv;
      inherit omnigent;
    };
  }
  ''
    mkdir -p "$out/bin"
    for program in omni omnigent; do
      cp "${omnigent}/bin/$program" "$out/bin/$program"
      chmod u+w "$out/bin/$program"
      substituteInPlace "$out/bin/$program" \
        --replace-fail '#!${py.python.interpreter}' '#!${pythonEnv.interpreter}'
    done
    env -i ${pythonEnv.interpreter} -I -c '
    import omnigent, omnigent.claude_native_hook, subprocess, sys
    subprocess.run([sys.executable, "-I", "-m", "omnigent.claude_native_hook", "--help"], env={}, check=True)
    '
    env -i HOME="$TMPDIR" "$out/bin/omnigent" --help > omnigent-help.txt
    cat omnigent-help.txt
    grep -w server omnigent-help.txt
    grep -w host omnigent-help.txt
    echo "omnigent-help-ok"
  ''
