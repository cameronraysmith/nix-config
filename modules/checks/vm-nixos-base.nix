# KVM regulator for the fleet-shared `flake.modules.nixos.base` module.
#
# Every NixOS machine imports `base`, and its kernel-level claims (systemd
# initrd, zram sizing, wheel sudo through PAM) are invisible to the toplevel
# build checks and unreachable from nspawn containers. One synthetic clan
# machine composed from `base` alone boots under QEMU/KVM via clan-core's
# test module, which runs the vars generators in-sandbox so the module's
# `clan.core.vars` declarations evaluate exactly as they do in production.
{
  config,
  inputs,
  lib,
  ...
}:
let
  nixosLib = import (inputs.nixpkgs + "/nixos/lib") { };
  base = config.flake.modules.nixos.base;
in
{
  perSystem =
    { pkgs, ... }:
    {
      checks = lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
        vm-nixos-base = nixosLib.runTest {
          imports = [ inputs.clan-core.modules.nixosTest.clanTest ];
          hostPkgs = pkgs;
          name = "vm-nixos-base";

          # clanTest injects its nixosTestLib built against clan-core's own
          # nixpkgs python, which the driver from this flake's nixpkgs rejects.
          extraPythonPackages = lib.mkForce (_: [ ]);

          clan = {
            directory = pkgs.emptyDirectory;
            test.useContainers = false;
            inventory.machines.probe = { };
            machines.probe =
              { config, ... }:
              {
                imports = [ base ];
                system.stateVersion = config.system.nixos.release;
                # The initrd SSH host key is appended to the initrd by the
                # bootloader at deploy time; a direct-boot VM has no bootloader.
                boot.initrd.network.ssh = {
                  hostKeys = lib.mkForce [ ];
                  ignoreEmptyHostKeys = true;
                };
              };
          };

          testScript = ''
            start_all()
            probe.wait_for_unit("multi-user.target")

            startup = probe.succeed("systemd-analyze time")
            assert "(initrd)" in startup, f"systemd initrd did not run:\n{startup}"

            mem_total_kib = int(probe.succeed("awk '/MemTotal/ {print $2}' /proc/meminfo"))
            swaps = probe.succeed("swapon --show=NAME,SIZE --bytes --noheadings --raw").split()
            assert swaps[0] == "/dev/zram0", f"zram0 is not the swap device:\n{swaps}"
            ratio = int(swaps[1]) / (mem_total_kib * 1024)
            assert 0.9 <= ratio <= 1.0, f"zram size is {ratio:.2f} of MemTotal, expected memoryPercent = 100"

            probe.succeed("su - crs58 -c 'sudo -n true'")
          '';
        };
      };
    };
}
