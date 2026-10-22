package com.lance.animepoker.bridge

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities

/**
 * 網路狀態監聽：斷線時 JS 顯示重新連線提示，恢復時立即觸發 Colyseus 重連，不必等待逾時。
 * NetworkCallback 在系統的 binder thread 被呼叫，經由 NativeEvents 切到遊戲執行緒。
 * 必須與 Activity 生命週期同步註冊／解除，避免洩漏。
 */
object NetworkMonitor {
    private var manager: ConnectivityManager? = null
    private var online = true

    private val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) = update(true)

        override fun onLost(network: Network) = update(currentlyOnline())

        override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) =
            update(capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET))
    }

    fun start(context: Context) {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        manager = cm
        online = currentlyOnline()
        cm.registerDefaultNetworkCallback(callback)
    }

    fun stop() {
        try {
            manager?.unregisterNetworkCallback(callback)
        } catch (_: IllegalArgumentException) {
            // 尚未註冊
        }
        manager = null
    }

    @JvmStatic
    fun isOnline(): Boolean = online

    private fun currentlyOnline(): Boolean {
        val cm = manager ?: return true
        val capabilities = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun update(now: Boolean) {
        if (now == online) return
        online = now
        NativeEvents.dispatch(NativeEvents.NETWORK_CHANGED, if (now) "1" else "0")
    }
}
