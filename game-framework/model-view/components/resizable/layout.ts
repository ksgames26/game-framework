import { Vec2 } from "cc";
import { Enum, Layout, UITransform, Vec3, _decorator, js } from "cc";

const { ccclass, disallowMultiple } = _decorator;


Layout.HorizontalDirection["JUSTIFY_DISTRIBUTE"] = 2;
js.value(Layout.HorizontalDirection, String(2), "JUSTIFY_DISTRIBUTE");
Enum.update(Layout.HorizontalDirection);

Layout.HorizontalDirection["CENTER_TO_SIDE"] = 3;
js.value(Layout.HorizontalDirection, String(3), "CENTER_TO_SIDE");
Enum.update(Layout.HorizontalDirection);

@ccclass("LayoutPlus")
@disallowMultiple()
export class LayoutPlus extends Layout {
    protected _doLayoutHorizontally(baseWidth: number, rowBreak: boolean, fnPositionY: (...args: any[]) => number, applyChildren: boolean): number {
        if (this._horizontalDirection as number == Layout.HorizontalDirection.LEFT_TO_RIGHT || this._horizontalDirection as number == Layout.HorizontalDirection.RIGHT_TO_LEFT) {
            return super._doLayoutHorizontally(baseWidth, rowBreak, fnPositionY, applyChildren);
        }

        // JUSTIFY_DISTRIBUTE 
        if (this._horizontalDirection as number == Layout.HorizontalDirection["JUSTIFY_DISTRIBUTE"]) {
            return this._doJustifyDistributeLayout(baseWidth, rowBreak, fnPositionY, applyChildren);
        }

        // CENTER_TO_SIDE
        if (this._horizontalDirection as number == Layout.HorizontalDirection["CENTER_TO_SIDE"]) {
            return this._doCenterToSideLayout(baseWidth, rowBreak, fnPositionY, applyChildren);
        }

        return super._doLayoutHorizontally(baseWidth, rowBreak, fnPositionY, applyChildren);
    }

    _getUsedScaleValue(value: number) {
        return this.affectedByScale ? Math.abs(value) : 1;
    }

    /**
     * JUSTIFY_DISTRIBUTE 模式的优化布局方法
     * 直接计算最终位置，避免重复计算
     */
    private _doJustifyDistributeLayout(baseWidth: number, rowBreak: boolean, fnPositionY: (...args: any[]) => number, applyChildren: boolean): number {
        const trans = this.node._uiProps.uiTransformComp!;
        const layoutAnchor = trans.anchorPoint;
        const children = this._usefulLayoutObj;

        if (children.length === 0) {
            return this._getPaddingV();
        }

        // 处理子节点大小调整
        if (this._resizeMode === Layout.ResizeMode.CHILDREN) {
            const activeChildCount = children.length;
            const paddingH = this._getPaddingH();
            let newChildWidth = this._cellSize.width;

            if (this._layoutType !== Layout.Type.GRID) {
                newChildWidth = (baseWidth - paddingH - (activeChildCount - 1) * this._spacingX) / activeChildCount;
            }

            for (const childTrans of children) {
                const childScaleX = this._getUsedScaleValue(childTrans.node.scale.x);
                const childScaleY = this._getUsedScaleValue(childTrans.node.scale.y);

                childTrans.width = newChildWidth / childScaleX;
                if (this._layoutType === Layout.Type.GRID) {
                    childTrans.height = this._cellSize.height / childScaleY;
                }
            }
        }

        // 计算高度和行排列（简化版，主要为了计算容器高度）
        let totalHeight = 0;
        let rowMaxHeight = 0;
        let tempMaxHeight = 0;
        let maxHeight = 0;

        // 简单的高度计算，假设所有元素在一行（如果需要支持多行，可以扩展）
        for (const childTrans of children) {
            const childScaleY = this._getUsedScaleValue(childTrans.node.scale.y);
            const childBoundingBoxHeight = childTrans.height * childScaleY;

            if (childBoundingBoxHeight > tempMaxHeight) {
                maxHeight = Math.max(tempMaxHeight, maxHeight);
                rowMaxHeight = tempMaxHeight || childBoundingBoxHeight;
                tempMaxHeight = childBoundingBoxHeight;
            }
        }

        rowMaxHeight = Math.max(rowMaxHeight, tempMaxHeight);
        const containerResizeBoundary = Math.max(maxHeight, totalHeight + rowMaxHeight) + this._getPaddingV();

        if (applyChildren) {
            for (const childTrans of children) {
                const finalPositionY = fnPositionY(childTrans.node, childTrans, totalHeight);
                const currentPos = childTrans.node.position;
                childTrans.node.setPosition(currentPos.x, finalPositionY, currentPos.z);
            }

            this._applyCustomCenterLayout(children, baseWidth, layoutAnchor);
        }

        return containerResizeBoundary;
    }

