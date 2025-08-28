import { Component, director, Node } from "cc";
import { Deferred, fnEmpty, implementation, SortedSet } from "db://game-core/game-framework";
import { ObjectPools } from "../utils/object-pool";

class Listener implements IGameFramework.Listener, IGameFramework.IPoolObject {
    public eventName: string = "";
    public listener: IGameFramework.EventListener<IGameFramework.EventData> = fnEmpty;
    public priority: number = 0;
    public callee: unknown = undefined;
    public count: number = Number.MAX_VALUE;
    public inPoool: boolean = false;
    public remove: boolean = false;
    public auto: boolean = false;
    private _disposed: boolean = false;

    public constructor(
    ) { }

    public onCreate(): void {

    }
    public onFree(): boolean {
        this.listener = fnEmpty;
        this.eventName = "";
        this.callee = null;
        this.remove = false;
        this.auto = false;
        return true;
    }

    public dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
    }

    public get isDisposed(): boolean {
        return this._disposed;
    }

    public set(o: IGameFramework.Listener): Listener {
        this.eventName = o.eventName;
        this.listener = o.listener;
        this.priority = o.priority;
        this.callee = o.callee;
        this.count = o.count;
        this.remove = false;
        this.auto = false;
        return this;
    }
}

const listenersPool = new ObjectPools(() => new Listener(), 256, 0);

/**
 * 事件监听装饰器
 * 用于自动注册和注销事件监听器
 * @param dispatcher EventDispatcher实例
 * @param eventName 事件名称
 */
export function eventListener<TEventOverview extends IGameFramework.EventOverview, TEventName extends Extract<keyof TEventOverview, string> = Extract<keyof TEventOverview, string>>(
    dispatcher: () => EventDispatcher<TEventOverview>,
    eventName: TEventName,
    count: number = Number.MAX_VALUE
) {
    return function (
        target: Object,
        propertyKey: string | symbol,
        descriptor: TypedPropertyDescriptor<IGameFramework.EventListener<TEventOverview[TEventName]>>
    ) {
        director.once("game-framework-initialize", () => {
            dispatcher().addListener(eventName, descriptor.value!, null!, count);
        });
        return descriptor;
    };
}

interface IAfterOperation {
    operation: "add" | "remove" | "clear";
    listener: IGameFramework.Nullable<Listener>;
}

class AfterAdd implements IAfterOperation {
    public operation: "add" | "remove" | "clear" = "add";
    public listener: IGameFramework.Nullable<Listener> = null;

    public constructor(listener: Listener) {
        this.listener = listener;
    }
}

class AfterRemove implements IAfterOperation {
    public operation: "add" | "remove" | "clear" = "remove";
    public listener: IGameFramework.Nullable<Listener> = null;

    public constructor(listener: Listener) {
        this.listener = listener;
    }
}

class AfterClear implements IAfterOperation {
    public operation: "add" | "remove" | "clear" = "clear";
    public listener: IGameFramework.Nullable<Listener> = null;

    public constructor(listener: Listener) {
        this.listener = listener;
    }
}

export class EventList {
    public isDispatching: boolean = false;
    public listeners: SortedSet<Listener> = new SortedSet<Listener>((a, b) => a.priority - b.priority);
    public deferred: IGameFramework.Nullable<Deferred<void>> = null;

    /**
     * 是否只分发一次事件
     * 
     * 如果为true，则在当前事件分发后，如果有新的事件监听器被添加，则会立即分发该事件
     *
     * @type {boolean}
     * @memberof EventList
     */
    public immediatelyEvent: boolean = false;

    /**
     * 是否已经分发过事件
     * 当且仅当immediatelyEvent为true时有效
     * 
     * @type {boolean}
     * @memberof EventList
     */
    public dispatched: boolean = false;

    /**
     * 事件分发数据
     *
     * @type {IGameFramework.EventData}
     * @memberof EventList
     */
    public dispatchData: IGameFramework.EventData = {};

    /**
     * 事件操作队列
     *
     * @type {IAfterOperation[]}
     * @memberof EventList
     */
    public afterOperationQueue: IAfterOperation[] = [];

    public get isEmpty(): boolean {
        return this.listeners.isEmpty;
    }
}

/**
 * 事件分发器
 *
 * @export
 * @class EventDispatcher
 * @implements {IGameFramework.IEventDispatcher<TEventOverview>}
 * @template TEventOverview
 */
@implementation("IGameFramework.IEventDispatcher")
export class EventDispatcher<TEventOverview extends IGameFramework.EventOverview = {}> implements IGameFramework.IEventDispatcher<TEventOverview> {
    private listeners: Map<IGameFramework.EventName, EventList> = new Map();

