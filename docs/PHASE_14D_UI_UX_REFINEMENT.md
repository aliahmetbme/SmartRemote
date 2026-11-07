# Phase 14D — UI/UX refinement

Date: 2026-11-07
Branch: `feature/connectArchitecture`, explicitly authorized by the user for this phase.

## Working-tree safety

The initial working tree contained intentional Phase 14C.3 changes in App.tsx,
the iOS scheme, connection-manager/adapter tests, TVConnectionManager,
SendRemoteCommandUseCase, StartupRestorationUseCase, LGWebOSAdapter,
LGWebOSPairingService, the Phase 14C.3 report, and src/diagnostics.
This phase did not edit those files. No branch switch, stash, reset, commit,
push, merge, or rebase was performed. Main was not modified.

## Existing UI audit (inspected before implementation)

- AppNavigator uses a bottom-tab navigator: Remote, Discovery, Settings. The
  Remote wrapper supplies links to Discovery and Settings. Tab screens can
  remain mounted after navigation; this matters for motion sensor ownership.
- RemoteScreen composes TVConnectionHeader, RemoteModeSelector,
  RemoteSystemControls, DirectionPad, VolumeRocker, ChannelRocker,
  NumericKeypad, AppShortcutList, InputShortcutList, Touchpad, and MotionSurface.
  Previously its three modes were Buttons / Touchpad / Motion, with the latter
  two mounted conditionally. Volume/channel and power/home/back are retained.
- TVConnectionHeader renders the supplied name and Redux connection status,
  plus Switch TV. Manual discovery creates names containing an IPv4 address,
  so removing only a separate address field would not solve the header issue.
- Touchpad delegates to useTouchpadGestures and the existing command use case.
  Gesture throttling, movement, click, termination and socket recovery stay in
  their existing layers. There is no separate scroll preference or new scroll
  gesture to expose in this phase.
- MotionSurface delegates to useMotionPointer / MotionPointerController and
  injected native sensor services. It previously included MotionCalibrationBar
  and MotionDiagnosticOverlay alongside hold-to-aim, select, and recenter.
- Motion sensitivity, inversion and diagnostic mode were hook-local state,
  initialized on each mount. No existing durable preference persistence was
  found. Native math, filtering and gesture algorithms do not need to change.
- Redux remoteSlice held volume/mute/input state; connectionSlice and tvSlice
  remain authoritative for connection readiness, capabilities and TV selection.
- SettingsScreen already provided saved TV connect/forget, selected TV details,
  reconnect/disconnect, MAC editing, test wake, and platform/network explanation.
  It was one scrollable page without a separate diagnostics destination.
- Discovery supports saved TVs, manual IP probing, scan capability checks,
  and pairing feedback. iOS automatic discovery is explicitly unavailable when
  its implementation does not support it.
- Existing theme/layout utilities own dark colors, spacing, safe-area budgets,
  font-scale adaptation, Android density and responsive control geometry.
  NumericKeypad remains an independent component with direct channel-selection
  handling; neither its source nor its behavior was edited.

### Control classification

| Category | Existing operations / information | Resulting location |
| --- | --- | --- |
| Everyday remote | D-pad, select, volume/mute, channels, numbers, apps, inputs, power/home/back | Remote Buttons; common system controls and rockers remain available in Pointer |
| Pointer interaction | Touchpad, hold-to-aim Motion, select, recenter | Remote Pointer > Touchpad / Motion |
| User preferences | Motion sensitivity | Settings > Remote Preferences |
| TV management | Saved TVs, selection, connect, forget, IP and MAC details | Settings > TV Management and Saved TVs; TVs tab for discovery |
| Connection troubleshooting | Reconnect/disconnect, MAC configuration, wake test, standby instructions | Settings > TV Management / Connection & Wake |
| Developer diagnostics | Invert X/Y, raw diagnostic mode, sampled motion values/rates, protocol/state, platform/network explanation | Settings > Developer Settings |

## Before / after organization

| Before | After |
| --- | --- |
| Remote: Buttons / Touchpad / Motion | Remote: Buttons / Pointer, then Touchpad / Motion |
| Header may contain IP in saved TV name | Friendly name with IPv4 removed; concise truthful status; Switch TV |
| Motion surface includes sensitivity, inversion, raw diagnostics | Hold Aim, Select, Recenter, minimal status, availability feedback, one short instruction |
| Settings & Diagnostics mixed together | Settings: selected/saved TVs, Connection & Wake, Remote Preferences, About, expandable Developer Settings |
| Discovery tab / TV Discovery title | TVs tab / My TVs title |

