import { _decorator, Animation, AnimationClip, AnimationState, assert, game } from "cc";
import { DEBUG } from "cc/env";
import { DefaultBlackboard, AsyncStateMachine } from "../../intelligence/async-state-machine";
const { ccclass, property, menu } = _decorator;

class State implements IGameFramework.IAsyncState<ViewState, DefaultBlackboard> {
    public declare stateMachine: ViewStateMachine;
    private _direction: number = 1.0;
    private _disposed: boolean = false;

    public constructor(private _id: number, private _event: AnimationClip.IEvent) {

    }

    public get isDisposed(): boolean {
        return this._disposed;
    }

    public get frame() {
        return this._event.frame;
    }

    public async enter(entity: ViewState): Promise<void> {
        let state = entity.createDefaultState();
        let scale = entity.scale;
        let time = state.duration;
        if (entity.speed == 1 && scale != 1) {
            state.speed = time / scale;
        } else if (entity.speed != 1) {
            state.speed = entity.speed;
        }

        const trans = entity.trans;
        if (!trans) {
            state.setTime(this._event.frame);
            state.sample();
            return;
        }

        const prev = this.stateMachine.getPrevState();
        if (prev) {
            const info = state.sample();
            if (prev._event.frame > this._event.frame) {
                info.direction = -1.0;
            } else if (prev._event.frame < this._event.frame) {
                info.direction = 1.0;
            }

            this._direction = info.direction;
        }
    }

    public update(entity: ViewState): void {
        let state = entity.getState(entity.defaultClip!.name);

        let delta = 0.0;
        if (this._direction == 1.0) {
            if (state.time >= this._event.frame) {
                return;
            }

            if (entity.trans) {
                delta = state.time + game.deltaTime * state.speed;
            } else {
                delta = this._event.frame;
            }
            if (delta > this._event.frame) delta = this._event.frame;
        } else {
            if (state.time <= this._event.frame) {
                return;
            }

            if (entity.trans) {
                delta = state.time - game.deltaTime * state.speed;
            } else {
                delta = this._event.frame;
            }
            if (delta < this._event.frame) delta = this._event.frame;
        }

        state.setTime(delta);
        state.sample();
    }

    public async exit(entity: ViewState): Promise<void> {

    }

    public equals(entity: State): boolean {
        return this._event === entity._event;
    }

    public get id() {
        return this._id;
    }

    public dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
    }
}

class ViewStateMachine extends AsyncStateMachine<ViewState, DefaultBlackboard, State> {

    private _prev: State = null!;

    public changeCurrentState() {
        const owner = this._owner as ViewState;
        let defaultState = owner.createDefaultState();
        const first = this._states.find(state => defaultState.time <= state.frame);
        if (first) {
            this._currentState = first;
        }
    }

    public getPrevState(): State {
        return this._prev;
    }

    public get timeInSecond(): number {
        let per = 1.0;
        if (this.owner.speed == 1 && this.owner.scale != 1) {
            per = this.owner.scale;
        } else if (this.owner.speed != 1) {
            per = this.owner.speed;
        }
        return Math.abs(this._currentState!.frame - this._prev.frame) / per;
    }

    public beforeStateChange(curr: State, next: State): void {
        this._prev = curr;
        this._currentState = next;
    }
}

/**
 * 基于动画状态的视图状态控制器
 *
 * @export
 * @class ViewState
 * @extends {Animation}
 */
@ccclass("ViewState")
@menu("GameFramework/ViewState")
export class ViewState extends Animation {
    /**
     * 视图状态机
     *
     * @private
     * @memberof ViewState
     */
    private _stateMachine = new ViewStateMachine(this, new DefaultBlackboard());
    private _index: number = 0;
    private _trans: boolean = true;
    private _scale: number = 1.0;
    private _speed: number = 1.0;
    private _needAdjustState: boolean = false;
    private _clip: AnimationClip | null = null;

