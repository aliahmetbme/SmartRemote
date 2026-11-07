# Phase 14E — Connection diagnostics and recovery

Date: 2026-11-07. Branch: `feature/connectArchitecture`.
Connection-manager/adapter and relevant UI diffs were inspected first. Existing
Phase 14C.3 fast reconnect, teardown, timing, startup and credential work remains
in place. No branch operation, commit, push, merge, stash, reset or revert occurred.
Phase 14D.2 is a separate requested Pointer change; this diagnostic layer does not
own or redesign Pointer interactions.

## Audit of the existing path

- TVConnectionManager owns one adapter/session, generation cancellation,
  single-flight connect/reconnect, teardown, pairing/network time budgets and
  five bounded exponential-backoff attempts (1 s base, 30 s cap).
- Foreground liveness, heartbeat pause/resume and lossCleanup serialization from
  Phase 14C.3 are retained. StartupRestorationUseCase hydrates devices and restores
  the selected TV; no diagnostic steps were added to that successful path.
- LGWebOSAdapter owns secure socket open, trust checks, registration, services,
  network MAC and pointer preparation. Its existing endpoint/security policy is
  unchanged. TLS trust errors were generic connection_failed errors; those two
  explicit trust-check branches now carry a typed tls_trust_failure code.
- LGWebOSWebSocketClient preserved initial error causes but discarded structured
  close evidence for established sockets. It now retains that close event as the
  cause. WebSocketTransport forwards the new safe Android diagnostic code too.
- iOS already emits NSURLSession domain/numeric error evidence. Android previously
  flattened typed exceptions into a generic message. The native module now emits
  an allowlisted failure code derived from throwable types/causes.
- Pairing rejected by the TV, registration timeout and secure-storage failure were
  all TVPairingError. The explicit TV registration-error branch now adds a
  backwards-compatible rejected reason; generic pairing failures stay distinct.
  Existing credential handling and registration protocol are untouched.
- Redux mirrored only status and code/message. The new diagnostic field holds a
  sanitized summary with evidence, confidence, time, retry count and network state.
- Discovery connect errors previously inferred local-network permission denial
  from strings such as “1009” or “prohibited”. Those two connection error mappings
  have been removed. Discovery and Settings now reuse evidence-based guidance.
- Existing Android ConnectivityManager access and ACCESS_NETWORK_STATE permission
  permit a lightweight Wi-Fi/Ethernet snapshot without new permission requests.
  iOS exposes useful transport errors but no reliable general local-permission or
  Wi-Fi state getter in this project. These fields remain unavailable.
- Wake-on-LAN only sends packets and coordinates restoration; it cannot prove TV
  power state. Discovery/name/IP alone does not authenticate a changed TV identity.
- Existing development/native logs can contain local endpoints. No new raw-error
  logging or export system was added; the diagnostic model never includes raw
  messages, pairing keys, tokens or certificate material.

## Small failure taxonomy

| Category | Evidence | Meaning / confidence |
| --- | --- | --- |
| NETWORK_UNAVAILABLE | Android OS snapshot has no Wi-Fi or Ethernet transport, after an otherwise unknown failure | Confirmed transport observation; not proof of root cause |
| CONNECTION_TIMEOUT | TVTimeoutError or typed native timeout | Confirmed attempt timed out; power/network/address cause unknown |
| TV_UNREACHABLE | NoRouteToHostException or NSURLSession cannot-connect code | Confirmed connection failure; no claim that TV is off |
| CONNECTION_REFUSED | Explicit native ECONNREFUSED evidence | Confirmed refusal; generic ConnectException text is insufficient |
| DNS_FAILURE | UnknownHostException / relevant structured NSURLSession code | Confirmed host resolution failure |
| TLS_TRUST_FAILURE | Explicit adapter verification failure, certificate exception, peer-verification failure, or specific iOS certificate code | Confirmed secure verification failure; no bypass |
| PAIRING_REJECTED | TV registration error branch | Confirmed registration rejection; not necessarily a person pressing Reject |
| PAIRING_FAILED | Other TVPairingError | Confirmed registration did not complete, including storage failure |
| CONNECTION_LOST | Previously established session closed | Confirmed loss, underlying cause unknown |
| UNKNOWN | No reliable structured evidence | Unknown |

