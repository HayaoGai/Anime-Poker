package com.lance.animepoker.bridge

import android.app.Activity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import java.lang.ref.WeakReference

/**
 * 沉浸式全螢幕：隱藏狀態列與導覽列，使用者從邊緣滑動時暫時顯示。
 * 系統列的顯示狀態變化（包含使用者滑出）會推送給 JS，讓全螢幕按鈕的圖示同步。
 *
 * JS 以 native.reflection.callStaticMethod 呼叫，Kotlin 的 object 方法必須加上 @JvmStatic
 * 才會編譯成真正的 Java static 方法，否則 reflection 找不到。
 */
object ImmersiveBridge {
    private var activityRef: WeakReference<Activity>? = null
    private var immersive = false

    fun attach(activity: Activity) {
        activityRef = WeakReference(activity)
        val decor = activity.window.decorView
        ViewCompat.setOnApplyWindowInsetsListener(decor) { view, insets ->
            val hidden = !insets.isVisible(WindowInsetsCompat.Type.systemBars())
            if (hidden != immersive) {
                immersive = hidden
                NativeEvents.dispatch(NativeEvents.IMMERSIVE_CHANGED, if (hidden) "1" else "0")
            }
            ViewCompat.onApplyWindowInsets(view, insets)
        }
        // 遊戲預設以全螢幕啟動
        setImmersive(true)
    }

    @JvmStatic
    fun setImmersive(on: Boolean) {
        val activity = activityRef?.get() ?: return
        // 呼叫來自 GL thread，視窗操作必須回到 UI thread
        activity.runOnUiThread {
            val window = activity.window
            val controller = WindowCompat.getInsetsController(window, window.decorView)
            if (on) {
                controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                controller.hide(WindowInsetsCompat.Type.systemBars())
            } else {
                controller.show(WindowInsetsCompat.Type.systemBars())
            }
        }
    }

    @JvmStatic
    fun isImmersive(): Boolean = immersive
}
