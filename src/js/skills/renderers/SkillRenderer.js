/**
 * SkillRenderer - Static utility class for drawing all skill effects.
 * This centralizes visual code that was previously duplicated in Player.js and RemotePlayer.js.
 */
export default class SkillRenderer {
    static isReducedEffectsMode() {
        return !!window.game?.useReducedEffects;
    }

    static withAlpha(color, alpha = 1) {
        const normalizedAlpha = Math.max(0, Math.min(1, alpha));
        if (!color) return `rgba(255,255,255,${normalizedAlpha})`;
        if (color.startsWith('rgba(') || color.startsWith('rgb(')) return color;

        const hex = color.startsWith('#') ? color.slice(1) : color;
        if (![3, 6].includes(hex.length)) return color;

        const fullHex = hex.length === 3
            ? hex.split('').map((ch) => ch + ch).join('')
            : hex;

        const r = parseInt(fullHex.slice(0, 2), 16);
        const g = parseInt(fullHex.slice(2, 4), 16);
        const b = parseInt(fullHex.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
    }

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
        if (this.isReducedEffectsMode()) {
            ctx.translate(sx, sy);
            ctx.scale(1, yScale);
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.75;
            ctx.beginPath();
            ctx.arc(0, 0, radiusOuter, 0, Math.PI * 2);
            ctx.stroke();
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(0, 0, radiusInner, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            return;
        }

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

        if (this.isReducedEffectsMode()) {
            ctx.fillStyle = color2;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = color3;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
            return;
        }

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
    static drawFireball(ctx, x, y, radius, angle, trail = [], options = {}) {
        const variant = options.variant || 'fireball';
        const palette = variant === 'blue_fireball'
            ? {
                trailCore: 'rgba(170, 240, 255, 0.4)',
                trailMid: 'rgba(79, 195, 247, 0.32)',
                trailOuter: 'rgba(15, 118, 255, 0)',
                outerGlowInner: 'rgba(91, 192, 255, 0.82)',
                outerGlowOuter: 'rgba(0, 82, 212, 0)',
                main0: '#ffffff',
                main1: '#d7f3ff',
                main2: '#6dd3ff',
                main3: '#2563eb',
                shadow: '#2563eb',
                flicker: '#dff7ff',
                indicatorStroke: 'rgba(76, 183, 255, 0.4)',
                indicatorFill: 'rgba(76, 183, 255, 0.12)'
            }
            : {
                trailCore: 'rgba(255, 255, 255, 0.4)',
                trailMid: 'rgba(255, 165, 0, 0.3)',
                trailOuter: 'rgba(255, 69, 0, 0)',
                outerGlowInner: 'rgba(255, 69, 0, 0.8)',
                outerGlowOuter: 'rgba(255, 0, 0, 0)',
                main0: '#ffffff',
                main1: '#fff200',
                main2: '#f39c12',
                main3: '#e67e22',
                shadow: '#e67e22',
                flicker: '#ffffff',
                indicatorStroke: 'rgba(249, 115, 22, 0.4)',
                indicatorFill: 'rgba(249, 115, 22, 0.1)'
            };

        ctx.save();

        if (this.isReducedEffectsMode()) {
            const sampledTrail = trail.slice(0, 4);
            sampledTrail.forEach((p, i) => {
                const alpha = 0.2 + ((sampledTrail.length - i) / Math.max(1, sampledTrail.length)) * 0.2;
                ctx.fillStyle = variant === 'blue_fireball'
                    ? `rgba(76, 183, 255, ${alpha})`
                    : `rgba(255, 140, 0, ${alpha})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, radius * 0.45, 0, Math.PI * 2);
                ctx.fill();
            });

            ctx.fillStyle = variant === 'blue_fireball' ? 'rgba(58, 131, 255, 0.25)' : 'rgba(255, 90, 0, 0.25)';
            ctx.beginPath();
            ctx.arc(x, y, radius * 1.2, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = variant === 'blue_fireball' ? '#e0f2fe' : '#ffedd5';
            ctx.beginPath();
            ctx.arc(x, y, radius * 0.45, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = variant === 'blue_fireball' ? '#38bdf8' : '#f97316';
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
            return;
        }

        // 1. Trail (Dynamic Flame)
        trail.forEach((p, i) => {
            const ratio = 1 - (i / trail.length);
            const pRadius = radius * (0.4 + ratio * 0.6);

            const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, pRadius);
            grad.addColorStop(0, palette.trailCore);
            grad.addColorStop(0.3, palette.trailMid);
            grad.addColorStop(1, palette.trailOuter);

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, pRadius, 0, Math.PI * 2);
            ctx.fill();
        });

        // 2. Outer Glow (Corona)
        const outerGrad = ctx.createRadialGradient(x, y, radius * 0.5, x, y, radius * 1.5);
        outerGrad.addColorStop(0, palette.outerGlowInner);
        outerGrad.addColorStop(1, palette.outerGlowOuter);

        ctx.fillStyle = outerGrad;
        ctx.beginPath();
        ctx.arc(x, y, radius * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // 3. Main Orb
        const mainGrad = ctx.createRadialGradient(x, y, 0, x, y, radius);
        mainGrad.addColorStop(0, palette.main0);
        mainGrad.addColorStop(0.2, palette.main1);
        mainGrad.addColorStop(0.5, palette.main2);
        mainGrad.addColorStop(1, palette.main3);

        ctx.shadowBlur = 20;
        ctx.shadowColor = palette.shadow;
        ctx.fillStyle = mainGrad;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        // 4. Inner Detail (Flicker)
        const flicker = Math.sin(Date.now() * 0.02) * (radius * 0.1);
        ctx.strokeStyle = palette.flicker;
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
    static drawExplosion(ctx, x, y, radius, progress, options = {}) {
        ctx.save();
        const alpha = 1 - progress;
        const currentRad = radius * (0.5 + progress * 0.5);
        const variant = options.variant || 'default';
        const palette = variant === 'blue_flame'
            ? {
                core: [235, 248, 255],
                mid: [88, 187, 255],
                outer: [18, 82, 196],
                ember: '#93c5fd'
            }
            : {
                core: [255, 255, 255],
                mid: [255, 165, 0],
                outer: [255, 69, 0],
                ember: '#ff4757'
            };

        if (this.isReducedEffectsMode()) {
            ctx.fillStyle = `rgba(${palette.mid[0]}, ${palette.mid[1]}, ${palette.mid[2]}, ${alpha * 0.45})`;
            ctx.beginPath();
            ctx.arc(x, y, currentRad, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = `rgba(${palette.core[0]}, ${palette.core[1]}, ${palette.core[2]}, ${alpha * 0.8})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y, currentRad * 0.8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            return;
        }

        // Radial Shockwave
        const grad = ctx.createRadialGradient(x, y, 0, x, y, currentRad);
        grad.addColorStop(0, `rgba(${palette.core[0]}, ${palette.core[1]}, ${palette.core[2]}, ${alpha})`);
        grad.addColorStop(0.4, `rgba(${palette.mid[0]}, ${palette.mid[1]}, ${palette.mid[2]}, ${alpha * 0.8})`);
        grad.addColorStop(1, `rgba(${palette.outer[0]}, ${palette.outer[1]}, ${palette.outer[2]}, 0)`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, currentRad, 0, Math.PI * 2);
        ctx.fill();

        // Debris / Embers
        ctx.fillStyle = palette.ember;
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
    static drawLightning(ctx, x1, y1, x2, y2, intensity = 1, options = {}) {
        ctx.save();
        const reducedEffects = this.isReducedEffectsMode();
        const variant = options.variant || 'default';
        const palette = variant === 'crimson_chain'
            ? {
                glow: '#ff5d66',
                main: '#ff6b81',
                core: '#fff5f5',
                sideA: '#ff8fa3',
                sideB: '#ffd1d8'
            }
            : variant === 'golden_missile'
                ? {
                    glow: '#f5cf5b',
                    main: '#f8d46a',
                    core: '#fff8d6',
                    sideA: '#ffe08a',
                    sideB: '#fff3bf'
                }
                : {
                    glow: '#00d2ff',
                    main: '#48dbfb',
                    core: '#ffffff',
                    sideA: '#00d2ff',
                    sideB: '#74b9ff'
                };

        const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        const segments = Math.max(reducedEffects ? 2 : 3, Math.floor(dist / (reducedEffects ? 28 : 15)));
        const spread = (reducedEffects ? 6 : 12) * intensity;

        // Path generator for organic lightning
        const getJaggedPoints = (startX, startY, endX, endY, segs, spr) => {
            const pts = [{ x: startX, y: startY }];
            const angle = Math.atan2(endY - startY, endX - startX);
            const perpAngle = angle + Math.PI / 2;
            for (let i = 1; i < segs; i++) {
                const ratio = i / segs;
                const px = startX + (endX - startX) * ratio;
                const py = startY + (endY - startY) * ratio;
                const offset = reducedEffects
                    ? Math.sin((i + 1) * 12.9898 + startX * 0.01 + endY * 0.01) * spr
                    : (Math.random() - 0.5) * spr * 2;
                pts.push({
                    x: px + Math.cos(perpAngle) * offset,
                    y: py + Math.sin(perpAngle) * offset
                });
            }
            pts.push({ x: endX, y: endY });
            return pts;
        };

        const drawPath = (points) => {
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
        };

        const mainPoints = getJaggedPoints(x1, y1, x2, y2, segments, spread);

        if (reducedEffects) {
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = palette.main;
            ctx.lineWidth = 4 * intensity;
            drawPath(mainPoints);
            ctx.stroke();

            ctx.strokeStyle = palette.core;
            ctx.lineWidth = 1.5 * intensity;
            drawPath(mainPoints);
            ctx.stroke();
            ctx.restore();
            return;
        }

        // 1. Layer 1: Distant Glow (Atmospheric)
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowBlur = 25 * intensity;
        ctx.shadowColor = palette.glow;
        ctx.strokeStyle = `${palette.main}33`;
        ctx.lineWidth = 10 * intensity;
        drawPath(mainPoints);
        ctx.stroke();

        // 2. Layer 2: Main High-Voltage Trunk (Cyan)
        ctx.shadowBlur = 10 * intensity;
        ctx.strokeStyle = palette.main;
        ctx.lineWidth = 4.5 * intensity;
        drawPath(mainPoints);
        ctx.stroke();

        // 3. Layer 3: Ultra-bright Core (Pure White)
        ctx.shadowBlur = 0;
        ctx.strokeStyle = palette.core;
        ctx.lineWidth = 1.8 * intensity;
        drawPath(mainPoints);
        ctx.stroke();

        // 4. Side Arcs (Minor jittery bolts)
        ctx.globalAlpha = 0.6;
        for (let s = 0; s < 2; s++) {
            const subPoints = getJaggedPoints(x1, y1, x2, y2, segments, spread * 1.8);
            ctx.strokeStyle = s === 0 ? palette.sideA : palette.sideB;
            ctx.lineWidth = 0.8 * intensity;
            drawPath(subPoints);
            ctx.stroke();
        }

        ctx.restore();
    }

    static drawEquipmentAura(ctx, x, y, auraState) {
        if (!auraState) return;

        const intensityMap = {
            soft: { radius: 34, alpha: 0.22, core: 0.1, ring: 0.24 },
            strong: { radius: 40, alpha: 0.32, core: 0.14, ring: 0.32 },
            stronger: { radius: 45, alpha: 0.4, core: 0.18, ring: 0.4 },
            epic: { radius: 50, alpha: 0.48, core: 0.22, ring: 0.48 },
            ascended: { radius: 56, alpha: 0.58, core: 0.3, ring: 0.58 }
        };
        const profile = intensityMap[auraState.intensity] || intensityMap.soft;
        const time = Date.now() / 220;
        const pulse = Math.sin(time) * 2.5;
        const radius = profile.radius + pulse;
        const bodyY = y - 2;
        const groundY = y + 20;

        ctx.save();

        if (this.isReducedEffectsMode()) {
            ctx.fillStyle = auraState.whiteCore
                ? 'rgba(255,255,255,0.24)'
                : this.withAlpha(auraState.baseColor, profile.alpha * 0.7);
            ctx.beginPath();
            ctx.ellipse(x, groundY, radius * 0.92, radius * 0.34, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = this.withAlpha(auraState.secondaryColor, profile.ring);
            ctx.lineWidth = auraState.spark ? 2.4 : 1.8;
            ctx.beginPath();
            ctx.arc(x, bodyY, radius * 0.72, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            return;
        }

        const outer = ctx.createRadialGradient(x, bodyY, radius * 0.16, x, bodyY, radius);
        outer.addColorStop(0, auraState.whiteCore ? 'rgba(255,255,255,0.3)' : this.withAlpha(auraState.secondaryColor, 0.24));
        outer.addColorStop(0.55, this.withAlpha(auraState.baseColor, profile.alpha));
        outer.addColorStop(1, this.withAlpha(auraState.baseColor, 0));

        ctx.fillStyle = outer;
        ctx.beginPath();
        ctx.arc(x, bodyY, radius, 0, Math.PI * 2);
        ctx.fill();

        const floorGlow = ctx.createRadialGradient(x, groundY, radius * 0.1, x, groundY, radius * 1.05);
        floorGlow.addColorStop(0, this.withAlpha(auraState.secondaryColor, profile.alpha * 0.42));
        floorGlow.addColorStop(0.7, this.withAlpha(auraState.baseColor, profile.alpha * 0.18));
        floorGlow.addColorStop(1, this.withAlpha(auraState.baseColor, 0));
        ctx.fillStyle = floorGlow;
        ctx.beginPath();
        ctx.ellipse(x, groundY, radius * 0.98, radius * 0.34, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = this.withAlpha(auraState.secondaryColor, profile.ring);
        ctx.lineWidth = auraState.spark ? 2.7 : 1.9;
        ctx.beginPath();
        ctx.arc(x, bodyY, radius * 0.78, 0, Math.PI * 2);
        ctx.stroke();

        if (auraState.whiteCore) {
            ctx.fillStyle = `rgba(255,255,255,${profile.core})`;
            ctx.beginPath();
            ctx.arc(x, bodyY - 4, radius * 0.48, 0, Math.PI * 2);
            ctx.fill();
        }

        if (auraState.spark) {
            for (let i = 0; i < 4; i++) {
                const angle = (Math.PI * 2 * i) / 4 + (Date.now() / 500);
                const px = x + Math.cos(angle) * (radius * 0.88);
                const py = bodyY + Math.sin(angle) * (radius * 0.58);
                ctx.strokeStyle = this.withAlpha(auraState.baseColor, 0.95);
                ctx.lineWidth = 1.4;
                ctx.beginPath();
                ctx.moveTo(px - 5, py);
                ctx.lineTo(px + 5, py);
                ctx.moveTo(px, py - 5);
                ctx.lineTo(px, py + 5);
                ctx.stroke();
            }
        }

        if (auraState.glitter) {
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI * 2 * i) / 6 + (Date.now() / 800);
                const px = x + Math.cos(angle) * (radius * 1.08);
                const py = bodyY + Math.sin(angle) * (radius * 0.78);
                ctx.fillStyle = auraState.whiteCore ? '#ffffff' : auraState.secondaryColor;
                ctx.beginPath();
                ctx.arc(px, py, 1.8, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    }

    /**
     * Target Lock-on Marker (v0.00.21)
     */
    static drawTargetMarker(ctx, x, y, width, height) {
        ctx.save();
        const time = Date.now() / 300;
        const pulse = Math.sin(Date.now() / 200) * 0.1;
        const radius = (Math.max(width, height) / 2) * (1.2 + pulse);
        const yScale = 0.5;

        ctx.translate(x, y);

        // 1. Bottom Glow Circle
        ctx.beginPath();
        ctx.ellipse(0, 0, radius, radius * yScale, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 71, 87, 0.1)';
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 71, 87, 0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 5]);
        ctx.lineDashOffset = -time * 10;
        ctx.stroke();

        // 2. Corner Brackets (Rotating)
        ctx.rotate(time * 0.5);
        ctx.setLineDash([]);
        ctx.lineWidth = 3;
        const bracketSize = radius * 0.4;

        for (let i = 0; i < 4; i++) {
            ctx.rotate(Math.PI / 2);
            ctx.beginPath();
            ctx.moveTo(radius - bracketSize, -radius * yScale);
            ctx.lineTo(radius, -radius * yScale);
            ctx.lineTo(radius, -radius * yScale + bracketSize);
            ctx.stroke();
        }

        ctx.restore();
    }
}