    /**
     * 严格顺序的事件分发
     * 
     * 但是上一个事件没有处理完毕的话，下一个事件不会开始处理哦
     *
     * @template TEventName
     * @param {TEventName} eventName
     * @param {TEventOverview[TEventName]} eventData
     * @return {*}  {Promise<void>}
     * @memberof EventDispatcher
     */
    public async dispatchStrictSequence<TEventName extends Extract<keyof TEventOverview, string> | string>(
        eventName: TEventName,
        eventData: TEventOverview[TEventName]
    ): Promise<void> {
        const listenersList = this.getListeners(eventName);
        if (!listenersList) return;

        if (listenersList.isDispatching) {
            return listenersList.deferred!.promise;
        }

        listenersList.isDispatching = true;
        listenersList.deferred = new Deferred<void>();

        const listeners = listenersList.listeners;

        for (const listener of listeners) {
            // 可能因为clear导致listener为空
            if (!listener) continue;

            if (listener.listener === fnEmpty) {
                continue; // 忽略空函数监听器
            }

            await listener.listener.call(listener.callee ?? this, eventData);
            listener.count--;
        }

        // 清理无效的监听器
        listeners.erase(events => {
            return (events.count <= 0 || events.listener == fnEmpty);
        }).forEach(listener => {
            listenersPool.free(listener);
        });

        // 分发完毕后，分发在分发期间add的需要分发的事件
        await this.operApply(listenersList, eventData);

        // 如果监听器列表为空，一般是要删除的，但是立即事件除外
        if (listenersList.isEmpty && !listenersList.immediatelyEvent) {
            this.listeners.delete(eventName);
        }

        listenersList.deferred?.fulfilled();
        listenersList.deferred = null;

        listenersList.isDispatching = false;

        if (listenersList.immediatelyEvent) {
            listenersList.dispatched = true;
            listenersList.dispatchData = eventData;
        }
    }

    /**
     * 事件分发
     * 
     * 无论是不是异步事件，都同时处理
     *
     * @template TEventName
     * @param {TEventName} eventName
     * @param {TEventOverview[TEventName]} eventData
     * @return {*}  {Promise<void>}
     * @memberof EventDispatcher
     */
    public dispatch<TEventName extends Extract<keyof TEventOverview, string>>(
        eventName: TEventName,
        eventData: TEventOverview[TEventName],
    ): void {
        const listenersList = this.getListeners(eventName);
        if (!listenersList) return;

        if (listenersList.isDispatching) {
            return;
        }

        listenersList.isDispatching = true;
        const listeners = listenersList.listeners;
        for (const listener of listeners) {
            if (!listener) continue;

            if (listener.listener === fnEmpty) {
                continue; // 忽略空函数监听器
            }

            listener.listener.call(listener.callee ?? this, eventData);
            listener.count--;
        }

        listeners.erase(events => {
            return (events.count <= 0 || events.listener == fnEmpty);
        }).forEach(listener => {
            listenersPool.free(listener);
        });

        // 处理完所有监听器后，执行后续操作
        this.operApply(listenersList, eventData);

        // 如果监听器列表为空，一般是要删除的，但是立即事件除外
        if (listenersList.isEmpty && !listenersList.immediatelyEvent) {
            this.listeners.delete(eventName);
        }

        listenersList.isDispatching = false;

        if (listenersList.immediatelyEvent) {
            listenersList.dispatched = true;
            listenersList.dispatchData = eventData;
        }
    }

    /**
     * 优先调用优先级更高的侦听器。
     * 具有相同优先级的监听器按其注册的顺序调用。
     * 
     * @param {number} count 如果小于0.则是立即实现，即分发后的事件，添加的时候，会立即分发
     */
    public addListener<TEventName extends Extract<keyof TEventOverview, string>>(
        eventName: TEventName,
        listener: IGameFramework.EventListener<TEventOverview[TEventName]>,
        callee: unknown,
        count: number = Number.MAX_VALUE,
        priority: number = 0,
    ) {
        let listenersList: IGameFramework.Nullable<EventList> = this.listeners.get(eventName);
        if (!listenersList) {
            listenersList = new EventList();
            if (count < 0) {
                listenersList.immediatelyEvent = true;
            }
            this.listeners.set(eventName, listenersList);
        }

        if (listenersList.immediatelyEvent && listenersList.dispatched) {
            listener.call(callee, listenersList.dispatchData);
            return null; // 如果是立即事件且已经分发过，则不再添加新的监听器
        }

        const listenerObj = listenersPool.obtain().set(
            {
                eventName,
                listener,
                priority,
                callee,
                count
            });
        if (listenersList.isDispatching) {
            // 如果正在分发事件，则将监听器添加到等待队列
            listenersList.afterOperationQueue.push(new AfterAdd(listenerObj));
            return listenerObj;
        }

        const listeners = listenersList.listeners;

        for (const events of listeners) {
            if ((events.listener === listener && (!callee || callee === events.callee))) {
                listenersPool.free(listenerObj);
                return events; // 如果已经存在相同的监听器，则不添加
            }
        }

        listeners.add(listenerObj);
        return listenerObj;
    }

