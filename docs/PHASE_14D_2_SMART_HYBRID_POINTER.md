# Phase 14D.2 — Smart Hybrid Pointer

Date: 2026-11-07. Branch: `feature/connectArchitecture`.
Existing uncommitted Phase 14C.3/14D work was inspected and preserved. No branch
change, commit, push, merge, rebase, stash, reset or revert was performed.

## UI and reuse

Pointer retains the main Buttons / Pointer selector, power/home/back and the
existing volume/channel rockers. The redundant Pointer heading, Buttons shortcut,
large Aim control and repeated instructions have been removed. A 220-point
primary touchpad is followed by compact Select and Recenter controls (minimum
48-point targets). Controls wrap/stack using existing layout/density tokens.
Dark colors, text scaling and parent safe areas are retained.

The existing Touchpad/useTouchpadGestures and useMotionPointer/controller/native
services still own input interpretation and commands. No Swift CoreMotion,
Kotlin SensorManager, motion mathematics, inversion transform, D-pad, keypad,
channel-selection, rocker, wake or discovery algorithm was changed. Touchpad's
new optional onCancel callback exposes its existing termination event; its gesture
math is unchanged. The previous standalone Aim gesture helper remains unused by
the production Pointer screen.

## Automatic Motion lifecycle

Automatic Motion requires all of: mounted/focused Pointer, foreground app,
Connected state, confirmed supported pointer capability, available sensors,
hydrated preferences and Automatic Motion enabled. Remote already mounts the
surface only when Pointer and the Remote tab are active. Buttons/tab exit,
background/inactive, disconnect, TV session change, unsupported capability,
preference opt-out and unmount stop or invalidate Motion.

The unified surface uses the hook's existing serialized, generation-guarded
start/stop path with `sampleOnlyWhileEngaged`; the small arbitration hook engages
it automatically when eligible. Availability checks do not start sampling.
Foreground refresh rechecks availability and restores only valid input.
Sensor/startup or current pointer failure pauses automatic Motion without a
retry loop. Touchpad remains usable; a deliberate new input or valid foreground/
session transition can recover. No sensor initialization was added to TV connect.

## Explicit input arbitration

`useHybridPointer` owns four states in a ref: motion, touchpad, selection,
suspended. UI does not expose these technical states.

| Event | Ownership and behavior |
| --- | --- |
| Eligible idle Pointer | Motion; fresh baseline, then existing controller output |
| Touchpad grant | Immediately stop/invalidate Motion, then give touchpad exclusive ownership |
| Touchpad drag | Existing deltas through SendRemoteCommandUseCase with input/session predicates |
| Touchpad release/cancel | Drop old buffers and resume eligible Motion after 80 ms |
| Touchpad tap | Selection; stop movement, send one select, then resume |
| Select press-in | Stabilize immediately; no click yet |
| Select activation | One existing select command; restore after completion + 80 ms |
| Select cancellation | No click; bounded restoration if still eligible |
| Recenter | Stop pending movement, use existing recenter, restore after 80 ms |
| Lifecycle/session invalidation | Suspended; invalidate timers, touches and stale callbacks |

`POINTER_RESUME_DELAY_MS = 80` is explicit and deterministically tested. Selection
uses the existing command completion, not a second click/retry implementation.
Motion cannot resume during the transition, a touch, or pending selection. A
Select release cannot steal ownership from a newer touchpad contact. Stale
select/failure completions cannot affect a newer input or TV session. Terminated
touchpad contacts cannot produce a click from an extra terminal callback.

## Stabilization

Controller defaults already include a 0.025 rad/s dead zone, smoothing, bounded
deltas and a baseline frame. They were not retuned. Disengage clears pending
movement; re-entry recenters and the first new sensor frame anchors the reference.
This prevents old accumulated deltas from being replayed. Select press-in pauses
Motion before thumb release so movement does not continue while selecting.
No claim of physically stable cursor behavior is made without device testing.

## Preferences and persistence

Settings > Remote Preferences now contains Automatic Motion, default enabled
when the device and TV support it. Disabled Motion never starts sensors, while
Touchpad and Select remain usable. Sensitivity and inversion stay in their
existing sections; raw diagnostics remain in Developer Settings.

