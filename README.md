# Anime Poker

動漫美少女風格的多人德州撲克（No-Limit Texas Hold'em），支援 **Web（桌機／手機瀏覽器）** 與 **Android**。

- 用戶端：Cocos Creator 3.8.8 + TypeScript，MVVM 架構，以實際的 Scene 與 Prefab 製作。
- 伺服器：Node.js + TypeScript + Colyseus，由伺服器決定一切結果（server-authoritative）。
- Android 原生層：Java + Kotlin，透過 Cocos 的 JSB 橋接與遊戲互通。

## 功能

**遊戲流程**
- **Title**：點按任意處開始、製作人員彈窗、語系切換（繁中／简中／English）、全螢幕切換、返回鍵退出確認。
- **Lobby**：
  - 第一次進入時設定暱稱與頭像，存在 localStorage，不需要登入。
  - 房間列表即時更新，可建立、加入或觀戰。
  - 房主可以加入電腦玩家。
- **Table**：
  - 最多 6 人，盲注固定為 1/2，每位玩家以 100 BB 開始，畫面上的籌碼以 BB 顯示。
  - 每回合 10 秒，逾時自動過牌或棄牌。加注介面提供滑桿與 Min／½ Pot／Pot／All-in 快捷鍵。
  - 籌碼輸光就轉為觀戰，比賽結束後回到房間大廳。贏家可以分享戰績截圖。
  - 斷線後有 20 秒可重新連線。

**動畫與特效**
- 發牌、翻牌、籌碼下注與收池（貝茲曲線飛行）。
- 倒數計時環、攤牌時標亮最佳五張、贏家光暈。
- 勝利橫幅（AnimationClip），以及金幣、彩帶、愛心粒子。

**公平性**
- 洗牌使用 `crypto.randomInt` 搭配 Fisher–Yates。
- 攤牌前，其他玩家的底牌不會送到用戶端。
- 用戶端只送出「想做的行動」，合法性、計時與結算都由伺服器處理。

**畫面適配**
- 設計解析度為 1920×1080。比例比 16:9 更寬或更窄時，背景會延伸填滿，四個角落的按鈕仍貼齊畫面邊緣。
- 支援瀏海與安全區域。

## 架構

```
┌──────────── client（Cocos Creator）────────────┐        ┌────────── server（Colyseus）──────────┐
│ View ─ bind ─ ViewModel ─ Model（TableStore）  │  ws    │ LobbyRoom   房間列表（即時更新）       │
│   │                         │                   │◄──────►│ PokerRoom   房間大廳／牌局             │
│ Prefab / Scene        RoomSession（Colyseus SDK）│        │   └ Table   純邏輯（可注入計時與輸出）  │
│ INativeBridge ── WebBridge │ AndroidBridge       │        │       └ engine  Deck、HandEvaluator、 │
└──────────────────────────────┼──────────────────┘        │                 BettingRound、PotManager│
                               │ JSB                       │                 、BotAI（蒙地卡羅）     │
                 Android 原生層（Java + Kotlin）           └────────────────────────────────────────┘
                         shared/（規則常數、協定、事件型別）由用戶端與伺服器共用
```

- **shared**：規則常數、訊息協定、事件型別。用戶端用的副本由 `pnpm sync:shared` 複製到 `client/assets/scripts/shared`。
- **伺服器**：
  - `Table` 不依賴 Colyseus，計時器與輸出都以注入方式提供，可以直接寫單元測試。
  - `PokerRoom` 只負責把 `Table` 接到 Colyseus。
  - 牌局事件依固定節奏依序播放，讓用戶端的動畫有足夠時間演出。
- **用戶端**：
  - `Observable`／`ViewModel`／`ViewBase` 組成輕量的 MVVM。
  - 動畫由兩種來源驅動：狀態快照的差異，以及伺服器送來的牌局事件。

## 專案結構

```
client/                 Cocos Creator 專案
  assets/scenes/        Title、Lobby、Table
  assets/prefabs/       彈窗、房間列表項目、Toast 等
  assets/scripts/       app、core（MVVM、音效、彈窗…）、i18n、models、net、native、viewmodels、views
  assets/resources/     圖片、音效（以 tools/gen-art、gen-sfx 產生）
  native/engine/android Android 原生專案（Java + Kotlin 橋接模組）
server/                 Colyseus 伺服器與測試（vitest）
shared/                 用戶端與伺服器共用的型別與常數
tools/                  素材、場景產生器，以及建置與發佈指令
render.yaml             Render 部署設定
```

## 開發

需求：Node.js 22 以上、pnpm（`corepack enable`）、Cocos Creator 3.8.8。

```bash
pnpm install
pnpm dev:server        # 本機伺服器 ws://localhost:2567
pnpm test              # 伺服器與用戶端純邏輯的測試
pnpm typecheck         # 伺服器 + 用戶端型別檢查
```

用 Cocos Creator 開啟 `client/`，從 `Title` 場景開始預覽。

用戶端連線的伺服器依以下順序決定：

