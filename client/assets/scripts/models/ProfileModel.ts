import { AVATARS } from '../config/Avatars';
import { computed, Observable } from '../core/Observable';
import { uuidV4 } from '../core/random';
import { storage } from '../core/Storage';
import { normalizeNickname } from '../shared/protocol';

interface SavedProfile {
    nickname: string;
    avatarId: string;
}

/**
 * 玩家設定（沒有登入系統，全部存在 localStorage）：
 *   - playerId：首次啟動產生的 UUID，伺服器以此辨識同一位玩家（斷線重連、重新進入房間）
 *   - 暱稱、頭像：兩者皆為必填，設定完成前不能進入房間列表
 */
class ProfileModel {
    readonly nickname = new Observable('');
    readonly avatarId = new Observable('');
    readonly isComplete = computed([this.nickname, this.avatarId], () => this.nickname.value !== '' && this.avatarId.value !== '');

    private _playerId = '';

    get playerId(): string {
        return this._playerId;
    }

    load(): void {
        this._playerId = storage.get('playerId', '');
        if (!this._playerId) {
            this._playerId = uuidV4();
            storage.set('playerId', this._playerId);
        }

        const saved = storage.get<SavedProfile | null>('profile', null);
        const nickname = normalizeNickname(saved?.nickname);
        // 已移除的頭像視為未設定，讓玩家重新選擇
        const avatarValid = AVATARS.some((a) => a.id === saved?.avatarId);
        this.nickname.value = nickname ?? '';
        this.avatarId.value = avatarValid ? saved!.avatarId : '';
    }

    /** 驗證並儲存；暱稱不合法時回傳 false */
    save(nickname: string, avatarId: string): boolean {
        const normalized = normalizeNickname(nickname);
        if (!normalized || !AVATARS.some((a) => a.id === avatarId)) return false;
        this.nickname.value = normalized;
        this.avatarId.value = avatarId;
        storage.set<SavedProfile>('profile', { nickname: normalized, avatarId });
        return true;
    }
}

export const profile = new ProfileModel();