    /**
     * 优先调用优先级更高的侦听器。
     * 具有相同优先级的监听器按其注册的顺序调用。
     * 
     * 异步的监听器允许对一个事件进行对个监听，但是异步监听器只能监听一次。触发以后自动销毁
     */
    public addAsyncListener<TEventName extends Extract<keyof TEventOverview, string>>(
        eventName: TEventName,
        priority: number = 0,
    ): Promise<TEventOverview[TEventName]> {
        let listenersList: IGameFramework.Nullable<EventList> = this.listeners.get(eventName);
        if (!listenersList) {
            listenersList = new EventList();
            this.listeners.set(eventName, listenersList);
        }

        const deferred = new Deferred<IGameFramework.EventData>();
        const { fulfilled, promise } = deferred;
        const listenerObj = listenersPool.obtain().set({ eventName, listener: fulfilled, priority, callee: deferred, count: 1 });

        if (listenersList.isDispatching) {
            // 如果正在分发事件，则将监听器添加到等待队列
            listenersList.afterOperationQueue.push(new AfterAdd(listenerObj));
            return promise;
        }

        const listeners = listenersList.listeners;
        listeners.add(listenerObj);
        return promise;
    }

    /**
    * 优先调用优先级更高的侦听器。
    * 具有相同优先级的监听器按其注册的顺序调用。
    * 
    * 如果监听的作用域是一个组件，那么当该组件所在的node被销毁时，监听器会自动移除。
    */
    public addAutoListener<TEventName extends Extract<keyof TEventOverview, string>>(
        eventName: TEventName,
        listener: IGameFramework.EventListener<TEventOverview[TEventName]>,
        callee: unknown,
        count = Number.MAX_VALUE,
        priority: number = 0,
    ) {
        const listenerObj = this.addListener(eventName, listener, callee, count, priority);

        if (listenerObj && callee instanceof Component) {
            listenerObj.auto = true;
            callee.node.on(Node.EventType.NODE_DESTROYED, () => {
                this.removeListener(eventName, listener, callee);
            });
        }

        return listenerObj;
    }

    /**
     * 移除侦听器。
     *
     * @template TEventName
     * @param {TEventName} eventName
     * @param {(IGameFramework.EventListener<TEventName, TEventOverview[TEventName]> | Function)} listener
     * @param {unknown} [callee]
     * @return {void}  
     * @memberof EventDispatcher
     */
    public removeListener<TEventName extends Extract<keyof TEventOverview, string> | string>(
        eventName: TEventName,
        listener: IGameFramework.EventListener<TEventOverview[TEventName]>,
        callee?: unknown
    ): boolean {
        const listenersList = this.listeners.get(eventName);

        if (!listenersList || listenersList.isEmpty) {
            return false;
        }

        if (listenersList.isDispatching) {
            const removeObj = listenersPool.obtain().set({
                eventName,
                listener,
                callee,
                priority: 0,
                count: 0
            });

            // 如果正在分发事件，则将监听器添加到等待队列
            listenersList.afterOperationQueue.push(new AfterRemove(removeObj));
            return false;
        }

        const remove = listenersList.listeners.remove(events => {
            return (events.listener === listener && (!callee || callee === events.callee));
        });

        if (remove) {
            if (remove.callee && remove.callee instanceof Deferred) {
                // 如果是Deferred，则直接完成
                // 可以让await的监听器结束
                remove.callee.fulfilled(null);
            }

            listenersPool.free(remove);
        }

        // 删除空数组
        if (listenersList.isEmpty) {
            this.listeners.delete(eventName);
        }

        return true;
    }

    /**
     * 移除对应事件的所有侦听器。
     *
     * @template TEventName
     * @param {TEventName} eventName
     * @memberof EventDispatcher
     */
    public removeListeners<TEventName extends Extract<keyof TEventOverview, string>>(
        eventName: TEventName
    ): boolean {
        const listenersList = this.listeners.get(eventName);

        if (listenersList) {
            if (listenersList!.isDispatching) {
                const removeObj = listenersPool.obtain().set({
                    eventName,
                    listener: fnEmpty,
                    callee: null,
                    priority: 0,
                    count: 0
                });

                listenersList.afterOperationQueue.push(new AfterClear(removeObj));
                return false;
            }

            listenersList.listeners.forEach(listener => {
                listenersPool.free(listener);
                return true;
            });
            this.listeners.delete(eventName);

            return true;
        }

        return false;
    }

