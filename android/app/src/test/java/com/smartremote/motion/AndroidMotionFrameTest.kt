package com.smartremote.motion

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt
import org.junit.Assert.*
import org.junit.Test

class AndroidMotionFrameTest {
    @Test fun portraitGravityAndAngularRatesUseSharedAxes() {
        val half = sqrt(0.5).toFloat()
        val upright = requireNotNull(motionFrame(floatArrayOf(half, 0f, 0f, half), 0))
        assertEquals(PI / 2, upright.pitch, 1e-6)
        assertEquals(-1.0, upright.gravity.y, 1e-6)
        assertEquals(0.0, upright.gravity.z, 1e-6)

        val rightDown = screenVector(Vector3(-0.4, -0.6, 0.0), 0)
        assertEquals(0.4, -rightDown.x, 1e-6)
        assertEquals(0.6, rightDown.y * upright.gravity.y, 1e-6)
        assertEquals(Vector3(-0.6, 0.4, 0.0), screenVector(rightDown, 1))
    }

    @Test fun quaternionNormalizationAndRelativeHeadingPreserveGravity() {
        val half = sqrt(0.5)
        val heading = -0.4
        val w = cos(heading / 2) * half
        val z = sin(heading / 2) * half
        val q = floatArrayOf(w.toFloat(), z.toFloat(), z.toFloat(), w.toFloat())
        val original = requireNotNull(motionFrame(q, 0))
        val scaled = requireNotNull(motionFrame(q.map { it * 2 }.toFloatArray(), 0))
        assertEquals(heading, original.yaw, 1e-6)
        assertEquals(original.yaw, scaled.yaw, 1e-6)
        assertEquals(-1.0, scaled.gravity.y, 1e-6)
        assertEquals(-1.0, requireNotNull(motionFrame(q, 1)).gravity.x, 1e-6)
    }

    @Test fun rejectsInvalidOrientationAndConvertsBootTimeToSeconds() {
        assertNull(motionFrame(floatArrayOf(Float.NaN, 0f, 0f), 0))
        assertNull(motionFrame(floatArrayOf(0f, 0f, 0f, 0f), 0))
        assertEquals(-1.0, requireNotNull(motionFrame(floatArrayOf(0f, 0f, 0f), 0)).gravity.z, 1e-6)
        assertEquals(123.016, motionTimestampSeconds(123_016_000_000L), 1e-9)
    }
}
