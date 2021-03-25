const observer = new IntersectionObserver(function(entries) {
    const nav = document.querySelector('.navigation');
    const navTop = document.querySelector('.navigation__top');
    if (entries[0].intersectionRatio === 0){
        nav.classList.add("navigation--fixed");
        navTop.style.height = '64px';
    }
    else if (entries[0].intersectionRatio === 1) {
        nav.classList.remove("navigation--fixed");
        navTop.style.height = '0';
    }
}, {
    threshold: [0, 1]
});
let observerFlag = false;

function watchScrollTopButton() {
    if (!observerFlag) {
        observer.observe(document.querySelector('.navigation__top'));
        observerFlag = true;
    }
    const button = document.getElementsByClassName("scroll-top-button")[0];
    if (window.scrollY >= 240) button.style.opacity = 1;
    else button.style.opacity = 0;
}
window.addEventListener("scroll", watchScrollTopButton);
function scrollToTop() {
    if ("scrollBehavior" in document.documentElement.style) {
        window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
        let y = window.scrollY;
        const timer = setInterval(function() {
            window.scrollTo(0, y);
            if (y > 400) {
                y -= 60;
            } else if (y > 100) {
                y -= 40;
            } else {
                y -= 10;
            }
            if (y <= 0) clearInterval(timer);
        }, 6000);
    }
}

function copyLocation() {
    const location = window.location.href;
    const input = document.createElement("input");
    input.setAttribute("value", location);
    document.body.appendChild(input);
    input.select();
    input.setSelectionRange(0, 99999); /* For mobile devices */
    document.execCommand("copy");
    document.body.removeChild(input);
    alert("주소가 복사되었습니다.");
}