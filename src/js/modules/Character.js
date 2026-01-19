export class Character {
    constructor(ctx, x, y) {
        this.ctx = ctx;
        this.x = x;
        this.y = y;
        this.speed = 4;
        this.width = 64;
        this.height = 64;

        this.image = new Image();
        this.processedImage = null;
        this.image.onload = () => {
            this.processImage();
        };
        this.image.src = 'assets/character.png';

        this.state = 'idle'; // idle, walking, attack
        this.direction = 0; // 0: Down, 1: DL, 2: L, 3: UL, 4: U, 5: UR, 6: R, 7: DR

        this.frame = 0;
        this.frameCounter = 0;
        this.frameSpeed = 10;

        this.isAttacking = false;
        this.attackDuration = 20;
        this.attackTimer = 0;

        this.effects = [];
    }

    processImage() {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = this.image.width;
        tempCanvas.height = this.image.height;
        tempCtx.drawImage(this.image, 0, 0);

        const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imageData.data;

        // 초록색 배경 제거 (#00FF00 근처 색상)
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // 크로마키: 초록색이 지배적인 픽셀을 투명하게 설정
            if (g > 140 && r < 120 && b < 120) {
                data[i + 3] = 0;
            }
        }
        tempCtx.putImageData(imageData, 0, 0);
        this.processedImage = tempCanvas;
    }

    update(moveVector, targetPos) {
        if (this.isAttacking) {
            this.attackTimer--;
            if (this.attackTimer <= 0) {
                this.isAttacking = false;
                this.state = 'idle';
            }
            this.frame = Math.floor((this.attackDuration - this.attackTimer) / (this.attackDuration / 4)) % 4;
            return;
        }

        let moved = false;
        if (moveVector.x !== 0 || moveVector.y !== 0) {
            // 대각선 이동 속도 보정
            const s = (moveVector.x !== 0 && moveVector.y !== 0) ? this.speed * 0.707 : this.speed;
            this.x += moveVector.x * s;
            this.y += moveVector.y * s;
            this.updateDirection(moveVector.x, moveVector.y);
            this.state = 'walking';
            moved = true;
        } else if (targetPos) {
            const dx = targetPos.x - this.x;
            const dy = targetPos.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 5) {
                const vx = (dx / dist) * this.speed;
                const vy = (dy / dist) * this.speed;
                this.x += vx;
                this.y += vy;
                this.updateDirection(vx, vy);
                this.state = 'walking';
                moved = true;
            } else {
                this.state = 'idle';
            }
        } else {
            this.state = 'idle';
        }

        if (moved) {
            this.frameCounter++;
            if (this.frameCounter >= this.frameSpeed) {
                this.frame = (this.frame + 1) % 4;
                this.frameCounter = 0;
            }
        } else {
            this.frame = 0;
        }

        this.x = Math.max(0, Math.min(2000, this.x));
        this.y = Math.max(0, Math.min(2000, this.y));

        this.effects = this.effects.filter(ef => --ef.life > 0);
    }

    updateDirection(vx, vy) {
        const angle = Math.atan2(vy, vx) * (180 / Math.PI);
        if (angle >= 67.5 && angle < 112.5) this.direction = 0;
        else if (angle >= 112.5 && angle < 157.5) this.direction = 1;
        else if (angle >= 157.5 || angle < -157.5) this.direction = 2;
        else if (angle >= -157.5 && angle < -112.5) this.direction = 3;
        else if (angle >= -112.5 && angle < -67.5) this.direction = 4;
        else if (angle >= -67.5 && angle < -22.5) this.direction = 5;
        else if (angle >= -22.5 && angle < 22.5) this.direction = 6;
        else if (angle >= 22.5 && angle < 67.5) this.direction = 7;
    }

    attack(type) {
        if (this.isAttacking) return;
        this.isAttacking = true;
        this.state = 'attack';
        this.attackTimer = this.attackDuration;
        this.frame = 0;

        const colors = { 'j': '#fff4ba', 'h': '#a1c4fd', 'u': '#ff9a9e', 'i': '#c2e9fb' };
        this.effects.push({
            type: type, x: this.x, y: this.y, life: 30, color: colors[type] || '#fff'
        });
    }

    draw(camera) {
        const imgToDraw = this.processedImage || (this.image.complete ? this.image : null);
        if (!imgToDraw) return;

        const screenX = this.x - camera.x - this.width / 2;
        const screenY = this.y - camera.y - this.height / 2;

        const cols = 6; // 시트의 실제 열 개수
        const rows = 5; // 시트의 실제 행 개수
        const sw = this.image.width / cols;
        const sh = this.image.height / rows;

        // 시트 구성에 맞는 방향 매핑 (0: 아래, 1: 위, 2: 왼쪽, 3: 오른쪽)
        let spriteCol = 0;
        switch (this.direction) {
            case 0: spriteCol = 0; break; // 아래
            case 4: spriteCol = 1; break; // 위
            case 1: case 2: case 3: spriteCol = 2; break; // 왼쪽 계열
            case 5: case 6: case 7: spriteCol = 3; break; // 오른쪽 계열
        }

        let spriteRow = 0;
        if (this.state === 'idle') spriteRow = 0;
        else if (this.state === 'walking') spriteRow = 2; // 세 번째 행이 걷기 애니메이션
        else if (this.state === 'attack') spriteRow = 3;

        this.ctx.drawImage(
            imgToDraw,
            spriteCol * sw, spriteRow * sh, sw, sh,
            screenX, screenY, this.width, this.height
        );

        this.effects.forEach(ef => {
            this.ctx.beginPath();
            this.ctx.arc(ef.x - camera.x, ef.y - camera.y, (30 - ef.life) * 2, 0, Math.PI * 2);
            this.ctx.fillStyle = ef.color;
            this.ctx.globalAlpha = ef.life / 30;
            this.ctx.fill();
            this.ctx.globalAlpha = 1.0;
        });
    }
}
