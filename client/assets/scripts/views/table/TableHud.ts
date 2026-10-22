import { _decorator, Component, Label } from 'cc';
import { eventBus } from '../../core/EventBus';
import { nativeBridge } from '../../native/NativeBridge';

const { ccclass, property, menu } = _decorator;

/** 牌桌角落的時間與電量（不支援電量的平台只顯示時間） */
@ccclass('TableHud')
@menu('AnimePoker/TableHud')
export class TableHud extends Component {
    @property(Label)
    label: Label | null = null;

    private battery: { level: number; charging: boolean } | null = null;
    private off: (() => void) | null = null;

    protected onLoad(): void {
        this.refresh();
        this.schedule(this.refresh, 15);
        void nativeBridge.getBattery().then((status) => {
            this.battery = status;
            this.refresh();
        });
        this.off = eventBus.on('batteryChanged', (level, charging) => {
            this.battery = { level, charging };
            this.refresh();
        });
    }

    protected onDestroy(): void {
        this.off?.();
    }

    private refresh(): void {
        if (!this.label) return;
        const now = new Date();
        const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const battery = this.battery ? `   ${this.battery.charging ? '⚡' : '▮'} ${Math.round(this.battery.level * 100)}%` : '';
        this.label.string = time + battery;
    }
}
