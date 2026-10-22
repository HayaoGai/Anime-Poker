/****************************************************************************
Copyright (c) 2015-2016 Chukong Technologies Inc.
Copyright (c) 2017-2018 Xiamen Yaji Software Co., Ltd.

http://www.cocos2d-x.org

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
****************************************************************************/
package com.cocos.game;

import android.os.Build;
import android.os.Bundle;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.view.WindowManager;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

import com.cocos.service.SDKWrapper;
import com.cocos.lib.CocosActivity;
import com.lance.animepoker.bridge.NativeBridges;
import com.lance.animepoker.bridge.NativeEvents;

/**
 * Cocos 預設模板為 Java；新的橋接功能以 Kotlin 撰寫（com.lance.animepoker.bridge），兩者混用。
 * 這裡保留 Java 負責 Activity 生命週期轉發，以及版本資訊、螢幕常亮、返回鍵、退出 App。
 *
 * JS 以 native.reflection.callStaticMethod("com/cocos/game/AppActivity", 方法, JNI 簽章) 呼叫這些 static 方法；
 * 呼叫發生在 GL thread，操作視窗前要切回 UI thread。
 */
public class AppActivity extends CocosActivity {

    private static AppActivity sInstance;
    private OnBackInvokedCallback mBackCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // DO OTHER INITIALIZATION BELOW
        sInstance = this;
        SDKWrapper.shared().init(this);
        NativeBridges.onCreate(this);
        registerBackHandler();
    }

    /**
     * 返回鍵交給 JS 處理（關閉彈窗、離開牌桌、退出確認），不讓系統直接結束 Activity。
     * targetSdk 36（Android 16）預設啟用預測式返回，onBackPressed 不再被呼叫，
     * 因此 API 33+ 改以 OnBackInvokedDispatcher 註冊；更舊的版本走 onBackPressed。
     */
    private void registerBackHandler() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            mBackCallback = () -> NativeEvents.INSTANCE.dispatch(NativeEvents.BACK_PRESSED, "");
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, mBackCallback);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        SDKWrapper.shared().onResume();
        NativeBridges.onResume();
    }

    @Override
    protected void onPause() {
        super.onPause();
        SDKWrapper.shared().onPause();
    }

    @Override
    protected void onDestroy() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && mBackCallback != null) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(mBackCallback);
        }
        NativeBridges.onDestroy();
        if (sInstance == this) sInstance = null;
        super.onDestroy();
        // Workaround in https://stackoverflow.com/questions/16283079/re-launch-of-activity-on-home-button-but-only-the-first-time/16447508
        if (!isTaskRoot()) {
            return;
        }
        SDKWrapper.shared().onDestroy();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        SDKWrapper.shared().onActivityResult(requestCode, resultCode, data);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        SDKWrapper.shared().onNewIntent(intent);
    }

    @Override
    protected void onRestart() {
        super.onRestart();
        SDKWrapper.shared().onRestart();
    }

    @Override
    protected void onStop() {
        super.onStop();
        SDKWrapper.shared().onStop();
    }

    /** Android 12（API 32）以下的返回鍵；不呼叫 super，避免系統直接關閉遊戲 */
    @Override
    public void onBackPressed() {
        SDKWrapper.shared().onBackPressed();
        NativeEvents.INSTANCE.dispatch(NativeEvents.BACK_PRESSED, "");
    }

    // ------------------------------------------------------------ JS 呼叫的 static 方法

    /** 製作人員彈窗的版號：AndroidManifest 的 versionName（由 build.gradle 依 git 版號產生） */
    public static String getAppVersion() {
        AppActivity activity = sInstance;
        if (activity == null) return "dev";
        try {
            PackageInfo info = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
            return info.versionName;
        } catch (PackageManager.NameNotFoundException e) {
            return "dev";
        }
    }

    /** 牌桌場景保持螢幕常亮；Window flag 只能在 UI thread 設定 */
    public static void setKeepScreenOn(final boolean on) {
        final AppActivity activity = sInstance;
        if (activity == null) return;
        activity.runOnUiThread(() -> {
            if (on) activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }

    /** 標題畫面的退出確認 */
    public static void exitApp() {
        final AppActivity activity = sInstance;
        if (activity == null) return;
        activity.runOnUiThread(activity::finishAndRemoveTask);
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        SDKWrapper.shared().onConfigurationChanged(newConfig);
        super.onConfigurationChanged(newConfig);
    }

    @Override
    protected void onRestoreInstanceState(Bundle savedInstanceState) {
        SDKWrapper.shared().onRestoreInstanceState(savedInstanceState);
        super.onRestoreInstanceState(savedInstanceState);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        SDKWrapper.shared().onSaveInstanceState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onStart() {
        SDKWrapper.shared().onStart();
        super.onStart();
    }

    @Override
    public void onLowMemory() {
        SDKWrapper.shared().onLowMemory();
        super.onLowMemory();
    }
}
