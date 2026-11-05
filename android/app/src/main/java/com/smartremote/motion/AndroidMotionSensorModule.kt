package com.smartremote.motion

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.common.LifecycleState
import com.facebook.react.modules.core.DeviceEventManagerModule

class AndroidMotionSensorModule(private val context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context), LifecycleEventListener {

    private val sensors = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
    private val main = Handler(Looper.getMainLooper())
    private var session: SamplingSession? = null
    @Volatile private var disposed = false

    override fun getName() = "AndroidMotionSensorModule"

    override fun initialize() {
        super.initialize()
        context.addLifecycleEventListener(this)
    }

    @ReactMethod
    fun isAvailable(promise: Promise) {
        promise.resolve(!disposed && sensors?.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR) != null &&
            sensors.getDefaultSensor(Sensor.TYPE_GYROSCOPE) != null)
    }

    @ReactMethod
    fun startMotionUpdates(intervalMs: Double, sessionId: Double, promise: Promise) {
        main.post {
            if (disposed || context.lifecycleState != LifecycleState.RESUMED) {
                promise.reject("MOTION_INACTIVE", "Motion can only start while the app is active")
                return@post
            }
            stopSession()
            val manager = sensors
            val orientation = manager?.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR)
            val gyro = manager?.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
            if (manager == null || orientation == null || gyro == null) {
                promise.reject("MOTION_UNAVAILABLE", "Game rotation vector and gyroscope are required")
                return@post
            }
            val interval = if (intervalMs.isFinite()) intervalMs.coerceIn(10.0, 1000.0) else 16.0
            val listener = SamplingSession(sessionId, (interval * 1_000_000).toLong(), displayRotation())
            session = listener
            try {
                val periodMicros = (interval * 1000).toInt()
                if (!manager.registerListener(listener, orientation, periodMicros, main) ||
                    !manager.registerListener(listener, gyro, periodMicros, main)) {
                    stopSession()
                    promise.reject("MOTION_REGISTRATION_FAILED", "Could not register Android motion sensors")
                } else {
                    promise.resolve(null)
                }
            } catch (error: RuntimeException) {
                stopSession()
                promise.reject("MOTION_REGISTRATION_FAILED", "Could not start Android motion sensors", error)
            }
        }
    }

    @ReactMethod
    fun stopMotionUpdates(promise: Promise) {
        main.post {
            stopSession()
            promise.resolve(null)
        }
    }

    // NativeEventEmitter requires these methods. The sampling session owns registrations.
    @ReactMethod fun addListener(eventName: String) = Unit
    @ReactMethod fun removeListeners(count: Double) = Unit

    override fun onHostResume() = Unit
    override fun onHostPause() = interruptSession()
    override fun onHostDestroy() = interruptSession()

    override fun invalidate() {
        disposed = true
        main.post {
            stopSession()
            context.removeLifecycleEventListener(this)
        }
        super.invalidate()
    }

    private fun stopSession() {
        val previous = session ?: return
        session = null
        sensors?.unregisterListener(previous)
    }

    private fun interruptSession() {
        val previous = session ?: return
        stopSession()
        emit("onAndroidMotionInterrupted", Arguments.createMap().apply {
            putDouble("sessionId", previous.id)
        })
    }

    @Suppress("DEPRECATION")
    private fun displayRotation(): Int =
        context.currentActivity?.windowManager?.defaultDisplay?.rotation ?: 0

    private fun emit(name: String, body: WritableMap) {
        if (!disposed && context.hasActiveReactInstance()) {
            context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(name, body)
        }
    }

    private fun vectorMap(vector: Vector3) = Arguments.createMap().apply {
        putDouble("x", vector.x)
        putDouble("y", vector.y)
        putDouble("z", vector.z)
    }

    private inner class SamplingSession(
        val id: Double,
        val intervalNanos: Long,
        val rotation: Int,
    ) : SensorEventListener {
        private var frame: MotionFrame? = null
        private var frameTime = 0L
        private var lastSampleTime = 0L

        override fun onSensorChanged(event: SensorEvent) {
            if (session !== this || disposed || event.timestamp <= 0) return
            if (displayRotation() != rotation) {
                interruptSession()
                return
            }
            if (event.sensor.type == Sensor.TYPE_GAME_ROTATION_VECTOR) {
                if (event.timestamp <= frameTime) return
                frame = motionFrame(event.values, rotation)
                frameTime = event.timestamp
                return
            }
            val orientation = frame ?: return
            if (event.timestamp <= lastSampleTime ||
                event.timestamp - lastSampleTime < intervalNanos ||
                kotlin.math.abs(event.timestamp - frameTime) > maxOf(120_000_000L, 4 * intervalNanos)) return
            if (event.values.size < 3 || (0..2).any { !event.values[it].isFinite() }) return

            val rate = screenVector(Vector3(event.values[0].toDouble(), event.values[1].toDouble(),
                event.values[2].toDouble()), rotation)
            lastSampleTime = event.timestamp
            emit("onAndroidDeviceMotion", Arguments.createMap().apply {
                putDouble("sessionId", id)
                putDouble("timestamp", motionTimestampSeconds(event.timestamp))
                putMap("attitude", Arguments.createMap().apply {
                    putDouble("pitch", orientation.pitch)
                    putDouble("roll", orientation.roll)
                    putDouble("yaw", orientation.yaw)
                })
                putMap("rotationRate", vectorMap(rate))
                putMap("gravity", vectorMap(orientation.gravity))
            })
        }

        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
    }
}
