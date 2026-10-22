package com.lance.animepoker.bridge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import org.json.JSONObject

/**
 * 電量 HUD。ACTION_BATTERY_CHANGED 是 sticky broadcast：registerReceiver 會立即回傳最近一次的狀態，
 * 因此不需要等第一次廣播就能取得目前電量。
 */
object BatteryMonitor {
    private var context: Context? = null
    private var last = JSONObject().put("level", 1.0).put("charging", false)

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val status = parse(intent) ?: return
            if (status.toString() == last.toString()) return
            last = status
            NativeEvents.dispatch(NativeEvents.BATTERY_CHANGED, status.toString())
        }
    }

    fun start(context: Context) {
        this.context = context
        val sticky = context.registerReceiver(receiver, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        sticky?.let { parse(it) }?.let { last = it }
    }

    fun stop() {
        try {
            context?.unregisterReceiver(receiver)
        } catch (_: IllegalArgumentException) {
            // 尚未註冊
        }
        context = null
    }

    /** JSON：{ "level": 0～1, "charging": true/false } */
    @JvmStatic
    fun getStatus(): String = last.toString()

    private fun parse(intent: Intent): JSONObject? {
        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        if (level < 0 || scale <= 0) return null
        val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
        val charging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
        return JSONObject().put("level", level.toDouble() / scale).put("charging", charging)
    }
}
