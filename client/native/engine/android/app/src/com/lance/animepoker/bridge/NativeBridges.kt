package com.lance.animepoker.bridge

import android.app.Activity

/**
 * 所有 Kotlin 橋接模組的生命週期入口，由 Java 的 AppActivity 呼叫（Java 呼叫 Kotlin object 需透過 @JvmStatic）。
 */
object NativeBridges {
    @JvmStatic
    fun onCreate(activity: Activity) {
        ImmersiveBridge.attach(activity)
        HapticsBridge.attach(activity.applicationContext)
        ShareBridge.attach(activity)
        NetworkMonitor.start(activity.applicationContext)
        BatteryMonitor.start(activity.applicationContext)
    }

    @JvmStatic
    fun onDestroy() {
        NetworkMonitor.stop()
        BatteryMonitor.stop()
    }

    /** 回到前景時重新套用沉浸式（部分裝置在多工切換後會重新顯示系統列） */
    @JvmStatic
    fun onResume() {
        if (ImmersiveBridge.isImmersive()) ImmersiveBridge.setImmersive(true)
    }
}
