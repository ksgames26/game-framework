import { Component, Node } from "cc";
import { fnEmpty, implementation, makeDefered } from "db://game-core/game-framework";
import { SortedSet } from "../structures/sorted-set";
import { ObjectPools } from "../utils/object-pool";

class Listener implements IGameFramework.Listener, IGameFramework.IPoolObject {
    public eventName: string = "";
    public listener: IGameFramework.EventListener<IGameFramework.EventData> = fnEmpty;
    public priority: number = 0;
    public callee: unknown = undefined;
    public count: number = Number.MAX_VALUE;
    public inPoool: boolean = false;
    public remove: boolean = false;
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
        return this;
    }
}

const listenersPool = new ObjectPools(() => new Listener(), 256, 0);

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
    private listeners: Map<IGameFramework.EventName, SortedSet<Listener>> = new Map();

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
        const listeners = this.getListeners(eventName);
        if (!listeners) return;

        for (const listener of listeners) {

            // listeners是个引用
            // TODO：异步迭代中删除或者新增事件都会有问题,会影响迭代器导致事件发送异常
            await listener.listener.call(listener.callee, eventData);
            listener.count--;
        }
        listeners.erase(events => {
            return (events.count <= 0);
        }).forEach(listener => {
            listenersPool.free(listener);
        });

        // 删除空数组
        if (listeners.isEmpty) {
            this.listeners.delete(eventName);
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
        eventData: TEventOverview[TEventName]
    ): void {
        const listeners = this.getListeners(eventName);
        if (!listeners) return;

        for (const listener of listeners) {
            listener.listener.call(listener.callee, eventData);
            listener.count--;
        }

        listeners.erase(events => {
            return (events.count <= 0);
        }).forEach(listener => {
            listenersPool.free(listener);
        });

        // 删除空数组
        if (listeners.isEmpty) {
            this.listeners.delete(eventName);
        }
    }

    /**
     * 优先调用优先级更高的侦听器。
     * 具有相同优先级的监听器按其注册的顺序调用。
     */
    public addListener<TEventName extends Extract<keyof TEventOverview, string>>(
        eventName: TEventName,
        listener: IGameFramework.EventListener<TEventOverview[TEventName]>,
        callee: unknown,
        count = Number.MAX_VALUE,
        priority: number = 0,
    ) {
        let listeners: IGameFramework.Nullable<SortedSet<Listener>> = this.listeners.get(eventName);
        if (!listeners) {
            listeners = new SortedSet<Listener>((a, b) => a.priority - b.priority);
            this.listeners.set(eventName, listeners);
        }

        for (const events of listeners) {
            if ((events.listener === listener && (!callee || callee === events.callee))) {
                return false;
            }
        }

        listeners.add(listenersPool.obtain().set({ eventName, listener: listener as IGameFramework.EventListener<IGameFramework.EventData>, priority, callee, count }));
        return true;
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
        let listeners: IGameFramework.Nullable<SortedSet<Listener>> = this.listeners.get(eventName);
        if (!listeners) {
            listeners = new SortedSet<Listener>((a, b) => a.priority - b.priority);
            this.listeners.set(eventName, listeners);
        }

        const { resolve, promise } = makeDefered<IGameFramework.EventData>();
        listeners.add(listenersPool.obtain().set({ eventName, listener: resolve as IGameFramework.EventListener<IGameFramework.EventData>, priority, callee: null!, count: 1 }));
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
        if (this.addListener(eventName, listener as IGameFramework.EventListener<IGameFramework.EventData>, callee, count, priority) && callee instanceof Component) {
            callee.node.on(Node.EventType.NODE_DESTROYED, () => {
                this.removeListener(eventName, listener as IGameFramework.EventListener<IGameFramework.EventData>, callee);
            });
        }

        return true;
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
        const listeners = this.listeners.get(eventName);
        if (!listeners || listeners.isEmpty) {
            return false;
        }

        const remove = listeners.remove(events => {
            return (events.listener === listener && (!callee || callee === events.callee));
        });
        if (remove) {
            listenersPool.free(remove);
        }

        // 删除空数组
        if (listeners.isEmpty) {
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
        if (this.listeners.has(eventName)) {
            this.listeners.get(eventName)!.forEach(listener => {
                listenersPool.free(listener);
                return true;
            });;
            this.listeners.delete(eventName);

            return true
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
            events.clear();
        });
        this.listeners.clear();
    }

    /**
     * 获取某个类型事件的所有侦听器。
     *
     * @private
     * @param {IGameFramework.EventName} eventName
     * @return {*}  {SortedSet<Listener>}
     * @memberof EventDispatcher
     */
    private getListeners(eventName: IGameFramework.EventName): SortedSet<Listener> {
        if (this.listeners.has(eventName)) {
            return this.listeners.get(eventName)!;
        }

        return null!;
    }
}