## Interaction and navigation decisions

Reuse the mode selector at both levels rather than add navigation routes or a UI
library. Internally the existing three mode values still select independent
surfaces. Entering Pointer chooses Touchpad. Only one input surface is mounted
at a time. Switching method unmounts the previous surface and uses its existing
cleanup. Remote navigation focus is passed from useIsFocused; tab blur unmounts
input surfaces without disconnecting the TV. Returning to Remote restores the
selected method, with a fresh inactive Motion controller. Android sensor
availability checks and foreground refresh are preserved; loss of availability
falls back to Touchpad within Pointer.

The main header removes IPv4 addresses from both visible and accessible TV names,
including names previously generated by manual IP entry. It truncates visually
with the full friendly accessible label. IP and MAC remain available in Settings.
Connection labels still derive directly from existing Redux connection state,
including Connecting, Pairing and Reconnecting. Readiness is not inferred by UI.

## Moved settings and state ownership

remoteSlice now holds optional motionPreferences, defaulting to the original
sensitivity 1.0, non-inverted axes and diagnostics off. Sensitivity uses the
original 0.4–3.0 range, 0.2 step and one-decimal rounding. Optional fields preserve
compatibility with existing preloaded remote state. Values survive mode switches,
Remote blur and Settings remounts for the current app session. They are not saved
across process restarts; there was no durable Motion preference store previously,
and no new storage or dependency was introduced.

useMotionPointer reads this state and applies settings through existing controller
setters. Existing hook setters remain available. Sensor/controller lifecycle,
coordinate transforms and command dispatch logic are unchanged. Settings uses
MotionSettings and the existing MotionCalibrationBar; it never instantiates a
motion hook or starts a sensor.

The existing diagnostic callback additionally retains its last numeric snapshot
in Redux. Developer Settings labels this as the last sample, with instructions to
use Motion to refresh it. It is not presented as a live sensor feed while Settings
is open. The original raw diagnostic toggle and numeric overlay remain restricted
to development builds; axis inversion is available in all builds. No collection or
export of credentials or network data was added.

## Developer Settings

An accessible, explicitly labeled expandable section inside Settings contains
axis inversion, the existing development-only raw diagnostic toggle/overlay,
connection state/protocol, and the moved platform/network explanation. It starts
collapsed. It exposes explicit safe fields, not serialized adapters, connection
sessions, keys, certificates or tokens. Existing development timing logs remain
unchanged. There is no TLS bypass, insecure transport fallback, reset action,
new diagnostic subsystem or new destructive control. Existing forget confirmation
is retained.

## Accessibility and adaptive layout

- Retained platform density, responsive layout, safe areas and font scaling.
- Both selectors expose selected/disabled state and 48-point minimum targets.
- Sensor-unavailable labeling now describes the device rather than assuming Android.
- Calibration steppers and advanced toggles now have 48-point minimum targets.
  Sensitivity rows and axis controls can wrap under width/font pressure.
- Developer Settings exposes expanded state; inversion/raw toggles expose selection.
- Long TV names truncate with their friendly accessible label preserved.
- Motion aim area can grow beyond its minimum height; its actions can wrap.
- Existing keyboard-aware MAC form and keyboard-dismiss behavior remain intact.
- Responsive tests cover narrow 320-point layouts and large font scaling. These
  are component/layout tests, not native screenshot or assistive-technology tests.

## Files changed by Phase 14D

- src/presentation/components/TVConnectionHeader.tsx
- src/presentation/components/RemoteModeSelector.tsx
- src/presentation/components/MotionSurface.tsx
- src/presentation/components/MotionCalibrationBar.tsx
- src/presentation/components/MotionDiagnosticOverlay.tsx
- src/presentation/components/MotionSettings.tsx (new)
- src/presentation/hooks/useMotionPointer.ts
- src/presentation/screens/RemoteScreen.tsx
- src/presentation/screens/SettingsScreen.tsx
- src/presentation/screens/TVDiscoveryScreen.tsx
- src/presentation/navigation/AppNavigator.tsx
- src/store/slices/remoteSlice.ts
- src/__tests__/presentation/TVConnectionHeader.test.tsx
- src/__tests__/presentation/RemoteScreen.test.tsx
- src/__tests__/presentation/MotionSurface.test.tsx
- src/__tests__/presentation/MotionPresentational.test.tsx
- src/__tests__/presentation/SettingsScreen.test.tsx
- src/__tests__/presentation/ResponsiveLayout.test.tsx
- src/__tests__/presentation/AppNavigator.test.tsx
- docs/PHASE_14D_UI_UX_REFINEMENT.md (this report)

