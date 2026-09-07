---
title: Kanidm Operations
description: Operational procedures for administering the kanidm IdP on magnetite — user onboarding, credential recovery, group management.
---

## Overview

Kanidm runs on magnetite as the household identity provider, serving matrix-synapse and other directly registered OIDC clients.
This runbook covers operational procedures executed by an admin via the kanidm CLI.

## Why kanidm

Kanidm is the chosen IdP for magnetite, selected over several alternatives.

- Authelia was rejected: its declarative provisioning surface is less expressive, and its OIDC scope and claim model lacks the per-client granularity (separate scope maps, claim maps, supplementary scope maps) needed as more clients such as buildbot and Gitea are added.
- Gitea-as-IdP was rejected: its OIDC provider is a side-feature of a forge rather than a purpose-built IdP, with rudimentary scope mapping, and coupling identity to the forge would expand the IdP outage radius.
- Matrix-authentication-service (MAS) was considered as the synapse-native option and is the eventual upstream-canonical path, but adoption is deferred until a MAS-only mode is stable upstream and in nixpkgs.

### Prerequisites

- SSH access to `magnetite.zt` (ZeroTier mesh).
- Access to the `idm_admin` clan-vars password from the workstation or its deployed file on magnetite.
- A working `nix develop` shell for the Kanidm CLI; the examples below run it on magnetite rather than assuming the client is in the system profile.

From `/Users/crs58/projects/vanixiets` on the authorized workstation, retrieving the admin password through clan vars and copying it to the clipboard is accepted practice:

```bash
clan vars get magnetite kanidm-idm-admin-password/password | cb copy
```

Paste it into `kanidm login --name idm_admin` at the password prompt, not into a command argument, transcript, or chat, and clear the clipboard after use.
The equivalent deployed secret is `/run/secrets/vars/kanidm-idm-admin-password/password` on magnetite; either route accesses the same generator output.
Person and app-group administration use `idm_admin`.
For separate system-administration procedures requiring `admin`, the workstation retrieval is `clan vars get magnetite kanidm-admin-password/password | cb copy`; do not substitute that identity for person administration.

## Onboarding a new user

The end-to-end CLI sequence for adding a new household member who needs matrix access.
Precondition: the admin is authenticated to the kanidm CLI as `idm_admin`.

```bash
ssh magnetite.zt
export KANIDM_URL=https://accounts.scientistexperience.net
nix develop -c kanidm login --name idm_admin

nix develop -c kanidm person create <user> "<Display Name>"
nix develop -c kanidm person update <user> --mail <email>
nix develop -c kanidm person credential create-reset-token <user>
nix develop -c kanidm group add-members matrix_users <user>
```

Notes on each step:

- `kanidm login --name idm_admin` prompts for the `idm_admin` password from the clan-vars secret above and caches a session token under the admin's home directory.
- `person create` and `person update --mail` initialize the person record. The mail attribute is what synapse reads via the OIDC `email` claim during SSO.
- `person credential create-reset-token` prints a one-time-use URL and QR code.
  Deliver the raw reset URL through Signal, iMessage, an in-person QR scan, or encrypted email.
  Enclosing it in an encrypted, one-time `https://yopass.se` share is also accepted practice; give the intended recipient the share link and do not record either bearer link in logs or tickets.
  Do not send the raw reset URL through plain SMS, plain email, Slack, Discord, or another logged channel.
  The default reset-token TTL is 3600 seconds; for a longer window pass seconds explicitly, for example `kanidm person credential create-reset-token <user> 86400` for 24 hours.
  The wrapper does not extend the Kanidm token's expiry, and the recipient must redeem the reset URL before it expires.
- The user opens the URL in their own browser and registers a passkey. The household policy is passkey-only for kanidm credentials — passkeys are phishing-resistant and WebAuthn is broadly supported on modern devices. If a password recovery rail is ever needed, the admin uses the `kanidmd recover-account` disaster-recovery path described in the next section rather than provisioning a per-user password.
- `group add-members matrix_users` is what actually grants the new user matrix scope. Without it, the OIDC SSO flow from synapse to kanidm completes the user authentication but kanidm denies the OAuth2 scope request — the user sees an "Access Denied" page with an Operation ID. Group membership is managed operationally rather than declaratively because per-user declarative entries are destructive on re-provision (see the "Why operational, not declarative" section below).

### Verification

After the user registers their passkey, ask them to test SSO via `https://app.cinny.in/login/matrix.scientistexperience.net` or `https://app.element.io`.
A successful sign-in confirms the full chain: passkey registration, OIDC discovery, scope grant, and synapse account binding.

## Lost passkey or credential recovery

The recovery path when a user has lost their passkey, their reset-token URL has expired, and they have no other credentials registered.

Preferred path — issue a fresh reset-token URL:

```bash
ssh magnetite.zt
nix develop -c kanidm login --name idm_admin
nix develop -c kanidm person credential create-reset-token <user>
```

Hand the URL to the user via a secure channel.
The user re-registers a passkey on their device.
This is the preferred recovery flow because it preserves the privacy property — the admin never sees the user's credential.

Disaster-recovery path — `kanidmd recover-account`:

```bash
ssh magnetite.zt
sudo /run/current-system/sw/bin/kanidmd recover-account <user>
# Outputs a one-time recovery password. Hand to the user via a secure channel.
```

The `recover-account` subcommand of the `kanidmd` server binary (note: server binary, not the `kanidm` client) bypasses normal authentication and is the disaster-recovery path.
It works even when the kanidm CLI auth itself is broken.
Use this only when the user cannot get a fresh reset-token URL through the normal admin flow above — for example, if the `idm_admin` credentials themselves are unavailable.