`bindRemotePreferences` uses the existing IKeyValueStorage/AsyncStorage adapter,
with a separate versioned key (`smartremote.remote-preferences.v1`). Automatic
Motion, sensitivity and axis inversion survive app/container recreation; raw
diagnostic mode is intentionally not persisted. Writes are serialized. Hydration
is independent from TV connection/restoration and does not delay the fast path.
Motion waits for hydration, preventing an old opt-out from briefly starting
sensors. An edit during hydration does not overwrite other stored preferences.
Malformed/unreadable storage fails closed for automatic Motion, and Settings
shows when values apply in memory but could not be saved. No dependency added.

## Files changed for this phase

- PointerSurface.tsx, RemoteScreen.tsx: cleaned production layout/integration.
- useHybridPointer.ts (new): small ownership/lifecycle coordinator.
- useMotionPointer.ts: optional current-input predicate also invalidates buffered
  Motion commands immediately when ownership/preferences change.
- Touchpad.tsx / useTouchpadGestures.ts: optional termination notification only.
- remoteSlice.ts, MotionSettings.tsx: Automatic Motion and hydration/error state.
- bindRemotePreferences.ts (new), container.ts: existing-storage persistence.
- PointerSurface.test.tsx: replaced obsolete hold-Aim UI expectations with the
  current automatic hybrid contract, preserving interruption/failure coverage.
- RemoteScreen.test.tsx / SettingsScreen.test.tsx: current UI/default preference.
- RemotePreferences.test.ts (new): persistence, hydration races and failure cases.

## Validation (combined final working tree with Phase 14E)

- TypeScript: passed (`npx tsc --noEmit`).
- ESLint: passed, no errors; 6 warnings in generated Android/coverage reports.
- Jest: 59 suites, 585 tests passed using `--runInBand --watchman=false --forceExit`.
- Android: fresh app JVM run, 23 tests passed; debug build passed.
- iOS: generic iOS Simulator Debug build passed, signing disabled.
- `git diff --check`: passed.

The existing Jest open-handle/forceExit limitation remains. Gradle deprecation
and Xcode script warnings remain. Initial failures were obsolete Aim UI assertions,
a test fixture lacking navigation capability for Select, and an unused import;
these were corrected without weakening connection/security tests. Native sensor
mathematics tests remain intact.

Deterministic checks cover automatic activation on both platform paths, Buttons/
Remote exit, background/foreground, disconnect, TV switch/stale output, immediate
touch takeover, drag/tap/cancel, fresh baseline restoration, Select stabilization
and single clicks, Recenter, opt-out, unavailable/failing sensors, pointer failure,
late completion, competing input and unmount. Component layout checks cover
320×640/font scale 1.6 and 430×932/font scale 1.0.

## Physical QA — not executed

Run on Samsung Galaxy S24 Ultra and physical iPhone against LG 65QNED70A6A.
Record device OS/build, result, observed latency/jumps and reproduction steps.

- [ ] Enter Pointer and move the phone without pressing Aim; verify responsive cursor movement.
- [ ] Touch/drag the pad during Motion; verify exclusive touch control.
- [ ] Release the pad; verify fresh Motion baseline and no cursor jump/replay.
- [ ] Tap the pad and use Select; verify exactly one selection and stabilization.
- [ ] Recenter while moving; verify no click or abrupt stale movement.
- [ ] Disable Automatic Motion, restart the app and verify sensors remain inactive.
- [ ] Re-enable Motion and verify sensitivity/inversion continue to apply.
- [ ] Background/foreground, disconnect/reconnect and switch TVs during movement.
- [ ] Rapidly switch Buttons/Pointer and Remote/Settings; confirm sensor cleanup.
- [ ] Check small-window/large-font Android and iPhone safe areas, one-handed reach,
      VoiceOver/TalkBack, clipping/crowding and existing remote commands.

## Known limitations

No physical hardware, native runtime screenshots or assistive-technology execution
was performed. The 80 ms handoff and unchanged dead zone need hardware validation.
The current touchpad has no dedicated TV scroll recognizer/scroll command or
separate touchpad sensitivity setting; existing vertical drag and parent scroll
locking are preserved. No fake scroll test or new gesture algorithm was added.