## Validation results

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Passed |
| `npm run lint` | Passed, 0 errors; 6 warnings in generated Android/coverage reports |
| `npm test -- --runInBand --watchman=false --forceExit` | Passed: 55 suites, 535 tests |
| `./gradlew testDebugUnitTest assembleDebug` | Passed; Android debug build successful |
| `./gradlew :app:testDebugUnitTest --rerun` | Passed fresh execution: 18 tests, 0 failures/errors, across 5 app test suites |
| iOS Simulator Debug build, generic simulator, signing disabled | Passed, `BUILD SUCCEEDED` |
| `git diff --check` | Passed |
| Physical Galaxy S24 Ultra / iPhone / LG TV | Not executed; checklist below |

The iOS command was:

```sh
xcodebuild -workspace ios/SmartRemote.xcworkspace -scheme SmartRemote \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/smartremote-phase14d-build CODE_SIGNING_ALLOWED=NO build
```

Initial sandbox-only attempts could not access Watchman, Gradle locks or
CoreSimulator. Jest was rerun without Watchman; native builds succeeded with
approved access to installed toolchains/caches. Initial presentation test failures
were old assumptions about the three top-level tabs and calibration location;
they were updated to exercise the nested selector and relocated controls. No
existing tests were removed. Final Jest needs forceExit because asynchronous
handles remain after the suite; non-forced runs reported this warning. This is a
remaining test-harness limitation, not a claim of a clean natural Jest shutdown.
Android reports Gradle deprecation warnings; Xcode reports script-phase warnings.

Regression coverage includes command access and NumericKeypad's existing suite,
Touchpad behavior, Motion availability/aim/select/recenter/background handling,
new mode/tab cleanup and exclusivity, header address suppression and accessible
long names, Settings preference retention, developer expansion, and no sensor
startup in Settings. The React review skill was applied for hook ownership,
conditional mounting, accessibility and TypeScript integration.

## Physical QA checklist — pending actual hardware execution

Run each item on Samsung Galaxy S24 Ultra and a physical iPhone, against
LG 65QNED70A6A. Record OS/app versions, results and any failure steps separately.

- [ ] Open Remote; verify startup restoration and normal reconnect.
- [ ] Confirm header has no IP; check friendly name and truthful transition states.
- [ ] Switch TVs and reconnect via Settings; verify the intended TV receives commands.
- [ ] Exercise D-pad, select, power/home/back, volume/mute and channel rockers.
- [ ] Exercise NumericKeypad, direct channel selection and rapid channel changes.
- [ ] Enter Pointer > Touchpad; verify drag, tap/click and existing scrolling behavior.
- [ ] Enter Motion; hold Aim, rotate/tilt, release, Select and Recenter.
- [ ] Change to Touchpad/Buttons and leave Remote for Settings; confirm sensor activity stops.
- [ ] Background/foreground during aiming and reconnect; verify no stale movement resumes.
- [ ] Change sensitivity and inverted axes; return to Motion and verify applied response.
- [ ] Revisit Settings/modes; verify session preference retention.
- [ ] Open Developer Settings; inspect safe diagnostics and last numeric sample only.
- [ ] Verify no pairing credentials, client keys, tokens or certificate material appears.
- [ ] Test MAC editing, keyboard dismissal, wake test and TV standby instructions.
- [ ] Check small-window/large-font layout, large iPhone safe areas, text clipping,
      selector targets, VoiceOver/TalkBack labels, and one-handed reach.
- [ ] Verify TVs/manual IP entry and supported scanning without implying unsupported discovery.

## Known limitations and deliberately deferred proposals

- Hardware, native screenshots, VoiceOver/TalkBack and runtime UI inspection were
  not executed. Simulator build success does not imply hardware verification.
- Motion preferences are session-scoped; durable storage was deliberately deferred.
- Diagnostic data is the last sample, not live while Settings is open.
- No version-tap activation or separate settings navigation stack: an expandable
  section fits the current small app and avoids a new settings framework.
- No TV rename UI (no existing rename flow), new diagnostic export, new discovery
  capabilities, touchpad sensitivity/gestures, or new build-number API was invented.
- No protocol, TLS, pairing, Wake-on-LAN, SSDP, direct channel, controller-math or
  gesture-algorithm implementation was edited by Phase 14D.
