{
  lib,
  python3Packages,
  fetchPypi,
}:

python3Packages.buildPythonApplication rec {
  pname = "conda-lock";
  version = "2.5.7";
  format = "pyproject";

  src = fetchPypi {
    pname = "conda_lock";
    inherit version;
    hash = "sha256-3YXHYq2/biNf42VjByO0rOLX52DMrbomImM5A5DEmgY=";
  };

  nativeBuildInputs = with python3Packages; [
    hatchling
    hatch-vcs
  ];

  propagatedBuildInputs = with python3Packages; [
    cachecontrol
    cachy
    click-default-group
    click
    clikit
    crashtest
    # ensureconda
    gitpython
    html5lib
    jinja2
    keyring
    pkginfo
    pydantic
    pyyaml
    requests
    ruamel-yaml
    tomlkit
    toolz
    # urllib3 # <2
    virtualenv
  ];

  doCheck = false;
  nativeCheckInputs = [ ];
  disabledTests = [ ];
  pythonImportsCheck = [ ];

  meta = with lib; {
    changelog = "https://github.com/conda/conda-lock/releases/tag/v${version}";
    description = "Lightweight lockfile for conda environments";
    homepage = "https://github.com/conda/conda-lock";
    license = licenses.mit;
    maintainers = with maintainers; [ cameronraysmith ];
  };
}
