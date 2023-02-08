(function() {
    const c = document.createElement("canvas")
    const ctx = c.getContext("2d")

    const socket = io({
        reconnection: false
    });
    
    const params = new Proxy(new URLSearchParams(window.location.search), {
        get: (searchParams, prop) => searchParams.get(prop),
    });

    var BACKGROUND_AUDIO = [];
    const SHOOT_SFX = new Audio('/effects/shoot.mp3')
    let audioIndex = 0;

    let error = ""

    const GAME_ARGS = {
        MOVEMENT_SPEED: 20 / 10
    }

    const BANNED_KEYS = ["Shift", "Meta", "Alt", "Control", "Tab", "CapsLock", "PageUp", "PageDown", "Home", "End", "Delete", "Dead"]

    let game = null;
    let canShoot = true;

    const MAX_CHAT_LENGTH = 10;

    let chat = [];
    let currentlyTyping = ""
    let chatFocused = false

    let lastPos = {
        x: 0,
        y: 0
    }

    let mousePos;

    let keysDown = [];

    let analytics = {
        ping: -1,
        fps: -1,
        ppsdown: -1,
        ppsup: -1,
        netup: -1,
        netdown: -1
    }

    let analysis = {
        frames: 0,
        ppsdown: 0,
        ppsup: 0,
        netup: 0,
        netdown: 0
    }

    function getCookie(cname) {
        let name = cname + "=";
        let decodedCookie = decodeURIComponent(document.cookie);
        let ca = decodedCookie.split(';');
        for (const element of ca) {
            let c = element;
            while (c.charAt(0) == ' ') {
                c = c.substring(1);
            }
            if (c.indexOf(name) == 0) {
                return c.substring(name.length, c.length);
            }
        }
        return "";
    }

    // socket.emit inject :d

    let _oldEmit = socket.emit

    socket.emit = function() {
        let args = Array.from(arguments); // ES5

        analysis.ppsup++;
        analysis.netup += JSON.stringify(args).length;
        
        _oldEmit.apply(socket, args);
    }

    // =====================

    socket.on("game", (msg) => {
        game = JSON.parse(JSON.stringify(msg))

        if (Object.keys(game.players).includes(socket.id)) {
            lastPos = JSON.parse(JSON.stringify(game.players[socket.id].position))
        }

        analysis.ppsdown++;
        analysis.netdown += JSON.stringify(msg).length
    })

    socket.on("chatmessage", (msg) => {
        chat.push(msg)

        if (chat.length > MAX_CHAT_LENGTH) {
            chat.shift()
        }

        analysis.ppsdown++;
        analysis.netdown += JSON.stringify(msg).length
    })

    socket.on("error", (msg) => {
        error = msg

        analysis.ppsdown++;
        analysis.netdown += JSON.stringify(msg).length
    })
    
    function tick() {
        if (game == null) {
            return;
        }

        if (!chatFocused && game.players[socket.id] != null) {
            const hasSpeedbuff = Object.keys(game.players[socket.id].buffs).includes("speed");

            if (keysDown.includes("w")) {
                lastPos.y += -GAME_ARGS.MOVEMENT_SPEED * (hasSpeedbuff? 2 : 1)
            }
    
            if (keysDown.includes("a")) {
                lastPos.x += -GAME_ARGS.MOVEMENT_SPEED * (hasSpeedbuff? 2 : 1)
            }
    
            if (keysDown.includes("s")) {
                lastPos.y += GAME_ARGS.MOVEMENT_SPEED * (hasSpeedbuff? 2 : 1)
            }
    
            if (keysDown.includes("d")) {
                lastPos.x += GAME_ARGS.MOVEMENT_SPEED * (hasSpeedbuff? 2 : 1)
            }
        }

        const players = Object.keys(game.players)
        for (const element of players) {
            const player = game.players[element];

            if (element == socket.id) continue;

            if (player == null) continue;

            if (player.movement.up) {
                player.position.y += -GAME_ARGS.MOVEMENT_SPEED * (Object.keys(player.buffs).includes("speed")? 2 : 1)
            }

            if (player.movement.right) {
                player.position.x += GAME_ARGS.MOVEMENT_SPEED * (Object.keys(player.buffs).includes("speed")? 2 : 1)
            }

            if (player.movement.down) {
                player.position.y += GAME_ARGS.MOVEMENT_SPEED * (Object.keys(player.buffs).includes("speed")? 2 : 1)
            }

            if (player.movement.left) {
                player.position.x += -GAME_ARGS.MOVEMENT_SPEED * (Object.keys(player.buffs).includes("speed")? 2 : 1)
            }
        }

        for (const element of game.bullets) {
            const bullet = element

            bullet.x += bullet.dx / 10
            bullet.y += bullet.dy / 10
        }
    }

    function frame() {
        analysis.frames++;

        if (game == null) {
            requestAnimationFrame(frame)
            return;
        }

        ctx.resetTransform()

        ctx.strokeStyle = "#FFFFFF"
        ctx.fillStyle = "#FFFFFF"
        ctx.textAlign = "center"
        ctx.font = "20px Comfortaa";

        ctx.clearRect(0, 0, c.width, c.height)

        const players = Object.keys(game.players)
        const playerID = players.indexOf(socket.id)
        const mainPlayer = game.players[players[playerID]] || {
            position: {
                x: lastPos.x,
                y: lastPos.y
            },
            fake: true
        }

        ctx.translate(c.width / 2 - lastPos.x, c.height / 2 - lastPos.y)

        const INTERVAL = 100

        ctx.strokeStyle = "#656d7d"
        for (let l = -2000; l < 2000; l++) {
            if (l % INTERVAL != 0) continue;

            ctx.beginPath()
            ctx.moveTo(-2000, l)
            ctx.lineTo(2000, l)
            ctx.stroke()
        }

        for (let l = -2000; l < 2000; l++) {
            if (l % INTERVAL != 0) continue;

            ctx.beginPath()
            ctx.moveTo(l, -2000)
            ctx.lineTo(l, 2000)
            ctx.stroke()
        }

        ctx.fillRect(-2, -2, 4, 4)

        ctx.strokeStyle = "#F08080"
        ctx.lineWidth = 5
        ctx.strokeRect(-2000, -2000, 4000, 4000) //Worldborder
        ctx.strokeStyle = "#FFFFFF"
        ctx.lineWidth = 1

        if (mainPlayer.fake) {
            // LOL DIED BIG l
            ctx.font = "64px Comfortaa";
            ctx.fillStyle = "#F08080"
            ctx.textAlign = "center"
            ctx.fillText("=== YOU DIED ===", c.width / 2, c.height / 2 - 35)
            ctx.fillText("Reload the page to play again", c.width / 2, c.height / 2 + 35)
        } else {
            ctx.beginPath()
            ctx.arc(lastPos.x, lastPos.y, 10, 0, 2 * Math.PI)
            ctx.fill()
    
            ctx.strokeRect(lastPos.x - 50, lastPos.y + 15, 100, 3.5)
            ctx.fillRect(lastPos.x - 50, lastPos.y + 15, mainPlayer.health, 3.5)

            if (mainPlayer.firecd > 0 && canShoot) {
                SHOOT_SFX.volume = 0.15
                SHOOT_SFX.currentTime = 0
                SHOOT_SFX.play()
                canShoot = false
            }
        }

        if (mainPlayer.firecd == 0) canShoot = true;

        ctx.fillStyle = "#FFFFFF"
        ctx.font = "20px Comfortaa";

        for (let p = 0; p < players.length; p++) {
            if (p == playerID) continue;

            const player = game.players[players[p]];

            ctx.beginPath()
            ctx.arc(player.position.x, player.position.y, 10, 0, 2 * Math.PI)
            ctx.fill()

            ctx.strokeRect(player.position.x - 50, player.position.y + 15, 100, 3.5)
            ctx.fillRect(player.position.x - 50, player.position.y + 15, player.health, 3.5)

            ctx.fillText(player.username, player.position.x, player.position.y - 25)
        }

        for (const element of game.bullets) {
            const bullet = element

            ctx.beginPath()
            ctx.arc(bullet.x, bullet.y, 5, 0, 2 * Math.PI)
            ctx.fill()
        }

        ctx.fillStyle = "#B9E5E1"

        for (const element of game.powerups) {
            const powerup = element

            ctx.beginPath()
            ctx.arc(powerup.position.x, powerup.position.y, 7, 0, 2 * Math.PI)
            ctx.fill()
        }

        ctx.fillStyle = "#FFFFFF"

        ctx.resetTransform()

        ctx.textAlign = "right"
        ctx.font = "15px Comfortaa";

        ctx.fillText(analytics.ping + " ms", c.width - 5, 20)
        ctx.fillText("FPS: " + analytics.fps, c.width - 5, 40)
        ctx.fillText("PPS: " + analytics.ppsup + " ↑ /" + analytics.ppsdown + " ↓", c.width - 5, 60)
        ctx.fillText("NET: " + analytics.netup + " kb/s ↑ / " + analytics.netdown + " kb/s ↓", c.width - 5, 80)

        ctx.textAlign = "left"

        if (chatFocused) {
            ctx.globalAlpha = 0.4
            ctx.fillStyle = "#000000"
            ctx.fillRect(0, c.height - (MAX_CHAT_LENGTH * 15) - 35, c.width, (MAX_CHAT_LENGTH * 15) + 35)
            ctx.globalAlpha = 1
        }

        ctx.fillStyle = "#FFFFFF"

        for (let chatIteration = 0; chatIteration < chat.length; chatIteration++) {
            ctx.fillText(chat[chatIteration], 10, c.height - 20 - ((chat.length - chatIteration) * 15))
        }

        ctx.fillText(currentlyTyping, 10, c.height - 15)

        if (error.length > 0) {
            ctx.font = "64px Comfortaa";
            ctx.fillStyle = "#F08080"
            ctx.textAlign = "center"
            ctx.fillText("===ERROR===", c.width / 2, c.height / 2 - 35)
            ctx.fillText(error, c.width / 2, c.height / 2 + 35)
        }

        if (mousePos != null) {
            ctx.beginPath()
            ctx.arc(mousePos.x, mousePos.y, 8, 0, 2 * Math.PI)
            ctx.stroke()

            ctx.beginPath()
            ctx.moveTo(mousePos.x + 10, mousePos.y + 10)
            ctx.lineTo(mousePos.x - 10, mousePos.y - 10)
            ctx.stroke()

            ctx.beginPath()
            ctx.moveTo(mousePos.x - 10, mousePos.y + 10)
            ctx.lineTo(mousePos.x + 10, mousePos.y - 10)
            ctx.stroke()
        }

        requestAnimationFrame(frame)
    }

    document.addEventListener("keydown", (e) => {
        if (keysDown.includes(e.key)) return;
        keysDown.push(e.key)

        if (chatFocused) {
            if (e.key == "Enter") {
                chatFocused = false;

                if (currentlyTyping.startsWith("/")) {
                    const COMMAND = currentlyTyping.substring(1).split(" ")[0]
                    const ARGS = currentlyTyping.substring(1).split(" ").slice(1)

                    switch (COMMAND) {
                        case 'say':
                            socket.emit("chatmessage", ARGS.join(" "))
                            break;
                        case 'skip':
                            BACKGROUND_AUDIO[audioIndex].currentTime = BACKGROUND_AUDIO[audioIndex].duration

                            if (/\d/gm.test(ARGS[0])) {
                                const songNum = parseInt(ARGS[0]);
                                if (songNum >= 0 && songNum < BACKGROUND_AUDIO.length) {
                                    audioIndex = songNum - 1
                                } else {
                                    chat.push("> [ERROR] Bad argument");
                                    break;
                                }
                            } else {
                                if (ARGS.length > 0) {
                                    chat.push("> [ERROR] Bad argument")
                                    break;
                                }
                            }

                            chat.push("> [INFO] Skipped.")
                            break;
                        default:
                            chat.push("> [ERROR] Unrecognized command.")
                            break;
                    }
                } else {
                    socket.emit("chatmessage", currentlyTyping)
                }

                currentlyTyping = ""
                return;
            }

            if (e.key == "Escape") {
                chatFocused = false;
                currentlyTyping = "";
                return;
            }

            if (BANNED_KEYS.includes(e.key)) return;
            if (e.key.startsWith("F") && e.key.length > 1) return;
            if (e.key.startsWith("Arrow")) return;

            if (e.key == "Backspace") {
                currentlyTyping = currentlyTyping.substring(0, currentlyTyping.length - 1)
                return;
            }

            currentlyTyping += e.key
            return;
        }

        switch (e.key) {
            case "w":
                socket.emit("move", {
                    direction: "up",
                    enable: "1"
                })
                break;
            case "d":
                socket.emit("move", {
                    direction: "right",
                    enable: "1"
                })
                break;
            case "s":
                socket.emit("move", {
                    direction: "down",
                    enable: "1"
                })
                break;
            case "a":
                socket.emit("move", {
                    direction: "left",
                    enable: "1"
                })
                break;
            case "t":
                chatFocused = true;
                break;
            default:
                //nothing
        }
    })

    document.addEventListener("keyup", (e) => {
        if (keysDown.includes(e.key)) {
            keysDown.splice(keysDown.indexOf(e.key), 1)
        }

        switch (e.key) {
            case "w":
                socket.emit("move", {
                    direction: "up",
                    enable: "0"
                })
                break;
            case "d":
                socket.emit("move", {
                    direction: "right",
                    enable: "0"
                })
                break;
            case "s":
                socket.emit("move", {
                    direction: "down",
                    enable: "0"
                })
                break;
            case "a":
                socket.emit("move", {
                    direction: "left",
                    enable: "0"
                })
                break;
            default:
                //nothing
        }
    })

    document.addEventListener("mousedown", (e) => {
        socket.emit("fire", "1")
    })

    document.addEventListener("mouseup", (e) => {
        socket.emit("fire", "0")
    })

    document.addEventListener("mousemove", (e) => {
        socket.emit("mousepos", {
            x: e.x - c.width / 2,
            y: e.y - c.height / 2
        })

        mousePos = {
            x: e.x,
            y: e.y
        }
    })

    window.addEventListener("resize", (e) => {
        c.width = document.body.clientWidth
        c.height = document.body.clientHeight
    })

    socket.emit("authentication", getCookie("token"))
    socket.emit("game", params.id)

    c.width = document.body.clientWidth
    c.height = document.body.clientHeight

    requestAnimationFrame(frame)
    setInterval(tick, 10)

    fetch("/api/bgmusiclist").then((res) => res.json()).then((res) => {
        for (var musicName in res) {
            BACKGROUND_AUDIO.push(new Audio('/game/' + musicName + ".mp3"))
        }

        for (let music = 0; music < BACKGROUND_AUDIO.length; music++) {
            BACKGROUND_AUDIO[music].volume = 0.2
            
            BACKGROUND_AUDIO[music].addEventListener("ended", () => {
                audioIndex++;
                if (audioIndex >= BACKGROUND_AUDIO.length) {
                    audioIndex = 0;
                }
    
                BACKGROUND_AUDIO[audioIndex].play()
            })
        }
    
        document.body.addEventListener("keydown", () => {
            BACKGROUND_AUDIO[audioIndex].play()
        })
    
        document.body.addEventListener("mousedown", () => {
            BACKGROUND_AUDIO[audioIndex].play()
        })
    })

    setInterval(() => {
        const start = Date.now();
      
        socket.emit("ping", () => {
            analytics.ping = Date.now() - start;
        });
        
        analysis.ppsdown++;
        analysis.netdown += 8 + (start.toString().length)
        analysis.ppsup++;
        analysis.netup += 8 + (start.toString().length)
    }, 5000);

    setInterval(() => {
        analytics.fps = analysis.frames
        analytics.ppsdown = analysis.ppsdown
        analytics.ppsup = analysis.ppsup
        analytics.netdown = (analysis.netdown / 1000).toFixed(2)
        analytics.netup = (analysis.netup / 1000).toFixed(2)
        
        analysis = {
            frames: 0,
            ppsdown: 0,
            ppsup: 0,
            netup: 0,
            netdown: 0
        }
    }, 1000)

    document.body.appendChild(c)
})()