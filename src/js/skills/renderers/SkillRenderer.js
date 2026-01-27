/**
 * SkillRenderer - Static utility class for drawing all skill effects.
 * This centralizes visual code that was previously duplicated in Player.js and RemotePlayer.js.
 */
export default class SkillRenderer {

    /**
     * High-quality Magic Circle (Used for Channeling and Shield)
     */
    static drawMagicCircle(ctx, sx, sy, options = {}) {
        const {
            radiusInner = 60,
            radiusOuter = 75,
            color = 'rgba(72, 219, 251, 0.7)',
            glowColor = '#00d2ff',
            yScale = 0.45,
            rotationSpeed = 0.002
        } = options;

        ctx.save();
        const time = Date.now() * rotationSpeed;
        const timeSeed = Math.floor(Date.now() / 100);

        ctx.translate(sx, sy);

        const addLightningPath = (x1, y1, x2, y2, segments = 3, spread = 8) => {
            ctx.moveTo(x1, y1);
            for (let i = 1; i < segments; i++) {
                const ratio = i / segments;
                const px = x1 + (x2 - x1) * ratio;
                const py = y1 + (y2 - y1) * ratio;
                const seed = timeSeed + i + x1 + y1;
                const offset = (Math.sin(seed * 999) * spread);
                const angle = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2;
                ctx.lineTo(px + Math.cos(angle) * offset, py + Math.sin(angle) * offset);
            }
            ctx.lineTo(x2, y2);
        };

        ctx.shadowBlur = 15;
        ctx.shadowColor = glowColor;
        ctx.strokeStyle = color;

        const radiusRim = radiusOuter * 1.08;
        const circleSegments = 16;
        [radiusRim, radiusOuter, radiusInner].forEach((r, idx) => {
            ctx.lineWidth = idx === 0 ? 1 : (idx === 1 ? 2 : 1.5);
            ctx.beginPath();
            for (let i = 0; i < circleSegments; i++) {
                const a1 = (i / circleSegments) * Math.PI * 2;
                const a2 = ((i + 1) / circleSegments) * Math.PI * 2;
                const x1 = Math.cos(a1) * r;
                const y1 = Math.sin(a1) * r * yScale;
                const x2 = Math.cos(a2) * r;
                const y2 = Math.sin(a2) * r * yScale;
                addLightningPath(x1, y1, x2, y2, 2, 4);
            }
            ctx.stroke();
        });

        // Hexagons
        const hexRotation = time * 0.45;
        ctx.lineWidth = 2.5;
        const triangles = [[0, 2, 4], [1, 3, 5]];
        for (let tIndex = 0; tIndex < 2; tIndex++) {
            const points = [];
            for (let j = 0; j < 3; j++) {
                const vertexIndex = triangles[tIndex][j];
                const hexAngle = (vertexIndex * (Math.PI * 2) / 6) + hexRotation - (Math.PI / 2);
                points.push({
                    x: Math.cos(hexAngle) * radiusInner,
                    y: Math.sin(hexAngle) * radiusInner * yScale
                });
            }
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            ctx.lineTo(points[1].x, points[1].y);
            ctx.lineTo(points[2].x, points[2].y);
            ctx.closePath();
            ctx.stroke();
        }

        // Runes
        const runeRotation = -time * 0.3;
        ctx.strokeStyle = 'rgba(150, 240, 255, 0.7)';
        ctx.lineWidth = 1.5;
        const runeCount = 12;
        const runeRadius = 67.5;

        const drawRunePoly = (cx, cy, rotationAngle, localPoints) => {
            ctx.beginPath();
            let first = true;
            localPoints.forEach(pt => {
                const rx = pt.x * Math.cos(rotationAngle) - pt.y * Math.sin(rotationAngle);
                const ry = pt.x * Math.sin(rotationAngle) + pt.y * Math.cos(rotationAngle);
                const finalX = cx + rx;
                const finalY = cy + (ry * yScale);
                if (first) { ctx.moveTo(finalX, finalY); first = false; }
                else { ctx.lineTo(finalX, finalY); }
            });
            ctx.stroke();
        };

        for (let i = 0; i < runeCount; i++) {
            const angle = (i / runeCount) * Math.PI * 2 + runeRotation;
            const cx = Math.cos(angle) * runeRadius;
            const cy = Math.sin(angle) * runeRadius * yScale;
            const facing = angle + Math.PI / 2;

            if (i % 4 === 0) {
                drawRunePoly(cx, cy, facing, [{ x: -3, y: -5 }, { x: 0, y: 0 }, { x: 3, y: -5 }]);
                drawRunePoly(cx, cy, facing, [{ x: 0, y: 0 }, { x: 0, y: 5 }]);
            } else if (i % 4 === 1) {
                drawRunePoly(cx, cy, facing, [{ x: -3, y: -4 }, { x: 3, y: -4 }, { x: -3, y: 4 }, { x: 3, y: 4 }]);
                drawRunePoly(cx, cy, facing, [{ x: 0, y: -4 }, { x: 0, y: 4 }]);
            } else if (i % 4 === 2) {
                drawRunePoly(cx, cy, facing, [{ x: 0, y: -5 }, { x: 3, y: 0 }, { x: 0, y: 5 }, { x: -3, y: 0 }, { x: 0, y: -5 }]);
            } else {
                drawRunePoly(cx, cy, facing, [{ x: -2, y: -5 }, { x: -2, y: 5 }]);
                drawRunePoly(cx, cy, facing, [{ x: 2, y: -5 }, { x: 2, y: 5 }]);
                drawRunePoly(cx, cy, facing, [{ x: -4, y: 0 }, { x: 4, y: 0 }]);
            }
        }
        ctx.restore();
    }

