import { Node, tween, Vec3 } from "cc";

export function tweenPosShake(node: Node, intensity: number = 10, duration: number = 0.5): void {
    // TODO tween ckeck

    const originalPosition = node.position.clone();
    const shakes = Math.floor(duration / 0.05); // 每次晃动的持续时间为0.05秒

    const shakeTween = tween(node);

    for (let i = 0; i < shakes; i++) {
        const offsetX = (Math.random() - 0.5) * intensity * 2;
        const offsetY = (Math.random() - 0.5) * intensity * 2;
        shakeTween.to(0.05, { position: new Vec3(offsetX, offsetY, 0) });
    }

    shakeTween.call(() => {
        node.setPosition(originalPosition); // 恢复到原始位置
    });

    shakeTween.start();
}

export function tween2DAngleShake(node: Node, angle: number = 10, duration: number = 0.5): void {
    // TODO tween ckeck

    const originalRotation = node.rotation.clone();
    const shakes = Math.floor(duration / 0.1); // 每次晃动的持续时间为0.1秒

    const shakeTween = tween(node);

    for (let i = 0; i < shakes; i++) {
        const shakeAngle = (i % 2 === 0 ? angle : -angle);
        shakeTween.to(0.1, { eulerAngles: new Vec3(0, 0, shakeAngle) });
    }

    shakeTween.call(() => {
        node.setRotation(originalRotation); // 恢复到原始角度
    });

    shakeTween.start();
}