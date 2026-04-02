(function () {
    const particleField = document.getElementById("particleField");
    const typingText = document.getElementById("typingText");
    const changingWord = document.getElementById("changingWord");
    const counters = document.querySelectorAll(".stat-number");
    const revealSections = document.querySelectorAll(".reveal-on-scroll");
    const tiltCards = document.querySelectorAll(".tilt-card");
    const transitionRipple = document.getElementById("transitionRipple");

    const subline = "AI-powered potability analysis that turns complex water chemistry into clear confidence.";
    const words = ["Pure", "Safe", "Clean"];

    let typeIndex = 0;
    function typeSubline() {
        if (!typingText || typeIndex > subline.length) return;
        typingText.textContent = subline.slice(0, typeIndex);
        typeIndex += 1;
        const delay = typeIndex % 8 === 0 ? 70 : 30;
        setTimeout(typeSubline, delay);
    }

    let wordIndex = 0;
    function rotateWords() {
        if (!changingWord) return;
        changingWord.style.opacity = "0";
        changingWord.style.transform = "translateY(10px)";
        setTimeout(() => {
            wordIndex = (wordIndex + 1) % words.length;
            changingWord.textContent = words[wordIndex];
            changingWord.style.opacity = "1";
            changingWord.style.transform = "translateY(0)";
        }, 260);
    }

    function createParticles() {
        if (!particleField) return;
        const count = window.innerWidth < 768 ? 18 : 30;
        for (let i = 0; i < count; i += 1) {
            const dot = document.createElement("span");
            dot.className = "particle";
            dot.style.left = `${Math.random() * 100}%`;
            dot.style.animationDuration = `${12 + Math.random() * 15}s`;
            dot.style.animationDelay = `${Math.random() * 12}s`;
            dot.style.opacity = `${0.2 + Math.random() * 0.7}`;
            const size = 2 + Math.random() * 3;
            dot.style.width = `${size}px`;
            dot.style.height = `${size}px`;
            particleField.appendChild(dot);
        }
    }

    function animateCounter(el) {
        const target = Number(el.dataset.counter || 0);
        const prefix = el.dataset.prefix || "";
        const suffix = el.dataset.suffix || "";
        const duration = 1100;
        const start = performance.now();

        function frame(now) {
            const progress = Math.min((now - start) / duration, 1);
            const value = Math.floor(progress * target);
            el.textContent = `${prefix}${value}${suffix}`;
            if (progress < 1) {
                window.requestAnimationFrame(frame);
            } else {
                el.textContent = `${prefix}${target}${suffix}`;
            }
        }

        window.requestAnimationFrame(frame);
    }

    const counterObserver = new IntersectionObserver(
        (entries, observer) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    animateCounter(entry.target);
                    observer.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.6 }
    );

    counters.forEach((counter) => counterObserver.observe(counter));

    const revealObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("visible");
                }
            });
        },
        { threshold: 0.22 }
    );

    revealSections.forEach((section) => revealObserver.observe(section));

    tiltCards.forEach((card) => {
        card.addEventListener("mousemove", (event) => {
            const rect = card.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            const rotateY = ((x / rect.width) - 0.5) * 10;
            const rotateX = ((y / rect.height) - 0.5) * -10;
            card.style.transform = `perspective(700px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
        });

        card.addEventListener("mouseleave", () => {
            card.style.transform = "perspective(700px) rotateX(0deg) rotateY(0deg) translateY(0)";
        });
    });

    function playTransition(targetUrl, event) {
        if (!transitionRipple || !targetUrl) {
            window.location.href = targetUrl;
            return;
        }

        const x = event && event.clientX ? event.clientX : window.innerWidth / 2;
        const y = event && event.clientY ? event.clientY : window.innerHeight / 2;
        transitionRipple.style.left = `${x}px`;
        transitionRipple.style.top = `${y}px`;
        transitionRipple.classList.remove("active");

        window.requestAnimationFrame(() => {
            transitionRipple.classList.add("active");
            setTimeout(() => {
                window.location.href = targetUrl;
            }, 760);
        });
    }

    document.querySelectorAll("[data-target]").forEach((el) => {
        el.addEventListener("click", (event) => {
            const target = el.getAttribute("data-target");
            playTransition(target, event);
        });
    });

    createParticles();
    typeSubline();
    setInterval(rotateWords, 2200);
})();
