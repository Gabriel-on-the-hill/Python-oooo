// script.js - Spy School Decryption Engine (vanilla JS)
// Defensive, modular, classroom-ready, Think Mode + export

// ---------- Utility ----------
function $id(id) { return document.getElementById(id) || null; }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

// ---------- Config ----------
const CONFIG = {
    ALPHABET: 'abcdefghijklmnopqrstuvwxyz'.split(''),
    DEFAULT_KEY: 3,
    SPEED_LEVELS: [2000, 1500, 1000, 600, 300]
};

// ---------- CipherEngine ----------
const CipherEngine = {
    calculateNewPosition(position, key) {
        // safe handling of negative
        return ((position - key) % 26 + 26) % 26;
    },

    decryptChar(letter, key, preserveCase = true) {
        const isUpper = /[A-Z]/.test(letter);
        const lowerLetter = letter.toLowerCase();
        const index = CONFIG.ALPHABET.indexOf(lowerLetter);

        if (index === -1) {
            return { isSpecial: true, char: letter, originalIndex: -1, newIndex: -1, rawCalculation: null };
        }

        const rawCalc = index - key;
        const newIndex = CipherEngine.calculateNewPosition(index, key);
        let newChar = CONFIG.ALPHABET[newIndex];
        if (preserveCase && isUpper) newChar = newChar.toUpperCase();

        return { isSpecial: false, char: newChar, originalIndex: index, newIndex, rawCalculation: rawCalc };
    }
};

