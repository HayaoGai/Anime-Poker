package com.lance.animepoker.bridge

import com.cocos.lib.CocosHelper
import com.cocos.lib.JsbBridgeWrapper

/**
 * 原生 → JS 的事件推送（JS 端以 native.jsbBridgeWrapper.addNativeEventListener 接收）。
 *
 * 系統回呼（網路、電量、返回鍵）發生在 UI thread 或 binder thread，
 * 但 JS 引擎只能在 GL（遊戲）thread 存取，因此一律切到遊戲執行緒再派送。
 */
object NativeEvents {
    const val NETWORK_CHANGED = "networkChanged"
    const val BATTERY_CHANGED = "batteryChanged"
    const val BACK_PRESSED = "backPressed"

    fun dispatch(event: String, arg: String = "") {
        CocosHelper.runOnGameThread {
            JsbBridgeWrapper.getInstance().dispatchEventToScript(event, arg)
        }
    }
}
