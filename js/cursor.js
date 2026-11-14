document.addEventListener('DOMContentLoaded', () => {
    // phones and tablets have no mouse: keep their normal behaviour
    if (window.matchMedia('(hover: none), (pointer: coarse)').matches) return;

    const css = `
        body, html { cursor: none !important; }
        a, button, input, textarea, label, [role="button"], .btn, .button { cursor: none !important; }

        #my-custom-cursor {
            position: fixed;
            top: 0; left: 0;
            z-index: 999999;
            pointer-events: none;
            border-radius: 50%;
            display: flex;
            justify-content: center;
            align-items: center;
            transform: translate3d(-50%, -50%, 0);
            transition: width 0.2s ease, height 0.2s ease, background-color 0.2s, border 0.2s, opacity 0.2s;
            opacity: 0;
            width: 45px;
            height: 45px;
            background-color: rgba(255, 190, 111, 0.2);
            border: 1px solid #ffbe6f;
        }

        #my-custom-cursor.visible { opacity: 1; }

        #my-cursor-dot {
            border-radius: 50%;
            transition: all 0.2s;
            width: 6px;
            height: 6px;
            background-color: #ffbe6f;
        }

        #my-custom-cursor.hovered {
            width: 60px;
            height: 60px;
            background-color: rgba(255, 255, 255, 0.1);
            border: 2px solid #FFFFFF;
        }

        #my-custom-cursor.hovered #my-cursor-dot {
            width: 4px;
            height: 4px;
            background-color: #FFFFFF;
        }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.innerText = css;
    document.head.appendChild(styleSheet);

    const cursor = document.createElement('div');
    cursor.id = 'my-custom-cursor';
    const dot = document.createElement('div');
    dot.id = 'my-cursor-dot';
    cursor.appendChild(dot);
    document.body.appendChild(cursor);

    const moveCursor = (e) => {
        cursor.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`;
        cursor.classList.add('visible');
    };

    window.addEventListener('mousemove', moveCursor);
    document.addEventListener('mouseleave', () => cursor.classList.remove('visible'));

    const addHover = () => cursor.classList.add('hovered');
    const removeHover = () => cursor.classList.remove('hovered');

    const targets = 'a, button, input[type="submit"], input[type="button"], [role="button"], .btn, .button, .cta, .elementor-button';

    document.body.addEventListener('mouseover', (e) => {
        if (e.target.closest(targets)) {
            addHover();
        }
    });

    document.body.addEventListener('mouseout', (e) => {
        if (e.target.closest(targets)) {
            removeHover();
        }
    });
});