Classification walks at most six cause objects and keeps only approved codes.
It does not parse human descriptions. Generic SSLHandshakeException is not enough
for a trust diagnosis; its certificate cause is required. SSIDs are not read or
compared. Public internet speed/reachability is not tested. Repeated intermittent
failures do not automatically become an invented NETWORK_UNSTABLE cause.

No SAVED_ADDRESS_STALE category, permission-denied assertion or TV-off state is
emitted without evidence. Guidance mentions saved-address checks as a possibility,
not a confirmed diagnosis. There is no inferred “likely” cause in this version.

## Failure-only pipeline and cancellation

1. Attempt the existing fast connection path unchanged.
2. On Error or unexpected Reconnecting, classify current structured evidence.
3. Publish an immediate safe summary; no network request blocks the manager.
4. At most once per operation generation, read OS network state with a 500 ms
   budget. This creates no socket, endpoint probe, scan, SSID or internet request.
5. Update only if the container is alive, app active and operation/device still
   current. New generation/success/disposal/background invalidates pending work.
6. Preserve the latest actual failure through backoff/exhaustion; do not replace it
   with an unrelated generic “could not reconnect” reason.

The binding lives with the application container, so navigation between Remote and
Settings does not create duplicate diagnostic work. It exposes disposal, and UI
components own no diagnostic request. Native OS reads may finish after timeout or
background; those results are ignored. There is no repeated probing while retries
run and no extra sequential operation on a healthy connection.

Endpoint reachability is based on the existing socket attempt, not an extra probe.
A successful authenticated connection proves readiness; an OS local transport
snapshot alone does not prove TV reachability or isolation.

## UX mapping and recovery

The header stays compact: Connected, Connecting, Reconnecting, Pairing with TV,
Disconnected or Can't connect. It still uses manager readiness via Redux.
A dismissible Remote guidance card appears only for the selected TV's failed or
reconnecting session. No raw IP/protocol/error text is added to the header.

| Failure/state | Guidance and primary action |
| --- | --- |
| No local transport | Check local network; Open Settings using supported platform API |
| Timeout/unreachable/unknown | Can't reach your TV; Try Again |
| Explicit refusal | Endpoint refused connection; Try Again |
| Pairing failed/rejected | Check/approve TV request; Pair Again |
| TLS verification failure | Verify correct TV and review details; TV Settings |
| Automatic reconnect active | Connection interrupted, trying to reconnect; no competing Retry button |

Find TV and, when configured for the same selected TV, the existing Wake action
are available as limited secondary actions. Sending Wake is never proof of power
state. Actions validate manager state, operation revision and selected TV; a stale
retry callback cannot target a newly selected TV. Guidance can be dismissed and
is not a permanent remote overlay. Settings/Discovery connection alerts use the
same sanitized guidance and ignore cancelled attempts.

## Retry coordination and safe identity recovery

Only TVConnectionManager performs recovery. New diagnostic code does not open a
second WebSocket or create a reconnect timer. Generation checks, in-flight
coordination, completed teardown and Phase 14C.3 lossCleanup remain unchanged.
The snapshot adds retryAttempt metadata; retry notifications expose updated
failure/count. Explicit pairing failures and verified TLS failures stop automatic
retry/foreground restoration until an intentional user action. Transient failures
use the existing bounded policy. The last actual cause survives exhaustion.

No endpoint is silently changed. Existing discovery/manual entry lets the user
select/pair the correct TV. No verified paired identity-to-new-address flow exists
that can safely justify automatic address replacement here; matching display names
is insufficient. No SSDP rewrite or implicit credential/trust deletion was added.
The pre-existing registration-rejection credential handling is unchanged.

## Developer Settings and privacy

Existing Developer Settings now shows category, confidence/evidence, last failure
UTC timestamp, safe transport code, retry attempt, selected TV identity and Wi-Fi
snapshot when available. Existing selected TV details retain endpoint/MAC data.
Unavailable fields explicitly say Unavailable, including local network permission.
Timing measurements continue through existing development logs; no fictitious
latency, SSID, permission, endpoint probe or sensor value is manufactured.

TLS validation, certificate pinning/trust rules, secure pairing storage and
transport security are unchanged. No new plaintext fallback, trust bypass,
factory reset, private certificate output or raw error export was added.

## Files changed for diagnostics

