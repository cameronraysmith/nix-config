import pathlib
import re
import sys


def check(root):
    shared = (root / "modules/home/ai/omnigent/runtime-packages.nix").read_text()
    compact = lambda text: re.sub(r"\s+|[()]", "", re.sub(r"#[^\n]*", "", text))
    value = compact(shared)
    assert "flake.lib.omnigentRuntimePackages=pkgs:" in value
    assert re.search(r"\+\+(?:pkgs\.)?lib\.optionals pkgs\.stdenv\.hostPlatform\.isLinux\[pkgs\.bubblewrap\]".replace(" ", ""), value)
    expected = [
        "inputs.self.packages.${system}.claude-code",
        "inputs.self.packages.${system}.atomic",
        "inputs.llm-agents.packages.${system}.codex",
        "inputs.llm-agents.packages.${system}.pi",
        "inputs.llm-agents.packages.${system}.omp",
        *["pkgs." + p for p in ["bun", "nodejs_22", "python3", "tmux", "git", "uv", "bash", "which", "direnv", "nix"]],
    ]
    lists = re.findall(r"\[([^\]]*)\]", shared)
    assert len(lists) == 2, "Only the reviewed common set and Linux-only bubblewrap list"
    assert sorted(lists[0].split()) == sorted(expected), "Shared set differs from reviewed runtime packages"
    assert lists[1].split() == ["pkgs.bubblewrap"]
    consumer = "inputs.self.lib.omnigentRuntimePackagespkgs++cfg.extraPackages"
    for platform in ["nixos", "darwin"]:
        text = (root / f"modules/{platform}/omnigent-host.nix").read_text()
        normalized = compact(text)
        required = (
            "path=" + consumer + ";"
            if platform == "nixos"
            else 'explicitPath=lib.makeBinPath' + consumer + '+":/usr/bin:/bin:/usr/sbin:/sbin";'
        )
        assert required in normalized, f"{platform} must consume the shared required set before extras"
        assert "pkgs.bubblewrap" not in text
        assert not re.search(r"(?:cameron|crs58)", text, re.I)
    print("shared-runtime-contract-ok")


if __name__ == "__main__":
    check(pathlib.Path(sys.argv[1]))
