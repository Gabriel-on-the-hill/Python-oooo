/**
 * Spy School Decryption Engine
 * Modular Architecture: Logic -> State -> UI
 * V2.0: Multi-Student, Robust, Classroom Ready
 */

const CONFIG = {
    ALPHABET: 'abcdefghijklmnopqrstuvwxyz'.split(''),
    DEFAULT_KEY: 3,
    SPEED_LEVELS: [2000, 1500, 1000, 500, 200]
};

// Utility: safe DOM getter
function $id(id) {
    return document.getElementById(id) || null;
}

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

/**
 * 0. ClassSync & Persistence Module
 * Handles classroom data: Student Identity, Attempts, CSV Export
 */
const ClassSync = {
    currentClassId: 'default',
    currentStudentId: 'unknown',

    init: () => {
        try {
            const lastClass = localStorage.getItem('lastClassId');
            if (lastClass && $id('classIdInput')) $id('classIdInput').value = lastClass;
        } catch (e) {
            console.warn("ClassSync: LocalStorage access denied", e);
        }
    },

    setIdentity: (classId, studentId) => {
        ClassSync.currentClassId = classId || 'default';
        ClassSync.currentStudentId = studentId || 'agent_007';
        try {
            localStorage.setItem('lastClassId', ClassSync.currentClassId);
        } catch (e) { /* ignore */ }
    },

    storageKey: (classId) => `spyclass_${classId || 'default'}`,

    saveAttempt: (attemptData) => {
        try {
            const key = ClassSync.storageKey(ClassSync.currentClassId);
            const data = JSON.parse(localStorage.getItem(key) || '[]');

            const entry = {
                timestamp: new Date().toISOString(),
                studentId: ClassSync.currentStudentId,
                encrypted: attemptData.encrypted,
                key: attemptData.key,
                finalDecrypted: attemptData.finalDecrypted,
                historySnapshot: attemptData.history
            };

            data.push(entry);
            localStorage.setItem(key, JSON.stringify(data));
            console.log("Attempt saved for", ClassSync.currentStudentId);
        } catch (e) {
            console.error("ClassSync: Save failed", e);
            alert("Warning: Could not save progress locally. Please keep this tab open.");
        }
    },

    exportClassCSV: () => {
        const classId = ClassSync.currentClassId;
        const key = ClassSync.storageKey(classId);
        const data = JSON.parse(localStorage.getItem(key) || '[]');

        if (!data.length) {
            alert('No mission data found for Class ID: ' + classId);
            return;
        }

        const headers = ['Timestamp', 'Student ID', 'Encrypted Text', 'Key', 'Decrypted Result'];
        const rows = [headers.join(',')];

        data.forEach(r => {
            // Escape quotes for CSV safety
            const cleanEnc = r.encrypted.replace(/"/g, '""');
            const cleanDec = r.finalDecrypted.replace(/"/g, '""');
            rows.push(`${r.timestamp},"${r.studentId}","${cleanEnc}",${r.key},"${cleanDec}"`);
        });

        const csv = rows.join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SpyMission_${classId}_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
};

/**
 * 1. CipherEngine
 * Pure logic for the Caesar Cipher.
 */
const CipherEngine = {
    calculateNewPosition: (position, key) => {
        return ((position - key) % 26 + 26) % 26;
    },

    decryptChar: (letter, key) => {
        // Check for uppercase preservation
        const isUpper = (letter === letter.toUpperCase() && /[A-Z]/.test(letter));
        const lowerLetter = letter.toLowerCase();
        const index = CONFIG.ALPHABET.indexOf(lowerLetter);

        if (index === -1) {
            return {
                isSpecial: true,
                char: letter,
                originalIndex: -1,
                newIndex: -1,
                rawCalculation: null
            };
        }

        const rawCalc = index - key;
        const newIndex = CipherEngine.calculateNewPosition(index, key);
        let newChar = CONFIG.ALPHABET[newIndex];
        if (isUpper) newChar = newChar.toUpperCase();

        return {
            isSpecial: false,
            char: newChar,
            originalIndex: index,
            newIndex: newIndex,
            rawCalculation: rawCalc
        };
    }
};

/**
 * 2. LoopEngine
 * Manages the "step-by-step" state.
 */
const LoopEngine = {
    state: {
        encryptedText: "",
        key: 3,
        currentIndex: -1,
        history: [],
        isPlaying: false,
        timer: null,
        accumulatedText: ""
    },

    init: (text, key) => {
        LoopEngine.pause();
        LoopEngine.state = {
            encryptedText: text,
            key: key,
            currentIndex: -1,
            history: [],
            isPlaying: false,
            timer: null,
            accumulatedText: ""
        };

        UIController.reset();
        UIController.initEncryptedVisualizer(text);
        LoopEngine.notifyUI();
    },

    nextStep: () => {
        const s = LoopEngine.state;

        // Bounds check
        if (s.currentIndex >= s.encryptedText.length - 1) {
            LoopEngine.pause();
            if (s.currentIndex === s.encryptedText.length - 1) {
                // Determine if this was the final step just completed or if we are already done
                // Actually, if currentIndex == length-1, we have processed the last char.
                // But we want to trigger complete only once.
                // Let's rely on the fact that if we click next and we are at the end, we are done.
                UIController.showMissionComplete();
            }
            return;
        }

        s.currentIndex++;
        const char = s.encryptedText[s.currentIndex];
        const result = CipherEngine.decryptChar(char, s.key);

        const nextChar = result.char;
        s.accumulatedText += nextChar;

        const snapshot = {
            iteration: s.currentIndex,
            inputChar: char,
            key: s.key,
            result: result,
            accumulated: s.accumulatedText
        };

        s.history.push(snapshot);
        LoopEngine.notifyUI();

        // Think Mode Logic: Auto-pause after 1 step
        const thinkMode = $id('thinkModeToggle')?.checked;
        if (thinkMode && s.isPlaying) {
            LoopEngine.pause();
            // Optional: Show prediction prompt here if we had a modal
        }
    },

    prevStep: () => {
        LoopEngine.pause();
        const s = LoopEngine.state;
        if (s.currentIndex < 0) return;

        s.history.pop();
        s.currentIndex--;

        if (s.history.length > 0) {
            s.accumulatedText = s.history[s.history.length - 1].accumulated;
        } else {
            s.accumulatedText = "";
        }

        LoopEngine.notifyUI();
    },

    play: () => {
        if (LoopEngine.state.currentIndex >= LoopEngine.state.encryptedText.length - 1) return;

        const speedEl = $id('speedSlider');
        let speedIdx = 2; // default
        if (speedEl) {
            const val = parseInt(speedEl.value, 10);
            speedIdx = clamp(isNaN(val) ? 3 : val, 1, CONFIG.SPEED_LEVELS.length) - 1;
        }
        const speed = CONFIG.SPEED_LEVELS[speedIdx] || 1000;

        LoopEngine.state.isPlaying = true;
        LoopEngine.state.timer = setInterval(LoopEngine.nextStep, speed);
        UIController.updatePlayButton(true);
    },

    pause: () => {
        LoopEngine.state.isPlaying = false;
        if (LoopEngine.state.timer) clearInterval(LoopEngine.state.timer);
        UIController.updatePlayButton(false);
    },

    notifyUI: () => {
        const s = LoopEngine.state;
        const currentSnapshot = s.history.length > 0 ? s.history[s.history.length - 1] : null;

        // Update Inspectors
        UIController.updateLoopInspector(s.currentIndex, s.encryptedText.length, currentSnapshot, s.key);
        UIController.updateProgress(s.currentIndex, s.encryptedText.length);
        UIController.updateEncryptedHighlight(s.currentIndex);

        // Update Alphabet
        if (currentSnapshot && !currentSnapshot.result.isSpecial) {
            UIController.updateAlphabet(currentSnapshot.result.originalIndex, currentSnapshot.result.newIndex);
        } else {
            UIController.clearAlphabetHighlight();
        }
    }
};

/**
 * 3. UIController
 * Handles DOM updates using safe getters.
 */
const UIController = {
    elements: {},

    init: () => {
        const ids = [
            'alphabetVisualizer', 'iterationDisplay', 'resultLetter', 'accumulatedText',
            'equationDisplay', 'currentLetterDisplay', 'indexDisplay',
            'btnStepForward', 'btnStepBack', 'btnPlay', 'btnPause', 'btnReset', 'speedSlider',
            'explicitIndexToggle', 'thonnyScreen', 'decryptionScreen', 'pythonCodeTemplate', 'agentRank',
            'classSetupScreen', 'diagnosticScreen', 'classIdInput', 'studentIdInput', 'btnStartClass',
            'btnStartMission', 'encryptedInput', 'keyInput', 'encryptedVisualizer', 'progressBar', 'btnExportData'
        ];

        ids.forEach(id => {
            UIController.elements[id] = $id(id);
        });

        if (UIController.elements.alphabetVisualizer) {
            UIController.generateAlphabetGrid();
        }

        UIController.attachListeners();
        ClassSync.init();
    },

    generateAlphabetGrid: () => {
        const container = UIController.elements.alphabetVisualizer;
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

    initEncryptedVisualizer: (text) => {
        const container = UIController.elements.encryptedVisualizer;
        if (!container) return;
        container.innerHTML = '';
        text.split('').forEach((char, i) => {
            const span = document.createElement('span');
            span.className = 'encrypted-char';
            span.id = `enc-char-${i}`;
            span.innerText = char;
            container.appendChild(span);
        });
    },

    updateEncryptedHighlight: (currentIndex) => {
        // Clear previous
        document.querySelectorAll('.encrypted-char').forEach((el, i) => {
            el.classList.remove('active');
            if (i <= currentIndex) el.classList.add('done');
            else el.classList.remove('done');
        });

        if (currentIndex >= 0) {
            const activeEl = $id(`enc-char-${currentIndex}`);
            if (activeEl) {
                activeEl.classList.add('active');
                activeEl.classList.remove('done');
            }
        }
    },

    updateAlphabet: (oldIdx, newIdx) => {
        UIController.clearAlphabetHighlight();
        if (oldIdx !== -1) {
            const oldEl = document.getElementById(`char-${oldIdx}`);
            if (oldEl) oldEl.classList.add('highlight-old');
        }
        if (newIdx !== -1) {
            const newEl = document.getElementById(`char-${newIdx}`);
            if (newEl) newEl.classList.add('highlight-new');
        }
    },

    clearAlphabetHighlight: () => {
        document.querySelectorAll('.char-box').forEach(el => {
            el.classList.remove('highlight-old', 'highlight-new');
        });
    },

    updateLoopInspector: (currentIndex, total, snapshot, key) => {
        const els = UIController.elements;
        const showExplicit = els.explicitIndexToggle ? els.explicitIndexToggle.checked : false;

        // Iteration
        const displayIndex = currentIndex >= 0 ? (currentIndex + 1) : '-';
        if (els.iterationDisplay) els.iterationDisplay.innerText = `Iteration: ${displayIndex} / ${total}`;

        if (snapshot) {
            let letterText = `Current: ${snapshot.inputChar}`;
            let indexText = `Index: ${snapshot.result.originalIndex}`;

            if (showExplicit) {
                letterText = `letter: "${snapshot.inputChar}" (encrypted[${currentIndex}])`;
                indexText = `i: ${currentIndex} (Index of "${snapshot.inputChar}")`;
            }

            if (els.currentLetterDisplay) els.currentLetterDisplay.innerText = letterText;

            if (snapshot.result.isSpecial) {
                if (els.indexDisplay) els.indexDisplay.innerText = `Index: N/A`;
                if (els.equationDisplay) els.equationDisplay.innerHTML = `<div class="equation-template">Special Character: Keep as is.</div>`;
            } else {
                if (els.indexDisplay) els.indexDisplay.innerText = indexText;
                const raw = snapshot.result.rawCalculation;
                const final = snapshot.result.newIndex;
                if (els.equationDisplay) els.equationDisplay.innerHTML = `
                    <div class="equation-template">new_pos = (pos - key) % 26</div>
                    <div class="calculation-step">Step 1: ${snapshot.result.originalIndex} - ${key} = ${raw}</div>
                    <div class="calculation-step">Step 2: ${raw} % 26 = ${final}</div>
                `;
            }

            if (els.resultLetter) els.resultLetter.innerText = snapshot.result.char;
            if (els.accumulatedText) els.accumulatedText.innerText = snapshot.accumulated;
        } else {
            if (els.resultLetter) els.resultLetter.innerText = '-';
            if (els.accumulatedText) els.accumulatedText.innerText = '';
            if (els.currentLetterDisplay) els.currentLetterDisplay.innerText = `Current: -`;
            if (els.indexDisplay) els.indexDisplay.innerText = `Index: -`;
            if (els.equationDisplay) els.equationDisplay.innerHTML = `<div class="equation-template">new_pos = (pos - key) % 26</div>`;
        }
    },

    updateProgress: (currentIndex, total) => {
        const bar = UIController.elements.progressBar;
        if (!bar) return;
        const progress = total > 0 ? ((currentIndex + 1) / total) * 100 : 0;
        bar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
    },

    updatePlayButton: (isPlaying) => {
        const els = UIController.elements;
        if (!els.btnPlay || !els.btnPause) return;

        if (isPlaying) {
            els.btnPlay.style.display = 'none';
            els.btnPause.style.display = 'inline-block';
        } else {
            els.btnPlay.style.display = 'inline-block';
            els.btnPause.style.display = 'none';
        }
    },

    showMissionComplete: () => {
        // Save data first
        const s = LoopEngine.state;
        ClassSync.saveAttempt({
            encrypted: s.encryptedText,
            key: s.key,
            finalDecrypted: s.accumulatedText,
            history: s.history
        });

        const code = `
alphabet = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z']
encrypted = "${s.encryptedText}"
key = ${s.key}
decrypted = ""

for letter in encrypted:
    if letter in alphabet:
        position = alphabet.index(letter)
        new_position = (position - key) % 26
        decrypted += alphabet[new_position]
    else:
        decrypted += letter

print(decrypted) # Output: ${s.accumulatedText}
        `;
        if ($id('pythonCodeTemplate')) $id('pythonCodeTemplate').innerHTML = `<pre>${code}</pre>`;

        setTimeout(() => {
            alert("MISSION COMPLETE. DATA LOGGED.");
            const rankEl = $id('agentRank');
            if (rankEl) {
                rankEl.innerText = "RANK: CODE BREAKER";
                rankEl.classList.add('promoted');
            }
            if ($id('thonnyScreen')) {
                $id('thonnyScreen').classList.remove('hidden');
                $id('thonnyScreen').scrollIntoView({ behavior: "smooth" });
            }
        }, 800);
    },

    reset: () => {
        UIController.clearAlphabetHighlight();
        UIController.updateLoopInspector(-1, LoopEngine.state.encryptedText.length, null, 3);
        UIController.updateProgress(-1, 10); // Clear progress
        UIController.updatePlayButton(false);
        if ($id('thonnyScreen')) $id('thonnyScreen').classList.add('hidden');
    },

    attachListeners: () => {
        const els = UIController.elements;

        // Playback
        if (els.btnStepForward) els.btnStepForward.addEventListener('click', LoopEngine.nextStep);
        if (els.btnStepBack) els.btnStepBack.addEventListener('click', LoopEngine.prevStep);
        if (els.btnPlay) els.btnPlay.addEventListener('click', LoopEngine.play);
        if (els.btnPause) els.btnPause.addEventListener('click', LoopEngine.pause);

        if (els.btnReset) els.btnReset.addEventListener('click', () => {
            LoopEngine.init(LoopEngine.state.encryptedText, LoopEngine.state.key);
        });

        if (els.speedSlider) els.speedSlider.addEventListener('input', () => {
            if (LoopEngine.state.isPlaying) {
                LoopEngine.pause();
                LoopEngine.play();
            }
        });

        if (els.explicitIndexToggle) els.explicitIndexToggle.addEventListener('change', () => {
            LoopEngine.notifyUI();
        });

        // Setup & Mission flow
        if (els.btnStartClass) els.btnStartClass.addEventListener('click', () => {
            const classId = els.classIdInput.value.trim();
            const studentId = els.studentIdInput.value.trim();
            if (classId && studentId) {
                ClassSync.setIdentity(classId, studentId);
                els.classSetupScreen.classList.add('hidden');
                els.diagnosticScreen.classList.remove('hidden');
            } else {
                alert("Identity Required for Mission Access");
            }
        });

        if (els.btnStartMission) els.btnStartMission.addEventListener('click', () => {
            const txt = els.encryptedInput.value || "khoor zruog";
            const key = parseInt(els.keyInput.value) || 3;
            LoopEngine.init(txt, key);
        });

        if (els.btnExportData) els.btnExportData.addEventListener('click', ClassSync.exportClassCSV);

        // Keyboard accessibility
        document.addEventListener('keydown', (e) => {
            // Only if mission screen is active
            if (els.decryptionScreen && !els.decryptionScreen.classList.contains('hidden')) {
                if (e.key === 'ArrowRight') LoopEngine.nextStep();
                if (e.key === 'ArrowLeft') LoopEngine.prevStep();
                if (e.key === ' ') {
                    e.preventDefault();
                    LoopEngine.state.isPlaying ? LoopEngine.pause() : LoopEngine.play();
                }
            }
        });
    }
};

/**
 * 4. DiagnosticController
 */
const DiagnosticController = {
    init: () => {
        const options = document.querySelectorAll('.option-btn');
        options.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const isCorrect = e.target.dataset.correct === 'true';
                const parent = e.target.closest('.task-card');
                const feedback = $id('diagnosticFeedback');

                if (isCorrect) {
                    e.target.style.background = 'var(--accent-color)';
                    e.target.style.color = '#000';
                    feedback.innerText = "CORRECT. ACCESSING NEXT NODE...";

                    setTimeout(() => {
                        parent.classList.add('hidden');
                        feedback.innerText = "";
                        const next = parent.nextElementSibling;
                        if (next && next.classList.contains('task-card')) {
                            next.classList.remove('hidden');
                        } else {
                            // Diagnostic Done
                            MissionController.startMission();
                        }
                    }, 800);
                } else {
                    e.target.style.background = 'var(--alert-color)';
                    feedback.innerText = "ACCESS DENIED. INCORRECT.";
                    setTimeout(() => {
                        e.target.style.background = '';
                        feedback.innerText = "";
                    }, 800);
                }
            });
        });
    }
};

/**
 * 5. MissionController
 */
const MissionController = {
    startMission: () => {
        $id('diagnosticScreen').classList.add('hidden');
        const decryptScreen = $id('decryptionScreen');
        decryptScreen.classList.remove('hidden');
        decryptScreen.classList.add('active');

        // Initial setup
        LoopEngine.init("khoor zruog", 3);
    }
};

// Start
document.addEventListener('DOMContentLoaded', () => {
    UIController.init();
    DiagnosticController.init();
});
