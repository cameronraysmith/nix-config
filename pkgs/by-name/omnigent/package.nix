{
  lib,
  fetchPypi,
  python3Packages,
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
in
py.buildPythonApplication {
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

  # Child processes use sys.executable -m and need the same import closure.
  # Keep the runner's PATH intact rather than using wrapPythonPrograms.
  dontWrapPythonPrograms = true;
  postFixup = ''
    buildPythonPath "$out"
    for program in "$out/bin/omni" "$out/bin/omnigent"; do
      wrapProgram "$program" --prefix PYTHONPATH : "$program_PYTHONPATH"
    done
  '';

  pythonImportsCheck = [
    "omnigent"
    "omnigent.cli"
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
}
