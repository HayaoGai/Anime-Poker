package com.lance.animepoker.bridge

import android.app.Activity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * 沉浸式全螢幕：隱藏狀態列與導覽列，使用者從邊緣滑動時暫時顯示，之後自動隱藏。
 *
 * Android 版固定為全螢幕、不提供切換：Cocos 的 CocosActivity 本身就會在建立與取得焦點時強制隱藏系統列，
 * 而且 targetSdk 35+ 強制 edge-to-edge，顯示系統列只會蓋住遊戲畫面。
 */
object ImmersiveBridge {
    fun apply(activity: Activity) {
        // 可能由背景執行緒呼叫，視窗操作必須回到 UI thread
        activity.runOnUiThread {
            val window = activity.window
            val controller = WindowCompat.getInsetsController(window, window.decorView)
            controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            controller.hide(WindowInsetsCompat.Type.systemBars())
        }
    }
}
