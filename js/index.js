const user = JSON.parse(localStorage.getItem("user"));

document.body.classList.add("js-enhanced");

const navBtn = document.getElementById("navBtn");
const primaryBtn = document.getElementById("primaryBtn");
const ctaBtn = document.getElementById("ctaBtn");
const demoBtn = document.getElementById("demoBtn");
const menuToggle = document.getElementById("menuToggle");
const navSurface = document.getElementById("navSurface");

function setMenuState(open) {
  if (!navSurface || !menuToggle) return;
  navSurface.classList.toggle("open", open);
  menuToggle.setAttribute("aria-expanded", String(open));

  const lockScroll = open && window.innerWidth <= 980;
  document.body.classList.toggle("menu-open", lockScroll);
}

function closeMobileMenu() {
  setMenuState(false);
}

function setupNavbarScrollState() {
  const navbar = document.querySelector(".navbar");
  if (!navbar) return;

  const sync = () => {
    navbar.classList.toggle("scrolled", window.scrollY > 8);
  };

  sync();
  window.addEventListener("scroll", sync, { passive: true });
}

function setupMobileMenu() {
  if (!menuToggle || !navSurface) return;

  menuToggle.addEventListener("click", () => {
    const open = !navSurface.classList.contains("open");
    setMenuState(open);
  });

  document.querySelectorAll(".nav-links a").forEach((link) => {
    link.addEventListener("click", closeMobileMenu);
  });

  document.addEventListener("click", (event) => {
    if (!navSurface.classList.contains("open")) return;
    if (event.target === menuToggle || menuToggle.contains(event.target)) return;
    if (event.target === navSurface || navSurface.contains(event.target)) return;
    closeMobileMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && navSurface.classList.contains("open")) {
      closeMobileMenu();
      menuToggle.focus();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 980) {
      document.body.classList.remove("menu-open");
      closeMobileMenu();
    }
  });
}

function setupActiveNavLink() {
  const links = Array.from(document.querySelectorAll(".nav-links a[href^='#']"));
  const sections = links
    .map((link) => {
      const id = link.getAttribute("href");
      const section = id ? document.querySelector(id) : null;
      return section ? { link, section } : null;
    })
    .filter(Boolean);

  if (!sections.length) return;

  const sync = () => {
    let activeLink = sections[0].link;

    sections.forEach(({ link, section }) => {
      const top = section.getBoundingClientRect().top;
      if (top <= 140) {
        activeLink = link;
      }
    });

    sections.forEach(({ link }) => {
      link.classList.toggle("is-active", link === activeLink);
    });
  };

  sync();
  window.addEventListener("scroll", sync, { passive: true });
}

function setupRevealAnimations() {
  const selector = [
    ".hero-content",
    ".hero-image",
    ".snapshot-card",
    ".feature-card",
    ".mode-card",
    ".path-card",
    ".role",
    ".step",
    ".feedback-card",
    ".security-list li",
    ".tech-grid span",
    ".faq-item",
    ".testimonial-card",
    ".cta"
  ].join(",");

  const targets = Array.from(document.querySelectorAll(selector));
  if (!targets.length) return;

  targets.forEach((target) => target.classList.add("reveal"));

  if (!("IntersectionObserver" in window)) {
    targets.forEach((target) => target.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {
      threshold: 0.16,
      rootMargin: "0px 0px -6% 0px"
    }
  );

  targets.forEach((target) => observer.observe(target));
}

setupNavbarScrollState();
setupMobileMenu();
setupActiveNavLink();
setupRevealAnimations();

if (user && user.id) {
  navBtn.innerText = "Dashboard";
  navBtn.onclick = () => {
    closeMobileMenu();
    window.location.href = "dashboard/dashboard.html";
  };

  primaryBtn.innerText = "Go to Dashboard";
  primaryBtn.onclick = () => window.location.href = "dashboard/dashboard.html";

  ctaBtn.onclick = () => window.location.href = "dashboard/dashboard.html";
} else {
  navBtn.innerText = "Login";
  navBtn.onclick = () => {
    closeMobileMenu();
    window.location.href = "auth/login.html";
  };

  primaryBtn.onclick = () => window.location.href = "auth/signup.html";
  ctaBtn.onclick = () => window.location.href = "auth/signup.html";
}

if (demoBtn) {
  demoBtn.addEventListener("click", () => {
    const target = document.getElementById("how") || document.getElementById("modes");
    if (!target) return;
    closeMobileMenu();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

/* ================= FAQ ACCORDION ================= */
const faqQuestions = Array.from(document.querySelectorAll(".faq-question"));

function closeAllFaqItems() {
  faqQuestions.forEach((question) => {
    question.parentElement.classList.remove("active");
    question.setAttribute("aria-expanded", "false");
  });
}

faqQuestions.forEach((question, index) => {
  const answer = question.nextElementSibling;
  if (answer) {
    const answerId = `faq-answer-${index + 1}`;
    answer.id = answerId;
    question.setAttribute("aria-controls", answerId);
  }

  question.setAttribute("role", "button");
  question.setAttribute("tabindex", "0");
  question.setAttribute("aria-expanded", "false");

  const toggle = () => {
    const item = question.parentElement;
    const shouldOpen = !item.classList.contains("active");
    closeAllFaqItems();
    if (shouldOpen) {
      item.classList.add("active");
      question.setAttribute("aria-expanded", "true");
    }
  };

  question.addEventListener("click", toggle);
  question.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggle();
  });
});
