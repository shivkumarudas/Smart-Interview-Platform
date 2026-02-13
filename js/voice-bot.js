(() => {
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const hasSpeechRecognition = !!SpeechRecognitionCtor;
  const hasSpeechSynthesis =
    typeof window.speechSynthesis !== "undefined" &&
    typeof window.SpeechSynthesisUtterance !== "undefined";

  const pathname = String(window.location.pathname || "").toLowerCase();
  const isDashboard = pathname.includes("/dashboard/");
  const isLanding =
    document.body.classList.contains("landing-page") ||
    pathname.endsWith("/") ||
    pathname.endsWith("/index.html");

  function route(pathFromRoot) {
    if (isDashboard) return `../${pathFromRoot}`;
    return pathFromRoot;
  }

  function isLoggedIn() {
    try {
      const raw = localStorage.getItem("user");
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return !!(parsed && parsed.id);
    } catch {
      return false;
    }
  }

  function createElement(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  }

  const root = createElement("section", "ivb-root");
  const launcher = createElement("button", "ivb-launcher", "Voice Bot");
  launcher.type = "button";
  launcher.setAttribute("aria-expanded", "false");
  launcher.setAttribute("aria-controls", "ivbPanel");

  const panel = createElement("div", "ivb-panel");
  panel.id = "ivbPanel";
  panel.hidden = true;

  const header = createElement("div", "ivb-header");
  const title = createElement("h3", "ivb-title", "InterviewAI Voice Bot");
  const closeBtn = createElement("button", "ivb-close", "Close");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close voice bot");
  header.append(title, closeBtn);

  const subtitle = createElement(
    "p",
    "ivb-subtitle",
    hasSpeechRecognition
      ? "Use voice or type command. Say 'help' for examples."
      : "Voice input not available in this browser. Type command. Try 'help'."
  );

  const log = createElement("div", "ivb-log");
  log.setAttribute("role", "log");
  log.setAttribute("aria-live", "polite");

  const controls = createElement("div", "ivb-controls");
  const micBtn = createElement(
    "button",
    "ivb-mic",
    hasSpeechRecognition ? "Start Listening" : "Voice Unsupported"
  );
  micBtn.type = "button";
  if (!hasSpeechRecognition) micBtn.disabled = true;

  const input = createElement("input", "ivb-input");
  input.type = "text";
  input.placeholder = "Type a command...";
  input.setAttribute("aria-label", "Voice bot command");

  const sendBtn = createElement("button", "ivb-send", "Send");
  sendBtn.type = "button";

  controls.append(micBtn, input, sendBtn);
  panel.append(header, subtitle, log, controls);
  root.append(launcher, panel);
  document.body.appendChild(root);

  let recognition = null;
  let isListening = false;

  function addMessage(role, text) {
    const clean = String(text || "").trim();
    if (!clean) return;
    const message = createElement(
      "div",
      `ivb-message ${role === "user" ? "ivb-user" : "ivb-bot"}`
    );
    message.textContent = clean;
    log.appendChild(message);
    log.scrollTop = log.scrollHeight;
  }

  function speak(text) {
    if (!hasSpeechSynthesis) return;
    const clean = String(text || "").trim();
    if (!clean) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }

  function respond(text, shouldSpeak = true) {
    addMessage("bot", text);
    if (shouldSpeak) speak(text);
  }

  function openPanel() {
    panel.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
    if (!log.childElementCount) {
      addMessage("bot", "Voice bot ready. Say or type 'help' to view commands.");
    }
    input.focus();
  }

  function closePanel() {
    panel.hidden = true;
    launcher.setAttribute("aria-expanded", "false");
    if (recognition && isListening) {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
    }
  }

  function togglePanel() {
    if (panel.hidden) {
      openPanel();
    } else {
      closePanel();
    }
  }

  function setListeningState(listening) {
    isListening = listening;
    if (!hasSpeechRecognition) return;
    micBtn.textContent = listening ? "Stop Listening" : "Start Listening";
    micBtn.classList.toggle("ivb-mic-live", listening);
  }

  function navigate(path, spokenLabel) {
    const message = spokenLabel || "Opening page.";
    respond(message);
    setTimeout(() => {
      window.location.href = path;
    }, 400);
  }

  function scrollToSection(sectionId, message) {
    const target = document.getElementById(sectionId);
    if (!target) {
      respond("I could not find that section on this page.");
      return true;
    }
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    respond(message || "Scrolling now.");
    return true;
  }

  function showHelp() {
    if (isDashboard) {
      respond(
        "Try commands like: start interview, open practice hub, open reports, open profile, open feedback, logout, or go home."
      );
      return true;
    }

    if (isLanding) {
      respond(
        "Try commands like: go to features, go to modes, open prep paths, open FAQ, login, sign up, or go to dashboard."
      );
      return true;
    }

    respond("Try navigation commands like: go home, login, sign up, or dashboard.");
    return true;
  }

  function runDashboardCommand(command) {
    if (/start interview|begin interview/.test(command)) {
      navigate(route("interview/interview-setup.html"), "Opening interview setup.");
      return true;
    }
    if (/practice/.test(command)) {
      navigate(route("practice/practice.html"), "Opening practice hub.");
      return true;
    }
    if (/report/.test(command)) {
      navigate(route("report/report.html"), "Opening reports.");
      return true;
    }
    if (/profile/.test(command)) {
      navigate(route("profile/profile.html"), "Opening your profile.");
      return true;
    }
    if (/feedback/.test(command)) {
      navigate(route("feedback/feedback.html"), "Opening feedback page.");
      return true;
    }
    if (/logout|log out|sign out/.test(command)) {
      respond("Logging out now.");
      setTimeout(() => {
        if (typeof window.logout === "function") {
          window.logout();
          return;
        }
        localStorage.removeItem("user");
        window.location.href = route("auth/login.html");
      }, 450);
      return true;
    }
    if (/go home|home page|landing/.test(command)) {
      navigate(route("index.html"), "Opening home page.");
      return true;
    }
    return false;
  }

  function runLandingCommand(command) {
    if (/feature/.test(command)) {
      return scrollToSection("features", "Opening features.");
    }
    if (/(mode|technical|behavioral|hr)/.test(command)) {
      return scrollToSection("modes", "Opening interview modes.");
    }
    if (/(prep path|path)/.test(command)) {
      return scrollToSection("paths", "Opening prep paths.");
    }
    if (/process|how it works|steps/.test(command)) {
      return scrollToSection("how", "Opening process section.");
    }
    if (/tech|stack/.test(command)) {
      return scrollToSection("tech", "Opening tech section.");
    }
    if (/faq|question/.test(command)) {
      return scrollToSection("faq", "Opening frequently asked questions.");
    }
    if (/dashboard/.test(command)) {
      if (isLoggedIn()) {
        navigate(route("dashboard/dashboard.html"), "Opening dashboard.");
      } else {
        navigate(route("auth/login.html"), "Please login first. Opening login page.");
      }
      return true;
    }
    if (/login|log in|sign in/.test(command)) {
      navigate(route("auth/login.html"), "Opening login page.");
      return true;
    }
    if (/sign up|signup|register|create account/.test(command)) {
      navigate(route("auth/signup.html"), "Opening sign up page.");
      return true;
    }
    if (/start interview|practice now/.test(command)) {
      if (isLoggedIn()) {
        navigate(route("interview/interview-setup.html"), "Opening interview setup.");
      } else {
        navigate(route("auth/login.html"), "Please login first. Opening login page.");
      }
      return true;
    }
    return false;
  }

  function runGlobalCommand(command) {
    if (/help|what can you do|commands/.test(command)) return showHelp();
    if (/scroll top|top of page|back to top/.test(command)) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      respond("Scrolling to top.");
      return true;
    }
    if (/scroll down/.test(command)) {
      window.scrollBy({ top: Math.round(window.innerHeight * 0.75), behavior: "smooth" });
      respond("Scrolling down.");
      return true;
    }
    return false;
  }

  function processCommand(rawText, source) {
    const raw = String(rawText || "").trim();
    if (!raw) {
      respond("I did not catch that. Please try again.");
      return;
    }

    addMessage("user", raw);
    const command = raw.toLowerCase();

    if (runGlobalCommand(command)) return;
    if (isDashboard && runDashboardCommand(command)) return;
    if (isLanding && runLandingCommand(command)) return;

    respond(
      "I can help with navigation and quick actions. Say help to see example commands.",
      source === "voice"
    );
  }

  function handleTypedSubmit() {
    const text = String(input.value || "").trim();
    if (!text) return;
    input.value = "";
    processCommand(text, "typed");
  }

  function startListening() {
    if (!recognition) {
      respond("Voice input is unavailable in this browser. Please type your command.");
      return;
    }

    if (isListening) {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
      return;
    }

    try {
      recognition.start();
      setListeningState(true);
      addMessage("bot", "Listening...");
    } catch {
      respond("I could not start voice recognition. Please try again.");
    }
  }

  if (hasSpeechRecognition) {
    recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const transcript = String(event?.results?.[0]?.[0]?.transcript || "").trim();
      if (transcript) {
        processCommand(transcript, "voice");
      } else {
        respond("I did not catch that. Please try again.");
      }
    };

    recognition.onerror = () => {
      setListeningState(false);
      respond("Voice recognition failed. You can type commands instead.");
    };

    recognition.onend = () => {
      setListeningState(false);
    };
  }

  launcher.addEventListener("click", togglePanel);
  closeBtn.addEventListener("click", closePanel);
  micBtn.addEventListener("click", startListening);
  sendBtn.addEventListener("click", handleTypedSubmit);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    handleTypedSubmit();
  });
})();
