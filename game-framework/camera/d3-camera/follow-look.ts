import { Vec3 } from "cc";
import { Component, Node, _decorator } from "cc";
import { EDITOR } from "cc/env";
const { ccclass, property } = _decorator;

@ccclass("Camera/D3Camera/FollowLook")
export class FollowLook extends Component {
    @property private _lockAt: Node = null!;
    @property({ type: Node, tooltip: EDITOR ? "跟随目标" : "" }) get lockAt(): Node {
        return this._lockAt;
    }

    set lockAt(value: Node) {
        this._lockAt = value;
    }

    @property private _rotation: Vec3 = new Vec3();
    @property({ tooltip: EDITOR ? '旋转视角' : "" }) get rotation(): Vec3 {
        return this._rotation;
    }

    set rotation(value: Vec3) {
        Vec3.copy(this._rotation, value);
    }

    @property private _height: number = 12;
    @property({ tooltip: EDITOR ? '跟踪高度' : "" }) get height(): number {
        return this._height;
    }

    set height(value: number) {
        this._height = value;
    }

    @property private _ollowDamping: number = 0.2;
    @property({
        tooltip: EDITOR ? '跟随阻尼系数\n数字越小相机越灵敏 越大越迟顿' : "",
        animatable: false,
        range: [0, 1],
        step: 0.1,
        slide: true
    }) get followDamping(): number {
        return this._ollowDamping;
    }

    set followDamping(value: number) {
        this._ollowDamping = value;
    }
}