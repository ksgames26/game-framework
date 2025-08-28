import { Node } from "cc";
import { Container, logger } from "db://game-core/game-framework";
import { OpenViewOptions, UIService } from "../../services/ui-service";
import { BaseService } from "../base-service";
import { BaseView } from "../base-view";

/**
 * ViewLock 是一个管理视图锁定状态的类。
 *
 * @export
 * @class ViewLock
 */
export class ViewLock<S extends BaseService, StreamTaskReturn> {
    private _canOpen: boolean = true;
    private _options: OpenViewOptions;
    private _service: S;
    private _nodeDestroyClear: Node;

    public constructor(options: OpenViewOptions, service: S, nodeDestroyClear: Node) {
        this._options = options;
        this._service = service;
        this._nodeDestroyClear = nodeDestroyClear;

        if (this._nodeDestroyClear) {
            this._nodeDestroyClear.on(Node.EventType.NODE_DESTROYED, this.clear, this);
        }
    }

    public get viewCanOpen() {
        return this._canOpen;
    }

    public async openView(): Promise<IGameFramework.Nullable<BaseView<S, StreamTaskReturn>>> {
        if (!this._canOpen) {
            logger.warn("View is locking, cannot open view");
            return;
        }

        this._canOpen = false;
        const uiSvr = Container.get(UIService)!;
        if (!uiSvr) {
            logger.error("UIService instance is null");
            return;
        }
        const view = await uiSvr.openView(this._options, this._service);
        if (view) {
            view.viewCloseAfter().then(() => {
                this._canOpen = true;
            });
        } else {
            this._canOpen = true;
        }
        return view;
    }

    public clear(): void {
        this._options = null!;
        this._service = null!;
        this._nodeDestroyClear = null!;
    }
}

/**
 * 检查是否有任何视图当前正在打开
 */
export const hasOpeningView = <S extends BaseService>(viewLocks: ViewLock<S, any>[]) => {
    return viewLocks.some(lock => !lock.viewCanOpen);
};