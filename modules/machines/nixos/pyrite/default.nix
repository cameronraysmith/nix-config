{
  config,
  inputs,
  ...
}:
let
  # Capture outer config for use in imports
  flakeModules = config.flake.modules.nixos;
  flakeHomeModules = config.flake.modules.homeManager;
  flakeUsers = config.flake.users;
in
{
  # Export host module to flake namespace
  flake.modules.nixos."machines/nixos/pyrite" =
    {
      config,
      pkgs,
      lib,
      ...
    }:
    {
      imports = [
        inputs.home-manager.nixosModules.home-manager
        inputs.nixos-hardware.nixosModules.apple-macbook-pro-14-1
      ]
      ++ (with flakeModules; [
        base
        hm-sops-bridge
        ssh-known-hosts
      ]);

      # A disabledModules path that matches nothing is silently ignored, so a
      # nixos-hardware bump that moves or renames this module would restore the duplicate
      # i915 params with no signal. The first assertion below is the tripwire for that.
      disabledModules = [ "${inputs.nixos-hardware}/common/gpu/intel/kaby-lake" ];

      # Restored from the module disabled above rather than introduced here. Dropping
      # computeRuntime = "legacy" swaps intel-compute-runtime-legacy1 for
      # intel-compute-runtime, which does not target this Gen9 Iris Plus 640.
      hardware.intelgpu = {
        computeRuntime = "legacy";
        vaapiDriver = "intel-media-driver";
      };

      assertions = [
        {
          assertion =
            !(lib.elem "i915.enable_fbc=1" config.boot.kernelParams)
            && !(lib.elem "i915.enable_psr=2" config.boot.kernelParams);
          message = ''
            nixos-hardware's kaby-lake GPU i915 parameters are on pyrite's kernel command
            line again, so the disabledModules entry in
            modules/machines/nixos/pyrite/default.nix no longer matches that module's path.
            Locate common/gpu/intel/kaby-lake in the current nixos-hardware input and
            re-point the entry at it.
          '';
        }
        {
          assertion = lib.elem "root=fstab" config.boot.kernelParams;
          message = ''
            root=fstab is absent from pyrite's boot.kernelParams, which under a systemd
            initrd leaves stage 1 with no root filesystem to mount. A lib.mkForce on
            boot.kernelParams in modules/machines/nixos/pyrite/default.nix discards every
            other module's contribution and produces exactly this; use lib.mkBefore or
            lib.mkAfter instead.
          '';
        }
      ];

      # Make flake available to all modules (required by ssh-known-hosts)
      _module.args.flake = inputs.self;

      # System platform (Kaby Lake, Intel Iris Plus 640)
      nixpkgs.hostPlatform = "x86_64-linux";

      # Bootloader: UEFI with systemd-boot. canTouchEfiVariables writes the machine's
      # 8 MiB SPI boot ROM (not the disk the install wipes); an EFI write failing is
      # recoverable by an NVRAM reset, not a brick.
      boot.loader.systemd-boot.enable = true;
      boot.loader.efi.canTouchEfiVariables = true;

      # by-id, not the fleet's by-path: the "more stable for cloud VMs" reasoning does
      # not transfer to a laptop with a stable by-id path, and by-id is the bare-metal
      # norm. ZFS scanning the 8 KiB nvme0n2 namespace on import is harmless; the hazard
      # is a write, and only the disko device writes. See D3.
      boot.zfs.devNodes = "/dev/disk/by-id";

      networking.hostName = "pyrite";

      # Matches the 26.05 installer ISO release this machine is installed from. Never
      # change after install. This plain assignment overrides clan-core's state-version
      # module, which sets system.stateVersion at mkDefault priority from the stored var
      # (clan-core nixosModules/clanCore/state-version/default.nix:18), so the committed
      # vars/per-machine/pyrite/state-version/version/value does not affect evaluation.
      system.stateVersion = "26.05";

      # Kept from base as a deliberate decision, not an inheritance (D6): the install
      # touches the pool from the installer environment under a different hostid, so
      # importing without force lands the machine's first boot in an emergency shell.
      # The standing case is the same one — an unclean shutdown on a laptop would
      # otherwise block boot until someone types zfs_force=1 at the console. Value
      # equals base's, so this restatement conflicts with nothing.
      boot.zfs.forceImportRoot = true;

      # Order the initrd pool import after the LUKS unlock (D24). nixpkgs'
      # createImportService gives zfs-import-zroot only
      # after = [ systemd-modules-load systemd-ask-password-console ] and no ordering on
      # cryptsetup of any kind, because it is written for pools whose vdevs are ordinary
      # partitions; here the vdev is /dev/mapper/cryptroot, produced by
      # systemd-cryptsetup@cryptroot.service. wants (not requires) so a wrong instance name
      # degrades to the import script's own ~60s poll loop rather than failing the boot.
      # The container is named cryptroot in disko.nix, which is what fixes this unit name.
      # boot.initrd.luks.fido2Support is deliberately NOT set: it selects the legacy
      # fido2luks path and luksroot.nix asserts systemd.enable -> !fido2Support, failing
      # eval. crypttabExtraOpts is deliberately NOT set either, and that is the
      # counterintuitive one, because token unlock works without it. An enrolled header is
      # read by the libcryptsetup token-plugin path (systemd 260.2
      # src/cryptsetup/cryptsetup.c:2691) ahead of the unlock loop, and nixpkgs'
      # relative-token-path.patch makes that plugin load resolve on the loader search
      # path, where boot/systemd/fido2.nix:26-30 has already put it in the initrd. Setting
      # fido2-device=auto would instead route the unlock through determine_token_type
      # (:2551-2560) onto systemd's own FIDO2 path, which is not the path this machine's
      # token unlock and passphrase fallback were verified on. See D24 and D30 in the
      # openspec change design.md.
      boot.initrd.systemd.services."zfs-import-zroot" = {
        after = [ "systemd-cryptsetup@cryptroot.service" ];
        wants = [ "cryptsetup.target" ];
      };

      # networking.hostId: deliberately unset (D7). Inherit clan-core's
      # mkDefault "8425e349" (nixosModules/clanCore/zfs.nix:10), which matches the
      # install ISO and nixos-anywhere so the installer that creates the pool and the
      # system that imports it present the same hostid. Pinning a machine-specific
      # hostid would manufacture the mismatch that default exists to prevent.

      # boot.plymouth: deliberately left at its default false (D11). plymouth swaps the
      # passphrase prompt onto a different ask-password agent
      # (systemd-ask-password-console does not start while /run/plymouth/pid exists) and
      # a graphical stack whose interaction with i915 on this model is unverified. The
      # prompt is this machine's safety-critical path.

      # Disabling initrd networking itself, not just its ssh sub-option, is what keeps
      # brcmfmac out of the initrd: nixpkgs' hardware/facter/networking/initrd.nix:18 gates
      # its boot.initrd.kernelModules assignment on boot.initrd.network.enable, and it is the
      # sole definition site injecting this machine's NIC driver there. Force-loading
      # brcmfmac in stage 1 against the shrunken module tree leaves the request_module for
      # the per-vendor brcmfmac-wcc sub-module unsatisfiable, and brcmf_fwvid_attach's error
      # path then calls device_release_driver, unbinding the PCI device permanently — the
      # machine boots with no wifi device at all, and it has no other NIC. mkForce because
      # base sets enable = true plainly. This subsumes ssh.enable: initrd-ssh.nix's `enabled`
      # is (network.enable || systemd.network.enable) && cfg.enable, so initrd ssh stays off,
      # which is what the design's base-initrd-assumptions section wanted and what its
      # ssh-only override failed to reach. This is a distinct option from
      # boot.initrd.kernelModules, which MUST NOT be mkForce'd (see the design's invariant):
      # the SPI keyboard and i915 modules carrying the stage-1 passphrase prompt must
      # survive.
      boot.initrd.network.enable = lib.mkForce false;

      # b43 is a silicon misdetection, not an evaluation workaround: enableB43Firmware
      # pulls b43Firmware_5_1_138 for the SoftMAC BCM43xx parts, but this machine's NIC
      # is a BCM4350 driven by brcmfmac, which that firmware does not serve. allowUnfree
      # is true fleet-wide so it evaluates; it is declined for the wrong silicon. Plain
      # false overrides the profile's lib.mkDefault true. See D5.
      networking.enableB43Firmware = false;
      # The FaceTime HD camera is out of scope. The fleet's allowUnfree would resolve the
      # profile's mkDefault to true, auto-enabling an out-of-tree kernel module and unfree
      # firmware on import; plain false keeps both out of the closure.
      hardware.facetimehd.enable = false;

      # Stated explicitly, not inherited from facter's bare-metal mkDefault branch (dead
      # on every existing cloud VM). The axis is redistributability, not freeness:
      # enableRedistributableFirmware puts linux-firmware into hardware.firmware
      # (all-firmware.nix:71-86,75), and linux-firmware carries the
      # brcm/brcmfmac4350*-pcie.bin blobs this machine's only NIC needs in order to probe.
      # false darkens the WiFi (its own default is enableAllFirmware, i.e. false).
      # linux-firmware is a redistributable proprietary blob that caches serve, so this is
      # not the decline 2.2 applies to non-redistributable firmware. See D15.
      hardware.enableRedistributableFirmware = true;
      hardware.cpu.intel.updateMicrocode = true;

      # The model profile sets services.mbpfan.enable via mkDefault true, and mbpfan is
      # wanted (D16); restating a plain true would only echo the default. The profile also
      # sets services.tlp.enable = mkDefault (!config.services.power-profiles-daemon.enable),
      # and the GNOME desktop below enables power-profiles-daemon (D19), so tlp evaluates
      # false and power-profiles-daemon is this machine's power-management governor. The
      # module writes neither enable, forcing tlp neither on nor off. The one line the
      # module needs is the quieter fan curve: mbpfan's own aggressive default is true
      # (thresholds 55/58/78); false takes them to 63/66/86 and is the only user-visible
      # consequence of the daemon. mbpfan is not a 2.2-style decline: its license is gpl3
      # (free, redistributable, in-tree, cache-served), and beyond the applesmc the profile
      # already force-loads it adds only coretemp.
      services.mbpfan.aggressive = false;

      # Held at "lock": suspend and resume work here (the units below), but suspend
      # followed by a warm reboot does not — the warm reboot loses the Alpine Ridge
      # Thunderbolt subtree, and dmesg carries "Unable to change power state from D3cold
      # to D0, device inaccessible" on pcieport 0000:00:1c.4 and the 05:0x.0 ports
      # after each resume. A lid close is the most common suspend trigger, so "suspend"
      # here would put that failure on the ordinary path; restore these once a warm
      # reboot taken after a suspend leaves the subtree intact. These are the current
      # option names; services.logind.lidSwitch* are settingsRename aliases (nixpkgs
      # nixos/modules/system/boot/systemd/logind.nix:104-106).
      services.logind.settings.Login = {
        HandleLidSwitch = "lock";
        HandleLidSwitchExternalPower = "lock";
        HandleLidSwitchDocked = "ignore";
        IdleAction = "ignore";
        # Paired with niri's disabled power-key handling; firmware wake is unaffected.
        HandlePowerKey = "ignore";
      };

      # Bulk PCIe d3cold disable before every sleep (D21, generalized). A live test
      # confirmed the deep-S3 hang is a device under the Apple PCIe switch failing
      # D3cold->D0 restore on resume: with the whole Alpine Ridge Thunderbolt switch
      # (0000:04:00.0 and its 05:0x.0 bridges) plus the BCM4350 WiFi still at
      # d3cold_allowed=1, resume wedged; bulk-disabling d3cold on every PCI device let it
      # resume cleanly. Disabling only the NVMe endpoint (the prior form) was insufficient.
      # Iterating the sysfs tree at suspend time (not a fixed address) covers all endpoints
      # and survives PCI renumbering. Best-effort: a node that rejects the write is logged
      # and skipped; the fail-closed guard below, not this unit, refuses an unsafe suspend.
      systemd.services.disable-d3cold-all =
        let
          sleepUnits = [
            "systemd-suspend.service"
            "systemd-hybrid-sleep.service"
            "systemd-suspend-then-hibernate.service"
          ];
        in
        {
          description = "Disable PCIe d3cold on all devices before sleep";
          before = sleepUnits;
          wantedBy = sleepUnits;
          serviceConfig = {
            Type = "oneshot";
            ExecStart = pkgs.writeShellScript "disable-d3cold-all" ''
              shopt -s nullglob
              for f in /sys/bus/pci/devices/*/d3cold_allowed; do
                echo 0 > "$f" 2>/dev/null || echo "d3cold: could not write $f" >&2
              done
            '';
          };
        };

      # Suspend interlock, fail-closed, scoped to the storage controller (the only
      # unrecoverable failure): a nonzero exit aborts the requiring sleep unit rather than
      # letting the machine suspend with the NVMe still able to enter d3cold and hang dark.
      # Ordered after the bulk disabler so it validates the post-disable state. Kept on the
      # fixed on-board NVMe address (soldered, stable) deliberately: a whole-tree assertion
      # would let any transiently-unwritable non-critical node permanently block suspend.
      systemd.services.nvme-d3cold-suspend-guard =
        let
          sleepUnits = [
            "systemd-suspend.service"
            "systemd-hybrid-sleep.service"
            "systemd-suspend-then-hibernate.service"
          ];
        in
        {
          description = "Refuse suspend unless NVMe d3cold is disabled";
          before = sleepUnits;
          after = [ "disable-d3cold-all.service" ];
          requiredBy = sleepUnits;
          serviceConfig = {
            Type = "oneshot";
            ExecStart = pkgs.writeShellScript "nvme-d3cold-suspend-guard" ''
              d3cold=/sys/bus/pci/devices/0000:01:00.0/d3cold_allowed
              if [[ "$(cat "$d3cold" 2>/dev/null)" != 0 ]]; then
                echo "refusing suspend: $d3cold is not 0, d3cold workaround is inactive" >&2
                exit 1
              fi
            '';
          };
        };

      # Disable the lid switch (LID0 / PNP0C0D:00) as an S3 wake source. On this MacBook
      # the ACPI lid device fires spurious wake events ~5s after a lid-open suspend,
      # auto-resuming the machine; confirmed as the sole active source via
      # /sys/kernel/debug/wakeup_sources (the SPI trackpad was ruled out). Power button and
      # keyboard still wake it. Writing "disabled" to the device power/wakeup attribute is
      # the idempotent equivalent of the toggle-based /proc/acpi/wakeup interface. Set once
      # at boot; the setting persists until the next boot.
      systemd.services.disable-lid-wakeup = {
        description = "Disable the lid switch as an S3 wake source";
        wantedBy = [ "multi-user.target" ];
        serviceConfig = {
          Type = "oneshot";
          RemainAfterExit = true;
          ExecStart = pkgs.writeShellScript "disable-lid-wakeup" ''
            shopt -s nullglob
            found=
            for p in /sys/devices/platform/PNP0C0D:00/power/wakeup /sys/bus/acpi/devices/PNP0C0D:00/power/wakeup; do
              if [ -e "$p" ]; then echo disabled > "$p" && found=1; fi
            done
            if [ -z "$found" ]; then
              echo "disable-lid-wakeup: PNP0C0D:00 power/wakeup not found" >&2
              exit 1
            fi
          '';
        };
      };

      # Panic-reboot fallback (D22). Auto-reboot 20 s after a kernel panic returns this
      # machine, which cannot be power-cycled or rebooted remotely, to the stage-1 unlock
      # prompt instead of leaving it dark. The panic-on-hang knobs (kernel.hung_task_panic,
      # softlockup_panic, hardlockup_panic) are deliberately NOT permanent: they
      # false-positive on ZFS scrubs and long nix builds and would spuriously reboot a daily
      # driver. Enable them only around a supervised suspend test, e.g.
      # `sysctl -w kernel.hung_task_panic=1 kernel.hung_task_timeout_secs=30`. efi_pstore
      # records the panic to EFI variables in the SPI boot ROM, surviving the dead NVMe that
      # erases the journal; systemd-pstore.service is wantedBy sysinit.target by default, so
      # the archive path needs no config here. mem_sleep_default is deliberately left
      # unpinned: s2idle was tested and also hung, so the failure is storage, not
      # sleep-state selection.
      boot.kernel.sysctl."kernel.panic" = 20;

      # Suspend/resume kernel params for the s2idle/display half (untested; documented
      # 14,1 recipe, validated on the same reboot as the Layer 1 d3cold hook). PSR/FBC/DC
      # across resume are the documented cause of the "display never returns" variant. The
      # nvme params disable APST and the ACPI D3 path; pci=noaer keeps the D3cold->D0
      # restore log readable. i915.enable_guc=2 is restored from the kaby-lake GPU module
      # disabled above rather than introduced here.
      boot.kernelParams = lib.mkMerge [
        (lib.mkBefore [ "i915.enable_guc=2" ])
        (lib.mkAfter [
          "i915.enable_psr=0"
          "i915.enable_fbc=0"
          "i915.enable_dc=0"
          "nvme_core.default_ps_max_latency_us=0"
          "nvme.noacpi=1"
          "pci=noaer"
        ])
      ];

      # Local GNOME desktop under GDM (D19), the two lines nixpkgs seeds into
      # nixos-generate-config. They are system-level and self-contained: they cascade
      # the display manager, XDG portals, the graphical polkit agent, gnome-keyring,
      # dconf, gnome-settings-daemon, gnome-control-center, the NetworkManager applet,
      # and gnome-shell, and a stock GNOME session needs nothing from cameron's
      # home-manager. GDM is a stage-2 display manager ordered after the root mount, so
      # it does not touch the initrd passphrase path, and it enables no plymouth
      # (2.9/D11 stand). GNOME remains the lockable fallback alongside niri.
      services.displayManager.gdm.enable = true;
      # The greeter is the machine's own worst offender: with autoSuspend at its nixpkgs
      # default of true the greeter's power settings are left empty and gnome-settings-daemon
      # falls through to its schema default of 900 s / suspend, which is the source of every
      # idle suspend in the journal (logs/pyrite-idle-suspend-diagnosis.md §1.1-§1.4). false
      # makes nixpkgs write a greeter database with both timeouts 0 and both types "nothing".
      services.displayManager.gdm.autoSuspend = false;
      services.desktopManager.gnome.enable = true;

      programs.niri.enable = true;
      # Explicit null beats niri.nix's mkDefault "niri"; the option default does not.
      # "gnome" would also rewrite every user's saved AccountsService session on each
      # GDM start. null leaves that history intact and lets GDM fall back to GNOME.
      services.displayManager.defaultSession = null;
      # No picker switch: gnome-shell 50.2 js/gdm/loginDialog.js:388-390 hides the
      # session button only when ids.length <= 1; registering niri supplies the second.

      # Nothing on this machine suspends itself on idle. Resume from suspend fails in roughly
      # one cycle in five — 7 failures against 30 successes across 14 boots — with no
      # identified signature: the last journal line before a failure is byte-identical to the
      # last line before a success (logs/pyrite-resume-failure-diagnosis.md §0, §1.3, §4.4).
      # disable-lid-wakeup above leaves the power button as the machine's only wake source
      # (ibid. §5.2), so any failed unattended resume costs a physical trip. This is harm
      # reduction, not a fix: manual suspend stays available and still carries the risk.
      # Both halves of each pair are set, and the -type key is the durable one. In
      # gnome-settings-daemon's idle_configure() the watch registration is nested as
      # `if (timeout_sleep != 0) { ... if (action_type != GSD_POWER_ACTION_NOTHING) { ... } }`
      # (verified at tag 50.1, plugins/power/gsd-power-manager.c:2102 and :2105), so a 0
      # timeout and a "nothing" type each independently stop the idle watch from ever being
      # registered; neither merely declines to fire an already-armed watch. The -type keys are
      # kept because they still hold if a nonzero timeout is later written back into the user
      # database, which is exactly what GNOME Settings did on 2026-09-08
      # (logs/pyrite-graphical-session-idle-evidence.md §5). idle-delay stays 1800: the panel
      # must still blank and lock at 30 minutes; only suspend is disabled.
      #
      # settings carries no locks attribute, deliberately: locking these keys would grey
      # out the matching GNOME Settings controls, and a change made there has to win over
      # what is set here. The generated /etc/dconf/profile/user lists user-db:user ahead of
      # the file-db, which is what makes it win. Every integer carries the constructor for
      # its schema type — "u" for idle-delay, "i" for the sleep timeouts — because
      # lib.gvariant.mkValue refuses to infer a width from a bare Nix integer and throws
      # during the keyfile generation rather than at the option's type check. The -type keys
      # are enum-typed (enum="org.gnome.settings-daemon.GsdPowerActionType", schema default
      # 'suspend'), so they serialize as GVariant strings and take bare Nix strings; the
      # compiled keyfile reads sleep-inactive-ac-type='nothing' (verified by reading the
      # generated keyfile out of the store, not from the source).
      programs.dconf.profiles.user.databases = [
        {
          settings = {
            "org/gnome/desktop/session".idle-delay = lib.gvariant.mkUint32 1800;
            "org/gnome/settings-daemon/plugins/power" = {
              sleep-inactive-ac-timeout = lib.gvariant.mkInt32 0;
              sleep-inactive-battery-timeout = lib.gvariant.mkInt32 0;
              sleep-inactive-ac-type = "nothing";
              sleep-inactive-battery-type = "nothing";
            };
          };
        }
      ];

      # Encrypted-root administration tools, in the closure rather than fetched on demand.
      # The reinstall is the deploy, so a tool absent here is absent on the machine that
      # comes back, and every post-install check (sgdisk -p, cryptsetup luksDump, the
      # luksUUID discriminator, the systemd-cryptenroll readback) plus the recurring
      # `cryptsetup luksHeaderBackup | age -r` lifecycle runs on pyrite itself, whose only
      # NIC is the WiFi the install can plausibly have broken. libfido2 supplies
      # fido2-token for identifying the seated token; yubikey-manager is deliberately
      # omitted, since its distinct capabilities (serial, FIDO PIN retries) are vendor
      # administration outside the unlock and verification path.
      environment.systemPackages = with pkgs; [
        cryptsetup
        gptfdisk
        age
        libfido2
      ];

      # Increase MaxAuthTries to accommodate agent forwarding with many keys
      # Default is 6, but Bitwarden SSH agent may have 10+ keys loaded
      services.openssh.settings.MaxAuthTries = 20;

      # Bridge NixOS-level sops to home-manager for user secret key delivery.
      # sopsIdentity defaults to flake.users.cameron.meta.sopsAgeKeyId
      # ("crs58" via alias-fold inheritance).
      hm-sops-bridge.users.cameron = { };

      # cameron is the preferred username on new machines and folds to crs58 by alias;
      # alias-keyed reads keep this call site ignorant of the alias->target relationship.
      # Infrastructure settings (useGlobalPkgs, extraSpecialArgs, etc.) are provided by
      # the cameron inventory service.
      home-manager.users.cameron = {
        imports = flakeUsers.cameron.modules ++ [ flakeHomeModules.niri ];
        # Validate with the exact derivation installed by nixpkgs' NixOS module.
        programs.niri.package = config.programs.niri.package;
      };
    };
}
