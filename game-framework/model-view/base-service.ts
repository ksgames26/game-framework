import { _decorator } from "cc";
import { Container } from "db://game-core/game-framework";
import { EventDispatcher } from "../core/event-dispatcher";
import { AssetService } from "../services/asset-service";
import { OpenViewOptions, UIService } from "../services/ui-service";
import { TaskService } from "../services/task-service";
const { ccclass } = _decorator;

@ccclass("ViewState/BaseService")
export abstract class BaseService<E extends IGameFramework.EventOverview = { [key: string]: any }> extends EventDispatcher<E> {
    public abstract viewOptions(): OpenViewOptions;

    /**
     * 资源管理引用
     *
     * @type {AssetService}
     * @memberof BaseService
     */
    public assetSvr: AssetService = Container.get(AssetService)!;

    /**
     * UI管理引用
     *
     * @type {UIService}
     * @memberof BaseService
     */
    public uiSvr: UIService = Container.get(UIService)!;

    /**
     * 任务管理引用
     *
     * @type {TaskService}
     * @memberof BaseService
     */
    public taskSvr: TaskService = Container.get(TaskService)!;
}