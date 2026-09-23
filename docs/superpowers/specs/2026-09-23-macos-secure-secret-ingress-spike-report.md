# macOS Secure Secret-Ingress Feasibility Spike

**Status:** Recommendation complete; production decision awaiting explicit review
**Date:** 2026-09-23
**Milestone:** Post-R1 UX & Operations Hardening / UXH2 Workspace Connections
**Production code changed:** No

## Goal

Determine the smallest safe macOS-compatible mechanism for supplying a user-entered secret to RoofRoom's privileged main-process credential boundary without exposing the value through renderer state, ordinary configuration, command-line arguments, logs, exports, or unnecessary persistent plaintext.

This spike compares:

1. a main-owned native secure prompt/helper;
2. an external secure provisioning command;
3. clipboard ingress only as a last-resort fallback.

The result is a recommendation and approval gate. It is not a SerpApi provisioning implementation and does not start UXH3.

## Evidence method and limits

The repository audit followed the one-hop rule. The only runtime input used was an obvious synthetic sentinel, and experiment output reported booleans, byte counts, exit states, or fixed error states rather than the input value. No provider request, real credential, browser/session credential, ordinary secret file, renderer message, or clipboard mutation was used.

Evidence labels mean:

- **PROVEN:** directly established by current repository source, official platform documentation, or the local experiment on the target Mac;
- **INFERENCE:** a reasoned conclusion from proven evidence that was not itself exercised end to end;
- **NOT TESTED:** deliberately outside this bounded spike or unsafe to test against user state.

Local probe environment:

```text
macOS 26.6.2
Apple Silicon arm64
Node v24.19.0
Electron 43.4.0
/usr/bin/osascript: Apple system universal binary (x86_64, arm64e)
```

## Existing security boundary

### PROVEN

- `CredentialStore.writeCredential(credentialRef, secret)` is the existing narrow privileged persistence port.
- `ElectronSafeStorageCredentialStore` is composed only in main, requires OS-backed encryption, encrypts the supplied string with Electron `safeStorage`, and writes only encrypted bytes under the application data credential directory with directory mode `0700` and file mode `0600`.
- Electron documents `safeStorage` as a main-process API; on macOS its encryption keys are held in Keychain. Electron also states that a stable application signature is required for consistent Keychain identity. See [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).
- The current preload surface contains no secret, API-key, clipboard, or generic secret-ingress method. The safe `DESKTOP_CONNECTIONS` read contract is unchanged.
- Normal Google OAuth remains main-owned. The browser, loopback callback, token exchange, encrypted credential bundle, and optional application secret material do not cross renderer IPC.
- There is no current provisioning command, clipboard path, or production `SecretIngressPort`.
- The current package disables Electron's `RunAsNode` fuse. A packaged Electron executable therefore cannot be treated as a general Node CLI through `ELECTRON_RUN_AS_NODE`; an external provisioning mode would need an explicit application bootstrap path or an additional executable.
- Current Forge configuration uses ad-hoc macOS signing (`identity: '-'`), disables hardened runtime, and contains no notarization configuration. This spike therefore cannot claim Developer ID/hardened-runtime/notarized compatibility from the existing package setup.

### INFERENCE

Every candidate that reuses the existing store must transiently represent plaintext in privileged process memory because the current store port accepts a JavaScript string. The practical goal is therefore to minimize lifetime and copies, prevent persistence and logging, and keep the value out of renderer, argv, environment, config, and global clipboard state. JavaScript strings cannot provide a reliable zeroization guarantee.

## Candidate A — main-owned native masked prompt

The smallest candidate is a fixed AppleScript `display dialog` with `default answer ""` and `hidden answer`, launched by the main process through the absolute system path `/usr/bin/osascript` with `shell:false`. The script source contains prompt copy only; the secret is entered after launch and returned through a captured stdout pipe.

### PROVEN

