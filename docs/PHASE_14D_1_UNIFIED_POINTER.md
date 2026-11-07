# Phase 14D.1 — Unified Pointer

Date: 2026-11-07
Branch: `feature/connectArchitecture`

## Scope and working-tree preservation

Continued on the current branch without creating or switching branches. Existing
Phase 14C.3 connection changes and Phase 14D header, settings, preferences,
diagnostics and adaptive navigation work were preserved. Current content and
working-tree changes were inspected before integrating the new Pointer surface.
No commit, push, merge, rebase, stash, reset or revert was performed.

No connection manager, use case, LG adapter, transport, security, pairing,
Wake-on-LAN, discovery algorithm, native sensor code, motion mathematics,
NumericKeypad, channel-selection, D-pad or rocker implementation was changed.

## Previous UI problems

Phase 14D had a Buttons / Pointer navigation bar followed by a second Touchpad /
Motion selector. Touchpad and Motion were separate panels, requiring navigation
between complementary input methods. Motion required a separate Select control
after aiming. This phase replaces that arrangement with one shared surface.

The actual touchpad implementation, `useTouchpadGestures`, has drag-to-move,
short-tap-to-select, throttling and cancellation. It contains no dedicated
multi-finger/TV scroll recognizer, sensitivity setting, or scroll command. Its
existing movement and tap algorithms were preserved, rather than inventing a
scroll feature under a UI refactor. Parent ScrollView locking is preserved and
tested. Dedicated TV scrolling remains an existing limitation.

## Updated layout

- Buttons retains its entry to Pointer.
- Pointer shows a compact title and a small Buttons return action.
- One large touchpad is the primary visual element.
- One prominent Aim control sits directly below it, alongside a smaller Recenter.
- The top-level Buttons / Pointer bar remains visible in both views. Only the
  inner Touchpad / Motion selector is removed. No separate Select button or
  Motion panel is rendered.
- Existing power/home/back and volume/channel controls remain accessible.
- Sensitivity, inverted axes and developer diagnostics stay in Settings with
  their Phase 14D Redux ownership and session retention unchanged.

Touchpad and Aim are simultaneously available without switching modes. Motion
availability does not disable touchpad or Aim's tap-to-select behavior. When
sensors are unavailable, compact feedback explains the available alternatives;
Recenter is disabled. Connection or unsupported pointer capability disables input.

The old standalone MotionSurface component is no longer used by RemoteScreen.
It is retained for compatibility and its existing tests; no second controller or
hidden sensor stream is mounted by the unified screen.

## Aim gesture state machine

One PanResponder in `useAimGesture` owns physical gesture recognition. There is
no overlapping Pressable/onPress/onLongPress recognizer. Native accessibility
activation has a dedicated select-only handler, with no motion startup.

| State / event | Transition and action |
| --- | --- |
| Idle, Released or Cancelled + valid press | Candidate; record bounds/origin/time and start a 400 ms timer |
| Candidate + release before 400 ms, within bounds and 12-point tap slop | Released; send exactly one select |
| Candidate + 400 ms elapsed | Aiming/consumed hold; engage existing Motion only if sensors are available |
| Aiming + release | Released; stop Motion, send zero selects |
| Candidate + large finger movement | Cancelled; cancel timer, send zero selects |
| Candidate/Aiming + finger outside Aim, extra touch or responder interruption | Cancelled; stop Motion, send zero selects |
| Candidate/Aiming + background, TV session change, disconnect, failure or unmount | Cancelled; invalidate work, send zero selects |

The 400 ms threshold is shared across platforms. Release checks elapsed time as
well as timer state, so a delayed JS timer cannot turn a completed hold into a
click. A long hold without available sensors is still consumed and never becomes
a click. Duplicate release events are ignored. A fresh tap after a completed hold
selects once. Rapid deliberate taps each select once. Cancellation remains final
for that press; re-entering the button does not reactivate it.

