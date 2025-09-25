import { _decorator } from "cc";

import { EventDispatcher } from "../core/event-dispatcher";
import { AssetService } from "../services/asset-service";
import { TaskService } from "../services/task-service";
import { OpenViewOptions, UIService } from "../services/ui-service";
import { Container } from "db://game-core/game-framework";
import { ObserverValue } from "../utils/observer-value";
const { ccclass } = _decorator;

@ccclass("ViewState/BaseService")
export abstract class BaseService<
    U extends  { [key: string]: any } = {},
    E extends IGameFramework.EventOverview = { [key: string]: any },
> extends EventDispatcher<E> {
    private _observerValues: { [K in keyof U]?: ObserverValue<U[K]> } = {};
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

    /**
     * 获取游戏中心事件分发器
     *
     * @return {*}  {EventDispatcher<IGameFramework.IGameEvent>}
     * @memberof BaseService
     */
    public getGameCenterDispatcher(): EventDispatcher<IGameFramework.IGameEvent> {
        return Container.get(EventDispatcher<IGameFramework.IGameEvent>);
    }

    /**
     * 获取观察者值
     *
     * @template K
     * @param {K} key
     * @param {U[K]} v
     * @return {*}  {ObserverValue<U[K]>}
     * @memberof BaseService
     */
    public observerValue<K extends Extract<keyof U, string>>(key: K, v: U[K]): ObserverValue<U[K]> {
        if (this._observerValues[key]) {
            return this._observerValues[key] as ObserverValue<U[K]>;
        }

        const observer = new ObserverValue<U[K]>(key, v);
        this._observerValues[key] = observer;
        return observer;
    }

    /**
     * 获取观察者值
     *
     * @template K
     * @param {K} key
     * @return {*}  {IGameFramework.Nullable<ObserverValue<U[K]>>}
     * @memberof BaseService
     */
    public getObserverValue<K extends Extract<keyof U, string>>(key: K): IGameFramework.Nullable<ObserverValue<U[K]>> {
        return this._observerValues[key] as IGameFramework.Nullable<ObserverValue<U[K]>>;
    }

    /**
     * 清除观察者值
     *
     * @param {string} key
     * @memberof BaseService
     */
    public clearObserverValue(key: string): void {
        if (this._observerValues[key]) {
            this._observerValues[key].clearUp();
            delete this._observerValues[key];
        }
    }

    /**
     * 设置观察者值
     *
     * @template K
     * @param {K} key
     * @param {U[K]} v
     * @return {*}  {boolean}
     * @memberof BaseService
     */
    public add<K extends Extract<keyof U, string>>(key: K, v: U[K]): boolean {
        const observer = this.getObserverValue<K>(key);
        if (observer) {
            if (typeof observer.value === "number" && typeof v === "number") {
                observer.value = ((observer.value as number) + (v as number)) as U[K];
            } else if (typeof observer.value === "string" && typeof v === "string") {
                observer.value = ((observer.value as string) + (v as string)) as U[K];
            } else {
                observer.value = v;
            }
            return true;
        }
        return false;
    }

    /**
     * 移除观察者值
     *
     * @template K
     * @param {K} key
     * @param {U[K]} v
     * @return {*}  {boolean}
     * @memberof BaseService
     */
    public remove<K extends Extract<keyof U, string>>(key: K, v: U[K]): boolean {
        const observer = this.getObserverValue<K>(key);
        if (observer) {
            if (typeof observer.value === "number" && typeof v === "number") {
                observer.value = ((observer.value as number) - (v as number)) as U[K];
            } else if (typeof observer.value === "string" && typeof v === "string") {
                observer.value = ((observer.value as string).replace(v as string, "") as U[K]);
            } else {
                observer.value = v;
            }
            return true;
        }
        return false;
    }

    /**
     * 设置值
     *
     * @template K
     * @param {K} key
     * @param {U[K]} v
     * @memberof BaseService
     */
    public setValue<K extends Extract<keyof U, string>>(key: K, v: U[K]): ObserverValue<U[K]> {
        const observer = this.getObserverValue<K>(key);
        if (observer) {
            observer.value = v;
            return observer;
        } else {
            return this.observerValue(key, v);
        }
    }

    /**
     * 获取值
     *
     * @template K
     * @param {K} key
     * @return {*}  {IGameFramework.Nullable<U[K]>}
     * @memberof BaseService
     */
    public getValue<K extends Extract<keyof U, string>>(key: K): IGameFramework.Nullable<U[K]> {
        const observer = this.getObserverValue<K>(key);
        if (observer) {
            return observer.value;
        }
        return null;
    }
}