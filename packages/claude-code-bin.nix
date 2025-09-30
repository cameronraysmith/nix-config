{
  lib,
  stdenvNoCC,
  fetchurl,
  autoPatchelfHook,
  versionCheckHook,
  makeWrapper,
  installShellFiles,
}:
let
  inherit (stdenvNoCC.hostPlatform) system;
  version = "2.0.1";
  gcsBucket = "https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases";

  hashes = {
    x86_64-linux = "sha256-8i1i0NCJP+m+RyosgIE2lxrM+0M/PudNPImACBTBlsw=";
    aarch64-linux = "sha256-HdEKTc6eZpB0dr4wz+X4D3eMBNkQhuHaBoVYl93WJt8=";
    x86_64-darwin = "sha256-6llFZiSmeBVdXkLVw43BXDlxw9EWInIFYMVQYGB5Ilw=";
    aarch64-darwin = "sha256-e7hvhM8+8/3G0s031sFQGY+jepdOlOoy7CFQYGOYXSU=";
  };

  platforms = {
    x86_64-linux = "linux-x64";
    aarch64-linux = "linux-arm64";
    x86_64-darwin = "darwin-x64";
    aarch64-darwin = "darwin-arm64";
  };
  platform = platforms.${system};
in
stdenvNoCC.mkDerivation {
  pname = "claude-code-bin";
  inherit version;

  src = fetchurl {
    url = "${gcsBucket}/${version}/${platform}/claude";
    hash = hashes.${system};
  };

  dontUnpack = true;
  dontBuild = true;

  nativeBuildInputs = [
    installShellFiles
    makeWrapper
  ]
  ++ (lib.optional (!stdenvNoCC.isDarwin) autoPatchelfHook);

  installPhase = ''
    runHook preInstall

    install -Dm755 $src $out/bin/claude
    wrapProgram $out/bin/claude \
      --set DISABLE_AUTOUPDATER 1

    runHook postInstall
  '';

  nativeInstallCheckInputs = [ versionCheckHook ];
  versionCheckProgram = "${placeholder "out"}/bin/claude";
  versionCheckProgramArg = "--version";
  doInstallCheck = false;

  passthru.updateScript = ./update-claude-code.sh;

  meta = {
    description = "Agentic coding tool that lives in your terminal, understands your codebase, and helps you code faster";
    homepage = "https://github.com/anthropics/claude-code";
    downloadPage = "https://www.npmjs.com/package/@anthropic-ai/claude-code";
    changelog = "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md";
    license = lib.licenses.unfree;
    maintainers = [ ];
    sourceProvenance = with lib.sourceTypes; [ binaryNativeCode ];
    mainProgram = "claude";
    platforms = lib.attrNames platforms;
  };
}
