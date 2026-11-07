# Phase 14C.3 — Fast reconnect and connection stability

## Confirmed findings

Cold start hydrates saved devices before restoring the last TV. Restore and foreground handling already use manager single-flight and generation checks. A healthy foreground session is reused. After an unsuccessful foreground liveness check, the existing recovery policy reconnects. When a transport has no explicit liveness probe, the adapter checks its socket state.

After TLS trust validation and SSAP registration, the adapter previously awaited service discovery, MAC lookup, and pointer startup in sequence. Those operations are independent once registration succeeds. Basic SSAP commands need the authenticated main socket. Pointer commands additionally need the pointer transport, and service discovery and MAC lookup populate capabilities and wake metadata.

A scheduled retry could outlast its backoff while the previous adapter was still disconnecting. A test with a gated disconnect reproduced the overlap. Scheduled recovery now waits for that cleanup and rechecks session generation, foreground state, target and in-flight ownership before proceeding. Explicit reconnect retains the existing foreground and manual recovery behavior. Adapter attempt checks keep superseded SSAP and pointer setup from claiming the new session. An old heartbeat completion can no longer clear the current attempt’s heartbeat guard.

## Readiness and diagnostics

TLS trust and registration remain mandatory. Service discovery, MAC lookup and pointer startup now run in parallel after registration. Readiness still waits for this bounded setup group and verifies that the main socket is open. Optional lookup failures retain their fallbacks. Pointer availability still depends on its transport opening. This keeps capability snapshots and MAC persistence consistent with the existing connection contract. Moving all optional work beyond basic readiness would require a way to publish later capability and MAC updates safely across TV switches.

Development timing covers startup hydration and restoration, credential access, socket open, TLS validation, registration, service and MAC lookup, pointer setup, adapter readiness, first completed command, foreground liveness, heartbeat disconnect, and retry scheduling and execution. It uses a monotonic clock where available. Timing events contain a stage, elapsed time and outcome. For a lookup that handles its own timeout, “completed” means the stage returned, which may include a fallback. A first-command completion can mean transport handoff for an unacknowledged command. Use the visible TV response for a hardware measurement.

| Stage | Controlled Jest result |
| --- | ---: |
| Service lookup fallback | 1,000 ms |
| MAC lookup fallback | 1,500 ms |
| Adapter ready | 1,500 ms |

The test used a fake clock, silent service and MAC replies, and a fast mock pointer. It also verified that a basic volume command succeeds after readiness. The prior serial source path implies at least 2,500 ms in the same fixture from the two lookup waits alone. That figure is calculated from the prior ordering and timeout budgets. Actual cold-start, resume and first-command timings on hardware remain unmeasured.

## Recovery and status

| Trigger | Expected handling |
| --- | --- |
| Cold app launch | Hydrate saved devices and restore the saved target through the manager. |
| Warm foreground with healthy session | Retain the current authenticated session. |
| Foreground liveness failure | Follow existing bounded recovery. A brief probe failure on a still-functional session remains a hardware hypothesis. |
| Unexpected SSAP loss or heartbeat threshold | Release the old adapter. Scheduled recovery waits for teardown before opening another session. |
| Wi-Fi disconnect or transition | Existing socket and liveness signals drive recovery. Correlate these with device network transitions during hardware tests to establish cause. |
| Manual disconnect or TV switch | Invalidate the old attempt. A delayed retry or callback cannot publish state for a superseded target. |

Android network callbacks and iOS network path monitoring could annotate network changes if hardware traces show that socket and lifecycle signals are insufficient. A reported network change alone does not establish that the active TV socket is unusable. This phase keeps the existing liveness, heartbeat and backoff thresholds. Evaluate probe tolerance with traces that show a failed probe followed by a successful command on the same session.

Suggested user-facing mapping is **Ready** for an authenticated session that passed readiness checks, **Connecting** for a new attempt, **Reconnecting** for recovery after loss, **TV unavailable** for a known unreachable TV, **Pairing required** when user action is needed, and **Connection error** for other terminal failures. Keep a healthy warm resume in Ready and use a single recovery state across bounded retries. Existing labels and NumericKeypad behavior are preserved.

## Validation

| Check | Result |
| --- | --- |
| TypeScript | Passed |
| ESLint | Zero errors and six warnings in generated Android and coverage reports |
| Jest | 55 suites, 530 tests passed. The runner used forced exit after assertions because of open handles. |
| Android JVM tests | 18 passed |
| Android debug build | Succeeded |
| iOS Simulator build | Succeeded |

New regression tests exercise concurrent post-registration setup with silent optional replies and a delayed teardown during automatic retry. Existing suites exercise startup, foreground recovery, pairing, certificate validation, socket and pointer failures, WOL and channel entry. Real network transitions and device behavior require the procedure below.

## Physical-device procedure

Use development builds on a Samsung Galaxy S24 Ultra and an iPhone, paired with the LG 65QNED70A6A. Capture sanitized connection timing output from Android logcat or the Xcode device console. Mark Wi-Fi changes and visible TV responses separately. For a baseline comparison, run the same procedure against the previous revision and the updated build, with the same TV, network, app state and test command. Record each run and report the median and range for launch-to-ready, resume-to-ready and first press-to-visible response. Record paired and unpaired runs separately.

1. With the paired TV on, force-stop the app, launch it, and press Volume Up as soon as the remote is available. Record stage durations and the visible volume response. Repeat after a short background interval and verify that a healthy session resumes without registration or a reconnect indicator.
2. While the TV stays on, briefly disable Wi-Fi, restore it, and repeat while switching between access points on the same LAN. Then move the phone to a network that cannot reach the TV and return. Record the foreground probe, transport loss, retry, status transitions and whether the first press works after recovery.
3. Power the TV off while connected, reopen the app, and record what happens when the TV stays unavailable. On a WOL-enabled setup, wake the TV with the remote and verify the first volume command after reconnect.
4. Clear the pairing on a test session and verify that the TV prompts for approval before accepting commands. Cancel a reconnect with manual disconnect and, if another TV is available, switch targets during reconnect. Verify that stale attempts cannot restore the old target.
5. After reconnect, check directional controls, Motion, Touchpad and rapid NumericKeypad channel entry. If the pointer drops while the main session stays open, verify that volume still works and pointer recovery can proceed independently.

No physical runs or before/after hardware benchmarks were collected in this phase. Intermittent reconnects in the reported setup could reflect actual transport loss, transient liveness failures, or delays during setup. The controlled tests establish the setup delay and retry overlap independently of those hardware hypotheses.