1. 網址參數 `?server=ws://...`
2. localStorage 的 `serverUrl`
3. 開發預覽時使用 `ws://localhost:2567`
4. 其他情況使用正式伺服器

### 常用指令

| 指令 | 說明 |
|---|---|
| `pnpm sync:shared` | 把 `shared/src` 同步到用戶端 |
| `pnpm sync:vendor` | 把 Colyseus SDK 的 UMD bundle 複製到 `client/assets/plugins`，並設為 Cocos 插件腳本 |
| `pnpm gen:art` | 以 SVG 產生牌面、籌碼、圖示、粒子等圖片（resvg 轉成 PNG） |
| `pnpm gen:sfx` | 以程式合成音效（WAV） |
| `pnpm gen:fonts <字型資料夾>` | 產生遊戲內文字的字型子集（需要 Python 與 fontTools，來源字型的下載方式見 `tools/gen-fonts/subset.py`） |
| `pnpm gen:scenes` | 產生場景、Prefab 與 AnimationClip（已存在的檔案不覆寫，加 `--force` 才會覆寫） |

## 部署

| 目標 | 指令 | 說明 |
|---|---|---|
| 伺服器 | push 到 `master` | Render 依 `render.yaml` 自動部署。伺服器每 10 分鐘 ping 自己一次，避免免費方案休眠 |
| Web | `pnpm deploy:web` | 檢查 shared 與 SDK 是否同步 → Cocos CLI 建置 web-mobile → 上傳到 Cloudflare Pages |
| Android | `pnpm build:android` | Cocos CLI 產生 Gradle 專案 → `gradlew assembleRelease` 編譯 APK |
| APK 發佈 | `pnpm release:apk` | 核對 APK 的 versionName → 建立並 push git tag → `gh release create` 附上 APK |

- 版號只有一個來源：最新一筆 commit subject 中的 `vX.Y.Z`。Web 的 `version.json`、APK 的 versionName 與 release tag 都從這裡取得。
- APK 不進 git，只透過 GitHub Releases 發佈。
- 一次性的設定：
  - 在 Render 以 Blueprint 建立服務。
  - `pnpm wrangler login`。
  - 安裝 GitHub CLI 並執行 `gh auth login`。
- `build:android` 依以下環境變數找 SDK、NDK 與 JDK，未設定時使用預設的安裝位置：
  - `ANDROID_HOME`：Android SDK。
  - `ANDROID_NDK_HOME`：NDK。
  - `JAVA_HOME`：JDK 17。
- 正式簽章需要設定 `ANIMEPOKER_KEYSTORE`、`ANIMEPOKER_KEYSTORE_PASSWORD`、`ANIMEPOKER_KEY_ALIAS` 與 `ANIMEPOKER_KEY_PASSWORD`，未設定時使用 debug keystore。

## Android 原生橋接

TypeScript 端統一使用 `INativeBridge` 介面，Web 與 Android 各有一份實作，每項功能在 Web 上都有對應的做法。

| 功能 | 原生實作 | Web 做法 |
|---|---|---|
| 沉浸式全螢幕 | Kotlin `ImmersiveBridge` | Fullscreen API |
| 震動回饋 | Kotlin `HapticsBridge` | `navigator.vibrate` |
| 網路狀態監聽 | Kotlin `NetworkMonitor` | `online`／`offline` 事件 |
| App 版本 | Java `AppActivity.getAppVersion` | 建置時寫入的 `version.json` |
| 螢幕常亮 | Java `AppActivity.setKeepScreenOn` | Screen Wake Lock API |
| 返回鍵與退出 | Java `OnBackInvokedDispatcher`、`exitApp` | Esc 鍵 |
| 分享戰績截圖 | Kotlin `ShareBridge`（FileProvider） | Web Share API，不支援時改為下載 |
| 電量 HUD | Kotlin `BatteryMonitor` | Battery Status API |

- JS 呼叫原生方法用 `native.reflection.callStaticMethod`，Kotlin 端以 `object` 搭配 `@JvmStatic` 實作。
- 原生推送事件給 JS 用 `JsbBridgeWrapper`，送出前先切回遊戲執行緒。
- release 版以 R8 keep 規則保留被 reflection 呼叫的類別。

## 素材

- 圖片與音效都由 `tools/` 下的產生器製作，可以重現。
- 產生圖片時使用的字型為 Fredoka（SIL Open Font License，見 `tools/gen-art/fonts/OFL.txt`）。
- 遊戲內文字使用 Resource Han Rounded（SIL Open Font License，見 `client/assets/resources/fonts/OFL.txt`）。只收錄常用字與介面文字的子集；簡體中文用 CN 字形，繁體中文與英文用 TW 字形。
- 人聲與背景音樂已預留位置，放入對應的檔案就會自動播放，缺少的檔案會被略過：
  - 人聲依玩家的頭像播放：`client/assets/resources/audio/voice/<頭像 id>/<check|bet|call|raise|fold|allIn>`
  - 背景音樂：`client/assets/resources/audio/bgm/<room|room_list|table>`