- Apple's `display dialog` supports `hidden answer`; the editable field renders characters as bullets. It also exposes a defined cancel path and timeout behavior. See the [AppleScript Commands Reference](https://developer.apple.com/library/archive/documentation/AppleScript/Conceptual/AppleScriptLangGuide/reference/ASLR_cmds.html).
- Apple explicitly warns that the returned hidden text is plain, unencrypted text. Visual masking is not encryption. See [Prompting for Text](https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/PromptforText.html).
- Electron's current `dialog` API exposes open, save, message, error, and certificate dialogs but no generic text/password prompt. See [Electron dialog](https://www.electronjs.org/docs/latest/api/dialog).
- On the target Apple Silicon Mac, the secrets-free local probe successfully executed `/usr/bin/osascript` with a fixed hidden-answer dialog using Node `spawn`, `shell:false`, ignored stdin, and captured stdout/stderr. The dialog returned its timeout record with exit code `0`; the probe printed only stream byte counts. No secret was present in argv.
- A second secrets-free probe terminated the prompt with `SIGTERM`. It exited without stdout or stderr content, proving that the parent can enforce an abort/timeout boundary without persisting an answer.
- The probe required no repository file, temporary file, native package, or bundled helper.
- Node documents direct subprocess execution without a shell and parent-owned stdio pipes. See [Node child process](https://nodejs.org/api/child_process.html).
- A separately compiled helper would add nested code. Apple requires nested helpers to be correctly placed and signed before the containing app is signed, which materially expands build/sign/notarization work. See [macOS Code Signing In Depth](https://developer.apple.com/library/archive/technotes/tn2206/).

### INFERENCE

- Because `/usr/bin/osascript` is supplied and signed by macOS rather than bundled inside RoofRoom, this adapter does not add a nested-code signing target.
- The current non-sandboxed packaged app should be able to spawn the same absolute system executable from Electron main. A packaged smoke test remains required before production acceptance.
- The value can avoid shell history, process argv, environment, renderer IPC, ordinary config, temporary files, and clipboard if the script is fixed and only post-launch dialog input is accepted.
- Captured stdout necessarily carries plaintext between the system process and Electron main. Production code must never inherit, print, log, interpolate, or include that buffer in an error; it must apply a small byte limit, a timeout, and fixed error mapping before immediate handoff to `CredentialStore`.
- A custom AppKit helper using `NSSecureTextField` could improve branding and control but does not eliminate privileged plaintext transfer to the current string-based store. Its additional build/sign/notarization surface is not justified by evidence from this spike.

### NOT TESTED

- A human-entered secret flowing end to end into the real credential store. The experiment intentionally did not persist even a synthetic secret.
- Invocation from the signed packaged RoofRoom application.
- Developer ID signing, hardened runtime, or notarization; the current repository package configuration is ad-hoc and non-hardened.
- Prompt ownership/branding, VoiceOver, keyboard-navigation, localization, focus, multi-display, and screen-recording behavior.
- Memory-forensics resistance or zeroization, which the current JavaScript string boundary cannot guarantee.

## Candidate B — external secure provisioning command

The feasible form is an explicit command mode that starts first and then reads from an attached TTY with echo disabled. The secret must never be a command argument, URL, environment variable, or redirected ordinary file.

### PROVEN

- A local Node proof required a real TTY, enabled raw mode, accepted the synthetic sentinel after process launch, did not echo it, passed it to a fake `CredentialStore.writeCredential`, and printed only safe metadata. The running process had no secret value in its argv/process listing.
- The proof rejected non-TTY stdin with exit code `64` before any store call. This prevents accidental plaintext piping or unattended redirected input in the tested design.
- `Ctrl-C` restored terminal mode, returned exit code `130`, and made no store call.
- Node documents that TTY raw mode disables terminal echo and special input processing. See [Node TTY](https://nodejs.org/api/tty.html).
- The current repository has no provisioning command or CLI bootstrap, and the packaged application has `RunAsNode` disabled.

### INFERENCE

- A supported command could reuse the existing store only by adding an explicit Electron main startup mode that waits for `app.ready`, obtains the packaged app-data path and `safeStorage` identity, requires a TTY, prompts after launch, and exits without creating renderer windows. That is feasible but is more lifecycle and packaging work than Candidate A.
- A separate Node executable cannot directly reuse Electron `safeStorage` as though it were an ordinary Node library. A separate native Keychain tool would create another persistence contract rather than reuse the current credential store.
- The command has a clear operator/recovery use case but a weaker general-user experience: Terminal discovery, app-path quoting, TTY requirements, and success/failure interpretation all become support surface.
- Shell history avoids the secret only when the command line contains identifiers/options and the child performs the later no-echo prompt. The command itself may still appear in history, which is acceptable because it contains no secret.

### NOT TESTED

- A packaged Electron CLI mode, real `safeStorage` write, app-singleton interaction, or signed-app Keychain identity.
- Terminal accessibility across shells and terminal applications.
- Controlled stdin from an already-secure external source; no such source is currently part of the product contract.

## Candidate C — clipboard fallback

### PROVEN

- Electron exposes system clipboard read, write, and clear operations to main. Main-process-only implementation is technically possible. See [Electron clipboard](https://www.electronjs.org/docs/latest/api/clipboard).
- Apple's general pasteboard participates in Universal Clipboard. See [NSPasteboard](https://developer.apple.com/documentation/appkit/nspasteboard/).
- No current RoofRoom preload or renderer contract exposes clipboard access.
- The spike did not read, replace, or clear the user's clipboard. A dynamic probe would itself ingest potentially private current contents or disturb global user state.

### INFERENCE

- Reading a secret from the system clipboard makes it available to any other software or clipboard manager allowed to observe that global state. Universal Clipboard may widen the exposure beyond the local process.
- Clearing after read cannot guarantee deletion from clipboard history, another device, or an observer that already copied the value.
- Saving and restoring only text can destroy richer clipboard formats. Saving every format brings unrelated private clipboard material into RoofRoom memory. Either approach also has a race in which a user's intervening copy can be overwritten or cleared.
- Keeping clipboard access out of preload prevents direct renderer access but does not repair the global-state, history, persistence, or race risks.

### NOT TESTED

- Any clipboard mutation, clipboard-manager behavior, Universal Clipboard propagation, or clear/restore race. These vary by user configuration and were intentionally not triggered.

## Security comparison

| Criterion | A: native masked prompt | B: external TTY command | C: clipboard |
|---|---|---|---|
| Secret reaches renderer | No by design | No by design | Avoidable, but requires new main clipboard path |
| Ordinary config/file required | No | No if TTY-only | No, but global clipboard is stateful |
| Secret in argv/history | No with fixed script | No with post-launch prompt | No argv, but clipboard history risk |
| Logging/stdout risk | Captured plaintext pipe; must never log | No secret output in tested design | Clipboard observers/history outside app control |
| Existing store compatibility | Direct main handoff | Requires explicit Electron CLI bootstrap | Direct main handoff possible |
| Apple Silicon evidence | Native prompt probe passed | TTY probe passed | API availability only; no mutation |
| Packaged-app complexity | Low; no bundled helper | Medium; new startup mode or executable | Low code complexity, high residual risk |
| General-user UX | Native masked dialog | Terminal/operator workflow | Familiar but unsafe global-state behavior |
| Deterministic testability | High with injected process runner | High with injected TTY/store | API fakes cannot prove external observers/history |
| Failure recovery | Fixed cancel/timeout/error; no write before answer | Non-TTY/cancel fail closed | Clear/restore is inherently race-prone |

## Recommendation

Adopt **Candidate A: a main-owned macOS native masked prompt through the system `/usr/bin/osascript` executable**, subject to explicit review and a signed-package smoke test.

This is the smallest mechanism that fits the current security model:

- the user enters the value into a system-native masked field;
- the fixed script is launched directly with `shell:false`;
- the secret is not an argument, environment value, config value, renderer payload, temporary file, URL, or clipboard item;
- the main process receives it through a private captured pipe and can hand it immediately to the existing `CredentialStore`;
- no extra native dependency or bundled helper signing target is introduced.

The recommendation does not claim that masking encrypts the value. Apple confirms that the returned text is plaintext. The security boundary depends on main-only execution, private captured stdio, strict non-logging, short lifetime, fixed errors, and immediate encrypted persistence.

Candidate B should be deferred as a possible operator/recovery fallback, not the primary product flow. Candidate C should remain rejected as a production contract unless future evidence proves both A and B infeasible and residual global-clipboard risk is explicitly accepted.

## Required production guardrails

If the recommendation is approved, the future design must require:

- a narrow main-only `SecretIngressPort` with purpose-specific prompt identifiers and a typed submitted/cancelled result;
- a macOS adapter that invokes only `/usr/bin/osascript`, uses a fixed script, sets `shell:false`, ignores stdin, and captures stdout/stderr without logging either;
- no prompt text, option, or renderer value capable of becoming executable AppleScript;
- no secret in argv, environment, URL, file, config, IPC response, error, diagnostic, or success message;
- maximum input/output byte limits, an explicit timeout/abort path, empty-input rejection, and fixed safe error mapping;
- immediate handoff to `CredentialStore.writeCredential` and dropping of references afterward, with an explicit acknowledgement that JavaScript string zeroization is not guaranteed;
- deterministic tests through an injected subprocess adapter and fake credential store; tests assert that renderer/preload contracts still contain no secret field;
- a packaged-app smoke on the supported Apple Silicon Mac and, before distribution acceptance, a repeat under the intended Developer ID, hardened-runtime, and notarization configuration;
- accessibility/focus verification before calling the UI production-ready.

## Rejected or deferred alternatives

- **Custom AppKit/XPC helper:** deferred. It adds native code, nested signing, notarization, IPC, and maintenance without evidence that the simpler system prompt fails the product security model.
- **Electron renderer modal/password field:** rejected. It places the secret in renderer memory and requires a secret-bearing renderer IPC contract.
- **Secret in CLI argument, environment, URL, ordinary stdin pipe, or config file:** rejected because it expands history, process-listing, environment-dump, file, or log exposure.
- **Clipboard:** rejected as the normal path because clearing and restoration cannot control history, observers, Universal Clipboard, or races.

## Production implementation boundary and exact next action

No production path was implemented by this spike. No schema, IPC, preload, renderer, credential-store, provider, package, or ADR contract changed.

The exact next action is an explicit review of this recommendation. If Candidate A is approved, write a separate bounded SerpApi provisioning design and TDD plan. That plan may compose the narrow main-only ingress port and native adapter into SerpApi Connect/Replace-Key, but it must keep the renderer intent secret-free, reuse existing schema-v8 compensation/reference semantics, add no clipboard path, and stop before UXH3. Production implementation must not begin from this report alone.