The small tap slop prevents a dragged candidate from being interpreted as a tap;
it does not change touchpad mathematics. After hold activation, finger motion is
allowed within the Aim bounds. Screen-reader activation selects once without
requiring Motion as the only input method.

## Sensor lifecycle and command ownership

`PointerSurface` reuses `useMotionPointer` with a new opt-in
`sampleOnlyWhileEngaged` setting. Existing hook consumers retain their platform
default. In the unified surface both iOS and Android check availability on mount
but start sampling only after a deliberate Aim hold. Release, cancellation,
backgrounding, native interruption, TV change or unmount stop sampling and
invalidate pending movement. Foregrounding refreshes availability without
restarting Motion. The existing serialized startup/stop path and controller
lifecycle guards also handle native startup resolving after release.

Motion movement continues through the existing controller and
SendRemoteCommandUseCase, retaining operation revision and movement-generation
predicates. A current pointer-command failure ends the hold, with no click on
release. Existing adapter recovery remains untouched. Sensor startup failure
stops sampling and permits a fresh hold to retry.

Touchpad retains `Touchpad` / `useTouchpadGestures` and receives guarded command
callbacks. A touchpad grant synchronously cancels Aim before sending movement.
Aim cannot start while a touchpad contact is active. This gives touchpad contact
priority and prevents unintended simultaneous streams while leaving it directly
usable during Motion. Touchpad movement predicates retain the input/session
identity and become false on release, cancellation, background or TV change.

Select commands use the existing select operation; no protocol calls are made in
presentation code and no application-layer command union was changed. Errors do
not retry selects, avoiding duplicate clicks. Failures arriving from an earlier
input/session cannot cancel a newer hold.

Recenter first cancels any Aim press, then calls the existing controller recenter
method. It does not click, start sampling or affect touchpad gesture calculations.
Remote tab blur still unmounts the input surface through the existing focus prop;
connection restoration and TV selection remain owned by their current layers.

## Accessibility and layout

The touchpad exposes “Move television pointer.” Aim exposes an accessible button
label and “Tap to select. Press and hold to aim.” hint, selected/disabled states,
and select-only accessibility activation. Recenter exposes “Recenter motion
pointer.” Aim has at least a 64-point height; Recenter and Buttons have at least
48-point targets. The touchpad has a 260-point surface. Controls can wrap/stack
using existing presentation layout and Android density tokens; text can scale.
Dark theme, parent safe areas and existing scrolling behavior are preserved.

Component tests inspect 320 × 640 with font scale 1.6 and 430 × 932 with font
scale 1.0. These checks do not substitute for native screenshots, hardware
interaction or VoiceOver/TalkBack execution.

## Files changed in this phase

New:

- src/presentation/components/PointerSurface.tsx
- src/presentation/hooks/useAimGesture.ts
- src/__tests__/presentation/PointerSurface.test.tsx
- docs/PHASE_14D_1_UNIFIED_POINTER.md

Updated compatibly on top of local work:

- src/presentation/screens/RemoteScreen.tsx — unified surface and input scroll lock
- src/presentation/components/RemoteModeSelector.tsx — Buttons/Pointer entry only
- src/presentation/components/TouchpadView.tsx — accessibility labels/hint
- src/presentation/hooks/useMotionPointer.ts — opt-in hold-only sampling, interruption
  notification, current-command failure cancellation and availability refresh
- src/__tests__/presentation/RemoteScreen.test.tsx — unified layout, availability,
  preserved controls, cleanup and scrolling coverage
- src/__tests__/presentation/ResponsiveLayout.test.tsx — current navigation contract

Existing tests were updated to reflect the new interaction instead of retaining
assertions for removed Touchpad/Motion tabs. No existing test cases were deleted.

## Test and build results

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Passed |
| `npm run lint` | Passed; 0 errors, 6 existing warnings in generated reports |
| `npm test -- --runInBand --watchman=false --forceExit` | Passed: 56 suites, 565 tests |
| Android `:app:testDebugUnitTest --rerun assembleDebug` | Passed; 18 freshly executed app JVM tests, debug build successful |
| iOS Simulator Debug, generic simulator, signing disabled | Passed: `BUILD SUCCEEDED` |
| `git diff --check` | Passed |
| Physical-device QA / native screenshot review | Not executed |

