package com.smartremote.motion

import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.sqrt

internal data class Vector3(val x: Double, val y: Double, val z: Double)
internal data class MotionFrame(val pitch: Double, val roll: Double, val yaw: Double, val gravity: Vector3)

/** Android rotation vector [x,y,z,w?] represents the device-to-world rotation. */
internal fun motionFrame(values: FloatArray, screenRotation: Int): MotionFrame? {
    if (values.size < 3) return null
    val x = values[0].toDouble()
    val y = values[1].toDouble()
    val z = values[2].toDouble()
    val w = values.getOrNull(3)?.toDouble() ?: sqrt((1 - x*x - y*y - z*z).coerceAtLeast(0.0))
    val norm = sqrt(x*x + y*y + z*z + w*w)
    if (!norm.isFinite() || norm < 1e-9) return null
    val qx = x / norm
    val qy = y / norm
    val qz = z / norm
    val qw = w / norm
    val rowX = Vector3(1 - 2*(qy*qy + qz*qz), 2*(qx*qy - qw*qz), 2*(qx*qz + qw*qy))
    val rowY = Vector3(2*(qx*qy + qw*qz), 1 - 2*(qx*qx + qz*qz), 2*(qy*qz - qw*qx))
    val rowZ = Vector3(2*(qx*qz - qw*qy), 2*(qy*qz + qw*qx), 1 - 2*(qx*qx + qy*qy))
    // R_screen = R_device B, where B's columns are screen axes expressed in device axes.
    val worldX = screenVector(rowX, screenRotation)
    val worldY = screenVector(rowY, screenRotation)
    val worldZ = screenVector(rowZ, screenRotation)
    return MotionFrame(
        pitch = atan2(worldZ.y, worldZ.z),
        roll = asin((-worldZ.x).coerceIn(-1.0, 1.0)),
        yaw = atan2(worldY.x, worldX.x),
        gravity = Vector3(-worldZ.x, -worldZ.y, -worldZ.z),
    )
}

/** B-transpose times a device vector. Rotation values correspond to Surface.ROTATION_*. */
internal fun screenVector(vector: Vector3, rotation: Int): Vector3 = when (rotation) {
    1 -> Vector3(vector.y, -vector.x, vector.z)
    2 -> Vector3(-vector.x, -vector.y, vector.z)
    3 -> Vector3(-vector.y, vector.x, vector.z)
    else -> vector
}

internal fun motionTimestampSeconds(timestampNanos: Long): Double = timestampNanos / 1_000_000_000.0