    /**
     * 总是居中，无论一排多少个元素
     */
    private _doCenterToSideLayout(baseWidth: number, rowBreak: boolean, fnPositionY: (...args: any[]) => number, applyChildren: boolean): number {
        const trans = this.node._uiProps.uiTransformComp!;
        const layoutAnchor = trans.anchorPoint;
        const children = this._usefulLayoutObj;

        if (children.length === 0) {
            return this._getPaddingV();
        }

        // 处理子节点大小调整
        if (this._resizeMode === Layout.ResizeMode.CHILDREN) {
            const activeChildCount = children.length;
            const paddingH = this._getPaddingH();
            let newChildWidth = this._cellSize.width;

            if (this._layoutType !== Layout.Type.GRID) {
                newChildWidth = (baseWidth - paddingH - (activeChildCount - 1) * this._spacingX) / activeChildCount;
            }

            for (const childTrans of children) {
                const childScaleX = this._getUsedScaleValue(childTrans.node.scale.x);
                const childScaleY = this._getUsedScaleValue(childTrans.node.scale.y);

                childTrans.width = newChildWidth / childScaleX;
                if (this._layoutType === Layout.Type.GRID) {
                    childTrans.height = this._cellSize.height / childScaleY;
                }
            }
        }

        // 计算高度
        let totalHeight = 0;
        let rowMaxHeight = 0;
        let tempMaxHeight = 0;
        let maxHeight = 0;

        for (const childTrans of children) {
            const childScaleY = this._getUsedScaleValue(childTrans.node.scale.y);
            const childBoundingBoxHeight = childTrans.height * childScaleY;

            if (childBoundingBoxHeight > tempMaxHeight) {
                maxHeight = Math.max(tempMaxHeight, maxHeight);
                rowMaxHeight = tempMaxHeight || childBoundingBoxHeight;
                tempMaxHeight = childBoundingBoxHeight;
            }
        }

        rowMaxHeight = Math.max(rowMaxHeight, tempMaxHeight);
        const containerResizeBoundary = Math.max(maxHeight, totalHeight + rowMaxHeight) + this._getPaddingV();

        // 应用居中布局
        if (applyChildren) {
            this._applyCenterToSideLayout(children, baseWidth, layoutAnchor, fnPositionY, totalHeight);
        }

        return containerResizeBoundary;
    }

    /**
     * 计算所有元素的总宽度，然后整体居中
     */
    private _applyCenterToSideLayout(children: UITransform[], baseWidth: number, layoutAnchor: any, fnPositionY: (...args: any[]) => number, totalHeight: number) {
        if (children.length === 0) return;

        const centerX = (0.5 - layoutAnchor.x) * baseWidth;

        // 按行分组
        const rowGroups = this._groupChildrenByRow(children);

        rowGroups.forEach(rowChildren => {
            this._applyCenterToSideRowLayout(rowChildren, centerX, layoutAnchor, baseWidth, fnPositionY, totalHeight);
        });
    }

    /**
     * 对单行应用CENTER_TO_SIDE居中布局
     */
    private _applyCenterToSideRowLayout(rowChildren: UITransform[], centerX: number, layoutAnchor: any, baseWidth: number, fnPositionY: (...args: any[]) => number, totalHeight: number) {
        if (rowChildren.length === 0) return;

        // 计算整行的总宽度（包括间距）
        let totalRowWidth = 0;
        for (let i = 0; i < rowChildren.length; i++) {
            const child = rowChildren[i];
            const childScaleX = this._getUsedScaleValue(child.node.scale.x);
            totalRowWidth += child.width * childScaleX;

            // 添加间距,除了最后一个元素
            if (i < rowChildren.length - 1) {
                totalRowWidth += this._spacingX;
            }
        }

        // 计算起始位置，使整行居中
        let currentX = centerX - totalRowWidth * 0.5;

        // 逐个设置每个子元素的位置
        for (const child of rowChildren) {
            const childScaleX = this._getUsedScaleValue(child.node.scale.x);
            const anchorX = child.anchorX;
            const childBoundingBoxWidth = child.width * childScaleX;

            // 设置Y位置
            const finalPositionY = fnPositionY(child.node, child, totalHeight);

            // 计算X位置,考虑锚点
            const positionX = currentX + anchorX * childBoundingBoxWidth;

            // 设置最终位置
            child.node.setPosition(new Vec3(positionX, finalPositionY, 0));

            // 移动到下一个位置
            currentX += childBoundingBoxWidth + this._spacingX;
        }
    }