    /**
     * 判断是否监听了该事件
     *
     * @template TEventName
     * @param {TEventName} eventName
     * @return {*}  {boolean}
     * @memberof EventDispatcher
     */
    public has<TEventName extends Extract<keyof TEventOverview, string>>(eventName: TEventName): boolean {
        return this.listeners.has(eventName);
    }

    /**
     * 移除所有侦听器。
     *
     * @memberof EventDispatcher
     */
    public clearUp(): void {
        this.listeners.forEach(events => {
            // 这里不管是不是分发中
            // 被监听的事件都会变成空函数
            // 假如真的在分发中
            // 看见是空函数，也不会在分发了
            events.listeners.forEach(listener => {
                if (listener.callee && listener.callee instanceof Deferred) {
                    // 如果是Deferred，则直接完成
                    // 可以让await的监听器结束
                    listener.callee.fulfilled(null);
                }

                listenersPool.free(listener);
                return true;
            });

            // 清空操作队列
            events.afterOperationQueue.forEach(operation => {
                if (operation.listener) {
                    if (operation.listener.callee && operation.listener.callee instanceof Deferred) {
                        // 如果是Deferred，则直接完成
                        // 可以让await的监听器结束
                        operation.listener.callee.fulfilled(null);
                    }

                    listenersPool.free(operation.listener);
                }
            });
            events.afterOperationQueue = [];
        });

        this.listeners.clear();
    }

    /**
     * 获取某个类型事件的所有侦听器。
     *
     * @private
     * @param {IGameFramework.EventName} eventName
     * @return {EventList}  {EventList}
     * @memberof EventDispatcher
     */
    private getListeners(eventName: IGameFramework.EventName): EventList {
        if (this.listeners.has(eventName)) {
            return this.listeners.get(eventName)!;
        }

        return null!;
    }

    /**
     * 执行操作队列中的操作
     *
     * @private
     * @param {EventList} listenersList
     * @param {string} eventData
     * @return {*}  {Promise<void>}
     * @memberof EventDispatcher
     */
    private async operApply(listenersList: EventList, eventData: string): Promise<void> {
        const queue = listenersList.afterOperationQueue;
        for (const after of queue) {
            // 可能因为clear导致listener为空
            if (!after) continue;

            if (after.operation === "add") {
                if (listenersList.deferred) {
                    await this.afterAdd(listenersList, after, eventData);
                } else {
                    this.afterAdd(listenersList, after, eventData);
                }
            } else if (after.operation === "remove") {

                // 如果是remove操作，尝试从监听器列表中移除
                const remove = listenersList.listeners.remove(events => {
                    return (events.listener === after.listener!.listener && events.callee === after.listener!.callee);
                });

                // 如果移除成功
                if (remove) {
                    if (after.listener!.callee && after.listener!.callee instanceof Deferred) {
                        // 如果是Deferred，则直接完成
                        // 可以让await的监听器结束
                        after.listener!.callee.fulfilled(null);
                    }

                    listenersPool.free(after.listener!);
                }

            } else if (after.operation === "clear") {
                listenersList.listeners.forEach(listener => {
                    if (listener.callee && listener.callee instanceof Deferred) {
                        // 如果是Deferred，则直接完成
                        // 可以让await的监听器结束
                        listener.callee.fulfilled(null);
                    }

                    listenersPool.free(listener);
                    return true;
                });

                // 这里不移除afterOperationQueue中的操作
                // 视为在clear后add/remove的都是有效操作，会继续进行
            }
        }

        listenersList.afterOperationQueue.length = 0;
    }

    /**
     * 执行添加操作
     *
     * @private
     * @param {EventList} listenersList
     * @param {AfterAdd} after
     * @param {string} eventData
     * @return {*}  {Promise<void>}
     * @memberof EventDispatcher
     */
    private async afterAdd(listenersList: EventList, after: AfterAdd, eventData: string): Promise<void> {
        const listeners = listenersList.listeners;

        const listener = after.listener;
        if (!listener) return;

        if (listener.listener === fnEmpty) {
            return; // 忽略空函数监听器
        }

        if (listenersList.deferred) {
            await listener.listener.call(listener.callee, eventData);
        } else {
            listener.listener.call(listener.callee, eventData);
        }

        listener.count--;

        // 分发完毕还有次数
        if (listener.count > 0) {
            listeners.add(listener);
        }
    }
}