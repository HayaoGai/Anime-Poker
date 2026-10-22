package com.lance.animepoker.bridge

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * 震動回饋。pattern 由 JS 傳入，格式為「震、停、震…」的毫秒數，例如 "30,60,30"。
 * 依 Android 版本使用不同 API：31+ 的 VibratorManager、26+ 的 VibrationEffect、更舊的版本用已棄用的 vibrate(long[])。
 */
object HapticsBridge {
    private var vibrator: Vibrator? = null

    fun attach(context: Context) {
        vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
    }

    @JvmStatic
    fun vibrate(pattern: String) {
        val v = vibrator ?: return
        if (!v.hasVibrator()) return
        val durations = pattern.split(',').mapNotNull { it.trim().toLongOrNull() }
        if (durations.isEmpty()) return
        // waveform 的第一個值是「開始前的等待」，之後依序為震、停、震…
        val timings = longArrayOf(0L) + durations.toLongArray()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            v.vibrate(VibrationEffect.createWaveform(timings, -1))
        } else {
            @Suppress("DEPRECATION")
            v.vibrate(timings, -1)
        }
    }
}