    /**
     * 应用自定义居中布局逻辑
     * 1个元素：完全居中
     * 2个元素：最左和最右
     * 3个元素：最左、居中、最右
     */
    private _applyCustomCenterLayout(children: UITransform[], baseWidth: number, layoutAnchor:  Readonly<Vec2>) {
        // 按行分组子节点
        const rowGroups = this._groupChildrenByRow(children);

        rowGroups.forEach(rowChildren => {
            this._applyRowCenterLayout(rowChildren, baseWidth, layoutAnchor);
        });
    }

    /**
     * 按行分组子节点
     */
    private _groupChildrenByRow(children: UITransform[]): UITransform[][] {
        const rows: UITransform[][] = [];
        let currentRow: UITransform[] = [];
        let lastY = Number.MIN_SAFE_INTEGER;

        for (const child of children) {
            if (!child.node.activeInHierarchy) {
                continue;
            }

            const childY = child.node.position.y;
            if (Math.abs(childY - lastY) > 1) {
                if (currentRow.length > 0) {
                    rows.push(currentRow);
                }
                currentRow = [child];
                lastY = childY;
            } else {
                currentRow.push(child);
            }
        }

        if (currentRow.length > 0) {
            rows.push(currentRow);
        }

        return rows;
    }

    /**
     * 对单行应用居中布局
     */
    private _applyRowCenterLayout(rowChildren: UITransform[], baseWidth: number, layoutAnchor: Readonly<Vec2>) {
        const count = rowChildren.length;
        if (count === 0) return;

        const centerX = (0.5 - layoutAnchor.x) * baseWidth;
        const paddingH = this._getPaddingH();
        const availableWidth = baseWidth - paddingH;

        if (count === 1) {
            // 1个元素：完全居中
            const child = rowChildren[0];
            child.node.setPosition(new Vec3(0, child.node.position.y, 0));
        } else if (count === 2) {
            // 2个元素：左边元素锚点在0点，右边元素锚点在最大长度上
            const leftChild = rowChildren[0];
            const rightChild = rowChildren[1];

            // 计算布局边界（锚点位置范围）
            const leftBoundary = this._paddingLeft + (-layoutAnchor.x) * baseWidth;
            const rightBoundary = (1 - layoutAnchor.x) * baseWidth - this._paddingRight;

            // 左边元素锚点在leftBoundary
            leftChild.node.setPosition(new Vec3(leftBoundary, leftChild.node.position.y, 0));

            // 右边元素锚点在rightBoundary
            rightChild.node.setPosition(new Vec3(rightBoundary, rightChild.node.position.y, 0));
        } else {
            // 计算布局边界（锚点位置范围）
            const leftBoundary = this._paddingLeft + (-layoutAnchor.x) * baseWidth;
            const rightBoundary = (1 - layoutAnchor.x) * baseWidth - this._paddingRight;
            const totalAvailableWidth = rightBoundary - leftBoundary;
            
            // 计算锚点间距：总可用宽度 / (元素数量 - 1)
            const anchorSpacing = totalAvailableWidth / (count - 1);
            
            // 布局所有元素
            // 第一个元素锚点在leftBoundary，最后一个元素锚点在rightBoundary
            for (let i = 0; i < count; i++) {
                const child = rowChildren[i];
                
                // 计算当前元素的锚点位置
                const anchorPositionX = leftBoundary + i * anchorSpacing;
                
                // 设置元素位置（锚点位置就是元素的实际位置）
                child.node.setPosition(new Vec3(anchorPositionX, child.node.position.y, 0));
            }
        }
    }

    /**
     * 计算一行子节点的总宽度
     */
    private _getTotalChildrenWidth(children: UITransform[]): number {
        let totalWidth = 0;
        for (const child of children) {
            const childScaleX = this._getUsedScaleValue(child.node.scale.x);
            totalWidth += child.width * childScaleX;
        }
        return totalWidth;
    }
}