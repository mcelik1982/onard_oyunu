// Giriş, ön/art bilgi ve karakter seçim akışı.
// Tüm etkileşimler JavaScript ile yürütülür; event sheet kullanılmaz.
runOnStartup(runtime => {
    const LAYOUTS = {
        menu: "Giris",
        info: "önard_bilgi",
        character: "karakter_sec",
        game: "Oyun",
        end: "bitis"
    };

    const menuInfoButtons = [
        { name: "btn_bilgi", frame: 0 },
        { name: "btn_kaynakca", frame: 1 },
        { name: "btn_butonlar", frame: 2 }
    ];
    const answerButtons = ["btn_evet", "btn_hayır"];
    const characters = ["kız", "erkek"];
    const gameButtons = ["ön_btn", "ard_btn", "sol", "sag"];
    // Elmas alfa maskesinin tabela yuvalarıyla en iyi örtüştüğü ölçüler (716 x 176).
    const diamondSlots = [
        { x: 44, y: 36, width: 72, height: 58 },
        { x: 106, y: 88, width: 71, height: 56 },
        { x: 170, y: 36, width: 73, height: 58 },
        { x: 231, y: 88, width: 71, height: 56 },
        { x: 295, y: 35, width: 73, height: 59 },
        { x: 357, y: 88, width: 71, height: 56 },
        { x: 421, y: 37, width: 71, height: 56 },
        { x: 482, y: 88, width: 71, height: 56 },
        { x: 546, y: 37, width: 71, height: 56 },
        { x: 607, y: 88, width: 71, height: 56 }
    ];
    const treeRootRatios = [
        0.8977, 0.9, 0.925, 0.8795, 0.9159, 0.8614,
        0.85, 0.8636, 0.8523, 0.8886, 0.8977, 0.9182,
        0.9182, 0.9114, 0.8977, 0.8841, 0.8659
    ];
    const treePerspective = {
        vanishingX: 830,
        horizonY: 390,
        nearDepth: 0.72,
        farDepth: 13.2,
        speed: 0.68,
        scaleProjection: 2.18,
        groundProjection: 780
    };
    const obstacleFrames = [
        { width: 670, height: 317, rootRatio: 316 / 317 },
        { width: 667, height: 305, rootRatio: 304 / 305 },
        { width: 670, height: 317, rootRatio: 316 / 317 },
        { width: 616, height: 308, rootRatio: 307 / 308 },
        { width: 670, height: 317, rootRatio: 316 / 317 },
        { width: 672, height: 273, rootRatio: 272 / 273 }
    ];
    const obstaclePerspective = {
        farDepth: 6.5,
        nearDepth: 1.1,
        collisionDepth: 1.9,
        speed: 1.012,
        scaleProjection: 0.8,
        // Oyun layoutundaki engelin mevcut x=876, y=516 konumu sol rayın
        // başlangıç referansıdır. Sağ ray noktası videodaki karşılığıdır.
        spawnX: { left: 876, right: 944 },
        spawnRootY: 535,
        targetRootY: 1025
    };
    const soundFiles = ["Ray Sesi.webm", "yenisoru.webm", "uzgunum.webm", "bitis.webm"];
    let masterSoundVolume = 0.55;

    let pointer = null;
    let cursorStyle = null;
    let changingLayout = false;
    let infoStep = 0;
    let selectedCharacter = null;
    let characterSizes = new Map();
    let characterTransitionRemaining = null;
    let treeStates = new Map();
    let questionOrder = [];
    let questionPosition = 0;
    let questionFlash = null;
    let questionBaseSize = null;
    let currentDiamond = null;
    let diamondStart = null;
    let rewardAnimation = null;
    let earnedDiamondCount = 0;
    let currentLane = "left";
    let gameAcceptsAnswers = false;
    let obstacleState = null;
    let obstacleLaneQueue = [];
    let lastObstacleLane = null;
    let nextObstacleQuestion = 0;
    let lives = 3;
    let gameOver = false;
    let damageFlash = null;
    let wheelParticles = [];
    let wheelEffectTime = 0;
    let wheelSpawnTime = 0;
    let wheelSpawnIndex = 0;
    let characterBasePositions = new Map();
    let wheelMarkers = [];
    let wheelMarkerLane = null;
    let audioContext = null;
    let audioMasterGain = null;
    let soundBuffers = new Map();
    let soundSources = new Map();
    let soundRequests = new Map();
    let volumeControl = null;
    let orientationWarning = null;
    let pendingEndSound = null;
    const loopingDomVideoElements = new Set();
    let lastVideoPlaybackTime = null;
    let lastVideoDuration = null;

    function prepareLoopingDomVideo(element) {
        if (!element) return;

        const isNewElement = !loopingDomVideoElements.has(element);

        element.loop = true;
        element.autoplay = true;
        element.playsInline = true;
        element.preload = "auto";
        element.volume = masterSoundVolume;
        element.setAttribute("loop", "");
        element.setAttribute("autoplay", "");
        element.setAttribute("playsinline", "");

        loopingDomVideoElements.add(element);
        if (isNewElement) {
            const preserveNativeLoop = () => {
                element.loop = true;
                element.setAttribute("loop", "");
            };
            element.addEventListener("loadedmetadata", preserveNativeLoop);
            element.addEventListener("canplay", preserveNativeLoop);
            element.addEventListener("play", preserveNativeLoop);
        }
    }

    function installVideoLoopHook() {
        if (typeof document === "undefined" || document.__onArdVideoLoopHook) return;
        document.__onArdVideoLoopHook = true;

        // Construct Video eklentisi medya öğesini layout başlarken oluşturur.
        // Öğeyi oluşturulduğu anda yakalamak, DOM'a eklenmemiş olsa bile gerçek
        // video oynatıcısında kesintisiz döngüyü etkinleştirir.
        const originalCreateElement = document.createElement;
        document.createElement = function (...args) {
            const element = Reflect.apply(originalCreateElement, this, args);
            if (String(args[0]).toLowerCase() === "video") {
                prepareLoopingDomVideo(element);
            }
            return element;
        };
    }

    installVideoLoopHook();

    function ensureAudioContext() {
        if (audioContext) return audioContext;
        const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContextClass) return null;

        audioContext = new AudioContextClass();
        audioMasterGain = audioContext.createGain();
        audioMasterGain.gain.value = masterSoundVolume;
        audioMasterGain.connect(audioContext.destination);
        return audioContext;
    }

    function unlockAudio() {
        const context = ensureAudioContext();
        if (context?.state === "suspended") context.resume().catch(() => {});
    }

    function setMasterSoundVolume(value) {
        masterSoundVolume = Math.max(0, Math.min(1, Number(value) || 0));
        if (audioMasterGain && audioContext) {
            audioMasterGain.gain.setTargetAtTime(
                masterSoundVolume,
                audioContext.currentTime,
                0.015
            );
        }

        // Video sesi de oyun sesleriyle aynı ana ses çubuğunu izler.
        for (const element of loopingDomVideoElements) {
            try {
                element.volume = masterSoundVolume;
            } catch (_) {
                loopingDomVideoElements.delete(element);
            }
        }

        if (volumeControl) {
            const percent = Math.round(masterSoundVolume * 100);
            volumeControl.input.value = String(masterSoundVolume);
            volumeControl.value.textContent = `${percent}%`;
            volumeControl.icon.textContent = percent === 0 ? "🔇" : percent < 50 ? "🔉" : "🔊";
        }
    }

    function createVolumeControl() {
        if (volumeControl || typeof document === "undefined") return;

        const panel = document.createElement("div");
        const icon = document.createElement("span");
        const input = document.createElement("input");
        const value = document.createElement("span");

        panel.setAttribute("aria-label", "Oyun ses seviyesi");
        Object.assign(panel.style, {
            position: "fixed",
            right: "14px",
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: "2147483647",
            display: "none",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            padding: "12px 9px",
            border: "3px solid #f6b347",
            borderRadius: "18px",
            background: "linear-gradient(180deg, rgba(153,84,24,0.94), rgba(77,39,15,0.94))",
            boxShadow: "0 4px 14px rgba(66,28,7,0.58), inset 0 0 0 2px rgba(255,211,111,0.22)",
            font: "bold 14px Arial, sans-serif",
            color: "#fff1c7",
            userSelect: "none",
            pointerEvents: "auto"
        });

        icon.style.fontSize = "24px";
        input.type = "range";
        input.min = "0";
        input.max = "1";
        input.step = "0.01";
        input.value = String(masterSoundVolume);
        input.setAttribute("aria-label", "Ses seviyesi");
        input.setAttribute("orient", "vertical");
        Object.assign(input.style, {
            width: "24px",
            height: "190px",
            writingMode: "vertical-lr",
            direction: "rtl",
            WebkitAppearance: "slider-vertical",
            appearance: "slider-vertical",
            accentColor: "#f5a623",
            cursor: "pointer"
        });

        value.style.minWidth = "38px";
        value.style.textAlign = "center";
        panel.append(icon, input, value);
        document.body.appendChild(panel);

        volumeControl = { panel, icon, input, value };
        setMasterSoundVolume(masterSoundVolume);

        input.addEventListener("input", event => {
            unlockAudio();
            setMasterSoundVolume(event.currentTarget.value);
        });
        for (const eventName of ["pointerdown", "click", "keydown"]) {
            panel.addEventListener(eventName, event => event.stopPropagation());
        }
    }

    function showVolumeControl(show) {
        createVolumeControl();
        if (volumeControl) volumeControl.panel.style.display = show ? "flex" : "none";
    }

    function isTouchDevice() {
        if (typeof window === "undefined" || typeof navigator === "undefined") return false;
        return navigator.maxTouchPoints > 0 ||
            (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches);
    }

    function updateOrientationWarning() {
        if (!orientationWarning || typeof window === "undefined") return;
        const isPortrait = window.innerHeight > window.innerWidth;
        orientationWarning.style.display = isTouchDevice() && isPortrait ? "flex" : "none";
    }

    function createOrientationWarning() {
        if (orientationWarning || typeof document === "undefined") return;

        const overlay = document.createElement("div");
        const phone = document.createElement("div");
        const arrow = document.createElement("div");
        const message = document.createElement("div");

        overlay.setAttribute("role", "status");
        overlay.setAttribute("aria-live", "polite");
        overlay.setAttribute("aria-label", "Oynamak için ekranı yan çevir");
        Object.assign(overlay.style, {
            position: "fixed",
            inset: "0",
            zIndex: "2147483647",
            display: "none",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "14px",
            boxSizing: "border-box",
            padding: "max(28px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) max(28px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left))",
            background: "radial-gradient(circle at 50% 38%, rgba(181,105,32,0.98), rgba(72,34,12,0.99) 72%)",
            color: "#fff1c7",
            textAlign: "center",
            fontFamily: "Arial, sans-serif",
            pointerEvents: "auto",
            userSelect: "none",
            touchAction: "none"
        });

        Object.assign(phone.style, {
            width: "72px",
            height: "118px",
            border: "8px solid #fff1c7",
            borderRadius: "14px",
            boxSizing: "border-box",
            boxShadow: "0 6px 18px rgba(30,12,2,0.45)",
            transform: "rotate(90deg)"
        });
        phone.setAttribute("aria-hidden", "true");

        arrow.textContent = "↻";
        arrow.setAttribute("aria-hidden", "true");
        Object.assign(arrow.style, {
            marginTop: "2px",
            fontSize: "clamp(54px, 18vw, 92px)",
            fontWeight: "bold",
            lineHeight: "0.8",
            color: "#f6b347",
            textShadow: "0 3px 8px rgba(30,12,2,0.55)"
        });

        message.textContent = "Oynamak için ekranı yan çevir";
        Object.assign(message.style, {
            maxWidth: "520px",
            fontSize: "clamp(24px, 7vw, 44px)",
            fontWeight: "bold",
            lineHeight: "1.15",
            textShadow: "0 3px 6px rgba(30,12,2,0.65)"
        });

        overlay.append(phone, arrow, message);
        for (const eventName of ["pointerdown", "pointerup", "pointermove", "click", "touchstart", "touchmove"]) {
            overlay.addEventListener(eventName, event => {
                event.preventDefault();
                event.stopPropagation();
            }, { passive: false });
        }
        document.body.appendChild(overlay);
        orientationWarning = overlay;
        updateOrientationWarning();
    }

    function loadSoundBuffer(fileName) {
        if (soundBuffers.has(fileName)) return soundBuffers.get(fileName);

        const promise = (async () => {
            const context = ensureAudioContext();
            if (!context) return null;
            const url = await runtime.assets.getMediaFileUrl(fileName);
            const encodedAudio = await runtime.assets.fetchArrayBuffer(url);
            return context.decodeAudioData(encodedAudio);
        })().catch(error => {
            console.warn(`[Ses] ${fileName} yüklenemedi:`, error);
            return null;
        });
        soundBuffers.set(fileName, promise);
        return promise;
    }

    function stopSound(tag) {
        soundRequests.set(tag, (soundRequests.get(tag) ?? 0) + 1);
        const source = soundSources.get(tag);
        if (!source) return;
        try {
            source.stop();
        } catch (_) {
            // Kaynak zaten bitmiş olabilir.
        }
        soundSources.delete(tag);
    }

    async function playSound(fileName, tag, { looping = false, volume = 1 } = {}) {
        stopSound(tag);
        const requestId = soundRequests.get(tag);
        const buffer = await loadSoundBuffer(fileName);
        if (!buffer || soundRequests.get(tag) !== requestId) return null;

        const context = ensureAudioContext();
        if (!context) return null;
        if (context.state === "suspended") await context.resume().catch(() => {});

        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = buffer;
        source.loop = looping;
        gain.gain.value = volume;
        source.connect(gain);
        gain.connect(audioMasterGain);
        source.onended = () => {
            if (soundSources.get(tag) === source) soundSources.delete(tag);
            source.disconnect();
            gain.disconnect();
        };
        soundSources.set(tag, source);
        source.start();
        return source;
    }

    function startRailSound() {
        playSound("Ray Sesi.webm", "rail", { looping: true, volume: 0.42 });
    }

    function playNewQuestionSound() {
        playSound("yenisoru.webm", "question", { volume: 0.9 });
    }

    function playCollisionSound() {
        const context = ensureAudioContext();
        if (!context || !audioMasterGain) return;
        if (context.state === "suspended") context.resume().catch(() => {});

        stopSound("collision");
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const now = context.currentTime;

        oscillator.type = "sawtooth";
        oscillator.frequency.setValueAtTime(230, now);
        oscillator.frequency.exponentialRampToValueAtTime(95, now + 0.3);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.5, now + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
        oscillator.connect(gain);
        gain.connect(audioMasterGain);
        oscillator.onended = () => {
            if (soundSources.get("collision") === oscillator) soundSources.delete("collision");
            oscillator.disconnect();
            gain.disconnect();
        };
        soundSources.set("collision", oscillator);
        oscillator.start(now);
        oscillator.stop(now + 0.33);
    }

    function finishGame(soundFile) {
        if (changingLayout) return;
        gameOver = true;
        gameAcceptsAnswers = false;
        pendingEndSound = soundFile;
        goToLayout(LAYOUTS.end);
    }

    function setCursor(style) {
        if (cursorStyle === style) return;
        runtime.mouse.setCursorStyle(style);
        cursorStyle = style;
    }

    function getInstance(name) {
        return runtime.objects[name]?.getFirstInstance() ?? null;
    }

    function configureLoopingVideo() {
        const video = getInstance("Video");
        if (video) {
            try {
                video.isVisible = true;
            } catch (_) {
                // Video örneği henüz hazırlanıyorsa sonraki denemede ayarlanır.
            }

            // Construct sürümleri arasındaki Video arayüzü farklarını destekle.
            try {
                if (typeof video.setLooping === "function") video.setLooping(true);
                video.isLooping = true;
                video.loop = true;
            } catch (_) {
                // Bazı sürümlerde bu özellikler yalnızca eklenti içinde yönetilir.
            }

            try {
                if (typeof video.play === "function") {
                    const playRequest = video.play();
                    playRequest?.catch?.(() => {});
                }
            } catch (_) {
                // Video eklentisinin script arayüzü olmayan sürümlerini destekle.
            }
        }

        // Construct'un dahili ve DOM'a eklenmemiş video öğelerini de kapsa.
        if (typeof document !== "undefined") {
            const videoElements = new Set([
                ...loopingDomVideoElements,
                ...document.querySelectorAll("video")
            ]);
            for (const element of videoElements) {
                prepareLoopingDomVideo(element);
                const playRequest = element.play();
                playRequest?.catch?.(() => {});
            }
        }
    }

    function getVideoPlaybackTiming() {
        const video = getInstance("Video");
        let time = Number(video?.playbackTime);
        let duration = Number(video?.duration);

        // Bazı Construct sürümleri medya zamanını yalnızca alttaki video
        // öğesinde sunar; DOM değerlerini yedek kaynak olarak kullan.
        if (typeof document !== "undefined") {
            const element = document.querySelector("video");
            if (element) {
                if (!Number.isFinite(time) || time < 0) time = element.currentTime;
                if (!Number.isFinite(duration) || duration <= 0) duration = element.duration;
            }
        }

        if (!Number.isFinite(time) || time < 0) return null;
        return {
            time,
            duration: Number.isFinite(duration) && duration > 0 ? duration : null
        };
    }

    function getVideoSynchronizedDelta(fallbackDelta) {
        const timing = getVideoPlaybackTiming();
        if (!timing) {
            lastVideoPlaybackTime = null;
            lastVideoDuration = null;
            return fallbackDelta;
        }

        if (timing.duration !== null) lastVideoDuration = timing.duration;
        if (lastVideoPlaybackTime === null) {
            lastVideoPlaybackTime = timing.time;
            return 0;
        }

        let videoDelta = timing.time - lastVideoPlaybackTime;
        if (videoDelta < -0.05) {
            // Video başa sardığında kalan son parça ile yeni ilk parçayı birleştir.
            videoDelta = lastVideoDuration !== null
                ? Math.max(0, lastVideoDuration - lastVideoPlaybackTime) + timing.time
                : timing.time;
        } else if (videoDelta < 0) {
            videoDelta = 0;
        }

        lastVideoPlaybackTime = timing.time;
        return videoDelta;
    }

    function isOver(instance) {
        if (!pointer || !instance || !instance.isVisible ||
            !instance.layer.isSelfAndParentsVisible ||
            !instance.layer.isSelfAndParentsInteractive) return false;

        const [x, y] = instance.layer.cssPxToLayer(pointer.x, pointer.y);
        return instance.containsPoint(x, y);
    }

    function firstHovered(names) {
        for (let i = names.length - 1; i >= 0; --i) {
            const instance = getInstance(names[i]);
            if (isOver(instance)) return { name: names[i], instance };
        }
        return null;
    }

    function goToLayout(name) {
        changingLayout = true;
        pointer = null;
        setCursor("auto");
        runtime.goToLayout(name);
    }

    function updateMenu() {
        const panel = getInstance("bilgi");
        let hovered = null;

        for (let i = menuInfoButtons.length - 1; i >= 0; --i) {
            const button = menuInfoButtons[i];
            if (isOver(getInstance(button.name))) {
                hovered = button;
                break;
            }
        }

        if (panel) {
            if (hovered) panel.animationFrame = hovered.frame;
            panel.isVisible = hovered !== null;
        }

        setCursor(hovered || isOver(getInstance("hugo")) ? "pointer" : "auto");
    }

    function updateInfo() {
        setCursor(firstHovered(answerButtons) ? "pointer" : "auto");
    }

    function setCharacterAppearance(name, scale, brightness) {
        const instance = getInstance(name);
        const size = characterSizes.get(name);
        if (!instance || !size) return;

        instance.width = size.width * scale;
        instance.height = size.height * scale;
        instance.colorRgb = [brightness, brightness, brightness];
    }

    function updateCharacterSelection() {
        if (selectedCharacter) {
            setCursor("auto");
            if (characterTransitionRemaining !== null) {
                characterTransitionRemaining -= runtime.dt;
                if (characterTransitionRemaining <= 0) {
                    characterTransitionRemaining = null;
                    if (runtime.layout.name === LAYOUTS.character && !changingLayout) {
                        goToLayout(LAYOUTS.game);
                    }
                }
            }
            return;
        }

        const hovered = firstHovered(characters);
        for (const name of characters) {
            const active = hovered?.name === name;
            setCharacterAppearance(name, active ? 1.07 : 1, active ? 1 : 0.82);
        }
        setCursor(hovered ? "pointer" : "auto");
    }

    function shuffle(values) {
        for (let i = values.length - 1; i > 0; --i) {
            const j = Math.floor(Math.random() * (i + 1));
            [values[i], values[j]] = [values[j], values[i]];
        }
        return values;
    }

    function randomiseTreeAppearance(tree, state) {
        // İki ayrı dünya hattı kullanılır: ray kenarı ve dış çim alanı.
        // Dış hat geniş tutulduğu için ağaçlar zaman zaman ekranın sol ve sağ
        // kenarındaki çimlerden yaklaşarak geçer.
        state.lateralWorld = state.pathBand === "outer"
            ? 2600 + Math.random() * 700
            : 1350 + Math.random() * 450;
        state.naturalScale = 0.82 + Math.random() * 0.36;

        const usedFrames = new Set(
            [...treeStates.keys()]
                .filter(otherTree => otherTree !== tree)
                .map(otherTree => otherTree.animationFrame)
        );
        const availableFrames = Array.from(
            { length: treeRootRatios.length },
            (_, frame) => frame
        ).filter(frame => !usedFrames.has(frame));
        tree.animationFrame = availableFrames[Math.floor(Math.random() * availableFrames.length)];
        tree.isVisible = true;
    }

    function placeTree(tree, state) {
        // Uzak sınır ufuk çizgisidir. Perspektif payını bu sınırdan başlatarak
        // yeni ağaçların sahnenin ortasında birden belirmesini önle.
        const perspective = Math.max(
            0,
            1 / state.depth - 1 / treePerspective.farDepth
        );
        const scale = treePerspective.scaleProjection * perspective * state.naturalScale;
        const rootY = treePerspective.horizonY +
            treePerspective.groundProjection * perspective;
        const frame = Math.max(0, Math.min(treeRootRatios.length - 1, tree.animationFrame));
        const rootRatio = treeRootRatios[frame];

        tree.width = 322 * scale;
        tree.height = 440 * scale;
        tree.x = treePerspective.vanishingX + state.side * state.lateralWorld / state.depth;
        // Kök pikselini zemine sabitle ve alt kısmını az miktarda çime göm.
        const rootBurial = Math.min(12, tree.height * 0.025);
        tree.y = rootY - (rootRatio - 0.5) * tree.height + rootBurial;

        const farFade = Math.min(1, (treePerspective.farDepth - state.depth) / 0.9);
        const nearFade = Math.min(1, (state.depth - treePerspective.nearDepth) / 0.7);
        tree.opacity = Math.max(0, Math.min(farFade, nearFade));
    }

    function orderTreesByDepth() {
        const ordered = [...treeStates.entries()].sort((a, b) => b[1].depth - a[1].depth);
        for (let i = 1; i < ordered.length; ++i) {
            ordered[i][0].moveAdjacentToInstance(ordered[i - 1][0], true);
        }
    }

    function updateTrees(dt) {
        const depthSpan = treePerspective.farDepth - treePerspective.nearDepth;
        let wrapped = false;

        for (const [tree, state] of treeStates) {
            state.depth -= treePerspective.speed * dt;
            while (state.depth <= treePerspective.nearDepth) {
                state.depth += depthSpan;
                randomiseTreeAppearance(tree, state);
                wrapped = true;
            }
            placeTree(tree, state);
        }

        if (wrapped) orderTreesByDepth();
    }

    function setLane(lane) {
        if (gameOver) return;
        currentLane = lane;
        const leftCharacter = getInstance("sol_karakter");
        const rightCharacter = getInstance("sag_karakter");
        if (leftCharacter) leftCharacter.isVisible = lane === "left";
        if (rightCharacter) rightCharacter.isVisible = lane === "right";
    }

    function createWheelSpark(character, lane) {
        const wheelOffsets = lane === "left"
            ? [-0.395, 0.35]
            : [-0.377, 0.377];
        const offsetX = wheelOffsets[wheelSpawnIndex % wheelOffsets.length];
        ++wheelSpawnIndex;

        const particle = runtime.objects.patlama.createInstance(
            character.layer.name,
            character.x + character.width * offsetX,
            character.y + character.height * 0.47
        );
        const startSize = 13 + Math.random() * 7;
        particle.width = startSize;
        particle.height = startSize;
        particle.angle = Math.random() * Math.PI * 2;
        particle.opacity = 0.52;
        particle.isVisible = true;
        particle.moveAdjacentToInstance(character, false);

        wheelParticles.push({
            instance: particle,
            elapsed: 0,
            duration: 0.38 + Math.random() * 0.1,
            startSize,
            riseSpeed: 42 + Math.random() * 18,
            driftSpeed: (Math.random() - 0.5) * 24,
            spinSpeed: (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 5)
        });
    }

    function clearWheelEffect() {
        for (const particle of wheelParticles) particle.instance.destroy();
        wheelParticles = [];
        for (const marker of wheelMarkers) marker.instance.destroy();
        wheelMarkers = [];
        wheelMarkerLane = null;

        for (const [character, base] of characterBasePositions) {
            character.y = base.y;
        }
    }

    function createWheelMarkers(character, lane) {
        for (const marker of wheelMarkers) marker.instance.destroy();
        wheelMarkers = [];
        wheelMarkerLane = lane;

        // Her tekerde birbirinin karşısında iki parlak işaret bulunur.
        for (let wheel = 0; wheel < 2; ++wheel) {
            for (let markerIndex = 0; markerIndex < 2; ++markerIndex) {
                const marker = runtime.objects.patlama.createInstance(
                    character.layer.name,
                    character.x,
                    character.y
                );
                marker.width = 14;
                marker.height = 14;
                marker.opacity = 0.8;
                marker.isVisible = true;
                marker.moveAdjacentToInstance(character, true);
                wheelMarkers.push({
                    instance: marker,
                    wheel,
                    phase: markerIndex * Math.PI
                });
            }
        }
    }

    function updateWheelMarkers(character, lane) {
        if (wheelMarkerLane !== lane || wheelMarkers.length !== 4) {
            createWheelMarkers(character, lane);
        }

        const wheelOffsets = lane === "left"
            ? [-0.395, 0.35]
            : [-0.377, 0.377];
        const radiusX = character.width * 0.075;
        const radiusY = character.height * 0.075;
        const centerY = character.y + character.height * 0.405;
        const rotationDirection = lane === "right" ? -1 : 1;

        for (const marker of wheelMarkers) {
            const angle = wheelEffectTime * 11 * rotationDirection + marker.phase;
            const depth = (Math.sin(angle) + 1) / 2;
            const centerX = character.x + character.width * wheelOffsets[marker.wheel];
            const size = 24 + depth * 18;

            marker.instance.x = centerX + Math.cos(angle) * radiusX;
            marker.instance.y = centerY + Math.sin(angle) * radiusY;
            marker.instance.width = size;
            marker.instance.height = size;
            marker.instance.angle = angle;
            marker.instance.opacity = 0.88 + depth * 0.12;
        }
    }

    function updateWheelEffect(dt) {
        const character = getInstance(
            currentLane === "left" ? "sol_karakter" : "sag_karakter"
        );
        if (!character || gameOver) return;

        wheelEffectTime += dt;
        wheelSpawnTime += dt;

        const activeBase = characterBasePositions.get(character);
        if (activeBase) {
            character.y = activeBase.y + Math.sin(wheelEffectTime * 23) * 1.25;
        }

        for (const [otherCharacter, base] of characterBasePositions) {
            if (otherCharacter !== character) otherCharacter.y = base.y;
        }

        updateWheelMarkers(character, currentLane);

        while (wheelSpawnTime >= 0.1) {
            wheelSpawnTime -= 0.1;
            createWheelSpark(character, currentLane);
        }

        for (let i = wheelParticles.length - 1; i >= 0; --i) {
            const particle = wheelParticles[i];
            particle.elapsed += dt;
            const t = Math.min(particle.elapsed / particle.duration, 1);
            const eased = 1 - Math.pow(1 - t, 2);

            particle.instance.y -= particle.riseSpeed * dt;
            particle.instance.x += particle.driftSpeed * dt;
            particle.instance.angle += particle.spinSpeed * dt;
            particle.instance.width = particle.startSize + 20 * eased;
            particle.instance.height = particle.startSize + 20 * eased;
            particle.instance.opacity = 0.52 * (1 - t);

            if (t >= 1) {
                particle.instance.destroy();
                wheelParticles.splice(i, 1);
            }
        }
    }

    function scheduleNextObstacle() {
        nextObstacleQuestion = questionPosition + 2 + Math.floor(Math.random() * 2);
    }

    function takeRandomObstacleLane() {
        if (obstacleLaneQueue.length === 0) {
            obstacleLaneQueue = shuffle(["left", "left", "right", "right"]);

            // Yeni grubun ilk engeli önceki engelle aynıysa farklı yönü öne al.
            // Böylece seçim rastgele kalırken uzun tek-ray serileri oluşmaz.
            if (obstacleLaneQueue[0] === lastObstacleLane) {
                const otherIndex = obstacleLaneQueue.findIndex(lane => lane !== lastObstacleLane);
                if (otherIndex > 0) {
                    [obstacleLaneQueue[0], obstacleLaneQueue[otherIndex]] =
                        [obstacleLaneQueue[otherIndex], obstacleLaneQueue[0]];
                }
            }
        }

        const lane = obstacleLaneQueue.shift();
        lastObstacleLane = lane;
        return lane;
    }

    function spawnObstacle() {
        const obstacle = getInstance("engel");
        if (!obstacle || obstacleState || gameOver) return;

        obstacle.stopAnimation();
        obstacle.animationFrame = Math.floor(Math.random() * obstacleFrames.length);
        obstacleState = {
            instance: obstacle,
            lane: takeRandomObstacleLane(),
            depth: obstaclePerspective.farDepth,
            resolved: false
        };
        obstacle.opacity = 0;
        obstacle.isVisible = true;
        placeObstacle();
        scheduleNextObstacle();
    }

    function maybeSpawnObstacle() {
        if (!obstacleState && questionPosition >= nextObstacleQuestion) spawnObstacle();
    }

    function placeObstacle() {
        if (!obstacleState) return;

        const { instance, lane, depth } = obstacleState;
        const frame = obstacleFrames[Math.max(0, Math.min(
            obstacleFrames.length - 1,
            instance.animationFrame
        ))];
        const farPerspective = 1 / obstaclePerspective.farDepth;
        const nearPerspective = 1 / obstaclePerspective.nearDepth;
        const progress = Math.max(0, Math.min(1,
            (1 / depth - farPerspective) /
            (nearPerspective - farPerspective)
        ));
        const scale = obstaclePerspective.scaleProjection / depth;
        const laneCharacter = getInstance(
            lane === "left" ? "sol_karakter" : "sag_karakter"
        );
        const targetX = laneCharacter?.x ?? (lane === "left" ? 595 : 1218);
        const startX = obstaclePerspective.spawnX[lane];
        const rootY = obstaclePerspective.spawnRootY +
            (obstaclePerspective.targetRootY - obstaclePerspective.spawnRootY) * progress;

        instance.width = frame.width * scale;
        instance.height = frame.height * scale;
        instance.x = startX + (targetX - startX) * progress;
        instance.y = rootY - (frame.rootRatio - 0.5) * instance.height;
        instance.opacity = Math.min(1,
            (obstaclePerspective.farDepth - depth) / 0.55
        );
    }

    function endGame() {
        clearWheelEffect();
        finishGame("uzgunum.webm");
    }

    function hitObstacle() {
        if (!obstacleState || obstacleState.resolved || gameOver) return;

        obstacleState.resolved = true;
        obstacleState.instance.isVisible = false;
        obstacleState = null;
        --lives;

        const health = getInstance("can");
        if (health && lives > 0) health.animationFrame = 3 - lives;

        const character = getInstance(
            currentLane === "left" ? "sol_karakter" : "sag_karakter"
        );
        if (character) {
            character.colorRgb = [1, 0.25, 0.25];
            damageFlash = { instance: character, elapsed: 0, duration: 0.45 };
        }

        playCollisionSound();
        if (lives <= 0) endGame();
    }

    function updateDamageFlash(dt) {
        if (!damageFlash) return;
        damageFlash.elapsed += dt;
        const visible = Math.floor(damageFlash.elapsed / 0.07) % 2 === 0;
        damageFlash.instance.opacity = visible ? 1 : 0.35;

        if (damageFlash.elapsed >= damageFlash.duration) {
            damageFlash.instance.opacity = 1;
            damageFlash.instance.colorRgb = [1, 1, 1];
            damageFlash = null;
        }
    }

    function updateObstacle(dt) {
        if (!obstacleState || gameOver) return;

        obstacleState.depth -= obstaclePerspective.speed * dt;
        placeObstacle();

        if (!obstacleState.resolved &&
            obstacleState.depth <= obstaclePerspective.collisionDepth) {
            if (obstacleState.lane === currentLane) {
                hitObstacle();
                return;
            }
            obstacleState.resolved = true;
        }

        if (obstacleState && obstacleState.depth <= obstaclePerspective.nearDepth) {
            obstacleState.instance.isVisible = false;
            obstacleState = null;
        }
    }

    function showQuestion() {
        const questions = getInstance("sorular");
        if (!questions || questionPosition >= questionOrder.length) {
            gameAcceptsAnswers = false;
            return;
        }

        questions.animationFrame = questionOrder[questionPosition];
        questions.opacity = 0.2;
        questions.width = questionBaseSize.width * 1.06;
        questions.height = questionBaseSize.height * 1.06;
        questionFlash = {
            instance: questions,
            elapsed: 0,
            duration: 0.22
        };
        gameAcceptsAnswers = true;
        maybeSpawnObstacle();
        playNewQuestionSound();
    }

    function updateQuestionFlash(dt) {
        if (!questionFlash || !questionBaseSize) return;

        const flash = questionFlash;
        flash.elapsed += dt;
        const t = Math.min(flash.elapsed / flash.duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        const scale = 1.06 - 0.06 * eased;

        flash.instance.opacity = 0.2 + 0.8 * eased;
        flash.instance.width = questionBaseSize.width * scale;
        flash.instance.height = questionBaseSize.height * scale;

        if (t >= 1) {
            flash.instance.opacity = 1;
            flash.instance.width = questionBaseSize.width;
            flash.instance.height = questionBaseSize.height;
            questionFlash = null;
        }
    }

    function getDiamondTarget(index) {
        const table = getInstance("tabela");
        const slot = diamondSlots[index];
        const scaleX = table.width / 716;
        const scaleY = table.height / 176;
        return {
            x: table.x + ((slot.x + slot.width / 2 - 5) / 716 - 0.5) * table.width,
            y: table.y + ((slot.y + slot.height / 2 - 6) / 176 - 0.5) * table.height,
            width: 104 * scaleX,
            height: 84 * scaleY
        };
    }

    function createNextDiamond() {
        if (!diamondStart || questionPosition >= questionOrder.length) {
            currentDiamond = null;
            return;
        }

        currentDiamond = runtime.objects.elmas.createInstance(
            diamondStart.layerName,
            diamondStart.x,
            diamondStart.y
        );
        currentDiamond.width = diamondStart.width;
        currentDiamond.height = diamondStart.height;
        currentDiamond.opacity = 1;
        currentDiamond.isVisible = true;
    }

    function beginCorrectAnswerAnimation() {
        if (!currentDiamond || rewardAnimation || earnedDiamondCount >= diamondSlots.length) return;

        gameAcceptsAnswers = false;
        const explosion = getInstance("patlama");
        const table = getInstance("tabela");
        const target = getDiamondTarget(earnedDiamondCount);
        const diamond = currentDiamond;

        // Elmas tabelanın üstünde çizilir; tabela z-order olarak altta kalır.
        if (table) diamond.moveAdjacentToInstance(table, true);

        if (explosion) {
            explosion.x = diamond.x;
            explosion.y = diamond.y + diamond.height * 0.08;
            explosion.width = 75;
            explosion.height = 70;
            explosion.angle = Math.random() * Math.PI * 2;
            explosion.opacity = 1;
            explosion.isVisible = true;
        }

        rewardAnimation = {
            elapsed: 0,
            explosionDelay: 0.3,
            moveDuration: 0.8,
            diamond,
            explosion,
            startX: diamond.x,
            startY: diamond.y,
            startWidth: diamond.width,
            startHeight: diamond.height,
            target
        };
    }

    function updateRewardAnimation(dt) {
        if (!rewardAnimation) return;

        const animation = rewardAnimation;
        animation.elapsed += dt;
        const moveElapsed = Math.max(0, animation.elapsed - animation.explosionDelay);
        const t = Math.min(moveElapsed / animation.moveDuration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        const diamond = animation.diamond;

        diamond.x = animation.startX + (animation.target.x - animation.startX) * eased;
        diamond.y = animation.startY + (animation.target.y - animation.startY) * eased;
        diamond.width = animation.startWidth + (animation.target.width - animation.startWidth) * eased;
        diamond.height = animation.startHeight + (animation.target.height - animation.startHeight) * eased;

        if (animation.explosion) {
            const explosionT = Math.min(animation.elapsed / 0.58, 1);
            const explosionEased = 1 - Math.pow(1 - explosionT, 3);
            animation.explosion.width = 75 + 360 * explosionEased;
            animation.explosion.height = 70 + 335 * explosionEased;
            animation.explosion.angle += dt * 4.5;
            animation.explosion.opacity = explosionT < 0.38
                ? 1
                : 1 - (explosionT - 0.38) / 0.62;
            if (explosionT >= 1) animation.explosion.isVisible = false;
        }

        if (t < 1) return;

        rewardAnimation = null;
        currentDiamond = null;
        ++earnedDiamondCount;
        ++questionPosition;

        if (earnedDiamondCount >= diamondSlots.length) {
            finishGame("bitis.webm");
            return;
        }

        if (questionPosition < questionOrder.length) {
            showQuestion();
            createNextDiamond();
        } else {
            gameAcceptsAnswers = false;
        }
    }

    function answerCurrentQuestion(buttonName) {
        if (!gameAcceptsAnswers || rewardAnimation || questionPosition >= questionOrder.length) return;

        const frame = questionOrder[questionPosition];
        const correctButton = frame < 7 ? "ön_btn" : "ard_btn";
        if (buttonName !== correctButton) return;

        setLane(buttonName === "ön_btn" ? "left" : "right");
        beginCorrectAnswerAnimation();
    }

    function updateGame() {
        updateDamageFlash(runtime.dt);
        if (gameOver) return;

        updateWheelEffect(runtime.dt);
        updateObstacle(runtime.dt);
        updateQuestionFlash(runtime.dt);
        updateRewardAnimation(runtime.dt);
        setCursor(firstHovered(gameButtons) ? "pointer" : "auto");
    }

    function initialiseGame() {
        treeStates = new Map();
        lastVideoPlaybackTime = null;
        lastVideoDuration = null;
        // Arka plan videosunda ağaçlar bulunduğu için Oyun layoutundaki bütün
        // hareketli ağaç sprite'larını kaldır; ayrıca yeni ağaç oluşturma.
        const treeObject = runtime.objects.agac1;
        if (treeObject) {
            for (const tree of [...treeObject.instances()]) {
                tree.destroy();
            }
        }

        // Statik oyun arka planı, video yüklenene kadar ve internet sorunu
        // olduğunda mutlaka görünür bir yedek olarak videonun altında kalır.
        const staticGameBackground = getInstance("oyun_ark");
        const backgroundVideo = getInstance("Video");
        if (staticGameBackground) {
            staticGameBackground.isVisible = true;
            staticGameBackground.opacity = 1;
        }
        if (staticGameBackground && backgroundVideo) {
            backgroundVideo.moveAdjacentToInstance(staticGameBackground, true);
        }

        questionOrder = shuffle(Array.from({ length: 14 }, (_, index) => index)).slice(0, 10);
        questionPosition = 0;
        earnedDiamondCount = 0;
        rewardAnimation = null;
        questionFlash = null;
        obstacleState = null;
        obstacleLaneQueue = [];
        lastObstacleLane = null;
        lives = 3;
        gameOver = false;
        damageFlash = null;
        wheelParticles = [];
        wheelEffectTime = 0;
        wheelSpawnTime = 0;
        wheelSpawnIndex = 0;
        wheelMarkers = [];
        wheelMarkerLane = null;
        characterBasePositions = new Map();
        nextObstacleQuestion = 2 + Math.floor(Math.random() * 2);
        gameAcceptsAnswers = false;

        const questions = getInstance("sorular");
        if (questions) {
            questions.stopAnimation();
            questions.opacity = 1;
            questionBaseSize = {
                width: questions.width,
                height: questions.height
            };
        }

        const characterFrame = selectedCharacter === "erkek" ? 1 : 0;
        const leftCharacter = getInstance("sol_karakter");
        const rightCharacter = getInstance("sag_karakter");
        if (leftCharacter) {
            leftCharacter.stopAnimation();
            leftCharacter.animationFrame = characterFrame;
            leftCharacter.opacity = 1;
            leftCharacter.colorRgb = [1, 1, 1];
            characterBasePositions.set(leftCharacter, { y: leftCharacter.y });
        }
        if (rightCharacter) {
            rightCharacter.stopAnimation();
            rightCharacter.animationFrame = characterFrame;
            rightCharacter.opacity = 1;
            rightCharacter.colorRgb = [1, 1, 1];
            characterBasePositions.set(rightCharacter, { y: rightCharacter.y });
        }
        setLane("left");

        currentDiamond = getInstance("elmas");
        if (currentDiamond) {
            diamondStart = {
                x: currentDiamond.x,
                y: currentDiamond.y,
                width: currentDiamond.width,
                height: currentDiamond.height,
                layerName: currentDiamond.layer.name
            };
            currentDiamond.opacity = 1;
            currentDiamond.isVisible = true;
        }

        const explosion = getInstance("patlama");
        if (explosion) {
            explosion.isVisible = false;
            explosion.opacity = 1;
        }

        const health = getInstance("can");
        if (health) {
            health.stopAnimation();
            health.animationFrame = 0;
            health.opacity = 1;
            health.isVisible = true;
        }

        const obstacle = getInstance("engel");
        if (obstacle) {
            obstacle.stopAnimation();
            obstacle.isVisible = false;
            obstacle.opacity = 1;
        }

        for (const name of ["ön_btn", "ard_btn", "sol", "sag"]) {
            const button = getInstance(name);
            if (button) button.opacity = 1;
        }

        showQuestion();
        startRailSound();
        showVolumeControl(true);

        // Video hazırlığı hiçbir koşulda oyun layoutunun kurulmasını engellemesin.
        setTimeout(configureLoopingVideo, 0);
        setTimeout(configureLoopingVideo, 100);
        setTimeout(configureLoopingVideo, 500);
    }

    function updateCurrentLayout() {
        if (changingLayout) return;

        switch (runtime.layout.name) {
            case LAYOUTS.menu:
                updateMenu();
                break;
            case LAYOUTS.info:
                updateInfo();
                break;
            case LAYOUTS.character:
                updateCharacterSelection();
                break;
            case LAYOUTS.game:
                updateGame();
                break;
            case LAYOUTS.end:
                setCursor(isOver(getInstance("anasayfa_btn")) ? "pointer" : "auto");
                break;
            default:
                setCursor("auto");
                break;
        }
    }

    function initialiseLayout() {
        changingLayout = false;
        pointer = null;
        setCursor("auto");
        updateOrientationWarning();

        if (runtime.layout.name === LAYOUTS.menu) {
            const panel = getInstance("bilgi");
            if (panel) {
                panel.stopAnimation();
                panel.animationFrame = 0;
                panel.isVisible = false;
            }
            return;
        }

        if (runtime.layout.name === LAYOUTS.info) {
            infoStep = 0;
            const infoSprite = getInstance("ard");
            if (infoSprite) {
                infoSprite.stopAnimation();
                infoSprite.animationFrame = 0;
            }

            // Evet/Hayır görselleri ard frame'inde. Bu iki sprite yalnızca
            // görünmez tıklama alanı olarak kullanılır.
            for (const name of answerButtons) {
                const button = getInstance(name);
                if (button) {
                    button.isVisible = true;
                    button.opacity = 0;
                }
            }
            return;
        }

        if (runtime.layout.name === LAYOUTS.character) {
            selectedCharacter = null;
            characterTransitionRemaining = null;
            characterSizes = new Map();

            const selectionSprite = getInstance("secim");
            if (selectionSprite) selectionSprite.isVisible = true;

            const characterBackground = getInstance("karakter_sec_ark");
            if (characterBackground) {
                characterBackground.stopAnimation();
                characterBackground.animationFrame = 0;
            }

            for (const name of characters) {
                const instance = getInstance(name);
                if (!instance) continue;
                instance.stopAnimation();
                instance.isVisible = true;
                characterSizes.set(name, { width: instance.width, height: instance.height });
                instance.colorRgb = [0.82, 0.82, 0.82];
            }
            return;
        }

        if (runtime.layout.name === LAYOUTS.game) {
            initialiseGame();
            return;
        }

        if (runtime.layout.name === LAYOUTS.end) {
            const soundFile = pendingEndSound;
            pendingEndSound = null;
            if (soundFile) playSound(soundFile, "ending", { volume: 1 });
        }
    }

    function handlePointerDown(event) {
        unlockAudio();
        if (event.pointerType === "mouse" && event.button !== 0) return;
        if (changingLayout) return;

        pointer = { x: event.clientX, y: event.clientY };

        if (runtime.layout.name === LAYOUTS.menu) {
            if (isOver(getInstance("hugo"))) goToLayout(LAYOUTS.info);
            return;
        }

        if (runtime.layout.name === LAYOUTS.info) {
            if (!firstHovered(answerButtons)) return;

            if (infoStep === 0) {
                const infoSprite = getInstance("ard");
                if (infoSprite) infoSprite.animationFrame = 1;
                infoStep = 1;
            } else {
                goToLayout(LAYOUTS.character);
            }
            return;
        }

        if (runtime.layout.name === LAYOUTS.character && !selectedCharacter) {
            const hovered = firstHovered(characters);
            if (!hovered) return;

            selectedCharacter = hovered.name;
            const selectionSprite = getInstance("secim");
            if (selectionSprite) selectionSprite.isVisible = false;
            const characterBackground = getInstance("karakter_sec_ark");
            if (characterBackground) {
                characterBackground.animationFrame = selectedCharacter === "kız" ? 1 : 2;
            }
            for (const name of characters) {
                const instance = getInstance(name);
                if (instance) instance.isVisible = false;
            }
            updateCharacterSelection();

            characterTransitionRemaining = 2;
            return;
        }

        if (runtime.layout.name === LAYOUTS.game) {
            const control = firstHovered(gameButtons);
            if (!control) return;

            if (control.name === "sol") {
                setLane("left");
            } else if (control.name === "sag") {
                setLane("right");
            } else {
                answerCurrentQuestion(control.name);
            }
            return;
        }

        if (runtime.layout.name === LAYOUTS.end) {
            if (isOver(getInstance("anasayfa_btn"))) {
                goToLayout(LAYOUTS.character);
            }
        }
    }

    runtime.addEventListener("beforeprojectstart", () => {
        createVolumeControl();
        createOrientationWarning();
        if (typeof window !== "undefined") {
            window.addEventListener("resize", updateOrientationWarning, { passive: true });
            window.addEventListener("orientationchange", updateOrientationWarning, { passive: true });
        }
        for (const fileName of soundFiles) loadSoundBuffer(fileName);
        runtime.addEventListener("afteranylayoutstart", initialiseLayout);
        runtime.addEventListener("beforeanylayoutend", () => {
            characterTransitionRemaining = null;
            pointer = null;
            setCursor("auto");
            showVolumeControl(false);
            stopSound("rail");
            stopSound("question");
            stopSound("collision");
            stopSound("gameover");
            stopSound("ending");
        });
        runtime.addEventListener("pointermove", event => {
            if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
            pointer = { x: event.clientX, y: event.clientY };
            updateCurrentLayout();
        });
        runtime.addEventListener("pointercancel", () => {
            pointer = null;
            updateCurrentLayout();
        });
        runtime.addEventListener("pointerdown", handlePointerDown);
        runtime.addEventListener("keydown", event => {
            unlockAudio();
            if (runtime.layout.name !== LAYOUTS.game || changingLayout) return;
            if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
                setLane("left");
            } else if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
                setLane("right");
            }
        });
        runtime.addEventListener("tick", updateCurrentLayout);
    });
});
