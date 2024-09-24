import { _decorator, Component, Node, UITransform, Vec2 } from 'cc';
const { ccclass, executeInEditMode } = _decorator;

@ccclass('ResizeToFitChildren')
@executeInEditMode
export class ResizeToFitChildren extends Component {

    public onLoad() {
        this.node.children.forEach(child => {
            child.on(Node.EventType.SIZE_CHANGED, this.resizeToFitChildren, this);
        });
    }

    private resizeToFitChildren() {
        const uiTransform = this.node.getComponent(UITransform);
        if (!uiTransform) return;

        let minX = Number.MAX_VALUE, minY = Number.MAX_VALUE;
        let maxX = Number.MIN_VALUE, maxY = Number.MIN_VALUE;

        this.node.children.forEach(child => {
            const childTransform = child.getComponent(UITransform);
            if (childTransform) {
                const childPos = child.getPosition();
                const childSize = new Vec2(childTransform.width, childTransform.height);

                const left = childPos.x - childSize.x * childTransform.anchorX;
                const right = childPos.x + childSize.x * (1 - childTransform.anchorX);
                const bottom = childPos.y - childSize.y * childTransform.anchorY;
                const top = childPos.y + childSize.y * (1 - childTransform.anchorY);

                if (left < minX) minX = left;
                if (right > maxX) maxX = right;
                if (bottom < minY) minY = bottom;
                if (top > maxY) maxY = top;
            }
        });

        const newWidth = maxX - minX;
        const newHeight = maxY - minY;

        uiTransform.setContentSize(newWidth, newHeight);
    }
}