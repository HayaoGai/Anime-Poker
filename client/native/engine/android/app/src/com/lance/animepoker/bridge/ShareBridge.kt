package com.lance.animepoker.bridge

import android.app.Activity
import android.content.Intent
import androidx.core.content.FileProvider
import java.io.File
import java.lang.ref.WeakReference

/**
 * 分享戰績截圖：JS 把 PNG 寫到 App 的私有目錄後傳入路徑，這裡透過 FileProvider 產生 content:// URI
 * （Android 7+ 不允許直接分享 file:// 路徑），再開啟系統分享選單。
 */
object ShareBridge {
    private var activityRef: WeakReference<Activity>? = null

    fun attach(activity: Activity) {
        activityRef = WeakReference(activity)
    }

    @JvmStatic
    fun shareImage(path: String, text: String): Boolean {
        val activity = activityRef?.get() ?: return false
        val file = File(path)
        if (!file.exists()) return false
        activity.runOnUiThread {
            val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file)
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "image/png"
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra(Intent.EXTRA_TEXT, text)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            activity.startActivity(Intent.createChooser(intent, null))
        }
        return true
    }
}