Cross-reference: the household onboarding policy is passkey-only with no per-user kanidm password.
Recovery happens via admin-side intervention, not via a user-controlled password rail.

## Group management

Operational management of group membership for matrix scope and future SSO services:

```bash
# Add user to matrix_users (grants synapse OIDC scope per the scopeMap)
nix develop -c kanidm group add-members matrix_users <user>

# Remove a user from matrix_users (revokes their matrix scope grant)
nix develop -c kanidm group remove-members matrix_users <user>

# List current matrix_users members
nix develop -c kanidm group get matrix_users
```

### How to grant an existing person access to a new app

Reuse the existing person and passkey; adding an app does not require recreating the account, resetting credentials, or enrolling another passkey.
For Omnigent, first have the controller deploy the confidential `omnigent` client and its `omnigent_users` group.
The client must request `openid`, `profile`, and `email` through `scopeMaps.omnigent_users`, with `originUrl = "https://omni.scientistexperience.net/auth/callback"` and `originLanding = "https://omni.scientistexperience.net"`.
These are deployment prerequisites, not claims that the client is already live.

After obtaining the `idm_admin` password on the workstation as above:

```bash
ssh magnetite.zt
export KANIDM_URL=https://accounts.scientistexperience.net
nix develop -c kanidm login --name idm_admin
nix develop -c kanidm person get cameron --name idm_admin
nix develop -c kanidm group add-members omnigent_users cameron --name idm_admin
nix develop -c kanidm group list-members omnigent_users --name idm_admin
```

Confirm that the person record's primary mail is `cameron.ray.smith@gmail.com` before granting access; stop to reconcile a different or missing address rather than silently changing the identity.
Omnigent leaves `OMNIGENT_OIDC_ALLOWED_DOMAINS` unset and lists that address in its admin roster.
The roster grants Omnigent administrative privileges, while `omnigent_users` membership grants the Kanidm scopes needed to sign in.
Keep `idm_people_self_mail_write` empty; the deployment trusts administrator-maintained mail rather than independently verifying mailbox ownership.

To revoke the app's scope grant, run `nix develop -c kanidm group remove-members omnigent_users cameron --name idm_admin` and confirm with `group list-members`.
This prevents a subsequent authorization grant; it does not revoke an already issued Omnigent session cookie or runner grant.

### App tile and login verification

Ask the person to open `https://accounts.scientistexperience.net/ui/apps` after the group grant.
Kanidm lists OAuth2 clients whose scope maps reference one of the person's groups; the `Omnigent` tile therefore appears through group membership, with no per-user tile registration.
The tile requires the client's name, display name, and landing URL, and its link targets `originLanding`, not the OAuth callback URI.
For this client it opens `https://omni.scientistexperience.net`, which starts Omnigent's own login flow.

Verify that clicking the tile reaches an authenticated Omnigent UI using the existing passkey.
If the tile is absent, check membership and the provisioned scope map, display name, and `originLanding`; if login fails, check the primary mail and scope grant before considering credentials.
Do not set the email-verification bypass to work around a missing mail attribute.

The shipped mobile WebView shell opens the system browser through `/auth/cli-login`, then polls `/auth/cli-poll` and copies the returned session into the WebView.
It uses the same confidential server-side client, not a separately registered public mobile client.
Test laptop passkey login, tile navigation, and Android login separately; neither configuration inspection nor one successful browser login proves all three paths.

Source basis: `/Users/crs58/ghq/github.com/kanidm/kanidm`, local fork at tag `v1.11.0`, commit `ed10baa494adc1549c2e9e3d750465cc1052a7d1`, `list_applinks` in `server/lib/src/idm/applinks.rs:6-63` and `server/core/templates/apps_partial.html:14-17`.
Read those objects at the pin rather than the checkout's development HEAD.
Mobile behavior is described in the deployment plan's D4 with release-pinned Omnigent sources; device usability remains an operator observation.

### Why operational, not declarative

The `matrix_users` group is declared in `modules/nixos/kanidm.nix` as a stub:

```nix
matrix_users = {
  members = [ ];
  overwriteMembers = false;
};
```

This stub satisfies the nixpkgs referential-integrity assertion — the group must exist in the entity set for the synapse OAuth2 RS's `scopeMaps.matrix_users` reference — without requiring per-user declarative `provision.persons.<name>` entries.
Per-user declarative entries are destructive on re-provision: `provision.persons.*` overwrites existing identities on each deploy.
The `overwriteMembers = false` setting means operationally-added members persist across nix deploys; the declarative empty `members` list does not clobber the live state.

Reference: `modules/nixos/kanidm.nix` for the declarations.

## Matrix-side password rail

Matrix-synapse's legacy username-plus-password login rail is phased out via `password_config.enabled = false`.
Once it is disabled, all matrix logins must go through SSO.
This is distinct from kanidm-side credentials — kanidm always handles authentication via passkey (or any other credential the user registered).
The matrix-side password rail closure does not affect kanidm credential management procedures documented above.
During the transition both rails operate concurrently for a bounded window, with the password rail disabled only once SSO is confirmed end-to-end.

## Future content

Sections to add as operational needs surface:

- Rotating the `idm_admin` and `admin` clan-vars passwords (clan vars regenerate pattern).
- Audit log inspection (`kanidm system search ...`).
- OAuth2 client secret rotation, per RS, tied to clan-vars `kanidm-oauth2-<service>` regeneration.
- Migrating a kanidm deployment to a new host (relates to backup/restore architecture).

This runbook is a living document; sections are added as operational needs surface.
