(function () {
    const overlay = document.getElementById('meltemPopup');
    if (!overlay) return;

    const confettiLayer = document.getElementById('meltemConfetti');
    const floatersLayer = document.getElementById('meltemFloaters');
    const closeBtn = document.getElementById('meltemClose');

    const confettiEmojis = ['🌹', '❤️', '💖', '💕', '💗', '🌸', '✨', '🎉', '🎊', '💐', '🌷'];
    const floaterEmojis = ['🌹', '❤️', '💖', '🌸', '💐', '🌷', '✨'];

    function spawnConfetti(count) {
        const frag = document.createDocumentFragment();
        for (let i = 0; i < count; i++) {
            const piece = document.createElement('span');
            piece.className = 'meltem-confetti-piece';
            piece.textContent = confettiEmojis[Math.floor(Math.random() * confettiEmojis.length)];
            piece.style.left = Math.random() * 100 + '%';
            piece.style.animationDelay = (Math.random() * 2).toFixed(2) + 's';
            piece.style.animationDuration = (3 + Math.random() * 3).toFixed(2) + 's';
            piece.style.fontSize = (14 + Math.random() * 20).toFixed(0) + 'px';
            piece.style.setProperty('--drift', (Math.random() * 200 - 100).toFixed(0) + 'px');
            piece.style.setProperty('--spin', (Math.random() * 720 - 360).toFixed(0) + 'deg');
            frag.appendChild(piece);
        }
        confettiLayer.appendChild(frag);
    }

    function spawnFloaters(count) {
        const frag = document.createDocumentFragment();
        for (let i = 0; i < count; i++) {
            const f = document.createElement('span');
            f.className = 'meltem-floater';
            f.textContent = floaterEmojis[Math.floor(Math.random() * floaterEmojis.length)];
            f.style.left = Math.random() * 100 + '%';
            f.style.animationDelay = (Math.random() * 4).toFixed(2) + 's';
            f.style.animationDuration = (6 + Math.random() * 5).toFixed(2) + 's';
            f.style.fontSize = (18 + Math.random() * 22).toFixed(0) + 'px';
            frag.appendChild(f);
        }
        floatersLayer.appendChild(frag);
    }

    function open() {
        overlay.classList.add('is-open');
        document.body.style.overflow = 'hidden';
        spawnConfetti(80);
        spawnFloaters(18);
        setTimeout(() => spawnConfetti(40), 1500);
    }

    function close() {
        overlay.classList.remove('is-open');
        overlay.classList.add('is-closing');
        document.body.style.overflow = '';
        setTimeout(() => {
            overlay.classList.remove('is-closing');
            confettiLayer.innerHTML = '';
            floatersLayer.innerHTML = '';
        }, 400);
    }

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('is-open')) close();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', open);
    } else {
        open();
    }
})();
