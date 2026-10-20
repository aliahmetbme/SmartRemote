import Foundation
import CoreMotion
import React

@objc(MotionSensorModule)
class MotionSensorModule: RCTEventEmitter {
  private let motionManager = CMMotionManager()
  private let motionQueue = OperationQueue()
  private var hasListeners = false

  override init() {
    super.init()
    motionQueue.name = "com.aliahmeterdogdu.SmartRemote.motionQueue"
    motionQueue.maxConcurrentOperationCount = 1
    motionQueue.qualityOfService = .userInteractive
  }

  override static func requiresMainQueueSetup() -> Bool {
    return false
  }

  override func supportedEvents() -> [String]! {
    return ["onDeviceMotion"]
  }

  override func startObserving() {
    hasListeners = true
  }

  override func stopObserving() {
    hasListeners = false
  }

  @objc(isAvailable:rejecter:)
  func isAvailable(_ resolve: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    resolve(motionManager.isDeviceMotionAvailable)
  }

  @objc(startMotionUpdates:resolver:rejecter:)
  func startMotionUpdates(_ intervalMs: NSNumber, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    guard motionManager.isDeviceMotionAvailable else {
      rejecter("MOTION_UNAVAILABLE", "Device motion is not available on this device", nil)
      return
    }

    let interval = max(0.01, intervalMs.doubleValue / 1000.0) // min 10ms = 100Hz
    motionManager.deviceMotionUpdateInterval = interval

    // Prefer vertical Z reference frame so yaw is true gravity-aligned rotation
    let referenceFrame: CMAttitudeReferenceFrame = .xArbitraryZVertical

    if motionManager.isDeviceMotionActive {
      motionManager.stopDeviceMotionUpdates()
    }

    motionManager.startDeviceMotionUpdates(using: referenceFrame, to: motionQueue) { [weak self] (motion, error) in
      guard let self = self, self.hasListeners, let motion = motion, error == nil else {
        return
      }

      let payload: [String: Any] = [
        "attitude": [
          "pitch": motion.attitude.pitch,
          "roll": motion.attitude.roll,
          "yaw": motion.attitude.yaw
        ],
        "rotationRate": [
          "x": motion.rotationRate.x,
          "y": motion.rotationRate.y,
          "z": motion.rotationRate.z
        ],
        "gravity": [
          "x": motion.gravity.x,
          "y": motion.gravity.y,
          "z": motion.gravity.z
        ],
        "timestamp": motion.timestamp
      ]

      self.sendEvent(withName: "onDeviceMotion", body: payload)
    }

    resolver(nil)
  }

  @objc(stopMotionUpdates:rejecter:)
  func stopMotionUpdates(_ resolve: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    if motionManager.isDeviceMotionActive {
      motionManager.stopDeviceMotionUpdates()
    }
    resolve(nil)
  }

  deinit {
    motionManager.stopDeviceMotionUpdates()
  }
}