    /**
     * Absolute Barrier (Shield) Effect
     */
    static drawShield(ctx, x, y, options = {}) {
        const {
            baseRadius = 55,
            color1 = 'rgba(0, 210, 255, 0.05)',
            color2 = 'rgba(0, 210, 255, 0.2)',
            color3 = 'rgba(120, 255, 255, 0.6)',
            glowColor = 'rgba(0, 210, 255, 0.3)'
        } = options;

        ctx.save();
        const pulse = Math.sin(Date.now() / 200) * 0.15;
        const radius = baseRadius + pulse * 10;

        // 1. Outer Glow
        ctx.beginPath();
        ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 10;
        ctx.stroke();

        // 2. Shield Shell
        const grad = ctx.createRadialGradient(x, y, radius * 0.3, x, y, radius);
        grad.addColorStop(0, color1);
        grad.addColorStop(0.8, color2);
        grad.addColorStop(1, color3);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        // 3. Rim Highlight
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 5]);
        ctx.lineDashOffset = -Date.now() / 50;
        ctx.stroke();

        ctx.restore();
    }

    /**
     * High-quality Fireball Rendering
     * @param {CanvasRenderingContext2D} ctx 
     * @param {number} x 
     * @param {number} y 
     * @param {number} radius 
     * @param {number} angle 
     * @param {Array} trail 
     */
    static drawFireball(ctx, x, y, radius, angle, trail = []) {
        ctx.save();

        // 1. Trail (Dynamic Flame)
        trail.forEach((p, i) => {
            const ratio = 1 - (i / trail.length);
            const pRadius = radius * (0.4 + ratio * 0.6);

            const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, pRadius);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
            grad.addColorStop(0.3, 'rgba(255, 165, 0, 0.3)');
            grad.addColorStop(1, 'rgba(255, 69, 0, 0)');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, pRadius, 0, Math.PI * 2);
            ctx.fill();
        });

        // 2. Outer Glow (Corona)
        const outerGrad = ctx.createRadialGradient(x, y, radius * 0.5, x, y, radius * 1.5);
        outerGrad.addColorStop(0, 'rgba(255, 69, 0, 0.8)');
        outerGrad.addColorStop(1, 'rgba(255, 0, 0, 0)');

        ctx.fillStyle = outerGrad;
        ctx.beginPath();
        ctx.arc(x, y, radius * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // 3. Main Orb
        const mainGrad = ctx.createRadialGradient(x, y, 0, x, y, radius);
        mainGrad.addColorStop(0, '#ffffff'); // White hot core
        mainGrad.addColorStop(0.2, '#fff200'); // Yellow
        mainGrad.addColorStop(0.5, '#f39c12'); // Orange
        mainGrad.addColorStop(1, '#e67e22'); // Dark Orange

        ctx.shadowBlur = 20;
        ctx.shadowColor = '#e67e22';
        ctx.fillStyle = mainGrad;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        // 4. Inner Detail (Flicker)
        const flicker = Math.sin(Date.now() * 0.02) * (radius * 0.1);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, radius * 0.05);
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.7 + flicker, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }

    /**
     * Fireball Explosion Effect
     */
    static drawExplosion(ctx, x, y, radius, progress) {
        ctx.save();
        const alpha = 1 - progress;
        const currentRad = radius * (0.5 + progress * 0.5);

        // Radial Shockwave
        const grad = ctx.createRadialGradient(x, y, 0, x, y, currentRad);
        grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
        grad.addColorStop(0.4, `rgba(255, 165, 0, ${alpha * 0.8})`);
        grad.addColorStop(1, `rgba(255, 69, 0, 0)`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, currentRad, 0, Math.PI * 2);
        ctx.fill();

        // Debris / Embers
        ctx.fillStyle = '#ff4757';
        for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2 + progress * 2;
            const dist = currentRad * 0.8;
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc(x + Math.cos(ang) * dist, y + Math.sin(ang) * dist, 2 + Math.random() * 3, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    /**
     * High-quality Lightning Rendering
     */
    static drawLightning(ctx, x1, y1, x2, y2, intensity = 1) {
        ctx.save();

        const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        const segments = Math.max(2, Math.floor(dist / 20)); // Segment every 20px
        const spread = 8 * intensity;

        ctx.beginPath();
        ctx.moveTo(x1, y1);

        for (let i = 1; i < segments; i++) {
            const ratio = i / segments;
            const px = x1 + (x2 - x1) * ratio;
            const py = y1 + (y2 - y1) * ratio;

            // Random jitter perpendicular to the path
            const angle = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2;
            const offset = (Math.random() - 0.5) * spread * 2;

            ctx.lineTo(px + Math.cos(angle) * offset, py + Math.sin(angle) * offset);
        }

        ctx.lineTo(x2, y2);

        // Styling
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Outer Glow
        ctx.strokeStyle = '#48dbfb';
        ctx.lineWidth = 3 * intensity;
        ctx.shadowBlur = 10 * intensity;
        ctx.shadowColor = '#00d2ff';
        ctx.stroke();

        // Inner Sharp Core
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1 * intensity;
        ctx.shadowBlur = 0;
        ctx.stroke();

        ctx.restore();
    }
}
