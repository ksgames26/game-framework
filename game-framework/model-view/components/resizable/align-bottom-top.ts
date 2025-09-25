import { _decorator, Component, Node, UITransform } from 'cc';
const { ccclass, property, executeInEditMode } = _decorator;

/**
 * 总是把当前节点的底部靠着目标节点的顶部
 *
 * @export
 * @class AlignBottomToTop
 * @extends {Component}
 */
@ccclass('AlignBottomToTop')
@executeInEditMode
export class AlignBottomToTop extends Component {
    @property(Node)
    targetNode: Node = null!; // 目标节点

    onLoad() {
        this.updateSize();
        if (
            !this.targetNode!) {
            return;
        }

        this.targetNode!.on(Node.EventType.SIZE_CHANGED, this.updateSize, this);
        this.targetNode!.on(Node.EventType.TRANSFORM_CHANGED, this.updateSize, this);
    }

    updateSize() {
        if (!this.targetNode) return;

        const targetTransform = this.targetNode.getComponent(UITransform);
        const thisTransform = this.node.getComponent(UITransform);

        if (targetTransform && thisTransform) {
            const targetWorldPos = this.targetNode.getWorldPosition();
            const thisWorldPos = this.node.getWorldPosition();

            // 计算目标节点顶部的位置
            const targetTop = targetWorldPos.y + targetTransform.height * (1 - targetTransform.anchorY);

            // 计算当前节点底部的位置
            const thisBottom = thisWorldPos.y - thisTransform.height * thisTransform.anchorY;

            // 计算新的位置，使当前节点的底部靠着目标节点的顶部
            const offset = targetTop - thisBottom;
            this.node.setWorldPosition(thisWorldPos.x, thisWorldPos.y + offset, thisWorldPos.z);
        }
    }
}