Android used the installed Zulu 17 JDK and Android SDK. The iOS build command was:

```sh
xcodebuild -workspace ios/SmartRemote.xcworkspace -scheme SmartRemote \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/smartremote-phase14d-build CODE_SIGNING_ALLOWED=NO build
```

Native builds used approved toolchain/cache access. Gradle deprecation and Xcode
script-phase warnings remain. The first lint run found an unused import left by
removing Remote's availability effect; it was corrected. No final check failure
is hidden. Jest still uses the previously documented `--forceExit` workaround
for asynchronous handles outside normal suite shutdown; this phase does not claim
to fix that test-harness limitation.

Deterministic coverage includes:

- Existing touchpad drag/tap/cancellation and parent scroll locking.
- Aim single taps, rapid repeated taps, exact threshold boundary, delayed timer,
  drag slop, duplicate release, long-hold movement, no click on hold release, and
  subsequent tap selection.
- Responder termination, leaving bounds, background/foreground, disconnect,
  batched TV switching, native interruption and unmount.
- Sensor-unavailable touchpad/select behavior, startup failure/retry and delayed
  native startup completing after release.
- Current pointer-command failure, failure from an older input, guarded stale
  movement, and touchpad taking ownership from Motion.
- Recenter without sensor startup/click, unsupported capabilities, accessibility
  activation, compact navigation and responsive component layouts.

Dedicated TV scroll gestures could not be tested as an existing operation:
none exists in the current gesture hook or command API. No fake scroll test or
new gesture algorithm was introduced.

## Physical QA checklist — pending

Run on Samsung Galaxy S24 Ultra and a physical iPhone, against LG 65QNED70A6A.
Record device OS, app build, results and reproduction steps.

- [ ] Open/reconnect Remote and enter Pointer; verify no nested mode bars.
- [ ] Drag the touchpad and confirm pointer movement follows the finger.
- [ ] Tap touchpad and confirm one selection; confirm cancellation does not select.
- [ ] Tap Aim once and confirm one selection; repeat rapidly and count selections.
- [ ] Hold Aim past 400 ms and physically rotate/tilt the phone to move the pointer.
- [ ] Release Aim and confirm movement stops with no selection.
- [ ] Tap Aim after positioning and confirm exactly one selection at that target.
- [ ] Move a finger outside Aim before/after activation; confirm safe cancellation.
- [ ] Touch the pad while holding Aim; confirm touchpad wins without two streams.
- [ ] Recenter and verify calibration without a click or unintended activation.
- [ ] Background during candidate/active hold; foreground and release without click
      or automatic motion restart. Start a fresh hold to resume.
- [ ] Disconnect/switch TVs during candidate/active hold; verify no stale input is
      sent to the old or newly selected TV.
- [ ] Interrupt the pointer socket/network and verify a deliberate fresh gesture
      can recover through the existing adapter path.
- [ ] Leave Remote for Settings/TVs while holding Aim; verify sensor activity stops.
- [ ] Verify Settings sensitivity/inversion still apply when returning to Pointer.
- [ ] Verify small-window/large-font Android layout and iPhone safe areas have no
      clipping/crowding; check keyboard, VoiceOver and TalkBack interactions.
- [ ] Recheck keypad/direct channels, D-pad, volume/channel, power/home/back,
      TV switching, wake behavior and the address-free header.

## Known limitations

Hardware, simulator runtime UI inspection, native screenshots and assistive
technology were not executed. Build success is not a hardware-test result.
Dedicated TV scroll gestures are absent in the existing implementation and remain
out of scope. Motion preferences remain session-scoped as documented in Phase
14D. Sensor unavailability may require a foreground availability refresh or
reopening Pointer after permissions/device conditions change. No new dependency
or diagnostic system was introduced.