- ConnectionDiagnostic.ts (new): typed, allowlisted classification and retryability.
- TVConnectionError.ts / TVPairingError.ts: compatible typed metadata extensions.
- LGWebOSAdapter.ts / LGWebOSPairingService.ts: mark existing known failures.
- LGWebOSWebSocketClient.ts / WebSocketTransport.ts: retain structured close/code evidence.
- LGAndroidWebSocketModule.kt: safe failure event field and OS-state getter.
- LGConnectionFailureCode.kt / LGConnectionFailureCodeTest.kt (new): typed native classifier and five JVM tests.
- TVConnectionManager.ts: retry metadata/notifications, preserve last error, terminal-failure retry gating.
- connectionSlice.ts / container.ts: diagnostic state and single binding.
- LocalNetworkStatus.ts / bindConnectionDiagnostics.ts (new): bounded failure-only OS read.
- ConnectionRecovery.tsx / connectionGuidance.ts (new): compact safe guidance and guarded actions.
- TVConnectionHeader.tsx / RemoteScreen.tsx / SettingsScreen.tsx / TVDiscoveryScreen.tsx: user/developer integration.
- ConnectionDiagnostics.test.ts / ConnectionRecovery.test.tsx (new): classification, cancellation, recovery and redaction.

## Validation (combined final tree with Phase 14D.2)

- `npx tsc --noEmit`: passed.
- `npm run lint`: passed; 0 errors, 6 existing generated-report warnings.
- Full Jest: 59 suites / 585 tests passed with `--runInBand --watchman=false --forceExit`.
- Android `:app:testDebugUnitTest --rerun assembleDebug`: passed; 23 fresh app JVM tests, debug build successful.
- Generic iOS Simulator Debug build: BUILD SUCCEEDED, signing disabled.
- `git diff --check`: passed.

Initial Pointer assertions referenced the superseded Aim UI and a fixture lacked
navigation support for Select; updated for the requested hybrid behavior. An
adapter regression test caught loss of existing TLS log detail; the original
behavior was preserved. Existing connection/security test assertions were not
weakened. The inherited Jest async-handle/forceExit limitation, Gradle deprecation
warnings and Xcode script warnings remain reported.

Tests cover typed native/iOS timeout/refusal/unreachable/DNS/TLS, no string-based
permission/power/stale-IP inference, pairing rejection versus storage failure,
healthy path with zero OS diagnostic calls, OS-local-transport absence, unavailable
permission evidence, bounded reads, background/switch/new-success invalidation,
retry cancellation and single-flight coordination, terminal TLS failure, sanitized
UI details and guarded recovery actions. Existing pairing/TLS/manager/discovery/
wake suites continue to pass. No unsupported scenario is represented as tested
on actual hardware.

## Physical QA checklist — pending actual execution

Run each scenario on physical iPhone and Samsung Galaxy S24 Ultra against LG
65QNED70A6A. Record: actual behavior, category, technical evidence, message,
recovery action/result, OS/app build and reproduction steps.

- [ ] TV on and reachable: normal fast connection, no diagnostic delay.
- [ ] TV standby / manually off: uncertain reachability guidance, never false “TV is off”.
- [ ] Phone Wi-Fi disabled: compare available OS transport evidence with displayed guidance.
- [ ] Guest network / router isolation: safe generic guidance unless evidence is conclusive.
- [ ] Phone 2.4 GHz and TV 5 GHz on the same LAN: no SSID-based mismatch assumption.
- [ ] TV IP changed: Find TV/manual selection; no silent identity/address replacement.
- [ ] iOS Local Network permission denied: record actual native code; never label denial solely from timeout/1009 text.
- [ ] Pairing rejected: clear guidance, no repeated automatic prompts.
- [ ] Certificate/trust failure: fail closed; no bypass or insecure retry.
- [ ] Wi-Fi interruption: one coordinated reconnect, no retry storm or needless heartbeat reconnect.
- [ ] Rapid background/foreground and TV changes during failure: no stale diagnostic UI/actions.
- [ ] Return to the correct LAN: deliberate recovery reaches true Connected readiness.
- [ ] Review Developer Settings for real evidence and absence of credentials.

## Known limitations

No hardware tests, native runtime screenshot checks or assistive-technology tests
were executed. iOS Wi-Fi/local-permission status and Android local-permission
denial are not reliably exposed by the current bridge, so remain unavailable.
No extra endpoint probe, trusted address refresh or public-internet test was
introduced. Unstructured transport failures remain Unknown; this is intentional.