    @property({ type: [AnimationClip], override: true, visible: false })
    get clips(): (AnimationClip | null)[] {
        return super.clips;
    }

    set clips(value) {
        super.clips = value;
    }

    @property({ type: AnimationClip, override: true, visible: true, displayName: "View State" })
    get defaultClip(): AnimationClip | null {
        return this._defaultClip;
    }

    set defaultClip(value) {
        if (value == null || value == undefined) { 
            return;
        }

        const has = super.clips.find(v => v!.name == value!.name);
        if (!has) {
            this.addClip(value!, value!.name);
        }
        this._defaultClip = value;
    }

    @property({ override: true, visible: false })
    public playOnLoad = false;

    public onLoad() {
        const clip = this.defaultClip;
        if (!clip) {
            return;
        }

        for (const event of clip.events.entries()) {
            this._stateMachine.addState(new State(event[0], event[1]));
        }
    }

    /**
     * 播放速度
     *
     * @memberof ViewState
     */
    public get speed() {
        return this._speed;
    }

    public set speed(speed: number) {
        this._speed = speed;
    }

    /**
     * 时间缩放
     * 
     * 只是调整播放速度到缩放时间
     * 
     * 比如一个动画时长是2秒
     * 
     * scale为0.5的话，则播放速度为1
     * scale为2的话，则播放速度为4
     * 
     * 如果speed不为1，则scale不生效
     *
     * @memberof ViewState
     */
    public get scale() {
        return this._scale;
    }

    public set scale(scale: number) {
        this._scale = scale;
    }

    /**
     * 状态总数
     *
     * @readonly
     * @memberof ViewState
     */
    public get stateMax() {
        const clip = this.defaultClip;
        if (!clip) {
            return 0;
        }

        return clip.events.length;
    }

    /**
     * 切换状态是否动画过度
     *
     * @memberof ViewState
     */
    public get trans() {
        return this._trans;
    }

    public set trans(trans: boolean) {
        this._trans = trans;
    }

    /**
     * 两个状态时间距离
     * 
     * 即从一个状态到另一个状态所经过的时间 
     *
     * @readonly
     * @type {number}
     * @memberof ViewState
     */
    public get timeInSecond(): number {
        return this._stateMachine.timeInSecond;
    }

    /**
     * 改变状态
     *
     * @param {number} index
     * @param {boolean} [trans=this._trans]
     * @memberof ViewState
     */
    public async changeState(index: number, trans: boolean = this._trans): Promise<void> {
        if (DEBUG) assert(index < this.stateMax, "index out of range");
        else if (index < this.stateMax) return;

        if (this.needAdjustState) {
            this._needAdjustState = false;
            this._stateMachine.changeCurrentState();
        }

        this._index = index;
        this._trans = trans;
        await this._stateMachine.changeStateById(index);
    }

    /**
     * 创建初始化状态
     *
     * @return {*}  {AnimationState}
     * @memberof ViewState
     */
    public createDefaultState(): AnimationState {
        let state = this.getState(this.defaultClip!.name);
        if (!state) {
            state = this.createState(this.defaultClip!, this.defaultClip!.name);
        }

        return state;
    }

    /**
     * 设置百分比位置
     *
     * @memberof ViewState
     */
    public set percent(percent: number) {
        let state = this.createDefaultState();

        state.time = state.duration * percent;
        state.sample();
        this._needAdjustState = true;
    }

    /**
     * 如果在设置百分比位置之后
     * 
     * 切换了状态，则需要重新校验一下当前的状态
     *
     * @readonly
     * @memberof ViewState
     */
    public get needAdjustState() {
        return this._needAdjustState;
    }

    /**
     * 当前状态索引
     *
     * @readonly
     * @memberof ViewState
     */
    public get index() {
        return this._index;
    }

    public update() {
        if (this._needAdjustState) return;
        this._stateMachine.update();
    }
}