// ---------- ClassSync (local storage based) ----------
const ClassSync = {
    storageKey(classId) { return `spyclass_${classId || 'default'}`; },

    saveAttempt(classId, studentId, snapshot) {
        try {
            const key = ClassSync.storageKey(classId);
            const data = JSON.parse(localStorage.getItem(key) || '[]');
            data.push({
                timestamp: new Date().toISOString(),
                studentId: studentId || 'unknown',
                encrypted: LoopEngine.state.encryptedText,
                key: LoopEngine.state.key,
                finalDecrypted: LoopEngine.state.accumulatedText,
                history: snapshot || LoopEngine.state.history
            });
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.warn('ClassSync save failed', e);
        }
    },

    exportClassCSV(classId) {
        const key = ClassSync.storageKey(classId);
        const data = JSON.parse(localStorage.getItem(key) || '[]');
        if (!data.length) { alert('No attempts found for this class.'); return; }

        const rows = [['timestamp', 'studentId', 'encrypted', 'key', 'finalDecrypted', 'historyJSON']];
        data.forEach(r => rows.push([r.timestamp, r.studentId, `"${r.encrypted}"`, r.key, `"${r.finalDecrypted}"`, `"${JSON.stringify(r.history).replace(/"/g, '""')}"`]));
        const csv = rows.map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `spy_school_class_${classId || 'default'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }
};

// ---------- LoopEngine ----------
const LoopEngine = {
    state: {
        encryptedText: "",
        key: CONFIG.DEFAULT_KEY,
        currentIndex: -1,
        history: [],
        isPlaying: false,
        timer: null,
        accumulatedText: "",
        waitingForReveal: false // for Think Mode
    },

    init(text, key) {
        this.pause();
        this.state = {
            encryptedText: text || "",
            key: clamp(parseInt(key, 10) || CONFIG.DEFAULT_KEY, 0, 25),
            currentIndex: -1,
            history: [],
            isPlaying: false,
            timer: null,
            accumulatedText: "",
            waitingForReveal: false
        };
        UIController.reset();
        this.notifyUI();
    },

    nextStep() {
        const s = LoopEngine.state;
        if (s.currentIndex >= s.encryptedText.length - 1) {
            LoopEngine.pause();
            if (s.currentIndex === s.encryptedText.length - 1) UIController.showMissionComplete();
            return;
        }

        s.currentIndex++;
        const char = s.encryptedText[s.currentIndex];
        const preserveCase = UIController.elements.preserveCaseToggle ? UIController.elements.preserveCaseToggle.checked : true;
        const result = CipherEngine.decryptChar(char, s.key, preserveCase);

        const nextChar = result.char;
        s.accumulatedText += nextChar;

        const snapshot = {
            iteration: s.currentIndex,
            inputChar: char,
            key: s.key,
            result,
            accumulated: s.accumulatedText
        };

        s.history.push(snapshot);

        // If Think Mode on -> set waiting state so we hide calculations until reveal
        const thinkOn = UIController.elements.thinkModeToggle ? UIController.elements.thinkModeToggle.checked : false;
        s.waitingForReveal = !!thinkOn;
        LoopEngine.notifyUI();

        // If autoplay and think mode on -> auto-pause immediately after pushing snapshot to allow reveal
        if (s.waitingForReveal && s.isPlaying) {
            LoopEngine.pause();
        }
    },

    prevStep() {
        this.pause();
        const s = this.state;
        if (s.currentIndex < 0) return;

        s.history.pop();
        s.currentIndex--;

        if (s.history.length > 0) {
            s.accumulatedText = s.history[s.history.length - 1].accumulated;
        } else {
            s.accumulatedText = "";
        }

        s.waitingForReveal = false;
        this.notifyUI();
    },

    play() {
        const s = this.state;
        if (s.currentIndex >= s.encryptedText.length - 1) return;

        const speedEl = $id('speedSlider');
        let val = speedEl ? parseInt(speedEl.value, 10) : 3;
        val = isNaN(val) ? 3 : val;
        const speedIdx = clamp(val - 1, 0, CONFIG.SPEED_LEVELS.length - 1);
        const speed = CONFIG.SPEED_LEVELS[speedIdx] || 1000;

        s.isPlaying = true;
        s.timer = setInterval(() => {
            // If think mode waiting, do not auto advance
            if (s.waitingForReveal) {
                LoopEngine.pause();
            } else {
                LoopEngine.nextStep();
            }
        }, speed);
        UIController.updatePlayButton(true);
    },

    pause() {
        const s = this.state;
        s.isPlaying = false;
        if (s.timer) clearInterval(s.timer);
        s.timer = null;
        UIController.updatePlayButton(false);
    },

    reset() {
        this.init(this.state.encryptedText, this.state.key);
    },

    revealPrediction() {
        this.state.waitingForReveal = false;
        this.notifyUI();
    },

    skipPrediction() {
        this.state.waitingForReveal = false;
        this.notifyUI();
    },

    notifyUI() {
        const s = this.state;
        const currentSnapshot = s.history.length > 0 ? s.history[s.history.length - 1] : null;

        UIController.updateLoopInspector(s.currentIndex, s.encryptedText.length, currentSnapshot, s.key, s.waitingForReveal);
        if (currentSnapshot && !currentSnapshot.result.isSpecial) {
            UIController.updateAlphabet(currentSnapshot.result.originalIndex, currentSnapshot.result.newIndex);
        } else {
            UIController.clearAlphabetHighlight();
        }
        UIController.updateEncryptedVisualizer(s.encryptedText, s.currentIndex);
        UIController.updateProgress(s.currentIndex, s.encryptedText.length);
    }
};

// ---------- UIController ----------
const UIController = {
    elements: {
        alphabetVisualizer: null,
        iterationDisplay: null,
        resultLetter: null,
        accumulatedText: null,
        equationDisplay: null,
        currentLetterDisplay: null,
        indexDisplay: null,
        btnStepForward: null, btnStepBack: null, btnPlay: null, btnPause: null,
        btnReset: null, speedSlider: null, explicitIndexToggle: null, thonnyScreen: null,
        decryptionScreen: null, pythonCodeTemplate: null, agentRank: null,
        encryptedVisualizer: null, thinkModeToggle: null, preserveCaseToggle: null,
        predictInput: null, btnReveal: null, btnSkipPredict: null, predictFeedback: null,
        btnExportData: null, classIdInput: null, studentIdInput: null, btnStartClass: null,
        diagnosticScreen: null, classSetupScreen: null
    },

    init() {
        const ids = [
            'alphabetVisualizer', 'iterationDisplay', 'resultLetter', 'accumulatedText', 'equationDisplay',
            'currentLetterDisplay', 'indexDisplay', 'btnStepForward', 'btnStepBack', 'btnPlay', 'btnPause',
            'btnReset', 'speedSlider', 'explicitIndexToggle', 'thonnyScreen', 'decryptionScreen',
            'pythonCodeTemplate', 'agentRank', 'encryptedVisualizer', 'thinkModeToggle',
            'preserveCaseToggle', 'predictInput', 'btnReveal', 'btnSkipPredict', 'predictFeedback',
            'btnExportData', 'classIdInput', 'studentIdInput', 'btnStartClass', 'diagnosticScreen', 'classSetupScreen'
        ];
        ids.forEach(id => { this.elements[id] = $id(id); });

        if (this.elements.alphabetVisualizer) this.generateAlphabetGrid();
        this.attachListeners();
        DiagnosticController.init();

        // Initial Screen Setup
        this.showScreen('classSetupScreen');
    },

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => {
            s.classList.remove('active');
            s.classList.add('hidden'); // Ensure defensive hidden state
        });

        const target = $id(screenId);
        if (target) {
            target.classList.remove('hidden');
            target.classList.add('active');
            // Auto scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    },

    generateAlphabetGrid() {
        const container = this.elements.alphabetVisualizer;
        if (!container) return;
        container.innerHTML = '';
        CONFIG.ALPHABET.forEach((letter, index) => {
            const div = document.createElement('div');
            div.className = 'char-box';
            div.id = `char-${index}`;
            div.innerHTML = `<span class="idx">${index}</span>${letter}`;
            container.appendChild(div);
        });
    },

    updateAlphabet(oldIdx, newIdx) {
        this.clearAlphabetHighlight();
        if (oldIdx !== -1) {
            const oldEl = $id(`char-${oldIdx}`);
            if (oldEl) oldEl.classList.add('highlight-old');
        }
        if (newIdx !== -1) {
            const newEl = $id(`char-${newIdx}`);
            if (newEl) newEl.classList.add('highlight-new');
        }
    },

    clearAlphabetHighlight() {
        document.querySelectorAll('.char-box').forEach(el => el.classList.remove('highlight-old', 'highlight-new'));
    },

    updateLoopInspector(currentIndex, total, snapshot, key, waitingForReveal) {
        const els = this.elements;
        const showExplicit = els.explicitIndexToggle ? els.explicitIndexToggle.checked : false;

        const displayIndex = currentIndex >= 0 ? (currentIndex + 1) : '-';
        if (els.iterationDisplay) els.iterationDisplay.innerText = `Iteration: ${displayIndex} / ${total}`;

        if (snapshot) {
            const inputChar = snapshot.inputChar;
            const origIdx = snapshot.result.originalIndex;
            let letterText = `Current: ${inputChar}`;
            let indexText = `Index: ${origIdx}`;

            if (showExplicit) {
                letterText = `letter: "${inputChar}" (encrypted[${currentIndex}])`;
                indexText = `i: ${currentIndex} (Index of "${inputChar}")`;
            }

            if (els.currentLetterDisplay) els.currentLetterDisplay.innerText = letterText;

            if (snapshot.result.isSpecial) {
                if (els.indexDisplay) els.indexDisplay.innerText = `Index: N/A`;
                if (els.equationDisplay) els.equationDisplay.innerHTML = `<div class="equation-template">Special Character: Keep as is.</div>`;
            } else {
                if (els.indexDisplay) els.indexDisplay.innerText = indexText;

                // Handle Think Mode hiding
                if (waitingForReveal) {
                    // hide calculations, show predict prompt
                    if (els.equationDisplay) els.equationDisplay.innerHTML = `<div class="equation-template">Prediction required — reveal to see calculation</div>`;
                    this.showThinkPrompt(snapshot);
                } else {
                    // show full calculation
                    const raw = snapshot.result.rawCalculation;
                    const final = snapshot.result.newIndex;
                    if (els.equationDisplay) els.equationDisplay.innerHTML = `
            <div class="equation-template">new_pos = (pos - key) % 26</div>
            <div class="calculation-step">Step 1: ${snapshot.result.originalIndex} - ${key} = ${raw}</div>
            <div class="calculation-step">Step 2: ${raw} % 26 = ${final}</div>
          `;
                    this.hideThinkPrompt();
                }
            }

            if (els.resultLetter) els.resultLetter.innerText = snapshot.result.char;
            if (els.accumulatedText) els.accumulatedText.innerText = snapshot.accumulated;
        } else {
            if (els.resultLetter) els.resultLetter.innerText = '-';
            if (els.accumulatedText) els.accumulatedText.innerText = '-';
            if (els.currentLetterDisplay) els.currentLetterDisplay.innerText = `Current: -`;
            if (els.indexDisplay) els.indexDisplay.innerText = `Index: -`;
            if (els.equationDisplay) els.equationDisplay.innerHTML = `<div class="equation-template">new_pos = (pos - key) % 26</div>`;
            this.hideThinkPrompt();
        }
    },

    showThinkPrompt(snapshot) {
        const tp = this.elements.btnReveal ? this.elements.btnReveal.closest('.think-prompt') : null;
        // toggle container visibility
        const prompt = $id('thinkPrompt');
        if (!prompt) return;
        prompt.classList.remove('hidden');
        // clear previous feedback/input
        if (this.elements.predictInput) this.elements.predictInput.value = '';
        if (this.elements.predictFeedback) this.elements.predictFeedback.innerText = '';
    },

    hideThinkPrompt() {
        const prompt = $id('thinkPrompt');
        if (!prompt) return;
        prompt.classList.add('hidden');
        if (this.elements.predictFeedback) this.elements.predictFeedback.innerText = '';
    },

    updateEncryptedVisualizer(text, currentIndex) {
        const container = this.elements.encryptedVisualizer;
        if (!container) return;
        container.innerHTML = '';
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            const span = document.createElement('span');
            span.className = 'char';
            span.innerText = ch;
            if (i === currentIndex) span.classList.add('char-current');
            else if (i < currentIndex) span.classList.add('char-decrypted');
            container.appendChild(span);
        }
    },

    updateProgress(currentIndex, total) {
        const bar = $id('progressBar');
        if (!bar) return;
        const pct = total === 0 ? 0 : clamp(((currentIndex + 1) / total) * 100, 0, 100);
        bar.style.width = `${pct}%`;
    },

    updatePlayButton(isPlaying) {
        const btnPlay = this.elements.btnPlay;
        const btnPause = this.elements.btnPause;
        if (!btnPlay || !btnPause) return;
        if (isPlaying) { btnPlay.classList.add('hidden'); btnPause.classList.remove('hidden'); }
        else { btnPlay.classList.remove('hidden'); btnPause.classList.add('hidden'); }
    },

    showMissionComplete() {
        const code = `
alphabet = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z']
encrypted = "${LoopEngine.state.encryptedText}"
key = ${LoopEngine.state.key}
decrypted = ""

for letter in encrypted:
    if letter in alphabet:
        position = alphabet.index(letter)
        new_position = (position - key) % 26
        new_letter = alphabet[new_position]
        decrypted += new_letter
    else:
        decrypted += letter

print(decrypted)
`.trim();

        if (this.elements.pythonCodeTemplate) this.elements.pythonCodeTemplate.innerText = code;
        setTimeout(() => {
            alert("MISSION COMPLETE. AGENT PROMOTED.");
            if (this.elements.agentRank) this.elements.agentRank.innerText = "RANK: CODE BREAKER";
            // Save attempt to localStorage
            const classId = this.elements.classIdInput ? this.elements.classIdInput.value : 'default';
            const studentId = this.elements.studentIdInput ? this.elements.studentIdInput.value : 'unknown';
            ClassSync.saveAttempt(classId, studentId);

            // Transition to Thonny Screen
            this.showScreen('thonnyScreen');
        }, 800);
    },

    reset() {
        this.clearAlphabetHighlight();
        if (this.elements.resultLetter) this.elements.resultLetter.innerText = '-';
        if (this.elements.accumulatedText) this.elements.accumulatedText.innerText = '-';
        if (this.elements.iterationDisplay) this.elements.iterationDisplay.innerText = 'Iteration: - / -';
        this.updatePlayButton(false);
        this.showScreen('decryptionScreen');
    },

    attachListeners() {
        const els = this.elements;
        if (els.btnStepForward) els.btnStepForward.addEventListener('click', () => LoopEngine.nextStep());
        if (els.btnStepBack) els.btnStepBack.addEventListener('click', () => LoopEngine.prevStep());
        if (els.btnPlay) els.btnPlay.addEventListener('click', () => LoopEngine.play());
        if (els.btnPause) els.btnPause.addEventListener('click', () => LoopEngine.pause());
        if (els.btnReset) els.btnReset.addEventListener('click', () => LoopEngine.reset());
        if (els.btnReveal) els.btnReveal.addEventListener('click', () => {
            // check prediction if any
            const guess = parseInt(els.predictInput ? els.predictInput.value : NaN, 10);
            const currentSnap = LoopEngine.state.history[LoopEngine.state.history.length - 1];
            if (!isNaN(guess) && currentSnap && !currentSnap.result.isSpecial) {
                if (guess === currentSnap.result.newIndex) {
                    if (els.predictFeedback) { els.predictFeedback.innerText = "Nice! Prediction correct."; }
                } else {
                    if (els.predictFeedback) { els.predictFeedback.innerText = `Not quite — expected ${currentSnap.result.newIndex}.`; }
                }
            }
            LoopEngine.revealPrediction();
        });
        if (els.btnSkipPredict) els.btnSkipPredict.addEventListener('click', () => LoopEngine.skipPrediction());

        // Thonny Finish Button
        if ($id('btnFinish')) $id('btnFinish').addEventListener('click', () => {
            // Return to start or reset? Let's reload or just go back to setup
            location.reload();
        });

        // Start mission button
        const startBtn = $id('btnStartMission');
        if (startBtn) startBtn.addEventListener('click', () => {
            const encrypted = $id('encryptedInput') ? $id('encryptedInput').value : 'khoor zruog';
            const key = $id('keyInput') ? parseInt($id('keyInput').value, 10) : CONFIG.DEFAULT_KEY;
            LoopEngine.init(encrypted, key);
        });

        // Export CSV
        if (els.btnExportData) els.btnExportData.addEventListener('click', () => {
            const classId = els.classIdInput ? els.classIdInput.value : 'default';
            ClassSync.exportClassCSV(classId);
        });

        // Class setup
        if (els.btnStartClass) els.btnStartClass.addEventListener('click', () => {
            const classId = els.classIdInput ? (els.classIdInput.value || 'default') : 'default';
            const studentId = els.studentIdInput ? (els.studentIdInput.value || 'unknown') : 'unknown';

            // store temporarily in UIController
            els.classIdInput.value = classId;
            els.studentIdInput.value = studentId;

            // Transition using new helper
            this.showScreen('diagnosticScreen');
        });

        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight') LoopEngine.nextStep();
            if (e.key === 'ArrowLeft') LoopEngine.prevStep();
            if (e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                LoopEngine.state.isPlaying ? LoopEngine.pause() : LoopEngine.play();
            }
        });
    }
};

// ---------- DiagnosticController ----------
const DiagnosticController = {
    init() {
        const options = document.querySelectorAll('.option-btn');
        options.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const isCorrect = e.target.dataset.correct === 'true';
                const parent = e.target.closest('.task-card');
                const feedback = $id('diagnosticFeedback');
                if (isCorrect) {
                    e.target.style.background = '#00ff6a';
                    e.target.style.color = '#000';
                    if (feedback) feedback.innerText = "CORRECT. ACCESSING NEXT NODE...";
                    setTimeout(() => {
                        if (parent) parent.classList.add('hidden');
                        if (feedback) feedback.innerText = "";
                        const next = parent ? parent.nextElementSibling : null;
                        if (next && next.classList && next.classList.contains('task-card')) next.classList.remove('hidden');
                        else {
                            // All done -> start mission screen

                            // Initialize fields
                            const encrypted = $id('encryptedInput') ? $id('encryptedInput').value : 'khoor zruog';
                            const key = $id('keyInput') ? parseInt($id('keyInput').value, 10) : CONFIG.DEFAULT_KEY;

                            // Transition
                            UIController.showScreen('decryptionScreen');
                            LoopEngine.init(encrypted, key);
                        }
                    }, 700);
                } else {
                    e.target.style.background = 'var(--danger)';
                    if (feedback) feedback.innerText = "ACCESS DENIED. INCORRECT.";
                    setTimeout(() => {
                        e.target.style.background = '';
                        if (feedback) feedback.innerText = "";
                    }, 800);
                }
            });
        });
    }
};

// ---------- Boot ----------
document.addEventListener('DOMContentLoaded', () => {
    UIController.init();
});
